import * as THREE from 'three';
import { createDitherStandardMaterial, SharedDitherUniforms } from '../shaders/ditherShader';
import { groundHeightAt } from './terrain';

interface PlaneDef {
  normal: THREE.Vector3;
  dist: number;
}

/**
 * Clips a convex polygon against a half-space dot(p, normal) <= dist.
 * Returns the clipped polygon and records any newly created edge segment on the plane.
 */
function clipPolygonByPlane(
  poly: THREE.Vector3[],
  normal: THREE.Vector3,
  dist: number,
  cutPoints: THREE.Vector3[],
): THREE.Vector3[] {
  if (poly.length < 3) return [];
  const EPS = 1e-5;
  const out: THREE.Vector3[] = [];

  for (let i = 0; i < poly.length; i++) {
    const curr = poly[i];
    const next = poly[(i + 1) % poly.length];
    const dCurr = curr.dot(normal) - dist;
    const dNext = next.dot(normal) - dist;

    const currIn = dCurr <= EPS;
    const nextIn = dNext <= EPS;

    if (currIn) {
      out.push(curr.clone());
    }

    if (currIn !== nextIn) {
      const denom = dCurr - dNext;
      const t = Math.abs(denom) > 1e-8 ? dCurr / denom : 0.5;
      const hit = curr.clone().lerp(next, THREE.MathUtils.clamp(t, 0, 1));
      out.push(hit);
      cutPoints.push(hit.clone());
    }
  }

  return out;
}

/**
 * Generates a watertight, flat-faceted convex polyhedron by slicing an initial cube
 * against a set of cleavage planes.
 */
