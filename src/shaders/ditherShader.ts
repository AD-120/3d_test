import * as THREE from 'three';
import { DITHER_PALETTES, DitherMode, DitherPaletteId } from '../types/tour';

export interface SharedDitherUniforms {
  uDarkColor: { value: THREE.Vector3 };
  uLightColor: { value: THREE.Vector3 };
  uPixelSize: { value: number };
  uContrast: { value: number };
  uDitherMode: { value: number }; // 0 = bayer8, 1 = bayer4, 2 = hatch
  uTime: { value: number };
  uSunDir: { value: THREE.Vector3 };
  uSunElevation: { value: number };
}

export function createSharedDitherUniforms(
  paletteId: DitherPaletteId = 'paper',
  pixelSize = 2,
  contrast = 1.12,
  mode: DitherMode = 'bayer8',
): SharedDitherUniforms {
  const pal = DITHER_PALETTES[paletteId];
  return {
    uDarkColor: { value: new THREE.Vector3(...pal.darkRgb) },
    uLightColor: { value: new THREE.Vector3(...pal.lightRgb) },
    uPixelSize: { value: pixelSize },
    uContrast: { value: contrast },
    uDitherMode: { value: ditherModeToInt(mode) },
    uTime: { value: 0 },
    uSunDir: { value: new THREE.Vector3(0.5, 0.7, 0.5).normalize() },
    uSunElevation: { value: 38 },
  };
}

export function ditherModeToInt(mode: DitherMode): number {
  if (mode === 'bayer4') return 1;
  if (mode === 'hatch') return 2;
  return 0;
}

export const BAYER_GLSL = /* glsl */ `
float bayer2(vec2 a) {
  a = floor(a);
  return fract(a.x * 0.5 + a.y * a.y * 0.75);
}

float bayer4(vec2 a) {
  return bayer2(0.5 * a) * 0.25 + bayer2(a);
}

float bayer8(vec2 a) {
  return bayer4(0.5 * a) * 0.25 + bayer2(a);
}

float computeDitherThreshold(vec2 fragCoord, float pixelSize, int mode) {
  vec2 p = floor(fragCoord / max(pixelSize, 1.0));
  if (mode == 1) {
    return bayer4(mod(p, 4.0)) + (0.5 / 16.0);
  }
  if (mode == 2) {
    // Woodcut / engraving diagonal crosshatch + subtle Bayer micro-grain
    float diagA = abs(fract((p.x + p.y) * 0.16) - 0.5) * 2.0;
    float diagB = abs(fract((p.x - p.y) * 0.16) - 0.5) * 2.0;
    float micro = bayer4(mod(p, 4.0)) * 0.18;
    return clamp(mix(diagA, min(diagA, diagB), 0.45) * 0.86 + micro + 0.04, 0.01, 0.99);
  }
  return bayer8(mod(p, 8.0)) + (0.5 / 64.0);
}

vec3 quantize1Bit(float luma, vec2 fragCoord, float pixelSize, int mode, vec3 darkCol, vec3 lightCol) {
  float threshold = computeDitherThreshold(fragCoord, pixelSize, mode);
  float bit = step(threshold, clamp(luma, 0.0, 1.0));
  return mix(darkCol, lightCol, bit);
}
`;

export interface DitherMaterialOptions {
  color?: number;
  roughness?: number;
  metalness?: number;
  flatShading?: boolean;
  vertexColors?: boolean;
  side?: THREE.Side;
  lumaBias?: number;
  polygonOffset?: boolean;
  polygonOffsetFactor?: number;
  polygonOffsetUnits?: number;
}

export function createDitherStandardMaterial(
  shared: SharedDitherUniforms,
  opts: DitherMaterialOptions = {},
): THREE.MeshStandardMaterial {
  const mat = new THREE.MeshStandardMaterial({
    color: opts.color ?? 0xd8d5cc,
    roughness: opts.roughness ?? 0.86,
    metalness: opts.metalness ?? 0.04,
    flatShading: opts.flatShading ?? true,
    vertexColors: opts.vertexColors ?? false,
    side: opts.side ?? THREE.FrontSide,
    polygonOffset: opts.polygonOffset ?? false,
    polygonOffsetFactor: opts.polygonOffsetFactor ?? 0,
    polygonOffsetUnits: opts.polygonOffsetUnits ?? 0,
  });

  const lumaBias = opts.lumaBias ?? 0.0;

  mat.customProgramCacheKey = () => `dither-1bit-${lumaBias.toFixed(2)}`;

  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uDarkColor = shared.uDarkColor;
    shader.uniforms.uLightColor = shared.uLightColor;
    shader.uniforms.uPixelSize = shared.uPixelSize;
    shader.uniforms.uContrast = shared.uContrast;
    shader.uniforms.uDitherMode = shared.uDitherMode;
    shader.uniforms.uLumaBias = { value: lumaBias };

    shader.fragmentShader =
      `
      uniform vec3 uDarkColor;
      uniform vec3 uLightColor;
      uniform float uPixelSize;
      uniform float uContrast;
      uniform int uDitherMode;
      uniform float uLumaBias;
      ${BAYER_GLSL}
      ` + shader.fragmentShader;

    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <dithering_fragment>',
      `
      // Convert final lit + fogged sRGB radiance to 1-bit Bayer dither
      float rawLuma = dot(gl_FragColor.rgb, vec3(0.299, 0.587, 0.114));
      float adjustedLuma = clamp((rawLuma - 0.5) * uContrast + 0.5 + uLumaBias, 0.0, 1.0);
      gl_FragColor.rgb = quantize1Bit(
        adjustedLuma,
        gl_FragCoord.xy,
        uPixelSize,
        uDitherMode,
        uDarkColor,
        uLightColor
      );
      `,
    );
  };

  return mat;
}

