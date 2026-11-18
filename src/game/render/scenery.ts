/**
 * The pieces that make this lot a particular place: the entry and exit gates with their animated
 * boom barriers, the solar carport, EV chargers, the delivery truck, the road signs. Each builder
 * returns plain three.js objects (merged by material, so the draw calls stay few).
 */
import * as THREE from 'three';

import { makeBoard } from './board';
import { block, canvasTexture, flat, merge, scaleUV } from './geo';

import { levelY } from '../sim/levels';

import type { Canopy, Gate, Lot, Prop, Sign, SignKind } from '../sim/lot';

const steel = () => new THREE.MeshStandardMaterial({ color: 0x4a4f57, roughness: 0.5, metalness: 0.6 });

// ---------------------------------------------------------------------------
// Gates
// ---------------------------------------------------------------------------

export interface ArmView {
  gate: Gate;
  /** Pivot group: rotating it about z lifts the arm. */
  pivot: THREE.Group;
  /** +1 when the arm extends towards +x from its pivot, -1 towards -x. */
  dir: 1 | -1;
  light: THREE.MeshStandardMaterial;
}

export interface GateViews {
  group: THREE.Group;
  arms: ArmView[];
}

const stripeTexture = () =>
  canvasTexture(
    128,
    16,
    (g) => {
      for (let i = 0; i < 8; i++) {
        g.fillStyle = i % 2 ? '#d8242b' : '#f4f4f0';
        g.fillRect(i * 16, 0, 16, 16);
      }
    },
    1,
  );

const ticketMachine = (x: number, z: number, faceX: number) => {
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.5, 1.25, 0.4), new THREE.MeshStandardMaterial({ color: 0xe0b72e, roughness: 0.5 }));
  body.position.y = 0.72;
  body.castShadow = true;
  g.add(body);
  const screen = new THREE.Mesh(new THREE.PlaneGeometry(0.28, 0.2), new THREE.MeshStandardMaterial({ color: 0x101820, emissive: 0x3aa0ff, emissiveIntensity: 1.1 }));
  screen.position.set(0.26 * faceX, 1.1, 0);
  screen.rotation.y = faceX > 0 ? Math.PI / 2 : -Math.PI / 2;
  const slot = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.05, 0.22), new THREE.MeshStandardMaterial({ color: 0x15171a }));
  slot.position.set(0.26 * faceX, 0.82, 0);
  g.add(screen, slot);
  g.position.set(x, 0, z);
  return g;
};

