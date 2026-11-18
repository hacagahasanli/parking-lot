import { DT, DRIVE } from './constants';
import { botInput, canSee, createBrain, SIGHT } from './bot';
import { CAR, PED } from './constants';
import { collide } from './collide';
import { buildLot, LAYOUT } from './lot';
import { routeToDock, shortestPath } from './nav';
import { radio } from './radio';
import { bayBox, carBox, createRound, createWorld, drive, forwardSpeed, step } from './step';

import type { Input } from './types';

const lot = buildLot();
const press = (p: Partial<Input>): Input => ({ throttle: 0, brake: 0, steer: 0, handbrake: false, horn: false, ...p });

describe('the lot', () => {
  it('is about twice the area of the old lot (88 x 72 m)', () => {
    const w = lot.bounds.x1 - lot.bounds.x0;
    const d = lot.bounds.z1 - lot.bounds.z0;
    expect((w * d) / (88 * 72)).toBeGreaterThan(1.9);
    expect((w * d) / (88 * 72)).toBeLessThan(2.3);
  });

  it('mixes angled, 90 degree and parallel bays, special bays, and has plenty of candidates', () => {
    expect(lot.bays.length).toBeGreaterThan(220);
    for (const type of ['angled', 'perp', 'parallel']) expect(lot.bays.some((b) => b.type === type)).toBe(true);
    for (const tag of ['ev', 'disabled', 'parent', 'canopy', 'pocket', 'kerb']) expect(lot.bays.some((b) => b.tags.includes(tag as never))).toBe(true);
    expect(lot.candidates.length).toBeGreaterThan(100);
    // Parallel bays and the pocket are for the player: bots cannot take them, so they are never the free bay.
    for (const id of lot.candidates) {
      expect(lot.bays[id].type).not.toBe('parallel');
      expect(lot.bays[id].tags).not.toContain('pocket');
    }
  });

  it('has a candidate in every zone a bot can reach', () => {
    const has = (f: (b: (typeof lot.bays)[number]) => boolean) => lot.candidates.some((id) => f(lot.bays[id]));
    expect(has((b) => b.type === 'angled')).toBe(true);
    expect(has((b) => b.type === 'perp' && b.tags.includes('canopy'))).toBe(true);
    expect(has((b) => b.tags.includes('ev'))).toBe(true);
    expect(has((b) => b.type === 'perp' && b.tags.length === 0)).toBe(true);
  });

  it('leaves every candidate bay free of kerbs, posts and neighbours, so a car fits', () => {
    for (const id of lot.candidates) {
      const world = createWorld(id, lot);
      const bay = lot.bays[id];
      const box = carBox({ x: bay.x, z: bay.z, h: bay.h });
      for (const s of world.solids) expect(collide(box, s), `bay ${id}`).toBeNull();
    }
  });

  it('keeps every candidate far from the start and reachable by an approach that is clear of cars', () => {
    for (const id of lot.candidates) {
      const bay = lot.bays[id];
      expect(Math.hypot(bay.x - lot.starts[0].x, bay.z - lot.starts[0].z)).toBeGreaterThan(35);
      expect(bay.approach.length).toBeGreaterThan(0);
      for (const ap of bay.approach) expect(ap.tail.slice(-3)).toHaveLength(3);
    }
  });

  it('starts the cars behind the closed gate, not touching anything or each other', () => {
    const { state, world } = createRound(lot, { seed: 1, bots: [false, true, true, true] });
    for (const car of state.cars) {
      expect(car.z + CAR.length / 2).toBeLessThan(lot.gateZ);
      for (const s of world.solids) expect(collide(carBox(car), s)).toBeNull();
    }
    for (let i = 0; i < 4; i++) for (let j = i + 1; j < 4; j++) expect(collide(carBox(state.cars[i]), carBox(state.cars[j]))).toBeNull();
  });

  it('keeps every lane of the aisle graph clear of solids and parked cars', () => {
    const world = createWorld(-1, lot);
    for (const e of lot.graph.edges) {
      if (e.avoid) continue;
      const h = Math.atan2(e.ux, e.uz);
      for (let t = lot.aisles[e.aisle].kind === 'entry' ? 4 : 0; t <= e.len; t += 1) {
        const box = carBox({ x: e.a.x + e.ux * t, z: e.a.z + e.uz * t, h });
        world.solids.forEach((s, i) => world.owner[i] >= -1 && expect(collide(box, s), `${lot.aisles[e.aisle].name} at ${t.toFixed(0)} m`).toBeNull());
      }
    }
  });
});

