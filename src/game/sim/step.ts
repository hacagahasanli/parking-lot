/**
 * The rules: one fixed 1/60 s step of every car, the crashes between them, and who parked first.
 * Pure functions over plain objects, so the same code can later run on a host for online play.
 */
import { CAR, CONTACT, DRIVE, DRIVERS, DT, IMPACT, PARK, RACE } from './constants';
import { collide, corners, insideBox, nearShape } from './collide';
import { bayShape, buildLot, rng } from './lot';
import { LEVELS, LEVEL_H, levelOf, rampUnder, sameStorey, surfaceAt } from './levels';
import { followRoute, routeToNode } from './nav';
import { buildWalks, createPeds, pedLimit, stepPeds } from './ped';
import { stageLot } from './stages';

import type { Box, Lot, Shape } from './lot';
import { OWNER_ENTRY, OWNER_EXIT } from './types';

import type { Car, GameState, Input, Leaver, World } from './types';

// ---------------------------------------------------------------------------
// Round setup
// ---------------------------------------------------------------------------

const CELL = 12;
const cellKey = (ix: number, iz: number) => ix * 4096 + iz;

/** Indexes of the solids near a point (the 12 m cell it is in). */
export const nearSolids = (world: World, x: number, z: number): number[] => world.grid.get(cellKey(Math.floor(x / CELL) + 100, Math.floor(z / CELL) + 100)) ?? [];

/** Buckets the solids by 12 m cell so a car only tests what is near it. */
const buildGrid = (solids: Shape[]) => {
  const grid = new Map<number, number[]>();
  solids.forEach((s, i) => {
    const r = (s.kind === 'box' ? Math.hypot(s.hw, s.hl) : s.r) + CAR.length / 2 + 0.5;
    for (let ix = Math.floor((s.x - r) / CELL); ix <= Math.floor((s.x + r) / CELL); ix++) {
      for (let iz = Math.floor((s.z - r) / CELL); iz <= Math.floor((s.z + r) / CELL); iz++) {
        const k = cellKey(ix + 100, iz + 100);
        const list = grid.get(k);
        if (list) list.push(i);
        else grid.set(k, [i]);
      }
    }
  });
  return grid;
};

/**
 * The colliders for a round. The free bay is empty; so is the bay of the car that pulls out
 * mid-round (`leaving`), whose car is a moving body instead of a solid.
 */
export const createWorld = (target: number, lot: Lot = buildLot(), leaving = -1, seed = 1): World => {
  const solids: Shape[] = [...lot.solids];
  const owner: number[] = lot.solids.map(() => -1);
  // Hard things (hitting one is out): posts, lamps and columns, the van and the truck, pallets, cages and the ticket machines.
  const propNames: Partial<Record<string, string>> = { truck: 'the truck', van: 'a van', pallet: 'a pallet', cage: 'a cage', ticket: 'a ticket machine' };
  const hard: (string | null)[] = lot.solids.map((s) => {
    if (lot.closures.some((c) => c.solid === s)) return 'a barrier';
    if (s.kind === 'circle') return s.r < 0.5 ? 'a post' : null;
    const prop = lot.props.find((p) => propNames[p.kind] && Math.abs(p.x - s.x) < 0.01 && Math.abs(p.z - s.z) < 0.01);
    return prop ? propNames[prop.kind]! : null;
  });
  for (const bay of lot.bays) {
    if (bay.id === target || bay.id === leaving) continue;
    const shape = bayShape(bay);
    if (!shape) continue;
    solids.push(shape);
    owner.push(bay.id);
    hard.push(bay.use === 'car' ? 'a parked car' : bay.use === 'corral' ? 'a trolley corral' : 'a cone');
  }
  // The barrier arms: solid while they are down (the entry ones until the gate has lifted).
  for (const g of lot.gates) {
    solids.push(g.box);
    owner.push(g.kind === 'entry' ? OWNER_ENTRY : OWNER_EXIT);
    hard.push('a barrier');
  }
  // Shoppers only where the site is open: none on a floor that is shut.
  const built = buildWalks(lot, seed);
  const keep = built.walks.map((w) => w.y === undefined || !lot.open || (lot.open.garage && lot.open.levels.includes(levelOf(w.y))));
  return {
    lot,
    solids,
    owner,
    hard,
    walks: built.walks.filter((_, i) => keep[i]),
    trolley: built.trolley.filter((_, i) => keep[i]),
    grid: buildGrid(solids),
  };
};

