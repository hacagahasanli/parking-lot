/**
 * The place: a supermarket car park on a late-autumn afternoon. Asphalt with painted angled bays
 * and one-way arrows, planted islands with trees and lamp posts, kerbs and pavements, the road
 * at the front, and the store with its sign at the back. Built from the same `Lot` the rules use.
 */
import * as THREE from 'three';
import { mergeGeometries, mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

import { BAY, rng } from '../sim/lot';

import type { Lot } from '../sim/lot';

const merge = (list: THREE.BufferGeometry[]) => mergeGeometries(list.map((g) => (g.index ? g.toNonIndexed() : g)))!;

const flat = (w: number, d: number, x: number, z: number, h = 0, y = 0.01) => {
  const g = new THREE.PlaneGeometry(w, d);
  g.rotateX(-Math.PI / 2);
  g.rotateY(h);
  g.translate(x, y, z);
  return g;
};

const block = (w: number, h: number, d: number, x: number, y: number, z: number, ry = 0) => {
  const g = new THREE.BoxGeometry(w, h, d);
  if (ry) g.rotateY(ry);
  g.translate(x, y + h / 2, z);
  return g;
};

// ---------------------------------------------------------------------------
// Textures drawn on canvases
// ---------------------------------------------------------------------------

const canvasTexture = (w: number, h: number, draw: (g: CanvasRenderingContext2D) => void, repeat = 1) => {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  draw(c.getContext('2d')!);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(repeat, repeat);
  t.anisotropy = 8;
  return t;
};

/** Asphalt: fine grain, darker tar patches and sealed cracks. */
const asphaltTexture = (seed: number, base = [62, 64, 68]) =>
  canvasTexture(
    512,
    512,
    (g) => {
      const r = rng(seed);
      const img = g.createImageData(512, 512);
      for (let i = 0; i < 512 * 512; i++) {
        const n = (r() - 0.5) * 26 + (r() < 0.02 ? 30 : 0);
        img.data[i * 4] = base[0] + n;
        img.data[i * 4 + 1] = base[1] + n;
        img.data[i * 4 + 2] = base[2] + n;
        img.data[i * 4 + 3] = 255;
      }
      g.putImageData(img, 0, 0);
      g.globalAlpha = 0.18;
      for (let i = 0; i < 9; i++) {
        g.fillStyle = r() < 0.5 ? '#202124' : '#5c5e62';
        g.beginPath();
        g.ellipse(r() * 512, r() * 512, 20 + r() * 70, 14 + r() * 40, r() * 3, 0, Math.PI * 2);
        g.fill();
      }
      g.globalAlpha = 0.5;
      g.strokeStyle = '#1a1b1d';
      g.lineWidth = 2;
      for (let i = 0; i < 6; i++) {
        let x = r() * 512;
        let y = r() * 512;
        g.beginPath();
        g.moveTo(x, y);
        for (let k = 0; k < 8; k++) {
          x += (r() - 0.5) * 50;
          y += (r() - 0.5) * 50;
          g.lineTo(x, y);
        }
        g.stroke();
      }
    },
    1,
  );

const grassTexture = (seed: number) =>
  canvasTexture(256, 256, (g) => {
    const r = rng(seed);
    g.fillStyle = '#56713a';
    g.fillRect(0, 0, 256, 256);
    for (let i = 0; i < 2600; i++) {
      const v = r();
      g.fillStyle = v < 0.3 ? '#47612f' : v < 0.6 ? '#62803f' : v < 0.95 ? '#6f8c48' : '#9a7a3a';
      g.fillRect(r() * 256, r() * 256, 2, 3 + r() * 3);
    }
  });

const mulchTexture = (seed: number) =>
  canvasTexture(256, 256, (g) => {
    const r = rng(seed);
    g.fillStyle = '#5a3d27';
    g.fillRect(0, 0, 256, 256);
    for (let i = 0; i < 1800; i++) {
      const v = r();
      g.fillStyle = v < 0.4 ? '#4a301d' : v < 0.8 ? '#6d4a2e' : '#7c8a3c';
      g.save();
      g.translate(r() * 256, r() * 256);
      g.rotate(r() * 3);
      g.fillRect(-3, -1, 6 + r() * 4, 2);
      g.restore();
    }
  });

const concreteTexture = (seed: number) =>
  canvasTexture(256, 256, (g) => {
    const r = rng(seed);
    const img = g.createImageData(256, 256);
    for (let i = 0; i < 256 * 256; i++) {
      const n = (r() - 0.5) * 16;
      img.data[i * 4] = 178 + n;
      img.data[i * 4 + 1] = 175 + n;
      img.data[i * 4 + 2] = 168 + n;
      img.data[i * 4 + 3] = 255;
    }
    g.putImageData(img, 0, 0);
    g.strokeStyle = 'rgba(80,80,80,0.35)';
    g.lineWidth = 2;
    g.strokeRect(0, 0, 256, 256);
  });

/** Big painted words on the asphalt, white with wear. */
const paintedWord = (text: string, w: number, h: number) =>
  canvasTexture(
    w,
    h,
    (g) => {
      g.clearRect(0, 0, w, h);
      g.fillStyle = 'rgba(236,236,228,0.92)';
      g.font = `bold ${Math.floor(h * 0.8)}px "Arial Narrow", Arial, sans-serif`;
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.fillText(text, w / 2, h / 2 + h * 0.04);
    },
    1,
  );

// ---------------------------------------------------------------------------
// Trees: trunk plus a few leafy blobs, in late-autumn colours like a real car park in November.
// ---------------------------------------------------------------------------

const LEAVES = [0x4f7a35, 0x5d8a3a, 0x6f8f3d, 0xc8782c, 0xb5452a, 0xd6a13a, 0x3f6b30];

export interface Trees {
  group: THREE.Group;
  update: (t: number) => void;
}

const buildTrees = (spots: { x: number; z: number; s: number }[], seed: number): Trees => {
  const r = rng(seed);
  const group = new THREE.Group();
  const trunkGeo = new THREE.CylinderGeometry(0.11, 0.18, 2.6, 7);
  trunkGeo.translate(0, 1.3, 0);
  const trunk = new THREE.InstancedMesh(trunkGeo, new THREE.MeshStandardMaterial({ color: 0x4a3a2c, roughness: 0.95 }), spots.length);
  trunk.castShadow = true;
  // Lumpy, not a perfect ball. Icosahedron geometry is non-indexed, so jittering per vertex tears
  // the faces apart; weld first (drop uv/normal so shared corners match), then displace by
  // *position* with a smooth function so the crown stays closed.
  const raw = new THREE.IcosahedronGeometry(1, 3);
  raw.deleteAttribute('uv');
  raw.deleteAttribute('normal');
  const blob = mergeVertices(raw);
  const pos = blob.attributes.position;
  const v = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);
    const n =
      Math.sin(v.x * 2.3 + 1.7) * Math.cos(v.z * 2.1 + 0.4) * 0.11 +
      Math.sin(v.y * 3.1 + v.x * 1.3) * 0.07 +
      Math.sin(v.z * 5.3 + v.y * 2.2) * 0.04;
    const k = 1 + n;
    pos.setXYZ(i, v.x * k, v.y * k * (v.y < 0 ? 0.7 : 0.92), v.z * k);
  }
  blob.computeVertexNormals();
  const perTree = 3;
  const crown = new THREE.InstancedMesh(blob, new THREE.MeshStandardMaterial({ roughness: 0.9 }), spots.length * perTree);
  crown.castShadow = true;
  crown.receiveShadow = true;
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const c = new THREE.Color();
  const base: { x: number; z: number; s: number; parts: { dx: number; dy: number; dz: number; s: number }[]; phase: number }[] = [];
  spots.forEach((p, i) => {
    m.compose(new THREE.Vector3(p.x, 0, p.z), q.identity(), new THREE.Vector3(p.s, p.s, p.s));
    trunk.setMatrixAt(i, m);
    const parts = [];
    const tone = LEAVES[Math.floor(r() * LEAVES.length)];
    for (let k = 0; k < perTree; k++) {
      parts.push({ dx: (r() - 0.5) * 1.2, dy: 2.7 + k * 0.75 + r() * 0.3, dz: (r() - 0.5) * 1.2, s: 1.35 - k * 0.22 + r() * 0.2 });
      c.setHex(tone).offsetHSL((r() - 0.5) * 0.04, 0, (r() - 0.5) * 0.08);
      crown.setColorAt(i * perTree + k, c);
    }
    base.push({ ...p, parts, phase: r() * 6 });
  });
  group.add(trunk, crown);
  const update = (t: number) => {
    base.forEach((p, i) => {
      // Wind: the crown sways slowly, each tree on its own phase.
      const sway = Math.sin(t * 0.9 + p.phase) * 0.06 + Math.sin(t * 2.3 + p.phase * 2) * 0.02;
      p.parts.forEach((b, k) => {
        const lift = b.dy * p.s;
        m.compose(
          new THREE.Vector3(p.x + (b.dx + sway * lift * 0.4) * p.s, lift, p.z + (b.dz + sway * lift * 0.2) * p.s),
          q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), p.phase + k),
          new THREE.Vector3(b.s * p.s, b.s * p.s * 0.85, b.s * p.s),
        );
        crown.setMatrixAt(i * perTree + k, m);
      });
    });
    crown.instanceMatrix.needsUpdate = true;
  };
  update(0);
  return { group, update };
};

