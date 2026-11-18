/**
 * The car park in front of the market: angled bays in double rows with planted islands between
 * them, one-way aisles, a wide apron at the entrance where the cars line up, and the store to the
 * north. Everything the rules and the renderer need comes from `buildLot()`, so the picture and
 * the physics can never disagree.
 */
import { CAR } from './constants';

export interface Vec { x: number; z: number }

/** An oriented box: centre, half sizes along its own axes, and heading (see constants.ts). */
export interface Box { kind: 'box'; x: number; z: number; hw: number; hl: number; h: number }
export interface Circle { kind: 'circle'; x: number; z: number; r: number }
export type Shape = Box | Circle;

export type BayUse = 'car' | 'free' | 'corral' | 'cones';

export interface Bay {
  id: number;
  /** Centre of the painted rectangle. */
  x: number;
  z: number;
  /** Heading of a car parked nose-in. */
  h: number;
  /** Unit vector from the mouth into the bay. */
  ax: number;
  az: number;
  /** Which aisle the mouth opens onto (index into `Lot.aisles`), and that aisle's direction of travel. */
  aisle: number;
  flow: 1 | -1;
  use: BayUse;
  /** For parked cars: body style and paint. */
  variant: number;
  color: number;
}

export interface Aisle {
  /** Centre line z, and its x span. */
  z: number;
  x0: number;
  x1: number;
  width: number;
  /** One-way direction along x (0 = two-way). */
  flow: 1 | -1 | 0;
}

export interface Island { x0: number; x1: number; z0: number; z1: number }

export interface Lot {
  bays: Bay[];
  aisles: Aisle[];
  islands: Island[];
  /** Static colliders (parked cars, islands, kerbs, posts, the store). */
  solids: Shape[];
  /** Lamp posts on the islands (render + collision). */
  lamps: Vec[];
  /** Bay painting: each stripe from a to b. */
  stripes: { a: Vec; b: Vec }[];
  /** Where the racers line up, all facing north. */
  starts: { x: number; z: number; h: number }[];
  /** Painted start line. */
  startLine: number;
  /** Outer edge of the drivable area. */
  bounds: { x0: number; x1: number; z0: number; z1: number };
  /** The store's footprint and its front (the pavement edge). */
  store: { x0: number; x1: number; z0: number; z1: number; kerb: number };
  /** Bays that can be the target this round. */
  candidates: number[];
}

export const BAY = {
  width: 2.7,
  depth: 5.4,
  /** Angle between the bay and the aisle. */
  angle: (60 * Math.PI) / 180,
} as const;

/** Depth of a half row measured north–south, and the spacing of stripes along the row. */
export const BAND = BAY.depth * Math.sin(BAY.angle);
export const PITCH = BAY.width / Math.sin(BAY.angle);
export const ISLAND = 1.8;
export const AISLE = 8;

/** Small, deterministic random numbers so every browser builds the same lot from the same seed. */
export const rng = (seed: number) => {
  let s = seed >>> 0 || 1;
  return () => {
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    return ((s >>> 0) % 100000) / 100000;
  };
};

const PAINT = [0xf2f2ee, 0xc9ccd2, 0x1c1e22, 0x6d727a, 0x24324f, 0x7a1f24, 0x2f4a3a, 0xb7a58c, 0x9aa7b5, 0x404650, 0x5b6b84, 0xe9e6dc];

/**
 * Builds the lot. `seed` only decides which bays hold which parked car; the layout is fixed.
 */