describe('the aisle graph', () => {
  it('has only edges that go with the flow of a one-way aisle', () => {
    for (const e of lot.graph.edges) if (lot.aisles[e.aisle].oneWay) expect(e.dir).toBe(1);
    const flow = (name: string) => lot.graph.edges.filter((e) => lot.aisles[e.aisle].name === name);
    for (const e of flow('WA')) expect(e.ux).toBeGreaterThan(0.99);
    for (const e of flow('WB')) expect(e.ux).toBeLessThan(-0.99);
    for (const e of flow('WC')) expect(e.ux).toBeGreaterThan(0.99);
    for (const e of flow('CW')) expect(e.uz).toBeGreaterThan(0.99);
  });

  it('routes between any two reachable nodes without ever driving against a one-way aisle', () => {
    const g = lot.graph;
    let routes = 0;
    for (const from of g.nodes) {
      for (const to of g.nodes) {
        const path = shortestPath(g, from.id, to.id);
        if (!path) continue;
        routes++;
        for (const id of path) expect(lot.aisles[g.edges[id].aisle].oneWay ? g.edges[id].dir : 1).toBe(1);
        // A chain: each edge starts where the last ended.
        path.forEach((id, i) => i > 0 && expect(g.edges[id].from).toBe(g.edges[path[i - 1]].to));
      }
    }
    expect(routes).toBeGreaterThan(200);
  });

  it('takes the long way round a one-way aisle', () => {
    const g = lot.graph;
    const from = g.nodes.find((n) => n.name === 'AV_A')!;
    const to = g.nodes.find((n) => n.name === 'CW_A')!;
    // WA only runs CW_A to AV_A, so going back means round by the main road or the fire lane.
    const direct = Math.hypot(from.x - to.x, from.z - to.z);
    const len = shortestPath(g, from.id, to.id)!.reduce((d, id) => d + g.edges[id].len, 0);
    expect(len).toBeGreaterThan(direct * 1.5);
  });

  it('gives every bay a route from the gate through the graph', () => {
    const { world } = createRound(lot, { seed: 3, bots: [true] });
    const car = world.lot.starts[0];
    for (const id of lot.candidates) {
      const bay = lot.bays[id];
      for (const ap of bay.approach) expect(routeToDock(world.lot.graph, car, ap.edge, ap.s), `bay ${id}`).not.toBeNull();
    }
  });
});

describe('the gate', () => {
  const open = () => {
    const r = createRound(lot, { seed: 1, bots: [false] });
    return r;
  };
  it('holds the cars: the arm is solid before GO', () => {
    const { state, world } = open();
    // Race on, but the arms still down: a car driven at the barrier stops against it.
    state.phase = 'race';
    const car = state.cars[0];
    for (let i = 0; i < 60 * 2; i++) {
      state.gate.open = 0;
      step(state, world, [press({ throttle: 1 })]);
    }
    expect(car.z + CAR.length / 2).toBeLessThan(lot.gateZ + 0.15);
  });

  it('lifts at GO and lets them through', () => {
    const { state, world } = open();
    for (let i = 0; i < 60 * 3.2 && state.phase === 'countdown'; i++) step(state, world, [press({ throttle: 1 })]);
    expect(state.phase).toBe('race');
    expect(state.gate.open).toBeLessThan(0.2);
    for (let i = 0; i < 60 * 4; i++) step(state, world, [press({ throttle: 1 })]);
    expect(state.gate.open).toBe(1);
    expect(state.cars[0].z).toBeGreaterThan(lot.gateZ + 3);
  });

  it('keeps the countdown honest: no moving before GO even with the pedal down', () => {
    const { state, world } = open();
    for (let i = 0; i < 60 * 2.5; i++) step(state, world, [press({ throttle: 1 })]);
    expect(state.phase).toBe('countdown');
    expect(state.cars[0].z).toBeLessThan(lot.starts[0].z + 0.3);
  });

  it('has bots wait for the arms instead of ramming them', () => {
    const { state, world } = createRound(lot, { seed: 4, bots: [true, true, true, true] });
    const brains = state.cars.map((c) => createBrain(world, c, 4));
    let armHit = 0;
    for (let i = 0; i < 60 * 12; i++) {
      step(state, world, state.cars.map((c) => botInput(state, world, c, brains[c.id])));
      // A bump with a fixed thing (not a car) close to the barrier line is a bot driving into the arm or its housing.
      for (const e of state.events) if (e.type === 'bump' && e.other === -1 && Math.abs(e.z - lot.gateZ) < 1.5 && Math.abs(e.x) < 6) armHit++;
    }
    expect(armHit).toBe(0);
    for (const c of state.cars) expect(c.z).toBeGreaterThan(lot.gateZ + 3);
  });
});

