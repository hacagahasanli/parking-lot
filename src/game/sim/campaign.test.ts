import { botInput, createBrain, spotRoute } from './bot';
import {
  CAMPAIGN,
  CHAPTERS,
  CAMPAIGN_KEY,
  continueLevel,
  emptyProgress,
  endlessOpen,
  goalsOf,
  levelById,
  levelOpen,
  loadProgress,
  nextOpenLevel,
  precisionOf,
  recordRun,
  saveProgress,
  starsFor,
  totalStars,
} from './campaign';
import { collide, nearShape } from './collide';
import { DT } from './constants';
import { levelY } from './levels';
import { buildLot } from './lot';
import { locate, shortestPath } from './nav';
import { carShape, createRound, step } from './step';
import { memoryStore } from '~/platform/web';
import { SCRIPTS, driveScript } from './drive';

import type { LevelDef } from './campaign';
import type { Car, GameState, Input, World } from './types';

const lot = buildLot();
const press = (p: Partial<Input> = {}): Input => ({ throttle: 0, brake: 0, steer: 0, handbrake: false, horn: false, ...p });
const round = (l: LevelDef, seed = 3) => createRound(lot, { seed, bots: [false], level: l });

/** The solids a car touches where it stands (only the ones at its height). */
const touching = (world: World, c: { x: number; z: number; h: number; y: number }) => {
  const box = carShape(c);
  return world.solids
    .map((s, i) => ({ s, i }))
    .filter(({ s }) => s.y0 === undefined || (c.y + 1.5 > s.y0 && c.y < (s.y1 ?? Infinity)))
    .filter(({ s }) => nearShape(box, s) && collide(box, s))
    .map(({ i }) => world.hard[i] ?? `kerb #${i}`);
};

/** The heading a car stands at when parked the way the level asks. */
const idealH = (l: LevelDef, bayH: number) => (l.facing === 'tail' ? bayH + Math.PI : bayH);

/** Run the round with car 0 standing still in the given pose until the hold completes (or a second and a half passes). */
const holdIn = (state: GameState, world: World, pose: { x: number; z: number; h: number; y: number }) => {
  const me = state.cars[0];
  Object.assign(me, pose, { vx: 0, vz: 0, w: 0, steer: 0 });
  // A car pulling out of the bay has gone.
  if (state.leaver) Object.assign(state.leaver, { phase: 'gone' });
  if (state.leaver) Object.assign(state.leaver.car, { x: 9999, z: 9999 });
  state.waiting = false;
  state.phase = 'race';
  state.t = 5;
  const events: string[] = [];
  for (let i = 0; i < 90 && state.phase === 'race'; i++) {
    step(state, world, [press({ handbrake: true })]);
    for (const e of state.events) events.push(e.type);
    Object.assign(me, pose, { vx: 0, vz: 0, w: 0 });
    if (events.includes('leg')) break;
  }
  return events;
};

/** Drive car 0 with a bot's brain told where the bay is from the start; returns the race clock when the leg is parked, or null. */
const botLeg = (state: GameState, world: World, maxTime: number) => {
  const me = state.cars[0];
  const brain = createBrain(world, me, 5);
  brain.launch = 0;
  const route = spotRoute(world, me, state.target);
  if (!route) return null;
  Object.assign(brain, { spotted: true, target: state.target, route, seg: 0 });
  const leg = state.leg ?? 0;
  for (let i = 0; i < maxTime / DT; i++) {
    const input = botInput(state, world, me, brain);
    step(state, world, [state.waiting ? { ...input, throttle: 1 } : input]);
    if (state.phase === 'done' || (state.leg ?? 0) > leg) return state.clock;
  }
  return null;
};

/** Put car 0 on the lane at a bay's first approach dock, heading along the lane (to start the next leg of a chain). */
const toDock = (me: Car, world: World, bay: number) => {
  const ap = world.lot.bays[bay].approach[0];
  const e = world.lot.graph.edges[ap.edge];
  Object.assign(me, { x: ap.dock.x, z: ap.dock.z, h: Math.atan2(e.ux, e.uz), y: e.yA, vx: 0, vz: 0, w: 0, steer: 0, park: 0 });
};