export const makeCar = (id: number, name: string, color: number, bot: boolean, x: number, z: number, h: number): Car => ({
  id,
  name,
  color,
  bot,
  x,
  z,
  y: 0,
  grade: 0,
  h,
  vx: 0,
  vz: 0,
  w: 0,
  steer: 0,
  gear: 1,
  throttle: 0,
  braking: false,
  handbrake: false,
  horn: false,
  slip: 0,
  park: 0,
  inBay: 0,
  parkedAt: null,
  bumps: 0,
  topSpeed: 0,
  distance: 0,
  hitCooldown: 0,
  dq: null,
  dqWhy: null,
  incidents: 0,
  bay: -1,
  jolt: 0,
});

export interface RoundOptions {
  seed: number;
  /** Which seats are driven by bots (the rest are people). */
  bots: boolean[];
  names?: string[];
  /** Force the free bay (tests); otherwise random among the candidates. */
  target?: number;
  /** Force the bay the pulling-out car leaves (tests). */
  leaver?: number;
  /** Which stage to play (1 to 6, see `stages.ts`); left out, the whole site is open with the free bay anywhere. */
  stage?: number;
}

/**
 * The free bay: first a zone (the open lot, or one of the four decks), then a bay in it. The car park is
 * most of the lot's new area, so it gets most of the rounds, and no deck is more likely than another.
 */
export const pickTarget = (lot: Lot, rand: () => number): number => {
  const zones: { weight: number; ids: number[] }[] = [
    { weight: 0.4, ids: lot.candidates.filter((id) => !lot.bays[id].garage) },
    ...LEVELS.map((l) => ({ weight: 0.15, ids: lot.candidates.filter((id) => lot.bays[id].garage && lot.bays[id].lvl === l) })),
  ].filter((z) => z.ids.length);
  let r = rand() * zones.reduce((a, z) => a + z.weight, 0);
  let zone = zones[zones.length - 1];
  for (const z of zones) {
    if (r < z.weight) {
      zone = z;
      break;
    }
    r -= z.weight;
  }
  return zone.ids[Math.floor(rand() * zone.ids.length)];
};

export const createRound = (fullLot: Lot, opts: RoundOptions): { state: GameState; world: World } => {
  const lot = opts.stage ? stageLot(fullLot, opts.stage) : fullLot;
  const rand = rng(opts.seed * 7919 + 13);
  const target = opts.target ?? pickTarget(lot, rand);
  const cars: Car[] = opts.bots.map((bot, i) => {
    const s = lot.starts[i];
    return makeCar(i, opts.names?.[i] ?? DRIVERS[i].name, DRIVERS[i].color, bot, s.x, s.z, s.h);
  });
  // One parked car will pull out part-way through the round, and the bay it leaves is free too.
  // In the open lot it is an ordinary car in an angled bay and backs straight out; in the car park it
  // is a car that was parked nose-out and drives away along the deck, down the ramps and out. It is
  // often upstairs when the free bay is outdoors, and the other way round.
  const ordinary = lot.eligible.filter((id) => id !== target && lot.bays[id].variant < 3);
  const upstairs = ordinary.filter((id) => lot.bays[id].garage);
  const outside = ordinary.filter((id) => !lot.bays[id].garage && lot.bays[id].type === 'angled');
  const wantGarage = lot.bays[target].garage ? rand() < 0.3 : rand() < 0.7;
  const pool = wantGarage && upstairs.length ? upstairs : outside.length ? outside : upstairs;
  const leaveBay = lot.bays[opts.leaver ?? pool[Math.floor(rand() * pool.length)]];
  const forward = leaveBay.garage;
  const leaver: Leaver = {
    car: makeCar(10, 'Parked car', leaveBay.color, true, leaveBay.x + Math.sin(leaveBay.h) * 0.12, leaveBay.z + Math.cos(leaveBay.h) * 0.12, forward ? leaveBay.h + Math.PI : leaveBay.h),
    bay: leaveBay.id,
    at: 12 + rand() * 16,
    phase: 'wait',
    t: 0,
    route: [],
    seg: 0,
    forward,
  };
  leaver.car.y = leaveBay.y;
  const world = createWorld(target, lot, leaveBay.id, opts.seed);
  const state: GameState = {
    t: 0,
    clock: 0,
    phase: 'countdown',
    cars,
    target,
    gate: { open: 0 },
    extra: -1,
    winBay: -1,
    winner: null,
    peds: createPeds(world, world.trolley, opts.seed),
    leaver,
    chat: [],
    chatLast: {},
    chatAny: -99,
    chatN: 0,
    alarms: {},
    events: [],
    seed: opts.seed,
  };
  return { state, world };
};

