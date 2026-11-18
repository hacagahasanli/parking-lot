/**
 * The car park of a big-box retail park: an entry road with two boom barriers and a ticket booth,
 * a two-way main road, one-way angled rows, 90 degree two-way rows, a solar carport over an EV
 * row, bays by the store door for disabled drivers and parents, a delivery yard with a parked
 * truck, parallel bays along a service road, a dead-end pocket, and an exit gate. Everything the
 * rules and the renderer need comes from `buildLot()`, so the picture and the physics can never
 * disagree.
 *
 * Axes (see constants.ts): x east, z north. The street is to the south, the stores to the north.
 */
import { CAR } from './constants';
import { collide } from './collide';
import { buildGraph, reachableFrom } from './nav';

import type { GNode, Graph } from './nav';

export interface Vec { x: number; z: number }

/** An oriented box: centre, half sizes along its own axes, and heading (see constants.ts). */
export interface Box { kind: 'box'; x: number; z: number; hw: number; hl: number; h: number }
export interface Circle { kind: 'circle'; x: number; z: number; r: number }
export type Shape = Box | Circle;

export type BayUse = 'car' | 'free' | 'corral' | 'cones';
export type BayType = 'angled' | 'perp' | 'parallel';
export type BayTag = 'ev' | 'disabled' | 'parent' | 'canopy' | 'pocket' | 'kerb';

/**
 * One way of driving into a bay. `dock` is the point on a lane (`edge`, `s` metres along it) where
 * the bay's own path leaves the aisle; `tail` runs from there and always ends with the three points
 * the final line-up uses: where the car is square to the bay, the mouth, and the stopping point.
 */
export interface Approach {
  /** +1 / -1: travelling along / against the aisle's node order. */
  dir: 1 | -1;
  edge: number;
  s: number;
  dock: Vec;
  tail: Vec[];
}

export interface Bay {
  id: number;
  /** Centre of the painted rectangle. */
  x: number;
  z: number;
  /** Heading of a car parked nose-in (for parallel bays: along the kerb). */
  h: number;
  /** Unit vector from the mouth into the bay. */
  ax: number;
  az: number;
  /** Width across and depth along the axis (m). */
  w: number;
  d: number;
  type: BayType;
  tags: BayTag[];
  /** Which aisle the mouth opens onto (index into `Lot.aisles`), and for angled bays the x direction of travel they are angled for. */
  aisle: number;
  flow: 1 | -1;
  use: BayUse;
  /** For parked cars: body style (0-2 cars, 3 SUV, 4 van) and paint. */
  variant: number;
  color: number;
  /** Ways in. Empty for bays bots cannot take (parallel bays, the dead-end pocket). */
  approach: Approach[];
}

export interface Aisle {
  id: number;
  name: string;
  /** Node ids in the direction of the one-way flow (or just in order for a two-way aisle). */
  nodes: number[];
  width: number;
  oneWay: boolean;
  /** Not for bots (entry and exit lanes, the dead end). */
  avoid: boolean;
  kind: 'road' | 'aisle' | 'entry' | 'exit' | 'pocket';
}

export type IslandKind = 'planter' | 'hedge' | 'canopy' | 'chargers' | 'lawn';
export interface Island { x0: number; x1: number; z0: number; z1: number; kind: IslandKind }

export interface Canopy { x0: number; x1: number; z0: number; z1: number; h: number }

export interface Gate {
  kind: 'entry' | 'exit';
  /** The arm's pivot (at the booth side) and its tip when down, and the z of the barrier line. */
  px: number;
  tx: number;
  z: number;
  /** Collider of the arm while it is down. */
  box: Box;
}

export type PropKind = 'booth' | 'ticket' | 'pay' | 'charger' | 'truck' | 'van' | 'pallet' | 'cage';
export interface Prop { kind: PropKind; x: number; z: number; h: number; /** Colour for vehicles. */ color?: number }

export type SignKind = 'stop' | 'oneway' | 'noentry' | 'ev' | 'disabled' | 'parent' | 'speed' | 'p' | 'exit' | 'entry' | 'loading' | 'slow';
export interface Sign { kind: SignKind; x: number; z: number; /** Heading the sign faces. */ h: number }

export interface Crossing { x: number; z: number; /** Direction people walk across (heading). */ h: number; /** Road width crossed. */ len: number }
export interface Bump { x: number; z: number; /** Heading along the road. */ h: number; len: number }
export interface Marking { x: number; z: number; h: number; w: number; l: number }
export interface Word { text: string; x: number; z: number; h: number; w: number }

export interface Shop { name: string; x0: number; x1: number; z0: number; z1: number; doorX: number; accent: number }