describe('the campaign data', () => {
  it('has thirty levels in order, in four chapters, each chapter ending in a race', () => {
    expect(CAMPAIGN).toHaveLength(30);
    CAMPAIGN.forEach((l, i) => expect(l.n).toBe(i + 1));
    expect(new Set(CAMPAIGN.map((l) => l.id)).size).toBe(30);
    for (const ch of CHAPTERS) {
      const levels = CAMPAIGN.filter((l) => l.chapter === ch.n);
      expect(levels.length).toBeGreaterThanOrEqual(6);
      expect(levels.some((l) => l.type === 'race')).toBe(true);
    }
    expect(CAMPAIGN[29].type).toBe('race');
  });

  it('gives every level a teaching line, a par under its limit, and one new idea (no two levels the same setup)', () => {
    const keys = new Set<string>();
    for (const l of CAMPAIGN) {
      expect(l.teaches.length, l.id).toBeGreaterThan(10);
      expect(l.par, l.id).toBeLessThan(l.limit);
      const key = `${l.type}:${l.target.join(',')}:${l.facing}:${JSON.stringify(l.spawn)}`;
      expect(keys.has(key), l.id).toBe(false);
      keys.add(key);
    }
  });

  it('uses only words that are fine on portals', () => {
    const text = JSON.stringify(CAMPAIGN) + JSON.stringify(CHAPTERS);
    for (const bad of [/Staging/, /Hotfix/, /pull request/i, /merge conflict/i, /donate/i]) expect(text).not.toMatch(bad);
  });
});