describe('driving', () => {
  const fresh = () => createRound(lot, { seed: 1, bots: [false] }).state.cars[0];

  it('reaches about 50 km/h in a few seconds and tops out near the limit', () => {
    const car = fresh();
    let t = 0;
    while (forwardSpeed(car) < 50 / 3.6 && t < 10) (drive(car, press({ throttle: 1 })), (t += DT));
    expect(t).toBeGreaterThan(2.5);
    expect(t).toBeLessThan(6);
    for (let i = 0; i < 60 * 20; i++) drive(car, press({ throttle: 1 }));
    expect(forwardSpeed(car)).toBeLessThanOrEqual(DRIVE.topSpeed);
  });

  it('turns the wheel gradually and lets it come back', () => {
    const car = fresh();
    drive(car, press({ steer: 1 }));
    expect(car.steer).toBeLessThan(0.05);
    for (let i = 0; i < 30; i++) drive(car, press({ steer: 1 }));
    expect(car.steer).toBeCloseTo(DRIVE.maxSteer, 1);
    for (let i = 0; i < 20; i++) drive(car, press({}));
    expect(car.steer).toBe(0);
  });

  it('turns right when steering right going forwards', () => {
    const car = fresh();
    for (let i = 0; i < 120; i++) drive(car, press({ throttle: 0.6, steer: 1 }));
    expect(car.h).toBeLessThan(-0.3);
  });

  it('brakes, then reverses on S from a standstill', () => {
    const car = fresh();
    for (let i = 0; i < 90; i++) drive(car, press({ throttle: 1 }));
    for (let i = 0; i < 60 * 3; i++) drive(car, press({ brake: 1 }));
    expect(car.gear).toBe(-1);
    expect(forwardSpeed(car)).toBeLessThan(-1);
    expect(forwardSpeed(car)).toBeGreaterThanOrEqual(-DRIVE.reverseTop);
  });
});

