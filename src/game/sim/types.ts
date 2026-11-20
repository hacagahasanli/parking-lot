import type { Flavour } from './flavour';
import type { ManualGear, ShiftResult } from './gearbox';
import type { Lot, Shape } from './lot';

/** One frame of a driver's controls. Keyboard, touch and bots all produce this. */
export interface Input {
  /** 0..1, W / up. */
  throttle: number;
  /** 0..1, S / down: brakes while rolling forward, reverses once stopped. */
  brake: number;
  /** -1 (left) .. 1 (right): where the driver *wants* the wheel; the car turns it there at its own pace. */
  steer: number;
  handbrake: boolean;
  horn: boolean;
  /** Manual gearbox only: shift one gear up (1) or down (-1) this step (one key press is one step's shift). */
  shift?: 1 | -1;
}

export const NO_INPUT: Input = { throttle: 0, brake: 0, steer: 0, handbrake: false, horn: false };

export interface Car {
  id: number;
  name: string;
  color: number;
  bot: boolean;
  x: number;
  z: number;
  /** Height of the road under the car (m): the level it is on, or part way up a ramp. */
  y: number;
  /** Slope along the nose (rise over run, positive uphill), for the engine and the body pitch. */
  grade: number;
  h: number;
  vx: number;
  vz: number;
  /** Yaw rate (rad/s); positive turns left. */
  w: number;
  /** Front wheel angle (rad); positive is to the right. */
  steer: number;
  /** 1 drive, -1 reverse. Switches by itself like an automatic (with the manual box it follows `mgear`: -1 only in R). */
  gear: 1 | -1;
  /** 'auto' (every bot, and the player by default) or 'manual' (the player's option, see gearbox.ts). */
  box: 'auto' | 'manual';
  /** The manual gear: -1 R, 0 N, 1..4 (kept at 1 with the automatic). */
  mgear: ManualGear;
  /** Engine revs from the manual gearbox (0 with the automatic: the renderer works its own out). */
  rpm: number;
  /** The manual engine is on the rev limiter this step. */
  limiter: boolean;
  /** What the last shift request did this step ('up', 'down', 'denied'), for the sound; null when there was none. */
  shifted: ShiftResult | null;
  /** What the pedals did this step, for lights and sound. */
  throttle: number;
  braking: boolean;
  handbrake: boolean;
  horn: boolean;
  /** How much the tyres are sliding sideways (m/s), for the screech and tyre marks. */
  slip: number;
  /** 0..1 how far through "stopped inside the bay" this car is. */
  park: number;
  /** Share of the car's corners inside the bay (0..1), for the HUD. */
  inBay: number;
  /** Race time when parked, or null. */
  parkedAt: number | null;
  bumps: number;
  topSpeed: number;
  distance: number;
  /** Seconds before this car can make another bump event (stops one crash firing ten sounds). */
  hitCooldown: number;
  /** Disqualified for hitting a pedestrian: the car is stopped for good, with its hazards on. Race time of the hit, or null. */
  dq: number | null;
  /** Why this car is out: a car, or a hard fixed thing, it hit (`what` reads "Staging", "a parked car", "a post"). Null with `dq` set means a pedestrian. */
  dqWhy: { kind: 'car' | 'obstacle'; what: string } | null;
  /** Pedestrians this car has hit. */
  incidents: number;
  /** The free bay this car is closest to being inside (-1 when in none), and the share of its corners in it. */
  bay: number;
  /** 0..1 kick from the last speed bump, decaying; the renderer pitches the body with it. */
  jolt: number;
}

/** What a shopper is doing. */
export type PedMode = 'walk' | 'dwell' | 'wait' | 'dodge' | 'down';

/** A shopper on foot. Fully deterministic from the round's seed, so online play can reuse it. */
export interface Ped {
  id: number;
  x: number;
  z: number;
  /** Height of the floor the shopper is on. */
  y: number;
  /** Facing: like a car's heading, (sin h, cos h). */
  h: number;
  vx: number;
  vz: number;
  mode: PedMode;
  /** Seconds in the current mode. */
  t: number;
  /** Which walk loop (index into `World.walks`), the waypoint heading to, and the direction along the loop. */
  walk: number;
  next: number;
  dir: 1 | -1;
  speed: number;
  trolley: boolean;
  /** Looks: indexes into the renderer's palettes. */
  look: { shirt: number; pants: number; skin: number; hair: number; height: number };
  /** Walking cycle phase (radians), advanced by distance walked. */
  phase: number;
  /** Seconds before this person can be hit again (they get up and are not a target for a moment). */
  immune: number;
  /** How far the car that threatens us is, last step (for the dodge). */
  threat: number;
}