export const buildLot = (seed = 7): Lot => {
  const rand = rng(seed);
  const rowX0 = -33;
  const rowX1 = 33;
  const bounds = { x0: -44, x1: 44, z0: -42, z1: 30 };

  // South to north: apron (two-way), then double rows with aisles between, then the fire lane.
  const aisles: Aisle[] = [];
  const islands: Island[] = [];
  const bays: Bay[] = [];
  const stripes: { a: Vec; b: Vec }[] = [];
  const solids: Shape[] = [];
  const lamps: Vec[] = [];

  let z = bounds.z0;
  const apron = 14;
  aisles.push({ z: z + apron / 2, x0: bounds.x0, x1: bounds.x1, width: apron, flow: 0 });
  z += apron;

  // Three double rows. The aisle flows alternate so the whole lot is a one-way snake (east, west, east).
  const rowFlows: [1 | -1, 1 | -1][] = [
    [1, -1],
    [-1, 1],
    [1, -1],
  ];
  const flowsOfAisle: (1 | -1)[] = [-1, 1, -1];
  let bayId = 0;
  rowFlows.forEach(([southFlow, northFlow], row) => {
    const southAisle = aisles.length - 1;
    const southEdge = z;
    const islandZ0 = z + BAND;
    const islandZ1 = islandZ0 + ISLAND;
    const northEdge = islandZ1 + BAND;
    islands.push({ x0: rowX0, x1: rowX1, z0: islandZ0, z1: islandZ1 });
    const northAisle = southAisle + 1;
    aisles.push({ z: northEdge + AISLE / 2, x0: bounds.x0, x1: bounds.x1, width: AISLE, flow: flowsOfAisle[row] });

    // Each half row: `side` +1 when the bays lie north of their aisle (mouth on the south edge).
    const halves: { mouthZ: number; side: 1 | -1; flow: 1 | -1; aisle: number }[] = [
      { mouthZ: southEdge, side: 1, flow: southFlow, aisle: southAisle },
      { mouthZ: northEdge, side: -1, flow: northFlow, aisle: northAisle },
    ];
    for (const half of halves) {
      const ax = half.flow * Math.cos(BAY.angle);
      const az = half.side * Math.sin(BAY.angle);
      const h = Math.atan2(ax, az);
      // Stripes run from the mouth into the band; their far end is shifted along x by depth·cos.
      const shift = BAY.depth * Math.cos(BAY.angle) * half.flow;
      const start = half.flow > 0 ? rowX0 + 0.6 : rowX0 + 0.6 + Math.abs(shift);
      const end = half.flow > 0 ? rowX1 - 0.6 - Math.abs(shift) : rowX1 - 0.6;
      const count = Math.floor((end - start) / PITCH);
      for (let i = 0; i <= count; i++) {
        const mx = start + i * PITCH;
        stripes.push({ a: { x: mx, z: half.mouthZ }, b: { x: mx + shift, z: half.mouthZ + BAND * half.side } });
        if (i === count) break;
        const cx = mx + PITCH / 2 + ax * (BAY.depth / 2);
        const cz = half.mouthZ + az * (BAY.depth / 2);
        bays.push({ id: bayId++, x: cx, z: cz, h, ax, az, aisle: half.aisle, flow: half.flow, use: 'car', variant: 0, color: 0 });
      }
    }

    // Lamp posts along the island, and the island itself as a solid (with round planted ends).
    const midZ = (islandZ0 + islandZ1) / 2;
    for (let x = rowX0 + 6; x <= rowX1 - 5; x += 16.5) lamps.push({ x, z: midZ });
    // The collider is a little narrower than the painted kerb: a car parked deep in a bay may overhang it, as in life.
    solids.push({ kind: 'box', x: 0, z: midZ, hw: ISLAND / 2 - 0.3, hl: (rowX1 - rowX0) / 2, h: Math.PI / 2 });
    // Row ends: a planted bulb wider than the island, with a tree in it.
    solids.push({ kind: 'circle', x: rowX0 - 0.3, z: midZ, r: 1.4 });
    solids.push({ kind: 'circle', x: rowX1 + 0.3, z: midZ, r: 1.4 });
    z = northEdge + AISLE;
  });
  // The last aisle runs along the store front as a fire lane.
  const kerb = z;

  // What stands in each bay. Some bays hold a trolley corral (a real lot has a few), a couple are coned off.
  for (const bay of bays) {
    const r = rand();
    if (r < 0.04) bay.use = 'corral';
    else if (r < 0.07) bay.use = 'cones';
    else bay.use = 'car';
    bay.variant = rand() < 0.62 ? 0 : rand() < 0.6 ? 1 : 2;
    bay.color = PAINT[Math.floor(rand() * PAINT.length)];
  }

  // Candidates for the free bay: any bay holding a parked car (one of them is emptied per round),
  // but not the ones facing the apron next to the start line, so the race always means a drive.
  // Also not the first few bays at the upstream end of a row: there is no room to swing in from
  // the end aisle at that angle.
  const candidates = bays
    .filter((b) => b.use === 'car' && b.aisle > 0)
    .filter((b) => (approachOf(b, aisles[b.aisle]).a0.x - END_AISLE * -b.flow) * b.flow > 1)
    .map((b) => b.id);

  // Kerbs around the lot: four long walls with the store's pavement on the north.
  const wall = (x0: number, z0: number, x1: number, z1: number) => {
    const cx = (x0 + x1) / 2;
    const cz = (z0 + z1) / 2;
    const len = Math.hypot(x1 - x0, z1 - z0);
    solids.push({ kind: 'box', x: cx, z: cz, hw: 0.5, hl: len / 2, h: Math.atan2(x1 - x0, z1 - z0) });
  };
  wall(bounds.x0 - 0.5, bounds.z0, bounds.x0 - 0.5, kerb);
  wall(bounds.x1 + 0.5, bounds.z0, bounds.x1 + 0.5, kerb);
  wall(bounds.x0, bounds.z0 - 0.5, bounds.x1, bounds.z0 - 0.5);
  wall(bounds.x0, kerb + 0.5, bounds.x1, kerb + 0.5);
  for (const lamp of lamps) solids.push({ kind: 'circle', x: lamp.x, z: lamp.z, r: 0.25 });

  const store = { x0: -30, x1: 30, z0: kerb + 5, z1: kerb + 35, kerb };

  const startLine = bounds.z0 + 6.2;
  const gap = CAR.width + 1.7;
  const starts = [-1.5, -0.5, 0.5, 1.5].map((k) => ({ x: k * gap, z: bounds.z0 + 3, h: 0 }));

  return { bays, aisles, islands, solids, lamps, stripes, starts, startLine, bounds: { ...bounds, z1: kerb }, store, candidates };
};