describe('a round', () => {
  it('counts down, then the first car to stop inside the bay wins', () => {
    const { state, world } = createRound(lot, { seed: 3, bots: [false] });
    while (state.phase === 'countdown') step(state, world, [press({})]);
    const bay = bayBox(world, state.target);
    Object.assign(state.cars[0], { x: bay.x, z: bay.z, h: bay.h + Math.PI, vx: 0, vz: 0 });
    for (let i = 0; i < 60 && state.phase === 'race'; i++) step(state, world, [press({})]);
    expect(state.winner).toBe(0);
    expect(state.phase).toBe('done');
  });

  it('does not count a car parked crooked', () => {
    const { state, world } = createRound(lot, { seed: 3, bots: [false] });
    while (state.phase === 'countdown') step(state, world, [press({})]);
    const bay = bayBox(world, state.target);
    Object.assign(state.cars[0], { x: bay.x, z: bay.z, h: bay.h + 0.5 });
    for (let i = 0; i < 120; i++) step(state, world, [press({ handbrake: true })]);
    expect(state.winner).toBeNull();
  });

  it.each(Array.from({ length: 24 }, (_, i) => i + 1))('bots search, find and park in the free bay (seed %i)', (seed) => {
    const { state, world } = createRound(lot, { seed, bots: [true, true, true, true] });
    const brains = state.cars.map((c) => createBrain(world, c, seed));
    for (let i = 0; i < 60 * 150 && state.phase !== 'done'; i++) {
      const inputs = state.cars.map((c) => botInput(state, world, c, brains[c.id]));
      step(state, world, inputs);
      radio(state, [...state.events, ...brains.flatMap((b) => b.outbox.splice(0))]);
    }
    expect(state.winner, `target ${state.target}`).not.toBeNull();
    expect(state.clock).toBeLessThan(150);
  }, 60000);

  it.each(Array.from({ length: 24 }, (_, i) => i + 1))('a bot never heads for the bay before it has spotted it (seed %i)', (seed) => {
    const { state, world } = createRound(lot, { seed, bots: [true, true, true, true] });
    const brains = state.cars.map((c) => createBrain(world, c, seed));
    // The points that only the bay's own approach uses: where the car turns in, the mouth, the stop.
    const approaches = (id: number) => lot.bays[id].approach.flatMap((ap) => ap.tail);
    const spots: number[] = [];
    for (let i = 0; i < 60 * 150 && state.phase !== 'done'; i++) {
      step(state, world, state.cars.map((c) => botInput(state, world, c, brains[c.id])));
      for (const b of brains) {
        for (const e of b.outbox.splice(0)) if (e.type === 'spot') spots.push(e.dist);
        if (!b.spotted) {
          expect(b.target).toBe(-1);
          for (const id of [state.target, state.extra].filter((x) => x >= 0)) {
            for (const pt of approaches(id)) expect(b.route.some((r) => r.x === pt.x && r.z === pt.z)).toBe(false);
          }
        }
      }
    }
    // Nobody saw it from further than their eyes reach, or from the start line.
    for (const d of spots) expect(d).toBeLessThanOrEqual(SIGHT.range + 0.01);
  }, 60000);
});

describe('seeing the bay', () => {
  /** A car where the bay's own path begins, heading along it. */
  const placeAt = (bayId: number) => {
    const [p, q] = lot.bays[bayId].approach[0].tail;
    return { x: p.x, z: p.z, h: Math.atan2(q.x - p.x, q.z - p.z) };
  };

  it('needs it close, in front of the car and in the same aisle', () => {
    const { state, world } = createRound(lot, { seed: 5, bots: [true] });
    const car = state.cars[0];
    // Some candidate is plainly visible from its own dock (a van beside it may hide others).
    const id = lot.candidates.find((c) => (Object.assign(car, placeAt(c)), canSee(world, car, c)));
    expect(id).toBeDefined();
    Object.assign(car, placeAt(id!));
    expect(canSee(world, car, id!)).toBe(true);
    // Facing away: no.
    car.h += Math.PI;
    expect(canSee(world, car, id!)).toBe(false);
    // Too far: no.
    Object.assign(car, { x: placeAt(id!).x - Math.sin(placeAt(id!).h) * 30, z: placeAt(id!).z - Math.cos(placeAt(id!).h) * 30, h: placeAt(id!).h });
    expect(canSee(world, car, id!)).toBe(false);
    // From the gate: no.
    Object.assign(car, lot.starts[0]);
    expect(canSee(world, car, id!)).toBe(false);
  });

  it('is blocked by a van, a hedge or the truck in the way', () => {
    const { state, world } = createRound(lot, { seed: 5, bots: [true] });
    const car = state.cars[0];
    const id = lot.candidates.find((c) => (Object.assign(car, placeAt(c)), canSee(world, car, c)))!;
    Object.assign(car, placeAt(id));
    const bay = lot.bays[id];
    const wall = { kind: 'box' as const, x: (car.x + bay.x) / 2, z: (car.z + bay.z) / 2, hw: 1, hl: 1, h: 0 };
    lot.occluders.push(wall);
    expect(canSee(world, car, id)).toBe(false);
    lot.occluders.pop();
    expect(canSee(world, car, id)).toBe(true);
  });

  it('picks the free bay from many places, never within sight of the start', () => {
    const picks = new Set<number>();
    for (let seed = 1; seed <= 60; seed++) picks.add(createRound(lot, { seed, bots: [true] }).state.target);
    expect(picks.size).toBeGreaterThan(30);
    for (const id of lot.candidates) expect(Math.hypot(lot.bays[id].x - lot.starts[0].x, lot.bays[id].z - lot.starts[0].z)).toBeGreaterThan(35);
  });
});

