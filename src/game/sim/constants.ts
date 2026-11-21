/**
 * Every number the rules depend on. Units: metres, seconds, kilograms, radians.
 *
 * World axes (same as three.js): x east, z north, y up. A heading `h` points the car along
 * (sin h, cos h), so h = 0 faces north (towards the market) and turning right lowers h.
 */

/** Fixed simulation step: 60 Hz, independent of the screen's refresh rate. */
export const DT = 1 / 60;

/**
 * Length and width of each body style, nose to tail and mirror-less flank to flank. The renderer scales its meshes to these and
 * the colliders are built from the same shapes (sim/body.ts), so the two cannot drift apart.
 * 0: the racers' fastback sedan, 1: crossover, 2: hatchback, 3: SUV, 4: van.
 */
export const BODY = [
  { length: 4.45, width: 1.78 },
  { length: 4.393, width: 1.8135 },
  { length: 4.1065, width: 1.755 },
  { length: 4.72, width: 1.92 },
  { length: 4.95, width: 1.98 },
] as const;

/** A compact sedan, about the size of a current C-segment four-door (body style 0). */
export const CAR = {
  length: BODY[0].length,
  width: BODY[0].width,
  wheelbase: 2.62,
  /** Front and rear axle distance from the centre (the body overhangs both). */
  frontAxle: 1.33,
  rearAxle: -1.29,
  mass: 1350,
  /** Moment of inertia about the vertical axis (a box, a little more for the engine up front). */
  inertia: 1350 * (4.45 * 4.45 + 1.78 * 1.78) / 12 * 1.1,
} as const;

/**
 * How the car drives. Tuned to feel like a real car in a car park, not a race track: gentle
 * acceleration, about 38 km/h flat out, a wheel that turns over about a third of a second from
 * centre to lock, comes back by itself, and locks less at speed (the fade is scaled to the top
 * speed, so the steering feels the same at the same share of it).
 */
export const DRIVE = {
  /** Most the front wheels turn at walking pace and at full speed. */
  maxSteer: 0.66,
  maxSteerFast: 0.3,
  /** Speed (m/s) at which the steering has dropped to `maxSteerFast`. */
  steerFadeSpeed: 10.5,
  /** How fast the wheel turns towards lock (rad/s, about 0.3 s centre to lock), and back to centre when let go. */
  steerRate: 2.3,
  steerReturn: 3.2,
  /**
   * On/off steering (keys, the phone's arrow buttons) turns the wheel slower when crawling, so a tap is a small correction:
   * this rate at a standstill, rising to `steerRate` by `fineSpeed` (m/s). Analogue sticks and the bots keep `steerRate`.
   */
  steerRateFine: 1.3,
  fineSpeed: 2,
  /** Forward engine: acceleration at a standstill, and top speed (≈ 38 km/h). */
  accel: 2.8,
  topSpeed: 10.5,
  /** Reverse: gentler still, and capped like a real reverse gear (≈ 14 km/h). */
  reverseAccel: 2.1,
  reverseTop: 4,
  brake: 8,
  /** Rolling resistance and air drag when nothing is pressed. */
  roll: 0.9,
  drag: 0.0035,
  /** Sideways grip (m/s² the tyres can cancel) and with the handbrake pulled. */
  grip: 13,
  gripHandbrake: 4.5,
  /** Most sideways acceleration before the front washes out (understeer). */
  maxLateral: 8.5,
  /** How quickly the body's spin follows the wheels (1/s), normal and on the handbrake. */
  yawFollow: 9,
  yawFollowHandbrake: 2.2,
  /** Handbrake lets the tail come round: a little extra rotation. */
  handbrakeYaw: 1.3,
  handbrakeDecel: 3.5,
  /** The handbrake lets the tyres slide sideways this much more (times `maxLateral`). */
  handbrakeLateral: 1.5,
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

/**
 * Contact is out. Any real touch between your car and another car, or a hard fixed thing, disqualifies
 * the driver at fault (see `crashes` in step.ts). Kerbs, planters, walls and ramp sides are fine; cars
 * (racers, parked, the one pulling out, the van and the truck), posts, lamps, columns, cones, trolley
 * corrals, ticket machines and the barrier arms are not.
 */
export const CONTACT = {
  /** Closing speed (m/s) below which a touch is a feather and nobody is out. */
  minSpeed: 0.5,
  /** A car is at fault when its own velocity at the contact point drives into the other body at more than this (m/s). */
  faultSpeed: 0.25,
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

/** Pedestrians: shoppers on foot. */
export const PED = {
  /** Walking pace (m/s), plus or minus a little per person. */
  walk: 1.3,
  /** Stepping out of the way of a car. */
  dodge: 2.7,
  /** Body radius for collisions. */
  radius: 0.3,
  /** A car faster than this (m/s) that touches someone is disqualified (walking pace is 1.3). */
  hitSpeed: 1,
  /** How long the shopper stays down, in total including getting up (s). */
  down: 2.6,
  /** People on the lot. */
  count: 30,
} as const;

export const RACE = {
  /**
   * From the start of a round to GO (s): first the lead-in (the camera comes down onto your car, the level card), then the
   * last `count` seconds are the big 3-2-1. Every round has it, solo levels too; the cars hold on the brake until GO.
   */
  countdown: 5,
  /** The numbers called (3, 2, 1, then GO). The lead-in before them can be skipped (`skipIntro`). */
  count: 3,
  /** After the winner parks, how long the others get before the round ends (they can still finish 2nd, 3rd). */
  afterWin: 6,
  /** Hard limit on a round (seconds from GO): two minutes, so a lost round never drags. */
  maxTime: 120,
} as const;

/** Car colours and the names on the scoreboard. Player 0 is you offline. */
export const DRIVERS = [
  { name: 'You', color: 0xd8222b },
  // The rivals' names come from the flavour (sim/flavour.ts); these are only a fallback.
  { name: 'Blue', color: 0x2c6fd6 },
  { name: 'White', color: 0xf2f2ee },
  { name: 'Grey', color: 0x3a3d44 },
] as const;
