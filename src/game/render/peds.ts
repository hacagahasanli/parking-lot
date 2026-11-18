/**
 * Shoppers, drawn as low-poly people: head, hair, torso, two arms and two legs that swing as they
 * walk, in varied clothes, some pushing a trolley. One InstancedMesh per body part (a handful of
 * draw calls for the whole crowd), all driven from the sim's `Ped` list each frame.
 */
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

import type { Ped } from '../sim/types';

const SHIRT = [0xc0392b, 0x2e86c1, 0x27ae60, 0xf1c40f, 0x8e44ad, 0xecf0f1, 0xe67e22, 0x16a085, 0x34495e, 0xd35db0];
const PANTS = [0x2c3e50, 0x4a4a52, 0x6b4f3a, 0x1d2f4f, 0x8a8d93];
const SKIN = [0xf1c9a5, 0xe0ac86, 0xc68642, 0x8d5524, 0x5c3a21];
const HAIR = [0x1b1b1b, 0x4b3621, 0x8b5a2b, 0xd8b66a, 0x9aa0a6, 0xa13d2d];

/** A box whose top is at the origin and which hangs down (a limb about its joint). */
const limb = (w: number, len: number, d: number) => {
  const g = new THREE.BoxGeometry(w, len, d);
  g.translate(0, -len / 2, 0);
  return g;
};

const trolleyGeometry = () => {
  const parts: THREE.BufferGeometry[] = [];
  const box = (w: number, h: number, d: number, x: number, y: number, z: number) => {
    const g = new THREE.BoxGeometry(w, h, d);
    g.translate(x, y, z);
    parts.push(g);
  };
  box(0.5, 0.34, 0.78, 0, 0.78, 0.1); // basket
  box(0.5, 0.04, 0.78, 0, 0.5, 0.1); // lower tray
  box(0.56, 0.04, 0.04, 0, 1.0, -0.34); // handle
  for (const sx of [-0.24, 0.24]) {
    box(0.03, 0.5, 0.03, sx, 0.75, -0.34);
    for (const z of [-0.22, 0.42]) {
      const w = new THREE.CylinderGeometry(0.05, 0.05, 0.03, 8);
      w.rotateZ(Math.PI / 2);
      w.translate(sx, 0.05, z);
      parts.push(w);
      box(0.03, 0.4, 0.03, sx, 0.28, z);
    }
  }
  return mergeGeometries(parts.map((g) => (g.index ? g.toNonIndexed() : g)))!;
};

const smooth = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

