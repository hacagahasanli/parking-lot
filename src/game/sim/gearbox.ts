/**
 * The manual gearbox: an option for the player's car only (bots always drive the automatic in `drive`).
 *
 * Arcade rules, realistic feel:
 *  - gears R, N, 1..4. One press shifts one gear; no clutch and no stalling.
 *  - each forward gear covers a band of road speed; the engine's revs are where the car is in that band. Low in the band
 *    (a high gear at walking pace) the engine lugs and pulls weakly; through the middle it pulls hardest; at the top it hits
 *    the rev limiter and stops pulling until you shift up.
 *  - lower gears pull harder (1st is the strongest from a standstill), 4th reaches the same top speed as the automatic, so
 *    a good shifter is a little quicker off the line but never faster flat out.
 *  - R is only accepted when the car is (nearly) stopped; in R the gas pedal drives backwards. The brake only ever brakes.
 *  - off the gas in gear, the engine brakes the car a little (more in low gears).
 * Pure (no DOM): `sim.test.ts` and `gearbox.test.ts` drive it directly.
 */
import { DRIVE } from './constants';

import type { Car } from './types';

export const MANUAL = {
  /** Highest forward gear. */
  top: 4,
  /** Road speed (m/s) at the rev limiter in each gear (index = gear); 4th is the automatic's top speed. */
  limit: [0, 3.4, 6.1, 8.6, DRIVE.topSpeed],
  /** Pull (m/s²) at the best revs in each gear. */
  pull: [0, 3.3, 2.95, 2.55, 2.15],
  /** Reverse: same cap and pull as the automatic's reverse. */
  reverseLimit: DRIVE.reverseTop,
  reversePull: DRIVE.reverseAccel,
  idle: 850,
  redline: 6400,
  /** Share of the band where the shift light comes on. */
  shiftLight: 0.86,
  /** R is refused above this speed (m/s), forwards or backwards. */
  reverseBelow: 0.6,
  /** Engine braking (m/s²) off the gas in 1st; less in higher gears. */
  engineBrake: 1.1,
} as const;

/** -1 is R, 0 is N, 1..4 forward. */
export type ManualGear = -1 | 0 | 1 | 2 | 3 | 4;

/** What a shift did: 'up' / 'down' moved a gear, 'denied' was refused (R while rolling, or past the end of the gate). */
export type ShiftResult = 'up' | 'down' | 'denied';

export const gearName = (g: ManualGear) => (g === -1 ? 'R' : g === 0 ? 'N' : String(g));

/** Shift one gear up (+1) or down (-1). R is only reached from N with the car (nearly) stopped. */
export const shift = (c: Car, dir: 1 | -1, vF: number): ShiftResult => {
  const g = c.mgear;
  if (dir === 1) {
    if (g >= MANUAL.top) return 'denied';
    c.mgear = (g + 1) as ManualGear;
    return 'up';
  }
  if (g === -1) return 'denied';
  if (g === 0 && Math.abs(vF) > MANUAL.reverseBelow) return 'denied';
  c.mgear = (g - 1) as ManualGear;
  return 'down';
};

/** How far through its gear's band the car is (0 idle .. 1 rev limiter); 0 in N. */
export const band = (g: ManualGear, vF: number) => {
  if (g === 0) return 0;
  if (g === -1) return Math.min(1, Math.max(0, -vF) / MANUAL.reverseLimit);
  return Math.min(1, Math.max(0, vF) / (MANUAL.limit as readonly number[])[g]);
};

/** The engine's pull at a point in the band (0..1 of the gear's best): weak when lugging, strongest mid-band, fading to the limiter. */
export const torque = (g: ManualGear, r: number) => {
  if (r >= 1) return 0;
  // 1st (and R) pull from a standstill; higher gears lug until the revs come up.
  const low = g === 1 || g === -1 ? 1 : 0.22 + 0.78 * smooth(0.05, 0.45, r);
  const high = 1 - 0.45 * smooth(0.82, 1, r);
  return low * high;
};

const smooth = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

/**
 * Longitudinal force for the manual car this step: `engine` (m/s², signed along the nose) and the extra `resist` (m/s²),
 * plus the revs for the dials and the sound. `free` revs are what the engine does with no load (N, or during the countdown).
 */
export const manualDrive = (c: Car, throttle: number, brake: number, vF: number) => {
  const g = c.mgear;
  const r = band(g, vF);
  let engine = 0;
  let resist = 0;
  let limiter = false;
  if (g >= 1) {
    if (throttle > 0) {
      if (r >= 1 && vF > 0) limiter = true;
      engine = throttle * (MANUAL.pull as readonly number[])[g] * torque(g, r);
    } else if (vF > 0.5) resist += (MANUAL.engineBrake * (MANUAL.top + 1 - g)) / MANUAL.top;
  } else if (g === -1) {
    if (throttle > 0) {
      if (r >= 1) limiter = true;
      engine = -throttle * MANUAL.reversePull * torque(g, r);
    }
  }
  if (brake > 0) resist += brake * DRIVE.brake;
  // Revs: in gear they follow the wheels (never under idle); in N (or held at the line) the gas blips them freely.
  const inGear = g !== 0 && Math.abs(vF) > 0.3;
  const free = MANUAL.idle + throttle * (MANUAL.redline - MANUAL.idle) * 0.92;
  const rpm = inGear ? Math.max(MANUAL.idle + (g === 1 || g === -1 ? throttle * 700 : 0), MANUAL.idle + r * (MANUAL.redline - MANUAL.idle)) : free;
  return { engine, resist, rpm: Math.min(MANUAL.redline, rpm), limiter };
};
