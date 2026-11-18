import * as THREE from 'three';
import { createDitherStandardMaterial, SharedDitherUniforms } from '../shaders/ditherShader';

/**
 * Deterministic heightfield for the outdoor sanctuary.
 * Central clearing (r < 11m) is a gentle plateau; outer rings rise into
 * undulating hills and distant perimeter crags.
 */
export function groundHeightAt(x: number, z: number): number {
  const r = Math.hypot(x, z);

  // Subtle micro-undulation across the plateau
  const micro =
    Math.sin(x * 0.24 + 0.5) * Math.cos(z * 0.22 - 0.3) * 0.08 +
    Math.sin(x * 0.65 - z * 0.52) * 0.03;

  // Flat central sanctuary plateau around the monolith
  const plateauBlend = THREE.MathUtils.smoothstep(r, 9.5, 19.0);

  // Rolling moorland hills
  const hills =
    (Math.sin(x * 0.075 + 1.1) * Math.cos(z * 0.065 - 0.7) * 2.2 +
      Math.sin((x + z) * 0.045) * 1.4 +
      Math.cos(x * 0.13 - z * 0.11) * 0.75) *
    plateauBlend;

  // Natural perimeter ridge rising softly beyond r = 36m
  const ridgeBlend = THREE.MathUtils.smoothstep(r, 34.0, 74.0);
  const angle = Math.atan2(z, x);
  const ridgeMod =
    1.0 +
    0.35 * Math.sin(angle * 5.0 + 0.8) +
    0.22 * Math.cos(angle * 9.0 - 1.3);
  const perimeterRidge = ridgeBlend * ridgeBlend * 11.5 * ridgeMod;

  return micro * (0.35 + 0.65 * plateauBlend) + hills + perimeterRidge;
}

export interface TerrainBuildResult {
  group: THREE.Group;
  dispose: () => void;
}

export function buildTerrain(shared: SharedDitherUniforms): TerrainBuildResult {
  const group = new THREE.Group();
  const geometries: THREE.BufferGeometry[] = [];
  const materials: THREE.Material[] = [];

  // High-resolution faceted outdoor terrain
  const size = 180;
  const segments = 112;
  const planeGeo = new THREE.PlaneGeometry(size, size, segments, segments);
  planeGeo.rotateX(-Math.PI / 2);

  const posAttr = planeGeo.attributes.position as THREE.BufferAttribute;
  const colors = new Float32Array(posAttr.count * 3);
  const colorTmp = new THREE.Color();

  for (let i = 0; i < posAttr.count; i++) {
    const x = posAttr.getX(i);
    const z = posAttr.getZ(i);
    const y = groundHeightAt(x, z);
    posAttr.setY(i, y);

    const r = Math.hypot(x, z);
    const angle = Math.atan2(z, x);

    // Subtle stone clearing ring & spiral approach path
    const spiralDist = Math.abs(((r - 5.2 - ((angle + Math.PI) / (Math.PI * 2)) * 8.0) % 14.0) - 7.0);
    const pathMask = 1.0 - THREE.MathUtils.smoothstep(spiralDist, 0.7, 2.1);
    const clearingMask = 1.0 - THREE.MathUtils.smoothstep(r, 4.0, 12.5);

    // Base highland grass/moss vs compacted stone path
    const slopeNoise = Math.sin(x * 0.42) * Math.cos(z * 0.39) * 0.08;
    let shade = 0.62 + slopeNoise + clearingMask * 0.12;
    shade = THREE.MathUtils.lerp(shade, 0.84, pathMask * 0.55);

    // Darken deep valleys slightly for crisp 1-bit dither depth
    shade += THREE.MathUtils.clamp(y * 0.025, -0.14, 0.16);
    shade = THREE.MathUtils.clamp(shade, 0.28, 0.92);

    colorTmp.setRGB(shade, shade * 0.99, shade * 0.96);
    colors[i * 3] = colorTmp.r;
    colors[i * 3 + 1] = colorTmp.g;
    colors[i * 3 + 2] = colorTmp.b;
  }

  planeGeo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  planeGeo.computeVertexNormals();
  geometries.push(planeGeo);

  const terrainMat = createDitherStandardMaterial(shared, {
    color: 0xffffff,
    roughness: 0.95,
    metalness: 0.0,
    flatShading: true,
    vertexColors: true,
    lumaBias: -0.02,
  });
  materials.push(terrainMat);

  const terrainMesh = new THREE.Mesh(planeGeo, terrainMat);
  terrainMesh.receiveShadow = true;
  terrainMesh.castShadow = false;
  group.add(terrainMesh);

  // Subtle carved stone ring around the clearing (r = 7.4m)
  const stoneCount = 16;
  const stoneGeo = new THREE.CylinderGeometry(0.42, 0.52, 0.16, 6);
  // Slightly irregular facets
  const sPos = stoneGeo.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < sPos.count; i++) {
    const sx = sPos.getX(i);
    const sz = sPos.getZ(i);
    sPos.setX(i, sx * (1 + 0.14 * Math.sin(i * 2.1)));
    sPos.setZ(i, sz * (1 + 0.12 * Math.cos(i * 1.7)));
  }
  stoneGeo.computeVertexNormals();
  geometries.push(stoneGeo);

  const stoneMat = createDitherStandardMaterial(shared, {
    color: 0xcbc6ba,
    roughness: 0.88,
    metalness: 0.03,
    flatShading: true,
  });
  materials.push(stoneMat);

  const stonesInstanced = new THREE.InstancedMesh(stoneGeo, stoneMat, stoneCount);
  stonesInstanced.receiveShadow = true;
  stonesInstanced.castShadow = true;

  const dummy = new THREE.Object3D();
  for (let i = 0; i < stoneCount; i++) {
    const a = (i / stoneCount) * Math.PI * 2 + 0.18;
    const rad = 7.6 + Math.sin(i * 3.1) * 0.45;
    const px = Math.cos(a) * rad;
    const pz = Math.sin(a) * rad;
    const py = groundHeightAt(px, pz);

    dummy.position.set(px, py + 0.04, pz);
    dummy.rotation.set(0, a + i * 0.7, 0);
    dummy.scale.set(
      0.9 + (i % 3) * 0.15,
      0.8 + (i % 2) * 0.25,
      0.85 + ((i + 1) % 3) * 0.12,
    );
    dummy.updateMatrix();
    stonesInstanced.setMatrixAt(i, dummy.matrix);
  }
  stonesInstanced.instanceMatrix.needsUpdate = true;
  stonesInstanced.computeBoundingSphere();
  group.add(stonesInstanced);

  return {
    group,
    dispose: () => {
      geometries.forEach((g) => g.dispose());
      materials.forEach((m) => m.dispose());
    },
  };
}
