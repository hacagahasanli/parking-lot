import { DT, DRIVE } from './constants';
import { botInput, canSee, createBrain, SIGHT } from './bot';
import { collide } from './collide';
import { approachOf, buildLot } from './lot';
import { radio } from './radio';
import { bayBox, carBox, createRound, drive, forwardSpeed, step } from './step';

import type { Input } from './types';

const lot = buildLot();
const press = (p: Partial<Input>): Input => ({ throttle: 0, brake: 0, steer: 0, handbrake: false, horn: false, ...p });

describe('the lot', () => {
  it('has rows of bays and candidates for the free one', () => {
    expect(lot.bays.length).toBeGreaterThan(100);
    expect(lot.candidates.length).toBeGreaterThan(60);
  });

  it('leaves every candidate bay free of kerbs and posts, so a car fits', () => {
    for (const id of lot.candidates) {
      const bay = lot.bays[id];
      const box = carBox({ x: bay.x, z: bay.z, h: bay.h });
      for (const s of lot.solids) expect(collide(box, s), `bay ${id}`).toBeNull();
    }
  });

  it('starts the cars side by side, not touching', () => {
    const { state, world } = createRound(lot, { seed: 1, bots: [false, true, true, true] });
    for (const car of state.cars) for (const s of world.solids) expect(collide(carBox(car), s)).toBeNull();
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
  });

  it.each(Array.from({ length: 24 }, (_, i) => i + 1))('a bot never heads for the bay before it has spotted it (seed %i)', (seed) => {
    const { state, world } = createRound(lot, { seed, bots: [true, true, true, true] });
    const brains = state.cars.map((c) => createBrain(world, c, seed));
    const approaches = (id: number) => {
      const bay = lot.bays[id];
      const { a1, enter } = approachOf(bay, lot.aisles[bay.aisle]);
      return [a1, enter];
    };
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
  });
});

describe('seeing the bay', () => {
  it('needs it close, in front of the car and in the same aisle', () => {
    const { state, world } = createRound(lot, { seed: 5, bots: [true] });
    const bay = lot.bays[state.target];
    const aisle = lot.aisles[bay.aisle];
    const car = state.cars[0];
    // On the aisle, 9 m upstream, nose along the flow: sees it.
    Object.assign(car, { x: bay.x - bay.flow * 9, z: aisle.z, h: bay.flow > 0 ? Math.PI / 2 : -Math.PI / 2 });
    expect(canSee(world, car, state.target)).toBe(true);
    // Facing away: no.
    car.h += Math.PI;
    expect(canSee(world, car, state.target)).toBe(false);
    // Too far: no.
    Object.assign(car, { x: bay.x - bay.flow * 30, h: bay.flow > 0 ? Math.PI / 2 : -Math.PI / 2 });
    expect(canSee(world, car, state.target)).toBe(false);
    // The start line: no.
    Object.assign(car, lot.starts[0]);
    expect(canSee(world, car, state.target)).toBe(false);
  });

  it('picks the free bay from many places, never within sight of the start', () => {
    const picks = new Set<number>();
    for (let seed = 1; seed <= 60; seed++) picks.add(createRound(lot, { seed, bots: [true] }).state.target);
    expect(picks.size).toBeGreaterThan(30);
    for (const id of lot.candidates) expect(Math.hypot(lot.bays[id].x - lot.starts[0].x, lot.bays[id].z - lot.starts[0].z)).toBeGreaterThan(24);
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
    const a = lot.aisles[2];
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
    Object.assign(car, { x: 0, z: lot.aisles[0].z });
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