export const buildGates = (lot: Lot): GateViews => {
  const group = new THREE.Group();
  const arms: ArmView[] = [];
  const white = new THREE.MeshStandardMaterial({ color: 0xe8e8e2, roughness: 0.6 });
  const red = new THREE.MeshStandardMaterial({ color: 0xc4282a, roughness: 0.6 });
  const armTex = stripeTexture();
  const armMat = new THREE.MeshStandardMaterial({ map: armTex, roughness: 0.5 });

  for (const gate of lot.gates) {
    const dir: 1 | -1 = gate.tx > gate.px ? 1 : -1;
    // Housing at the pivot.
    const housing = new THREE.Mesh(new THREE.BoxGeometry(0.42, 1.15, 0.42), white);
    housing.position.set(gate.px + dir * 0.12, 0.58, gate.z);
    housing.castShadow = true;
    group.add(housing);
    const band = new THREE.Mesh(new THREE.BoxGeometry(0.44, 0.12, 0.44), red);
    band.position.set(gate.px + dir * 0.12, 1.1, gate.z);
    group.add(band);
    // The arm: from the pivot to the far kerb, hinged at the housing.
    const len = Math.abs(gate.tx - gate.px) - 0.3;
    const pivot = new THREE.Group();
    pivot.position.set(gate.px + dir * 0.12, 0.98, gate.z);
    const armGeo = new THREE.BoxGeometry(len, 0.1, 0.1);
    scaleUV(armGeo, len / 1.0, 1);
    const arm = new THREE.Mesh(armGeo, armMat);
    arm.position.x = dir * (len / 2 + 0.15);
    arm.castShadow = true;
    pivot.add(arm);
    group.add(pivot);
    // A lamp on the housing: red while the arm is down, green once it is up.
    const light = new THREE.MeshStandardMaterial({ color: 0x222222, emissive: 0xff2a1a, emissiveIntensity: 2 });
    const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.1, 12, 8), light);
    lamp.position.set(gate.px + dir * 0.12, 1.28, gate.z);
    group.add(lamp);
    arms.push({ gate, pivot, dir, light });
  }

  // The booth on the entry island: a small glass-fronted hut with a flat roof, a light and a door at the back.
  const booth = lot.props.find((p) => p.kind === 'booth');
  if (booth) {
    const wall = new THREE.MeshStandardMaterial({ color: 0xd9d6cc, roughness: 0.85 });
    const glass = new THREE.MeshPhysicalMaterial({ color: 0x1d2a33, roughness: 0.05, metalness: 0.2, clearcoat: 1 });
    const roof = new THREE.MeshStandardMaterial({ color: 0x2c3036, roughness: 0.6 });
    const parts: THREE.BufferGeometry[] = [];
    const body = new THREE.Mesh(block(2.2, 2.5, 2.9, booth.x, 0, booth.z), wall);
    body.castShadow = true;
    body.receiveShadow = true;
    group.add(body);
    for (const s of [-1, 1]) parts.push(block(0.06, 1.0, 2.0, booth.x + s * 1.12, 1.15, booth.z - 0.1));
    parts.push(block(2.0, 0.9, 0.06, booth.x, 1.3, booth.z - 1.46));
    group.add(new THREE.Mesh(merge(parts), glass));
    const slab = new THREE.Mesh(block(2.8, 0.22, 3.5, booth.x, 2.5, booth.z), roof);
    slab.castShadow = true;
    group.add(slab);
    const sign = new THREE.Mesh(
      new THREE.PlaneGeometry(1.6, 0.4),
      new THREE.MeshStandardMaterial({
        map: canvasTexture(256, 64, (g) => {
          g.fillStyle = '#1f6fd6';
          g.fillRect(0, 0, 256, 64);
          g.fillStyle = '#fff';
          g.font = 'bold 40px Arial, sans-serif';
          g.textAlign = 'center';
          g.textBaseline = 'middle';
          g.fillText('TICKETS', 128, 34);
        }),
        emissive: 0xffffff,
        emissiveIntensity: 0.25,
      }),
    );
    sign.position.set(booth.x, 2.85, booth.z - 1.76);
    sign.rotation.y = Math.PI;
    group.add(sign);
  }

  for (const p of lot.props) {
    if (p.kind === 'ticket') group.add(ticketMachine(p.x, p.z, Math.sign(p.x) || 1));
    if (p.kind === 'pay') {
      const m = ticketMachine(p.x, p.z, -1);
      group.add(m);
    }
  }
  // Exit: a plain post with a "take your ticket / pay here" sign is enough above the machine.
  return { group, arms };
};

/** Lifts the arms: `open` 0 (down) to 1 (up), eased. Entry arms follow the sim's gate; the exit arm lifts for `exitOpen`. */
export const animateGates = (v: GateViews, open: number, exitOpen: number) => {
  for (const a of v.arms) {
    const k = a.gate.kind === 'entry' ? open : exitOpen;
    const e = k * k * (3 - 2 * k);
    a.pivot.rotation.z = a.dir * e * 1.45;
    a.light.emissive.setHex(k > 0.5 ? 0x22dd55 : 0xff2a1a);
  }
};

// ---------------------------------------------------------------------------
// The solar carport
// ---------------------------------------------------------------------------

const panelTexture = () =>
  canvasTexture(
    128,
    128,
    (g) => {
      g.fillStyle = '#1c2a4a';
      g.fillRect(0, 0, 128, 128);
      g.strokeStyle = '#7c8aa6';
      g.lineWidth = 2;
      for (let i = 0; i <= 128; i += 32) {
        g.beginPath();
        g.moveTo(i, 0);
        g.lineTo(i, 128);
        g.moveTo(0, i);
        g.lineTo(128, i);
        g.stroke();
      }
      g.strokeStyle = 'rgba(160,180,210,0.35)';
      g.lineWidth = 1;
      for (let i = 16; i < 128; i += 32) {
        g.beginPath();
        g.moveTo(i, 0);
        g.lineTo(i, 128);
        g.stroke();
      }
    },
    1,
  );