// ---------------------------------------------------------------------------
// Driving
// ---------------------------------------------------------------------------

export const carBox = (c: { x: number; z: number; h: number }): Box => ({
  kind: 'box',
  x: c.x,
  z: c.z,
  hw: CAR.width / 2,
  hl: CAR.length / 2,
  h: c.h,
});

/** Signed speed along the car's nose (m/s). */
export const forwardSpeed = (c: Car) => c.vx * Math.sin(c.h) + c.vz * Math.cos(c.h);

/** The most the wheels may turn at this speed: full lock in the car park, a few degrees at 60 km/h. */
export const steerLimit = (speed: number) => {
  const k = Math.min(1, Math.abs(speed) / DRIVE.steerFadeSpeed);
  return DRIVE.maxSteer + (DRIVE.maxSteerFast - DRIVE.maxSteer) * Math.sqrt(k);
};

const approach = (v: number, target: number, maxStep: number) =>
  v < target ? Math.min(target, v + maxStep) : Math.max(target, v - maxStep);

export const drive = (c: Car, input: Input, dt = DT) => {
  const fx = Math.sin(c.h);
  const fz = Math.cos(c.h);
  // `s` is the car's left side.
  const sx = fz;
  const sz = -fx;
  let vF = c.vx * fx + c.vz * fz;
  let vS = c.vx * sx + c.vz * sz;

  // Steering wheel: towards the wanted angle at the steering rate, home faster when let go.
  const want = Math.max(-1, Math.min(1, input.steer)) * steerLimit(vF);
  const homing = want === 0 || (c.steer !== 0 && Math.sign(want) !== Math.sign(c.steer));
  c.steer = approach(c.steer, want, (homing ? DRIVE.steerReturn : DRIVE.steerRate) * dt);
  // A lock that was fine at walking pace is clamped as the car speeds up.
  const lim = steerLimit(vF);
  c.steer = Math.max(-lim, Math.min(lim, c.steer));

  // Automatic gearbox: S at a standstill selects reverse, W at a standstill selects drive.
  if (c.gear === 1 && input.brake > 0 && vF < 0.4 && input.throttle === 0) c.gear = -1;
  else if (c.gear === -1 && input.throttle > 0 && vF > -0.4) c.gear = 1;

  let engine = 0;
  let resist = DRIVE.roll + DRIVE.drag * vF * vF;
  c.braking = false;
  if (c.gear === 1) {
    if (input.throttle > 0) engine = input.throttle * DRIVE.accel * Math.max(0, 1 - (Math.max(0, vF) / DRIVE.topSpeed) ** 2);
    if (input.brake > 0) {
      resist += input.brake * DRIVE.brake;
      c.braking = true;
    }
  } else {
    if (input.brake > 0) engine = -input.brake * DRIVE.reverseAccel * Math.max(0, 1 - Math.max(0, -vF) / DRIVE.reverseTop);
    if (input.throttle > 0) {
      resist += input.throttle * DRIVE.brake;
      c.braking = true;
    }
  }
  c.handbrake = input.handbrake;
  if (input.handbrake) resist += DRIVE.handbrakeDecel;
  c.throttle = c.gear === 1 ? input.throttle : input.brake;

  vF += engine * dt;
  // A ramp: gravity along the slope slows the climb and speeds the descent (only once rolling, so a stopped car holds still).
  if (c.grade !== 0 && Math.abs(vF) > 0.5) vF -= 9.81 * c.grade * dt;
  // Resistance only slows the car; it never pushes it backwards.
  const drop = resist * dt;
  if (Math.abs(vF) <= drop && engine === 0) vF = 0;
  else if (engine === 0 || Math.sign(engine) !== Math.sign(vF)) vF -= Math.sign(vF) * Math.min(Math.abs(vF), drop);
  else vF -= Math.sign(vF) * drop * 0.35;

  // Yaw: the wheels ask for a turn (bicycle model), the tyres can only give so much sideways grip.
  let wantW = (-vF * Math.tan(c.steer)) / CAR.wheelbase;
  const latMax = input.handbrake ? DRIVE.maxLateral * DRIVE.handbrakeLateral : DRIVE.maxLateral;
  if (Math.abs(vF * wantW) > latMax) wantW = (Math.sign(wantW) * latMax) / Math.max(0.1, Math.abs(vF));
  if (input.handbrake && Math.abs(vF) > 3) wantW *= DRIVE.handbrakeYaw;
  const follow = input.handbrake ? DRIVE.yawFollowHandbrake : DRIVE.yawFollow;
  c.w += (wantW - c.w) * (1 - Math.exp(-follow * dt));

  // Sideways sliding fades as the tyres bite.
  const grip = (input.handbrake ? DRIVE.gripHandbrake : DRIVE.grip) * dt;
  vS = approach(vS, 0, grip);
  c.slip = Math.abs(vS) + (input.handbrake && Math.abs(vF) > 2 ? 1.5 : 0) + (c.braking && Math.abs(vF) > 9 ? 1 : 0);

  c.vx = fx * vF + sx * vS;
  c.vz = fz * vF + sz * vS;
  c.x += c.vx * dt;
  c.z += c.vz * dt;
  c.h += c.w * dt;
  const speed = Math.hypot(c.vx, c.vz);
  c.distance += speed * dt;
  if (speed > c.topSpeed) c.topSpeed = speed;
  c.horn = input.horn;
};

