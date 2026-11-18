/**
 * The place: the big-box retail park on a late-autumn afternoon. Asphalt with painted bays (angled,
 * 90 degree and parallel), one-way arrows, planted islands, hedges, a solar carport over the EV
 * row, the entry and exit gates, a delivery yard, road signs and zebra crossings, kerbs and
 * pavements, the street at the front, and two shops with their signs at the back. Built from the
 * same `Lot` the rules use.
 */
import * as THREE from 'three';
import { mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

import { BAY, rng } from '../sim/lot';

import { block, canvasTexture, flat, merge, scaleUV } from './geo';
import { buildGarage } from './garage';
import { animateGates, buildBayPaint, buildCanopy, buildChargers, buildGantry, buildGates, buildMarkings, buildSigns, buildTruck, buildYardProps } from './scenery';

import type { GarageView } from './garage';
import type { GateViews } from './scenery';
import type { BoardRow } from './board';
import type { Lot, Shop } from '../sim/lot';

// ---------------------------------------------------------------------------
// Textures drawn on canvases
// ---------------------------------------------------------------------------

/** Asphalt: fine grain, darker tar patches and sealed cracks. */
const asphaltTexture = (seed: number, base = [50, 51, 56]) =>
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
    g.fillStyle = '#4a8a2c';
    g.fillRect(0, 0, 256, 256);
    for (let i = 0; i < 2600; i++) {
      const v = r();
      g.fillStyle = v < 0.3 ? '#3b7a22' : v < 0.6 ? '#58a034' : v < 0.95 ? '#68b03e' : '#c8a63a';
      g.fillRect(r() * 256, r() * 256, 2, 3 + r() * 3);
    }
  });

