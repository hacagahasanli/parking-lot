/**
 * Shoppers on foot. Each one walks a fixed loop (store door to a car and back, across an aisle and
 * back, along the fronts of the parked cars), lingers at the ends (opening a boot, loading bags),
 * and keeps an eye on the cars: one coming at them makes them stop, then step aside. A car that
 * is too fast for that and touches them is an incident.
 *
 * Deterministic: only the round's seed and the step decide anything, so a host and a guest
 * running the same inputs see the same shoppers in the same places.
 */
import { DT, PED } from './constants';
import { collide } from './collide';
import { approachOf, rng } from './lot';

import type { Box, Lot } from './lot';
import type { Car, GameEvent, GameState, Ped, Walk, World } from './types';

/** The lane a person walks in, in front of the bays: just inside the aisle's edge. */
const LANE = 3.2;

const wrap = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));

export const buildWalks = (lot: Lot, seed: number): { walks: Walk[]; trolley: boolean[] } => {
  const rand = rng(seed * 4241 + 7);
  const between = (a: number, b: number) => a + (b - a) * rand();
  const walks: Walk[] = [];
  const trolley: boolean[] = [];
  const fire = lot.aisles[lot.aisles.length - 1];
  const door = lot.store.z0 - 0.7;

  // Store trips: out of the door, across the fire lane, to a car on its far side.
  const nearStore = lot.bays.filter((b) => b.use === 'car' && b.aisle === lot.aisles.length - 1);
  for (let i = 0; i < 4; i++) {
    const bay = nearStore[Math.floor(rand() * nearStore.length)];
    const mouth = approachOf(bay, fire).enter;
    const mx = mouth.x - bay.ax * 3.2;
    const dx = between(-1.6, 1.6);
    walks.push({
      points: [
        { x: dx, z: door, dwell: 1 + rand() * 2 },
        { x: dx, z: fire.z - LANE, dwell: 0 },
        { x: mx, z: fire.z - LANE, dwell: 2.5 + rand() * 2.5 },
      ],
    });
    trolley.push(i % 2 === 0);
  }
  // Crossers: over an aisle to the car on the other side, and back.
  for (let i = 0; i < 7; i++) {
    const a = lot.aisles[1 + (i % 3)];
    const x = between(-28, 28);
    walks.push({
      points: [
        { x, z: a.z - LANE, dwell: 1.5 + rand() * 2 },
        { x: x + between(-5, 5), z: a.z + LANE, dwell: 1.5 + rand() * 2.5 },
      ],
    });
    trolley.push(rand() < 0.4);
  }
  // Walkers: along the fronts of the parked cars to the one that is theirs.
  for (let i = 0; i < 5; i++) {
    const a = lot.aisles[1 + (i % 3)];
    const side = rand() < 0.5 ? -1 : 1;
    const x = between(-26, 20);
    walks.push({
      points: [
        { x, z: a.z + side * LANE, dwell: 1.5 + rand() * 2 },
        { x: x + between(9, 15), z: a.z + side * LANE, dwell: 2 + rand() * 2.5 },
      ],
    });
    trolley.push(rand() < 0.5);
  }
  return { walks, trolley };
};

export const createPeds = (world: World, trolley: boolean[], seed: number): Ped[] => {
  const rand = rng(seed * 6007 + 3);
  return world.walks.map((w, i) => {
    // Somewhere along its loop, so the lot is already busy at the start.
    const a = Math.floor(rand() * w.points.length);
    const b = (a + 1) % w.points.length;
    const f = rand();
    const x = w.points[a].x + (w.points[b].x - w.points[a].x) * f;
    const z = w.points[a].z + (w.points[b].z - w.points[a].z) * f;
    return {
      id: i,
      x,
      z,
      h: Math.atan2(w.points[b].x - x, w.points[b].z - z),
      vx: 0,
      vz: 0,
      mode: 'walk',
      t: 0,
      walk: i,
      next: b,
      dir: 1,
      speed: PED.walk * (0.9 + rand() * 0.2),
      trolley: trolley[i] ?? false,
      look: { shirt: Math.floor(rand() * 10), pants: Math.floor(rand() * 5), skin: Math.floor(rand() * 5), hair: Math.floor(rand() * 6), height: 0.94 + rand() * 0.12 },
      phase: rand() * 6,
      immune: 0,
      threat: 99,
    };
  });
};