export function buildFacetedPolyhedronFromPlanes(planes: PlaneDef[], extent = 6.0): THREE.BufferGeometry {
  // Initial cube faces (CCW winding from outside)
  let faces: THREE.Vector3[][] = [
    // +X
    [
      new THREE.Vector3(extent, -extent, extent),
      new THREE.Vector3(extent, -extent, -extent),
      new THREE.Vector3(extent, extent, -extent),
      new THREE.Vector3(extent, extent, extent),
    ],
    // -X
    [
      new THREE.Vector3(-extent, -extent, -extent),
      new THREE.Vector3(-extent, -extent, extent),
      new THREE.Vector3(-extent, extent, extent),
      new THREE.Vector3(-extent, extent, -extent),
    ],
    // +Y
    [
      new THREE.Vector3(-extent, extent, extent),
      new THREE.Vector3(extent, extent, extent),
      new THREE.Vector3(extent, extent, -extent),
      new THREE.Vector3(-extent, extent, -extent),
    ],
    // -Y
    [
      new THREE.Vector3(-extent, -extent, -extent),
      new THREE.Vector3(extent, -extent, -extent),
      new THREE.Vector3(extent, -extent, extent),
      new THREE.Vector3(-extent, -extent, extent),
    ],
    // +Z
    [
      new THREE.Vector3(-extent, -extent, extent),
      new THREE.Vector3(extent, -extent, extent),
      new THREE.Vector3(extent, extent, extent),
      new THREE.Vector3(-extent, extent, extent),
    ],
    // -Z
    [
      new THREE.Vector3(extent, -extent, -extent),
      new THREE.Vector3(-extent, -extent, -extent),
      new THREE.Vector3(-extent, extent, -extent),
      new THREE.Vector3(extent, extent, -extent),
    ],
  ];

  for (const plane of planes) {
    const n = plane.normal.clone().normalize();
    const cutPoints: THREE.Vector3[] = [];
    const nextFaces: THREE.Vector3[][] = [];

    for (const face of faces) {
      const clipped = clipPolygonByPlane(face, n, plane.dist, cutPoints);
      if (clipped.length >= 3) {
        nextFaces.push(clipped);
      }
    }

    // Deduplicate cutPoints and form the cap face on the cleavage plane
    const unique: THREE.Vector3[] = [];
    for (const pt of cutPoints) {
      if (!unique.some((u) => u.distanceToSquared(pt) < 1e-6)) {
        unique.push(pt);
      }
    }

    if (unique.length >= 3) {
      const centroid = new THREE.Vector3();
      unique.forEach((p) => centroid.add(p));
      centroid.divideScalar(unique.length);

      const ref = Math.abs(n.y) < 0.9 ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3(1, 0, 0);
      const uAxis = new THREE.Vector3().crossVectors(ref, n).normalize();
      const vAxis = new THREE.Vector3().crossVectors(n, uAxis).normalize();

      unique.sort((a, b) => {
        const da = a.clone().sub(centroid);
        const db = b.clone().sub(centroid);
        const angA = Math.atan2(da.dot(vAxis), da.dot(uAxis));
        const angB = Math.atan2(db.dot(vAxis), db.dot(uAxis));
        return angA - angB;
      });

      nextFaces.push(unique);
    }

    faces = nextFaces;
  }

  // Triangulate all convex polygon faces into non-indexed BufferGeometry for razor-sharp facets
  const positions: number[] = [];
  const normals: number[] = [];

  for (const face of faces) {
    if (face.length < 3) continue;
    const e1 = face[1].clone().sub(face[0]);
    const e2 = face[2].clone().sub(face[0]);
    const faceNormal = new THREE.Vector3().crossVectors(e1, e2).normalize();

    for (let i = 1; i < face.length - 1; i++) {
      const a = face[0];
      const b = face[i];
      const c = face[i + 1];

      positions.push(a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z);
      normals.push(
        faceNormal.x,
        faceNormal.y,
        faceNormal.z,
        faceNormal.x,
        faceNormal.y,
        faceNormal.z,
        faceNormal.x,
        faceNormal.y,
        faceNormal.z,
      );
    }
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  geo.computeBoundingBox();

  // Anchor bottom-center pivot at (0, 0, 0)
  if (geo.boundingBox) {
    const cx = (geo.boundingBox.min.x + geo.boundingBox.max.x) * 0.5;
    const cz = (geo.boundingBox.min.z + geo.boundingBox.max.z) * 0.5;
    const minY = geo.boundingBox.min.y;
    geo.translate(-cx, -minY, -cz);
  }
  geo.computeBoundingSphere();

  return geo;
}

/**
 * Builds an outward-extruded BackSide silhouette outline mesh using averaged vertex normals
 * (splitting vertices share the same normal so corners never crack).
 */
function createSilhouetteOutlineGeometry(sourceGeo: THREE.BufferGeometry, thickness: number): THREE.BufferGeometry {
  const cloned = sourceGeo.clone();
  const pos = cloned.attributes.position as THREE.BufferAttribute;

  // Accumulate smooth averaged normals per unique spatial position
  const smoothMap = new Map<string, THREE.Vector3>();
  const v = new THREE.Vector3();
  const n = new THREE.Vector3();
  const normAttr = cloned.attributes.normal as THREE.BufferAttribute;

  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);
    n.fromBufferAttribute(normAttr, i);
    const key = `${Math.round(v.x * 1000)}_${Math.round(v.y * 1000)}_${Math.round(v.z * 1000)}`;
    const acc = smoothMap.get(key);
    if (acc) {
      acc.add(n);
    } else {
      smoothMap.set(key, n.clone());
    }
  }

  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);
    const key = `${Math.round(v.x * 1000)}_${Math.round(v.y * 1000)}_${Math.round(v.z * 1000)}`;
    const avgN = smoothMap.get(key)!.clone().normalize();
    v.addScaledVector(avgN, thickness);
    pos.setXYZ(i, v.x, v.y, v.z);
  }

  pos.needsUpdate = true;
  return cloned;
}

function createInkColorMaterial(
  shared: SharedDitherUniforms,
  side: THREE.Side = THREE.FrontSide,
): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    side,
    uniforms: {
      uDarkColor: shared.uDarkColor,
    },
    vertexShader: /* glsl */ `
      void main() {
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      uniform vec3 uDarkColor;
      void main() {
        gl_FragColor = vec4(uDarkColor, 1.0);
      }
    `,
  });
}

function createInkLineMaterial(shared: SharedDitherUniforms): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: {
      uDarkColor: shared.uDarkColor,
    },
    vertexShader: /* glsl */ `
      void main() {
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      uniform vec3 uDarkColor;
      void main() {
        gl_FragColor = vec4(uDarkColor, 1.0);
      }
    `,
  });
}

export interface MonolithBuildResult {
  group: THREE.Group;
  collisionRadius: number;
  center: THREE.Vector3;
  dispose: () => void;
}

/**
 * Builds the hero faceted rock sculpture inspired by rock_2_69294a23.png
 * as a composite multi-part THREE.Group with bold dark contour, crisp crease lines,
 * basal skirt boulders, stepped plinth, and contact shadow apron.
 */