/** A walk loop: waypoints with how long the person lingers at each (opening a boot, loading bags). */
export interface Walk {
  points: { x: number; z: number; dwell: number }[];
  /** Floor height (0 for the open lot). */
  y?: number;
}

/** A shopper's chatter line on the radio, or a driver's. */
export interface ChatLine {
  id: number;
  /** Race clock when it was said. */
  t: number;
  /** Which car said it. */
  who: number;
  name: string;
  color: number;
  text: string;
  kind: 'spot' | 'bumped' | 'honked' | 'honker' | 'lost' | 'incident' | 'crash' | 'crashSelf' | 'leave' | 'leaveUp' | 'recover' | 'win';
}

/** The parked car that pulls out of its bay mid-round (a free bay appears where it was). */
export interface Leaver {
  car: Car;
  bay: number;
  /** Race clock at which it starts to pull out. */
  at: number;
  phase: 'wait' | 'reverse' | 'out' | 'gone';
  /** Parked nose-out in the car park: it drives straight out instead of reversing. */
  forward: boolean;
  /** Seconds in this phase. */
  t: number;
  /** The way to the exit gate once it is out in the aisle, and the segment it is on. */
  route: { x: number; z: number }[];
  seg: number;
}

export type GameEvent =
  | { type: 'count'; n: number }
  | { type: 'go' }
  | { type: 'bump'; car: number; other: number; bay: number; speed: number; x: number; z: number }
  | { type: 'alarm'; bay: number }
  | { type: 'parked'; car: number; time: number; bay: number }
  | { type: 'end'; winner: number | null }
  /** A pedestrian was hit by `car` at `speed` m/s. */
  | { type: 'incident'; car: number; ped: number; speed: number; x: number; z: number }
  /** `car` was at fault in a contact with `other` (a car id, or -1 for a hard fixed thing called `what`) at `speed` m/s closing, and is out. */
  | { type: 'crash'; car: number; other: number; what: string; speed: number; x: number; z: number }
  /** A bot made out the free bay. */
  | { type: 'spot'; car: number; bay: number; dist: number }
  /** A bot leaned on its horn at the car ahead. */
  | { type: 'honk'; car: number; at: number }
  /** A bot is backing out of a jam. */
  | { type: 'recover'; car: number }
  /** The parked car starts to pull out, and the bay it leaves is free from now on. */
  | { type: 'leave'; bay: number; lvl: number; garage: boolean }
  | { type: 'vacated'; bay: number };

export interface GameState {
  /** Seconds since the round was created (countdown included). */
  t: number;
  /** Race clock, from GO. */
  clock: number;
  /** Which words the round uses (radio lines, driver names): see `flavour.ts`. Left out: 'studio'. */
  flavour?: Flavour;
  /** The round ends when the race clock reaches this (RACE.maxTime unless a test asks for longer). */
  maxTime: number;
  phase: 'countdown' | 'race' | 'done';
  cars: Car[];
  /** The entry barriers: 0 down, 1 fully up. They start to lift at GO. */
  gate: { open: number };
  /** The one free bay this round. */
  target: number;
  /** A second free bay, once the leaving car has driven out of its own (-1 until then). */
  extra: number;
  /** The bay the winner parked in (-1 until someone wins). */
  winBay: number;
  winner: number | null;
  peds: Ped[];
  leaver: Leaver | null;
  /** The radio: the latest things bots said (newest last). */
  chat: ChatLine[];
  /** Race clock when each car last spoke, when anyone last spoke, and a counter for line ids and picks. */
  chatLast: Record<number, number>;
  chatAny: number;
  chatN: number;
  /** Bay id -> time its alarm stops. */
  alarms: Record<number, number>;
  events: GameEvent[];
  seed: number;
}

/** Fixed per round: the lot and the colliders (the parked cars with the target bay left empty). */
/** `World.owner` values for the barrier arms. */
export const OWNER_ENTRY = -2;
export const OWNER_EXIT = -3;

export interface World {
  lot: Lot;
  solids: Shape[];
  /** Bay id for each solid (parked car / corral / cones), -1 for kerbs and posts, `OWNER_ENTRY` / `OWNER_EXIT` for the barrier arms. */
  owner: number[];
  /** What each solid is called when hitting it puts you out ("a parked car", "a post"), or null for the kerbs, planters and walls you may scrape. */
  hard: (string | null)[];
  /** Where the shoppers walk. */
  walks: Walk[];
  /** Which of the walkers push a trolley (same order as `walks`). */
  trolley: boolean[];
  /** Which solids are near which 12 m cell (a solid is listed in every cell its bounding circle plus a car's reach touches): `crashes` only tests those. */
  grid: Map<number, number[]>;
}