/** A V-shaped roof of solar panels over two rows of bays, on a row of posts along the valley. */
export const buildCanopy = (c: Canopy, posts: { x: number; z: number }[]): THREE.Group => {
  const group = new THREE.Group();
  const w = c.x1 - c.x0;
  const d = c.z1 - c.z0;
  const cx = (c.x0 + c.x1) / 2;
  const cz = (c.z0 + c.z1) / 2;
  const tilt = 0.1;
  const tex = panelTexture();
  const panelMat = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.25, metalness: 0.55 });
  const frameMat = new THREE.MeshStandardMaterial({ color: 0x9aa0a8, roughness: 0.5, metalness: 0.7 });
  const half = d / 2;
  for (const side of [-1, 1]) {
    const geo = new THREE.BoxGeometry(w, 0.12, half / Math.cos(tilt));
    scaleUV(geo, w / 2.2, half / 2.2);
    const panel = new THREE.Mesh(geo, [frameMat, frameMat, panelMat, frameMat, frameMat, frameMat]);
    panel.position.set(cx, c.h + Math.sin(tilt) * (half / 2) - 0.1, cz + (side * half) / 2);
    panel.rotation.x = -side * tilt;
    panel.castShadow = true;
    panel.receiveShadow = true;
    group.add(panel);
    // Front fascia.
    const fascia = new THREE.Mesh(block(w, 0.3, 0.08, cx, c.h + Math.sin(tilt) * half - 0.3, cz + side * half), frameMat);
    fascia.castShadow = true;
    group.add(fascia);
  }
  // A beam along the valley and the posts under it.
  const beam = new THREE.Mesh(block(w, 0.3, 0.3, cx, c.h - 0.5, cz), frameMat);
  beam.castShadow = true;
  group.add(beam);
  const postGeos = posts.map((p) => block(0.34, c.h - 0.4, 0.34, p.x, 0, p.z));
  if (postGeos.length) {
    const post = new THREE.Mesh(merge(postGeos), steel());
    post.castShadow = true;
    group.add(post);
  }
  // Light strips under the roof.
  const strips: THREE.BufferGeometry[] = [];
  for (let x = c.x0 + 3; x < c.x1; x += 5.4) for (const side of [-1, 1]) strips.push(block(1.4, 0.05, 0.12, x, c.h - 0.55, cz + side * (half * 0.5)));
  group.add(new THREE.Mesh(merge(strips), new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xfff0d0, emissiveIntensity: 0.8 })));
  return group;
};

// ---------------------------------------------------------------------------
// EV chargers
// ---------------------------------------------------------------------------

/** Wall-box style chargers on the strip between two rows, each serving a pair of bays (a cable on each side). */
export const buildChargers = (props: Prop[]): THREE.Group => {
  const group = new THREE.Group();
  const body: THREE.BufferGeometry[] = [];
  const screen: THREE.BufferGeometry[] = [];
  const cable: THREE.BufferGeometry[] = [];
  for (const p of props) {
    if (p.kind !== 'charger') continue;
    body.push(block(0.5, 1.5, 0.32, p.x, 0.17, p.z));
    for (const s of [-1, 1]) {
      screen.push(block(0.22, 0.28, 0.03, p.x, 1.1, p.z + s * 0.18));
      const hose = new THREE.TorusGeometry(0.22, 0.025, 6, 14, Math.PI);
      hose.rotateY(Math.PI / 2);
      hose.rotateZ(0);
      hose.translate(p.x + 0.28, 0.75, p.z + s * 0.1);
      cable.push(hose);
    }
  }
  if (!body.length) return group;
  const bodyMesh = new THREE.Mesh(merge(body), new THREE.MeshStandardMaterial({ color: 0xeceff2, roughness: 0.4 }));
  bodyMesh.castShadow = true;
  group.add(bodyMesh);
  group.add(new THREE.Mesh(merge(screen), new THREE.MeshStandardMaterial({ color: 0x0b1a12, emissive: 0x2fe07a, emissiveIntensity: 1.2 })));
  group.add(new THREE.Mesh(merge(cable), new THREE.MeshStandardMaterial({ color: 0x1b1d20, roughness: 0.6 })));
  return group;
};

// ---------------------------------------------------------------------------
// The delivery yard
// ---------------------------------------------------------------------------

