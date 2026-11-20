/**
 * What a driver can make out: the numbers for how far and how wide it sees, the line-of-sight test against tall things
 * (a van, the truck, a hedge), and, for choosing the free bay, whether any bot could ever see a given bay.
 */
import type { Box, Lot } from './lot';

/**
 * How far a driver can make out an empty bay, and how wide its view is. `range` is what choosing the free bay counts on (every
 * candidate can be made out from within it); `notice` is how far a bot driving down the aisle really notices one. It is a little
 * further, because a bay seen any later is already too close to swing into from the far side of the aisle (the swing starts
 * about 11 m before the bay), and the bot would have to go round the deck again.
 */
export const SIGHT = { range: 14, notice: 18, cone: (75 * Math.PI) / 180, peek: 7, react: 0.35 } as const;

const wrap = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));

/** Does the straight line from a to b pass through a box (a hedge, a van)? */
export const crosses = (ax: number, az: number, bx: number, bz: number, s: Box) => {
  const fx = Math.sin(s.h);
  const fz = Math.cos(s.h);
  const loc = (x: number, z: number) => ({ f: (x - s.x) * fx + (z - s.z) * fz, s: (x - s.x) * fz - (z - s.z) * fx });
  const p = loc(ax, az);
  const q = loc(bx, bz);
  let t0 = 0;
  let t1 = 1;
  for (const [a, b, h] of [
    [p.f, q.f, s.hl],
    [p.s, q.s, s.hw],
  ]) {
    const d = b - a;
    if (Math.abs(d) < 1e-9) {
      if (Math.abs(a) > h) return false;
      continue;
    }
    let u0 = (-h - a) / d;
    let u1 = (h - a) / d;
    if (u0 > u1) [u0, u1] = [u1, u0];
    t0 = Math.max(t0, u0);
    t1 = Math.min(t1, u1);
    if (t0 > t1) return false;
  }
  return true;
};

/**
 * Can a bot driving the bay's own aisle ever make the bay out? Along the aisle's lanes it needs a stretch (about a third of a
 * second at cruising speed is 3 m, and with a margin for the wobble 4 m) where the bay is within range, inside the view cone and not hidden behind a van or a hedge.
 * A bay with a van beside it, on a one-way aisle, can be hidden from every point a car is allowed to look from: such a bay is
 * fine for a person but would never be found by the bots, so a stage does not pick it as the free bay.
 */
export const spottable = (lot: Lot, bayId: number) => {
  const bay = lot.bays[bayId];
  const tall = lot.occluders.filter((o): o is Box => o.kind === 'box' && (o.y0 === undefined || (o.y0 < bay.y + 1.5 && (o.y1 ?? Infinity) > bay.y)));
  for (const e of lot.graph.edges) {
    if (e.aisle !== bay.aisle || e.closed) continue;
    const h = Math.atan2(e.ux, e.uz);
    let run = 0;
    for (let t = 0; t <= e.len; t += 0.5) {
      const x = e.a.x + e.ux * t;
      const z = e.a.z + e.uz * t;
      const dx = bay.x - x;
      const dz = bay.z - z;
      const d = Math.hypot(dx, dz);
      const seen = d <= SIGHT.range && (d < 4 || Math.abs(wrap(Math.atan2(dx, dz) - h)) < SIGHT.cone) && !tall.some((o) => crosses(x, z, bay.x, bay.z, o));
      run = seen ? run + 0.5 : 0;
      if (run >= 4) return true;
    }
  }
  return false;
};

