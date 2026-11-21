/**
 * The campaign: thirty hand-made levels in four chapters, each with one new idea, and the stars and saved progress around them.
 *
 * A level is data over the same lot the race uses. It picks which part of the site is open (`stage`, see stages.ts), where you
 * start (a pose near the bay, or the gate for a race), which bays you must park in (`target`, in order for a chain), how you must
 * park there (`facing`, `slack`, `maxAngleDeg`), and what changes in the lot for this level (`bays`: a bay emptied, a van or a
 * corral put in, `cones`: extra cones in an aisle). The sim reads it in `createRound` (step.ts); nothing about the layout is rebuilt.
 *
 * Stars: one for parking inside the time limit, one for beating the par time, one for a clean, precise park (no graze, and
 * precision of at least 80 %). A light graze costs the third star; a hard hit fails the level. A race keeps the race's rule
 * (any real touch puts you out) and its third star is for not even grazing anything.
 */
import { BODY, CONTACT, PARK } from './constants';
import { levelY } from './levels';

import type { Bay, BayUse, Circle, Lot } from './lot';
import type { KeyValue } from '~/platform/types';

export type LevelType = 'solo' | 'race' | 'timeTrial' | 'unpark' | 'chain';
export type Facing = 'nose' | 'tail' | 'any';

/** A car's pose: where it stands, which way it faces (see constants.ts: h = 0 faces north) and on which level. */
export interface Pose {
  x: number;
  z: number;
  h: number;
  lvl: number;
}

/** What a level puts in a bay instead of what the lot has there. */
export type BayFill = 'free' | 'car' | 'suv' | 'van' | 'corral' | 'cones';

export interface LevelDef {
  /** Stable id: progress is saved under it. */
  id: string;
  /** 1..30, the order on the map. */
  n: number;
  chapter: 1 | 2 | 3 | 4;
  name: string;
  /** One line: what this level teaches. */
  teaches: string;
  type: LevelType;
  /** Which `stageLot()` view of the site (1: the open lot only ... 6: everything open). */
  stage: number;
  /** Where you start: a pose near the bay, or the gate with the countdown (races). */
  spawn: Pose | 'gate';
  /** The bays to park in (a chain: in this order). Empty for an unpark level, and for a race whose bay is picked at random. */
  target: number[];
  /** Unpark: drive into this circle. */
  exit?: { x: number; z: number; r: number; lvl: number };
  facing: Facing;
  /** How far (m) the body may stick out of the painted bay. Default `PARK.slack`. */
  slack?: number;
  /** Most the car may be twisted against the bay (degrees). Default 22. */
  maxAngleDeg?: number;
  /** Bays filled or emptied for this level. */
  bays?: Record<number, BayFill>;
  /** Extra traffic cones (on the open lot, or on `lvl`). */
  cones?: { x: number; z: number; lvl?: number }[];
  /** Shoppers on the lot (the ones whose walks pass nearest the bay). Default 0 for solo levels, everyone for races. */
  peds?: number;
  /** The parked car that pulls out: none, the race's random one, or this bay at this time (s from the start). */
  leaver?: boolean | { bay: number; at: number };
  /** Rival drivers (races) and how brisk they are. */
  bots?: { n: 1 | 2 | 3; pace: { cruise: number; launch: number } };
  /** Time (s) for the second star. */
  par: number;
  /** Time (s) to finish at all. */
  limit: number;
}

export interface ChapterDef {
  n: 1 | 2 | 3 | 4;
  name: string;
  /** One line under the chapter tab. */
  blurb: string;
  /** Stars needed in all to open the chapter. */
  gate: number;
  /** The part of the site its map shows. */
  view: 'lot' | 'garage' | 'site';
}