export function buildHeroMonolith(shared: SharedDitherUniforms): MonolithBuildResult {
  const group = new THREE.Group();
  const baseY = groundHeightAt(0, 0);
  group.position.set(0, baseY, 0);

  const geometries: THREE.BufferGeometry[] = [];
  const materials: THREE.Material[] = [];

  // Cleavage planes tuned to match the asymmetric chiseled silhouette of rock_2_69294a23.png
  const heroPlanes: PlaneDef[] = [
    // Bottom & lower bevels
    { normal: new THREE.Vector3(0, -1, 0), dist: 2.15 },
    { normal: new THREE.Vector3(-0.35, -0.88, 0.32), dist: 2.12 },
    { normal: new THREE.Vector3(0.45, -0.78, 0.42), dist: 2.02 },
    { normal: new THREE.Vector3(0.1, -0.82, -0.56), dist: 2.08 },

    // Left flank & mid-left hip
    { normal: new THREE.Vector3(-0.96, 0.08, 0.14), dist: 1.55 },
    { normal: new THREE.Vector3(-0.74, 0.64, 0.16), dist: 1.55 },
    { normal: new THREE.Vector3(-0.62, -0.24, 0.74), dist: 1.48 },

    // Apex peak & upper-right stepped shoulder
    { normal: new THREE.Vector3(0.42, 0.88, 0.12), dist: 2.24 },
    { normal: new THREE.Vector3(0.84, 0.52, 0.16), dist: 1.88 },
    { normal: new THREE.Vector3(0.95, -0.05, -0.14), dist: 1.68 },

    // Broad front facets (+Z facing starting FPV camera)
    { normal: new THREE.Vector3(-0.18, 0.22, 0.96), dist: 1.42 },
    { normal: new THREE.Vector3(0.48, -0.32, 0.82), dist: 1.38 },
    { normal: new THREE.Vector3(-0.46, -0.08, 0.88), dist: 1.42 },

    // Sculpted rear facets (-Z) for 360-degree exploration
    { normal: new THREE.Vector3(0.18, 0.32, -0.92), dist: 1.44 },
    { normal: new THREE.Vector3(-0.58, 0.36, -0.72), dist: 1.48 },
    { normal: new THREE.Vector3(0.56, -0.26, -0.78), dist: 1.44 },
  ];

  const heroGeo = buildFacetedPolyhedronFromPlanes(heroPlanes, 5.0);
  // Scale to monumental sculpture height (~4.7m tall)
  heroGeo.scale(1.12, 1.12, 1.08);
  heroGeo.computeBoundingBox();
  heroGeo.computeBoundingSphere();
  geometries.push(heroGeo);

  const heroMat = createDitherStandardMaterial(shared, {
    color: 0xe4e0d4,
    roughness: 0.78,
    metalness: 0.04,
    flatShading: true,
    lumaBias: 0.05,
  });
  materials.push(heroMat);

  const heroMesh = new THREE.Mesh(heroGeo, heroMat);
  heroMesh.position.y = 0.18;
  heroMesh.castShadow = true;
  heroMesh.receiveShadow = true;
  group.add(heroMesh);

  // Part 2: Bold BackSide silhouette contour matching rock_2_69294a23.png's heavy ink border
  const outlineGeo = createSilhouetteOutlineGeometry(heroGeo, 0.055);
  geometries.push(outlineGeo);
  const outlineMat = createInkColorMaterial(shared, THREE.BackSide);
  materials.push(outlineMat);

  const outlineMesh = new THREE.Mesh(outlineGeo, outlineMat);
  outlineMesh.position.copy(heroMesh.position);
  group.add(outlineMesh);

  // Part 3: Crisp facet crease ink lines
  const edgesGeo = new THREE.EdgesGeometry(heroGeo, 6);
  geometries.push(edgesGeo);
  const edgeMat = createInkLineMaterial(shared);
  materials.push(edgeMat);

  const edgesMesh = new THREE.LineSegments(edgesGeo, edgeMat);
  edgesMesh.position.copy(heroMesh.position);
  edgesMesh.scale.setScalar(1.0018);
  group.add(edgesMesh);

  // Part 4: Carved octagonal ritual plinth base seated flush at y=0
  const plinthGeo = new THREE.CylinderGeometry(2.35, 2.72, 0.28, 8);
  plinthGeo.translate(0, 0.14, 0);
  geometries.push(plinthGeo);

  const plinthMat = createDitherStandardMaterial(shared, {
    color: 0xbcb6a9,
    roughness: 0.94,
    metalness: 0.02,
    flatShading: true,
    lumaBias: -0.04,
  });
  materials.push(plinthMat);

  const plinthMesh = new THREE.Mesh(plinthGeo, plinthMat);
  plinthMesh.castShadow = true;
  plinthMesh.receiveShadow = true;
  group.add(plinthMesh);

  const plinthEdges = new THREE.EdgesGeometry(plinthGeo, 15);
  geometries.push(plinthEdges);
  const plinthLines = new THREE.LineSegments(plinthEdges, edgeMat);
  plinthLines.scale.setScalar(1.001);
  group.add(plinthLines);

  // Parts 5–9: 5 interlocking fractured skirt boulders wedged around the base
  const skirtSpecs = [
    { x: -1.55, z: 0.85, scale: 0.42, rotY: 0.5 },
    { x: 1.48, z: 0.92, scale: 0.36, rotY: -0.9 },
    { x: 1.62, z: -0.82, scale: 0.48, rotY: 1.9 },
    { x: -1.42, z: -1.08, scale: 0.38, rotY: 2.7 },
    { x: 0.12, z: -1.58, scale: 0.44, rotY: 0.2 },
  ];

  const skirtMat = createDitherStandardMaterial(shared, {
    color: 0xd0cbc0,
    roughness: 0.86,
    metalness: 0.03,
    flatShading: true,
    lumaBias: 0.0,
  });
  materials.push(skirtMat);

  skirtSpecs.forEach((spec, idx) => {
    const skirtPlanes: PlaneDef[] = [
      { normal: new THREE.Vector3(0, -1, 0), dist: 0.9 },
      { normal: new THREE.Vector3(0.3, 0.92, 0.2), dist: 1.1 },
      { normal: new THREE.Vector3(-0.85, 0.42, 0.2), dist: 0.95 },
      { normal: new THREE.Vector3(0.88, 0.36, -0.15), dist: 1.0 },
      { normal: new THREE.Vector3(0.1, 0.25, 0.95), dist: 0.95 },
      { normal: new THREE.Vector3(-0.2, 0.3, -0.92), dist: 0.92 },
      { normal: new THREE.Vector3(0.65, -0.35, 0.66), dist: 0.98 },
    ];
    const sGeo = buildFacetedPolyhedronFromPlanes(skirtPlanes, 3.0);
    sGeo.scale(spec.scale, spec.scale * (0.85 + (idx % 2) * 0.25), spec.scale);
    geometries.push(sGeo);

    const sMesh = new THREE.Mesh(sGeo, skirtMat);
    sMesh.position.set(spec.x, 0.06, spec.z);
    sMesh.rotation.y = spec.rotY;
    sMesh.castShadow = true;
    sMesh.receiveShadow = true;
    group.add(sMesh);

    const sOutline = createSilhouetteOutlineGeometry(sGeo, 0.024);
    geometries.push(sOutline);
    const sOutlineMesh = new THREE.Mesh(sOutline, outlineMat);
    sOutlineMesh.position.copy(sMesh.position);
    sOutlineMesh.rotation.copy(sMesh.rotation);
    group.add(sOutlineMesh);

    const sEdges = new THREE.EdgesGeometry(sGeo, 10);
    geometries.push(sEdges);
    const sLines = new THREE.LineSegments(sEdges, edgeMat);
    sLines.position.copy(sMesh.position);
    sLines.rotation.copy(sMesh.rotation);
    sLines.scale.setScalar(1.002);
    group.add(sLines);
  });

  // Part 10: Grounded contact shadow apron around plinth base
  const apronGeo = new THREE.RingGeometry(2.35, 3.7, 24);
  apronGeo.rotateX(-Math.PI / 2);
  geometries.push(apronGeo);

  const apronMat = createDitherStandardMaterial(shared, {
    color: 0x3b3a36,
    roughness: 1.0,
    metalness: 0.0,
    flatShading: true,
    polygonOffset: true,
    polygonOffsetFactor: -1,
    polygonOffsetUnits: -1,
    lumaBias: -0.15,
  });
  materials.push(apronMat);

  const apronMesh = new THREE.Mesh(apronGeo, apronMat);
  apronMesh.position.y = 0.025;
  apronMesh.receiveShadow = true;
  group.add(apronMesh);

  return {
    group,
    collisionRadius: 2.95,
    center: new THREE.Vector3(0, baseY + 2.2, 0),
    dispose: () => {
      geometries.forEach((g) => g.dispose());
      materials.forEach((m) => m.dispose());
    },
  };
}