describe('shoppers', () => {
  const ready = (seed = 4) => {
    const r = createRound(lot, { seed, bots: [false] });
    r.state.phase = 'race';
    return r;
  };
  /** One person in the middle of an aisle, everyone else removed. */
  const lone = (seed = 4) => {
    const r = ready(seed);
    const p = r.state.peds[0];
    r.state.peds = [p];
    const a = { z: LAYOUT.ZA };
    Object.assign(p, { x: 0, z: a.z, h: Math.PI / 2, mode: 'dwell', t: 0 });
    r.world.walks[p.walk].points = [{ x: 0, z: a.z, dwell: 99 }, { x: 1, z: a.z, dwell: 99 }];
    p.next = 0;
    return { ...r, p, a };
  };

  it('walk at about walking pace', () => {
    const { state, world } = ready();
    const p = state.peds.find((q) => q.mode === 'walk')!;
    let walked = 0;
    let secs = 0;
    for (let i = 0; i < 60 * 6; i++) {
      const before = { x: p.x, z: p.z };
      step(state, world, [press({ handbrake: true })]);
      if (p.mode === 'walk') {
        walked += Math.hypot(p.x - before.x, p.z - before.z);
        secs += DT;
      }
    }
    expect(secs).toBeGreaterThan(1);
    expect(walked / secs).toBeGreaterThan(1.1);
    expect(walked / secs).toBeLessThan(1.5);
  });

  it('stand clear of a car coming at them they can see', () => {
    const { state, world, p, a } = lone();
    p.h = -Math.PI / 2;
    Object.assign(state.cars[0], { x: -30, z: a.z, h: Math.PI / 2, vx: 7, vz: 0 });
    let incidents = 0;
    for (let i = 0; i < 60 * 8; i++) {
      step(state, world, [press({ throttle: 0.4 })]);
      incidents += state.events.filter((e) => e.type === 'incident').length;
    }
    expect(incidents).toBe(0);
    expect(p.mode).not.toBe('down');
  });

  it('disqualify the driver who hits one: the car stops for good, the person gets up, the others race on', () => {
    const { state, world, p, a } = lone();
    state.cars = [state.cars[0], ...createRound(lot, { seed: 4, bots: [false, false] }).state.cars.slice(1)];
    // Standing with her back to the car (it comes from the west, she faces east), so she does not see it coming.
    p.h = Math.PI / 2;
    Object.assign(state.cars[0], { x: -30, z: a.z, h: Math.PI / 2, vx: 11, vz: 0 });
    let hit = -1;
    for (let i = 0; i < 60 * 5 && hit < 0; i++) {
      step(state, world, [press({ throttle: 0.4 }), press({ handbrake: true })]);
      if (state.events.some((e) => e.type === 'incident')) hit = i;
    }
    expect(hit).toBeGreaterThan(0);
    const car = state.cars[0];
    expect(car.incidents).toBe(1);
    expect(car.dq).not.toBeNull();
    expect(p.mode).toBe('down');
    // Out for good: the pedal does nothing, the car comes to rest, and it cannot win.
    for (let i = 0; i < 60 * 6; i++) step(state, world, [press({ throttle: 1 }), press({ handbrake: true })]);
    expect(Math.hypot(car.vx, car.vz)).toBeLessThan(0.1);
    expect(p.mode).not.toBe('down');
    const bay = bayBox(world, state.target);
    Object.assign(car, { x: bay.x, z: bay.z, h: bay.h, vx: 0, vz: 0 });
    for (let i = 0; i < 120; i++) step(state, world, [press({}), press({ handbrake: true })]);
    expect(state.winner).toBeNull();
    Object.assign(car, { x: 0, z: LAYOUT.ZM });
    // The race goes on for the rest; a car that parks still wins.
    expect(state.phase).toBe('race');
    Object.assign(state.cars[1], { x: bay.x, z: bay.z, h: bay.h, vx: 0, vz: 0, w: 0 });
    for (let i = 0; i < 90 && state.phase === 'race'; i++) step(state, world, [press({}), press({ handbrake: true })]);
    expect(state.winner).toBe(1);
  });

  it('never walk into a moving car themselves: the one who hits is always the driver', () => {
    // A person whose loop crosses the road, with a car coming that she cannot see (she faces away).
    const { state, world, p, a } = lone();
    p.mode = 'walk';
    p.h = Math.PI / 2;
    world.walks[p.walk].points = [{ x: 0, z: a.z - 3, dwell: 0 }, { x: 0, z: a.z + 3, dwell: 0 }];
    Object.assign(p, { x: 0, z: a.z - 3, next: 1, dir: 1 });
    Object.assign(state.cars[0], { x: -40, z: a.z, h: Math.PI / 2, vx: 9, vz: 0 });
    for (let i = 0; i < 60 * 6; i++) step(state, world, [press({ throttle: 0.2 })]);
    // She stopped to let it by, though she never saw it.
    expect(state.cars[0].dq).toBeNull();
    expect(p.mode).not.toBe('down');
    expect(state.cars[0].x).toBeGreaterThan(5);
  });

  it('a gentle touch at under 1 m/s does not disqualify', () => {
    const { state, world, p, a } = lone();
    Object.assign(state.cars[0], { x: -2, z: a.z, h: Math.PI / 2, vx: 0.8, vz: 0 });
    for (let i = 0; i < 60 * 4; i++) step(state, world, [press({ handbrake: true })]);
    expect(state.cars[0].incidents).toBe(0);
    expect(state.cars[0].dq).toBeNull();
  });

  it('are avoided by bots, which stop for a person in the road', () => {
    const { state, world, a } = lone();
    state.cars = [state.cars[0]];
    const car = state.cars[0];
    car.bot = true;
    state.peds[0].mode = 'down';
    state.peds[0].t = -999;
    Object.assign(car, { x: -12, z: a.z, h: Math.PI / 2 });
    const brain = createBrain(world, car, 2);
    brain.route = [{ x: -12, z: a.z }, { x: 30, z: a.z }];
    for (let i = 0; i < 60 * 10; i++) {
      state.peds[0].t = 0;
      step(state, world, [botInput(state, world, car, brain)]);
    }
    expect(car.dq).toBeNull();
    expect(car.x).toBeLessThan(0 - 2.5);
  });

  it('are the same in every browser: the same seed gives the same walkers and the same moves', () => {
    const run = () => {
      const { state, world } = ready(9);
      for (let i = 0; i < 600; i++) step(state, world, [press({ handbrake: true })]);
      return state.peds.map((p) => [p.x.toFixed(3), p.z.toFixed(3), p.mode].join());
    };
    expect(run()).toEqual(run());
  });
});