// ---------------------------------------------------------------------------
// Crashes
// ---------------------------------------------------------------------------

const INV_M = 1 / CAR.mass;
const INV_I = 1 / CAR.inertia;

/**
 * Impulse between two bodies at a contact: the closing speed along the normal is reversed by
 * the restitution, friction acts along the surface, and the off-centre hit sets them spinning.
 * `b` may be null (a kerb, post or parked car: infinitely heavy).
 */
const resolve = (state: GameState, a: Car, b: Car | null, k: { nx: number; nz: number; depth: number; px: number; pz: number }, bay: number, what: string | null = null) => {
  const { nx, nz, px, pz } = k;
  const rax = px - a.x;
  const raz = pz - a.z;
  // Velocity of the contact point: v + ω × r, written for our heading convention.
  const vax = a.vx + a.w * raz;
  const vaz = a.vz - a.w * rax;
  let vbx = 0;
  let vbz = 0;
  let rbx = 0;
  let rbz = 0;
  if (b) {
    rbx = px - b.x;
    rbz = pz - b.z;
    vbx = b.vx + b.w * rbz;
    vbz = b.vz - b.w * rbx;
  }
  const rvx = vbx - vax;
  const rvz = vbz - vaz;
  const vn = rvx * nx + rvz * nz;

  // Push apart first (positional correction), split by mass.
  const share = b ? 0.5 : 1;
  a.x -= nx * k.depth * share;
  a.z -= nz * k.depth * share;
  if (b) {
    b.x += nx * k.depth * share;
    b.z += nz * k.depth * share;
  }
  if (vn >= 0) return;

  // Contact is out: a real touch puts the driver at fault out of the race (see `CONTACT`).
  if (-vn >= CONTACT.minSpeed && state.phase === 'race' && (b || what)) {
    // How hard each body's own motion drives into the other at the contact point (a body standing still drives into nothing).
    const drivesA = vax * nx + vaz * nz;
    const drivesB = b ? -(vbx * nx + vbz * nz) : 0;
    const out = (c: Car, other: Car | null) => {
      if (c.id >= state.cars.length || c.dq !== null || c.parkedAt !== null) return;
      c.dq = state.clock;
      c.dqWhy = other ? { kind: 'car', what: other.id < state.cars.length ? other.name : 'a parked car' } : { kind: 'obstacle', what: what! };
      state.events.push({ type: 'crash', car: c.id, other: other ? other.id : -1, what: c.dqWhy.what, speed: -vn, x: px, z: pz });
    };
    if (drivesA > CONTACT.faultSpeed) out(a, b);
    if (b && drivesB > CONTACT.faultSpeed) out(b, a);
  }

  const ka = raz * nx - rax * nz;
  const kb = rbz * nx - rbx * nz;
  const invB = b ? INV_M : 0;
  const invIB = b ? INV_I : 0;
  const denom = INV_M + invB + ka * ka * INV_I + kb * kb * invIB;
  const j = (-(1 + IMPACT.restitution) * vn) / denom;
  a.vx -= j * nx * INV_M;
  a.vz -= j * nz * INV_M;
  a.w -= j * ka * INV_I;
  if (b) {
    b.vx += j * nx * INV_M;
    b.vz += j * nz * INV_M;
    b.w += j * kb * INV_I;
  }

  // Friction along the surface, no more than μ times the normal impulse.
  const tx = -nz;
  const tz = nx;
  const vt = rvx * tx + rvz * tz;
  const kat = raz * tx - rax * tz;
  const kbt = rbz * tx - rbx * tz;
  const denomT = INV_M + invB + kat * kat * INV_I + kbt * kbt * invIB;
  const jt = Math.max(-IMPACT.friction * j, Math.min(IMPACT.friction * j, -vt / denomT));
  a.vx -= jt * tx * INV_M;
  a.vz -= jt * tz * INV_M;
  a.w -= jt * kat * INV_I;
  if (b) {
    b.vx += jt * tx * INV_M;
    b.vz += jt * tz * INV_M;
    b.w += jt * kbt * INV_I;
  }

  const speed = -vn;
  if (speed > IMPACT.bump && a.hitCooldown <= 0) {
    a.hitCooldown = 0.3;
    a.bumps++;
    if (b) {
      b.hitCooldown = 0.3;
      b.bumps++;
    }
    state.events.push({ type: 'bump', car: a.id, other: b ? b.id : -1, bay, speed, x: px, z: pz });
    if (bay >= 0 && speed > IMPACT.alarm) {
      if (!(state.alarms[bay] > state.t)) state.events.push({ type: 'alarm', bay });
      state.alarms[bay] = state.t + 9;
    }
  }
};

