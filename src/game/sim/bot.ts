/**
 * Bot drivers. Each one plans a route through the aisles (with the one-way flow, so it reaches the
 * free bay at the bay's angle), follows it with *pure pursuit* (steer towards a point a few metres
 * ahead on the route, like a person looking down the road), slows for corners and the bay, and
 * backs out and tries again when it gets stuck.
 */
import { CAR } from './constants';
import { approachOf, BAY, END_AISLE } from './lot';
import { pedLimit } from './ped';
import { bodies, forwardSpeed, freeBays, steerLimit } from './step';

import type { Vec } from './lot';
import type { Car, GameEvent, GameState, Input, World } from './types';

export interface BotBrain {
  route: Vec[];
  /** Index of the route segment being followed. */
  seg: number;
  /** Cruising speed (m/s): how brave this driver is. */
  cruise: number;
  /** Seconds stuck while trying to move. */
  stuck: number;
  /** Seconds left of backing out. */
  reverse: number;
  reverseSteer: number;
  /** The free bay this driver is going for, or -1: a bot does not know where it is until it sees it. */
  target: number;
  /** True once the bay has been seen. Until then the bot only cruises the aisles. */
  spotted: boolean;
  /** Seconds the bay has been in view (a short reaction time before the bot commits). */
  seeing: number;
  /** The order this driver searches the aisles in. */
  order: number[];
  /** Small personal wobble so bots don't drive like rails. */
  wobble: number;
  /** Seconds left of getting clear of the bay to line up again (0 = not recovering). */
  recover: number;
  /** 0..1: how hard this driver shoves, tailgates and leans on the horn. */
  aggr: number;
  /** Seconds this driver keeps pushing for a contested bay before backing off. */
  patience: number;
  /** Seconds spent in the current fight for the bay. */
  fight: number;
  /** Seconds held up by a stopped car in front. */
  held: number;
  /** Horn state last step and when it last sounded (for honk events). */
  hornOn: boolean;
  lastHonk: number;
  /** Things that happened for the radio: spotted the bay, honked, backing out. The caller drains it. */
  outbox: GameEvent[];
}

/** The order each seat searches the aisles in: so the bots are not all in the same place. */
const ORDERS = [
  [1, 2, 3],
  [3, 2, 1],
  [2, 3, 1],
  [1, 3, 2],
];

/** How far a driver can make out an empty bay, and how wide its view is. */
export const SIGHT = { range: 14, cone: (75 * Math.PI) / 180, peek: 7, react: 0.35 } as const;

/** Cars on the apron keep right: eastbound in the south half, westbound in the north half, each in its own lane. */
const laneOf = (world: World, car: Car, dir: number) => world.lot.aisles[0].z - dir * (2.4 + (car.id % 2) * 1.3);

/**
 * Appends the way to the entry end of an aisle (the upstream end, so the cars go with the flow),
 * from wherever a car is: straight up the end column if it is already at that end, otherwise down
 * to the apron, across, and up.
 */
const legTo = (world: World, route: Vec[], col: number, car: Car, aisleIdx: number) => {
  const a = world.lot.aisles[aisleIdx];
  const entry = a.flow > 0 ? -END_AISLE : END_AISLE;
  if (col !== entry) {
    const lane = laneOf(world, car, Math.sign(entry - col));
    route.push({ x: col, z: lane });
    route.push({ x: entry, z: lane });
  }
  route.push({ x: entry, z: a.z });
};

/** The search: drive each aisle of the order end to end, over and over. */
const searchRoute = (world: World, car: Car, order: number[], cycles = 4): Vec[] => {
  const first = world.lot.aisles[order[0]];
  const entry = first.flow > 0 ? -END_AISLE : END_AISLE;
  const lane = laneOf(world, car, Math.sign(entry));
  const route: Vec[] = [{ x: car.x, z: car.z + 3 }, { x: car.x + Math.sign(entry) * 9, z: lane }];
  let col = Math.sign(entry) * 99;
  for (let c = 0; c < cycles; c++) {
    for (const idx of order) {
      const a = world.lot.aisles[idx];
      if (route.length === 2) route.push({ x: entry, z: lane }, { x: entry, z: a.z });
      else legTo(world, route, col, car, idx);
      col = a.flow * END_AISLE;
      route.push({ x: col, z: a.z });
    }
  }
  return route;
};