describe('shoppers across the new layout', () => {
  it('walk loops start and end on the pavement or tarmac, never inside a parked car or a kerb block', () => {
    const lotSolids = lot.solids.filter((sh) => sh.kind === 'box' && sh.hl < 20);
    for (const seed of [1, 2, 3, 4, 5, 6]) {
      const { world } = createRound(lot, { seed, bots: [true] });
      const parked = world.solids.filter((_, i) => world.owner[i] >= 0);
      expect(world.walks).toHaveLength(PED.count);
      for (const w of world.walks) {
        for (const pt of w.points) {
          const body = carBox({ x: pt.x, z: pt.z, h: 0 });
          body.hw = 0.3;
          body.hl = 0.3;
          for (const sh of parked) expect(collide(body, sh), `seed ${seed} at ${pt.x.toFixed(1)}, ${pt.z.toFixed(1)}`).toBeNull();
          for (const sh of lotSolids) if (sh.kind === 'box' && sh.hl < 6) expect(collide(body, sh), `seed ${seed} kerb at ${pt.x.toFixed(1)}, ${pt.z.toFixed(1)}`).toBeNull();
        }
      }
    }
  });

  it('cross at the zebra crossings: a loop for each crossing runs across its road', () => {
    const { world } = createRound(lot, { seed: 2, bots: [true] });
    for (const c of lot.crossings) {
      const hit = world.walks.some((w) => w.points.length === 2 && Math.abs(w.points[0].x - c.x) < 2.2 + c.len / 2 && Math.abs(w.points[0].z - c.z) < 2.2 + c.len / 2 && Math.hypot(w.points[1].x - w.points[0].x, w.points[1].z - w.points[0].z) > c.len);
      expect(hit, `crossing at ${c.x}, ${c.z}`).toBe(true);
    }
  });
});

