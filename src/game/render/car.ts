/**
 * Cars built in code. The body is a side profile (the silhouette you see from the side) extruded
 * across the car's width with rounded edges, wheel arches cut into it; the glasshouse sits on top
 * and leans in towards the roof (designers call that "tumblehome"). Three body styles share the
 * code: a fastback four-door sedan (the racers), a crossover and a hatchback (the parked cars).
 *
 * Every part is grouped by material so 130 parked cars can be drawn with a handful of instanced
 * draw calls, while the racers get their own meshes with spinning, steering wheels.
 */
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

export type PartKind = 'paint' | 'glass' | 'trim' | 'chrome' | 'head' | 'tail' | 'tyre' | 'rim' | 'plate';

interface Style {
  length: number;
  width: number;
  /** Side profile of the lower body above the beltline, front to back: [z, y]. */
  upper: [number, number][];
  /** Glasshouse outline: [z, y] from windscreen base over the roof to the rear glass base. */
  glass: [number, number][];
  /** Where the roof panel runs (z from, z to) and its height. */
  roof: [number, number, number];
  front: number;
  rear: number;
  wheelR: number;
  /** Lamp heights. */
  headY: number;
  tailY: number;
  bodyBottom: number;
}

export const STYLES: Style[] = [
  // 0: fastback four-door (the racers): long bonnet, roof sweeping into a short boot.
  {
    length: 4.68,
    width: 1.82,
    upper: [
      [2.3, 0.62],
      [2.24, 0.76],
      [1.85, 0.85],
      [1.05, 0.97],
      [-1.0, 1.0],
      [-1.95, 1.02],
      [-2.22, 1.0],
      [-2.33, 0.88],
    ],
    glass: [
      [1.02, 0.95],
      [0.62, 1.2],
      [0.22, 1.39],
      [-0.25, 1.43],
      [-0.7, 1.41],
      [-1.15, 1.27],
      [-1.75, 1.03],
    ],
    roof: [0.2, -0.75, 1.42],
    front: 1.38,
    rear: -1.34,
    wheelR: 0.32,
    headY: 0.73,
    tailY: 0.93,
    bodyBottom: 0.2,
  },
  // 1: crossover: tall, upright, roof rails.
  {
    length: 4.6,
    width: 1.86,
    upper: [
      [2.28, 0.72],
      [2.2, 0.9],
      [1.7, 1.0],
      [1.0, 1.08],
      [-1.5, 1.12],
      [-2.2, 1.12],
      [-2.3, 1.0],
    ],
    glass: [
      [0.98, 1.06],
      [0.45, 1.45],
      [0.15, 1.64],
      [-1.2, 1.66],
      [-1.95, 1.6],
      [-2.18, 1.12],
    ],
    roof: [0.12, -1.95, 1.65],
    front: 1.4,
    rear: -1.35,
    wheelR: 0.36,
    headY: 0.86,
    tailY: 1.02,
    bodyBottom: 0.28,
  },
  // 2: hatchback: short tail, steep rear glass.
  {
    length: 4.3,
    width: 1.8,
    upper: [
      [2.12, 0.62],
      [2.06, 0.78],
      [1.6, 0.88],
      [0.95, 0.97],
      [-1.6, 1.0],
      [-2.05, 1.0],
      [-2.15, 0.9],
    ],
    glass: [
      [0.92, 0.95],
      [0.5, 1.2],
      [0.15, 1.42],
      [-1.1, 1.45],
      [-1.75, 1.38],
      [-2.02, 1.02],
    ],
    roof: [0.12, -1.75, 1.44],
    front: 1.28,
    rear: -1.3,
    wheelR: 0.31,
    headY: 0.74,
    tailY: 0.95,
    bodyBottom: 0.2,
  },
];

const ARCH = 0.06;

