/**
 * Bot drivers. Each one searches the lot by driving sweeps along the aisles of the aisle graph (a
 * different order for each, so they spread out), and when it spots the free bay it plans the way
 * there through the graph (with the one-way flow) and onto the bay's own approach path. It follows
 * routes with *pure pursuit* (steer towards a point a few metres ahead, like a person looking down
 * the road), lines up on the bay's axis with Stanley steering, slows for corners and the stop, and
 * backs out and tries again when it gets stuck.
 */
import { CAR } from './constants';
import { hintOf } from './hint';
import { levelY, sameStorey } from './levels';
import { locate, roundCorners, routeLength, routeToDock, routeToSweep, shortestPath } from './nav';
import { pedLimit } from './ped';
import { crosses, SIGHT } from './visibility';
import { bodies, forwardSpeed, freeBays, steerLimit } from './step';

import type { Lot, Vec } from './lot';
import type { Car, GameEvent, GameState, Input, World } from './types';

/** One pass along an aisle in one direction. */
export interface Sweep {
  aisle: number;
  dir: 1 | -1;
}

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
  /** The order this driver sweeps the aisles in (repeating), and which sweep it is on. */
  sweeps: Sweep[];
  sweep: number;
  /** Seconds after GO before this driver pulls away (the cars at the gate do not all go at once). */
  launch: number;
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
  /** Times in a row this driver has had to back out of the same jam, and where the last one was (a driver that keeps getting stuck re-plans from where it is). */
  jam: number;
  jamAt: Vec;
  /** Passes already driven (aisle and direction), so a re-plan after a hint does not go over them again. */
  visited: Set<string>;
  /** The last board hint this driver acted on (stage and decks), so it re-plans its search once per new hint. */
  hintKey: string;
  /** Things that happened for the radio: spotted the bay, honked, backing out. The caller drains it. */
  outbox: GameEvent[];
}


/** The lane edges of one pass along an aisle, in order of travel. */
export const sweepEdges = (lot: Lot, sw: Sweep): number[] => {
  const ids = lot.graph.edges.filter((e) => e.aisle === sw.aisle && e.dir === sw.dir).map((e) => e.id);
  return sw.dir > 0 ? ids : ids.reverse();
};

/** Aisles the bots search: every road and aisle except the entry, exit and the dead end. */
const searchable = (lot: Lot) => lot.aisles.filter((a) => (a.kind === 'road' || a.kind === 'aisle') && !a.avoid && !a.closed);

/**
 * The order one driver searches in: it starts at a different aisle depending on its seat, then
 * always goes next to whichever remaining pass is nearest (plus a personal bias), so the four
 * cars cover different parts of the lot at the same time.
 */