describe('every level is playable', () => {
  for (const l of CAMPAIGN) {
    it(`${l.n} ${l.name}: the start is clear, and the bays it names are free and fit a car parked the way it asks`, () => {
      const { state, world } = round(l);
      const me = state.cars[0];
      expect(touching(world, me), 'spawn').toEqual([]);
      if (l.spawn !== 'gate') expect(Math.abs(me.y - levelY(l.spawn.lvl))).toBeLessThan(0.01);
      for (const id of state.targets ?? []) {
        const bay = world.lot.bays[id];
        expect(bay, `bay ${id}`).toBeDefined();
        // The bay is in the part of the site this stage opens.
        if (bay.garage) expect(world.lot.open?.levels, `bay ${id} deck`).toContain(bay.lvl);
        else expect(world.lot.stage === 1 || world.lot.open?.garage !== undefined).toBe(true);
        const pose = { x: bay.x, z: bay.z, h: idealH(l, bay.h), y: bay.y };
        expect(touching(world, pose), `bay ${id}`).toEqual([]);
        expect(precisionOf(pose, bay, l.facing)).toBe(100);
      }
      // Standing still, straight and centred in each bay in turn counts (a leg of a chain, or the end).
      const { state: s2, world: w2 } = round(l);
      for (const [k, id] of (s2.targets ?? []).entries()) {
        const bay = w2.lot.bays[id];
        const events = holdIn(s2, w2, { x: bay.x, z: bay.z, h: idealH(l, bay.h), y: bay.y });
        expect(events, `bay ${id}`).toContain(k < (s2.targets?.length ?? 0) - 1 ? 'leg' : 'parked');
      }
      if (l.type !== 'unpark' && s2.targets?.length) {
        expect(s2.winner).toBe(0);
        expect(Math.min(...(s2.legPrecision ?? [0]))).toBeGreaterThanOrEqual(95);
      }
    });
  }

  it('a nose-in park does not count where the level asks you to back in (and the other way round)', () => {
    for (const l of CAMPAIGN.filter((x) => x.facing !== 'any')) {
      const { state, world } = round(l);
      const bay = world.lot.bays[state.targets![0]];
      const wrong = l.facing === 'tail' ? bay.h : bay.h + Math.PI;
      const events = holdIn(state, world, { x: bay.x, z: bay.z, h: wrong, y: bay.y });
      expect(events, l.id).not.toContain('parked');
      expect(events, l.id).not.toContain('leg');
    }
  });

  // A bot's brain, told where each bay is, drives every level whose bays it knows how to enter (nose in, from an aisle).
  // Backing in, parallel bays and unparking are checked by the poses above and the routes below.
  for (const l of CAMPAIGN.filter((x) => x.type !== 'race' && x.type !== 'unpark' && x.facing !== 'tail' && x.target.every((id) => lot.bays[id].type !== 'parallel'))) {
    it(`${l.n} ${l.name}: a driver who knows the way parks every bay inside the time limit`, () => {
      const { state, world } = round(l);
      const legs = state.targets!.length;
      // Each leg on its own clock (a bot takes the long way round from the dock it is put at, and parks slower than a person).
      state.maxTime = 1e9;
      for (let k = 0; k < legs; k++) {
        if (k > 0) toDock(state.cars[0], world, state.targets![k - 1]);
        const from = state.clock;
        const t = botLeg(state, world, l.limit);
        expect(t, `leg ${k + 1} of ${legs}`).not.toBeNull();
        expect(t! - from, `leg ${k + 1} of ${legs}`).toBeLessThan(l.limit);
      }
      expect(state.winner).toBe(0);
      expect(state.cars[0].dq).toBeNull();
    }, 30000);
  }

  for (const l of CAMPAIGN.filter((x) => x.type === 'unpark')) {
    it(`${l.n} ${l.name}: the exit is on an open lane, reachable from the aisle in front of the bay`, () => {
      const { state, world } = round(l);
      const g = world.lot.graph;
      const exit = l.exit!;
      const at = locate(g, exit.x, exit.z, undefined, true, levelY(exit.lvl));
      expect(at.off).toBeLessThan(2.5);
      expect(g.edges[at.edge].closed).toBeFalsy();
      // Pulled out: square in the aisle in front of the bay, facing along it.
      const me = state.cars[0];
      const out = locate(g, me.x - Math.sin(me.h) * 5, me.z - Math.cos(me.h) * 5, undefined, true, me.y);
      const e = g.edges[out.edge];
      const pose = { x: e.a.x + e.ux * out.s, z: e.a.z + e.uz * out.s, h: Math.atan2(e.ux, e.uz), y: me.y };
      expect(touching(world, pose)).toEqual([]);
      expect(e.closed).toBeFalsy();
      expect(out.edge === at.edge || shortestPath(g, e.to, g.edges[at.edge].from, true) !== null).toBe(true);
      // Driving into the circle finishes the level.
      Object.assign(me, { x: exit.x, z: exit.z, y: levelY(exit.lvl), vx: 2, vz: 0 });
      state.waiting = false;
      state.phase = 'race';
      step(state, world, [press({ throttle: 1 })]);
      expect(state.winner).toBe(0);
    });
  }

  it('races put the rivals on the line and keep the countdown', () => {
    for (const l of CAMPAIGN.filter((x) => x.type === 'race')) {
      const { state } = createRound(lot, { seed: 4, bots: [false], level: l });
      expect(state.cars).toHaveLength(1 + l.bots!.n);
      expect(state.cars.slice(1).every((c) => c.bot)).toBe(true);
      expect(state.waiting).toBe(false);
      expect(state.maxTime).toBe(l.limit);
      expect(state.target).toBeGreaterThanOrEqual(0);
    }
  });
});

