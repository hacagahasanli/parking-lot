/**
 * Every number the rules depend on. Units: metres, seconds, kilograms, radians.
 *
 * World axes (same as three.js): x east, z north, y up. A heading `h` points the car along
 * (sin h, cos h), so h = 0 faces north (towards the market) and turning right lowers h.
 */

/** Fixed simulation step: 60 Hz, independent of the screen's refresh rate. */
export const DT = 1 / 60;

/** A compact sedan, about the size of a current C-segment four-door. */
export const CAR = {
  length: 4.68,
  width: 1.82,
  wheelbase: 2.72,
  /** Front and rear axle distance from the centre (the body overhangs both). */
  frontAxle: 1.38,
  rearAxle: -1.34,
  mass: 1350,
  /** Moment of inertia about the vertical axis (a box, a little more for the engine up front). */
  inertia: 1350 * (4.68 * 4.68 + 1.82 * 1.82) / 12 * 1.1,
} as const;

/**
 * How the car drives. Tuned to feel like a real car in a car park, not a go-kart: the wheel turns
 * over about half a second from centre to lock, comes back by itself, and locks less at speed.
 */
export const DRIVE = {
  /** Most the front wheels turn at walking pace and at full speed. */
  maxSteer: 0.6,
  maxSteerFast: 0.16,
  /** Speed (m/s) at which the steering has dropped to `maxSteerFast`. */
  steerFadeSpeed: 20,
  /** How fast the wheel turns towards lock (rad/s), and back to centre when let go. */
  steerRate: 1.25,
  steerReturn: 2.6,
  /** Forward engine: acceleration at a standstill, and top speed (≈ 68 km/h). */
  accel: 5.2,
  topSpeed: 19,
  /** Reverse: gentler, and capped like a real reverse gear (≈ 22 km/h). */
  reverseAccel: 3.4,
  reverseTop: 6.2,
  brake: 10.5,
  /** Rolling resistance and air drag when nothing is pressed. */
  roll: 0.9,
  drag: 0.0035,
  /** Sideways grip (m/s² the tyres can cancel) and with the handbrake pulled. */
  grip: 13,
  gripHandbrake: 3.2,
  /** Most sideways acceleration before the front washes out (understeer). */
  maxLateral: 8.5,
  /** How quickly the body's spin follows the wheels (1/s), normal and on the handbrake. */
  yawFollow: 9,
  yawFollowHandbrake: 2.2,
  /** Handbrake lets the tail come round: a little extra rotation. */
  handbrakeYaw: 1.55,
  handbrakeDecel: 4.5,
} as const;

/** Collisions between cars and with the world. */
export const IMPACT = {
  restitution: 0.25,
  friction: 0.35,
  /** Below this closing speed (m/s) a touch is a scrape, above it a bump with an event. */
  bump: 1.2,
  /** Hit a parked car this hard and its alarm goes off. */
  alarm: 3,
} as const;

/** What counts as parked. */
export const PARK = {
  /** Tolerance: how far (m) the body may stick out of the painted bay. */
  slack: 0.22,
  /** Most the car may be twisted against the bay (either way round: nose in or reversed in). */
  maxAngle: (22 * Math.PI) / 180,
  /** Stopped means slower than this (m/s)... */
  maxSpeed: 0.45,
  /** ...for this long. */
  hold: 0.9,
} as const;

export const RACE = {
  countdown: 3,
  /** After the winner parks, how long the others get before the round ends (they can still finish 2nd, 3rd). */
  afterWin: 6,
  /** Hard limit on a round. */
  maxTime: 240,
} as const;

/** Car colours and the names on the scoreboard. Player 0 is you offline. */
export const DRIVERS = [
  { name: 'You', color: 0xd8222b },
  { name: 'Staging', color: 0x2c6fd6 },
  { name: 'Hotfix', color: 0xf2f2ee },
  { name: 'Legacy', color: 0x3a3d44 },
] as const;
