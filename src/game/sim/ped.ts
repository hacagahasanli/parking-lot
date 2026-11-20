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
import { levelY, sameStorey } from './levels';
import { bayShapes, carCollider, rng } from './lot';

import type { Lot } from './lot';
import type { Car, GameEvent, GameState, Ped, Walk, World } from './types';

/** The lane a person walks in, in front of the bays: just inside the aisle's edge. */
const LANE = 3.2;

const wrap = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));

/**
 * Where the shoppers walk, made from the layout: out of each shop door and across the fire lane to
 * a car, over the zebra crossings, across the aisles between the rows, and along the fronts of the
 * parked cars. Works for any layout that has shops, crossings and east-west aisles.
 */
export const buildWalks = (lot: Lot, seed: number): { walks: Walk[]; trolley: boolean[] } => {
  const rand = rng(seed * 4241 + 7);
  const between = (a: number, b: number) => a + (b - a) * rand();
  const pick = <T,>(list: T[]) => list[Math.floor(rand() * list.length)];
  const walks: Walk[] = [];
  const trolley: boolean[] = [];
  const nodeOf = (id: number) => lot.graph.nodes[id];
  // East-west aisles: their z and the stretches of x that have cars on them.
  const ew = lot.aisles
    .filter((a) => a.kind !== 'entry' && a.kind !== 'exit' && a.kind !== 'pocket' && nodeOf(a.nodes[0]).z === nodeOf(a.nodes[a.nodes.length - 1]).z)
    .map((a) => {
      const xs = a.nodes.map((n) => nodeOf(n).x);
      return { aisle: a, z: nodeOf(a.nodes[0]).z, x0: Math.min(...xs), x1: Math.max(...xs) };
    });
  const spans = (name: string): [number, number][] =>
    (({ M: [[-30, -12], [12, 48]], F: [[-26, -6], [12, 54]], WA: [[-48, -12]], WB: [[-48, -12]], WC: [[-48, -12]], EA: [[12, 52]], EB: [[12, 52]], EC: [[12, 52]] }) as Record<string, [number, number][]>)[name] ?? [];
  const aisleZ = (name: string) => ew.find((e) => e.aisle.name === name)!.z;

  // Store trips: out of the door, over the crossing, to a car in the row facing the fire lane.
  const fireZ = aisleZ('F');
  const nearStore = lot.bays.filter((b) => b.use === 'car' && b.aisle === lot.aisles.findIndex((a) => a.name === 'F') && b.az < 0);
  const trips = [...Array(3).fill(lot.shops[0]), ...Array(2).fill(lot.shops[1])];
  trips.forEach((shop, i) => {
    const near = nearStore.filter((b) => Math.abs(b.x - shop.doorX) < 22);
    const bay = pick(near.length ? near : nearStore);
    const dx = between(-1.4, 1.4) + shop.doorX;
    walks.push({
      points: [
        { x: dx, z: shop.z0 - 0.7, dwell: 1 + rand() * 2 },
        { x: dx, z: fireZ - LANE, dwell: 0 },
        { x: bay.x, z: fireZ - LANE, dwell: 2.5 + rand() * 2.5 },
      ],
    });
    trolley.push(i % 2 === 0);
  });
  // Zebra crossings: back and forth over each one. A landing that would be inside a parked car (bays reach the kerb) is pulled back towards the road.
  const parkedNear = lot.bays.map((b) => ({ b, shapes: bayShapes(b) }));
  const blocked = (x: number, z: number) =>
    parkedNear.some(({ b, shapes }) => Math.abs(b.x - x) < 6 && Math.abs(b.z - z) < 6 && shapes.some((shape) => collide({ kind: 'box', x, z, hw: 0.35, hl: 0.35, h: 0 }, shape)));
  lot.crossings.forEach((c, i) => {
    const dx = Math.sin(c.h);
    const dz = Math.cos(c.h);
    const off = between(-1.2, 1.2);
    const ox = Math.cos(c.h) * off;
    const oz = -Math.sin(c.h) * off;
    const end = (side: 1 | -1) => {
      let k = c.len / 2 + 0.9;
      while (k > 1 && blocked(c.x + ox + side * dx * k, c.z + oz + side * dz * k)) k -= 0.2;
      return { x: c.x + ox + side * dx * k, z: c.z + oz + side * dz * k, dwell: 1 + rand() * 2.5 };
    };
    walks.push({ points: [end(-1), end(1)] });
    trolley.push(i % 3 === 0);
  });
  // Crossers: over an aisle to the car on the other side, and back.
  const names = ['WA', 'WB', 'WC', 'EA', 'EB', 'EC', 'M'];
  for (let i = 0; i < 7; i++) {
    const name = names[i % names.length];
    const [lo, hi] = pick(spans(name));
    const z = aisleZ(name);
    const x = between(lo, hi);
    walks.push({
      points: [
        { x, z: z - LANE, dwell: 1.5 + rand() * 2 },
        { x: x + between(-4, 4), z: z + LANE, dwell: 1.5 + rand() * 2.5 },
      ],
    });
    trolley.push(rand() < 0.4);
  }
  // Walkers: along the fronts of the parked cars to the one that is theirs.
  for (let i = 0; i < 5; i++) {
    const name = names[(i * 2 + 1) % names.length];
    const [lo, hi] = pick(spans(name));
    const z = aisleZ(name);
    const side = rand() < 0.5 ? -1 : 1;
    const x = between(lo, Math.max(lo, hi - 12));
    walks.push({
      points: [
        { x, z: z + side * LANE, dwell: 1.5 + rand() * 2 },
        { x: Math.min(hi, x + between(8, 14)), z: z + side * LANE, dwell: 2 + rand() * 2.5 },
      ],
    });
    trolley.push(rand() < 0.5);
  }
  // The car park: on every deck one person crosses the aisle by the bays and one walks along a row.
  const [x0, x1] = lot.garage.rows;
  const [gz1, gz2] = lot.garage.aisleZ;
  for (const level of lot.garage.levels) {
    const y = levelY(level.lvl);
    const x = between(x0 + 4, x1 - 8);
    walks.push({ y, points: [{ x, z: gz2 - 3, dwell: 1.5 + rand() * 2 }, { x: x + between(-3, 3), z: gz2 + 3, dwell: 1.5 + rand() * 2.5 }] });
    trolley.push(false);
    const x2 = between(x0 + 2, x1 - 18);
    walks.push({ y, points: [{ x: x2, z: gz1 + 3, dwell: 1.5 + rand() * 2 }, { x: x2 + between(8, 14), z: gz1 + 3, dwell: 2 + rand() * 2.5 }] });
    trolley.push(rand() < 0.3);
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
      y: w.y ?? 0,
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
const timeToThreat = (c: Car, x: number, z: number, y: number) => {
  const speed = Math.hypot(c.vx, c.vz);
  // A car standing still is no threat, unless its driver is leaning on the horn (then the shoppers in front of it step aside).
  if ((speed < 0.5 && !c.horn) || !sameStorey(c.y, y)) return 99;
  const { fx, fz } = carFrame(c);
  for (let tau = 0; tau <= 1.6; tau += 0.1) {
    const dx = x - (c.x + c.vx * tau);
    const dz = z - (c.z + c.vz * tau);
    const along = dx * fx + dz * fz;
    const across = dx * fz - dz * fx;
    if (Math.abs(across) < 0.9 + 1.1 && Math.abs(along) < (speed < 0.5 ? 5.5 : 2.3 + 0.9)) return tau;
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
        if (c.id >= 10 || Math.hypot(c.x - p.x, c.z - p.z) > 4 || !sameStorey(c.y, p.y)) continue;
        const k = collide(carCollider(0, c.x, c.z, c.h), circle(p));
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
      const tau = timeToThreat(c, p.x, p.z, p.y);
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
    if (!sameStorey(car.y, p.y)) continue;
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