describe('the rules of a level', () => {
  const first = levelById('first-bay')!;

  it('waits on the line until you press gas or brake (no countdown), then starts the clock', () => {
    const { state, world } = round(first);
    for (let i = 0; i < 120; i++) step(state, world, [press({ steer: 1 })]);
    expect(state.phase).toBe('countdown');
    expect(state.clock).toBe(0);
    step(state, world, [press({ throttle: 1 })]);
    expect(state.phase).toBe('race');
    for (let i = 0; i < 60; i++) step(state, world, [press({ throttle: 1 })]);
    expect(state.clock).toBeGreaterThan(0.9);
  });

  it('only the bays the level names are free: the others hold what the level put there', () => {
    const vans = levelById('vans')!;
    const { world } = round(vans);
    expect(world.lot.bays[157].variant).toBe(4);
    expect(world.lot.bays[159].use).toBe('car');
    const { world: w1 } = round(first);
    expect(w1.lot.bays[96].use).toBe('free');
    expect(w1.owner.includes(96)).toBe(false);
    expect(w1.owner.includes(97)).toBe(false);
    expect(w1.owner.includes(101)).toBe(true);
    // The lot itself is untouched.
    expect(lot.bays[96].use).toBe('car');
  });

  it('a light touch is a graze (the level goes on); a hard one fails it', () => {
    const vans = levelById('vans')!;
    for (const [speed, out] of [
      [0.5, false],
      [2, true],
    ] as const) {
      const { state, world } = round(vans);
      const van = world.lot.bays[157];
      const me = state.cars[0];
      state.waiting = false;
      state.phase = 'race';
      // Drive straight into the van's back from the aisle, 5 cm away.
      const gap = 0.12 + 4.95 / 2 + 4.45 / 2 + 0.05;
      Object.assign(me, { x: van.x - van.ax * (gap - 0.12 * 2), z: van.z - van.az * (gap - 0.12 * 2), h: van.h, vx: van.ax * speed, vz: van.az * speed, w: 0 });
      for (let i = 0; i < 60; i++) step(state, world, [press()]);
      expect(me.grazes > 0 || me.dq !== null, `${speed} m/s touched`).toBe(true);
      expect(me.dq !== null, `${speed} m/s`).toBe(out);
      if (!out) expect(state.phase).toBe('race');
      else expect(state.phase).toBe('done');
    }
  });

  it('in a race any real touch still puts you out', () => {
    const race = levelById('first-race')!;
    const { state, world } = createRound(lot, { seed: 4, bots: [false], level: race });
    const parked = world.lot.bays.find((b) => b.use === 'car' && !b.garage && b.type === 'perp' && b.variant === 0 && b.id !== state.target)!;
    const me = state.cars[0];
    state.phase = 'race';
    state.t = 5;
    const gap = 2.105 + 2.225 + 0.03;
    Object.assign(me, { x: parked.x - parked.ax * gap, z: parked.z - parked.az * gap, h: parked.h, vx: parked.ax * 0.8, vz: parked.az * 0.8, w: 0 });
    for (let i = 0; i < 60; i++) step(state, world, [press(), ...state.cars.slice(1).map(() => press())]);
    expect(me.dq).not.toBeNull();
  });

  it('times out at the level limit', () => {
    const { state, world } = round(first);
    step(state, world, [press({ brake: 1 })]);
    for (let i = 0; i < (first.limit + 1) / DT; i++) step(state, world, [press({ handbrake: true })]);
    expect(state.phase).toBe('done');
    expect(state.winner).toBeNull();
  });
});

describe('precision and stars', () => {
  const bay = { x: 10, z: 20, h: 0, d: 5.1 };
  it('scores dead centre and straight as 100, and 15 cm plus 5 degrees off as 80', () => {
    expect(precisionOf({ x: 10, z: 20, h: 0 }, bay, 'nose')).toBe(100);
    expect(precisionOf({ x: 10.15, z: 20, h: (5 * Math.PI) / 180 }, bay, 'nose')).toBe(80);
    expect(precisionOf({ x: 10, z: 20, h: Math.PI }, bay, 'tail')).toBe(100);
    expect(precisionOf({ x: 10, z: 20, h: Math.PI }, bay, 'any')).toBe(100);
    expect(precisionOf({ x: 11, z: 20, h: 0.3 }, bay, 'nose')).toBe(0);
  });

  it('gives one star for finishing, one for the par, one for a clean precise park', () => {
    const l = levelById('first-bay')!;
    const run = (p: Partial<Parameters<typeof starsFor>[1]>) => starsFor(l, { finished: true, time: l.par - 1, grazes: 0, precision: 90, ...p });
    expect(run({})).toBe(3);
    expect(run({ time: l.par + 1 })).toBe(2);
    expect(run({ grazes: 1 })).toBe(2);
    expect(run({ precision: 79 })).toBe(2);
    expect(run({ time: l.par + 1, grazes: 1 })).toBe(1);
    expect(run({ finished: false })).toBe(0);
    expect(goalsOf(l, { finished: true, time: l.par + 1, grazes: 0, precision: 85 })).toEqual({ finish: true, par: false, clean: true });
    // A race and an unpark do not score precision.
    const race = levelById('first-race')!;
    expect(starsFor(race, { finished: true, time: 10, grazes: 0, precision: 0 })).toBe(3);
  });
});