/** A box truck; local forward is +z, like a car, so `rotation.y = heading`. */
export const buildTruck = (p: Prop): THREE.Group => {
  const g = new THREE.Group();
  const cargo = new THREE.MeshStandardMaterial({ color: p.color ?? 0xe9e6dc, roughness: 0.55 });
  const cab = new THREE.MeshStandardMaterial({ color: 0x24324f, roughness: 0.4, metalness: 0.2 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x1c1e22, roughness: 0.7 });
  const green = new THREE.MeshStandardMaterial({ color: 0x1f6f4a, roughness: 0.6 });
  const glass = new THREE.MeshPhysicalMaterial({ color: 0x1d2a33, roughness: 0.05, clearcoat: 1 });
  const box = (mat: THREE.Material, w: number, h: number, d: number, x: number, y: number, z: number) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    m.position.set(x, y + h / 2, z);
    m.castShadow = true;
    m.receiveShadow = true;
    g.add(m);
    return m;
  };
  box(dark, 2.2, 0.35, 8.2, 0, 0.5, 0); // chassis
  box(cargo, 2.5, 2.8, 5.7, 0, 0.8, -1.25); // cargo box
  box(green, 2.52, 0.32, 5.72, 0, 1.55, -1.25); // stripe
  box(cab, 2.4, 1.9, 1.9, 0, 0.8, 2.6); // cab
  box(cab, 2.4, 0.7, 0.9, 0, 0.5, 3.6); // bonnet
  box(glass, 2.42, 0.8, 0.05, 0, 1.9, 3.01); // windscreen
  for (const s of [-1, 1]) box(glass, 0.04, 0.7, 1.0, s * 1.2, 1.9, 2.5);
  box(dark, 2.5, 0.3, 0.3, 0, 0.35, 3.95); // bumper
  // Rear: a roll-up door with ribs, lights, a dock bumper.
  for (let y = 0.9; y < 3.4; y += 0.22) box(dark, 2.3, 0.025, 0.03, 0, y, -4.12);
  for (const s of [-1, 1]) box(new THREE.MeshStandardMaterial({ color: 0x8a0d10, emissive: 0x2a0000 }), 0.2, 0.3, 0.05, s * 1.1, 0.8, -4.1);
  const wheelGeo = new THREE.CylinderGeometry(0.52, 0.52, 0.32, 18);
  wheelGeo.rotateZ(Math.PI / 2);
  for (const [z, w] of [
    [2.7, 1],
    [-2.3, 1],
    [-3.2, 1],
  ] as const) {
    for (const s of [-1, 1]) {
      const wheel = new THREE.Mesh(wheelGeo, dark);
      wheel.position.set(s * 1.1 * w, 0.52, z);
      wheel.castShadow = true;
      g.add(wheel);
    }
  }
  g.position.set(p.x, 0, p.z);
  g.rotation.y = p.h;
  return g;
};

export const buildYardProps = (lot: Lot): THREE.Group => {
  const g = new THREE.Group();
  const wood = new THREE.MeshStandardMaterial({ color: 0x9a7448, roughness: 0.9 });
  const wrap = new THREE.MeshStandardMaterial({ color: 0xd9dde2, roughness: 0.35, transparent: true, opacity: 0.92 });
  const cartons = new THREE.MeshStandardMaterial({ color: 0xb98a55, roughness: 0.9 });
  const mesh = new THREE.MeshStandardMaterial({ color: 0xb4b9c0, roughness: 0.4, metalness: 0.8 });
  const base: THREE.BufferGeometry[] = [];
  const load: THREE.BufferGeometry[] = [];
  const wrapped: THREE.BufferGeometry[] = [];
  const cages: THREE.BufferGeometry[] = [];
  lot.props.forEach((p, i) => {
    if (p.kind === 'pallet') {
      base.push(block(1.2, 0.15, 1.2, p.x, 0, p.z));
      (i % 2 ? load : wrapped).push(block(1.05, 0.95 + (i % 3) * 0.2, 1.05, p.x, 0.15, p.z));
    }
    if (p.kind === 'cage') {
      for (const [dx, dz] of [
        [-0.4, -0.4],
        [0.4, -0.4],
        [-0.4, 0.4],
        [0.4, 0.4],
      ])
        cages.push(block(0.04, 1.6, 0.04, p.x + dx, 0.1, p.z + dz));
      for (const y of [0.1, 0.9, 1.7]) cages.push(block(0.84, 0.03, 0.84, p.x, y, p.z));
      cages.push(block(0.8, 0.02, 0.02, p.x, 1.2, p.z - 0.4), block(0.8, 0.02, 0.02, p.x, 1.2, p.z + 0.4));
      load.push(block(0.6, 0.6, 0.6, p.x, 0.15, p.z));
    }
  });
  if (base.length) {
    const m = new THREE.Mesh(merge(base), wood);
    m.castShadow = true;
    g.add(m);
  }
  if (load.length) {
    const m = new THREE.Mesh(merge(load), cartons);
    m.castShadow = true;
    g.add(m);
  }
  if (wrapped.length) g.add(new THREE.Mesh(merge(wrapped), wrap));
  if (cages.length) {
    const m = new THREE.Mesh(merge(cages), mesh);
    m.castShadow = true;
    g.add(m);
  }
  return g;
};

