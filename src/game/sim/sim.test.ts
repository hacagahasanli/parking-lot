import { DT, DRIVE } from './constants';
import { botInput, createBrain } from './bot';
import { collide } from './collide';
import { buildLot } from './lot';
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

  it.each(Array.from({ length: 24 }, (_, i) => i + 1))('bots find and park in the free bay (seed %i)', (seed) => {
    const { state, world } = createRound(lot, { seed, bots: [true, true, true, true] });
    const brains = state.cars.map((c) => createBrain(world, c, state.target, seed));
    for (let i = 0; i < 60 * 90 && state.phase !== 'done'; i++) {
      step(state, world, state.cars.map((c) => botInput(state, world, c, brains[c.id])));
    }
    expect(state.winner, `target ${state.target}`).not.toBeNull();
    expect(state.clock).toBeLessThan(75);
  });
});