export const planSweeps = (lot: Lot, car: Car, seed: number, plan: { from?: number; wanted?: (sw: Sweep) => boolean; preferred?: (sw: Sweep) => boolean; skip?: Set<string> } = {}): Sweep[] => {
  const g = lot.graph;
  const aisles = searchable(lot);
  const first = ['EA', 'WA', 'AVE', 'EB'][(car.id + seed) % 4];
  const bias = (k: number) => (((seed * 7919 + car.id * 104729 + k * 15485863) >>> 0) % 1000) / 1000;
  // Pass one covers every aisle once (a two-way aisle in the direction the driver fancies); pass two drives the two-way ones back.
  const pass1: Sweep[] = [];
  const pass2: Sweep[] = [];
  aisles.forEach((a, i) => {
    // The road into the car park is only searched on the way in.
    if (a.name === 'GATE') pass1.push({ aisle: a.id, dir: 1 });
    else if (a.oneWay) pass1.push({ aisle: a.id, dir: 1 });
    else {
      const flip = bias(i) < 0.5;
      pass1.push({ aisle: a.id, dir: flip ? 1 : -1 });
      pass2.push({ aisle: a.id, dir: flip ? -1 : 1 });
    }
  });
  const out: Sweep[] = [];
  let at = plan.from ?? lot.entryNode;
  // After a hint: the passes that match it first (nearest first, from where the car is), then the rest.
  // (passes already driven go last, as a second look.)
  const fresh = (sw: Sweep) => !plan.skip?.has(`${sw.aisle}:${sw.dir}`);
  const groups = plan.wanted
    ? [pass1, pass2]
        .flatMap((p) => [
          p.filter((sw) => (plan.preferred ?? plan.wanted!)(sw) && fresh(sw)),
          p.filter((sw) => plan.wanted!(sw) && !(plan.preferred ?? plan.wanted!)(sw) && fresh(sw)),
          p.filter((sw) => !plan.wanted!(sw) && fresh(sw)),
        ])
        .concat([[...pass1, ...pass2].filter((sw) => !fresh(sw))])
    : [pass1, pass2];
  for (const todo of groups) {
    while (todo.length) {
      let best = -1;
      let bestCost = Infinity;
      todo.forEach((sw, i) => {
        const e0 = g.edges[sweepEdges(lot, sw)[0]];
        const path = shortestPath(g, at, e0.from);
        let cost = path ? path.reduce((d, id) => d + g.edges[id].len, 0) : 999;
        cost += bias(i + out.length * 31) * 40;
        // The first pass is the driver's own choice.
        if (out.length === 0 && !plan.from && lot.aisles[sw.aisle].name !== first) cost += 500;
        if (cost < bestCost) {
          bestCost = cost;
          best = i;
        }
      });
      const sw = todo.splice(best, 1)[0];
      out.push(sw);
      at = g.edges[sweepEdges(lot, sw).slice(-1)[0]].to;
    }
  }
  return out;
};

/** The way to the start of a driver's current sweep and along it. */
const sweepRoute = (world: World, car: Car, brain: Pick<BotBrain, 'sweeps' | 'sweep'>): Vec[] => {
  const lot = world.lot;
  for (let tries = 0; tries < brain.sweeps.length; tries++) {
    const sw = brain.sweeps[brain.sweep % brain.sweeps.length];
    const r = routeToSweep(lot.graph, car, sweepEdges(lot, sw));
    if (r) return r;
    brain.sweep++;
  }
  const fx = Math.sin(car.h);
  const fz = Math.cos(car.h);
  return [{ x: car.x, z: car.z }, { x: car.x + fx * 6, z: car.z + fz * 6 }];
};

export const createBrain = (world: World, car: Car, seed: number): BotBrain => {
  const r = ((seed * 9301 + car.id * 49297) % 233280) / 233280;
  const sweeps = planSweeps(world.lot, car, seed);
  const brain: BotBrain = {
    route: [],
    seg: 0,
    cruise: 8.2 + r * 3,
    stuck: 0,
    reverse: 0,
    reverseSteer: 1,
    target: -1,
    spotted: false,
    seeing: 0,
    sweeps,
    sweep: 0,
    launch: [0.15, 0.7, 1.9, 2.6][car.id % 4],
    wobble: (car.id * 1.7) % 3,
    recover: 0,
    aggr: ((seed * 31 + car.id * 17) % 10) / 10,
    patience: 2 + ((seed * 7 + car.id * 5) % 10) * 0.25,
    fight: 0,
    held: 0,
    hornOn: false,
    lastHonk: -9,
    hintKey: '0:',
    jam: 0,
    jamAt: { x: car.x, z: car.z },
    visited: new Set(),
    outbox: [],
  };
  brain.route = sweepRoute(world, car, brain);
  return brain;
};

const wrap = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));

/**
 * The bots read the same board as you. When it gives away the part of the site (and then the decks),
 * a bot that has not found the bay moves the passes in that part to the front of its own order
 * (keeping its personal order inside each group), so they do not all arrive in a convoy.
 */