export const CHAPTERS: ChapterDef[] = [
  { n: 1, name: "Learner's lot", blurb: 'An empty Sunday lot. Learn the car, the lines and the hold.', gate: 0, view: 'lot' },
  { n: 2, name: 'Busy Saturday', blurb: 'Shoppers, trolleys and the kerb. Patience pays.', gate: 10, view: 'lot' },
  { n: 3, name: 'The car park', blurb: 'Four decks, posts and ramps. Up to the roof and down into the dark.', gate: 25, view: 'garage' },
  { n: 4, name: 'Closing time', blurb: 'The whole site, tight spaces and full-pace rivals.', gate: 45, view: 'site' },
];

const E = Math.PI / 2;
const W = -Math.PI / 2;
const N = 0;
const S = Math.PI;
const at = (x: number, z: number, h: number, lvl = 0): Pose => ({ x, z, h, lvl });

/** Every level, in order. Bay ids are the lot's (`buildLot()`); the comments say where they are. */
export const CAMPAIGN: LevelDef[] = [
  // ---- Chapter 1: Learner's lot (the open lot, no shoppers) -------------------------------------------------------------
  {
    // EA aisle, the south row: the end bay of the EV row, a car on one side only, a wide left turn from the far lane.
    id: 'first-bay', n: 1, chapter: 1, name: 'First bay', teaches: 'Gas, steer, stop inside the lines and hold still.',
    type: 'solo', stage: 1, spawn: at(10, -8.7, E), target: [93], facing: 'any', slack: 0.3, par: 18, limit: 60,
  },
  {
    id: 'neighbours', n: 2, chapter: 1, name: 'Neighbours', teaches: 'The same turn with cars on both sides. Leave room each side.',
    type: 'solo', stage: 1, spawn: at(28, -8.7, E), target: [100], facing: 'any', slack: 0.25, par: 18, limit: 60,
  },
  {
    // The angled row north of the main road, from the westbound lane.
    id: 'angled', n: 3, chapter: 1, name: 'Angled bay', teaches: 'Angled bays lean the way the traffic flows. Turn in with them.',
    type: 'solo', stage: 1, spawn: at(-8, -32, W), target: [6], facing: 'nose', par: 15, limit: 50,
  },
  {
    // EB aisle, the north row on your near side: the bay mouth is right beside your lane.
    id: 'swing', n: 4, chapter: 1, name: 'The wide swing', teaches: 'A bay on your own side: swing out first, then turn in square.',
    type: 'solo', stage: 1, spawn: at(10, 10.7, E), target: [144], facing: 'any', par: 18, limit: 60,
  },
  {
    id: 'back-in', n: 5, chapter: 1, name: 'Back it in', teaches: 'Drive past the bay, stop, then reverse in. Nose out.',
    type: 'solo', stage: 1, spawn: at(8, 30, E), target: [174], facing: 'tail', slack: 0.25, par: 28, limit: 75,
  },
  {
    id: 'vans', n: 6, chapter: 1, name: 'Van squeeze', teaches: 'Two vans, very little room. Line up before you go in.',
    type: 'solo', stage: 1, spawn: at(6, 30, E), target: [158], facing: 'any', slack: 0.15, bays: { 157: 'van', 159: 'van' }, par: 20, limit: 60,
  },
  {
    id: 'trial', n: 7, chapter: 1, name: 'Time trial', teaches: 'Three bays in a row against the clock. Keep it flowing.',
    type: 'timeTrial', stage: 1, spawn: at(4, 30, E), target: [170, 163, 182], facing: 'any', par: 50, limit: 110,
  },
  {
    id: 'first-race', n: 8, chapter: 1, name: 'First race', teaches: 'One rival, one free bay. Find it first, and touch nothing.',
    type: 'race', stage: 1, spawn: 'gate', target: [107], facing: 'any', leaver: false, bots: { n: 1, pace: { cruise: 0.45, launch: 14 } }, par: 35, limit: 75,
  },

  // ---- Chapter 2: Busy Saturday (the open lot, with shoppers) ------------------------------------------------------------
  {
    // Up the avenue over the zebra at z = 22, then into the EC aisle.
    id: 'crossing', n: 9, chapter: 2, name: 'Crossing', teaches: 'Shoppers on the zebra go first. Stop and let them cross.',
    type: 'solo', stage: 1, spawn: at(-2, 12, N), target: [153], facing: 'any', peds: 14, par: 28, limit: 75,
  },
  {
    id: 'pulling-out', n: 10, chapter: 2, name: 'Pulling out', teaches: 'A car is leaving. Wait for it to back out, then take its bay.',
    type: 'solo', stage: 1, spawn: at(-52, -10.7, E), target: [30], facing: 'nose', leaver: { bay: 30, at: 2.5 }, par: 26, limit: 75,
  },
  {
    // The first of the parallel bays along the west road: nothing parks behind it, so you can drive in forwards.
    id: 'kerbside', n: 11, chapter: 2, name: 'Kerbside', teaches: 'The first parallel bay, with room behind: drive in at an angle, then straighten.',
    type: 'solo', stage: 1, spawn: at(-58, -31, N), target: [240], facing: 'nose', slack: 0.3, par: 15, limit: 60,
  },
  {
    id: 'parallel', n: 12, chapter: 2, name: 'Proper parallel', teaches: 'Pull up past the gap and reverse in: the S-turn.',
    type: 'solo', stage: 1, spawn: at(-58, 2, N), target: [245], facing: 'nose', bays: { 244: 'car', 246: 'suv' }, par: 25, limit: 80,
  },
  {
    // Parked nose-in in the dead-end pocket between two vans; out to the main road.
    id: 'dead-end', n: 13, chapter: 2, name: 'Dead end', teaches: 'Back out into a narrow pocket, turn round, and drive out.',
    type: 'unpark', stage: 1, spawn: at(-47.92, -45.1, W), target: [], exit: { x: -42, z: -31.5, r: 3.2, lvl: 0 }, facing: 'any', bays: { 236: 'free' }, par: 20, limit: 60,
  },
  {
    // The WB aisle (one way, westbound) narrowed by cones; the bay is beyond them.
    id: 'trolleys', n: 14, chapter: 2, name: 'Trolley run', teaches: 'Cones and trolleys narrow the aisle. Watch your corners.',
    type: 'solo', stage: 1, spawn: at(-3, 8.7, W), target: [51], facing: 'nose', peds: 6, bays: { 53: 'corral', 45: 'corral' },
    cones: [
      { x: -10, z: 12.2 }, { x: -10, z: 11.5 }, { x: -10, z: 10.8 },
      { x: -17.5, z: 5.2 }, { x: -17.5, z: 5.9 }, { x: -17.5, z: 6.6 },
      { x: -25, z: 12.2 }, { x: -25, z: 11.5 }, { x: -25, z: 10.8 },
    ],
    par: 26, limit: 70,
  },
  {
    id: 'shuffle', n: 15, chapter: 2, name: 'Shuffle', teaches: 'Park, back out, park again, with shoppers about.',
    type: 'chain', stage: 1, spawn: at(-54, -10.7, E), target: [16, 31], facing: 'any', peds: 16, par: 40, limit: 90,
  },
  {
    id: 'saturday-race', n: 16, chapter: 2, name: 'Saturday race', teaches: 'Two rivals and a full lot. Read the board, then search.',
    type: 'race', stage: 1, spawn: 'gate', target: [47], facing: 'any', leaver: false, bots: { n: 2, pace: { cruise: 0.5, launch: 8 } }, par: 40, limit: 75,
  },

  // ---- Chapter 3: The car park (one more deck each level) ----------------------------------------------------------------
  {
    // P0, the south row of the east-bound aisle, across from your lane.
    id: 'ground-floor', n: 17, chapter: 3, name: 'Ground floor', teaches: 'Under a deck: walls, columns and parked cars all count. Easy does it.',
    type: 'solo', stage: 2, spawn: at(77, 8.7, E), target: [292], facing: 'any', par: 18, limit: 60,
  },
  {
    id: 'column-reverse', n: 18, chapter: 3, name: 'Column reverse', teaches: 'Reverse in beside a column: watch the rear swing.',
    type: 'solo', stage: 2, spawn: at(108, -9.5, W), target: [299], facing: 'tail', par: 28, limit: 75,
  },
  {
    id: 'ramp', n: 19, chapter: 3, name: 'Up the ramp', teaches: 'Climb to P1 and take the first bay after the ramp.',
    type: 'solo', stage: 3, spawn: at(96, 8.7, E), target: [339], facing: 'any', par: 35, limit: 90,
  },
  {
    id: 'roof', n: 20, chapter: 3, name: 'The roof', teaches: 'A long run to the top. Arrive quick, stop exactly.',
    type: 'solo', stage: 4, spawn: at(96, 8.7, E, 1), target: [370], facing: 'any', par: 40, limit: 90,
  },
  {
    id: 'underground', n: 21, chapter: 3, name: 'Underground', teaches: 'Down into the dark, with people about. Slow down.',
    type: 'solo', stage: 5, spawn: at(109.6, 4, S), target: [274], facing: 'any', peds: 6, par: 50, limit: 110,
  },
  {
    // P0, nose-in between two vans; out along the one-way aisle to the ramp junction.
    id: 'boxed-in', n: 22, chapter: 3, name: 'Boxed in', teaches: 'Vans both sides: reverse out straight before you turn.',
    type: 'unpark', stage: 2, spawn: at(88.05, 15.32, N), target: [], exit: { x: 107, z: 8.7, r: 3.2, lvl: 0 }, facing: 'any', bays: { 280: 'van', 281: 'free', 282: 'van' }, par: 18, limit: 60,
  },
  {
    id: 'two-decks', n: 23, chapter: 3, name: 'Two decks', teaches: 'One bay on the ground floor, one upstairs. Plan the route.',
    type: 'chain', stage: 3, spawn: at(77, 8.7, E), target: [292, 338], facing: 'any', par: 60, limit: 120,
  },
  {
    id: 'decoy-race', n: 24, chapter: 3, name: 'Decoy race', teaches: 'Three rivals and a flickering board. Trust what you see.',
    type: 'race', stage: 3, spawn: 'gate', target: [316], facing: 'any', bots: { n: 3, pace: { cruise: 0.75, launch: 4 } }, par: 60, limit: 90,
  },

  // ---- Chapter 4: Closing time (the whole site) --------------------------------------------------------------------------
  {
    id: 'last-space', n: 25, chapter: 4, name: 'Last space', teaches: 'Reverse in between an SUV and a van, dead straight.',
    type: 'solo', stage: 6, spawn: at(14, 10.7, E), target: [146], facing: 'tail', slack: 0.12, maxAngleDeg: 10, bays: { 147: 'van' }, par: 26, limit: 80,
  },
  {
    id: 'leaver-race', n: 26, chapter: 4, name: 'Leaver race', teaches: 'A second bay opens mid-race. Change plan when it does.',
    type: 'race', stage: 6, spawn: 'gate', target: [183], facing: 'any', leaver: true, bots: { n: 3, pace: { cruise: 0.9, launch: 2 } }, par: 50, limit: 110,
  },
  {
    id: 'rush-hour', n: 27, chapter: 4, name: 'Rush hour', teaches: 'Every shopper is out. Two rivals. Keep your head.',
    type: 'race', stage: 6, spawn: 'gate', target: [154], facing: 'any', leaver: false, bots: { n: 2, pace: { cruise: 0.9, launch: 2 } }, par: 45, limit: 100,
  },
  {
    id: 'parallel-pressure', n: 28, chapter: 4, name: 'Parallel, quick', teaches: 'A tight parallel bay against a short clock.',
    type: 'solo', stage: 6, spawn: at(-58, 4, N), target: [246], facing: 'nose', peds: 10, bays: { 245: 'suv' }, par: 22, limit: 60,
  },
  {
    id: 'grand-tour', n: 29, chapter: 4, name: 'Grand tour', teaches: 'The open lot, the roof, then underground. One run.',
    type: 'chain', stage: 6, spawn: at(22, 10.7, E), target: [149, 370, 274], facing: 'any', peds: 12, par: 150, limit: 300,
  },
  {
    id: 'final', n: 30, chapter: 4, name: 'The final', teaches: 'The whole site, three rivals at full pace, the bay anywhere.',
    type: 'race', stage: 6, spawn: 'gate', target: [], facing: 'any', leaver: true, bots: { n: 3, pace: { cruise: 1, launch: 0 } }, par: 50, limit: 110,
  },
];

