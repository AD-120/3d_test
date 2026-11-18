import React, { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { TourSoundscape } from '../audio/soundscape';
import { buildOutdoorEnvironment } from '../scene/environment';
import { buildHeroMonolith } from '../scene/monolith';
import { buildTerrain, groundHeightAt } from '../scene/terrain';
import {
  createSharedDitherUniforms,
  ditherModeToInt,
} from '../shaders/ditherShader';
import {
  DITHER_PALETTES,
  TouchMoveVector,
  TourSettings,
  TourTelemetry,
} from '../types/tour';

export interface TourControllerApi {
  resetView: () => void;
  togglePointerLock: () => void;
  setTargetFov: (fov: number) => void;
}

interface MonolithTourCanvasProps {
  settings: TourSettings;
  touchMoveRef: React.MutableRefObject<TouchMoveVector>;
  onTelemetry: (telemetry: TourTelemetry) => void;
  apiRef: React.MutableRefObject<TourControllerApi | null>;
}

// Reusable scratch math objects outside the animation loop (zero per-frame GC)
const _forward = new THREE.Vector3();
const _right = new THREE.Vector3();
const _moveDir = new THREE.Vector3();
const _lookTarget = new THREE.Vector3();
const _euler = new THREE.Euler(0, 0, 0, 'YXZ');

export const MonolithTourCanvas: React.FC<MonolithTourCanvasProps> = ({
  settings,
  touchMoveRef,
  onTelemetry,
  apiRef,
}) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const settingsRef = useRef<TourSettings>(settings);
  const telemetryCbRef = useRef(onTelemetry);

  useEffect(() => {
    settingsRef.current = settings;
  }, [settings]);

  useEffect(() => {
    telemetryCbRef.current = onTelemetry;
  }, [onTelemetry]);

  useEffect(() => {
    const mountEl = containerRef.current;
    if (!mountEl) return;

    // Detect software WebGL (SwiftShader, llvmpipe, etc.)
    const isSoftwareGl = (() => {
      try {
        const probe = document.createElement('canvas');
        const gl = probe.getContext('webgl2') || probe.getContext('webgl');
        if (!gl) return true;
        const ext = gl.getExtension('WEBGL_debug_renderer_info');
        const param = ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER;
        const gpu = String(gl.getParameter(param) || '');
        gl.getExtension('WEBGL_lose_context')?.loseContext();
        return /SwiftShader|llvmpipe|softpipe|Software|Basic Render/i.test(gpu);
      } catch {
        return true;
      }
    })();

    const prefersReducedMotion = window.matchMedia(
      '(prefers-reduced-motion: reduce)',
    ).matches;

    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({
        antialias: false, // Crisp 1-bit dither & ink edges without gray subpixel blur
        powerPreference: 'high-performance',
      });
    } catch {
      telemetryCbRef.current({
        fov: 88,
        distanceToMonolith: 9.2,
        headingDeg: 0,
        sunAzimuthDeg: 42,
        isPointerLocked: false,
        webglError: 'WebGL is not available in this browser.',
      });
      return;
    }

    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.05;
    renderer.setPixelRatio(
      isSoftwareGl ? 1 : Math.min(window.devicePixelRatio || 1, 2),
    );
    renderer.setSize(mountEl.clientWidth || window.innerWidth, mountEl.clientHeight || window.innerHeight);
    renderer.shadowMap.enabled = !isSoftwareGl;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    const canvas = renderer.domElement;
    canvas.style.display = 'block';
    canvas.style.width = '100%';
    canvas.style.height = '100%';
    canvas.style.touchAction = 'none';
    mountEl.appendChild(canvas);

    const scene = new THREE.Scene();
    const fog = new THREE.FogExp2(0x9b978d, 0.0175);
    scene.fog = fog;

    // Studio procedural environment reflections for PBR depth
    const pmremGenerator = new THREE.PMREMGenerator(renderer);
    const roomEnv = new RoomEnvironment();
    const envTarget = pmremGenerator.fromScene(roomEnv, 0.04);
    scene.environment = envTarget.texture;
    scene.environmentIntensity = 0.42;
    roomEnv.dispose();
    pmremGenerator.dispose();

    const width = mountEl.clientWidth || window.innerWidth;
    const height = mountEl.clientHeight || window.innerHeight;
    const camera = new THREE.PerspectiveCamera(88, width / height, 0.12, 220);

    // Shared 1-bit shader uniforms
    const initSettings = settingsRef.current;
    const sharedUniforms = createSharedDitherUniforms(
      initSettings.palette,
      initSettings.pixelSize,
      initSettings.contrast,
      initSettings.ditherMode,
    );

    // Build terrain, hero monolith, and outdoor environment
    const terrain = buildTerrain(sharedUniforms);
    scene.add(terrain.group);

    const monolith = buildHeroMonolith(sharedUniforms);
    scene.add(monolith.group);

    const environment = buildOutdoorEnvironment(sharedUniforms);
    scene.add(environment.group);

    // 3-Point Outdoor Dynamic Lighting Rig
    const hemiLight = new THREE.HemisphereLight(0xdce6f5, 0x4b4840, 0.78);
    scene.add(hemiLight);

    const sunLight = new THREE.DirectionalLight(0xfff1d6, 2.35);
    sunLight.castShadow = !isSoftwareGl;
    sunLight.shadow.mapSize.width = 2048;
    sunLight.shadow.mapSize.height = 2048;
    sunLight.shadow.camera.near = 1;
    sunLight.shadow.camera.far = 75;
    const d = 18;
    sunLight.shadow.camera.left = -d;
    sunLight.shadow.camera.right = d;
    sunLight.shadow.camera.top = d;
    sunLight.shadow.camera.bottom = -d;
    sunLight.shadow.bias = -0.0005;
    sunLight.shadow.normalBias = 0.024;
    sunLight.target.position.set(0, 1.5, 0);
    scene.add(sunLight, sunLight.target);

    const rimLight = new THREE.DirectionalLight(0xc9dcf8, 0.65);
    rimLight.position.set(-14, 10, -16);
    scene.add(rimLight);

    // Player handheld lantern SpotLight
    const lantern = new THREE.SpotLight(0xffe9c2, 0, 22, Math.PI / 4.2, 0.55, 1.35);
    lantern.castShadow = false;
    scene.add(lantern, lantern.target);

    // Pre-compile shaders on hardware GPUs
    if (!isSoftwareGl) {
      renderer.compile(scene, camera);
    }

    // Soundscape
    const soundscape = new TourSoundscape();

    // Player FPV state
    const EYE_HEIGHT = 1.72;
    const PLAYER_RADIUS = 0.55;
    const ARENA_BOUND = 40.0;

    const playerPos = new THREE.Vector3(0, groundHeightAt(0, 9.2) + EYE_HEIGHT, 9.2);
    const velocity = new THREE.Vector3();
    let yaw = 0; // 0 looks along -Z toward monolith
    let pitch = 0.04;
    let targetYaw = 0;
    let targetPitch = 0.04;
    let targetFov = 88;
    let currentFov = 88;
    let sunAzimuthRad = THREE.MathUtils.degToRad(42);
    let bobPhase = 0;
    let lastTelemetryTime = 0;
    let contextLost = false;

    const colliders = [
      { x: 0, z: 0, radius: monolith.collisionRadius },
      ...environment.colliders,
    ];

    const resetView = () => {
      playerPos.set(0, groundHeightAt(0, 9.2) + EYE_HEIGHT, 9.2);
      velocity.set(0, 0, 0);
      targetYaw = 0;
      targetPitch = 0.04;
      targetFov = 88;
    };

    const togglePointerLock = () => {
      try {
        if (document.pointerLockElement === canvas) {
          document.exitPointerLock();
        } else if (canvas.requestPointerLock) {
          const maybePromise = canvas.requestPointerLock() as unknown as Promise<void> | undefined;
          if (maybePromise && typeof maybePromise.catch === 'function') {
            maybePromise.catch(() => {
              // Ignore sandbox pointer-lock denial; drag-to-look remains active
            });
          }
        }
      } catch {
        // Drag-to-look fallback always works
      }
    };

    apiRef.current = {
      resetView,
      togglePointerLock,
      setTargetFov: (fov: number) => {
        targetFov = THREE.MathUtils.clamp(fov, 26, 88);
      },
    };

    // Input state
    const keys: Record<string, boolean> = {};
    let isDragging = false;
    let lastPointerX = 0;
    let lastPointerY = 0;
    let activeTouchCount = 0;
    let prevTouchX = 0;
    let prevTouchY = 0;
    let prevPinchDist = 0;

    const onKeyDown = (e: KeyboardEvent) => {
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement
      ) {
        return;
      }
      keys[e.code] = true;
      if (e.code === 'KeyR') resetView();
      if (e.code === 'KeyL') togglePointerLock();
    };

    const onKeyUp = (e: KeyboardEvent) => {
      keys[e.code] = false;
    };

    const onMouseDown = (e: MouseEvent) => {
      if (e.button !== 0) return;
      isDragging = true;
      lastPointerX = e.clientX;
      lastPointerY = e.clientY;
    };

    const onMouseMove = (e: MouseEvent) => {
      if (document.pointerLockElement === canvas) {
        targetYaw -= e.movementX * 0.0024;
        targetPitch = THREE.MathUtils.clamp(
          targetPitch - e.movementY * 0.0022,
          -1.22,
          1.22,
        );
        return;
      }
      if (!isDragging) return;
      const dx = e.clientX - lastPointerX;
      const dy = e.clientY - lastPointerY;
      lastPointerX = e.clientX;
      lastPointerY = e.clientY;
      targetYaw -= dx * 0.0042;
      targetPitch = THREE.MathUtils.clamp(targetPitch - dy * 0.0038, -1.22, 1.22);
    };

    const onMouseUp = () => {
      isDragging = false;
    };

    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      targetFov = THREE.MathUtils.clamp(targetFov + e.deltaY * 0.032, 26, 88);
    };

    const getTouchDistance = (t0: Touch, t1: Touch) =>
      Math.hypot(t0.clientX - t1.clientX, t0.clientY - t1.clientY);

    const onTouchStart = (e: TouchEvent) => {
      if (e.target !== canvas) return;
      e.preventDefault();
      activeTouchCount = e.touches.length;
      if (e.touches.length === 1) {
        prevTouchX = e.touches[0].clientX;
        prevTouchY = e.touches[0].clientY;
      } else if (e.touches.length >= 2) {
        prevPinchDist = getTouchDistance(e.touches[0], e.touches[1]);
      }
    };

    const onTouchMove = (e: TouchEvent) => {
      if (e.target !== canvas) return;
      e.preventDefault();
      if (e.touches.length === 1 && activeTouchCount === 1) {
        const tx = e.touches[0].clientX;
        const ty = e.touches[0].clientY;
        const dx = tx - prevTouchX;
        const dy = ty - prevTouchY;
        prevTouchX = tx;
        prevTouchY = ty;
        targetYaw -= dx * 0.0052;
        targetPitch = THREE.MathUtils.clamp(targetPitch - dy * 0.0046, -1.22, 1.22);
      } else if (e.touches.length >= 2) {
        const dist = getTouchDistance(e.touches[0], e.touches[1]);
        if (prevPinchDist > 0) {
          const deltaPinch = prevPinchDist - dist;
          targetFov = THREE.MathUtils.clamp(targetFov + deltaPinch * 0.14, 26, 88);
        }
        prevPinchDist = dist;
      }
      activeTouchCount = e.touches.length;
    };

    const onTouchEnd = (e: TouchEvent) => {
      activeTouchCount = e.touches.length;
      if (e.touches.length === 1) {
        prevTouchX = e.touches[0].clientX;
        prevTouchY = e.touches[0].clientY;
      } else {
        prevPinchDist = 0;
      }
    };

    const onResize = () => {
      const w = mountEl.clientWidth || window.innerWidth;
      const h = mountEl.clientHeight || window.innerHeight;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    };

    const onContextLost = (e: Event) => {
      e.preventDefault();
      contextLost = true;
    };
    const onContextRestored = () => {
      contextLost = false;
    };

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('mouseup', onMouseUp);
    window.addEventListener('resize', onResize);
    canvas.addEventListener('mousedown', onMouseDown);
    window.addEventListener('mousemove', onMouseMove);
    canvas.addEventListener('wheel', onWheel, { passive: false });
    canvas.addEventListener('touchstart', onTouchStart, { passive: false });
    canvas.addEventListener('touchmove', onTouchMove, { passive: false });
    canvas.addEventListener('touchend', onTouchEnd);
    canvas.addEventListener('webglcontextlost', onContextLost);
    canvas.addEventListener('webglcontextrestored', onContextRestored);

    // Software WebGL frame pacing helper (from Three.js skill)
    let frameId = 0;
    let disposed = false;

    function afterDraw(cb: () => void) {
      if (disposed) return;
      const gl = renderer.getContext() as WebGL2RenderingContext;
      if (!gl || typeof gl.fenceSync !== 'function') {
        frameId = window.setTimeout(cb, 80);
        return;
      }
      const sync = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
      gl.flush();
      const poll = () => {
        if (disposed) return;
        const state = sync && gl.getSyncParameter(sync, gl.SYNC_STATUS);
        if (state === gl.UNSIGNALED) {
          frameId = window.setTimeout(poll, 5);
        } else {
          if (sync) gl.deleteSync(sync);
          frameId = window.setTimeout(cb, 80);
        }
      };
      frameId = window.setTimeout(poll, 5);
    }

    const clock = new THREE.Clock();

    function tick() {
      if (disposed) return;

      const rawDelta = clock.getDelta();
      const delta = Math.min(rawDelta, 0.08);
      const elapsed = clock.getElapsedTime();
      const cur = settingsRef.current;

      // Sync shared dither uniforms
      const pal = DITHER_PALETTES[cur.palette];
      sharedUniforms.uDarkColor.value.set(pal.darkRgb[0], pal.darkRgb[1], pal.darkRgb[2]);
      sharedUniforms.uLightColor.value.set(pal.lightRgb[0], pal.lightRgb[1], pal.lightRgb[2]);
      sharedUniforms.uPixelSize.value = cur.pixelSize;
      sharedUniforms.uContrast.value = cur.contrast;
      sharedUniforms.uDitherMode.value = ditherModeToInt(cur.ditherMode);
      sharedUniforms.uTime.value = elapsed;

      // Dynamic sun lighting
      if (cur.sunAutoOrbit) {
        sunAzimuthRad += delta * 0.14;
      }
      const elevRad = THREE.MathUtils.degToRad(cur.sunElevationDeg);
      const cosElev = Math.cos(elevRad);
      const sx = Math.cos(sunAzimuthRad) * cosElev;
      const sy = Math.sin(elevRad);
      const sz = Math.sin(sunAzimuthRad) * cosElev;

      sharedUniforms.uSunDir.value.set(sx, sy, sz).normalize();
      sharedUniforms.uSunElevation.value = cur.sunElevationDeg;

      sunLight.position.set(sx * 32, Math.max(sy * 32, -4), sz * 32);
      const sunStrength = THREE.MathUtils.smoothstep(cur.sunElevationDeg, -8, 22);
      sunLight.intensity = 0.25 + sunStrength * 2.25;
      hemiLight.intensity = 0.34 + sunStrength * 0.52;
      rimLight.position.set(-sx * 22, 12, -sz * 22);

      // Sync fog brightness so distance fades seamlessly into sky horizon
      const fogGray = 0.24 + sunStrength * 0.48;
      fog.color.setRGB(fogGray, fogGray * 0.99, fogGray * 0.97);

      // Smooth camera look damping
      const lookLambda = isSoftwareGl ? 24 : 16;
      yaw = THREE.MathUtils.damp(yaw, targetYaw, lookLambda, delta);
      pitch = THREE.MathUtils.damp(pitch, targetPitch, lookLambda, delta);
      currentFov = THREE.MathUtils.damp(currentFov, targetFov, 10, delta);

      if (Math.abs(camera.fov - currentFov) > 0.02) {
        camera.fov = currentFov;
        camera.updateProjectionMatrix();
      }

      // Compute horizontal movement axes from yaw
      _forward.set(-Math.sin(yaw), 0, -Math.cos(yaw)).normalize();
      _right.set(Math.cos(yaw), 0, -Math.sin(yaw)).normalize();
      _moveDir.set(0, 0, 0);

      const moveForward =
        (keys['KeyW'] || keys['ArrowUp'] ? 1 : 0) -
        (keys['KeyS'] || keys['ArrowDown'] ? 1 : 0) +
        touchMoveRef.current.y;
      const moveStrafe =
        (keys['KeyD'] || keys['ArrowRight'] ? 1 : 0) -
        (keys['KeyA'] || keys['ArrowLeft'] ? 1 : 0) +
        touchMoveRef.current.x;

      if (Math.abs(moveForward) > 0.01) {
        _moveDir.addScaledVector(_forward, moveForward);
      }
      if (Math.abs(moveStrafe) > 0.01) {
        _moveDir.addScaledVector(_right, moveStrafe);
      }
      if (_moveDir.lengthSq() > 1.0) {
        _moveDir.normalize();
      }

      const sprint = keys['ShiftLeft'] || keys['ShiftRight'] ? 1.55 : 1.0;
      const walkSpeed = 5.4 * sprint;
      const targetVx = _moveDir.x * walkSpeed;
      const targetVz = _moveDir.z * walkSpeed;

      velocity.x = THREE.MathUtils.damp(velocity.x, targetVx, 10, delta);
      velocity.z = THREE.MathUtils.damp(velocity.z, targetVz, 10, delta);

      playerPos.x += velocity.x * delta;
      playerPos.z += velocity.z * delta;

      // Resolve circular sliding collision against monolith and perimeter boulders
      for (let i = 0; i < colliders.length; i++) {
        const col = colliders[i];
        const dx = playerPos.x - col.x;
        const dz = playerPos.z - col.z;
        const minDist = col.radius + PLAYER_RADIUS;
        const distSq = dx * dx + dz * dz;
        if (distSq < minDist * minDist) {
          const dist = Math.sqrt(distSq) || 0.001;
          playerPos.x = col.x + (dx / dist) * minDist;
          playerPos.z = col.z + (dz / dist) * minDist;
        }
      }

      // Soft outer highland boundary
      const radialDist = Math.hypot(playerPos.x, playerPos.z);
      if (radialDist > ARENA_BOUND) {
        playerPos.x = (playerPos.x / radialDist) * ARENA_BOUND;
        playerPos.z = (playerPos.z / radialDist) * ARENA_BOUND;
      }

      const horizontalSpeed = Math.hypot(velocity.x, velocity.z);
      const groundY = groundHeightAt(playerPos.x, playerPos.z);

      let bobOffset = 0;
      if (!prefersReducedMotion && horizontalSpeed > 0.25) {
        bobPhase += delta * (4.8 + horizontalSpeed * 0.9);
        bobOffset = Math.sin(bobPhase) * Math.min(horizontalSpeed / 5.4, 1.0) * 0.042;
      }
      const targetY = groundY + EYE_HEIGHT + bobOffset;
      playerPos.y = THREE.MathUtils.damp(playerPos.y, targetY, 16, delta);

      camera.position.copy(playerPos);
      _euler.set(pitch, yaw, 0, 'YXZ');
      camera.quaternion.setFromEuler(_euler);

      // Handheld Lantern attached to explorer
      lantern.intensity = cur.lanternEnabled ? 34.0 : 0;
      if (cur.lanternEnabled) {
        lantern.position.copy(playerPos);
        _lookTarget.set(0, 0, -1).applyQuaternion(camera.quaternion).multiplyScalar(10).add(playerPos);
        lantern.target.position.copy(_lookTarget);
      }

      // Update environment (beacon & motes)
      environment.update(elapsed, delta, cur.beaconEnabled);

      // Soundscape update
      soundscape.setEnabled(cur.soundEnabled);
      const distToMonolith = Math.hypot(playerPos.x, playerPos.z);
      soundscape.update(delta, horizontalSpeed, distToMonolith, elapsed);

      if (!contextLost) {
        renderer.render(scene, camera);
      }

      // Throttle React HUD telemetry updates (~8Hz)
      if (elapsed - lastTelemetryTime > 0.12) {
        lastTelemetryTime = elapsed;
        const headingDeg =
          ((THREE.MathUtils.radToDeg(-yaw) % 360) + 360) % 360;
        const sunAzDeg =
          ((THREE.MathUtils.radToDeg(sunAzimuthRad) % 360) + 360) % 360;
        telemetryCbRef.current({
          fov: Math.round(currentFov),
          distanceToMonolith: Number(distToMonolith.toFixed(1)),
          headingDeg: Math.round(headingDeg),
          sunAzimuthDeg: Math.round(sunAzDeg),
          isPointerLocked: document.pointerLockElement === canvas,
          webglError: null,
        });
      }

      if (isSoftwareGl) {
        afterDraw(tick);
      } else {
        frameId = requestAnimationFrame(tick);
      }
    }

    tick();

    return () => {
      disposed = true;
      cancelAnimationFrame(frameId);
      clearTimeout(frameId);

      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('mouseup', onMouseUp);
      window.removeEventListener('resize', onResize);
      canvas.removeEventListener('mousedown', onMouseDown);
      window.removeEventListener('mousemove', onMouseMove);
      canvas.removeEventListener('wheel', onWheel);
      canvas.removeEventListener('touchstart', onTouchStart);
      canvas.removeEventListener('touchmove', onTouchMove);
      canvas.removeEventListener('touchend', onTouchEnd);
      canvas.removeEventListener('webglcontextlost', onContextLost);
      canvas.removeEventListener('webglcontextrestored', onContextRestored);

      if (document.pointerLockElement === canvas) {
        try {
          document.exitPointerLock();
        } catch {
          // ignore
        }
      }

      soundscape.dispose();
      terrain.dispose();
      monolith.dispose();
      environment.dispose();
      envTarget.dispose();
      renderer.dispose();

      if (canvas.parentElement === mountEl) {
        mountEl.removeChild(canvas);
      }
    };
  }, [apiRef, touchMoveRef]);

  return (
    <div
      ref={containerRef}
      className="fixed inset-0 w-full h-full cursor-grab active:cursor-grabbing select-none"
      aria-label="Interactive 3D view of the monolith"
    />
  );
};
