import { createRound, step } from './step';
import { buildLot } from './lot';
import { DT } from './constants';
import {
  DAILY_ID,
  dailyLevel,
  dayKey,
  daySeed,
  dayStage,
  emptyDaily,
  bestOn,
  loadDaily,
  msToNextLot,
  nextLotLine,
  prevKey,
  recordDaily,
  saveDaily,
  streakOn,
  activateDaily,
} from './daily';
import { levelById } from './campaign';

const run = (time: number, grazes = 0) => ({ finished: true, time, grazes, precision: 100 });
const mem = () => {
  const m = new Map<string, string>();
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v) };
};

describe('Daily Lot: the seed', () => {
  it('is the UTC date, so two players on the same day get the same number', () => {
    expect(dayKey(new Date('2026-11-22T00:00:01Z'))).toBe('20261122');
    expect(dayKey(new Date('2026-11-22T23:59:59Z'))).toBe('20261122');
    expect(dayKey(new Date('2026-11-23T00:00:00Z'))).toBe('20261123');
    expect(daySeed('20261122')).toBe(20261122);
  });

  it('alternates the stage by day and keeps rivals and pace fixed', () => {
    expect(dayStage('20261122')).not.toBe(dayStage('20261123'));
    expect(dayStage('20261122')).toBe(dayStage('20261124'));
    const l = dailyLevel('20261122');
    expect(l.bots).toEqual({ n: 2, pace: { cruise: 0.6, launch: 6 } });
    expect([1, 2]).toContain(l.stage);
    expect(l.type).toBe('race');
  });

  it('gives the same lot, bay and rivals every time for a date, and another bay the next day', () => {
    const lot = buildLot();
    const make = (key: string) => {
      const l = dailyLevel(key);
      return createRound(lot, { seed: daySeed(key), bots: [false], level: l });
    };
    const a = make('20261122');
    const b = make('20261122');
    expect(b.state.target).toBe(a.state.target);
    expect(b.state.cars.map((c) => [c.x, c.z, c.h])).toEqual(a.state.cars.map((c) => [c.x, c.z, c.h]));
    // The same inputs play out the same.
    for (let i = 0; i < 200; i++) {
      step(a.state, a.world, a.state.cars.map(() => ({ throttle: 0, brake: 0, steer: 0, handbrake: false, horn: false })));
      step(b.state, b.world, b.state.cars.map(() => ({ throttle: 0, brake: 0, steer: 0, handbrake: false, horn: false })));
    }
    expect(b.state.t).toBeCloseTo(a.state.t, 9);
    expect(a.state.t).toBeGreaterThan(200 * DT - 1e-6);
    const targets = new Set(['20261122', '20261123', '20261124', '20261125', '20261126', '20261127'].map((k) => make(k).state.target));
    expect(targets.size).toBeGreaterThan(1);
  });

  it('is found by levelById once activated, and by nobody before', () => {
    const l = activateDaily('20261122');
    expect(levelById(DAILY_ID)).toBe(l);
  });
});

describe('Daily Lot: best of the day and the streak', () => {
  it('keeps the better result of the day: more stars, then a faster time', () => {
    const l = dailyLevel('20261122');
    let d = recordDaily(emptyDaily(), '20261122', run(l.par + 20));
    const first = bestOn(d, '20261122')!;
    expect(first.stars).toBe(2);
    d = recordDaily(d, '20261122', run(l.par + 30));
    expect(bestOn(d, '20261122')).toEqual(first);
    d = recordDaily(d, '20261122', run(l.par - 5));
    expect(bestOn(d, '20261122')!.stars).toBe(3);
    d = recordDaily(d, '20261122', run(l.par - 8));
    expect(bestOn(d, '20261122')!.time).toBe(l.par - 8);
  });

  it('a run that does not park changes nothing', () => {
    const d = emptyDaily();
    expect(recordDaily(d, '20261122', { finished: false, time: 5, grazes: 0, precision: 100 })).toBe(d);
  });

  it('+1 for each calendar day with a park; a second park the same day adds nothing', () => {
    let d = recordDaily(emptyDaily(), '20261122', run(50));
    expect(streakOn(d, '20261122')).toBe(1);
    d = recordDaily(d, '20261122', run(45));
    expect(streakOn(d, '20261122')).toBe(1);
    d = recordDaily(d, '20261123', run(45));
    d = recordDaily(d, '20261124', run(45));
    expect(streakOn(d, '20261124')).toBe(3);
  });

  it('a missed day starts the streak again at 1, and the menu stops showing a dead streak', () => {
    let d = recordDaily(emptyDaily(), '20261122', run(50));
    d = recordDaily(d, '20261123', run(50));
    expect(streakOn(d, '20261124')).toBe(2);
    expect(streakOn(d, '20261125')).toBe(0);
    d = recordDaily(d, '20261125', run(50));
    expect(streakOn(d, '20261125')).toBe(1);
  });

  it('the next UTC day shows New: the old best does not count', () => {
    const d = recordDaily(emptyDaily(), '20261122', run(50));
    expect(bestOn(d, '20261122')).not.toBeNull();
    expect(bestOn(d, '20261123')).toBeNull();
  });

  it('works across a month and a year end', () => {
    expect(prevKey('20261201')).toBe('20261130');
    expect(prevKey('20270101')).toBe('20261231');
  });

  it('saves and loads, and survives a broken save', () => {
    const s = mem();
    const d = recordDaily(emptyDaily(), '20261122', run(50));
    saveDaily(s, d);
    expect(loadDaily(s)).toEqual(d);
    s.setItem('parking-lot.daily', '{nope');
    expect(loadDaily(s)).toEqual(emptyDaily());
    s.setItem('parking-lot.daily', JSON.stringify({ today: { key: 'x' }, streak: { n: -2, last: 5 } }));
    expect(loadDaily(s)).toEqual(emptyDaily());
  });
});

describe('Daily Lot: the countdown to the next lot', () => {
  it('counts to UTC midnight and words it like the card', () => {
    const now = new Date('2026-11-22T09:40:00Z');
    expect(msToNextLot(now)).toBe((14 * 60 + 20) * 60_000);
    expect(nextLotLine(msToNextLot(now))).toBe('A new lot opens in 14 h 20 m');
    expect(nextLotLine(12 * 60_000)).toBe('A new lot opens in 12 m');
  });
});