/** Every moving body: the racers and the car pulling out of its bay. */
export const bodies = (state: GameState): Car[] => (state.leaver && state.leaver.phase !== 'gone' ? [...state.cars, state.leaver.car] : state.cars);

const crashes = (state: GameState, world: World) => {
  const cars = bodies(state);
  for (let pass = 0; pass < 2; pass++) {
    for (const car of cars) {
      const near = world.grid.get(cellKey(Math.floor(car.x / CELL) + 100, Math.floor(car.z / CELL) + 100));
      if (!near) continue;
      for (const i of near) {
        // The entry barriers stop being solid once the arms are up; the exit one never stops the car leaving.
        if (world.owner[i] === OWNER_ENTRY && state.gate.open >= 0.55) continue;
        if (world.owner[i] === OWNER_EXIT && car.id >= 10) continue;
        const solid = world.solids[i];
        // Decks and ramps are stacked: a solid only matters at the heights it stands at.
        if (solid.y0 !== undefined && (car.y + 1.5 < solid.y0 || car.y > (solid.y1 ?? Infinity))) continue;
        const box = carBox(car);
        if (!nearShape(box, solid)) continue;
        const k = collide(box, solid);
        if (k) resolve(state, car, null, k, world.owner[i], world.hard[i]);
      }
    }
    for (let i = 0; i < cars.length; i++) {
      for (let j = i + 1; j < cars.length; j++) {
        if (!sameStorey(cars[i].y, cars[j].y)) continue;
        const a = carBox(cars[i]);
        const b = carBox(cars[j]);
        if (!nearShape(a, b)) continue;
        const k = collide(a, b);
        if (k) resolve(state, cars[i], cars[j], k, -1);
      }
    }
  }
};

