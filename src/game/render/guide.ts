/**
 * The campaign's ground guides, flat on the tarmac:
 *  - the bay outline of a solo level (white while you drive to it, green once you are inside and straight), with an arrow that
 *    says which way the nose must point when the level asks for one, and dim outlines for the bays still to come in a chain;
 *  - the exit circle of an unpark level;
 *  - the projected path: where the car's two sides will sweep over the next few metres at the wheel angle it has now, forwards
 *    or backwards, so a gap can be judged before you are in it.
 * A race shows none of these (the free bay is hidden there; finding it is the game).
 */
import * as THREE from 'three';

import { CAR } from '../sim/constants';
import { flat, merge } from './geo';

const WHITE = new THREE.Color(0xf2f4f8);
const GREEN = new THREE.Color(0x3ddc84);
const GOLD = new THREE.Color(0xffd23f);

/** A rectangle's outline as four thin flat bars (w across, d along), centred on the origin. */
const outlineGeo = (w: number, d: number, t: number, y: number) =>
  merge([flat(t, d, -w / 2 + t / 2, 0, 0, y), flat(t, d, w / 2 - t / 2, 0, 0, y), flat(w, t, 0, d / 2 - t / 2, 0, y), flat(w, t, 0, -d / 2 + t / 2, 0, y)]);

/** A chevron arrow lying flat, pointing along +z (the group's heading), about `len` long. */
const arrowGeo = (len: number, y: number) => {
  const shape = new THREE.Shape();
  const w = 0.75;
  const head = len * 0.45;
  const shaft = 0.22;
  shape.moveTo(0, len / 2);
  shape.lineTo(w, len / 2 - head);
  shape.lineTo(shaft, len / 2 - head);
  shape.lineTo(shaft, -len / 2);
  shape.lineTo(-shaft, -len / 2);
  shape.lineTo(-shaft, len / 2 - head);
  shape.lineTo(-w, len / 2 - head);
  shape.closePath();
  const g = new THREE.ShapeGeometry(shape);
  // The shape is drawn in x/y: lay it on the ground with +y becoming +z.
  g.rotateX(Math.PI / 2);
  g.translate(0, y, 0);
  return g;
};

export interface BayGuideState {
  x: number;
  y: number;
  z: number;
  h: number;
  w: number;
  d: number;
  /** Which way the arrow points, relative to the bay's nose-in heading (null: no arrow). */
  arrow: 'nose' | 'tail' | null;
  /** 0 driving to it, 1 inside the lines, 2 inside and straight (holding). */
  status: 0 | 1 | 2;
  /** 0..1 of the hold, for the fill. */
  hold: number;
}

/** The current bay's outline, fill and arrow. */
export const buildBayGuide = () => {
  const group = new THREE.Group();
  const lineMat = new THREE.MeshBasicMaterial({ color: WHITE, transparent: true, opacity: 0.95, depthWrite: false, toneMapped: false });
  const fillMat = new THREE.MeshBasicMaterial({ color: WHITE, transparent: true, opacity: 0.1, depthWrite: false, toneMapped: false });
  const arrowMat = new THREE.MeshBasicMaterial({ color: GOLD, transparent: true, opacity: 0.85, depthWrite: false, toneMapped: false, side: THREE.DoubleSide });
  // Built for a unit bay and scaled to each bay (the line width stays even: it is built at the size of the commonest bay).
  const lines = new THREE.Mesh(outlineGeo(1, 1, 0.12, 0.045), lineMat);
  const fill = new THREE.Mesh(flat(1, 1, 0, 0, 0, 0.04), fillMat);
  const arrow = new THREE.Mesh(arrowGeo(2.2, 0.05), arrowMat);
  lines.renderOrder = fill.renderOrder = arrow.renderOrder = 3;
  group.add(fill, lines, arrow);
  group.visible = false;
  let built = { w: 1, d: 1 };
  const set = (s: BayGuideState | null, time: number) => {
    group.visible = !!s;
    if (!s) return;
    if (s.w !== built.w || s.d !== built.d) {
      lines.geometry.dispose();
      lines.geometry = outlineGeo(s.w, s.d, 0.14, 0.045);
      fill.geometry.dispose();
      fill.geometry = flat(s.w, s.d, 0, 0, 0, 0.04);
      built = { w: s.w, d: s.d };
    }
    group.position.set(s.x, s.y, s.z);
    group.rotation.y = s.h;
    const pulse = 0.8 + Math.sin(time * 4) * 0.2;
    const c = s.status === 0 ? WHITE : GREEN;
    lineMat.color.copy(c);
    fillMat.color.copy(c);
    lineMat.opacity = s.status === 0 ? 0.6 + 0.35 * pulse : 0.95;
    fillMat.opacity = s.status === 0 ? 0.08 : 0.12 + s.hold * 0.25;
    arrow.visible = !!s.arrow;
    arrow.rotation.y = s.arrow === 'tail' ? Math.PI : 0;
    arrowMat.opacity = s.status === 2 ? 0.35 : 0.85;
  };
  return { group, set };
};

