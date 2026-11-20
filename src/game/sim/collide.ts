/**
 * 2D collision for convex shapes: boxes (kerbs, islands, posts), cars (a box carrying its real plan outline, a convex polygon;
 * see sim/body.ts) and circles (lamps, cones, shoppers).
 *
 * Polygon vs polygon uses the separating axis theorem (SAT): two convex shapes overlap only if they overlap when projected
 * onto every edge normal of both. The axis with the least overlap is the direction to push them apart, and the overlap is how
 * far. There is no margin: shapes that do not overlap do not touch. A car's outline sits on its drawn body (within half a
 * centimetre), so a touch here is a touch you can see.
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

/** The shape's outline in the world: a car's plan outline if it has one, otherwise the box's four corners. */
export const outlineOf = (b: Box): Vec[] => {
  if (!b.outline) return corners(b);
  const { fx, fz, sx, sz } = axes(b);
  // Car frame: x to the right (the box's `s` axis, see `corners`), z to the nose.
  return b.outline.map(([x, z]) => ({ x: b.x + sx * x + fx * z, z: b.z + sz * x + fz * z }));
};

/** Is p inside (or on) the convex polygon `poly`, whichever way round it runs? */
const insidePoly = (p: Vec, poly: Vec[]) => {
  let pos = false;
  let neg = false;
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i];
    const b = poly[(i + 1) % poly.length];
    const c = (b.x - a.x) * (p.z - a.z) - (b.z - a.z) * (p.x - a.x);
    if (c > 1e-9) pos = true;
    else if (c < -1e-9) neg = true;
    if (pos && neg) return false;
  }
  return true;
};

/**
 * Smallest overlap of two convex polygons over the edge normals of `p` (all of them, or the first two for a box, whose other
 * two are parallel to those), or null when one of them separates the two.
 */
const minOverlap = (p: Vec[], q: Vec[], edges: number, best: { d: number; nx: number; nz: number }) => {
  for (let i = 0; i < edges; i++) {
    const a = p[i];
    const b = p[(i + 1) % p.length];
    let ax = b.z - a.z;
    let az = a.x - b.x;
    const l = Math.hypot(ax, az);
    if (l < 1e-9) continue;
    ax /= l;
    az /= l;
    const [a0, a1] = project(p, ax, az);
    const [b0, b1] = project(q, ax, az);
    const overlap = Math.min(a1, b1) - Math.max(a0, b0);
    if (overlap <= 0) return false;
    if (overlap < best.d) {
      best.d = overlap;
      best.nx = ax;
      best.nz = az;
    }
  }
  return true;
};

/** Where segments a-b and c-d cross, or null. */
const crossing = (a: Vec, b: Vec, c: Vec, d: Vec): Vec | null => {
  const rx = b.x - a.x;
  const rz = b.z - a.z;
  const sx = d.x - c.x;
  const sz = d.z - c.z;
  const den = rx * sz - rz * sx;
  if (Math.abs(den) < 1e-12) return null;
  const t = ((c.x - a.x) * sz - (c.z - a.z) * sx) / den;
  const u = ((c.x - a.x) * rz - (c.z - a.z) * rx) / den;
  return t >= 0 && t <= 1 && u >= 0 && u <= 1 ? { x: a.x + rx * t, z: a.z + rz * t } : null;
};