/** Extrudes a side profile ([z, y] points) across `width`, centred, with rounded edges. */
const extrudeProfile = (pts: [number, number][], width: number, bevel: number, taper = 0, taperFrom = 0, taperTo = 1) => {
  const shape = new THREE.Shape(pts.map(([z, y]) => new THREE.Vector2(z, y)));
  const depth = Math.max(0.01, width - bevel * 2);
  const geo = new THREE.ExtrudeGeometry(shape, {
    depth,
    bevelEnabled: bevel > 0,
    bevelThickness: bevel,
    bevelSize: bevel * 0.8,
    bevelSegments: 3,
    curveSegments: 10,
  });
  // Shape x is the car's length (z), the extrusion runs across (x).
  geo.rotateY(-Math.PI / 2);
  geo.translate(depth / 2, 0, 0);
  if (taper) {
    const pos = geo.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const k = Math.max(0, Math.min(1, (pos.getY(i) - taperFrom) / (taperTo - taperFrom)));
      pos.setX(i, pos.getX(i) * (1 - taper * k));
    }
    geo.computeVertexNormals();
  }
  return geo;
};

/** The lower body: bumpers, bonnet, flanks and boot, with the wheel arches cut out. */
const lowerBody = (s: Style) => {
  const half = s.length / 2;
  const pts: [number, number][] = [];
  const bottom = s.bodyBottom;
  const archR = s.wheelR + ARCH;
  const wy = s.wheelR;
  const arch = (zc: number) => {
    // Rear edge of the arch first (we walk from the back of the car to the front along the sill).
    for (let i = 0; i <= 12; i++) {
      const a = Math.PI - (i / 12) * Math.PI;
      pts.push([zc + Math.cos(a) * archR, Math.max(bottom, wy + Math.sin(a) * archR)]);
    }
  };
  // Along the bottom from the back to the front.
  pts.push([-half + 0.12, bottom + 0.02]);
  arch(s.rear);
  arch(s.front);
  pts.push([half - 0.12, bottom + 0.04]);
  pts.push([half - 0.02, bottom + 0.18]);
  // Up the nose, over the top, down the tail.
  for (const p of s.upper) pts.push(p);
  pts.push([-half, s.tailY - 0.3]);
  pts.push([-half + 0.03, bottom + 0.15]);
  return extrudeProfile(pts, s.width, 0.07);
};

const box = (w: number, h: number, d: number, x: number, y: number, z: number, rx = 0) => {
  const g = new THREE.BoxGeometry(w, h, d);
  if (rx) g.rotateX(rx);
  g.translate(x, y, z);
  return g;
};

/** A tyre as a lathe (rounded shoulders), axis along x. */
export const tyreGeometry = (r: number) => {
  const w = 0.12;
  const pts = [
    new THREE.Vector2(r * 0.66, -w),
    new THREE.Vector2(r * 0.93, -w),
    new THREE.Vector2(r, -w * 0.7),
    new THREE.Vector2(r, w * 0.7),
    new THREE.Vector2(r * 0.93, w),
    new THREE.Vector2(r * 0.66, w),
  ];
  const g = new THREE.LatheGeometry(pts, 22);
  g.rotateZ(Math.PI / 2);
  return g;
};

/** Alloy rim: dish, five spokes and a centre cap, facing +x (flip for the left side). */
export const rimGeometry = (r: number) => {
  const parts: THREE.BufferGeometry[] = [];
  const dish = new THREE.CylinderGeometry(r * 0.66, r * 0.66, 0.16, 20, 1, true);
  dish.rotateZ(Math.PI / 2);
  parts.push(dish);
  const face = new THREE.CylinderGeometry(r * 0.2, r * 0.2, 0.05, 12);
  face.rotateZ(Math.PI / 2);
  face.translate(0.09, 0, 0);
  parts.push(face);
  for (let i = 0; i < 5; i++) {
    const spoke = new THREE.BoxGeometry(0.04, r * 0.5, 0.075);
    spoke.translate(0.09, r * 0.4, 0);
    spoke.rotateX((i / 5) * Math.PI * 2);
    parts.push(spoke);
  }
  const lip = new THREE.TorusGeometry(r * 0.64, 0.016, 6, 24);
  lip.rotateY(Math.PI / 2);
  lip.translate(0.08, 0, 0);
  parts.push(lip);
  return mergeGeometries(parts.map((p) => p.toNonIndexed()))!;
};

export type CarGeometry = Record<PartKind, THREE.BufferGeometry | null>;

/**
 * All the static parts of one body style, merged per material. With `wheels` the four wheels are
 * baked in (parked cars); without, the racers add their own so they can turn.
 */