const readBoard = (state: GameState, world: World, car: Car, brain: BotBrain) => {
  const h = hintOf(state, world.lot);
  const key = `${h.stage}:${h.decks.join(',')}`;
  if (key === brain.hintKey || h.stage === 0) return;
  brain.hintKey = key;
  const lot = world.lot;
  /** The decks a pass touches. For a ramp, where it takes you (a ramp down to a deck you do not want is no use). */
  const decksOf = (sw: Sweep) => {
    const a = lot.aisles[sw.aisle];
    const levels = a.nodes.map((n) => lot.graph.nodes[n].lvl);
    if (a.kind === 'ramp') return [sw.dir > 0 ? levels[levels.length - 1] : levels[0]];
    return [Math.min(...levels)];
  };
  const wanted = (sw: Sweep) => {
    const a = lot.aisles[sw.aisle];
    const inGarage = a.garage || a.name === 'GATE';
    if (h.zone === 'lot') return !inGarage;
    if (!inGarage) return false;
    if (!h.decks.length || a.name === 'GATE') return true;
    return decksOf(sw).some((d) => h.decks.includes(d));
  };
  // Each driver tries one of the two flickering decks first (not the same one for everybody).
  const first = h.decks.length ? h.decks[(car.id + state.seed) % h.decks.length] : null;
  const preferred = (sw: Sweep) => wanted(sw) && (first === null || lot.aisles[sw.aisle].name === 'GATE' || decksOf(sw).includes(first));
  // A hint for the open lot only moves the drivers who are headed for the car park; the others are already searching.
  if (h.zone === 'lot' && !brain.spotted && wanted(brain.sweeps[brain.sweep % brain.sweeps.length])) return;
  if (!brain.spotted) {
    const here = locate(lot.graph, car.x, car.z, car.h, true, car.y);
    brain.sweeps = planSweeps(lot, car, state.seed, { from: lot.graph.edges[here.edge].to, wanted, preferred, skip: brain.visited });
    brain.sweep = 0;
    brain.route = sweepRoute(world, car, brain);
    brain.seg = 0;
  }
};

/** The aisle a point is on (the nearest one whose width covers it), or -1. */
export const aisleAt = (lot: Lot, x: number, z: number, y?: number) => {
  let best = -1;
  let bestD = Infinity;
  for (const a of lot.aisles) {
    if (a.kind === 'entry' || a.kind === 'exit') continue;
    for (let i = 0; i < a.nodes.length - 1; i++) {
      const p = lot.graph.nodes[a.nodes[i]];
      const q = lot.graph.nodes[a.nodes[i + 1]];
      const dx = q.x - p.x;
      const dz = q.z - p.z;
      const t = Math.max(0, Math.min(1, ((x - p.x) * dx + (z - p.z) * dz) / (dx * dx + dz * dz)));
      const d = Math.hypot(x - (p.x + dx * t), z - (p.z + dz * t));
      // Decks and ramps are stacked: only the aisle at the car's own height counts.
      if (y !== undefined && Math.abs(levelY(p.lvl) + (levelY(q.lvl) - levelY(p.lvl)) * t - y) > 1.8) continue;
      if (d < a.width / 2 + 0.3 && d < bestD) {
        bestD = d;
        best = a.id;
      }
    }
  }
  return best;
};

/** Can this driver make out that bay from here? Distance, view cone, the same aisle (or a peek across), and nothing tall in the way. */
export const canSee = (world: World, car: Car, bayId: number) => {
  const bay = world.lot.bays[bayId];
  const dx = bay.x - car.x;
  const dz = bay.z - car.z;
  const d = Math.hypot(dx, dz);
  if (d > SIGHT.range) return false;
  // Only the bay on the car's own deck: one floor up is straight overhead, behind a slab.
  if (Math.abs(bay.y - car.y) > 1.2) return false;
  const inView = d < 4 || Math.abs(wrap(Math.atan2(dx, dz) - car.h)) < SIGHT.cone;
  if (!inView) return false;
  const here = aisleAt(world.lot, car.x, car.z, car.y);
  if (!(bay.aisle === here || d < SIGHT.peek)) return false;
  // A van, the truck or a hedge between the car and the bay hides it.
  for (const o of world.lot.occluders) if (o.kind === 'box' && (o.y0 === undefined || (o.y0 < car.y + 1.5 && (o.y1 ?? Infinity) > car.y)) && crosses(car.x, car.z, bay.x, bay.z, o)) return false;
  return true;
};