// ---------------------------------------------------------------------------
// The whole scene
// ---------------------------------------------------------------------------

export interface WorldView {
  group: THREE.Group;
  trees: Trees;
  /** The neon letters on the store, for a flicker. */
  sign: THREE.MeshStandardMaterial;
}

export const buildWorld = (lot: Lot): WorldView => {
  const group = new THREE.Group();
  const { bounds, store } = lot;
  const lotW = bounds.x1 - bounds.x0;
  const lotD = bounds.z1 - bounds.z0;
  const cx = (bounds.x0 + bounds.x1) / 2;
  const cz = (bounds.z0 + bounds.z1) / 2;

  // --- Ground: grass everywhere, the lot's asphalt on top, the road in front.
  const grassTex = grassTexture(3);
  grassTex.repeat.set(60, 60);
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(600, 600), new THREE.MeshStandardMaterial({ map: grassTex, roughness: 1 }));
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = -0.02;
  ground.receiveShadow = true;
  group.add(ground);

  const asphalt = asphaltTexture(11);
  asphalt.repeat.set(lotW / 9, lotD / 9);
  const lotMesh = new THREE.Mesh(new THREE.PlaneGeometry(lotW + 1, lotD + 1), new THREE.MeshStandardMaterial({ map: asphalt, roughness: 0.93 }));
  lotMesh.rotation.x = -Math.PI / 2;
  lotMesh.position.set(cx, 0, cz);
  lotMesh.receiveShadow = true;
  group.add(lotMesh);

  // --- Pavement and kerb all round the lot (raised concrete), the store's front walk wider.
  const concrete = concreteTexture(5);
  concrete.repeat.set(1, 1);
  const kerbMat = new THREE.MeshStandardMaterial({ map: concrete, color: 0xd8d4cc, roughness: 0.9 });
  const walk: THREE.BufferGeometry[] = [];
  walk.push(block(lotW + 8, 0.15, 3, cx, 0, bounds.z0 - 1.5 - 0.5));
  walk.push(block(3, 0.15, lotD + 8, bounds.x0 - 1.5 - 0.5, 0, cz));
  walk.push(block(3, 0.15, lotD + 8, bounds.x1 + 1.5 + 0.5, 0, cz));
  walk.push(block(store.x1 - store.x0 + 30, 0.15, store.z0 - store.kerb + 0.2, (store.x0 + store.x1) / 2, 0, (store.kerb + store.z0) / 2 + 0.4));
  const walkMesh = new THREE.Mesh(merge(walk), kerbMat);
  walkMesh.receiveShadow = true;
  group.add(walkMesh);
  // Red kerb paint along the fire lane.
  const red = new THREE.Mesh(block(store.x1 - store.x0 + 30, 0.152, 0.25, (store.x0 + store.x1) / 2, 0, store.kerb + 0.6), new THREE.MeshStandardMaterial({ color: 0xb02a25, roughness: 0.7 }));
  group.add(red);

  // Road along the front with a dashed centre line.
  const roadTex = asphaltTexture(23, [48, 50, 54]);
  roadTex.repeat.set(30, 2);
  const roadZ = bounds.z0 - 9;
  const road = new THREE.Mesh(new THREE.PlaneGeometry(400, 11), new THREE.MeshStandardMaterial({ map: roadTex, roughness: 0.95 }));
  road.rotation.x = -Math.PI / 2;
  road.position.set(0, 0.005, roadZ);
  road.receiveShadow = true;
  group.add(road);
  const roadLines: THREE.BufferGeometry[] = [];
  for (let x = -200; x < 200; x += 6) roadLines.push(flat(3, 0.15, x, roadZ, 0, 0.012));
  roadLines.push(flat(400, 0.15, 0, roadZ - 5, 0, 0.012), flat(400, 0.15, 0, roadZ + 5, 0, 0.012));
  group.add(new THREE.Mesh(merge(roadLines), new THREE.MeshStandardMaterial({ color: 0xe8d36a, roughness: 0.7 })));
  // Driveway cut through the pavement at the entrance (flush, so it reads as the way in).
  const drive = new THREE.Mesh(new THREE.PlaneGeometry(16, 4.2), new THREE.MeshStandardMaterial({ map: asphalt, roughness: 0.93 }));
  drive.rotation.x = -Math.PI / 2;
  drive.position.set(0, 0.16, bounds.z0 - 2);
  group.add(drive);

  // --- Paint: bay stripes, one-way arrows, start boxes, words.
  const paint = new THREE.MeshStandardMaterial({ color: 0xeeeee6, roughness: 0.65, polygonOffset: true, polygonOffsetFactor: -2 });
  const lines: THREE.BufferGeometry[] = [];
  for (const s of lot.stripes) {
    const len = Math.hypot(s.b.x - s.a.x, s.b.z - s.a.z);
    const h = Math.atan2(s.b.x - s.a.x, s.b.z - s.a.z);
    lines.push(flat(0.12, len, (s.a.x + s.b.x) / 2, (s.a.z + s.b.z) / 2, h, 0.012));
  }
  // One-way arrows down the middle of each aisle.
  const arrow = (x: number, z: number, dir: number) => {
    const shape = new THREE.Shape();
    shape.moveTo(-0.22, -1.6);
    shape.lineTo(0.22, -1.6);
    shape.lineTo(0.22, 0.4);
    shape.lineTo(0.6, 0.4);
    shape.lineTo(0, 1.5);
    shape.lineTo(-0.6, 0.4);
    shape.lineTo(-0.22, 0.4);
    shape.closePath();
    const g = new THREE.ShapeGeometry(shape);
    g.rotateX(-Math.PI / 2);
    // Shape's +y became -z; point it along x by dir.
    g.rotateY(dir > 0 ? -Math.PI / 2 : Math.PI / 2);
    g.translate(x, 0.013, z);
    return g;
  };
  lot.aisles.forEach((a) => {
    if (!a.flow) return;
    for (const x of [-24, 0, 24]) lines.push(arrow(x, a.z, a.flow));
  });
  // Start boxes for the four cars, with the start line.
  for (const s of lot.starts) {
    const w = 2.5;
    const d = 5.4;
    lines.push(flat(0.12, d, s.x - w / 2, s.z, 0, 0.012), flat(0.12, d, s.x + w / 2, s.z, 0, 0.012), flat(w + 0.12, 0.12, s.x, s.z - d / 2, 0, 0.012));
  }
  lines.push(flat(16, 0.35, 0, lot.startLine, 0, 0.012));
  const paintMesh = new THREE.Mesh(merge(lines), paint);
  paintMesh.receiveShadow = true;
  group.add(paintMesh);
  const words: [string, number, number, number, number][] = [
    ['ENTER', 0, lot.startLine + 3, 0, 4.5],
    ['FIRE LANE', 0, store.kerb - 2, Math.PI, 6],
  ];
  for (const [text, x, z, h, w] of words) {
    const tex = paintedWord(text, 512, 128);
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, w / 4), new THREE.MeshStandardMaterial({ map: tex, transparent: true, roughness: 0.7, polygonOffset: true, polygonOffsetFactor: -3 }));
    m.rotation.set(-Math.PI / 2, 0, h);
    m.position.set(x, 0.014, z);
    group.add(m);
  }

  // --- Islands: concrete kerb, mulch and ground cover on top, planted bulbs at the ends.
  const mulch = mulchTexture(9);
  mulch.repeat.set(12, 1);
  const islandKerb: THREE.BufferGeometry[] = [];
  const islandTop: THREE.BufferGeometry[] = [];
  const treeSpots: { x: number; z: number; s: number }[] = [];
  const r = rng(31);
  for (const isl of lot.islands) {
    const w = isl.x1 - isl.x0;
    const d = isl.z1 - isl.z0;
    const mz = (isl.z0 + isl.z1) / 2;
    islandKerb.push(block(w, 0.16, d, (isl.x0 + isl.x1) / 2, 0, mz));
    islandTop.push(flat(w - 0.3, d - 0.3, (isl.x0 + isl.x1) / 2, mz, 0, 0.17));
    for (const ex of [isl.x0 - 0.3, isl.x1 + 0.3]) {
      const bulb = new THREE.CylinderGeometry(2.1, 2.1, 0.16, 28);
      bulb.translate(ex, 0.08, mz);
      islandKerb.push(bulb);
      const top = new THREE.CircleGeometry(1.9, 28);
      top.rotateX(-Math.PI / 2);
      top.translate(ex, 0.17, mz);
      islandTop.push(top);
      treeSpots.push({ x: ex, z: mz, s: 1.15 + r() * 0.2 });
    }
    for (let x = isl.x0 + 9.5; x < isl.x1 - 4; x += 16.5) treeSpots.push({ x, z: mz, s: 0.75 + r() * 0.2 });
  }
  const kerbMesh = new THREE.Mesh(merge(islandKerb), kerbMat);
  kerbMesh.castShadow = true;
  kerbMesh.receiveShadow = true;
  group.add(kerbMesh);
  const topMesh = new THREE.Mesh(merge(islandTop), new THREE.MeshStandardMaterial({ map: mulch, roughness: 1 }));
  topMesh.receiveShadow = true;
  group.add(topMesh);

  // Low shrubs along the islands.
  const shrubGeo = new THREE.IcosahedronGeometry(0.45, 0);
  const shrubs: THREE.Matrix4[] = [];
  for (const isl of lot.islands) {
    const mz = (isl.z0 + isl.z1) / 2;
    for (let x = isl.x0 + 1.5; x < isl.x1 - 1; x += 2.2 + r() * 1.5) {
      if (r() < 0.35) continue;
      const s = 0.6 + r() * 0.5;
      shrubs.push(new THREE.Matrix4().compose(new THREE.Vector3(x, 0.25, mz + (r() - 0.5) * 0.6), new THREE.Quaternion(), new THREE.Vector3(s, s * 0.7, s)));
    }
  }
  const shrubMesh = new THREE.InstancedMesh(shrubGeo, new THREE.MeshStandardMaterial({ color: 0x3f6232, roughness: 0.9, flatShading: true }), shrubs.length);
  shrubs.forEach((m, i) => shrubMesh.setMatrixAt(i, m));
  shrubMesh.castShadow = true;
  group.add(shrubMesh);

  // --- Lamp posts: tall poles with two heads, one over each half row.
  const pole = new THREE.MeshStandardMaterial({ color: 0x3b3f45, roughness: 0.5, metalness: 0.6 });
  const lampParts: THREE.BufferGeometry[] = [];
  const lampGlow: THREE.BufferGeometry[] = [];
  for (const l of lot.lamps) {
    const p = new THREE.CylinderGeometry(0.08, 0.12, 8, 8);
    p.translate(l.x, 4.15, l.z);
    lampParts.push(p, block(0.5, 0.25, 0.5, l.x, 0.15, l.z));
    for (const side of [-1, 1]) {
      lampParts.push(block(0.08, 0.08, 1.4, l.x, 8, l.z + side * 0.7));
      lampParts.push(block(0.55, 0.16, 0.9, l.x, 7.92, l.z + side * 1.45));
      lampGlow.push(flat(0.45, 0.75, l.x, l.z + side * 1.45, 0, 7.83));
    }
  }
  const lampMesh = new THREE.Mesh(merge(lampParts), pole);
  lampMesh.castShadow = true;
  group.add(lampMesh);
  group.add(new THREE.Mesh(merge(lampGlow), new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xfff2d0, emissiveIntensity: 0.6, side: THREE.DoubleSide })));

  // --- Hedges and trees round the outside of the lot.
  const hedge: THREE.BufferGeometry[] = [];
  for (const x of [bounds.x0 - 5.5, bounds.x1 + 5.5]) hedge.push(block(1.4, 1.1, lotD - 2, x, 0, cz));
  hedge.push(block(lotW / 2 - 12, 1.1, 1.4, bounds.x0 + (lotW / 2 - 12) / 2 - 2, 0, bounds.z0 - 4.6));
  hedge.push(block(lotW / 2 - 12, 1.1, 1.4, bounds.x1 - (lotW / 2 - 12) / 2 + 2, 0, bounds.z0 - 4.6));
  const hedgeMesh = new THREE.Mesh(merge(hedge), new THREE.MeshStandardMaterial({ color: 0x3d5e2e, roughness: 0.95 }));
  hedgeMesh.castShadow = true;
  hedgeMesh.receiveShadow = true;
  group.add(hedgeMesh);
  for (let z = bounds.z0 + 2; z < bounds.z1 + 6; z += 9 + r() * 3) {
    treeSpots.push({ x: bounds.x0 - 9 - r() * 4, z, s: 1.1 + r() * 0.5 });
    treeSpots.push({ x: bounds.x1 + 9 + r() * 4, z: z + 4, s: 1.1 + r() * 0.5 });
  }
  for (let x = -70; x < 70; x += 10 + r() * 4) {
    if (Math.abs(x) < 10) continue;
    treeSpots.push({ x, z: bounds.z0 - 5.8 - r(), s: 0.9 + r() * 0.4 });
  }
  // A few beyond the road and behind the store, for depth.
  for (let i = 0; i < 40; i++) {
    const x = -140 + r() * 280;
    const z = bounds.z0 - 22 - r() * 50;
    treeSpots.push({ x, z, s: 1.2 + r() * 0.8 });
  }
  for (let i = 0; i < 30; i++) treeSpots.push({ x: -120 + r() * 240, z: store.z1 + 8 + r() * 40, s: 1.3 + r() * 0.8 });
  const trees = buildTrees(treeSpots, 77);
  group.add(trees.group);

  // --- The store.
  const sign = buildStore(group, store);

  // --- Buildings across the road (simple blocks with window bands) so the world doesn't end.
  const far = new THREE.MeshStandardMaterial({ color: 0xa9a196, roughness: 0.9 });
  const farParts: THREE.BufferGeometry[] = [];
  const bands: THREE.BufferGeometry[] = [];
  const roofs: THREE.BufferGeometry[] = [];
  for (let i = 0; i < 9; i++) {
    const w = 14 + r() * 18;
    const h = 6 + r() * 10;
    const x = -130 + i * 32 + r() * 6;
    const z = bounds.z0 - 48 - r() * 12;
    farParts.push(block(w, h, 12, x, 0, z));
    // Window bands on the face towards the lot, one per floor, and a roof slab with a parapet.
    for (let y = 1.6; y + 2.2 < h; y += 3.2) bands.push(block(w - 2.4, 1.5, 0.12, x, y, z + 6.04));
    roofs.push(block(w + 0.6, 0.5, 12.6, x, h, z));
  }
  const farMesh = new THREE.Mesh(merge(farParts), far);
  farMesh.receiveShadow = true;
  group.add(farMesh);
  group.add(new THREE.Mesh(merge(bands), new THREE.MeshStandardMaterial({ color: 0x35424d, roughness: 0.2, metalness: 0.4 })));
  group.add(new THREE.Mesh(merge(roofs), new THREE.MeshStandardMaterial({ color: 0x6d6a66, roughness: 0.9 })));

  // Light poles along the road, bollards at the entrance.
  const bollards: THREE.BufferGeometry[] = [];
  for (const x of [-8.5, -7, 7, 8.5]) {
    const b = new THREE.CylinderGeometry(0.11, 0.11, 0.9, 10);
    b.translate(x, 0.45, bounds.z0 - 1);
    bollards.push(b);
  }
  group.add(new THREE.Mesh(merge(bollards), new THREE.MeshStandardMaterial({ color: 0xe0b72e, roughness: 0.5 })));

  return { group, trees, sign };
};