/** Clipped hedge: dark green with leafy flecks. */
const hedgeTexture = (seed: number) =>
  canvasTexture(128, 128, (g) => {
    const r = rng(seed);
    g.fillStyle = '#25601e';
    g.fillRect(0, 0, 128, 128);
    for (let i = 0; i < 900; i++) {
      const v = r();
      g.fillStyle = v < 0.35 ? '#1d4d18' : v < 0.7 ? '#2f7a26' : v < 0.95 ? '#3f9a32' : '#8cc03c';
      g.beginPath();
      g.ellipse(r() * 128, r() * 128, 2 + r() * 3, 1.5 + r() * 2, r() * 3, 0, Math.PI * 2);
      g.fill();
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

const LEAVES = [0x3f9a30, 0x58b13a, 0x7bbf3a, 0xe0801f, 0xd0402a, 0xf0b52a, 0x2f8a3a];

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
  /** The neon letters on the shops, for a flicker. */
  signs: THREE.MeshStandardMaterial[];
  gates: GateViews;
  /** The multi-storey car park, and the board over the entry gate (call `setBoard` with its rows). */
  garage: GarageView;
  setGantryBoard: (rows: BoardRow[]) => void;
  /** Lifts the barriers: entry by the sim's gate (0..1), exit by how close the pulling-out car is. */
  setGates: (entryOpen: number, exitOpen: number) => void;
}

export const buildWorld = (lot: Lot): WorldView => {
  const group = new THREE.Group();
  const { bounds } = lot;
  const lotW = bounds.x1 - bounds.x0;
  const lotD = bounds.z1 - bounds.z0;
  const cx = (bounds.x0 + bounds.x1) / 2;
  const cz = (bounds.z0 + bounds.z1) / 2;
  const nodes = lot.graph.nodes;

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

  // The roads (main road, avenue, side roads, entry and exit lanes) are newer, darker tarmac than the old parking aisles.
  const roadGeos: THREE.BufferGeometry[] = [];
  for (const a of lot.aisles) {
    if (a.kind === 'aisle' || a.garage) continue;
    for (let i = 0; i < a.nodes.length - 1; i++) {
      const p = nodes[a.nodes[i]];
      const q = nodes[a.nodes[i + 1]];
      const horizontal = Math.abs(q.z - p.z) < 0.01;
      const len = Math.hypot(q.x - p.x, q.z - p.z);
      const g = horizontal ? flat(len, a.width, (p.x + q.x) / 2, p.z, 0, 0.004) : flat(a.width, len, p.x, (p.z + q.z) / 2, 0, 0.004);
      roadGeos.push(scaleUV(g, horizontal ? len / 9 : a.width / 9, horizontal ? a.width / 9 : len / 9));
    }
  }
  const roadTex2 = asphaltTexture(41, [38, 39, 45]);
  const roadMesh = new THREE.Mesh(merge(roadGeos), new THREE.MeshStandardMaterial({ map: roadTex2, roughness: 0.9 }));
  roadMesh.receiveShadow = true;
  group.add(roadMesh);

  // --- Pavement and kerb all round the lot (raised concrete), the shops' front walk wider.
  const concrete = concreteTexture(5);
  concrete.repeat.set(1, 1);
  const kerbMat = new THREE.MeshStandardMaterial({ map: concrete, color: 0xd8d4cc, roughness: 0.9 });
  const walk: THREE.BufferGeometry[] = [];
  walk.push(block(lotW + 8, 0.15, 3, cx, 0, bounds.z0 - 1.5 - 0.5));
  walk.push(block(3, 0.15, lotD + 8, bounds.x0 - 1.5 - 0.5, 0, cz));
  walk.push(block(3, 0.15, lotD + 8, bounds.x1 + 1.5 + 0.5, 0, cz));
  walk.push(block(lotW + 8, 0.15, lot.shops[0].z0 - bounds.z1 + 0.2, cx, 0, (bounds.z1 + lot.shops[0].z0) / 2 + 0.4));
  const walkMesh = new THREE.Mesh(merge(walk), kerbMat);
  walkMesh.receiveShadow = true;
  group.add(walkMesh);
  // Red kerb paint along the fire lane.
  const red = new THREE.Mesh(block(lotW + 8, 0.152, 0.25, cx, 0, bounds.z1 + 0.6), new THREE.MeshStandardMaterial({ color: 0xb02a25, roughness: 0.7 }));
  group.add(red);

  // The street along the front, with a dashed centre line, and the entry and exit roads cut through the pavement (flush, so they read as the way in and out).
  const roadTex = asphaltTexture(23, [36, 37, 42]);
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
  group.add(new THREE.Mesh(merge(roadLines), new THREE.MeshStandardMaterial({ color: 0xf5c71a, roughness: 0.7 })));
  for (const [x, w] of [
    [0, 11.4],
    [58, 4.8],
  ] as const) {
    const drive = new THREE.Mesh(scaleUV(new THREE.PlaneGeometry(w, 3.2), w / 9, 3.2 / 9), new THREE.MeshStandardMaterial({ map: roadTex2, roughness: 0.93 }));
    drive.rotation.x = -Math.PI / 2;
    drive.position.set(x, 0.16, bounds.z0 - 2);
    group.add(drive);
  }

  // The road into the car park crosses the east pavement flush, like the entry and exit lanes.
  {
    const gz = lot.garage.entrance.z;
    const gate = new THREE.Mesh(scaleUV(new THREE.PlaneGeometry(10, 8), 10 / 9, 8 / 9), new THREE.MeshStandardMaterial({ map: roadTex2, roughness: 0.93 }));
    gate.rotation.x = -Math.PI / 2;
    gate.position.set(bounds.x1 + 3, 0.16, gz);
    gate.receiveShadow = true;
    group.add(gate);
  }

  // --- Paint: bay stripes, one-way arrows, centre lines, words.
  const paint = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.65, polygonOffset: true, polygonOffsetFactor: -2 });
  const lines: THREE.BufferGeometry[] = [];
  for (const s of lot.stripes) {
    if (s.lvl !== undefined) continue;
    const len = Math.hypot(s.b.x - s.a.x, s.b.z - s.a.z);
    const h = Math.atan2(s.b.x - s.a.x, s.b.z - s.a.z);
    lines.push(flat(0.12, len, (s.a.x + s.b.x) / 2, (s.a.z + s.b.z) / 2, h, 0.012));
  }
  const arrow = (x: number, z: number, ux: number, uz: number) => {
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
    // After that the arrow points to -z (heading pi); turn it to the lane's heading.
    g.rotateY(Math.atan2(ux, uz) - Math.PI);
    g.translate(x, 0.013, z);
    return g;
  };
  const dashes: THREE.BufferGeometry[] = [];
  for (const e of lot.graph.edges) {
    const aisle = lot.aisles[e.aisle];
    if (aisle.kind === 'entry' || aisle.kind === 'exit' || aisle.kind === 'pocket' || aisle.garage) continue;
    const mx = (e.a.x + e.b.x) / 2;
    const mz = (e.a.z + e.b.z) / 2;
    if (aisle.oneWay) {
      // Arrows every 24 m along the lane, a pair of lane-edge dots nowhere.
      for (let t = 12; t < e.len - 6; t += 24) lines.push(arrow(e.a.x + e.ux * t, e.a.z + e.uz * t, e.ux, e.uz));
    } else if (e.dir === 1) {
      // The dashed centre line of a two-way road, drawn once per aisle segment.
      const L = Math.hypot(e.b.x - e.a.x, e.b.z - e.a.z);
      const cxs = e.a.x + e.uz * 2;
      const czs = e.a.z - e.ux * 2;
      void mx;
      void mz;
      for (let t = 2; t < L - 2; t += 6) dashes.push(flat(0.14, 3, cxs + e.ux * t, czs + e.uz * t, Math.atan2(e.ux, e.uz), 0.012));
    }
  }
  // At the entry: a stop line at each barrier and the edges of the lanes.
  for (const g of lot.gates) if (g.kind === 'entry') lines.push(flat(Math.abs(g.tx - g.px), 0.3, (g.px + g.tx) / 2, g.z - 0.9, 0, 0.012));
  const paintMesh = new THREE.Mesh(merge(lines), paint);
  paintMesh.receiveShadow = true;
  group.add(paintMesh);
  if (dashes.length) {
    const d = new THREE.Mesh(merge(dashes), new THREE.MeshStandardMaterial({ color: 0xf5c71a, roughness: 0.65, polygonOffset: true, polygonOffsetFactor: -2 }));
    d.receiveShadow = true;
    group.add(d);
  }
  for (const w of lot.words) {
    const tex = paintedWord(w.text, 512, 128);
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w.w, w.w / 4), new THREE.MeshStandardMaterial({ map: tex, transparent: true, roughness: 0.7, polygonOffset: true, polygonOffsetFactor: -3 }));
    m.rotation.set(-Math.PI / 2, 0, w.h);
    m.position.set(w.x, 0.014, w.z);
    group.add(m);
  }
  group.add(buildBayPaint(lot));
  group.add(buildMarkings(lot));

  // --- Islands: concrete kerb, planting on top; hedge strips; lawns; planted bulbs at the row ends.
  const mulch = mulchTexture(9);
  mulch.repeat.set(1, 1);
  const grass = grassTexture(17);
  const hedgeMat = new THREE.MeshStandardMaterial({ map: hedgeTexture(5), roughness: 0.95 });
  const islandKerb: THREE.BufferGeometry[] = [];
  const mulchTop: THREE.BufferGeometry[] = [];
  const grassTop: THREE.BufferGeometry[] = [];
  const hedges: THREE.BufferGeometry[] = [];
  const treeSpots: { x: number; z: number; s: number }[] = [];
  const shrubSpots: { x: number; z: number }[] = [];
  const r = rng(31);
  for (const isl of lot.islands) {
    const w = isl.x1 - isl.x0;
    const d = isl.z1 - isl.z0;
    const mx = (isl.x0 + isl.x1) / 2;
    const mz = (isl.z0 + isl.z1) / 2;
    if (isl.kind === 'planter') {
      islandKerb.push(block(w, 0.16, d, mx, 0, mz));
      mulchTop.push(scaleUV(flat(w - 0.3, d - 0.3, mx, mz, 0, 0.17), w / 6, 1));
      for (const ex of [isl.x0 - 0.3, isl.x1 + 0.3]) {
        const bulb = new THREE.CylinderGeometry(2.1, 2.1, 0.16, 28);
        bulb.translate(ex, 0.08, mz);
        islandKerb.push(bulb);
        const top = new THREE.CircleGeometry(1.9, 28);
        top.rotateX(-Math.PI / 2);
        top.translate(ex, 0.17, mz);
        mulchTop.push(top);
        treeSpots.push({ x: ex, z: mz, s: 1.15 + r() * 0.2 });
      }
      for (let x = isl.x0 + 9.5; x < isl.x1 - 4; x += 16.5) treeSpots.push({ x, z: mz, s: 0.75 + r() * 0.2 });
      for (let x = isl.x0 + 1.5; x < isl.x1 - 1; x += 2.2 + r() * 1.5) if (r() > 0.35) shrubSpots.push({ x, z: mz + (r() - 0.5) * 0.6 });
    } else if (isl.kind === 'hedge') {
      islandKerb.push(block(w, 0.16, d, mx, 0, mz));
      hedges.push(scaleUV(block(w - 0.1, 1.6, d - 0.2, mx, 0.16, mz), w / 1.6, 1));
      for (let x = isl.x0 + 7; x < isl.x1 - 2; x += 13 + r() * 3) treeSpots.push({ x, z: mz, s: 0.9 + r() * 0.25 });
    } else if (isl.kind === 'lawn') {
      islandKerb.push(block(w, 0.16, d, mx, 0, mz));
      grassTop.push(scaleUV(flat(w - 0.4, d - 0.4, mx, mz, 0, 0.17), w / 4, d / 4));
      if (isl.z0 === bounds.z0 && isl.x0 > -60) hedges.push(scaleUV(block(w - 0.4, 1.5, 1.0, mx, 0.16, isl.z1 - 0.8), w / 1.6, 1));
      // Trees on a loose grid, kept away from the edges.
      if (Math.min(w, d) > 4) for (let x = isl.x0 + 5; x < isl.x1 - 3; x += 9 + r() * 4) for (let z = isl.z0 + 5; z < isl.z1 - 3; z += 9 + r() * 4) treeSpots.push({ x, z, s: 1 + r() * 0.5 });
    } else {
      // Carport strip and charger strip: low concrete.
      islandKerb.push(block(w, 0.2, d, mx, 0, mz));
    }
  }
  const kerbMesh = new THREE.Mesh(merge(islandKerb), kerbMat);
  kerbMesh.castShadow = true;
  kerbMesh.receiveShadow = true;
  group.add(kerbMesh);
  const topMesh = new THREE.Mesh(merge(mulchTop), new THREE.MeshStandardMaterial({ map: mulch, roughness: 1 }));
  topMesh.receiveShadow = true;
  group.add(topMesh);
  const lawnMesh = new THREE.Mesh(merge(grassTop), new THREE.MeshStandardMaterial({ map: grass, roughness: 1 }));
  lawnMesh.receiveShadow = true;
  group.add(lawnMesh);
  const hedgeMesh = new THREE.Mesh(merge(hedges), hedgeMat);
  hedgeMesh.castShadow = true;
  hedgeMesh.receiveShadow = true;
  group.add(hedgeMesh);

  // Low shrubs along the planters.
  const shrubGeo = new THREE.IcosahedronGeometry(0.45, 0);
  const shrubMesh = new THREE.InstancedMesh(shrubGeo, new THREE.MeshStandardMaterial({ color: 0x2f8a2e, roughness: 0.9, flatShading: true }), shrubSpots.length);
  shrubSpots.forEach((p, i) => {
    const s = 0.6 + r() * 0.5;
    shrubMesh.setMatrixAt(i, new THREE.Matrix4().compose(new THREE.Vector3(p.x, 0.25, p.z), new THREE.Quaternion(), new THREE.Vector3(s, s * 0.7, s)));
  });
  shrubMesh.castShadow = true;
  group.add(shrubMesh);

  // --- Lamp posts: tall poles with two heads, one over each side.
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
  hedge.push(block(1.4, 1.1, lotD - 2, bounds.x0 - 5.5, 0, cz));
  // (the east side has the car park: no hedge there)
  hedge.push(block(52, 1.1, 1.4, -34, 0, bounds.z0 - 2));
  hedge.push(block(34, 1.1, 1.4, 25, 0, bounds.z0 - 2));
  const outerHedge = new THREE.Mesh(merge(hedge.map((g) => scaleUV(g, 20, 1))), hedgeMat);
  outerHedge.castShadow = true;
  outerHedge.receiveShadow = true;
  group.add(outerHedge);
  for (let z = bounds.z0 + 2; z < bounds.z1 + 6; z += 9 + r() * 3) {
    treeSpots.push({ x: bounds.x0 - 9 - r() * 4, z, s: 1.1 + r() * 0.5 });
    {
      const t = { x: bounds.x1 + 9 + r() * 4, z: z + 4, s: 1.1 + r() * 0.5 };
      if (!(t.x > lot.garage.x0 - 4 && t.z > lot.garage.z0 - 6 && t.z < lot.garage.z1 + 6)) treeSpots.push(t);
    }
  }
  for (let x = -90; x < 90; x += 10 + r() * 4) {
    if (Math.abs(x) < 10 || Math.abs(x - 58) < 6) continue;
    treeSpots.push({ x, z: bounds.z0 - 5.8 - r(), s: 0.9 + r() * 0.4 });
  }
  for (let i = 0; i < 40; i++) treeSpots.push({ x: -150 + r() * 300, z: bounds.z0 - 22 - r() * 50, s: 1.2 + r() * 0.8 });
  for (let i = 0; i < 30; i++) treeSpots.push({ x: -130 + r() * 260, z: lot.shops[0].z1 + 8 + r() * 40, s: 1.3 + r() * 0.8 });
  const trees = buildTrees(treeSpots, 77);
  group.add(trees.group);

  // --- The shops.
  const signs = lot.shops.map((shop, i) => buildStore(group, shop, i));

  // --- The gates, the carport, chargers, the truck, the yard and the signs.
  const gates = buildGates(lot);
  group.add(gates.group);
  for (const c of lot.canopies) group.add(buildCanopy(c, lot.posts));
  group.add(buildChargers(lot.props));
  for (const p of lot.props) if (p.kind === 'truck') group.add(buildTruck(p));
  group.add(buildYardProps(lot));
  group.add(buildSigns(lot.signs));
  const garage = buildGarage(lot);
  group.add(garage.group);
  const gantry = buildGantry(lot);
  group.add(gantry.group);

  // --- Buildings across the road (simple blocks with window bands) so the world doesn't end.
  const far = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9 });
  const farParts: THREE.BufferGeometry[] = [];
  const bands: THREE.BufferGeometry[] = [];
  const roofs: THREE.BufferGeometry[] = [];
  const FAR = [0xd9a05b, 0x6fa6c9, 0xd9694f, 0x7fb58a, 0xe0c35a, 0xb48ad0, 0xe8d8b8];
  for (let i = 0; i < 12; i++) {
    const w = 14 + r() * 18;
    const h = 6 + r() * 10;
    const x = -170 + i * 32 + r() * 6;
    const z = bounds.z0 - 48 - r() * 12;
    const body = block(w, h, 12, x, 0, z);
    const col = new THREE.Color(FAR[i % FAR.length]);
    const n = body.attributes.position.count;
    body.setAttribute('color', new THREE.BufferAttribute(new Float32Array(Array.from({ length: n }, () => [col.r, col.g, col.b]).flat()), 3));
    farParts.push(body);
    for (let y = 1.6; y + 2.2 < h; y += 3.2) bands.push(block(w - 2.4, 1.5, 0.12, x, y, z + 6.04));
    roofs.push(block(w + 0.6, 0.5, 12.6, x, h, z));
  }
  const farMesh = new THREE.Mesh(merge(farParts), far);
  farMesh.receiveShadow = true;
  group.add(farMesh);
  group.add(new THREE.Mesh(merge(bands), new THREE.MeshStandardMaterial({ color: 0x35424d, roughness: 0.2, metalness: 0.4 })));
  group.add(new THREE.Mesh(merge(roofs), new THREE.MeshStandardMaterial({ color: 0x6d6a66, roughness: 0.9 })));

  // Bollards at the entry.
  const bollards: THREE.BufferGeometry[] = [];
  for (const x of [-7.4, -6.6, 6.6, 7.4]) {
    const b = new THREE.CylinderGeometry(0.11, 0.11, 0.9, 10);
    b.translate(x, 0.45, bounds.z0 - 1);
    bollards.push(b);
  }
  group.add(new THREE.Mesh(merge(bollards), new THREE.MeshStandardMaterial({ color: 0xe0b72e, roughness: 0.5 })));

  return { group, trees, signs, gates, garage, setGantryBoard: gantry.setBoard, setGates: (entry, exit) => animateGates(gates, entry, exit) };
};