// ---------------------------------------------------------------------------
// Road signs
// ---------------------------------------------------------------------------

const SIGN_ORDER: SignKind[] = ['stop', 'oneway', 'noentry', 'ev', 'disabled', 'parent', 'speed', 'p', 'exit', 'entry', 'loading', 'slow'];

/** One canvas with a tile per sign design (4 x 3). */
const signAtlas = () =>
  canvasTexture(512, 384, (g) => {
    const T = 128;
    SIGN_ORDER.forEach((kind, i) => {
      const x = (i % 4) * T;
      const y = Math.floor(i / 4) * T;
      g.save();
      g.translate(x, y);
      g.fillStyle = '#d9dcdf';
      g.fillRect(0, 0, T, T);
      const c = T / 2;
      const text = (t: string, size: number, color: string, cy = c) => {
        g.fillStyle = color;
        g.font = `bold ${size}px Arial, sans-serif`;
        g.textAlign = 'center';
        g.textBaseline = 'middle';
        g.fillText(t, c, cy);
      };
      const disc = (r: number, fill: string) => {
        g.fillStyle = fill;
        g.beginPath();
        g.arc(c, c, r, 0, Math.PI * 2);
        g.fill();
      };
      const plate = (fill: string) => {
        g.fillStyle = fill;
        g.beginPath();
        g.roundRect(6, 6, T - 12, T - 12, 14);
        g.fill();
      };
      if (kind === 'stop') {
        g.fillStyle = '#c4282a';
        g.beginPath();
        for (let k = 0; k < 8; k++) {
          const a = (k * Math.PI) / 4 + Math.PI / 8;
          g.lineTo(c + Math.cos(a) * 58, c + Math.sin(a) * 58);
        }
        g.fill();
        text('STOP', 40, '#fff');
      } else if (kind === 'oneway') {
        plate('#1f5fb0');
        g.fillStyle = '#fff';
        g.beginPath();
        g.moveTo(24, 54);
        g.lineTo(74, 54);
        g.lineTo(74, 36);
        g.lineTo(108, 64);
        g.lineTo(74, 92);
        g.lineTo(74, 74);
        g.lineTo(24, 74);
        g.fill();
      } else if (kind === 'noentry') {
        disc(58, '#c4282a');
        g.fillStyle = '#fff';
        g.fillRect(24, 54, 80, 20);
      } else if (kind === 'ev') {
        plate('#1f9d55');
        g.fillStyle = '#fff';
        g.beginPath();
        g.moveTo(72, 18);
        g.lineTo(40, 70);
        g.lineTo(62, 70);
        g.lineTo(54, 110);
        g.lineTo(90, 54);
        g.lineTo(68, 54);
        g.fill();
      } else if (kind === 'disabled' || kind === 'parent') {
        plate('#1f5fb0');
        g.fillStyle = '#fff';
        g.strokeStyle = '#fff';
        g.lineWidth = 8;
        if (kind === 'disabled') {
          g.beginPath();
          g.arc(52, 30, 9, 0, Math.PI * 2);
          g.fill();
          g.beginPath();
          g.moveTo(52, 44);
          g.lineTo(52, 74);
          g.lineTo(82, 74);
          g.lineTo(92, 104);
          g.moveTo(52, 56);
          g.lineTo(76, 56);
          g.stroke();
          g.beginPath();
          g.arc(52, 82, 22, 0.5 * Math.PI, 1.6 * Math.PI);
          g.stroke();
        } else {
          g.beginPath();
          g.arc(46, 34, 11, 0, Math.PI * 2);
          g.arc(84, 62, 7, 0, Math.PI * 2);
          g.fill();
          g.fillRect(40, 48, 12, 44);
          g.fillRect(78, 72, 12, 26);
        }
      } else if (kind === 'speed') {
        disc(58, '#c4282a');
        disc(44, '#fff');
        text('10', 48, '#111');
      } else if (kind === 'p') {
        plate('#1f6fd6');
        text('P', 96, '#fff');
      } else if (kind === 'exit') {
        plate('#1f9d55');
        text('EXIT', 44, '#fff');
      } else if (kind === 'entry') {
        plate('#1f9d55');
        text('ENTRY', 38, '#fff');
      } else if (kind === 'loading') {
        plate('#e0b72e');
        text('LOADING', 25, '#111', 50);
        text('ONLY', 30, '#111', 84);
      } else {
        plate('#e0b72e');
        text('SLOW', 34, '#111');
      }
      g.restore();
    });
  });