/** The supermarket: stucco box, a glass front under a canopy, the lit sign, trolleys by the door. */
const buildStore = (group: THREE.Group, store: { x0: number; x1: number; z0: number; z1: number }) => {
  const w = store.x1 - store.x0;
  const d = store.z1 - store.z0;
  const cx = (store.x0 + store.x1) / 2;
  const front = store.z0;
  const h = 8.5;

  const wall = new THREE.MeshStandardMaterial({ color: 0xd9cdb8, roughness: 0.92 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x2c3036, roughness: 0.6, metalness: 0.3 });
  const accent = new THREE.MeshStandardMaterial({ color: 0x1f6f4a, roughness: 0.7 });
  const glass = new THREE.MeshPhysicalMaterial({ color: 0x1d2a33, roughness: 0.05, metalness: 0.2, clearcoat: 1, envMapIntensity: 1.4 });

  const body = new THREE.Mesh(block(w, h, d, cx, 0, front + d / 2), wall);
  body.castShadow = true;
  body.receiveShadow = true;
  group.add(body);
  // Parapet band and a green accent stripe across the top of the front.
  const band = new THREE.Mesh(block(w + 0.4, 1.4, 0.5, cx, h - 0.4, front - 0.1), accent);
  band.castShadow = true;
  group.add(band);
  // Glass shopfront along most of the front, with mullions.
  const gw = w * 0.7;
  const shop = new THREE.Mesh(block(gw, 3.6, 0.2, cx, 0.15, front - 0.05), glass);
  group.add(shop);
  const mull: THREE.BufferGeometry[] = [];
  for (let x = cx - gw / 2; x <= cx + gw / 2 + 0.01; x += 2.4) mull.push(block(0.12, 3.6, 0.3, x, 0.15, front - 0.12));
  mull.push(block(gw, 0.14, 0.3, cx, 3.7, front - 0.12));
  group.add(new THREE.Mesh(merge(mull), dark));
  // Canopy over the entrance on two columns, with a soft light underneath.
  const canopy = new THREE.Mesh(block(14, 0.45, 4.2, cx, 4.3, front - 2.1), dark);
  canopy.castShadow = true;
  group.add(canopy);
  for (const sx of [-1, 1]) {
    const col = new THREE.Mesh(block(0.35, 4.3, 0.35, cx + sx * 6.5, 0, front - 3.9), dark);
    col.castShadow = true;
    group.add(col);
  }
  const under = new THREE.Mesh(new THREE.PlaneGeometry(13.5, 3.8), new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xfff1d6, emissiveIntensity: 0.5 }));
  under.rotation.x = Math.PI / 2;
  under.position.set(cx, 4.29, front - 2.1);
  group.add(under);
  // Sliding doors (a slightly lighter pane).
  group.add(new THREE.Mesh(block(4, 2.6, 0.1, cx, 0.15, front - 0.18), new THREE.MeshPhysicalMaterial({ color: 0x5f7b88, roughness: 0.05, transmission: 0, clearcoat: 1 })));

  // The sign: big letters on the green band above the canopy, lit.
  const c = document.createElement('canvas');
  c.width = 1024;
  c.height = 160;
  const g = c.getContext('2d')!;
  g.clearRect(0, 0, 1024, 160);
  g.font = 'bold 120px "Arial Black", Arial, sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillStyle = '#fff7e0';
  g.fillText('MERGE MART', 512, 86);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const signMat = new THREE.MeshStandardMaterial({ map: tex, transparent: true, emissive: 0xfff2c8, emissiveMap: tex, emissiveIntensity: 1.3 });
  const signMesh = new THREE.Mesh(new THREE.PlaneGeometry(18, 2.8), signMat);
  signMesh.position.set(cx, 5.9, front - 0.12);
  signMesh.rotation.y = Math.PI;
  group.add(signMesh);
  // Small "OPEN 24/7" plate and a cart icon panel.
  const c2 = document.createElement('canvas');
  c2.width = 256;
  c2.height = 64;
  const g2 = c2.getContext('2d')!;
  g2.fillStyle = '#c8312b';
  g2.fillRect(0, 0, 256, 64);
  g2.fillStyle = '#fff';
  g2.font = 'bold 40px Arial, sans-serif';
  g2.textAlign = 'center';
  g2.textBaseline = 'middle';
  g2.fillText('OPEN 24/7', 128, 34);
  const t2 = new THREE.CanvasTexture(c2);
  t2.colorSpace = THREE.SRGBColorSpace;
  const open = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 0.6), new THREE.MeshStandardMaterial({ map: t2, emissive: 0xffffff, emissiveMap: t2, emissiveIntensity: 0.5 }));
  open.position.set(cx + 9, 3.0, front - 0.17);
  open.rotation.y = Math.PI;
  group.add(open);

  // Roof clutter: air handling units.
  const roof: THREE.BufferGeometry[] = [];
  for (const [x, z] of [
    [-14, 8],
    [-4, 14],
    [9, 9],
    [18, 18],
  ]) {
    roof.push(block(3.2, 1.4, 2.2, cx + x, h, front + z));
  }
  const roofMesh = new THREE.Mesh(merge(roof), new THREE.MeshStandardMaterial({ color: 0x9aa0a6, roughness: 0.6, metalness: 0.4 }));
  roofMesh.castShadow = true;
  group.add(roofMesh);

  // Trolleys lined up by the door, benches and bins along the front.
  const metal = new THREE.MeshStandardMaterial({ color: 0xb8bdc4, roughness: 0.35, metalness: 0.85 });
  const carts: THREE.BufferGeometry[] = [];
  for (let i = 0; i < 9; i++) {
    const x = cx - 13 + i * 0.32;
    carts.push(block(0.55, 0.5, 0.9, x, 0.55, front - 1.4), block(0.04, 0.6, 0.04, x, 0.15, front - 1.0));
  }
  group.add(new THREE.Mesh(merge(carts), metal));
  const furniture: THREE.BufferGeometry[] = [];
  for (const x of [cx + 12, cx - 18, cx + 20]) furniture.push(block(1.8, 0.45, 0.5, x, 0.15, front - 1.2));
  for (const x of [cx + 8, cx - 9]) {
    const bin = new THREE.CylinderGeometry(0.3, 0.3, 0.9, 12);
    bin.translate(x, 0.6, front - 1.0);
    furniture.push(bin);
  }
  group.add(new THREE.Mesh(merge(furniture), dark));
  return signMat;
};