export const carGeometry = (style: number, wheels: boolean): CarGeometry => {
  const s = STYLES[style];
  const half = s.length / 2;
  const hw = s.width / 2;
  const parts: Record<PartKind, THREE.BufferGeometry[]> = {
    paint: [],
    glass: [],
    trim: [],
    chrome: [],
    head: [],
    tail: [],
    tyre: [],
    rim: [],
    plate: [],
  };

  parts.paint.push(lowerBody(s));
  // Glasshouse, leaning in towards the roof.
  const belt = s.glass[0][1];
  const top = Math.max(...s.glass.map((p) => p[1]));
  parts.glass.push(extrudeProfile(s.glass, s.width - 0.2, 0.05, 0.2, belt, top));
  // Roof panel in body colour over the glass, and the pillars between the windows.
  const [r0, r1, ry] = s.roof;
  const roofPts: [number, number][] = [
    [r0, ry - 0.06],
    [r0 - 0.15, ry + 0.012],
    [r1 + 0.2, ry + 0.012],
    [r1, ry - 0.06],
  ];
  parts.paint.push(extrudeProfile(roofPts, (s.width - 0.2) * 0.8 + 0.04, 0.03));
  // B pillar (black) on both sides, at the middle of the glasshouse.
  const bz = (s.glass[0][0] + s.glass[s.glass.length - 1][0]) / 2 + 0.1;
  for (const sx of [-1, 1]) {
    const pillar = box(0.04, top - belt - 0.05, 0.11, sx * (hw - 0.17), (top + belt) / 2 - 0.02, bz);
    pillar.rotateZ(-sx * 0.12);
    parts.trim.push(pillar);
  }

  // Front: full-width light strip across the nose, lamp units at the corners, a wide dark grille.
  const nose = s.upper[0][0];
  parts.head.push(box(s.width * 0.86, 0.035, 0.04, 0, s.headY, nose - 0.02));
  for (const sx of [-1, 1]) {
    parts.trim.push(box(0.36, 0.1, 0.06, sx * (hw - 0.3), s.headY - 0.06, nose - 0.06));
    parts.head.push(box(0.3, 0.025, 0.03, sx * (hw - 0.3), s.headY - 0.08, nose - 0.025));
  }
  parts.trim.push(box(s.width * 0.7, 0.26, 0.05, 0, s.bodyBottom + 0.27, half - 0.02));
  parts.plate.push(box(0.52, 0.12, 0.02, 0, s.bodyBottom + 0.27, half + 0.012));

  // Rear: a thin bar of light across the whole boot, lamp clusters at the corners.
  parts.tail.push(box(s.width * 0.9, 0.04, 0.04, 0, s.tailY, -half + 0.05));
  for (const sx of [-1, 1]) {
    parts.tail.push(box(0.34, 0.1, 0.05, sx * (hw - 0.24), s.tailY - 0.05, -half + 0.06));
  }
  parts.plate.push(box(0.52, 0.12, 0.02, 0, s.tailY - 0.33, -half + 0.01));
  parts.trim.push(box(s.width * 0.8, 0.12, 0.05, 0, s.bodyBottom + 0.1, -half + 0.08));

  // Sills, mirrors, door handles.
  for (const sx of [-1, 1]) {
    parts.trim.push(box(0.05, 0.09, s.front - s.rear - 0.85, sx * (hw - 0.01), s.bodyBottom + 0.06, (s.front + s.rear) / 2));
    const mz = s.glass[0][0] - 0.12;
    parts.trim.push(box(0.12, 0.04, 0.08, sx * (hw + 0.02), belt + 0.03, mz));
    parts.paint.push(box(0.1, 0.11, 0.2, sx * (hw + 0.1), belt + 0.08, mz - 0.03));
    for (const dz of [0.15, -0.75]) parts.chrome.push(box(0.03, 0.025, 0.16, sx * (hw + 0.01), belt - 0.12, dz));
  }

  if (wheels) {
    for (const [wx, wz] of [
      [hw - 0.13, s.front],
      [-(hw - 0.13), s.front],
      [hw - 0.13, s.rear],
      [-(hw - 0.13), s.rear],
    ]) {
      const t = tyreGeometry(s.wheelR);
      t.translate(wx, s.wheelR, wz);
      parts.tyre.push(t);
      const r = rimGeometry(s.wheelR);
      if (wx < 0) r.rotateY(Math.PI);
      r.translate(wx, s.wheelR, wz);
      parts.rim.push(r);
    }
  }

  const out = {} as CarGeometry;
  for (const k of Object.keys(parts) as PartKind[]) {
    out[k] = parts[k].length ? mergeGeometries(parts[k].map((p) => (p.index ? p.toNonIndexed() : p)))! : null;
  }
  return out;
};