export interface Lot {
  bays: Bay[];
  aisles: Aisle[];
  graph: Graph;
  islands: Island[];
  canopies: Canopy[];
  /** Static colliders (parked cars, islands, kerbs, posts, the stores, the gates' housings). */
  solids: Shape[];
  /** Things that block a driver's view (hedges, vans, the truck, the booth). */
  occluders: Shape[];
  /** Lamp posts (render + collision). */
  lamps: Vec[];
  /** Canopy posts (render + collision). */
  posts: Vec[];
  /** Bay painting: each stripe from a to b. */
  stripes: { a: Vec; b: Vec }[];
  props: Prop[];
  signs: Sign[];
  crossings: Crossing[];
  bumps: Bump[];
  stopLines: Marking[];
  hatches: Marking[];
  words: Word[];
  gates: Gate[];
  /** Where the racers wait, nose to the entry barriers. */
  starts: { x: number; z: number; h: number }[];
  /** z of the entry barrier line. */
  gateZ: number;
  /** Graph node just inside the entry (cars come out of the gate here) and the node at the exit barrier. */
  entryNode: number;
  exitNode: number;
  /** Outer edge of the drivable area. */
  bounds: { x0: number; x1: number; z0: number; z1: number };
  /** The main store's footprint and its front (the pavement edge), and all the shops. */
  store: { x0: number; x1: number; z0: number; z1: number; kerb: number };
  shops: Shop[];
  /** Bays that can be the target this round. */
  candidates: number[];
}

export const BAY = {
  width: 2.85,
  depth: 5.5,
  /** Angle between the angled bays and the aisle. */
  angle: (60 * Math.PI) / 180,
} as const;

/** Depth of a half row of angled bays measured along the row's normal, and the spacing of their stripes along the row. */
export const BAND = BAY.depth * Math.sin(BAY.angle);
export const PITCH = BAY.width / Math.sin(BAY.angle);
export const ISLAND = 1.8;
export const AISLE = 8;
/** 90 degree bays and parallel bays. */
export const PERP = { width: 2.7, depth: 5.1 } as const;
export const PARALLEL = { width: 2.4, depth: 6.4 } as const;

/** The grid the layout hangs on: main road, the aisles north of it, the fire lane, and the side roads. */
const ZM = -30;
const ZA = ZM + AISLE / 2 + 2 * BAND + ISLAND + AISLE / 2;
const ZB = ZA + AISLE + 2 * BAND + ISLAND;
const ZC = ZB + AISLE + 2 * BAND + ISLAND;
const ZF = 48;
const XW = -58;
const XE = 58;
const XC = 0;
export const LAYOUT = { ZM, ZA, ZB, ZC, ZF, XW, XE, XC } as const;

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

/** Footprint of what is parked in a bay, by body style. */
export const VARIANT_SIZE = [
  { l: CAR.length, w: CAR.width },
  { l: CAR.length, w: CAR.width },
  { l: CAR.length, w: CAR.width },
  { l: 4.72, w: 1.92 },
  { l: 4.95, w: 1.98 },
] as const;
/** Vans stand tall enough to hide a bay behind them. */
export const isTall = (variant: number) => variant >= 4;

/** Collider for a parked car or other bay contents. */
export const bayShape = (bay: Bay): Shape | null => {
  if (bay.use === 'free') return null;
  if (bay.use === 'car') {
    const v = VARIANT_SIZE[bay.variant];
    return { kind: 'box', x: bay.x, z: bay.z, hw: v.w / 2 - 0.02, hl: v.l / 2 - 0.02, h: bay.h };
  }
  if (bay.use === 'corral') return { kind: 'box', x: bay.x, z: bay.z, hw: 0.9, hl: 2.4, h: bay.h };
  return { kind: 'circle', x: bay.x - bay.ax * 1.8, z: bay.z - bay.az * 1.8, r: 0.35 };
};

/** An axis-aligned rectangle as a box shape. */
const rect = (x0: number, x1: number, z0: number, z1: number): Box => {
  const w = x1 - x0;
  const d = z1 - z0;
  const cx = (x0 + x1) / 2;
  const cz = (z0 + z1) / 2;
  return w >= d ? { kind: 'box', x: cx, z: cz, hw: d / 2, hl: w / 2, h: Math.PI / 2 } : { kind: 'box', x: cx, z: cz, hw: w / 2, hl: d / 2, h: 0 };
};

const norm = (x: number, z: number): Vec => {
  const l = Math.hypot(x, z) || 1;
  return { x: x / l, z: z / l };
};

/**
 * Builds the lot. `seed` only decides which bays hold which parked car; the layout is fixed.
 */