export function createDitherSkyMaterial(shared: SharedDitherUniforms): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    uniforms: {
      uDarkColor: shared.uDarkColor,
      uLightColor: shared.uLightColor,
      uPixelSize: shared.uPixelSize,
      uContrast: shared.uContrast,
      uDitherMode: shared.uDitherMode,
      uTime: shared.uTime,
      uSunDir: shared.uSunDir,
      uSunElevation: shared.uSunElevation,
    },
    vertexShader: /* glsl */ `
      varying vec3 vWorldDir;
      void main() {
        vec4 worldPos = modelMatrix * vec4(position, 1.0);
        vWorldDir = position;
        gl_Position = projectionMatrix * viewMatrix * worldPos;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform vec3 uDarkColor;
      uniform vec3 uLightColor;
      uniform float uPixelSize;
      uniform float uContrast;
      uniform int uDitherMode;
      uniform float uTime;
      uniform vec3 uSunDir;
      uniform float uSunElevation;
      varying vec3 vWorldDir;

      ${BAYER_GLSL}

      float hash21(vec2 p) {
        p = fract(p * vec2(234.34, 435.345));
        p += dot(p, p + 34.23);
        return fract(p.x * p.y);
      }

      float noise2D(vec2 p) {
        vec2 i = floor(p);
        vec2 f = fract(p);
        vec2 u = f * f * (3.0 - 2.0 * f);
        return mix(
          mix(hash21(i), hash21(i + vec2(1.0, 0.0)), u.x),
          mix(hash21(i + vec2(0.0, 1.0)), hash21(i + vec2(1.0, 1.0)), u.x),
          u.y
        );
      }

      float fbm(vec2 p) {
        float v = 0.0;
        float a = 0.5;
        for (int i = 0; i < 3; i++) {
          v += a * noise2D(p);
          p *= 2.03;
          a *= 0.5;
        }
        return v;
      }

      void main() {
        vec3 dir = normalize(vWorldDir);
        float y = clamp(dir.y, -0.15, 1.0);

        // Day-to-dusk sky gradient curve based on sun elevation
        float dayFactor = smoothstep(-8.0, 28.0, uSunElevation);
        float horizonGlow = pow(1.0 - clamp(abs(y), 0.0, 1.0), 3.2);

        float zenithLuma = mix(0.06, 0.42, dayFactor);
        float horizonLuma = mix(0.24, 0.78, dayFactor);
        float skyLuma = mix(horizonLuma, zenithLuma, smoothstep(0.0, 0.72, max(y, 0.0)));
        skyLuma += horizonGlow * 0.14 * dayFactor;

        // Subtle drifting retro cloud bands
        if (y > 0.01) {
          vec2 cloudUv = dir.xz / (y + 0.18) * 1.35 + vec2(uTime * 0.012, uTime * 0.004);
          float c = fbm(cloudUv);
          float cloudMask = smoothstep(0.46, 0.78, c) * smoothstep(0.01, 0.18, y);
          skyLuma = mix(skyLuma, mix(0.35, 0.92, dayFactor), cloudMask * 0.52);
        }

        // Crisp sun disc & corona halo
        float sunDot = max(dot(dir, normalize(uSunDir)), 0.0);
        float sunDisc = smoothstep(0.9965, 0.9985, sunDot);
        float sunHalo = pow(sunDot, 22.0) * 0.42 + pow(sunDot, 5.0) * 0.12;
        skyLuma += sunHalo * smoothstep(-10.0, 15.0, uSunElevation);
        skyLuma = max(skyLuma, sunDisc * 1.15);

        // Crisp stars when sun drops toward twilight/night
        float nightFactor = 1.0 - smoothstep(-6.0, 16.0, uSunElevation);
        if (nightFactor > 0.02 && y > 0.04) {
          vec2 starGrid = floor(dir.xz / (dir.y + 0.35) * 65.0);
          float starVal = hash21(starGrid);
          float starBit = step(0.992, starVal) * nightFactor * smoothstep(0.04, 0.25, y);
          skyLuma = max(skyLuma, starBit * 1.1);
        }

        float finalLuma = clamp((skyLuma - 0.5) * (uContrast * 0.92) + 0.5, 0.0, 1.0);
        vec3 outCol = quantize1Bit(
          finalLuma,
          gl_FragCoord.xy,
          uPixelSize,
          uDitherMode,
          uDarkColor,
          uLightColor
        );
        gl_FragColor = vec4(outCol, 1.0);
      }
    `,
  });
}