// ---------------------------------------------------------------------------
// Materials
// ---------------------------------------------------------------------------

export const carMaterials = () => ({
  glass: new THREE.MeshPhysicalMaterial({ color: 0x10171d, metalness: 0.1, roughness: 0.06, clearcoat: 1, envMapIntensity: 1.6 }),
  trim: new THREE.MeshStandardMaterial({ color: 0x15171a, roughness: 0.55, metalness: 0.1 }),
  chrome: new THREE.MeshStandardMaterial({ color: 0xd6dadf, roughness: 0.18, metalness: 1 }),
  tyre: new THREE.MeshStandardMaterial({ color: 0x1b1c1e, roughness: 0.92 }),
  rim: new THREE.MeshStandardMaterial({ color: 0xb9bec6, roughness: 0.28, metalness: 0.9 }),
  plate: new THREE.MeshStandardMaterial({ color: 0xf1f1ea, roughness: 0.5 }),
});

export const paintMaterial = (color: number) =>
  new THREE.MeshPhysicalMaterial({ color, metalness: 0.45, roughness: 0.32, clearcoat: 1, clearcoatRoughness: 0.06 });

/** Number plate texture with a short word on it. */
export const plateTexture = (text: string) => {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 60;
  const g = c.getContext('2d')!;
  g.fillStyle = '#f2f2ea';
  g.fillRect(0, 0, 256, 60);
  g.fillStyle = '#1d4fa8';
  g.fillRect(0, 0, 26, 60);
  g.strokeStyle = '#222';
  g.lineWidth = 4;
  g.strokeRect(2, 2, 252, 56);
  g.fillStyle = '#111';
  g.font = 'bold 40px "Arial Narrow", Arial, sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(text, 140, 32);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
};

// ---------------------------------------------------------------------------
// A racer: its own meshes, wheels that steer and spin, lights that react, a body that leans.
// ---------------------------------------------------------------------------

export interface RacerRig {
  root: THREE.Group;
  /** The body rides on this (pitch and roll from the suspension). */
  body: THREE.Group;
  wheels: { pivot: THREE.Group; spin: THREE.Group; front: boolean }[];
  head: THREE.MeshStandardMaterial;
  tail: THREE.MeshStandardMaterial;
  reverse: THREE.MeshStandardMaterial;
  paint: THREE.MeshPhysicalMaterial;
  /** Wheel rotation angle so far. */
  roll: number;
  /** Suspension state: pitch/roll angles and their velocities. */
  pitch: number;
  pitchV: number;
  lean: number;
  leanV: number;
}

let racerShared: { geo: CarGeometry; mats: ReturnType<typeof carMaterials>; tyre: THREE.BufferGeometry; rim: THREE.BufferGeometry } | null = null;