/** Puts every moving body on the road surface under it (a ramp, a deck or the ground) and works out the slope it is climbing. */
const settle = (state: GameState, world: World) => {
  const surf = world.lot.surfaces;
  for (const car of bodies(state)) {
    car.y = surfaceAt(surf, car.x, car.z, car.y);
    const r = rampUnder(surf, car.x, car.z, car.y);
    car.grade = r ? (((r.hi - r.lo) * LEVEL_H) / (r.x1 - r.x0)) * r.rise * Math.sin(car.h) : 0;
  }
};

/** Speed bumps: a car going over one at speed is slowed a little and kicked (the body pitches). */
const bumpsRoad = (state: GameState, world: World) => {
  for (const car of bodies(state)) {
    car.jolt = Math.max(0, car.jolt - DT * 3);
    const speed = Math.hypot(car.vx, car.vz);
    if (speed < 2.5) continue;
    for (const b of world.lot.bumps) {
      const along = (car.x - b.x) * Math.sin(b.h) + (car.z - b.z) * Math.cos(b.h);
      const across = (car.x - b.x) * Math.cos(b.h) - (car.z - b.z) * Math.sin(b.h);
      if (Math.abs(along) < 0.6 && Math.abs(across) < b.len / 2 && car.jolt < 0.2) {
        car.jolt = Math.min(1, speed / 9);
        car.vx *= 0.96;
        car.vz *= 0.96;
      }
    }
  }
};

// ---------------------------------------------------------------------------
// Parking
// ---------------------------------------------------------------------------

export const bayBox = (world: World, id: number): Box => {
  const bay = world.lot.bays[id];
  return { kind: 'box', x: bay.x, z: bay.z, hw: bay.w / 2, hl: bay.d / 2, h: bay.h };
};

const wrap = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));

/** Nose in or reversed in, both count. */
export const aligned = (h: number, bayH: number) => {
  const d = Math.abs(wrap(h - bayH));
  return d < PARK.maxAngle || Math.PI - d < PARK.maxAngle;
};

/** The bays that are free right now: the target, and the one a car has pulled out of. */
export const freeBays = (state: GameState): number[] => (state.extra >= 0 ? [state.target, state.extra] : [state.target]);

const parking = (state: GameState, world: World) => {
  const free = freeBays(state);
  for (const car of state.cars) {
    const pts = corners(carBox(car));
    let best = -1;
    let share = 0;
    for (const id of free) {
      // A bay one floor up is not this car's bay, even though it is straight overhead.
      if (Math.abs(world.lot.bays[id].y - car.y) > 1) continue;
      const n = pts.filter((p) => insideBox(p, bayBox(world, id), PARK.slack)).length / 4;
      if (n > share) {
        share = n;
        best = id;
      }
    }
    car.inBay = share;
    car.bay = best;
    if (car.parkedAt !== null || car.dq !== null) continue;
    const bay = best >= 0 ? bayBox(world, best) : null;
    const still = Math.hypot(car.vx, car.vz) < PARK.maxSpeed && Math.abs(car.w) < 0.2;
    const ok = !!bay && state.phase === 'race' && car.inBay === 1 && aligned(car.h, bay.h);
    if (ok && still) car.park = Math.min(1, car.park + DT / PARK.hold);
    else if (ok) car.park = Math.max(0, car.park - DT * 0.5);
    else car.park = 0;
    if (car.park >= 1 && state.winner === null) {
      car.parkedAt = state.clock;
      state.winner = car.id;
      state.winBay = best;
      state.events.push({ type: 'parked', car: car.id, time: state.clock, bay: best });
      state.events.push({ type: 'end', winner: car.id });
      state.phase = 'done';
    }
  }
};