/** Every road sign: a pole and a plate showing its tile of the atlas, merged into two meshes. */
export const buildSigns = (signs: Sign[]): THREE.Group => {
  const group = new THREE.Group();
  const atlas = signAtlas();
  const plates: THREE.BufferGeometry[] = [];
  const poles: THREE.BufferGeometry[] = [];
  for (const s of signs) {
    const i = SIGN_ORDER.indexOf(s.kind);
    const wide = s.kind === 'exit' || s.kind === 'entry' || s.kind === 'loading';
    const size = s.kind === 'stop' || s.kind === 'noentry' || s.kind === 'speed' ? 0.7 : 0.8;
    const g = new THREE.PlaneGeometry(size, size);
    const u0 = (i % 4) / 4;
    const v0 = 1 - (Math.floor(i / 4) + 1) / 3;
    const uv = g.attributes.uv;
    for (let k = 0; k < uv.count; k++) uv.setXY(k, u0 + uv.getX(k) / 4, v0 + uv.getY(k) / 3);
    g.rotateY(s.h);
    g.translate(s.x + Math.sin(s.h) * 0.05, 2.15 + (wide ? 0.1 : 0), s.z + Math.cos(s.h) * 0.05);
    plates.push(g);
    const pole = new THREE.CylinderGeometry(0.035, 0.035, 2.6, 6);
    pole.translate(s.x, 1.3, s.z);
    poles.push(pole);
  }
  const plateMesh = new THREE.Mesh(merge(plates), new THREE.MeshStandardMaterial({ map: atlas, roughness: 0.5, side: THREE.DoubleSide }));
  plateMesh.castShadow = true;
  group.add(plateMesh);
  group.add(new THREE.Mesh(merge(poles), new THREE.MeshStandardMaterial({ color: 0x8a8f96, roughness: 0.5, metalness: 0.7 })));
  return group;
};

// ---------------------------------------------------------------------------
// Painted symbols for the special bays
// ---------------------------------------------------------------------------

/** Blue paint with a white symbol for disabled and parent bays, green for EV bays: a flat patch per bay. */
export const buildBayPaint = (lot: Lot): THREE.Group => {
  const group = new THREE.Group();
  const kinds = {
    disabled: { fill: '#1f5fb0', draw: (g: CanvasRenderingContext2D) => drawChair(g) },
    parent: { fill: '#2f8f9d', draw: (g: CanvasRenderingContext2D) => drawParent(g) },
    ev: { fill: '#1f9d55', draw: (g: CanvasRenderingContext2D) => drawBolt(g) },
  } as const;
  for (const key of Object.keys(kinds) as (keyof typeof kinds)[]) {
    const bays = lot.bays.filter((b) => b.tags.includes(key));
    if (!bays.length) continue;
    const k = kinds[key];
    const tex = canvasTexture(128, 256, (g) => {
      g.fillStyle = k.fill;
      g.fillRect(0, 0, 128, 256);
      g.strokeStyle = 'rgba(255,255,255,0.0)';
      k.draw(g);
    });
    tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
    const geos = bays.map((b) => {
      // A patch over the middle of the bay with the symbol near the back (the far end from the aisle).
      const g = new THREE.PlaneGeometry(b.w - 0.3, b.d - 0.4);
      g.rotateX(-Math.PI / 2);
      g.rotateY(b.h + Math.PI);
      g.translate(b.x, 0.011, b.z);
      return g;
    });
    const mat = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.7, polygonOffset: true, polygonOffsetFactor: -1 });
    const mesh = new THREE.Mesh(merge(geos), mat);
    mesh.receiveShadow = true;
    group.add(mesh);
  }
  return group;
};