export const levelById = (id: string): LevelDef | undefined => CAMPAIGN.find((l) => l.id === id);
export const isRace = (l: LevelDef) => l.type === 'race';

/**
 * A solo clock starts at GO (it used to start on your first press), so every solo par and limit has this much (s) on top for
 * the reaction to GO. The cards still show the round number ("Under 18 s"); a race's clock always started at GO.
 */
export const GO_GRACE = 0.4;
const grace = (l: LevelDef) => (isRace(l) ? 0 : GO_GRACE);
/** The time (s) the second star is judged against. */
export const parTime = (l: LevelDef) => l.par + grace(l);
/** The time (s) the level ends at. */
export const limitTime = (l: LevelDef) => l.limit + grace(l);

// ---------------------------------------------------------------------------
// Rules of a level, as the sim reads them
// ---------------------------------------------------------------------------

export interface Rules {
  facing: Facing;
  slack: number;
  /** Radians. */
  maxAngle: number;
  /** A touch closing at this speed (m/s) or more fails you; slower is a graze. */
  failSpeed: number;
  /** Solo: no rivals, the bay is outlined, the clock starts on your first press. */
  solo: boolean;
}

/** A solo level's touch: a graze below this closing speed (m/s), a hard hit from it. */
export const GRAZE_SPEED = 0.8;