/** A shop: stucco box, a glass front under a canopy, the lit sign, trolleys by the door. The second one is smaller, brick-coloured, with an awning. */
const buildStore = (group: THREE.Group, shop: Shop, index: number) => {
  const w = shop.x1 - shop.x0;
  const d = shop.z1 - shop.z0;
  const cx = (shop.x0 + shop.x1) / 2;
  const front = shop.z0;
  const big = index === 0;
  const h = big ? 8.5 : 6;

  const wall = new THREE.MeshStandardMaterial({ color: big ? 0xeeb862 : 0xc9573a, roughness: 0.92 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x2c3036, roughness: 0.6, metalness: 0.3 });
  const accent = new THREE.MeshStandardMaterial({ color: shop.accent, roughness: 0.7 });
  const glass = new THREE.MeshPhysicalMaterial({ color: 0x1d2a33, roughness: 0.05, metalness: 0.2, clearcoat: 1, envMapIntensity: 1.4 });

  const body = new THREE.Mesh(block(w, h, d, cx, 0, front + d / 2), wall);
  body.castShadow = true;
  body.receiveShadow = true;
  group.add(body);
  const band = new THREE.Mesh(block(w + 0.4, 1.4, 0.5, cx, h - 0.4, front - 0.1), accent);
  band.castShadow = true;
  group.add(band);
  const gw = w * (big ? 0.7 : 0.62);
  group.add(new THREE.Mesh(block(gw, big ? 3.6 : 3.2, 0.2, cx, 0.15, front - 0.05), glass));
  const mull: THREE.BufferGeometry[] = [];
  for (let x = cx - gw / 2; x <= cx + gw / 2 + 0.01; x += 2.4) mull.push(block(0.12, big ? 3.6 : 3.2, 0.3, x, 0.15, front - 0.12));
  mull.push(block(gw, 0.14, 0.3, cx, big ? 3.7 : 3.3, front - 0.12));
  group.add(new THREE.Mesh(merge(mull), dark));
  // Canopy (big shop) or a striped awning (small shop) over the entrance.
  if (big) {
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
  } else {
    const stripes = canvasTexture(128, 16, (g) => {
      for (let i = 0; i < 8; i++) {
        g.fillStyle = i % 2 ? '#f4ead8' : '#7a3b22';
        g.fillRect(i * 16, 0, 16, 16);
      }
    });
    const awningGeo = new THREE.BoxGeometry(gw, 0.12, 2.6);
    scaleUV(awningGeo, gw / 2.4, 1);
    const awning = new THREE.Mesh(awningGeo, new THREE.MeshStandardMaterial({ map: stripes, roughness: 0.8 }));
    awning.position.set(cx, 3.55, front - 1.3);
    awning.rotation.x = 0.16;
    awning.castShadow = true;
    group.add(awning);
    // Tables and chairs under it.
    const tables: THREE.BufferGeometry[] = [];
    for (const dx of [-5, -1.6, 1.8, 5.2]) {
      tables.push(block(0.8, 0.05, 0.8, cx + dx, 0.72, front - 2.3), block(0.06, 0.72, 0.06, cx + dx, 0, front - 2.3));
      for (const sx of [-0.7, 0.7]) tables.push(block(0.4, 0.05, 0.4, cx + dx + sx, 0.45, front - 2.3), block(0.04, 0.45, 0.04, cx + dx + sx, 0, front - 2.3));
    }
    group.add(new THREE.Mesh(merge(tables), dark));
  }
  group.add(new THREE.Mesh(block(big ? 4 : 2.4, 2.6, 0.1, cx, 0.15, front - 0.18), new THREE.MeshPhysicalMaterial({ color: 0x5f7b88, roughness: 0.05, transmission: 0, clearcoat: 1 })));

  // The sign: big letters on the band above the entrance, lit.
  const c = document.createElement('canvas');
  c.width = 1024;
  c.height = 160;
  const g = c.getContext('2d')!;
  g.clearRect(0, 0, 1024, 160);
  g.font = `bold ${big ? 120 : 100}px "Arial Black", Arial, sans-serif`;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillStyle = '#fff7e0';
  g.fillText(shop.name, 512, 86, 980);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const signMat = new THREE.MeshStandardMaterial({ map: tex, transparent: true, emissive: 0xfff2c8, emissiveMap: tex, emissiveIntensity: 1.3 });
  const signMesh = new THREE.Mesh(new THREE.PlaneGeometry(big ? 18 : 12, big ? 2.8 : 1.9), signMat);
  signMesh.position.set(cx, big ? 5.9 : 4.7, front - 0.12);
  signMesh.rotation.y = Math.PI;
  group.add(signMesh);
  if (big) {
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
  }

  // Roof clutter: air handling units.
  const roof: THREE.BufferGeometry[] = [];
  const units: [number, number][] = big
    ? [
        [-14, 8],
        [-4, 14],
        [9, 9],
        [18, 18],
        [-24, 20],
        [24, 26],
      ]
    : [
        [-6, 6],
        [6, 9],
      ];
  for (const [x, z] of units) roof.push(block(3.2, 1.4, 2.2, cx + x, h, front + z));
  const roofMesh = new THREE.Mesh(merge(roof), new THREE.MeshStandardMaterial({ color: 0x9aa0a6, roughness: 0.6, metalness: 0.4 }));
  roofMesh.castShadow = true;
  group.add(roofMesh);

  // Trolleys lined up by the door, benches and bins along the front.
  const metal = new THREE.MeshStandardMaterial({ color: 0xb8bdc4, roughness: 0.35, metalness: 0.85 });
  const carts: THREE.BufferGeometry[] = [];
  for (let i = 0; i < (big ? 9 : 4); i++) {
    const x = cx + (big ? -13 : 8) + i * 0.32;
    carts.push(block(0.55, 0.5, 0.9, x, 0.55, front - 1.4), block(0.04, 0.6, 0.04, x, 0.15, front - 1.0));
  }
  group.add(new THREE.Mesh(merge(carts), metal));
  const furniture: THREE.BufferGeometry[] = [];
  for (const x of big ? [cx + 12, cx - 18, cx + 20] : [cx - 11]) furniture.push(block(1.8, 0.45, 0.5, x, 0.15, front - 1.2));
  for (const x of big ? [cx + 8, cx - 9] : [cx + 10]) {
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