const drawChair = (g: CanvasRenderingContext2D) => {
  g.strokeStyle = '#fff';
  g.fillStyle = '#fff';
  g.lineWidth = 9;
  g.lineCap = 'round';
  g.beginPath();
  g.arc(60, 70, 12, 0, Math.PI * 2);
  g.fill();
  g.beginPath();
  g.moveTo(60, 90);
  g.lineTo(60, 140);
  g.lineTo(96, 140);
  g.lineTo(106, 176);
  g.moveTo(60, 108);
  g.lineTo(88, 108);
  g.stroke();
  g.beginPath();
  g.arc(60, 150, 30, 0.45 * Math.PI, 1.55 * Math.PI);
  g.stroke();
};
const drawParent = (g: CanvasRenderingContext2D) => {
  g.fillStyle = '#fff';
  g.beginPath();
  g.arc(48, 70, 14, 0, Math.PI * 2);
  g.arc(88, 118, 9, 0, Math.PI * 2);
  g.fill();
  g.fillRect(40, 88, 16, 80);
  g.fillRect(82, 132, 12, 40);
};
const drawBolt = (g: CanvasRenderingContext2D) => {
  g.fillStyle = '#fff';
  g.beginPath();
  g.moveTo(80, 50);
  g.lineTo(40, 134);
  g.lineTo(66, 134);
  g.lineTo(52, 206);
  g.lineTo(96, 112);
  g.lineTo(70, 112);
  g.fill();
};

// ---------------------------------------------------------------------------
// Road markings that are not bay stripes
// ---------------------------------------------------------------------------

/** Zebra crossings, stop lines, hatching and the speed bumps (raised, striped yellow and black). */
export const buildMarkings = (lot: Lot): THREE.Group => {
  const group = new THREE.Group();
  const white: THREE.BufferGeometry[] = [];
  const yellow: THREE.BufferGeometry[] = [];
  for (const c of lot.crossings) {
    // Bars run along the traffic (across the people's way).
    // (people walk along `c.h`; the bars lie along the traffic and are laid out in a row along their way.)
    const fx = Math.sin(c.h);
    const fz = Math.cos(c.h);
    const n = Math.floor(c.len / 0.95);
    for (let i = 0; i < n; i++) {
      const off = (i - (n - 1) / 2) * 0.95;
      white.push(flat(0.5, 3.4, c.x + fx * off, c.z + fz * off, c.h + Math.PI / 2, 0.012));
    }
  }
  for (const s of lot.stopLines) white.push(flat(s.w, s.l, s.x, s.z, s.h, 0.012));
  for (const h of lot.hatches) {
    // Diagonal yellow bars inside a box.
    const bars = Math.floor(h.w / 1.1);
    for (let i = 0; i < bars; i++) {
      const bx = h.x - h.w / 2 + (i + 0.5) * (h.w / bars);
      yellow.push(flat(0.3, h.l * 1.2, bx, h.z, 0.7, 0.012));
    }
    yellow.push(flat(h.w, 0.12, h.x, h.z - h.l / 2, 0, 0.012), flat(h.w, 0.12, h.x, h.z + h.l / 2, 0, 0.012));
  }
  const paintMat = (color: number) => new THREE.MeshStandardMaterial({ color, roughness: 0.65, polygonOffset: true, polygonOffsetFactor: -2 });
  if (white.length) {
    const m = new THREE.Mesh(merge(white), paintMat(0xffffff));
    m.receiveShadow = true;
    group.add(m);
  }
  if (yellow.length) {
    const m = new THREE.Mesh(merge(yellow), paintMat(0xf5c71a));
    m.receiveShadow = true;
    group.add(m);
  }
  const tex = canvasTexture(128, 32, (g) => {
    for (let i = 0; i < 8; i++) {
      g.fillStyle = i % 2 ? '#1c1e22' : '#e3b92c';
      g.fillRect(i * 16, 0, 16, 32);
    }
  });
  const bumpMat = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.6 });
  for (const b of lot.bumps) {
    // A low raised strip across the road: long axis across the traffic.
    const geo = new THREE.BoxGeometry(b.len - 0.4, 0.07, 0.8);
    scaleUV(geo, (b.len - 0.4) / 1.6, 1);
    const m = new THREE.Mesh(geo, bumpMat);
    m.position.set(b.x, 0.035, b.z);
    m.rotation.y = b.h;
    m.receiveShadow = true;
    group.add(m);
  }
  return group;
};