/** From where the car is, plan the way to the bay it has just seen: the quickest of the bay's approaches. */
const spotRoute = (world: World, car: Car, bayId: number): Vec[] | null => {
  const bay = world.lot.bays[bayId];
  let best: Vec[] | null = null;
  let bestLen = Infinity;
  for (const ap of bay.approach) {
    const r = routeToDock(world.lot.graph, car, ap.edge, ap.s);
    if (!r) continue;
    const len = routeLength(r);
    if (len < bestLen) {
      bestLen = len;
      best = [...r, ...ap.tail];
    }
  }
  return best;
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

/** The fastest the car should take the bends in the next stretch of route: v = sqrt(lateral grip / curvature). */
const curveSpeed = (route: Vec[], seg: number, t: number, vF: number) => {
  const reach = 6 + Math.abs(vF) * 1.4;
  let prev = along(route, seg, t, 0.5);
  let heading = Math.atan2(prev.x - along(route, seg, t, 0).x, prev.z - along(route, seg, t, 0).z);
  let worst = 0;
  for (let d = 2; d <= reach; d += 2) {
    const p = along(route, seg, t, d);
    const h = Math.atan2(p.x - prev.x, p.z - prev.z);
    if (Math.hypot(p.x - prev.x, p.z - prev.z) > 0.2) {
      worst = Math.max(worst, Math.abs(wrap(h - heading)) / 2);
      heading = h;
      prev = p;
    }
  }
  // worst is radians per metre of route (steps of 2 m).
  return worst < 0.02 ? 99 : Math.max(2.4, Math.sqrt(3.4 / worst));
};

const remaining = (route: Vec[], seg: number, p: Vec) => {
  let d = Math.hypot(route[seg + 1].x - p.x, route[seg + 1].z - p.z);
  for (let i = seg + 1; i < route.length - 1; i++) d += Math.hypot(route[i + 1].x - route[i].x, route[i + 1].z - route[i].z);
  return d;
};


/** The nearest car in front, in this car's lane: how far (bumper to bumper) and how fast it is going the same way. */
export const carAhead = (state: GameState, car: Car, fx: number, fz: number) => {
  let best: { gap: number; speed: number; id: number } | null = null;
  for (const o of bodies(state)) {
    if (o === car || o.parkedAt !== null || !sameStorey(o.y, car.y)) continue;
    const dx = o.x - car.x;
    const dz = o.z - car.z;
    const ahead = dx * fx + dz * fz;
    const across = Math.abs(dx * fz - dz * fx);
    if (ahead < 1 || ahead > 16) continue;
    // The lane in front, widening a little with distance so a car merging in from the side counts;
    // but not one coming the other way (two-way aisles are full of them).
    const reach = 1.9 + Math.min(1.6, ahead * 0.16);
    if (across > reach) continue;
    if (Math.sin(o.h) * fx + Math.cos(o.h) * fz < -0.2) continue;
    const gap = ahead - CAR.length;
    if (!best || gap < best.gap) best = { gap, speed: o.vx * fx + o.vz * fz, id: o.id };
  }
  return best;
};

export const botInput = (state: GameState, world: World, car: Car, brain: BotBrain): Input => {
  const idle: Input = { throttle: 0, brake: 0, steer: 0, handbrake: true, horn: false };
  if (state.phase !== 'race' || car.parkedAt !== null || car.dq !== null) return idle;
  if (state.clock < brain.launch) return idle;
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
    readBoard(state, world, car, brain);
    const seen = freeBays(state).find((id) => canSee(world, car, id));
    brain.seeing = seen !== undefined ? brain.seeing + dt : Math.max(0, brain.seeing - dt);
    const route = seen !== undefined && brain.seeing > SIGHT.react ? spotRoute(world, car, seen) : null;
    if (seen !== undefined && route) {
      const b = world.lot.bays[seen];
      brain.spotted = true;
      brain.target = seen;
      brain.route = route;
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
    // (and not near anyone at all: a swinging nose catches a shopper who steps in beside the car)
    const near = state.peds.some((p) => sameStorey(car.y, p.y) && Math.hypot(p.x - car.x, p.z - car.z) < 3.6);
    if (near || pedLimit(state, car, -vF, -fx, -fz) < 2) return finish({ throttle: 0, brake: 0, steer: 0, handbrake: true, horn: false });
    brain.reverse -= dt;
    if (brain.reverse <= 0) brain.stuck = 0;
    return finish({ throttle: 0, brake: 1, steer: brain.reverseSteer, handbrake: false, horn: brain.reverse > 0.9 });
  }

  // Getting clear of the bay to try again: head for a point out in the aisle on the bay's centre
  // line, forwards or backwards, whichever way it lies (a person would do the same).
  if (bay && brain.recover > 0) {
    brain.recover -= dt;
    // Each driver regroups at a different distance out, so they don't all go for the same spot.
    const out = bay.d / 2 + 4 + (car.id % 4) * 2.2;
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

  // Still searching and at the end of the sweep: on to the next aisle in this driver's order.
  if (!brain.spotted && brain.seg >= brain.route.length - 2 && remaining(brain.route, brain.seg, car) < 6) {
    const done = brain.sweeps[brain.sweep % brain.sweeps.length];
    brain.visited.add(`${done.aisle}:${done.dir}`);
    brain.sweep++;
    brain.route = sweepRoute(world, car, brain);
    brain.seg = 0;
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

  // Speed: slow for the sharpest bend coming up (the tyres can only give so much sideways grip) and for the stop at the end.
  const cruise = brain.spotted ? brain.cruise : brain.cruise * 0.82;
  let want = Math.min(cruise, curveSpeed(route, brain.seg, s.t, vF));
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
        if (o === car || o.dq !== null || !sameStorey(o.y, car.y)) return false;
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

  // Crossing traffic: give way to a moving car that is on the right and will reach the same spot (priority to the right).
  if (!lineUp && !fighting) {
    for (const o of bodies(state)) {
      if (o === car || o.parkedAt !== null || o.dq !== null || !sameStorey(o.y, car.y)) continue;
      const ov = Math.hypot(o.vx, o.vz);
      if (ov < 1.5) continue;
      const px = o.x - car.x;
      const pz = o.z - car.z;
      if (px * px + pz * pz > 22 * 22) continue;
      const left = px * fz - pz * fx;
      if (left > -0.4) continue;
      const rvx = o.vx - fx * Math.max(vF, 0);
      const rvz = o.vz - fz * Math.max(vF, 0);
      const rv2 = rvx * rvx + rvz * rvz;
      if (rv2 < 0.5) continue;
      const tc = Math.max(0, Math.min(2.6, -(px * rvx + pz * rvz) / rv2));
      if (Math.hypot(px + rvx * tc, pz + rvz * tc) > 3.4) continue;
      // Not one coming straight at us, or going the same way (that is the lead car's business).
      const along = (o.vx * fx + o.vz * fz) / ov;
      if (Math.abs(along) > 0.8) continue;
      want = Math.min(want, tc < 1.1 ? 0 : 1.2);
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

  // A closed entry barrier ahead: stop short of it (the arm is solid until it has lifted).
  if (state.gate.open < 0.8 && Math.abs(car.x) < 6.5 && car.z < world.lot.gateZ + 1) {
    const room = world.lot.gateZ - 0.5 - (car.z + CAR.length / 2);
    want = Math.min(want, Math.sqrt(2 * 3 * Math.max(0, room)));
    if (room < 0.4) want = 0;
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
    // Stuck again in the same place: back out further and plan the way afresh from here (a corner taken too wide in the car park).
    brain.jam = Math.hypot(car.x - brain.jamAt.x, car.z - brain.jamAt.z) < 6 ? brain.jam + 1 : 1;
    brain.jamAt = { x: car.x, z: car.z };
    if (brain.jam >= 2) {
      brain.reverse = 1.6 + Math.min(1.4, brain.jam * 0.3);
      if (brain.jam % 2 === 0) brain.reverseSteer = -brain.reverseSteer;
      const fresh = brain.spotted ? spotRoute(world, car, brain.target) : sweepRoute(world, car, brain);
      if (fresh) {
        brain.route = fresh;
        brain.seg = 0;
      }
    }
  }
  const leanOn = (fighting && Math.sin(state.t * 2.3 + brain.wobble) > 0.2) || tailHorn;
  return finish({ throttle, brake, steer, handbrake, horn: leanOn });
};
