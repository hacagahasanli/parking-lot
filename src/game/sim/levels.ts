/**
 * Levels. The rules are 2D (x, z); a level is a height, and a body belongs to the level it is
 * standing on. The multi-storey car park is a stack of identical decks joined by ramps. Two things
 * on different levels never touch, even when they share the same x and z; a ramp joins two levels
 * and the height of a car on it follows its position.
 */
import type { Vec } from './lot';

/** Floor to floor (m). The slab is 0.5 m thick, so the clear height under a deck is `LEVEL_H - 0.5`. */
export const LEVEL_H = 3.6;
export const SLAB = 0.5;

/** The decks, bottom to top: P-1 underground, P0 the ground floor, P1 and P2 (the open roof). */
export const LEVELS = [-1, 0, 1, 2] as const;

export const levelY = (lvl: number) => lvl * LEVEL_H;
/** Which level a height belongs to (a car half way up a ramp rounds to one end). */
export const levelOf = (y: number) => Math.round(y / LEVEL_H);
export const levelName = (lvl: number) => `P${lvl}`;

/** Paint colour of each level (CSS hex numbers): blue underground, orange ground floor, green, then yellow on the roof. */
export const LEVEL_COLOR: Record<number, number> = { [-1]: 0x2f7be0, 0: 0xf07a22, 1: 0x2fb35a, 2: 0xf2c230 };

/** A sloped road between two levels. `rise` is +1 when it climbs towards +x, -1 towards -x. */
export interface Ramp {
  id: number;
  x0: number;
  x1: number;
  z0: number;
  z1: number;
  lo: number;
  hi: number;
  rise: 1 | -1;
}

/** A flat part of the structure (or the open ground): a rectangle at one level. */
export interface Floor {
  x0: number;
  x1: number;
  z0: number;
  z1: number;
  lvl: number;
}

export interface Surfaces {
  ramps: Ramp[];
  floors: Floor[];
}

/** 0 at the low end of a ramp, 1 at the high end. */
export const rampT = (r: Ramp, x: number) => {
  const t = (x - r.x0) / (r.x1 - r.x0);
  return Math.max(0, Math.min(1, r.rise > 0 ? t : 1 - t));
};

export const rampY = (r: Ramp, x: number) => levelY(r.lo) + rampT(r, x) * (levelY(r.hi) - levelY(r.lo));

const inRect = (x: number, z: number, r: { x0: number; x1: number; z0: number; z1: number }) => x >= r.x0 && x <= r.x1 && z >= r.z0 && z <= r.z1;

/**
 * The height of the road under (x, z) for a body currently at height `y`: the nearest of the ramp
 * surfaces and floors there (stacked decks and ramps share the same x and z, and the nearest one to
 * where the body already is is the one it is on). Unchanged when nothing is under it.
 */
export const surfaceAt = (s: Surfaces, x: number, z: number, y: number): number => {
  let best = Infinity;
  let bestD = Infinity;
  for (const r of s.ramps) {
    if (!inRect(x, z, r)) continue;
    const h = rampY(r, x);
    if (Math.abs(h - y) < bestD) (bestD = Math.abs(h - y)), (best = h);
  }
  for (const f of s.floors) {
    if (!inRect(x, z, f)) continue;
    const h = levelY(f.lvl);
    if (Math.abs(h - y) < bestD) (bestD = Math.abs(h - y)), (best = h);
  }
  return bestD === Infinity ? y : best;
};

/** The ramp under a point at height y, if the body is on one (not on a flat floor). */
export const rampUnder = (s: Surfaces, x: number, z: number, y: number): Ramp | null => {
  for (const r of s.ramps) if (inRect(x, z, r) && Math.abs(rampY(r, x) - y) < 0.6) return r;
  return null;
};

/** Do two heights belong to the same storey (so the bodies can touch)? */
export const sameStorey = (a: number, b: number) => Math.abs(a - b) < 1.7;

export type { Vec };

/**
 * The deck a body at (x, z) and height y stands on: the lower deck of the ramp it is on (a ramp is
 * built, and hidden, with the deck it climbs from), the level of the floor it is on, or null when it
 * is outside the car park, on the ground.
 */
export const deckUnder = (g: { x0: number; x1: number; z0: number; z1: number; ramps: Ramp[] }, x: number, z: number, y: number): number | null => {
  if (!(x > g.x0 && x < g.x1 && z > g.z0 && z < g.z1)) return null;
  for (const r of g.ramps) if (inRect(x, z, r) && Math.abs(rampY(r, x) - y) < 0.6) return r.lo;
  return levelOf(y);
};

/**
 * Is deck `l` drawn when the camera follows a body on `level` (null: outside the car park, every deck
 * is drawn)? From inside, only the deck you are on and the ones next to it; with a high camera, none
 * above you, so it can look in from above.
 */
export const deckShown = (l: number, level: number | null, hideAbove = false) => level === null || (Math.abs(l - level) <= 1 && !(hideAbove && l > level));