export const rulesOf = (l: LevelDef): Rules => ({
  facing: l.facing,
  slack: l.slack ?? PARK.slack,
  maxAngle: ((l.maxAngleDeg ?? 22) * Math.PI) / 180,
  failSpeed: isRace(l) ? CONTACT.minSpeed : GRAZE_SPEED,
  solo: !isRace(l),
});

/** The race's own rules (the stage rounds): nose or tail, the usual slack and angle, any real touch is out. */
export const RACE_RULES: Rules = { facing: 'any', slack: PARK.slack, maxAngle: PARK.maxAngle, failSpeed: CONTACT.minSpeed, solo: false };

const wrap = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));

/** How far (radians) a heading is from the one the facing rule wants (the nearer way round for 'any'). */
export const angleOff = (h: number, bayH: number, facing: Facing) => {
  const d = Math.abs(wrap(h - bayH));
  return facing === 'nose' ? d : facing === 'tail' ? Math.PI - d : Math.min(d, Math.PI - d);
};

/**
 * How well a car is parked, 0..100: 100 is dead centre and dead straight. Each 15 cm off the bay's centre line costs 10, each
 * 5 degrees of twist costs 10, and standing more than a little deep or shallow costs 10 per 25 cm (the free play is a quarter
 * of the spare length, so a parallel bay is as forgiving along its length as its size suggests). So "centred within about
 * 15 cm and straight within about 5 degrees" is the 80 % the third star asks for.
 */