// ---------------------------------------------------------------------------
// The car that pulls out
// ---------------------------------------------------------------------------

/** Is another racer in the way of this car, `dir` (+1 ahead, -1 behind) along its nose, close enough to touch it before it could stop? */
export const racerInWay = (state: GameState, car: Car, dir: 1 | -1): boolean => {
  const fx = Math.sin(car.h) * dir;
  const fz = Math.cos(car.h) * dir;
  return state.cars.some((o) => {
    if (!sameStorey(o.y, car.y)) return false;
    const dx = o.x - car.x;
    const dz = o.z - car.z;
    const ahead = dx * fx + dz * fz;
    return ahead > 0 && ahead < CAR.length + 3.5 && Math.abs(dx * fz - dz * fx) < CAR.width + 0.8;
  });
};

const stepLeaver = (state: GameState, world: World): Input => {
  const idle: Input = { throttle: 0, brake: 0, steer: 0, handbrake: true, horn: false };
  const l = state.leaver;
  if (!l || l.phase === 'gone') return idle;
  const bay = world.lot.bays[l.bay];
  const car = l.car;
  l.t += DT;
  const out = (car.x - bay.x) * -bay.ax + (car.z - bay.z) * -bay.az;
  if (l.phase === 'wait') {
    // It only pulls out when nobody is in its way (it would be a contact).
    if (state.phase === 'race' && state.clock >= l.at && !racerInWay(state, car, l.forward ? 1 : -1)) {
      l.phase = l.forward ? 'out' : 'reverse';
      l.t = 0;
      if (l.forward) {
        l.route = routeToNode(world.lot.graph, car, world.lot.exitNode) ?? [];
        l.seg = 0;
      }
      state.events.push({ type: 'leave', bay: l.bay, lvl: bay.lvl, garage: bay.garage });
    }
    return idle;
  }
  if (l.phase === 'reverse') {
    // Someone behind: stop and wait (and the wait does not count against its time).
    if (racerInWay(state, car, -1)) {
      l.t -= DT;
      return { throttle: 0, brake: 0, steer: 0, handbrake: true, horn: Math.floor(l.t * 5) % 2 === 0 };
    }
    if (out > bay.d / 2 + CAR.length / 2 + 1.4 || l.t > 8) {
      l.phase = 'out';
      l.t = 0;
      l.route = routeToNode(world.lot.graph, car, world.lot.exitNode) ?? [];
      l.seg = 0;
    }
    return { throttle: 0, brake: 0.8, steer: 0, handbrake: false, horn: l.t < 1.2 && Math.floor(l.t * 5) % 2 === 0 };
  }
  // Out into the aisle and away along the aisle graph to the exit gate.
  if (state.extra < 0 && Math.hypot(car.x - bay.x, car.z - bay.z) > 6.5) {
    state.extra = l.bay;
    state.events.push({ type: 'vacated', bay: l.bay });
  }
  const end = l.route[l.route.length - 1];
  if (!end || Math.hypot(car.x - end.x, car.z - end.z) < 3.5 || l.t > 150) {
    l.phase = 'gone';
    if (state.extra < 0) {
      state.extra = l.bay;
      state.events.push({ type: 'vacated', bay: l.bay });
    }
    car.x = car.z = 9999;
    car.vx = car.vz = 0;
    return idle;
  }
  // Never into a shopper: wait until they are clear.
  if (pedLimit(state, car, forwardSpeed(car), Math.sin(car.h), Math.cos(car.h)) < 3) return { throttle: 0, brake: 0, steer: 0, handbrake: true, horn: false };
  if (racerInWay(state, car, 1)) return { throttle: 0, brake: 0, steer: 0, handbrake: true, horn: false };
  return followRoute(car, l.route, l, 4, steerLimit(forwardSpeed(car)));
};

