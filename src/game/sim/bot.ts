/**
 * Bot drivers. Each one plans a route through the aisles (with the one-way flow, so it reaches the
 * free bay at the bay's angle), follows it with *pure pursuit* (steer towards a point a few metres
 * ahead on the route, like a person looking down the road), slows for corners and the bay, and
 * backs out and tries again when it gets stuck.
 */
import { CAR } from './constants';
import { approachOf, BAY, END_AISLE } from './lot';
import { forwardSpeed, steerLimit } from './step';

import type { Vec } from './lot';
import type { Car, GameState, Input, World } from './types';

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
  /** Which target the route was planned for. */
  target: number;
  /** Small personal wobble so bots don't drive like rails. */
  wobble: number;
  /** Seconds left of getting clear of the bay to line up again (0 = not recovering). */
  recover: number;
}


export const planRoute = (world: World, car: Car, target: number): Vec[] => {
  const { lot } = world;
  const bay = lot.bays[target];
  const aisle = lot.aisles[bay.aisle];
  const { a0, a1, enter, end } = approachOf(bay, aisle);
  const tail = [a0, a1, enter, end];

  const apron = lot.aisles[0];
  // Each car keeps its own lane across the apron so four cars leaving the line don't all meet.
  const lane = apron.z + (car.id - 1.5) * 1.3;
  const route: Vec[] = [{ x: car.x, z: car.z + 3 }];
  // A bay on the apron that lies ahead in its flow: drive straight along the apron.
  if (bay.aisle === 0 && (a0.x - (car.x + bay.flow * 9)) * bay.flow > 2) {
    route.push({ x: car.x + bay.flow * 9, z: lane });
    return [...route, ...tail];
  }
  // Otherwise: along the apron to the end aisle the flow starts from, up it, then along the aisle.
  const col = bay.flow > 0 ? -END_AISLE : END_AISLE;
  route.push({ x: car.x + Math.sign(col) * 9, z: lane });
  route.push({ x: col, z: lane });
  route.push({ x: col, z: aisle.z });
  return [...route, ...tail];
};

export const createBrain = (world: World, car: Car, target: number, seed: number): BotBrain => ({
  route: planRoute(world, car, target),
  seg: 0,
  cruise: 8.2 + ((seed * 9301 + car.id * 49297) % 233280) / 233280 * 3,
  stuck: 0,
  reverse: 0,
  reverseSteer: 1,
  target,
  wobble: (car.id * 1.7) % 3,
  recover: 0,
});

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

export const botInput = (state: GameState, world: World, car: Car, brain: BotBrain): Input => {
  const idle: Input = { throttle: 0, brake: 0, steer: 0, handbrake: true, horn: false };
  if (state.phase !== 'race' || car.parkedAt !== null) return idle;
  const vF = forwardSpeed(car);
  const dt = 1 / 60;

  // Backing out of a jam: reverse with the wheel the other way, then try the route again.
  if (brain.reverse > 0) {
    brain.reverse -= dt;
    if (brain.reverse <= 0) brain.stuck = 0;
    return { throttle: 0, brake: 1, steer: brain.reverseSteer, handbrake: false, horn: brain.reverse > 0.9 };
  }

  const bay = world.lot.bays[brain.target];
  const fx = Math.sin(car.h);
  const fz = Math.cos(car.h);

  // Getting clear of the bay to try again: head for a point out in the aisle on the bay's centre
  // line, forwards or backwards, whichever way it lies (a person would do the same).
  if (brain.recover > 0) {
    brain.recover -= dt;
    const out = BAY.depth / 2 + 5.5;
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
    return ahead >= 0
      ? { throttle: vF < 2 ? 0.6 : 0, brake: 0, steer, handbrake: false, horn: false }
      : { throttle: 0, brake: vF > -2 ? 0.7 : 0, steer, handbrake: false, horn: false };
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
  const lineUp = brain.seg >= route.length - 3;
  let wheel: number;
  if (lineUp) {
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
  let want = brain.cruise * (1 - Math.min(1, bend / 1.3) * 0.72);
  want = Math.min(want, Math.max(lineUp ? 1.1 : 2.2, Math.sqrt(2 * 2.4 * Math.max(0, toGo - 0.2))));
  // How deep into the bay along its axis (0 at the centre).
  const depth = (car.x - bay.x) * bay.ax + (car.z - bay.z) * bay.az;
  if (lineUp && (car.inBay === 1 || depth > 0.1)) want = 0;
  // Someone is already in the bay: hold back in the aisle and lean on the horn instead of ramming.
  // (Ties go to the lower seat, so two half-in cars never wait for each other forever.)
  const taken = state.cars.some((o) => o !== car && o.inBay >= 0.75 && (o.inBay > car.inBay || (o.inBay === car.inBay && o.id < car.id)));
  // Wait upstream of the approach point, so the aisle in front of the bay stays clear.
  const a0 = route[route.length - 4];
  const close = brain.seg >= route.length - 5 && Math.hypot(a0.x - car.x, a0.z - car.z) < 7;
  if (taken && close && !lineUp) want = 0;

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
  if (want > 0 && Math.abs(vF) < 0.4) brain.stuck += dt;
  else brain.stuck = Math.max(0, brain.stuck - dt * 2);
  const side = (car.x - bay.x) * bay.az - (car.z - bay.z) * bay.ax;
  const crooked = lineUp && (Math.abs(wrap(bay.h - car.h)) > 0.45 || Math.abs(side) > 0.55) && depth > -2.2;
  const overshot = lineUp && !taken && want === 0 && Math.abs(vF) < 0.3 && car.inBay < 1;
  const inTheWay = taken && car.inBay > 0;
  if (lineUp && (brain.stuck > 1.1 || crooked || overshot || inTheWay)) {
    // Clear out into the aisle and line up again.
    brain.recover = 4;
    brain.stuck = 0;
  } else if (brain.stuck > 1.1) {
    // Jammed on the way: back off a little with the wheel the other way.
    brain.reverse = 1.2;
    brain.reverseSteer = -Math.sign(steer || 1);
    brain.stuck = 0;
  }
  return { throttle, brake, steer, handbrake, horn: taken && close && Math.sin(state.t * 2.3 + brain.wobble) > 0.6 };
};