export const createBrain = (world: World, car: Car, seed: number): BotBrain => {
  const order = ORDERS[(car.id + seed) % ORDERS.length];
  const r = ((seed * 9301 + car.id * 49297) % 233280) / 233280;
  return {
    route: searchRoute(world, car, order),
    seg: 0,
    cruise: 8.2 + r * 3,
    stuck: 0,
    reverse: 0,
    reverseSteer: 1,
    target: -1,
    spotted: false,
    seeing: 0,
    order,
    wobble: (car.id * 1.7) % 3,
    recover: 0,
    aggr: ((seed * 31 + car.id * 17) % 10) / 10,
    patience: 2 + ((seed * 7 + car.id * 5) % 10) * 0.25,
    fight: 0,
    held: 0,
    hornOn: false,
    lastHonk: -9,
    outbox: [],
  };
};

/** The aisle a car is in (the nearest centre line), or -1 when it is out on the apron. */
const aisleOf = (world: World, car: Car) => {
  let best = -1;
  let d = Infinity;
  world.lot.aisles.forEach((a, i) => {
    const dz = Math.abs(car.z - a.z);
    if (i > 0 && dz < d) {
      d = dz;
      best = i;
    }
  });
  return d < 5 ? best : -1;
};

/** Can this driver make out that bay from here? Distance, view cone, and the same aisle (or a peek across). */
export const canSee = (world: World, car: Car, bayId: number) => {
  const bay = world.lot.bays[bayId];
  const dx = bay.x - car.x;
  const dz = bay.z - car.z;
  const d = Math.hypot(dx, dz);
  if (d > SIGHT.range) return false;
  const inView = d < 4 || Math.abs(wrap(Math.atan2(dx, dz) - car.h)) < SIGHT.cone;
  if (!inView) return false;
  const here = aisleOf(world, car);
  return bay.aisle === here || (Math.abs(bay.aisle - here) === 1 && d < SIGHT.peek);
};

/** From the aisle the bot is in, plan the way to the bay it has just seen. */
const spotRoute = (world: World, car: Car, bayId: number): Vec[] => {
  const { lot } = world;
  const bay = lot.bays[bayId];
  const aisle = lot.aisles[bay.aisle];
  const { a0, a1, enter, end } = approachOf(bay, aisle);
  const tail = [a0, a1, enter, end];
  const fx = Math.sin(car.h);
  const fz = Math.cos(car.h);
  const here = aisleOf(world, car);
  const route: Vec[] = [{ x: car.x + fx * 3, z: car.z + fz * 3 }];
  const upstream = (a0.x - car.x) * bay.flow > 2;
  if (here === bay.aisle && upstream && fx * bay.flow > 0.3) return [...route, ...tail];
  // Too late to turn in (or looking from across): finish the aisle, come round and take the bay properly.
  let col = Math.sign(car.x || 1) * END_AISLE;
  if (here > 0) {
    col = lot.aisles[here].flow * END_AISLE;
    route.push({ x: col, z: lot.aisles[here].z });
  }
  legTo(world, route, col, car, bay.aisle);
  return [...route, ...tail];
};

/** Closest point on segment ab to p, and how far along it (0..1). */
const onSegment = (p: Vec, a: Vec, b: Vec) => {
  const dx = b.x - a.x;
  const dz = b.z - a.z;
  const len2 = dx * dx + dz * dz || 1;
  const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.z - a.z) * dz) / len2));
  return { t, x: a.x + dx * t, z: a.z + dz * t };
};

/** The point `dist` metres further along the route from segment `seg` at fraction `t`. */
const along = (route: Vec[], seg: number, t: number, dist: number): Vec => {
  let i = seg;
  let a = route[i];
  let b = route[i + 1];
  let px = a.x + (b.x - a.x) * t;
  let pz = a.z + (b.z - a.z) * t;
  let left = dist;
  while (i < route.length - 1) {
    b = route[i + 1];
    const d = Math.hypot(b.x - px, b.z - pz);
    if (d >= left) return { x: px + ((b.x - px) * left) / d, z: pz + ((b.z - pz) * left) / d };
    left -= d;
    px = b.x;
    pz = b.z;
    i++;
    a = route[i];
  }
  return route[route.length - 1];
};