/** Two boxes (or cars): rectangles first (cheap), then the real outlines if either has one. */
const boxBox = (a: Box, b: Box): Contact | null => {
  const ra = corners(a);
  const rb = corners(b);
  const best = { d: Infinity, nx: 0, nz: 0 };
  // Their bounding rectangles do not touch: nor do the outlines inside them (this is most near misses, so it goes first).
  if (!minOverlap(ra, rb, 2, best) || !minOverlap(rb, ra, 2, best)) return null;
  const pa = a.outline ? outlineOf(a) : ra;
  const pb = b.outline ? outlineOf(b) : rb;
  if (a.outline || b.outline) {
    best.d = Infinity;
    if (!minOverlap(pa, pb, a.outline ? pa.length : 2, best) || !minOverlap(pb, pa, b.outline ? pb.length : 2, best)) return null;
  }
  let { nx, nz } = best;
  // Point the normal from A to B.
  if ((b.x - a.x) * nx + (b.z - a.z) * nz < 0) {
    nx = -nx;
    nz = -nz;
  }
  // Contact point: the middle of the overlap, from its corners (either shape's corners inside the other, and where their edges
  // cross). That is where they really touch, so the lever arm (and the closing speed there) is right.
  let px = 0;
  let pz = 0;
  let n = 0;
  const add = (p: Vec) => {
    px += p.x;
    pz += p.z;
    n++;
  };
  for (const p of pb) if (insidePoly(p, pa)) add(p);
  for (const p of pa) if (insidePoly(p, pb)) add(p);
  for (let i = 0; i < pa.length; i++) {
    for (let j = 0; j < pb.length; j++) {
      const x = crossing(pa[i], pa[(i + 1) % pa.length], pb[j], pb[(j + 1) % pb.length]);
      if (x) add(x);
    }
  }
  if (n === 0) {
    px = (a.x + b.x) / 2;
    pz = (a.z + b.z) / 2;
  } else {
    px /= n;
    pz /= n;
  }
  return { nx, nz, depth: best.d, px, pz };
};

/** A box (or car) and a circle: the nearest point of the outline to the centre. */
const boxCircle = (a: Box, c: Circle): Contact | null => {
  const dx = c.x - a.x;
  const dz = c.z - a.z;
  if (dx * dx + dz * dz > (Math.hypot(a.hw, a.hl) + c.r) ** 2) return null;
  const poly = outlineOf(a);
  let qx = 0;
  let qz = 0;
  let d2 = Infinity;
  let ei = 0;
  for (let i = 0; i < poly.length; i++) {
    const p = poly[i];
    const q = poly[(i + 1) % poly.length];
    const ex = q.x - p.x;
    const ez = q.z - p.z;
    const t = Math.max(0, Math.min(1, ((c.x - p.x) * ex + (c.z - p.z) * ez) / (ex * ex + ez * ez || 1)));
    const x = p.x + ex * t;
    const z = p.z + ez * t;
    const e2 = (c.x - x) ** 2 + (c.z - z) ** 2;
    if (e2 < d2) (d2 = e2), (qx = x), (qz = z), (ei = i);
  }
  const d = Math.sqrt(d2);
  if (!insidePoly(c, poly)) {
    if (d > c.r) return null;
    if (d > 1e-9) return { nx: (c.x - qx) / d, nz: (c.z - qz) / d, depth: c.r - d, px: qx, pz: qz };
  }
  // Centre inside the outline: push out through the nearest edge.
  const p = poly[ei];
  const q = poly[(ei + 1) % poly.length];
  let nx = q.z - p.z;
  let nz = p.x - q.x;
  const l = Math.hypot(nx, nz) || 1;
  nx /= l;
  nz /= l;
  if ((p.x - a.x) * nx + (p.z - a.z) * nz < 0) {
    nx = -nx;
    nz = -nz;
  }
  return { nx, nz, depth: d + c.r, px: qx, pz: qz };
};

/** Contact between a box (a car, with its outline, wherever it matters) and any shape, normal from the box to the shape. */
export const collide = (a: Box, b: Shape): Contact | null => (b.kind === 'box' ? boxBox(a, b) : boxCircle(a, b));

/** Cheap reject: bounding circles. */
export const nearShape = (a: Box, b: Shape) => {
  const ra = Math.hypot(a.hw, a.hl);
  const rb = b.kind === 'box' ? Math.hypot(b.hw, b.hl) : b.r;
  const dx = a.x - b.x;
  const dz = a.z - b.z;
  return dx * dx + dz * dz < (ra + rb) * (ra + rb);
};
