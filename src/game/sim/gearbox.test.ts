import { describe, expect, it } from 'vitest';

import { DRIVE, DT } from './constants';
import { MANUAL, band, gearName, shift, torque } from './gearbox';
import { buildLot } from './lot';
import { createRound, drive, forwardSpeed, step } from './step';

import type { Car, Input } from './types';

const lot = buildLot();
const press = (p: Partial<Input>): Input => ({ throttle: 0, brake: 0, steer: 0, handbrake: false, horn: false, ...p });
const manualCar = (): Car => createRound(lot, { seed: 1, bots: [false], manual: true }).state.cars[0];
const autoCar = (): Car => createRound(lot, { seed: 1, bots: [false] }).state.cars[0];
/** Hold the gas for `s` seconds (in the gear the car is in). */
const hold = (c: Car, s: number, p: Partial<Input> = { throttle: 1 }) => {
  for (let i = 0; i < Math.round(s / DT); i++) drive(c, press(p));
};

describe('manual gearbox: the gate', () => {
  it('starts in 1st, shifts up to 4th and no further', () => {
    const c = manualCar();
    expect(c.box).toBe('manual');
    expect(c.mgear).toBe(1);
    expect(shift(c, 1, 0)).toBe('up');
    expect(shift(c, 1, 0)).toBe('up');
    expect(shift(c, 1, 0)).toBe('up');
    expect(c.mgear).toBe(4);
    expect(shift(c, 1, 0)).toBe('denied');
    expect(c.mgear).toBe(4);
  });

  it('shifts down through N to R only when (nearly) stopped, and no lower than R', () => {
    const c = manualCar();
    expect(shift(c, -1, 0)).toBe('down');
    expect(c.mgear).toBe(0);
    expect(gearName(c.mgear)).toBe('N');
    expect(shift(c, -1, 0)).toBe('down');
    expect(gearName(c.mgear)).toBe('R');
    expect(shift(c, -1, 0)).toBe('denied');
    expect(c.mgear).toBe(-1);
  });

  it('refuses R while rolling, forwards or backwards', () => {
    const c = manualCar();
    c.mgear = 0;
    expect(shift(c, -1, 3)).toBe('denied');
    expect(shift(c, -1, -2)).toBe('denied');
    expect(c.mgear).toBe(0);
  });

  it('takes one shift per input step through drive, and reports it', () => {
    const c = manualCar();
    drive(c, press({ shift: 1 }));
    expect(c.mgear).toBe(2);
    expect(c.shifted).toBe('up');
    drive(c, press({}));
    expect(c.shifted).toBeNull();
    expect(c.mgear).toBe(2);
  });

  it('shifts during the countdown too (pick your gear on the line)', () => {
    const { state, world } = createRound(lot, { seed: 3, bots: [false, true, true, true], manual: true });
    expect(state.phase).toBe('countdown');
    step(state, world, [press({ shift: -1 }), press({}), press({}), press({})]);
    expect(state.cars[0].mgear).toBe(0);
    expect(state.cars[1].box).toBe('auto');
  });
});

describe('manual gearbox: driving', () => {
  it('pulls from a standstill in 1st and hits the rev limiter at the top of the band', () => {
    const c = manualCar();
    hold(c, 6);
    expect(forwardSpeed(c)).toBeGreaterThan(MANUAL.limit[1] * 0.9);
    expect(forwardSpeed(c)).toBeLessThanOrEqual(MANUAL.limit[1] + 0.05);
    expect(c.limiter).toBe(true);
    expect(c.rpm).toBeGreaterThan(MANUAL.redline * 0.95);
  });

  it('a too-high gear pulls weakly from low speed (4th from rest is much slower than 1st)', () => {
    const first = manualCar();
    const fourth = manualCar();
    fourth.mgear = 4;
    hold(first, 1.5);
    hold(fourth, 1.5);
    expect(forwardSpeed(fourth)).toBeLessThan(forwardSpeed(first) * 0.5);
    expect(forwardSpeed(fourth)).toBeGreaterThan(0); // weak, but it never stalls
    expect(torque(4, 0)).toBeLessThan(torque(1, 0) * 0.3);
  });

  it('shifting through the gears reaches the automatic top speed, never more', () => {
    const c = manualCar();
    for (const g of [1, 2, 3, 4]) {
      if (g > 1) drive(c, press({ throttle: 1, shift: 1 }));
      hold(c, g === 4 ? 25 : 5);
    }
    expect(c.mgear).toBe(4);
    expect(forwardSpeed(c)).toBeGreaterThan(DRIVE.topSpeed * 0.95);
    expect(forwardSpeed(c)).toBeLessThanOrEqual(DRIVE.topSpeed + 0.05);
  });

  it('N coasts: the gas only revs the engine', () => {
    const c = manualCar();
    c.mgear = 0;
    hold(c, 2);
    expect(forwardSpeed(c)).toBe(0);
    expect(c.rpm).toBeGreaterThan(MANUAL.idle * 3);
  });

  it('in R the gas drives backwards (capped like the automatic reverse); the brake never reverses', () => {
    const c = manualCar();
    hold(c, 3, { brake: 1 });
    expect(forwardSpeed(c)).toBe(0);
    c.mgear = -1;
    hold(c, 8);
    expect(forwardSpeed(c)).toBeLessThan(-DRIVE.reverseTop * 0.9);
    expect(forwardSpeed(c)).toBeGreaterThanOrEqual(-DRIVE.reverseTop - 0.03);
    expect(c.gear).toBe(-1);
  });

  it('engine-brakes off the gas in gear, more than coasting in N', () => {
    const inGear = manualCar();
    const coast = manualCar();
    for (const c of [inGear, coast]) {
      c.mgear = 2;
      hold(c, 4);
    }
    coast.mgear = 0;
    hold(inGear, 1, {});
    hold(coast, 1, {});
    expect(forwardSpeed(inGear)).toBeLessThan(forwardSpeed(coast));
  });

  it('band and revs read the place in the gear', () => {
    expect(band(2, MANUAL.limit[2] / 2)).toBeCloseTo(0.5);
    expect(band(0, 5)).toBe(0);
    expect(band(1, 99)).toBe(1);
  });
});

describe('the automatic is unchanged', () => {
  it('drives exactly as before when the box is automatic (shift requests are ignored)', () => {
    const a = autoCar();
    const b = autoCar();
    for (let i = 0; i < 400; i++) {
      const p = press({ throttle: i < 250 ? 1 : 0, brake: i >= 250 ? 1 : 0, steer: Math.sin(i / 30) });
      drive(a, p);
      drive(b, { ...p, shift: i % 2 ? 1 : -1 });
    }
    expect(b.x).toBe(a.x);
    expect(b.z).toBe(a.z);
    expect(b.mgear).toBe(1);
    expect(a.gear).toBe(-1); // S at a standstill still selects reverse
  });

  it('bots never get the manual box, even in a manual round', () => {
    const { state } = createRound(lot, { seed: 2, bots: [false, true, true, true], manual: true });
    expect(state.cars.map((c) => c.box)).toEqual(['manual', 'auto', 'auto', 'auto']);
  });
});