const remaining = (route: Vec[], seg: number, p: Vec) => {
  let d = Math.hypot(route[seg + 1].x - p.x, route[seg + 1].z - p.z);
  for (let i = seg + 1; i < route.length - 1; i++) d += Math.hypot(route[i + 1].x - route[i].x, route[i + 1].z - route[i].z);
  return d;
};

const wrap = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));

/** The nearest car in front, in this car's lane: how far (bumper to bumper) and how fast it is going the same way. */
export const carAhead = (state: GameState, car: Car, fx: number, fz: number) => {
  let best: { gap: number; speed: number; id: number } | null = null;
  for (const o of bodies(state)) {
    if (o === car || o.parkedAt !== null) continue;
    const dx = o.x - car.x;
    const dz = o.z - car.z;
    const ahead = dx * fx + dz * fz;
    const across = Math.abs(dx * fz - dz * fx);
    if (ahead < 1 || ahead > 16 || across > 1.9) continue;
    const gap = ahead - CAR.length;
    if (!best || gap < best.gap) best = { gap, speed: o.vx * fx + o.vz * fz, id: o.id };
  }
  return best;
};

export const botInput = (state: GameState, world: World, car: Car, brain: BotBrain): Input => {
  const idle: Input = { throttle: 0, brake: 0, steer: 0, handbrake: true, horn: false };
  if (state.phase !== 'race' || car.parkedAt !== null || car.dq !== null) return idle;
  const vF = forwardSpeed(car);
  const dt = 1 / 60;
  const fx = Math.sin(car.h);
  const fz = Math.cos(car.h);
  let honkAt = -1;
  const finish = (input: Input): Input => {
    if (input.horn && !brain.hornOn && state.t - brain.lastHonk > 3) {
      brain.lastHonk = state.t;
      brain.outbox.push({ type: 'honk', car: car.id, at: honkAt });
    }
    brain.hornOn = input.horn;
    return input;
  };

  // Looking for the bay: it is only "found" when it is close, ahead and in this aisle.
  if (!brain.spotted) {
    const seen = freeBays(state).find((id) => canSee(world, car, id));
    brain.seeing = seen !== undefined ? brain.seeing + dt : Math.max(0, brain.seeing - dt);
    if (seen !== undefined && brain.seeing > SIGHT.react) {
      const b = world.lot.bays[seen];
      brain.spotted = true;
      brain.target = seen;
      brain.route = spotRoute(world, car, seen);
      brain.seg = 0;
      brain.stuck = 0;
      brain.reverse = 0;
      brain.outbox.push({ type: 'spot', car: car.id, bay: seen, dist: Math.hypot(b.x - car.x, b.z - car.z) });
    }
  }
  const bay = brain.spotted ? world.lot.bays[brain.target] : null;

  // Backing out of a jam: reverse with the wheel the other way, then try the route again.
  if (brain.reverse > 0) {
    // Never back into someone.
    if (pedLimit(state, car, -vF, -fx, -fz) < 2) return finish({ throttle: 0, brake: 0, steer: 0, handbrake: true, horn: false });
    brain.reverse -= dt;
    if (brain.reverse <= 0) brain.stuck = 0;
    return finish({ throttle: 0, brake: 1, steer: brain.reverseSteer, handbrake: false, horn: brain.reverse > 0.9 });
  }

  // Getting clear of the bay to try again: head for a point out in the aisle on the bay's centre
  // line, forwards or backwards, whichever way it lies (a person would do the same).
  if (bay && brain.recover > 0) {
    brain.recover -= dt;
    // Each driver regroups at a different distance out, so they don't all go for the same spot.
    const out = BAY.depth / 2 + 4 + (car.id % 4) * 2.2;
    const px = bay.x - bay.ax * out;
    const pz = bay.z - bay.az * out;
    const dx = px - car.x;
    const dz = pz - car.z;
    const ahead = dx * fx + dz * fz;
    const left = dx * fz - dz * fx;
    const wheel = -Math.atan(((2 * left) / Math.max(1, dx * dx + dz * dz)) * CAR.wheelbase);
    const steer = Math.max(-1, Math.min(1, wheel / steerLimit(vF)));
    if (Math.hypot(dx, dz) < 1.6 || brain.recover <= 0) {
      brain.recover = 0;
      brain.seg = brain.route.length - 3;
      brain.stuck = 0;
    }
    if (ahead < 0 && pedLimit(state, car, -vF, -fx, -fz) < 2) return finish({ throttle: 0, brake: 0, steer: 0, handbrake: true, horn: false });
    return finish(
      ahead >= 0
        ? { throttle: vF < 2 ? 0.6 : 0, brake: 0, steer, handbrake: false, horn: false }
        : { throttle: 0, brake: vF > -2 ? 0.7 : 0, steer, handbrake: false, horn: false },
    );
  }

  const route = brain.route;
  while (brain.seg < route.length - 2) {
    const s = onSegment(car, route[brain.seg], route[brain.seg + 1]);
    if (s.t < 0.999) break;
    brain.seg++;
  }
  const s = onSegment(car, route[brain.seg], route[brain.seg + 1]);
  const toGo = remaining(route, brain.seg, car);
  const lim = steerLimit(vF);

  // The last stretch (from the approach point into the bay) follows the bay's centre line exactly.
  const lineUp = !!bay && brain.seg >= route.length - 3;
  let wheel: number;
  if (lineUp && bay) {
    // Stanley steering (the controller from autonomous-car research): fix the heading error, plus
    // steer back towards the line in proportion to how far the front axle is off it.
    const px = car.x + fx * CAR.frontAxle;
    const pz = car.z + fz * CAR.frontAxle;
    const offLeft = (px - bay.x) * bay.az - (pz - bay.z) * bay.ax;
    const headErr = wrap(bay.h - car.h);
    wheel = -headErr + Math.atan((1.6 * offLeft) / (Math.abs(vF) + 0.6));
  } else {
    // Pure pursuit: steer for a point a few metres ahead on the route.
    const look = 4 + Math.abs(vF) * 0.55;
    const goal = along(route, brain.seg, s.t, look);
    const dx = goal.x - car.x;
    const dz = goal.z - car.z;
    const ahead = dx * fx + dz * fz;
    const left = dx * fz - dz * fx;
    const curvature = (2 * left) / Math.max(1, dx * dx + dz * dz);
    wheel = -Math.atan(curvature * CAR.wheelbase);
    if (ahead < 0) wheel = left > 0 ? -lim : lim;
  }
  const steer = Math.max(-1, Math.min(1, wheel / lim + (lineUp ? 0 : Math.sin(state.t * 0.7 + brain.wobble) * 0.04)));

  // Speed: slow for the bend coming up and for the stop at the end.
  const far = along(route, brain.seg, s.t, 11);
  const bend = Math.abs(Math.atan2((far.x - car.x) * fz - (far.z - car.z) * fx, (far.x - car.x) * fx + (far.z - car.z) * fz));
  const cruise = brain.spotted ? brain.cruise : brain.cruise * 0.82;
  let want = cruise * (1 - Math.min(1, bend / 1.3) * 0.72);
  want = Math.min(want, Math.max(lineUp ? 1.1 : 2.2, Math.sqrt(2 * 2.4 * Math.max(0, toGo - 0.2))));
  // How deep into the bay along its axis (0 at the centre).
  const depth = bay ? (car.x - bay.x) * bay.ax + (car.z - bay.z) * bay.az : 0;
  if (lineUp && (car.inBay === 1 || depth > 0.1) && car.bay === brain.target) want = 0;

  // Contest: someone else is ahead of us in the bay. No waiting politely: lean on the horn and keep
  // pushing in for a short fight, and only if still beaten back off, regroup, and come again.
  // The rival is whoever is closer to the bay than we are and right in front of us, (a car in it counts first).
  const mine = bay ? Math.hypot(bay.x - car.x, bay.z - car.z) : 0;
  const rival = bay
    ? state.cars.find((o) => {
        if (o === car || o.dq !== null) return false;
        const theirs = Math.hypot(bay.x - o.x, bay.z - o.z);
        return theirs < mine - 0.3 && theirs < 9 && Math.hypot(o.x - car.x, o.z - car.z) < 6;
      })
    : undefined;
  let fighting = false;
  if (bay && lineUp && rival) {
    brain.fight += dt;
    fighting = true;
    honkAt = rival.id;
    want = Math.max(want, 1.6 + brain.aggr * 1.4);
    if (brain.fight > brain.patience) {
      brain.recover = 3.2;
      brain.fight = 0;
      brain.outbox.push({ type: 'recover', car: car.id });
    }
  } else brain.fight = Math.max(0, brain.fight - dt);

  // Other traffic: tailgate the car in front (the keen ones stay glued to its bumper), honk at it.
  const lead = lineUp ? null : carAhead(state, car, fx, fz);
  let tailHorn = false;
  if (lead && lead.gap < 14) {
    const keep = brain.aggr > 0.5 ? 1.6 : 4.2;
    // The keen ones never stop for a car in front: they nose up to it and lean on it.
    const floor = brain.aggr > 0.5 ? 1.2 : lead.gap > 1 ? 1.5 : 0;
    if (lead.gap < keep + 3) want = Math.min(want, Math.max(floor, lead.speed + (lead.gap - keep) * 0.7));
    if (lead.gap < 6.5 && lead.speed < want * 0.8 + 1) {
      tailHorn = true;
      honkAt = lead.id;
    }
  }

  // Held up by a car that is not going anywhere: after a moment, back off and find a way round.
  if (lead && lead.gap < 1.5 && lead.speed < 0.5 && Math.abs(vF) < 0.4) brain.held += dt;
  else brain.held = Math.max(0, brain.held - dt);
  if (brain.held > 1.6) {
    brain.held = 0;
    brain.reverse = 1.4;
    brain.reverseSteer = brain.aggr > 0.5 ? 1 : -1;
    brain.outbox.push({ type: 'recover', car: car.id });
  }

  // People on foot: never drive into them.
  const walkers = pedLimit(state, car, vF, fx, fz);
  const pedHold = walkers < want;
  if (pedHold) want = walkers < 2.2 ? 0 : walkers;

  let throttle = 0;
  let brake = 0;
  let handbrake = false;
  // Stopping: the foot brake while rolling, then the handbrake (S at a standstill would select reverse).
  if (want === 0) {
    if (vF > 0.4) brake = 1;
    else handbrake = true;
  } else if (vF < want - 0.3) throttle = Math.min(1, (want - vF) * 0.5 + 0.25);
  else if (vF > want + 0.8) brake = Math.min(1, (vF - want) * 0.25);
  if (vF < 0.3 && brake > 0 && want > 0) brake = 0;

  // Stuck: pressing on but not moving (nosed into a kerb, a parked car or another racer).
  if (want > 0 && Math.abs(vF) < 0.4 && !fighting) brain.stuck += dt;
  else brain.stuck = Math.max(0, brain.stuck - dt * 2);
  if (bay) {
    const side = (car.x - bay.x) * bay.az - (car.z - bay.z) * bay.ax;
    const crooked = lineUp && (Math.abs(wrap(bay.h - car.h)) > 0.45 || Math.abs(side) > 0.55) && depth > -2.2;
    const overshot = lineUp && !rival && !pedHold && want === 0 && Math.abs(vF) < 0.3 && car.inBay < 1;
    if (lineUp && !fighting && car.inBay < 0.99 && (brain.stuck > 1.1 || crooked || overshot)) {
      // Clear out into the aisle and line up again.
      brain.recover = 4;
      brain.stuck = 0;
      brain.outbox.push({ type: 'recover', car: car.id });
      return finish({ throttle, brake, steer, handbrake, horn: false });
    }
  }
  if (brain.stuck > 1.1 && !(bay && lineUp)) {
    // Jammed on the way: back off a little with the wheel the other way.
    brain.reverse = 1.2;
    brain.reverseSteer = -Math.sign(steer || 1);
    brain.stuck = 0;
    brain.outbox.push({ type: 'recover', car: car.id });
  }
  const leanOn = (fighting && Math.sin(state.t * 2.3 + brain.wobble) > 0.2) || tailHorn;
  return finish({ throttle, brake, steer, handbrake, horn: leanOn });
};