export const precisionOf = (car: { x: number; z: number; h: number }, bay: Pick<Bay, 'x' | 'z' | 'h' | 'd'>, facing: Facing): number => {
  const fx = Math.sin(bay.h);
  const fz = Math.cos(bay.h);
  const dx = car.x - bay.x;
  const dz = car.z - bay.z;
  const along = Math.abs(dx * fx + dz * fz);
  const across = Math.abs(dx * fz - dz * fx);
  const play = Math.max(0, (bay.d - BODY[0].length) / 4);
  const deg = (angleOff(car.h, bay.h, facing) * 180) / Math.PI;
  const score = 100 - (across / 0.15) * 10 - (deg / 5) * 10 - (Math.max(0, along - play) / 0.25) * 10;
  return Math.max(0, Math.min(100, Math.round(score)));
};

/** The fill a level asks for, as the bay's use and body style. */
const FILL: Record<BayFill, { use: BayUse; variant?: number }> = {
  free: { use: 'free' },
  car: { use: 'car', variant: 0 },
  suv: { use: 'car', variant: 3 },
  van: { use: 'car', variant: 4 },
  corral: { use: 'corral' },
  cones: { use: 'cones' },
};

/** Radius (m) of a level's extra cones (the same cone as in a coned-off bay). */
export const LEVEL_CONE_R = 0.22;

