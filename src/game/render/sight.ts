/** 2D tests for the chase camera: does the line from the car to the camera pass through a wall or a column? */
import type { Shape } from '../sim/lot';

/** Where along the segment a-b (0..1) it first meets the shape, or null. */
export const circleHit = (ax: number, az: number, bx: number, bz: number, cx: number, cz: number, r: number): number | null => {
  const dx = bx - ax;
  const dz = bz - az;
  const l2 = dx * dx + dz * dz || 1;
  const t = Math.max(0, Math.min(1, ((cx - ax) * dx + (cz - az) * dz) / l2));
  const d = Math.hypot(ax + dx * t - cx, az + dz * t - cz);
  return d < r ? Math.max(0, t - r / Math.sqrt(l2)) : null;
};

export const boxHit = (ax: number, az: number, bx: number, bz: number, s: Extract<Shape, { kind: 'box' }>): number | null => {
  const fx = Math.sin(s.h);
  const fz = Math.cos(s.h);
  const loc = (x: number, z: number) => ({ f: (x - s.x) * fx + (z - s.z) * fz, s: (x - s.x) * fz - (z - s.z) * fx });
  const p = loc(ax, az);
  const q = loc(bx, bz);
  let t0 = 0;
  let t1 = 1;
  for (const [a, b, h] of [
    [p.f, q.f, s.hl + 0.25],
    [p.s, q.s, s.hw + 0.25],
  ]) {
    const d = b - a;
    if (Math.abs(d) < 1e-9) {
      if (Math.abs(a) > h) return null;
      continue;
    }
    let u0 = (-h - a) / d;
    let u1 = (h - a) / d;
    if (u0 > u1) [u0, u1] = [u1, u0];
    t0 = Math.max(t0, u0);
    t1 = Math.min(t1, u1);
    if (t0 > t1) return null;
  }
  return t0;
};

export type Seg = { s: Shape };