/** Dim outlines for the bays still to come in a chain (up to three). */
export const buildNextGuides = () => {
  const group = new THREE.Group();
  const mat = new THREE.MeshBasicMaterial({ color: GOLD, transparent: true, opacity: 0.45, depthWrite: false, toneMapped: false });
  const meshes = [0, 1, 2].map(() => {
    const m = new THREE.Mesh(outlineGeo(2.7, 5.1, 0.1, 0.042), mat);
    m.renderOrder = 3;
    group.add(m);
    return m;
  });
  const set = (bays: { x: number; y: number; z: number; h: number; w: number; d: number }[]) => {
    meshes.forEach((m, i) => {
      const b = bays[i];
      m.visible = !!b;
      if (!b) return;
      m.position.set(b.x, b.y, b.z);
      m.rotation.y = b.h;
      m.scale.set(b.w / 2.7, 1, b.d / 5.1);
    });
  };
  return { group, set };
};

/** The unpark level's exit: a pulsing ring with a soft fill. */
export const buildExitGuide = () => {
  const group = new THREE.Group();
  const ringMat = new THREE.MeshBasicMaterial({ color: GREEN, transparent: true, opacity: 0.9, depthWrite: false, toneMapped: false, side: THREE.DoubleSide });
  const fillMat = new THREE.MeshBasicMaterial({ color: GREEN, transparent: true, opacity: 0.12, depthWrite: false, toneMapped: false, side: THREE.DoubleSide });
  const ring = new THREE.Mesh(new THREE.RingGeometry(0.92, 1, 48).rotateX(-Math.PI / 2).translate(0, 0.05, 0), ringMat);
  const fill = new THREE.Mesh(new THREE.CircleGeometry(0.92, 48).rotateX(-Math.PI / 2).translate(0, 0.045, 0), fillMat);
  ring.renderOrder = fill.renderOrder = 3;
  group.add(fill, ring);
  group.visible = false;
  const set = (e: { x: number; y: number; z: number; r: number } | null, time: number) => {
    group.visible = !!e;
    if (!e) return;
    group.position.set(e.x, e.y, e.z);
    group.scale.set(e.r, 1, e.r);
    ringMat.opacity = 0.65 + Math.sin(time * 4) * 0.3;
  };
  return { group, set };
};

/** Metres of projected path, and the points per side. */
const PATH_LEN = 7;
const PATH_N = 28;

/**
 * The projected path: two thin ribbons on the ground where the car's sides will go at the present wheel angle (a bicycle
 * model about the rear axle, like the sim's). It starts at the bumper the car is moving towards and fades out over 7 m.
 */
export const buildPathGuide = () => {
  const count = 2 * PATH_N * 2;
  const pos = new Float32Array(count * 3);
  const col = new Float32Array(count * 3);
  const idx: number[] = [];
  for (let side = 0; side < 2; side++) {
    for (let i = 0; i < PATH_N - 1; i++) {
      const a = (side * PATH_N + i) * 2;
      idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  geo.setIndex(idx);
  const mat = new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false, side: THREE.DoubleSide });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.frustumCulled = false;
  mesh.renderOrder = 4;
  mesh.visible = false;
  /**
   * `steer` is the front wheel angle (positive right), `dir` +1 forwards / -1 backwards, `strength` 0..1 (fades in at low speed).
   */
  const set = (car: { x: number; y: number; z: number; h: number } | null, steer: number, dir: 1 | -1, strength: number) => {
    mesh.visible = !!car && strength > 0.02;
    if (!car || !mesh.visible) return;
    const k = Math.tan(steer) / CAR.wheelbase; // heading change per metre is -k (positive steer turns right), either way
    const halfW = CAR.width / 2 - 0.05;
    const tw = 0.07;
    // Walk the rear axle along the arc (backwards when reversing) and place the points at the leading bumper's two corners.
    let hx = car.h;
    let px = car.x + Math.sin(car.h) * CAR.rearAxle;
    let pz = car.z + Math.cos(car.h) * CAR.rearAxle;
    const along = dir > 0 ? CAR.length / 2 - CAR.rearAxle : -(CAR.length / 2 + CAR.rearAxle);
    const step = (dir * PATH_LEN) / (PATH_N - 1);
    for (let i = 0; i < PATH_N; i++) {
      const fx = Math.sin(hx);
      const fz = Math.cos(hx);
      const bx = px + fx * along;
      const bz = pz + fz * along;
      const c = 0.75 * Math.max(0, 1 - i / (PATH_N - 1)) * strength;
      for (let side = 0; side < 2; side++) {
        const sgn = side === 0 ? 1 : -1;
        const cx = bx + fz * halfW * sgn;
        const cz = bz - fx * halfW * sgn;
        const v = (side * PATH_N + i) * 2;
        pos.set([cx + fz * tw, car.y + 0.06, cz - fx * tw], v * 3);
        pos.set([cx - fz * tw, car.y + 0.06, cz + fx * tw], (v + 1) * 3);
        col.set([c, c * 0.9, c * 0.35], v * 3);
        col.set([c, c * 0.9, c * 0.35], (v + 1) * 3);
      }
      px += fx * step;
      pz += fz * step;
      hx -= k * step;
    }
    geo.attributes.position.needsUpdate = true;
    geo.attributes.color.needsUpdate = true;
  };
  return { mesh, set };
};