/** The free bay's glowing outline, a pulsing P above it and a column of light visible across the lot. */
export const buildTargetMarker = () => {
  const group = new THREE.Group();
  const w = BAY.width;
  const d = BAY.depth;
  const t = 0.16;
  const lineMat = new THREE.MeshBasicMaterial({ color: 0x3ddc84, transparent: true, opacity: 0.95, depthWrite: false });
  const outline = merge([flat(t, d, -w / 2, 0, 0, 0.02), flat(t, d, w / 2, 0, 0, 0.02), flat(w + t, t, 0, d / 2, 0, 0.02), flat(w + t, t, 0, -d / 2, 0, 0.02)]);
  group.add(new THREE.Mesh(outline, lineMat));
  const fillMat = new THREE.MeshBasicMaterial({ color: 0x3ddc84, transparent: true, opacity: 0.16, depthWrite: false });
  group.add(new THREE.Mesh(flat(w, d, 0, 0, 0, 0.018), fillMat));

  // Beam: a tall soft column, additive so it glows without hiding what's behind.
  const beamGeo = new THREE.CylinderGeometry(1.1, 1.3, 26, 24, 1, true);
  beamGeo.translate(0, 13, 0);
  const beamMat = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
    uniforms: { uColor: { value: new THREE.Color(0x3ddc84) }, uTime: { value: 0 } },
    vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
    fragmentShader:
      'uniform vec3 uColor; uniform float uTime; varying vec2 vUv; void main(){ float a = (1.0 - vUv.y) * 0.32 * (0.8 + 0.2*sin(uTime*3.0 + vUv.y*12.0)); gl_FragColor = vec4(uColor * a, a); }',
  });
  const beam = new THREE.Mesh(beamGeo, beamMat);
  group.add(beam);

  // The P: a round sign that faces the camera.
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 256;
  const g = c.getContext('2d')!;
  g.fillStyle = '#1f6fd6';
  g.beginPath();
  g.roundRect(18, 18, 220, 220, 36);
  g.fill();
  g.strokeStyle = '#ffffff';
  g.lineWidth = 12;
  g.stroke();
  g.fillStyle = '#ffffff';
  g.font = 'bold 170px Arial, sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText('P', 128, 140);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const sign = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false, transparent: true }));
  sign.scale.set(1.6, 1.6, 1);
  sign.position.y = 3.4;
  sign.renderOrder = 10;
  group.add(sign);
  return { group, lineMat, fillMat, beamMat, sign };
};