// ---------------------------------------------------------------------------
// The step
// ---------------------------------------------------------------------------

/** Advances the round by one fixed step. `inputs[i]` drives car i. Events of this step land in `state.events`. */
export const step = (state: GameState, world: World, inputs: Input[]) => {
  state.events = [];
  const before = Math.ceil(RACE.countdown - state.t);
  state.t += DT;
  if (state.phase === 'countdown') {
    const now = Math.ceil(RACE.countdown - state.t);
    if (now !== before && now > 0) state.events.push({ type: 'count', n: now });
    if (state.t >= RACE.countdown) {
      state.phase = 'race';
      state.events.push({ type: 'go' });
    }
  } else if (state.phase === 'race') {
    state.clock += DT;
    if (state.clock >= RACE.maxTime) {
      state.phase = 'done';
      state.events.push({ type: 'end', winner: null });
    }
  }

  // The entry barriers lift from GO (about 0.9 s).
  if (state.phase !== 'countdown') state.gate.open = Math.min(1, state.gate.open + DT / 0.9);

  const leaverInput = stepLeaver(state, world);
  if (state.leaver && state.leaver.phase !== 'gone') {
    const lc = state.leaver.car;
    lc.hitCooldown = Math.max(0, lc.hitCooldown - DT);
    drive(lc, leaverInput);
  }

  for (const car of state.cars) {
    car.hitCooldown = Math.max(0, car.hitCooldown - DT);
    const input = inputs[car.id];
    if (car.dq !== null) {
      // Disqualified: pulled over where it is, hazards on, out of the race.
      drive(car, { throttle: 0, brake: 0, steer: 0, handbrake: true, horn: false });
      car.vx *= 0.94;
      car.vz *= 0.94;
      car.park = 0;
      continue;
    }
    // Before GO the cars hold on the brake (you can still rev); after the end, the losers coast.
    if (state.phase === 'countdown') {
      drive(car, { throttle: 0, brake: 0, steer: input?.steer ?? 0, handbrake: true, horn: input?.horn ?? false });
      car.throttle = input?.throttle ?? 0;
    } else if (car.parkedAt !== null) {
      drive(car, { throttle: 0, brake: 0, steer: 0, handbrake: true, horn: false });
      car.vx = car.vz = car.w = 0;
    } else {
      drive(car, input ?? { throttle: 0, brake: 0, steer: 0, handbrake: false, horn: false });
    }
  }
  crashes(state, world);
  settle(state, world);
  bumpsRoad(state, world);
  stepPeds(state, world);
  parking(state, world);
  // If everyone is out (disqualified), nobody can win: the round is over.
  if (state.phase === 'race' && state.cars.every((c) => c.dq !== null)) {
    state.phase = 'done';
    state.events.push({ type: 'end', winner: null });
  }
};

/** Straight-line distance from a car to the nearest free bay. */
export const distanceToTarget = (state: GameState, world: World, car: Car) => {
  let best = Infinity;
  for (const id of freeBays(state)) {
    const bay = world.lot.bays[id];
    best = Math.min(best, Math.hypot(bay.x - car.x, bay.z - car.z) + Math.abs(bay.y - car.y) * 4);
  }
  return best;
};

/** Final placings: the winner first, then everyone else by how close they got. Only for after the round. */
export const standings = (state: GameState, world: World) =>
  [...state.cars].sort((a, b) => {
    if ((a.dq !== null) !== (b.dq !== null)) return a.dq !== null ? 1 : -1;
    if (a.parkedAt !== null || b.parkedAt !== null) return (a.parkedAt ?? Infinity) - (b.parkedAt ?? Infinity);
    return distanceToTarget(state, world, a) - distanceToTarget(state, world, b);
  });