export const buildRacer = (color: number, plate: string): RacerRig => {
  if (!racerShared) {
    racerShared = { geo: carGeometry(0, false), mats: carMaterials(), tyre: tyreGeometry(STYLES[0].wheelR), rim: rimGeometry(STYLES[0].wheelR) };
  }
  const { geo, mats, tyre, rim } = racerShared;
  const s = STYLES[0];
  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body);
  const paint = paintMaterial(color);
  const head = new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xeaf4ff, emissiveIntensity: 1.6 });
  const tail = new THREE.MeshStandardMaterial({ color: 0x5a0608, emissive: 0xff1a1a, emissiveIntensity: 0.7 });
  const reverse = new THREE.MeshStandardMaterial({ color: 0xdddddd, emissive: 0xffffff, emissiveIntensity: 0 });
  const plateMat = new THREE.MeshStandardMaterial({ map: plateTexture(plate), roughness: 0.5 });
  const add = (g: THREE.BufferGeometry | null, m: THREE.Material) => {
    if (!g) return;
    const mesh = new THREE.Mesh(g, m);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    body.add(mesh);
  };
  add(geo.paint, paint);
  add(geo.glass, mats.glass);
  add(geo.trim, mats.trim);
  add(geo.chrome, mats.chrome);
  add(geo.head, head);
  add(geo.tail, tail);
  // Plates: map the texture onto the outward faces with their own little planes.
  for (const [z, y, ry] of [
    [s.length / 2 + 0.024, s.bodyBottom + 0.27, 0],
    [-s.length / 2 - 0.002, s.tailY - 0.33, Math.PI],
  ]) {
    const p = new THREE.Mesh(new THREE.PlaneGeometry(0.52, 0.12), plateMat);
    p.position.set(0, y, z);
    p.rotation.y = ry;
    body.add(p);
  }
  // Reversing lamps: two small white squares low on the tail.
  for (const sx of [-1, 1]) {
    const r = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.05, 0.02), reverse);
    r.position.set(sx * 0.5, s.tailY - 0.32, -s.length / 2 + 0.01);
    body.add(r);
  }

  const wheels: RacerRig['wheels'] = [];
  const hw = s.width / 2;
  for (const [wx, wz, front] of [
    [hw - 0.13, s.front, true],
    [-(hw - 0.13), s.front, true],
    [hw - 0.13, s.rear, false],
    [-(hw - 0.13), s.rear, false],
  ] as [number, number, boolean][]) {
    const pivot = new THREE.Group();
    pivot.position.set(wx, s.wheelR, wz);
    const spin = new THREE.Group();
    pivot.add(spin);
    const t = new THREE.Mesh(tyre, mats.tyre);
    t.castShadow = true;
    spin.add(t);
    const r = new THREE.Mesh(rim, mats.rim);
    if (wx < 0) r.rotation.y = Math.PI;
    spin.add(r);
    root.add(pivot);
    wheels.push({ pivot, spin, front });
  }
  return { root, body, wheels, head, tail, reverse, paint, roll: 0, pitch: 0, pitchV: 0, lean: 0, leanV: 0 };
};

// ---------------------------------------------------------------------------
// Parked cars: one InstancedMesh per material per body style.
// ---------------------------------------------------------------------------

export interface ParkedSpot {
  x: number;
  z: number;
  h: number;
  style: number;
  color: number;
}

export const buildParked = (spots: ParkedSpot[]) => {
  const group = new THREE.Group();
  const mats = carMaterials();
  const paint = new THREE.MeshPhysicalMaterial({ color: 0xffffff, metalness: 0.4, roughness: 0.38, clearcoat: 0.8, clearcoatRoughness: 0.1 });
  const head = new THREE.MeshStandardMaterial({ color: 0xc9ced6, emissive: 0x000000, roughness: 0.2, metalness: 0.4 });
  const tail = new THREE.MeshStandardMaterial({ color: 0x8a0d10, emissive: 0x2a0000, roughness: 0.3 });
  const byMat: Record<PartKind, THREE.Material> = { paint, head, tail, ...mats };
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const up = new THREE.Vector3(0, 1, 0);
  const one = new THREE.Vector3(1, 1, 1);
  const color = new THREE.Color();
  for (let style = 0; style < STYLES.length; style++) {
    const mine = spots.filter((s) => s.style === style);
    if (!mine.length) continue;
    const geo = carGeometry(style, true);
    for (const kind of Object.keys(geo) as PartKind[]) {
      const g = geo[kind];
      if (!g) continue;
      const inst = new THREE.InstancedMesh(g, byMat[kind], mine.length);
      inst.castShadow = kind !== 'chrome' && kind !== 'plate';
      inst.receiveShadow = true;
      mine.forEach((s, i) => {
        q.setFromAxisAngle(up, s.h);
        m.compose(new THREE.Vector3(s.x, 0, s.z), q, one);
        inst.setMatrixAt(i, m);
        if (kind === 'paint') inst.setColorAt(i, color.setHex(s.color));
      });
      group.add(inst);
    }
  }
  return group;
};
