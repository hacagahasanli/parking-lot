/**
 * 2D collision for boxes (cars, kerbs, parked cars) and circles (posts, planted row ends).
 *
 * Box vs box uses the separating axis theorem (SAT): two convex shapes overlap only if they
 * overlap when projected onto every edge normal of both. The axis with the least overlap is the
 * direction to push them apart, and the overlap is how far.
 */
import type { Box, Circle, Shape, Vec } from './lot';

export interface Contact {
  /** Unit normal pointing from A towards B. */
  nx: number;
  nz: number;
  /** Penetration depth (m). */
  depth: number;
  /** World point where they touch. */
  px: number;
  pz: number;
}

/** The box's own axes: `f` along its length (heading), `s` across it. */
const axes = (b: Box) => {
  const fx = Math.sin(b.h);
  const fz = Math.cos(b.h);
  return { fx, fz, sx: fz, sz: -fx };
};

export const corners = (b: Box): Vec[] => {
  const { fx, fz, sx, sz } = axes(b);
  const out: Vec[] = [];
  for (const [a, c] of [
    [1, 1],
    [1, -1],
    [-1, -1],
    [-1, 1],
  ]) {
    out.push({ x: b.x + fx * b.hl * a + sx * b.hw * c, z: b.z + fz * b.hl * a + sz * b.hw * c });
  }
  return out;
};

/** Is a point inside a box (with an optional margin, negative to shrink)? */
export const insideBox = (p: Vec, b: Box, margin = 0) => {
  const { fx, fz, sx, sz } = axes(b);
  const dx = p.x - b.x;
  const dz = p.z - b.z;
  return Math.abs(dx * fx + dz * fz) <= b.hl + margin && Math.abs(dx * sx + dz * sz) <= b.hw + margin;
};

const project = (pts: Vec[], ax: number, az: number) => {
  let lo = Infinity;
  let hi = -Infinity;
  for (const p of pts) {
    const d = p.x * ax + p.z * az;
    if (d < lo) lo = d;
    if (d > hi) hi = d;
  }
  return [lo, hi] as const;
};

const boxBox = (a: Box, b: Box): Contact | null => {
  const ca = corners(a);
  const cb = corners(b);
  const A = axes(a);
  const B = axes(b);
  let best = Infinity;
  let nx = 0;
  let nz = 0;
  for (const [ax, az] of [
    [A.fx, A.fz],
    [A.sx, A.sz],
    [B.fx, B.fz],
    [B.sx, B.sz],
  ]) {
    const [a0, a1] = project(ca, ax, az);
    const [b0, b1] = project(cb, ax, az);
    const overlap = Math.min(a1, b1) - Math.max(a0, b0);
    if (overlap <= 0) return null;
    if (overlap < best) {
      best = overlap;
      nx = ax;
      nz = az;
    }
  }
  // Point the normal from A to B.
  if ((b.x - a.x) * nx + (b.z - a.z) * nz < 0) {
    nx = -nx;
    nz = -nz;
  }
  // Contact point: the corners of either box that sit inside the other, averaged.
  let px = 0;
  let pz = 0;
  let n = 0;
  for (const p of cb) if (insideBox(p, a, 0.02)) (px += p.x), (pz += p.z), n++;
  for (const p of ca) if (insideBox(p, b, 0.02)) (px += p.x), (pz += p.z), n++;
  if (n === 0) {
    // Edge across edge (no corner inside): use the midpoint between the centres, nudged to A's face.
    px = (a.x + b.x) / 2;
    pz = (a.z + b.z) / 2;
  } else {
    px /= n;
    pz /= n;
  }
  return { nx, nz, depth: best, px, pz };
};

const boxCircle = (a: Box, c: Circle): Contact | null => {
  const { fx, fz, sx, sz } = axes(a);
  const dx = c.x - a.x;
  const dz = c.z - a.z;
  const lf = Math.max(-a.hl, Math.min(a.hl, dx * fx + dz * fz));
  const ls = Math.max(-a.hw, Math.min(a.hw, dx * sx + dz * sz));
  const qx = a.x + fx * lf + sx * ls;
  const qz = a.z + fz * lf + sz * ls;
  let ex = c.x - qx;
  let ez = c.z - qz;
  const d = Math.hypot(ex, ez);
  if (d > c.r) return null;
  if (d < 1e-6) {
    // Centre inside the box: push out along the nearest face.
    const pf = a.hl - Math.abs(dx * fx + dz * fz);
    const ps = a.hw - Math.abs(dx * sx + dz * sz);
    if (pf < ps) {
      const sg = Math.sign(dx * fx + dz * fz) || 1;
      return { nx: fx * sg, nz: fz * sg, depth: pf + c.r, px: qx, pz: qz };
    }
    const sg = Math.sign(dx * sx + dz * sz) || 1;
    return { nx: sx * sg, nz: sz * sg, depth: ps + c.r, px: qx, pz: qz };
  }
  ex /= d;
  ez /= d;
  return { nx: ex, nz: ez, depth: c.r - d, px: qx, pz: qz };
};

/** Contact between a box (always a car here) and any shape, normal from the box to the shape. */
export const collide = (a: Box, b: Shape): Contact | null => (b.kind === 'box' ? boxBox(a, b) : boxCircle(a, b));

/** Cheap reject: bounding circles. */
export const nearShape = (a: Box, b: Shape) => {
  const ra = Math.hypot(a.hw, a.hl);
  const rb = b.kind === 'box' ? Math.hypot(b.hw, b.hl) : b.r;
  const dx = a.x - b.x;
  const dz = a.z - b.z;
  return dx * dx + dz * dz < (ra + rb) * (ra + rb);
};