/** Centre line of the end aisles that join the rows (x = ±END_AISLE). */
export const END_AISLE = 38.5;

/**
 * How to drive into a bay: come along the aisle in its flow (a0), turn in at a1 on the bay's
 * centre line, cross the mouth, stop at the end. Bots follow it; the lot uses it to rule out bays
 * that can't be reached at their angle.
 */
export const approachOf = (bay: Bay, aisle: Aisle) => {
  const mouth = { x: bay.x - bay.ax * (BAY.depth / 2), z: bay.z - bay.az * (BAY.depth / 2) };
  const a1 = { x: mouth.x - bay.ax * 3.6, z: mouth.z - bay.az * 3.6 };
  const a0 = { x: a1.x - bay.flow * 8, z: aisle.z };
  const enter = { x: mouth.x + bay.ax * 1.2, z: mouth.z + bay.az * 1.2 };
  const end = { x: bay.x + bay.ax * 0.15, z: bay.z + bay.az * 0.15 };
  return { a0, a1, enter, end };
};

/** Collider for a parked car or other bay contents. */
export const bayShape = (bay: Bay): Shape | null => {
  if (bay.use === 'free') return null;
  if (bay.use === 'car') return { kind: 'box', x: bay.x, z: bay.z, hw: CAR.width / 2 - 0.02, hl: CAR.length / 2 - 0.02, h: bay.h };
  if (bay.use === 'corral') return { kind: 'box', x: bay.x, z: bay.z, hw: 0.9, hl: 2.4, h: bay.h };
  return { kind: 'circle', x: bay.x - bay.ax * 1.8, z: bay.z - bay.az * 1.8, r: 0.35 };
};