/** The lot as a level plays it: its bays filled or emptied, and its extra cones solid (and listed in `extras` for the renderer). */
export const applyLevel = (lot: Lot, l: LevelDef): Lot => {
  const fills = l.bays ?? {};
  const bays = lot.bays.map((b) => {
    const f = fills[b.id];
    if (!f) return b;
    const { use, variant } = FILL[f];
    return { ...b, use, variant: variant ?? b.variant };
  });
  const extras: Circle[] = (l.cones ?? []).map((c) => {
    const y = levelY(c.lvl ?? 0);
    return { kind: 'circle', x: c.x, z: c.z, r: LEVEL_CONE_R, what: 'a cone', ...(c.lvl !== undefined && c.lvl !== 0 ? { y0: y - 0.1, y1: y + 2.4 } : {}) };
  });
  return { ...lot, bays, solids: [...lot.solids, ...extras], extras };
};

// ---------------------------------------------------------------------------
// Stars
// ---------------------------------------------------------------------------

export interface RunResult {
  /** Parked (in every bay of a chain), reached the exit, or won the race, inside the limit. */
  finished: boolean;
  time: number;
  /** Light touches (a solo level goes on after one; it costs the third star). */
  grazes: number;
  /** 0..100 (the mean over a chain's bays); 100 for an unpark or a race, where it is not scored. */
  precision: number;
}

/** The three goals of a level, each met or not. */
export interface StarGoals {
  finish: boolean;
  par: boolean;
  clean: boolean;
}

export const PRECISION_STAR = 80;

/** Whether precision counts for the third star in this level (not in a race or an unpark). */
export const scoresPrecision = (l: LevelDef) => l.type !== 'race' && l.type !== 'unpark';

export const goalsOf = (l: LevelDef, r: RunResult): StarGoals => ({
  finish: r.finished,
  par: r.finished && r.time <= parTime(l),
  clean: r.finished && r.grazes === 0 && (!scoresPrecision(l) || r.precision >= PRECISION_STAR),
});

/** Stars for a run: one for finishing, plus one each for the par time and a clean, precise park (no stars without finishing). */
export const starsFor = (l: LevelDef, r: RunResult): number => {
  const g = goalsOf(l, r);
  return g.finish ? 1 + (g.par ? 1 : 0) + (g.clean ? 1 : 0) : 0;
};

/** The goals as short lines for the intro and result cards. */
export const goalLines = (l: LevelDef): [string, string, string] => [
  l.type === 'race' ? 'Park first' : l.type === 'unpark' ? 'Drive out' : `Park inside ${l.limit} s`,
  `Under ${l.par} s`,
  l.type === 'race' ? 'Touch nothing at all' : l.type === 'unpark' ? 'No grazes' : `No grazes, ${PRECISION_STAR}% precision`,
];

// ---------------------------------------------------------------------------
// Progress, saved through the platform's storage (a portal's cloud save, or localStorage)
// ---------------------------------------------------------------------------

