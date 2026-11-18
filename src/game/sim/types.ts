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
}

export const NO_INPUT: Input = { throttle: 0, brake: 0, steer: 0, handbrake: false, horn: false };

export interface Car {
  id: number;
  name: string;
  color: number;
  bot: boolean;
  x: number;
  z: number;
  h: number;
  vx: number;
  vz: number;
  /** Yaw rate (rad/s); positive turns left. */
  w: number;
  /** Front wheel angle (rad); positive is to the right. */
  steer: number;
  /** 1 drive, -1 reverse. Switches by itself like an automatic. */
  gear: 1 | -1;
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
}

export type GameEvent =
  | { type: 'count'; n: number }
  | { type: 'go' }
  | { type: 'bump'; car: number; other: number; bay: number; speed: number; x: number; z: number }
  | { type: 'alarm'; bay: number }
  | { type: 'parked'; car: number; time: number }
  | { type: 'end'; winner: number | null };

export interface GameState {
  /** Seconds since the round was created (countdown included). */
  t: number;
  /** Race clock, from GO. */
  clock: number;
  phase: 'countdown' | 'race' | 'done';
  cars: Car[];
  /** The one free bay this round. */
  target: number;
  winner: number | null;
  /** Bay id -> time its alarm stops. */
  alarms: Record<number, number>;
  events: GameEvent[];
  seed: number;
}

/** Fixed per round: the lot and the colliders (the parked cars with the target bay left empty). */
export interface World {
  lot: Lot;
  solids: Shape[];
  /** Bay id for each solid (parked car / corral / cones), -1 for kerbs and posts. */
  owner: number[];
}
