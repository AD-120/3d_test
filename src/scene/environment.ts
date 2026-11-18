import * as THREE from 'three';
import {
  createDitherSkyMaterial,
  createDitherStandardMaterial,
  SharedDitherUniforms,
} from '../shaders/ditherShader';
import { buildFacetedPolyhedronFromPlanes } from './monolith';
import { groundHeightAt } from './terrain';

export interface ObstacleCollider {
  x: number;
  z: number;
  radius: number;
}

export interface EnvironmentBuildResult {
  group: THREE.Group;
  colliders: ObstacleCollider[];
  beaconGroup: THREE.Group;
  beaconLight: THREE.PointLight;
  update: (elapsed: number, delta: number, beaconEnabled: boolean) => void;
  dispose: () => void;
}

export function buildOutdoorEnvironment(shared: SharedDitherUniforms): EnvironmentBuildResult {
  const group = new THREE.Group();
  const colliders: ObstacleCollider[] = [];
  const geometries: THREE.BufferGeometry[] = [];
  const materials: THREE.Material[] = [];

  // 1. Dithered Sky Dome
  const skyGeo = new THREE.SphereGeometry(140, 32, 24);
  geometries.push(skyGeo);
  const skyMat = createDitherSkyMaterial(shared);
  materials.push(skyMat);
  const skyMesh = new THREE.Mesh(skyGeo, skyMat);
  group.add(skyMesh);

  // 2. Standing Menhir Boulders around the sanctuary & outer slopes
  const boulderMat = createDitherStandardMaterial(shared, {
    color: 0xc9c4b7,
    roughness: 0.88,
    metalness: 0.03,
    flatShading: true,
    lumaBias: 0.0,
  });
  materials.push(boulderMat);

  const edgeMat = new THREE.ShaderMaterial({
    uniforms: { uDarkColor: shared.uDarkColor },
    vertexShader: `void main() { gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: `uniform vec3 uDarkColor; void main() { gl_FragColor = vec4(uDarkColor, 1.0); }`,
  });
  materials.push(edgeMat);

  const boulderSeeds = [
    { angle: 0.45, dist: 14.5, sx: 1.05, sy: 1.45, sz: 0.95 },
    { angle: 1.15, dist: 17.8, sx: 1.35, sy: 1.85, sz: 1.1 },
    { angle: 1.92, dist: 13.6, sx: 0.9, sy: 1.25, sz: 0.9 },
    { angle: 2.65, dist: 19.2, sx: 1.6, sy: 2.1, sz: 1.35 },
    { angle: 3.38, dist: 15.8, sx: 1.15, sy: 1.55, sz: 1.05 },
    { angle: 4.18, dist: 21.4, sx: 1.75, sy: 2.4, sz: 1.4 },
    { angle: 4.95, dist: 14.9, sx: 0.95, sy: 1.35, sz: 0.85 },
    { angle: 5.68, dist: 18.4, sx: 1.4, sy: 1.75, sz: 1.2 },
    // Outer ridge boulders
    { angle: 0.8, dist: 31.0, sx: 2.4, sy: 3.2, sz: 2.0 },
    { angle: 2.2, dist: 34.0, sx: 2.8, sy: 3.6, sz: 2.2 },
    { angle: 3.8, dist: 32.5, sx: 2.5, sy: 2.9, sz: 2.1 },
    { angle: 5.2, dist: 35.0, sx: 3.0, sy: 3.8, sz: 2.3 },
  ];

  boulderSeeds.forEach((b, idx) => {
    const planes = [
      { normal: new THREE.Vector3(0, -1, 0), dist: 1.0 },
      { normal: new THREE.Vector3(0.25 + 0.1 * Math.sin(idx), 0.92, 0.15), dist: 1.25 },
      { normal: new THREE.Vector3(-0.88, 0.35, 0.2), dist: 0.95 },
      { normal: new THREE.Vector3(0.86, 0.38, -0.18), dist: 0.98 },
      { normal: new THREE.Vector3(0.12, 0.22, 0.94), dist: 0.92 },
      { normal: new THREE.Vector3(-0.18, 0.28, -0.92), dist: 0.94 },
      { normal: new THREE.Vector3(0.55 * Math.cos(idx), -0.35, 0.72), dist: 0.98 },
    ];
    const geo = buildFacetedPolyhedronFromPlanes(planes, 3.2);
    geo.scale(b.sx, b.sy, b.sz);
    geometries.push(geo);

    const px = Math.cos(b.angle) * b.dist;
    const pz = Math.sin(b.angle) * b.dist;
    const py = groundHeightAt(px, pz) - 0.12;

    const mesh = new THREE.Mesh(geo, boulderMat);
    mesh.position.set(px, py, pz);
    mesh.rotation.y = idx * 1.15;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);

    const edges = new THREE.EdgesGeometry(geo, 12);
    geometries.push(edges);
    const lines = new THREE.LineSegments(edges, edgeMat);
    lines.position.copy(mesh.position);
    lines.rotation.copy(mesh.rotation);
    lines.scale.setScalar(1.002);
    group.add(lines);

    if (b.dist < 28) {
      colliders.push({
        x: px,
        z: pz,
        radius: Math.max(b.sx, b.sz) * 0.95 + 0.35,
      });
    }
  });

  // 3. Instanced Wind-Bent Low-Poly Pines / Cypresses in outer groves
  const treeCount = 46;
  const trunkGeo = new THREE.CylinderGeometry(0.12, 0.22, 1.8, 5);
  trunkGeo.translate(0, 0.9, 0);
  geometries.push(trunkGeo);

  const lowerCrownGeo = new THREE.ConeGeometry(1.15, 2.8, 6);
  lowerCrownGeo.translate(0, 2.75, 0);
  geometries.push(lowerCrownGeo);

  const upperCrownGeo = new THREE.ConeGeometry(0.78, 2.2, 6);
  upperCrownGeo.translate(0, 4.15, 0);
  geometries.push(upperCrownGeo);

  const trunkMat = createDitherStandardMaterial(shared, {
    color: 0x5c5549,
    roughness: 0.96,
    metalness: 0.0,
    flatShading: true,
    lumaBias: -0.06,
  });
  const foliageMat = createDitherStandardMaterial(shared, {
    color: 0xffffff,
    roughness: 0.85,
    metalness: 0.02,
    flatShading: true,
    lumaBias: -0.03,
  });
  materials.push(trunkMat, foliageMat);

  const trunks = new THREE.InstancedMesh(trunkGeo, trunkMat, treeCount);
  const lowerCrowns = new THREE.InstancedMesh(lowerCrownGeo, foliageMat, treeCount);
  const upperCrowns = new THREE.InstancedMesh(upperCrownGeo, foliageMat, treeCount);
  trunks.castShadow = true;
  lowerCrowns.castShadow = true;
  lowerCrowns.receiveShadow = true;
  upperCrowns.castShadow = true;
  upperCrowns.receiveShadow = true;

  const dummy = new THREE.Object3D();
  const tint = new THREE.Color();

  for (let i = 0; i < treeCount; i++) {
    // Cluster trees organically beyond r = 17m..37m
    const clusterAngle = ((i * 2.39996) % (Math.PI * 2)) + Math.sin(i * 1.7) * 0.18;
    const dist = 17.5 + ((i * 7.31) % 21.5);
    const tx = Math.cos(clusterAngle) * dist;
    const tz = Math.sin(clusterAngle) * dist;
    const ty = groundHeightAt(tx, tz) - 0.08;

    const s = 0.85 + ((i * 0.37) % 0.45); // ±15-20% scale variation
    dummy.position.set(tx, ty, tz);
    dummy.rotation.set(
      Math.sin(i * 2.1) * 0.04,
      i * 1.4,
      Math.cos(i * 1.3) * 0.05,
    );
    dummy.scale.set(s, s * (0.92 + (i % 3) * 0.12), s);
    dummy.updateMatrix();

    trunks.setMatrixAt(i, dummy.matrix);
    lowerCrowns.setMatrixAt(i, dummy.matrix);
    upperCrowns.setMatrixAt(i, dummy.matrix);

    const shade = 0.62 + ((i * 0.19) % 0.24);
    tint.setRGB(shade * 0.96, shade, shade * 0.92);
    lowerCrowns.setColorAt(i, tint);
    tint.multiplyScalar(1.08);
    upperCrowns.setColorAt(i, tint);

    if (dist < 28) {
      colliders.push({ x: tx, z: tz, radius: 0.72 * s });
    }
  }

  trunks.instanceMatrix.needsUpdate = true;
  lowerCrowns.instanceMatrix.needsUpdate = true;
  upperCrowns.instanceMatrix.needsUpdate = true;
  if (lowerCrowns.instanceColor) lowerCrowns.instanceColor.needsUpdate = true;
  if (upperCrowns.instanceColor) upperCrowns.instanceColor.needsUpdate = true;
  trunks.computeBoundingSphere();
  lowerCrowns.computeBoundingSphere();
  upperCrowns.computeBoundingSphere();

  group.add(trunks, lowerCrowns, upperCrowns);

  // 4. Orbiting Dynamic Light Beacon (Octahedron + Ring + PointLight)
  const beaconGroup = new THREE.Group();
  const beaconCoreGeo = new THREE.OctahedronGeometry(0.24, 0);
  const beaconRingGeo = new THREE.TorusGeometry(0.42, 0.03, 5, 10);
  geometries.push(beaconCoreGeo, beaconRingGeo);

  const beaconCoreMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
  const beaconRingMat = createDitherStandardMaterial(shared, {
    color: 0xeae5d7,
    roughness: 0.35,
    metalness: 0.65,
    flatShading: true,
    lumaBias: 0.18,
  });
  materials.push(beaconCoreMat, beaconRingMat);

  const beaconCore = new THREE.Mesh(beaconCoreGeo, beaconCoreMat);
  const beaconRing = new THREE.Mesh(beaconRingGeo, beaconRingMat);
  beaconRing.rotation.x = Math.PI / 3;
  beaconGroup.add(beaconCore, beaconRing);

  const beaconLight = new THREE.PointLight(0xfff5de, 18.0, 20.0, 1.65);
  beaconLight.castShadow = false; // Sun directional light handles crisp primary shadows
  beaconGroup.add(beaconLight);
  group.add(beaconGroup);

  // 5. Drifting Atmospheric Wind Motes
  const moteCount = 140;
  const motePositions = new Float32Array(moteCount * 3);
  const moteBase = new Float32Array(moteCount * 3);
  for (let i = 0; i < moteCount; i++) {
    const a = (i / moteCount) * Math.PI * 2 + i * 0.37;
    const rad = 2.5 + ((i * 5.71) % 24.0);
    const mx = Math.cos(a) * rad;
    const mz = Math.sin(a) * rad;
    const my = groundHeightAt(mx, mz) + 0.6 + ((i * 1.93) % 5.5);
    moteBase[i * 3] = mx;
    moteBase[i * 3 + 1] = my;
    moteBase[i * 3 + 2] = mz;
    motePositions[i * 3] = mx;
    motePositions[i * 3 + 1] = my;
    motePositions[i * 3 + 2] = mz;
  }

  const moteGeo = new THREE.BufferGeometry();
  moteGeo.setAttribute('position', new THREE.BufferAttribute(motePositions, 3));
  geometries.push(moteGeo);

  const moteMat = new THREE.ShaderMaterial({
    uniforms: {
      uLightColor: shared.uLightColor,
    },
    vertexShader: /* glsl */ `
      void main() {
        vec4 mvPos = modelViewMatrix * vec4(position, 1.0);
        gl_PointSize = clamp(16.0 / max(-mvPos.z, 1.0), 1.5, 4.0);
        gl_Position = projectionMatrix * mvPos;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform vec3 uLightColor;
      void main() {
        gl_FragColor = vec4(uLightColor, 1.0);
      }
    `,
  });
  materials.push(moteMat);

  const motes = new THREE.Points(moteGeo, moteMat);
  group.add(motes);

  let beaconAngle = 0.6;

  return {
    group,
    colliders,
    beaconGroup,
    beaconLight,
    update: (elapsed: number, delta: number, beaconEnabled: boolean) => {
      beaconGroup.visible = beaconEnabled;
      beaconLight.intensity = beaconEnabled ? 18.0 + Math.sin(elapsed * 2.4) * 2.5 : 0;

      if (beaconEnabled) {
        beaconAngle += delta * 0.42;
        const orbitR = 5.4;
        const bx = Math.cos(beaconAngle) * orbitR;
        const bz = Math.sin(beaconAngle) * orbitR;
        const by = groundHeightAt(bx, bz) + 2.45 + Math.sin(elapsed * 1.4) * 0.45;
        beaconGroup.position.set(bx, by, bz);
        beaconCore.rotation.y = elapsed * 1.2;
        beaconCore.rotation.x = elapsed * 0.7;
        beaconRing.rotation.z = elapsed * 0.9;
      }

      const posAttr = moteGeo.attributes.position as THREE.BufferAttribute;
      for (let i = 0; i < moteCount; i++) {
        const bx = moteBase[i * 3];
        const by = moteBase[i * 3 + 1];
        const bz = moteBase[i * 3 + 2];
        posAttr.setXYZ(
          i,
          bx + Math.sin(elapsed * 0.35 + i) * 0.6,
          by + Math.sin(elapsed * 0.55 + i * 1.3) * 0.32,
          bz + Math.cos(elapsed * 0.32 + i * 0.7) * 0.6,
        );
      }
      posAttr.needsUpdate = true;
    },
    dispose: () => {
      geometries.forEach((g) => g.dispose());
      materials.forEach((m) => m.dispose());
    },
  };
}