// ---------------------------------------------------------------------------
// The free-spaces board over the entry gate
// ---------------------------------------------------------------------------

/**
 * The FREE SPACES board: a small LED panel on the face of the ticket booth, towards the queue. (It used to hang on a
 * gantry over both lanes, which stood between the chase camera and the road.)
 */
export const buildBoothBoard = (lot: Lot) => {
  const group = new THREE.Group();
  const board = makeBoard(1.9, 0.475);
  const booth = lot.props.find((p) => p.kind === 'booth');
  if (!booth) return { group, setBoard: board.set };
  board.mesh.position.set(booth.x, 2.12, booth.z - 1.46);
  board.mesh.rotation.y = Math.PI;
  group.add(board.mesh);
  return { group, setBoard: board.set };
};

// ---------------------------------------------------------------------------
// Ways a stage keeps shut
// ---------------------------------------------------------------------------

export interface ClosureViews {
  /** One group per closure id ('door', 'down', 'up1', 'up2'), standing at the barrier's place; hidden when the stage lets you through. */
  groups: Map<string, { group: THREE.Group; lvl: number }>;
}

/**
 * A closed way: a low red-and-white barrier on two posts across the road, and traffic cones on the approach side. Kept low on
 * purpose (a metre high, nothing above it), so it never blocks the chase camera's view of the road beyond; the sim's `solid` is
 * what stops cars. The renderer shows the ones the stage shuts.
 */
export const buildClosures = (lot: Lot): ClosureViews => {
  const groups: ClosureViews['groups'] = new Map();
  const stripes = stripeTexture();
  const bar = new THREE.MeshStandardMaterial({ map: stripes, roughness: 0.6 });
  const post = new THREE.MeshStandardMaterial({ color: 0xf2f2ee, roughness: 0.6 });
  const cone = new THREE.MeshStandardMaterial({ color: 0xf06a1d, roughness: 0.6 });
  const band = new THREE.MeshStandardMaterial({ color: 0xf4f4f0, roughness: 0.6 });
  const lamp = new THREE.MeshStandardMaterial({ color: 0xffb02e, emissive: 0xffb02e, emissiveIntensity: 1.2 });
  for (const c of lot.closures) {
    const g = new THREE.Group();
    // The road runs along x; the barrier spans z.
    const half = c.width / 2 + 0.25;
    const rail = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.34, half * 2), bar);
    rail.position.set(0, 0.82, 0);
    rail.castShadow = true;
    g.add(rail);
    const rail2 = rail.clone();
    rail2.position.y = 0.4;
    g.add(rail2);
    for (const s of [-1, 1]) {
      const p = new THREE.Mesh(new THREE.BoxGeometry(0.2, 1.1, 0.2), post);
      p.position.set(0, 0.55, s * half);
      p.castShadow = true;
      g.add(p);
      const l = new THREE.Mesh(new THREE.SphereGeometry(0.09, 8, 6), lamp);
      l.position.set(0, 1.18, s * half);
      g.add(l);
    }
    // Cones in a row on the side the cars come from (x grows going in, so the approach is at -x).
    for (let i = 0; i < 5; i++) {
      const z = -half + 0.6 + (i * (half * 2 - 1.2)) / 4;
      const body = new THREE.Mesh(new THREE.ConeGeometry(0.2, 0.62, 12), cone);
      body.position.set(-1.1 - (i % 2) * 0.35, 0.31, z);
      body.castShadow = true;
      g.add(body);
      const stripe = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.13, 0.1, 12), band);
      stripe.position.set(-1.1 - (i % 2) * 0.35, 0.36, z);
      g.add(stripe);
      const foot = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.04, 0.46), cone);
      foot.position.set(-1.1 - (i % 2) * 0.35, 0.02, z);
      g.add(foot);
    }
    // (on the foot of a ramp the road has already climbed or dropped a little)
    g.position.set(c.x - 0.35, levelY(c.lvl) + (c.id === 'down' ? -0.1 : c.id === 'door' ? 0 : 0.1), c.z);
    g.visible = false;
    groups.set(c.id, { group: g, lvl: c.lvl });
  }
  // The stripes run the length of the rail (z).
  stripes.repeat.set(3, 1);
  return { groups };
};