/** Every car that can run someone over: the racers and the one pulling out. */
const movers = (state: GameState): Car[] => (state.leaver && state.leaver.phase !== 'gone' ? [...state.cars, state.leaver.car] : state.cars);

const carFrame = (c: Car) => ({ fx: Math.sin(c.h), fz: Math.cos(c.h) });

/** Seconds until a car moving in a straight line gets near this spot (99 if it won't within the look-ahead). */
const timeToThreat = (c: Car, x: number, z: number) => {
  const speed = Math.hypot(c.vx, c.vz);
  if (speed < 0.5) return 99;
  const { fx, fz } = carFrame(c);
  for (let tau = 0; tau <= 1.6; tau += 0.1) {
    const dx = x - (c.x + c.vx * tau);
    const dz = z - (c.z + c.vz * tau);
    const along = dx * fx + dz * fz;
    const across = dx * fz - dz * fx;
    if (Math.abs(across) < 0.9 + 1.1 && Math.abs(along) < 2.3 + 0.9) return tau;
  }
  return 99;
};

const circle = (p: Ped) => ({ kind: 'circle' as const, x: p.x, z: p.z, r: PED.radius });

export const stepPeds = (state: GameState, world: World) => {
  const cars = movers(state);
  for (const p of state.peds) {
    p.immune = Math.max(0, p.immune - DT);
    p.t += DT;

    // Hit by a car?
    if (p.mode !== 'down' && p.immune <= 0) {
      for (const c of cars) {
        // The car pulling out is scenery that moves: it never takes anyone down (and waits for shoppers).
        if (c.id >= 10 || Math.hypot(c.x - p.x, c.z - p.z) > 4) continue;
        const box: Box = { kind: 'box', x: c.x, z: c.z, hw: 0.89, hl: 2.22, h: c.h };
        const k = collide(box, circle(p));
        if (!k) continue;
        const speed = Math.hypot(c.vx, c.vz);
        if (speed >= PED.hitSpeed && c.dq === null) {
          p.mode = 'down';
          p.t = 0;
          p.vx = c.vx * 0.3 + k.nx * 1.2;
          p.vz = c.vz * 0.3 + k.nz * 1.2;
          p.h = Math.atan2(-c.vx, -c.vz);
          // Out of the race: the car stops where it is.
          c.dq = state.clock;
          c.incidents++;
          state.events.push({ type: 'incident', car: c.id, ped: p.id, speed, x: p.x, z: p.z } satisfies GameEvent);
        }
        // Slower than that it is only a brush: nothing happens, and the person walks on.
        break;
      }
    }

    if (p.mode === 'down') {
      p.x += p.vx * DT;
      p.z += p.vz * DT;
      const damp = Math.exp(-3.5 * DT);
      p.vx *= damp;
      p.vz *= damp;
      if (p.t >= PED.down) {
        p.mode = 'wait';
        p.t = 0;
        p.immune = 3;
        p.vx = p.vz = 0;
      }
      continue;
    }

    // Eyes on the traffic.
    let threat = 99;
    let from: Car | null = null;
    for (const c of cars) {
      const tau = timeToThreat(c, p.x, p.z);
      if (tau < threat) {
        threat = tau;
        from = c;
      }
    }
    p.threat = threat;

    if (threat < 1.3) {
      if (p.mode === 'walk' || p.mode === 'dwell') {
        p.mode = 'wait';
        p.t = 0;
      }
      // Nobody walks into a moving car, but only someone who has noticed it steps out of its way:
      // a car close by, one in front of them, or one that honks.
      const d = Math.hypot(from!.x - p.x, from!.z - p.z);
      const noticed = d < 3 || from!.horn || Math.abs(wrap(Math.atan2(from!.x - p.x, from!.z - p.z) - p.h)) < 1.9;
      if (noticed) p.h += wrap(Math.atan2(from!.x - p.x, from!.z - p.z) - p.h) * Math.min(1, DT * 8);
      if (noticed && p.mode === 'wait' && p.t > 0.25 && (threat < 0.5 || d < 5)) {
        p.mode = 'dodge';
        p.t = 0;
      }
    } else if (p.mode === 'wait' && p.t > 0.4) {
      p.mode = p.t > 0.4 ? 'walk' : 'wait';
      p.t = 0;
    } else if (p.mode === 'dodge' && p.t > 0.35) {
      p.mode = 'wait';
      p.t = 0;
    }

    if (p.mode === 'dodge' && from) {
      // Out of the car's path, to the side we are already on.
      const { fx, fz } = carFrame(from);
      const across = (p.x - from.x) * fz - (p.z - from.z) * fx;
      const side = across === 0 ? (p.id % 2 ? 1 : -1) : Math.sign(across);
      p.vx = fz * side * PED.dodge;
      p.vz = -fx * side * PED.dodge;
      p.x += p.vx * DT;
      p.z += p.vz * DT;
      p.phase += PED.dodge * DT * 4.5;
      continue;
    }
    if (p.mode === 'wait') {
      p.vx = p.vz = 0;
      continue;
    }

    const w = world.walks[p.walk];
    const goal = w.points[p.next];
    if (p.mode === 'dwell') {
      p.vx = p.vz = 0;
      if (p.t >= goal.dwell) {
        // Done here: on to the next end of the loop.
        p.mode = 'walk';
        p.t = 0;
        if (p.next + p.dir < 0 || p.next + p.dir >= w.points.length) p.dir = p.dir === 1 ? -1 : 1;
        p.next += p.dir;
      }
      continue;
    }
    const dx = goal.x - p.x;
    const dz = goal.z - p.z;
    const d = Math.hypot(dx, dz);
    if (d < 0.12) {
      if (goal.dwell > 0) {
        p.mode = 'dwell';
      } else {
        if (p.next + p.dir < 0 || p.next + p.dir >= w.points.length) p.dir = p.dir === 1 ? -1 : 1;
        p.next += p.dir;
      }
      p.t = 0;
      continue;
    }
    p.h += wrap(Math.atan2(dx, dz) - p.h) * Math.min(1, DT * 7);
    p.vx = (dx / d) * p.speed;
    p.vz = (dz / d) * p.speed;
    p.x += p.vx * DT;
    p.z += p.vz * DT;
    p.phase += p.speed * DT * 4.5;
  }
};

/** The fastest this car may go so that it can stop short of anyone on foot in its way (Infinity when the road is clear). */
export const pedLimit = (state: GameState, car: Car, vF: number, fx: number, fz: number) => {
  let limit = Infinity;
  for (const p of state.peds) {
    const rx = p.x - car.x;
    const rz = p.z - car.z;
    const ahead = rx * fx + rz * fz;
    const lat = rx * fz - rz * fx;
    // Anyone alongside or just behind the car: do not pull away over them.
    if (Math.abs(ahead) < 3.4 && Math.abs(lat) < 1.9) {
      limit = 0;
      continue;
    }
    if (ahead < 0.5 || ahead > 16) continue;
    const t = ahead / Math.max(2, vF);
    const predicted = lat + (p.vx * fz - p.vz * fx) * t;
    if (Math.abs(lat) > 1.5 && Math.abs(predicted) > 1.4) continue;
    limit = Math.min(limit, Math.sqrt(2 * 3.2 * Math.max(0, ahead - 3.6)));
  }
  return limit;
};