describe('progress', () => {
  it('saves and loads through the platform storage, keeping the best of every level', () => {
    const store = memoryStore();
    const l1 = CAMPAIGN[0];
    let p = recordRun(emptyProgress(), l1, { finished: true, time: l1.par + 5, grazes: 1, precision: 50 });
    expect(p.levels[l1.id].stars).toBe(1);
    p = recordRun(p, l1, { finished: true, time: l1.par - 2, grazes: 0, precision: 92 });
    p = recordRun(p, l1, { finished: true, time: l1.par + 9, grazes: 3, precision: 10 });
    expect(p.levels[l1.id]).toEqual({ stars: 3, best: l1.par - 2, precision: 92 });
    // An unfinished run changes nothing.
    expect(recordRun(p, CAMPAIGN[1], { finished: false, time: 3, grazes: 0, precision: 100 })).toBe(p);
    saveProgress(store, p);
    expect(loadProgress(store)).toEqual(p);
  });

  it('survives a missing, broken or foreign save', () => {
    const store = memoryStore();
    expect(loadProgress(store)).toEqual(emptyProgress());
    store.setItem(CAMPAIGN_KEY, '{not json');
    expect(loadProgress(store)).toEqual(emptyProgress());
    store.setItem(CAMPAIGN_KEY, JSON.stringify({ v: 1, levels: { nope: { stars: 3 }, 'first-bay': { stars: 9, best: 'x' } } }));
    expect(loadProgress(store)).toEqual({ levels: { 'first-bay': { stars: 3, best: 0, precision: 0 } } });
  });

  it('opens levels one by one and chapters by their star gates', () => {
    let p = emptyProgress();
    expect(levelOpen(p, CAMPAIGN[0])).toBe(true);
    expect(levelOpen(p, CAMPAIGN[1])).toBe(false);
    expect(continueLevel(p).id).toBe('first-bay');
    const done = (l: LevelDef, stars: number) => {
      const r = { finished: true, time: stars >= 2 ? l.par - 1 : l.limit - 1, grazes: stars >= 3 ? 0 : 1, precision: 100 };
      p = recordRun(p, l, r);
    };
    // Chapter 1 with one star each: 8 stars, not enough for chapter 2 (10).
    for (const l of CAMPAIGN.filter((x) => x.chapter === 1)) done(l, 1);
    expect(totalStars(p)).toBe(8);
    expect(endlessOpen(p)).toBe(true);
    const nine = CAMPAIGN[8];
    expect(levelOpen(p, nine)).toBe(false);
    expect(nextOpenLevel(p, CAMPAIGN[7])).toBeNull();
    // Better runs of two levels: 10 stars, chapter 2 opens.
    done(CAMPAIGN[0], 2);
    done(CAMPAIGN[1], 2);
    expect(levelOpen(p, nine)).toBe(true);
    expect(nextOpenLevel(p, CAMPAIGN[7])?.id).toBe(nine.id);
    expect(continueLevel(p).id).toBe(nine.id);
  });
});

describe('the levels a bot cannot drive', () => {
  // Backing in and parallel bays: a scripted careful driver (sim/drive.ts) finishes each inside its limit, cleanly.
  for (const [id, script] of Object.entries(SCRIPTS)) {
    it(`${id}: a careful driver parks it, clean`, () => {
      const l = levelById(id)!;
      const { state } = driveScript(lot, l, script);
      expect(state.winner, id).toBe(0);
      expect(state.cars[0].grazes).toBe(0);
      expect(state.clock).toBeLessThan(l.limit);
    });
  }
});