export const CAMPAIGN_KEY = 'parking-lot.campaign';

export interface LevelRecord {
  stars: number;
  /** Best finishing time (s). */
  best: number;
  /** Best precision (%). */
  precision: number;
}

export interface CampaignProgress {
  levels: Record<string, LevelRecord>;
}

export const emptyProgress = (): CampaignProgress => ({ levels: {} });

/** Reads the save; anything missing, broken or from an unknown level is dropped, never thrown. */
export const loadProgress = (store: KeyValue): CampaignProgress => {
  try {
    const raw = store.getItem(CAMPAIGN_KEY);
    if (!raw) return emptyProgress();
    const data = JSON.parse(raw) as { v?: number; levels?: Record<string, Partial<LevelRecord>> };
    const levels: Record<string, LevelRecord> = {};
    for (const [id, r] of Object.entries(data.levels ?? {})) {
      if (!levelById(id) || typeof r?.stars !== 'number') continue;
      levels[id] = { stars: Math.max(0, Math.min(3, Math.round(r.stars))), best: Number(r.best) || 0, precision: Number(r.precision) || 0 };
    }
    return { levels };
  } catch {
    return emptyProgress();
  }
};

export const saveProgress = (store: KeyValue, p: CampaignProgress) => {
  try {
    store.setItem(CAMPAIGN_KEY, JSON.stringify({ v: 1, levels: p.levels }));
  } catch {
    /* storage full or blocked: progress lives for this visit only */
  }
};

/** Records a run: keeps the best stars, time and precision a level has ever had. Unfinished runs change nothing. */
export const recordRun = (p: CampaignProgress, l: LevelDef, r: RunResult): CampaignProgress => {
  const stars = starsFor(l, r);
  if (!stars) return p;
  const old = p.levels[l.id];
  const rec: LevelRecord = {
    stars: Math.max(stars, old?.stars ?? 0),
    best: old?.best ? Math.min(old.best, r.time) : r.time,
    precision: Math.max(r.precision, old?.precision ?? 0),
  };
  return { levels: { ...p.levels, [l.id]: rec } };
};

export const totalStars = (p: CampaignProgress) => Object.values(p.levels).reduce((a, r) => a + r.stars, 0);
export const starsIn = (p: CampaignProgress, chapter: number) => CAMPAIGN.filter((l) => l.chapter === chapter).reduce((a, l) => a + (p.levels[l.id]?.stars ?? 0), 0);

export const chapterOpen = (p: CampaignProgress, chapter: number) => totalStars(p) >= CHAPTERS[chapter - 1].gate;

/** A level is open when its chapter's star gate is met and the level before it has been finished (the very first is always open). */
export const levelOpen = (p: CampaignProgress, l: LevelDef) => {
  if (!chapterOpen(p, l.chapter)) return false;
  if (l.n === 1) return true;
  const prev = CAMPAIGN[l.n - 2];
  return (p.levels[prev.id]?.stars ?? 0) > 0;
};

/** Where "Continue" takes you: the first open level not yet finished, else the first open level short of three stars, else the last. */
export const continueLevel = (p: CampaignProgress): LevelDef => {
  const open = CAMPAIGN.filter((l) => levelOpen(p, l));
  return open.find((l) => !p.levels[l.id]) ?? open.find((l) => (p.levels[l.id]?.stars ?? 0) < 3) ?? open[open.length - 1] ?? CAMPAIGN[0];
};

/** The level after this one, if it is open now. */
export const nextOpenLevel = (p: CampaignProgress, l: LevelDef): LevelDef | null => {
  const next = CAMPAIGN[l.n];
  return next && levelOpen(p, next) ? next : null;
};

/** The endless race (the six random stages) opens once the first chapter's race is won. */
export const endlessOpen = (p: CampaignProgress) => (p.levels['first-race']?.stars ?? 0) > 0;