describe('speed bumps', () => {
  it('slow a car going over them and kick the body', () => {
    const { state, world } = createRound(lot, { seed: 2, bots: [false] });
    const b = lot.bumps[0];
    const car = state.cars[0];
    // On the avenue, heading north over the bump at 10 m/s.
    Object.assign(car, { x: b.x + 2, z: b.z - 6, h: 0, vx: 0, vz: 10 });
    let jolted = 0;
    for (let i = 0; i < 60; i++) {
      state.phase = 'race';
      step(state, world, [press({ throttle: 1 })]);
      jolted = Math.max(jolted, car.jolt);
    }
    expect(jolted).toBeGreaterThan(0.5);
    expect(car.z).toBeGreaterThan(b.z);
  });
});

describe('the radio', () => {
  it('has bots say a line when something happens, and not too often', () => {
    const { state } = createRound(lot, { seed: 1, bots: [false, true, true, true] });
    state.t = 20;
    radio(state, [{ type: 'spot', car: 1, bay: 3, dist: 9 }]);
    expect(state.chat).toHaveLength(1);
    expect(state.chat[0].name).toBe('Staging');
    // Straight after: nothing (one voice at a time, a pause between lines).
    radio(state, [{ type: 'bump', car: 2, other: 3, bay: -1, speed: 6, x: 0, z: 0 }]);
    expect(state.chat).toHaveLength(1);
    // The same driver stays quiet for a while; someone else can speak.
    state.t = 23;
    radio(state, [{ type: 'bump', car: 1, other: 0, bay: -1, speed: 6, x: 0, z: 0 }]);
    expect(state.chat).toHaveLength(1);
    radio(state, [{ type: 'bump', car: 2, other: 0, bay: -1, speed: 6, x: 0, z: 0 }]);
    expect(state.chat).toHaveLength(2);
  });

  it('never has the player speak', () => {
    const { state } = createRound(lot, { seed: 1, bots: [false, true, true, true] });
    state.t = 20;
    radio(state, [{ type: 'incident', car: 0, ped: 0, speed: 5, x: 0, z: 0 }]);
    expect(state.chat.every((l) => l.who !== 0)).toBe(true);
  });
});

describe('the car that pulls out', () => {
  it('drives away along the aisle graph to the exit gate and is gone', () => {
    const { state, world } = createRound(lot, { seed: 2, bots: [false] });
    const l = state.leaver!;
    state.phase = 'race';
    state.clock = l.at;
    let steps = 0;
    for (let i = 0; i < 60 * 120 && l.phase !== 'gone'; i++, steps++) step(state, world, [press({ handbrake: true })]);
    expect(l.phase).toBe('gone');
    expect(steps / 60).toBeLessThan(110);
    // It went by road: the route it followed ended at the exit lane.
    const end = l.route[l.route.length - 1];
    expect(Math.hypot(end.x - lot.graph.nodes[lot.exitNode].x, end.z - lot.graph.nodes[lot.exitNode].z)).toBeLessThan(1);
  });

  it('leaves its bay, which is then free to win in', () => {
    const { state, world } = createRound(lot, { seed: 2, bots: [false] });
    const l = state.leaver!;
    state.phase = 'race';
    state.clock = l.at;
    for (let i = 0; i < 60 * 30 && state.extra < 0; i++) step(state, world, [press({ handbrake: true })]);
    expect(state.extra).toBe(l.bay);
    const bay = bayBox(world, l.bay);
    Object.assign(state.cars[0], { x: bay.x, z: bay.z, h: bay.h, vx: 0, vz: 0, w: 0 });
    for (let i = 0; i < 90 && state.phase === 'race'; i++) step(state, world, [press({ handbrake: true })]);
    expect(state.winner).toBe(0);
    expect(state.winBay).toBe(l.bay);
  });
});