export const buildLot = (seed = 7): Lot => {
  const rand = rng(seed);
  const bounds = { x0: -66, x1: 66, z0: -52, z1: 52 };
  const GZ = -38; // the entry barrier line
  const LANE = 3.2; // entry lane centres at x = +-LANE
  const EXIT_Z = -46;

  const bays: Bay[] = [];
  const stripes: { a: Vec; b: Vec }[] = [];
  const solids: Shape[] = [];
  const occluders: Shape[] = [];
  const islands: Island[] = [];
  const lamps: Vec[] = [];
  const posts: Vec[] = [];
  const props: Prop[] = [];
  const signs: Sign[] = [];
  const crossings: Crossing[] = [];
  const bumps: Bump[] = [];
  const stopLines: Marking[] = [];
  const hatches: Marking[] = [];
  const words: Word[] = [];

  // --- Graph: nodes at junctions and aisle ends, aisles as chains of them -----------------------
  const nodes: GNode[] = [];
  const nodeId: Record<string, number> = {};
  const N = (name: string, x: number, z: number) => {
    nodeId[name] = nodes.length;
    nodes.push({ id: nodes.length, name, x, z });
  };
  N('M_W', XW, ZM);
  N('M_PK', -42, ZM);
  N('M_EB', -LANE, ZM);
  N('M_C', XC, ZM);
  N('M_EA', LANE, ZM);
  N('M_E', XE, ZM);
  N('AV_A', XC, ZA);
  N('AV_B', XC, ZB);
  N('AV_C', XC, ZC);
  N('F_C', XC, ZF);
  N('CW_A', XW, ZA);
  N('CW_B', XW, ZB);
  N('CW_C', XW, ZC);
  N('F_W', XW, ZF);
  N('CE_A', XE, ZA);
  N('CE_B', XE, ZB);
  N('CE_C', XE, ZC);
  N('F_E', XE, ZF);
  N('PK_END', -42, -49.5);
  N('X_END', XE, EXIT_Z - 2.5);
  N('ENT_A0', LANE, bounds.z0);
  N('ENT_A1', LANE, -34.4);
  N('ENT_B0', -LANE, bounds.z0);
  N('ENT_B1', -LANE, -34.4);

  const aisles: Aisle[] = [];
  const A = (name: string, kind: Aisle['kind'], names: string[], width: number, oneWay: boolean, avoid = false) => {
    aisles.push({ id: aisles.length, name, nodes: names.map((n) => nodeId[n]), width, oneWay, avoid, kind });
    return aisles.length - 1;
  };
  const aM = A('M', 'road', ['M_W', 'M_PK', 'M_EB', 'M_C', 'M_EA', 'M_E'], 8, false);
  A('AVE', 'road', ['M_C', 'AV_A', 'AV_B', 'AV_C', 'F_C'], 8, false);
  const aCW = A('CW', 'road', ['M_W', 'CW_A', 'CW_B', 'CW_C', 'F_W'], 6.2, true);
  A('CE', 'road', ['M_E', 'CE_A', 'CE_B', 'CE_C', 'F_E'], 6.4, false);
  const aF = A('F', 'road', ['F_W', 'F_C', 'F_E'], 8, false);
  const aWA = A('WA', 'aisle', ['CW_A', 'AV_A'], 8, true);
  const aWB = A('WB', 'aisle', ['AV_B', 'CW_B'], 8, true);
  const aWC = A('WC', 'aisle', ['CW_C', 'AV_C'], 8, true);
  const aEA = A('EA', 'aisle', ['AV_A', 'CE_A'], 8, false);
  const aEB = A('EB', 'aisle', ['AV_B', 'CE_B'], 8, false);
  const aEC = A('EC', 'aisle', ['AV_C', 'CE_C'], 8, false);
  const aPK = A('PK', 'pocket', ['M_PK', 'PK_END'], 6.4, false, true);
  A('EXIT', 'exit', ['M_E', 'X_END'], 3.8, true, true);
  A('ENTRY A', 'entry', ['ENT_A0', 'ENT_A1', 'M_EA'], 3.8, true);
  A('ENTRY B', 'entry', ['ENT_B0', 'ENT_B1', 'M_EB'], 3.8, true);
  const graph = buildGraph(nodes, aisles);

  // --- Bays --------------------------------------------------------------------------------------
  const addBay = (b: Omit<Bay, 'id' | 'use' | 'variant' | 'color' | 'approach' | 'tags'> & { tags?: BayTag[] }) => {
    const bay: Bay = { ...b, tags: b.tags ?? [], id: bays.length, use: 'car', variant: 0, color: 0, approach: [] };
    bays.push(bay);
    return bay;
  };

  /** A row of 90 degree bays: `start` is the left end of the mouth line, `u` runs along it, `n` points into the bays. */
  const perpRow = (aisle: number, start: Vec, u: Vec, n: Vec, widths: number[], tagAt: (i: number) => BayTag[] = () => []) => {
    const depth = PERP.depth;
    let off = 0;
    const h = Math.atan2(n.x, n.z);
    widths.forEach((w, i) => {
      const mx = start.x + u.x * (off + w / 2);
      const mz = start.z + u.z * (off + w / 2);
      addBay({ x: mx + (n.x * depth) / 2, z: mz + (n.z * depth) / 2, h, ax: n.x, az: n.z, w, d: depth, type: 'perp', aisle, flow: 1, tags: tagAt(i) });
      const ex = start.x + u.x * off;
      const ez = start.z + u.z * off;
      stripes.push({ a: { x: ex, z: ez }, b: { x: ex + n.x * depth, z: ez + n.z * depth } });
      off += w;
    });
    const ex = start.x + u.x * off;
    const ez = start.z + u.z * off;
    stripes.push({ a: { x: ex, z: ez }, b: { x: ex + n.x * depth, z: ez + n.z * depth } });
  };
  const uniform = (count: number, w: number = PERP.width) => Array.from({ length: count }, () => w);

  /** Half a row of angled bays along an east-west aisle. `side` +1: bays lie north of their mouth line. */
  const angledRow = (aisle: number, mouthZ: number, side: 1 | -1, flow: 1 | -1, x0: number, x1: number) => {
    const ax = flow * Math.cos(BAY.angle);
    const az = side * Math.sin(BAY.angle);
    const h = Math.atan2(ax, az);
    const shift = BAY.depth * Math.cos(BAY.angle) * flow;
    const start = flow > 0 ? x0 + 0.6 : x0 + 0.6 + Math.abs(shift);
    const end = flow > 0 ? x1 - 0.6 - Math.abs(shift) : x1 - 0.6;
    const count = Math.floor((end - start) / PITCH);
    for (let i = 0; i <= count; i++) {
      const mx = start + i * PITCH;
      stripes.push({ a: { x: mx, z: mouthZ }, b: { x: mx + shift, z: mouthZ + BAND * side } });
      if (i === count) break;
      addBay({ x: mx + PITCH / 2 + (ax * BAY.depth) / 2, z: mouthZ + (az * BAY.depth) / 2, h, ax, az, w: BAY.width, d: BAY.depth, type: 'angled', aisle, flow });
    }
  };

  // West of the central avenue: three double rows of angled bays between the main road and the one-way aisles.
  const AX0 = -52;
  const AX1 = -8;
  const rowSouth = [ZM + 4, ZA + 4, ZB + 4];
  const rowFlows: [1 | -1, 1 | -1][] = [
    [-1, 1],
    [1, -1],
    [-1, 1],
  ];
  const northAisle = [aWA, aWB, aWC];
  const southAisle = [aM, aWA, aWB];
  rowSouth.forEach((zs, row) => {
    const iz0 = zs + BAND;
    const iz1 = iz0 + ISLAND;
    const north = iz1 + BAND;
    islands.push({ x0: AX0, x1: AX1, z0: iz0, z1: iz1, kind: 'planter' });
    angledRow(southAisle[row], zs, 1, rowFlows[row][0], AX0, AX1);
    angledRow(northAisle[row], north, -1, rowFlows[row][1], AX0, AX1);
    const mid = (iz0 + iz1) / 2;
    for (let x = AX0 + 6; x <= AX1 - 5; x += 16.5) lamps.push({ x, z: mid });
    solids.push({ kind: 'box', x: (AX0 + AX1) / 2, z: mid, hw: ISLAND / 2 - 0.3, hl: (AX1 - AX0) / 2, h: Math.PI / 2 });
    solids.push({ kind: 'circle', x: AX0 - 0.3, z: mid, r: 1.4 }, { kind: 'circle', x: AX1 + 0.3, z: mid, r: 1.4 });
  });

  // East of the avenue: 90 degree rows on two-way aisles.
  const EX0 = 8.6;
  const per = 16;
  const rowE = (aisle: number, z: number, n: number, tagAt?: (i: number) => BayTag[]) =>
    perpRow(aisle, { x: EX0, z }, { x: 1, z: 0 }, { x: 0, z: n }, uniform(per), tagAt);
  const EX1 = EX0 + per * PERP.width;
  const dz = PERP.depth;
  rowE(aM, ZM + 4, 1); // north side of the main road
  rowE(aEA, ZA - 4, -1, (i) => (i < 11 ? ['ev'] : [])); // the EV row
  rowE(aEA, ZA + 4, 1, () => ['canopy']);
  rowE(aEB, ZB - 4, -1, () => ['canopy']);
  rowE(aEB, ZB + 4, 1);
  rowE(aEC, ZC - 4, -1);
  rowE(aEC, ZC + 4, 1);
  // Back-to-back strips between those rows: chargers, carport posts, hedges.
  const strip = (z0: number, z1: number, kind: IslandKind) => {
    islands.push({ x0: EX0 - 0.3, x1: EX1 + 0.3, z0, z1, kind });
    solids.push(rect(EX0 - 0.3, EX1 + 0.3, z0 + 0.08, z1 - 0.08));
    if (kind === 'hedge') occluders.push(rect(EX0 - 0.3, EX1 + 0.3, z0 + 0.1, z1 - 0.1));
  };
  strip(ZM + 4 + dz, ZA - 4 - dz, 'chargers');
  strip(ZA + 4 + dz, ZB - 4 - dz, 'canopy');
  strip(ZB + 4 + dz, ZC - 4 - dz, 'hedge');
  strip(ZC + 4 + dz, ZF - 4 - dz, 'hedge');
  // The solar carport over the two middle rows, on a post at every second bay.
  const canopy: Canopy = { x0: EX0 - 0.4, x1: EX1 + 0.4, z0: ZA + 4 - 0.6, z1: ZB - 4 + 0.6, h: 3.5 };
  const postZ = (ZA + 4 + dz + ZB - 4 - dz) / 2;
  for (let x = EX0 + PERP.width * 2; x < EX1; x += PERP.width * 2) posts.push({ x, z: postZ });
  // Chargers: a pedestal on the strip between each pair of EV bays.
  const chargerZ = (ZM + 4 + dz + ZA - 4 - dz) / 2;
  for (let i = 0; i < 11; i += 2) props.push({ kind: 'charger', x: EX0 + (i + 1) * PERP.width, z: chargerZ, h: 0 });

  // By the store door: wide bays for disabled drivers and for parents, then ordinary ones.
  const Fz = ZF - 4;
  const doorX = -13;
  perpRow(aF, { x: -28, z: Fz }, { x: 1, z: 0 }, { x: 0, z: -1 }, [3.7, 3.7, 3.7, 3.2, 3.2, 3.2, 3.2], (i) => (i < 3 ? ['disabled'] : ['parent']));
  perpRow(aF, { x: EX0, z: Fz }, { x: 1, z: 0 }, { x: 0, z: -1 }, uniform(per));
  // Main road, south side: a single row either side of the entry.
  perpRow(aM, { x: -31.5, z: ZM - 4 }, { x: 1, z: 0 }, { x: 0, z: -1 }, uniform(8));
  perpRow(aM, { x: EX0 + 1, z: ZM - 4 }, { x: 1, z: 0 }, { x: 0, z: -1 }, uniform(15));

  // The dead-end pocket: a stub off the main road with five bays each side, and a planter at the end.
  const PKX = -42;
  for (let i = 0; i < 5; i++) {
    const z = ZM - 4 - 2.7 * i - 1.35 - 1.6;
    for (const side of [-1, 1] as const) {
      const mouthX = PKX + side * 3.2;
      addBay({ x: mouthX + (side * PERP.depth) / 2, z, h: side * (Math.PI / 2), ax: side, az: 0, w: PERP.width, d: PERP.depth, type: 'perp', aisle: aPK, flow: 1, tags: ['pocket'] });
      for (const off of [-1.35, 1.35]) stripes.push({ a: { x: mouthX, z: z + off }, b: { x: mouthX + side * PERP.depth, z: z + off } });
    }
  }
  solids.push(rect(PKX - 3.2, PKX + 3.2, -51.7, -50.7));

  // Parallel bays along the west side of the service road (the one-way road up the west edge).
  const PRX = XW - 3.1 - PARALLEL.width / 2;
  for (let i = 0; i < 8; i++) {
    const z0 = -23 + i * 7.1;
    addBay({ x: PRX, z: z0 + PARALLEL.depth / 2, h: 0, ax: 0, az: 1, w: PARALLEL.width, d: PARALLEL.depth, type: 'parallel', aisle: aCW, flow: 1, tags: ['kerb'] });
    stripes.push({ a: { x: PRX - PARALLEL.width / 2, z: z0 }, b: { x: PRX + PARALLEL.width / 2, z: z0 } });
    if (i === 7) stripes.push({ a: { x: PRX - PARALLEL.width / 2, z: z0 + PARALLEL.depth }, b: { x: PRX + PARALLEL.width / 2, z: z0 + PARALLEL.depth } });
  }

  // --- Landscaping that blocks driving: lawns round the south and the east and west edges --------
  const lawn = (x0: number, x1: number, z0: number, z1: number, hedge = false) => {
    islands.push({ x0, x1, z0, z1, kind: 'lawn' });
    solids.push(rect(x0, x1, z0, z1));
    if (hedge) occluders.push(rect(x0, x1, z1 - 1.2, z1));
  };
  const southEdge = ZM - 4 - 0.3;
  const southBack = ZM - 4 - PERP.depth - 0.3;
  lawn(bounds.x0, PKX - 3.2 - PERP.depth - 0.3, bounds.z0, southEdge, true);
  lawn(-33.5, -5.9, bounds.z0, southBack, true);
  lawn(-9.8, -5.9, southBack, southEdge);
  lawn(5.9, 50.5, bounds.z0, southBack, true);
  lawn(5.9, 9.4, southBack, southEdge);
  lawn(50.6, XE - 2.4, bounds.z0, southEdge);
  lawn(XE + 2.4, bounds.x1, bounds.z0, southEdge, true);
  lawn(bounds.x0, XW - 3.1 - PARALLEL.width - 0.2, southEdge + 0.4, bounds.z1);
  lawn(XE + 3.7, bounds.x1, southEdge + 0.4, bounds.z1);

  // --- The gates ----------------------------------------------------------------------------------
  const gates: Gate[] = [];
  const arm = (kind: 'entry' | 'exit', px: number, tx: number, z: number): Gate => ({
    kind,
    px,
    tx,
    z,
    box: { kind: 'box', x: (px + tx) / 2, z, hw: 0.1, hl: Math.abs(tx - px) / 2, h: Math.PI / 2 },
  });
  gates.push(arm('entry', 1.45, 5.1, GZ), arm('entry', -1.45, -5.1, GZ), arm('exit', XE - 1.9, XE + 1.9, EXIT_Z));
  // Kerbs along the entry road, the booth island, the booth and machines.
  solids.push(rect(-5.9, -5.1, bounds.z0, ZM - 4), rect(5.1, 5.9, bounds.z0, ZM - 4));
  solids.push(rect(-1.3, 1.3, -41.2, -34.6));
  props.push({ kind: 'booth', x: 0, z: -37.2, h: 0 });
  occluders.push({ kind: 'box', x: 0, z: -37.2, hw: 1.2, hl: 1.5, h: 0 });
  for (const s of [-1, 1]) {
    props.push({ kind: 'ticket', x: s * 1.55, z: -40.3, h: s > 0 ? -Math.PI / 2 : Math.PI / 2 });
    solids.push({ kind: 'box', x: s * 1.4, z: GZ, hw: 0.2, hl: 0.25, h: 0 });
  }
  props.push({ kind: 'pay', x: XE + 2.7, z: EXIT_Z + 1.6, h: -Math.PI / 2 });
  // Exit lane: kerbs either side, closed at the street end.
  solids.push(rect(XE - 2.4, XE - 1.9, bounds.z0, ZM - 4), rect(XE + 1.9, XE + 2.4, bounds.z0, ZM - 4));
  solids.push(rect(XE - 2.4, XE + 2.4, bounds.z0, bounds.z0 + 0.8));

  // The cars wait in the two entry lanes, two deep.
  const starts = [
    { x: LANE, z: -41.6, h: 0 },
    { x: -LANE, z: -41.6, h: 0 },
    { x: LANE, z: -47.4, h: 0 },
    { x: -LANE, z: -47.4, h: 0 },
  ];

  // --- The shops and the service yard ------------------------------------------------------------
  const kerb = bounds.z1;
  const shops: Shop[] = [
    { name: 'MERGE MART', x0: -46, x1: 20, z0: kerb + 5, z1: kerb + 38, doorX, accent: 0x1f6f4a },
    { name: 'COMMIT COFFEE', x0: 31, x1: 58, z0: kerb + 5, z1: kerb + 24, doorX: 44.5, accent: 0x7a3b22 },
  ];
  const store = { ...shops[0], kerb };
  // Delivery yard (x -52..-30, z 32..44): a box truck, a van, pallets and roll cages.
  props.push({ kind: 'truck', x: -40.5, z: 37.4, h: Math.PI / 2, color: 0xe9e6dc });
  solids.push({ kind: 'box', x: -40.5, z: 37.4, hw: 1.3, hl: 4.2, h: Math.PI / 2 });
  occluders.push({ kind: 'box', x: -40.5, z: 37.4, hw: 1.3, hl: 4.2, h: Math.PI / 2 });
  props.push({ kind: 'van', x: -32.4, z: 41.2, h: 0.12, color: 0x2a4d8f });
  solids.push({ kind: 'box', x: -32.4, z: 41.2, hw: 1.0, hl: 2.48, h: 0.12 });
  occluders.push({ kind: 'box', x: -32.4, z: 41.2, hw: 1.0, hl: 2.48, h: 0.12 });
  for (const [x, z] of [
    [-49.5, 41.5],
    [-49.5, 39.8],
    [-47.8, 41.5],
  ]) {
    props.push({ kind: 'pallet', x, z, h: 0 });
    solids.push({ kind: 'box', x, z, hw: 0.6, hl: 0.6, h: 0 });
  }
  for (const [x, z] of [
    [-37, 42.6],
    [-35.7, 42.6],
  ]) {
    props.push({ kind: 'cage', x, z, h: 0 });
    solids.push({ kind: 'box', x, z, hw: 0.4, hl: 0.4, h: 0 });
  }
  hatches.push({ x: -41, z: 41.6, h: 0, w: 20, l: 3 });
  words.push({ text: 'LOADING', x: -48.5, z: 34.4, h: -Math.PI / 2, w: 5 });
  signs.push({ kind: 'loading', x: -52.3, z: 43.4, h: Math.PI / 2 });

  // --- Lamps, posts, walls -----------------------------------------------------------------------
  for (const x of [EX0 + 8, EX0 + 24, EX0 + 40]) lamps.push({ x, z: (ZB + 4 + dz + ZC - 4 - dz) / 2 }, { x, z: (ZC + 4 + dz + ZF - 4 - dz) / 2 });
  for (const lamp of lamps) solids.push({ kind: 'circle', x: lamp.x, z: lamp.z, r: 0.25 });
  for (const p of posts) solids.push({ kind: 'circle', x: p.x, z: p.z, r: 0.24 });
  // Walls round the lot: the street side is closed (the entry and exit lanes end at it), the store kerb on the north.
  solids.push(rect(bounds.x0 - 1, bounds.x0, bounds.z0 - 1, kerb + 1), rect(bounds.x1, bounds.x1 + 1, bounds.z0 - 1, kerb + 1));
  solids.push(rect(bounds.x0 - 1, bounds.x1 + 1, bounds.z0 - 1, bounds.z0), rect(bounds.x0 - 1, bounds.x1 + 1, kerb, kerb + 1));

  // --- Markings and signs --------------------------------------------------------------------------
  crossings.push({ x: doorX, z: ZF, h: 0, len: 8 }, { x: 44.5, z: ZF, h: 0, len: 8 }, { x: XC, z: -17.2, h: Math.PI / 2, len: 8 }, { x: XC, z: 38, h: Math.PI / 2, len: 8 }, { x: XC, z: 22, h: Math.PI / 2, len: 8 });
  bumps.push(
    { x: XC, z: -14, h: 0, len: 8 },
    { x: XC, z: 18, h: 0, len: 8 },
    { x: -22, z: ZM, h: Math.PI / 2, len: 8 },
    { x: 20, z: ZM, h: Math.PI / 2, len: 8 },
    { x: -30, z: ZF, h: Math.PI / 2, len: 8 },
    { x: 30, z: ZF, h: Math.PI / 2, len: 8 },
    { x: XW, z: 0, h: 0, len: 6.2 },
    { x: XE, z: 18, h: 0, len: 6.4 },
  );
  stopLines.push(
    { x: LANE, z: -33.8, h: 0, w: 3.6, l: 0.4 },
    { x: -LANE, z: -33.8, h: 0, w: 3.6, l: 0.4 },
    { x: -5.5, z: ZA, h: 0, w: 0.4, l: 3.6 },
    { x: -5.5, z: ZC, h: 0, w: 0.4, l: 3.6 },
    { x: XE, z: EXIT_Z + 4, h: 0, w: 3.6, l: 0.4 },
  );
  // (A word reads upright for a driver heading `h + pi`: north is h = pi.)
  words.push({ text: 'ENTRY', x: 0, z: -47, h: Math.PI, w: 4.8 }, { text: 'EXIT', x: XE, z: -49.2, h: 0, w: 3.2 }, { text: 'FIRE LANE', x: 12, z: ZF + 2.8, h: Math.PI / 2, w: 6 });
  signs.push(
    { kind: 'entry', x: -6.6, z: -43, h: Math.PI / 2 },
    { kind: 'p', x: 6.6, z: -36, h: -Math.PI / 2 },
    { kind: 'stop', x: 5.2, z: -33.4, h: Math.PI },
    { kind: 'stop', x: -5.2, z: -33.4, h: Math.PI },
    { kind: 'speed', x: -4.6, z: -31.5, h: Math.PI },
    { kind: 'noentry', x: XE - 2.6, z: ZM + 4.2, h: Math.PI },
    { kind: 'exit', x: XE + 2.8, z: -40, h: -Math.PI / 2 },
    { kind: 'oneway', x: -56.2, z: ZA - 4.4, h: 0 },
    { kind: 'oneway', x: -4.4, z: ZB + 4.6, h: 0 },
    { kind: 'oneway', x: -56.2, z: ZC - 4.4, h: 0 },
    { kind: 'ev', x: EX0 + 6, z: ZA - 4 - 0.3, h: 0 },
    { kind: 'disabled', x: -28.4, z: Fz - 0.4, h: 0 },
    { kind: 'parent', x: -17.2, z: Fz - 0.4, h: 0 },
    { kind: 'slow', x: XC - 4.6, z: -18.6, h: -Math.PI / 2 },
  );

  // --- What stands in each bay -----------------------------------------------------------------
  for (const bay of bays) {
    const r = rand();
    const special = bay.tags.length > 0;
    if (r < 0.035 && !special) bay.use = 'corral';
    else if (r < 0.06 && bay.type !== 'parallel') bay.use = 'cones';
    else bay.use = 'car';
    const v = rand();
    bay.variant = bay.type === 'parallel' ? (v < 0.6 ? 0 : v < 0.8 ? 1 : 3) : v < 0.46 ? 0 : v < 0.62 ? 1 : v < 0.76 ? 2 : v < 0.89 ? 3 : 4;
    bay.color = PAINT[Math.floor(rand() * PAINT.length)];
    // Tall vans hide what is behind them.
    if (bay.use === 'car' && isTall(bay.variant)) {
      const v2 = VARIANT_SIZE[bay.variant];
      occluders.push({ kind: 'box', x: bay.x, z: bay.z, hw: v2.w / 2, hl: v2.l / 2, h: bay.h });
    }
  }

  // --- Approaches: the way into each bay, given its type ---------------------------------------
  /** The lane edge (travelling `dir` along aisle `aisle`) whose span contains the point p, and p projected on its lane. */
  const dockOn = (aisle: number, dir: 1 | -1, p: Vec) => {
    let best: { edge: number; s: number; dock: Vec; score: number } | null = null;
    for (const e of graph.edges) {
      if (e.aisle !== aisle || e.dir !== dir) continue;
      const s = (p.x - e.a.x) * e.ux + (p.z - e.a.z) * e.uz;
      const past = s < 0 ? -s : s > e.len ? s - e.len : 0;
      const sc = Math.max(0, Math.min(e.len, s));
      if (!best || past < best.score) best = { edge: e.id, s: sc, dock: { x: e.a.x + e.ux * sc, z: e.a.z + e.uz * sc }, score: past };
    }
    return best;
  };
  const aisleAxis = (aisle: number) => {
    const ns = aisles[aisle].nodes;
    return norm(nodes[ns[ns.length - 1]].x - nodes[ns[0]].x, nodes[ns[ns.length - 1]].z - nodes[ns[0]].z);
  };

  for (const bay of bays) {
    if (bay.type === 'parallel') continue;
    const aisle = aisles[bay.aisle];
    const axis = aisleAxis(bay.aisle);
    const mouth = { x: bay.x - bay.ax * (bay.d / 2), z: bay.z - bay.az * (bay.d / 2) };
    const enter = { x: mouth.x + bay.ax * 1.2, z: mouth.z + bay.az * 1.2 };
    const end = { x: bay.x + bay.ax * 0.15, z: bay.z + bay.az * 0.15 };
    const dirs: (1 | -1)[] = bay.type === 'angled' ? [bay.flow * Math.sign(axis.x || 1) > 0 ? 1 : -1] : aisle.oneWay ? [1] : [1, -1];
    for (const dir of dirs) {
      const D = { x: axis.x * dir, z: axis.z * dir };
      if (bay.type === 'angled') {
        if (D.x * bay.flow < 0.5) continue;
        const a1 = { x: mouth.x - bay.ax * 3.6, z: mouth.z - bay.az * 3.6 };
        const dk = dockOn(bay.aisle, dir, { x: a1.x - D.x * 8, z: a1.z - D.z * 8 });
        if (!dk) continue;
        bay.approach.push({ dir, edge: dk.edge, s: dk.s, dock: dk.dock, tail: [a1, enter, end] });
      } else {
        // A 90 degree swing: along the far side of the aisle, then an arc of radius R onto the bay's axis.
        const dm = Math.min(aisle.width * 0.72, 6.2);
        const R = 4.4;
        const Q = { x: mouth.x - bay.ax * dm, z: mouth.z - bay.az * dm };
        const T1 = { x: Q.x - D.x * R, z: Q.z - D.z * R };
        const C = { x: T1.x + bay.ax * R, z: T1.z + bay.az * R };
        const lead = { x: T1.x - D.x * 3, z: T1.z - D.z * 3 };
        const dk = dockOn(bay.aisle, dir, { x: T1.x - D.x * 7, z: T1.z - D.z * 7 });
        if (!dk) continue;
        const tail: Vec[] = [lead, T1];
        for (const deg of [15, 30, 45, 60, 75, 90]) {
          const th = (deg * Math.PI) / 180;
          tail.push({ x: C.x - bay.ax * R * Math.cos(th) + D.x * R * Math.sin(th), z: C.z - bay.az * R * Math.cos(th) + D.z * R * Math.sin(th) });
        }
        tail.push(enter, end);
        bay.approach.push({ dir, edge: dk.edge, s: dk.s, dock: dk.dock, tail });
      }
    }
  }

  // --- Candidates: bays a bot can really drive into, far from the start ----------------------------
  const reach = new Set([...reachableFrom(graph, nodeId.M_EA), ...reachableFrom(graph, nodeId.M_EB)]);
  const sweepClear = (bay: Bay, ap: Approach) => {
    const pts = [ap.dock, ...ap.tail];
    const others = bays.filter((b) => b.id !== bay.id && Math.hypot(b.x - bay.x, b.z - bay.z) < 24).map(bayShape).filter((s): s is Shape => !!s);
    const near = [...solids.filter((s) => Math.hypot(s.x - bay.x, s.z - bay.z) < 24 + (s.kind === 'box' ? s.hl : 0)), ...others];
    const check = (x: number, z: number, h: number) => {
      const box: Box = { kind: 'box', x, z, hw: CAR.width / 2 + 0.22, hl: CAR.length / 2 + 0.15, h };
      for (const s of near) if (collide(box, s)) return false;
      return true;
    };
    for (let i = 0; i < pts.length - 1; i++) {
      const a = pts[i];
      const b = pts[i + 1];
      const len = Math.hypot(b.x - a.x, b.z - a.z);
      const h = i >= pts.length - 3 ? bay.h : Math.atan2(b.x - a.x, b.z - a.z);
      for (let t = 0; t < len; t += 0.7) if (!check(a.x + ((b.x - a.x) * t) / len, a.z + ((b.z - a.z) * t) / len, h)) return false;
    }
    return check(bay.x, bay.z, bay.h);
  };
  // Parallel bays and the dead-end pocket have no approach (see docs/DESIGN.md); the rest must be reachable and clear.
  for (const bay of bays) bay.approach = bay.approach.filter((ap) => reach.has(ap.edge) && sweepClear(bay, ap));
  const candidates = bays
    .filter((b) => b.use === 'car' && b.approach.length > 0 && !b.tags.includes('disabled') && !b.tags.includes('parent'))
    // Not in sight of the start: finding it must mean driving and looking.
    .filter((b) => starts.every((st) => Math.hypot(b.x - st.x, b.z - st.z) > 38))
    .map((b) => b.id);

  return {
    bays,
    aisles,
    graph,
    islands,
    canopies: [canopy],
    solids,
    occluders,
    lamps,
    posts,
    stripes,
    props,
    signs,
    crossings,
    bumps,
    stopLines,
    hatches,
    words,
    gates,
    starts,
    gateZ: GZ,
    entryNode: nodeId.M_C,
    exitNode: nodeId.X_END,
    bounds: { ...bounds },
    store,
    shops,
    candidates,
  };
};