export const buildPeds = (count: number) => {
  const group = new THREE.Group();
  const white = () => new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.85 });
  const make = (geo: THREE.BufferGeometry, n: number, mat: THREE.Material = white()) => {
    const m = new THREE.InstancedMesh(geo, mat, n);
    m.castShadow = true;
    m.frustumCulled = false;
    m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    group.add(m);
    return m;
  };
  const torso = make(new THREE.BoxGeometry(0.4, 0.56, 0.23).translate(0, 0.28, 0), count);
  const head = make(new THREE.SphereGeometry(0.115, 10, 8), count);
  const hair = make(new THREE.SphereGeometry(0.125, 10, 8, 0, Math.PI * 2, 0, Math.PI * 0.55).translate(0, 0.015, -0.01), count);
  const arms = make(limb(0.1, 0.56, 0.11), count * 2);
  const legs = make(limb(0.14, 0.9, 0.16), count * 2);
  const trolleys = make(trolleyGeometry(), count, new THREE.MeshStandardMaterial({ color: 0xb4b9c0, roughness: 0.4, metalness: 0.8 }));

  const root = new THREE.Matrix4();
  const hip = new THREE.Matrix4();
  const tor = new THREE.Matrix4();
  const a = new THREE.Matrix4();
  const b = new THREE.Matrix4();
  const out = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const pos = new THREE.Vector3();
  const scl = new THREE.Vector3();
  const up = new THREE.Vector3(0, 1, 0);
  const color = new THREE.Color();
  const zero = new THREE.Matrix4().makeScale(0, 0, 0);

  const paint = (peds: Ped[]) => {
    peds.forEach((p, i) => {
      const shirt = color.setHex(SHIRT[p.look.shirt % SHIRT.length]).clone();
      const pants = color.setHex(PANTS[p.look.pants % PANTS.length]).clone();
      torso.setColorAt(i, shirt);
      head.setColorAt(i, color.setHex(SKIN[p.look.skin % SKIN.length]));
      hair.setColorAt(i, color.setHex(HAIR[p.look.hair % HAIR.length]));
      arms.setColorAt(i * 2, shirt);
      arms.setColorAt(i * 2 + 1, shirt);
      legs.setColorAt(i * 2, pants);
      legs.setColorAt(i * 2 + 1, pants);
    });
    for (const m of [torso, head, hair, arms, legs]) if (m.instanceColor) m.instanceColor.needsUpdate = true;
  };
  let painted = false;

  /** `parent · T(x, y, z) · Rx(rot)` into `target`. */
  const joint = (target: THREE.Matrix4, parent: THREE.Matrix4, x: number, y: number, z: number, rot = 0) => {
    a.makeTranslation(x, y, z);
    b.makeRotationX(rot);
    return target.copy(parent).multiply(a).multiply(b);
  };

  const update = (peds: Ped[], t: number) => {
    if (!painted && peds.length) {
      paint(peds);
      painted = true;
    }
    for (let i = 0; i < count; i++) {
      const p = peds[i];
      if (!p) {
        for (const m of [torso, head, hair, trolleys]) m.setMatrixAt(i, zero);
        for (const k of [0, 1]) {
          arms.setMatrixAt(i * 2 + k, zero);
          legs.setMatrixAt(i * 2 + k, zero);
        }
        continue;
      }
      const s = p.look.height;
      q.setFromAxisAngle(up, p.h);
      root.compose(pos.set(p.x, 0, p.z), q, scl.set(s, s, s));

      // Pose: hip height, torso lean, leg and arm swing.
      let hipY = 0.9;
      let lean = 0;
      let legL = 0;
      let legR = 0;
      let armL = 0;
      let armR = 0;
      if (p.mode === 'walk' || p.mode === 'dodge') {
        const sw = Math.sin(p.phase);
        legL = sw * 0.7;
        legR = -sw * 0.7;
        armL = -sw * 0.5;
        armR = sw * 0.5;
        hipY += Math.abs(Math.cos(p.phase)) * 0.025;
        lean = p.mode === 'dodge' ? 0.18 : 0.05;
      } else if (p.mode === 'down') {
        // Sits down hard, stays there a moment, gets up, and shakes a fist.
        const sit = smooth(0, 0.3, p.t) * (1 - smooth(1.5, 2.0, p.t));
        hipY = 0.9 - 0.76 * sit;
        legL = legR = -1.45 * sit;
        lean = -0.3 * sit;
        armL = 0.6 * sit;
        armR = 0.6 * sit - (p.t > 2.0 ? 2.6 + Math.sin(p.t * 26) * 0.35 : 0);
      } else {
        const idle = Math.sin(t * 1.7 + p.id) * 0.05;
        armL = idle;
        armR = -idle;
        if (p.mode === 'dwell') armR = -1.0 + Math.sin(t * 3 + p.id) * 0.3;
        if (p.mode === 'wait') armR = -0.2;
      }
      if (p.trolley && p.mode !== 'down' && p.mode !== 'dwell') armL = armR = -1.15;

      hip.copy(root).multiply(a.makeTranslation(0, hipY, 0));
      tor.copy(hip).multiply(b.makeRotationX(lean));
      torso.setMatrixAt(i, tor);
      head.setMatrixAt(i, joint(out, tor, 0, 0.68, 0));
      hair.setMatrixAt(i, joint(out, tor, 0, 0.68, 0));
      arms.setMatrixAt(i * 2, joint(out, tor, -0.26, 0.52, 0, armL));
      arms.setMatrixAt(i * 2 + 1, joint(out, tor, 0.26, 0.52, 0, armR));
      legs.setMatrixAt(i * 2, joint(out, hip, -0.09, 0, 0, legL));
      legs.setMatrixAt(i * 2 + 1, joint(out, hip, 0.09, 0, 0, legR));
      if (p.trolley && p.mode !== 'down') trolleys.setMatrixAt(i, joint(out, root, 0, 0, 0.62));
      else trolleys.setMatrixAt(i, zero);
    }
    for (const m of [torso, head, hair, arms, legs, trolleys]) m.instanceMatrix.needsUpdate = true;
  };

  return { group, update };
};
