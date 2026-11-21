import { botInput, createBrain, spotRoute } from './bot';
import {
  ALL_LEVELS,
  CAMPAIGN,
  RACES,
  continueRace,
  raceStars,
  racesWon,
  CHAPTERS,
  CAMPAIGN_KEY,
  GO_GRACE,
  GRAZE_SPEED,
  AUTO_NEXT_SECS,
  autoAdvances,
  starsToNextChapter,
  failSpeedOf,
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
import { CONTACT, DT, RACE } from './constants';
import { levelY } from './levels';
import { buildLot } from './lot';
import { locate, shortestPath } from './nav';
import { GUIDE, hintDelay } from './guidance';
import { carShape, createRound, drive, emptyBay, inIntro, makeCar, skipIntro, step } from './step';
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
    step(state, world, [input]);
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
  it('has thirty solo levels in order, in four chapters, and no races (those are their own mode)', () => {
    expect(CAMPAIGN).toHaveLength(30);
    CAMPAIGN.forEach((l, i) => expect(l.n).toBe(i + 1));
    expect(new Set(ALL_LEVELS.map((l) => l.id)).size).toBe(ALL_LEVELS.length);
    for (const ch of CHAPTERS) {
      const levels = CAMPAIGN.filter((l) => l.chapter === ch.n);
      expect(levels.length).toBeGreaterThanOrEqual(3);
      expect(levels.every((l) => l.type !== 'race')).toBe(true);
    }
  });

  it('gives every level a teaching line, a par under its limit, and one new idea (no two levels the same setup)', () => {
    const keys = new Set<string>();
    for (const l of ALL_LEVELS) {
      expect(l.teaches.length, l.id).toBeGreaterThan(10);
      expect(l.par, l.id).toBeLessThan(l.limit);
      const key = `${l.type}:${l.target.join(',')}:${l.facing}:${JSON.stringify(l.spawn)}`;
      expect(keys.has(key), l.id).toBe(false);
      keys.add(key);
    }
  });

  it('makes finding the bay harder over the campaign: farther from the start, more decoys and obstacles, later hints', () => {
    const dist = (l: LevelDef) => {
      if (l.spawn === 'gate' || !l.target.length) return 0;
      const b = lot.bays[l.target[0]];
      return Math.hypot(b.x - l.spawn.x, b.z - l.spawn.z) + Math.abs(b.y - levelY(l.spawn.lvl)) * 4;
    };
    // Level 1: the bay is not right in front of you; its marking cannot be seen from the start.
    expect(dist(CAMPAIGN[0])).toBeGreaterThan(GUIDE.fadeTo * 2);
    const fills = (l: LevelDef, what: string[]) => Object.values(l.bays ?? {}).filter((f) => what.includes(f)).length;
    const per = (f: (l: LevelDef) => number) => CHAPTERS.map((c) => {
      const ls = CAMPAIGN.filter((l) => l.chapter === c.n);
      return ls.reduce((a, l) => a + f(l), 0) / ls.length;
    });
    const rising = (xs: number[]) => xs.every((x, i) => i === 0 || x >= xs[i - 1]);
    const decoys = per((l) => fills(l, ['cones']));
    const obstacles = per((l) => fills(l, ['cones', 'van', 'suv', 'corral']) + (l.cones?.length ?? 0) / 3);
    const hints = per((l) => hintDelay(l));
    expect(rising(decoys), `decoys ${decoys}`).toBe(true);
    expect(rising(obstacles), `obstacles ${obstacles}`).toBe(true);
    expect(rising(hints), `hint delays ${hints}`).toBe(true);
    expect(decoys[3]).toBeGreaterThan(decoys[0] * 4);
    // Most levels start out of the bay marking's reach, so it has to be found (the short precision levels are the exceptions).
    for (const c of CHAPTERS) {
      const ls = CAMPAIGN.filter((l) => l.chapter === c.n && l.target.length);
      expect(ls.filter((l) => dist(l) > GUIDE.fadeTo).length / ls.length, `chapter ${c.n}`).toBeGreaterThanOrEqual(0.6);
    }
    // A decoy is never the bay to park in.
    for (const l of CAMPAIGN) for (const id of l.target) expect(l.bays?.[id], l.id).toBeUndefined();
  });

  it('uses only words that are fine on portals', () => {
    const text = JSON.stringify(ALL_LEVELS) + JSON.stringify(CHAPTERS);
    for (const bad of [/Staging/, /Hotfix/, /pull request/i, /merge conflict/i, /donate/i]) expect(text).not.toMatch(bad);
  });
});

describe('every level is playable', () => {
  for (const l of ALL_LEVELS) {
    it(`${l.n} ${l.name}: the start is clear, and the bays it names are free and fit a car parked the way it asks`, () => {
      const { state, world } = round(l);
      const me = state.cars[0];
      expect(touching(world, me), 'spawn').toEqual([]);
      if (l.spawn !== 'gate') expect(Math.abs(me.y - levelY(l.spawn.lvl))).toBeLessThan(0.01);
      for (const [k, id] of (state.targets ?? []).entries()) {
        // A chain's later bay holds a car until its turn: check it as it will be then.
        if (k > 0) emptyBay(world, id);
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

  // The whole idea of the game: the lot has exactly one free space. Every other bay holds something.
  for (const l of ALL_LEVELS) {
    it(`${l.n} ${l.name}: exactly one bay is free, and every other bay is filled`, () => {
      for (const seed of [3, 11]) {
        const { state, world } = round(l, seed);
        const me = state.cars[0];
        const solid = new Set(world.owner.filter((o) => o >= 0));
        // (The car that pulls out is a moving body, not a solid: its bay is not free yet, unless it is the bay you wait for.)
        const empty = world.lot.bays.filter((b) => !solid.has(b.id) && (b.id !== state.leaver?.bay || b.id === state.target)).map((b) => b.id);
        expect(empty, `seed ${seed}`).toHaveLength(1);
        if (l.type === 'unpark') {
          // The one free bay is the one you start in: you are leaving it.
          const bay = world.lot.bays[empty[0]];
          expect(Math.hypot(bay.x - me.x, bay.z - me.z)).toBeLessThan(1.5);
        } else expect(empty[0]).toBe(state.target);
        // The renderer draws a car in every bay the sim has solid, and none in the free one.
        expect(world.lot.bays.filter((b) => b.use === 'free').map((b) => b.id)).toEqual(empty);
      }
    });
  }

  it('a chain empties its next bay only once the one before is parked', () => {
    const l = levelById('trial')!;
    const { state, world } = round(l);
    const [a, b] = state.targets!;
    expect(world.owner.includes(b)).toBe(true);
    const bay = world.lot.bays[a];
    holdIn(state, world, { x: bay.x, z: bay.z, h: bay.h, y: bay.y });
    expect(state.target).toBe(b);
    expect(world.owner.includes(b)).toBe(false);
    expect(world.lot.bays[b].use).toBe('free');
  });

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
          state.phase = 'race';
      step(state, world, [press({ throttle: 1 })]);
      expect(state.winner).toBe(0);
    });
  }

  it('races put the rivals on the line and keep the countdown', () => {
    for (const l of RACES) {
      const { state } = createRound(lot, { seed: 4, bots: [false], level: l });
      expect(state.cars).toHaveLength(1 + l.bots!.n);
      expect(state.cars.slice(1).every((c) => c.bot)).toBe(true);
      expect(state.maxTime).toBe(l.limit);
      expect(state.target).toBeGreaterThanOrEqual(0);
    }
  });
});

describe('the rules of a level', () => {
  const first = levelById('first-bay')!;

  it('counts down 3-2-1 like the race: no moving and no clock before GO, even with the pedal down', () => {
    const { state, world } = round(first);
    const me = state.cars[0];
    const start = { x: me.x, z: me.z };
    const counts: number[] = [];
    let go = 0;
    while (state.phase === 'countdown') {
      step(state, world, [press({ throttle: 1 })]);
      for (const e of state.events) if (e.type === 'count') counts.push(e.n);
      else if (e.type === 'go') go++;
    }
    expect(counts).toEqual([3, 2, 1]);
    expect(go).toBe(1);
    expect(Math.hypot(me.x - start.x, me.z - start.z)).toBeLessThan(0.05);
    expect(state.clock).toBe(0);
    for (let i = 0; i < 60; i++) step(state, world, [press({ throttle: 1 })]);
    expect(state.clock).toBeGreaterThan(0.9);
    expect(Math.hypot(me.x - start.x, me.z - start.z)).toBeGreaterThan(0.5);
  });

  it('the lead-in before the 3 can be skipped, the 3-2-1 cannot', () => {
    const { state, world } = round(first);
    expect(inIntro(state)).toBe(true);
    expect(skipIntro(state)).toBe(true);
    // The very next step calls the 3, and from then on it cannot be skipped.
    step(state, world, [press({ throttle: 1 })]);
    expect(state.events).toEqual([{ type: 'count', n: RACE.count }]);
    expect(inIntro(state)).toBe(false);
    expect(skipIntro(state)).toBe(false);
    let steps = 1;
    while (state.phase === 'countdown') {
      step(state, world, [press({ throttle: 1 })]);
      steps++;
    }
    expect(steps * DT).toBeCloseTo(RACE.count, 1);
  });

  it('only the bays the level names are free: the others hold what the level put there', () => {
    const vans = levelById('vans')!;
    const { world } = round(vans);
    expect(world.lot.bays[157].variant).toBe(4);
    expect(world.lot.bays[159].use).toBe('car');
    const { world: w1 } = round(first);
    expect(w1.lot.bays[101].use).toBe('free');
    expect(w1.owner.includes(101)).toBe(false);
    expect(w1.owner.includes(102)).toBe(true);
    // The lot itself is untouched.
    expect(lot.bays[101].use).toBe('car');
  });

  it('a light touch is a graze (the level goes on); a hard one fails it', () => {
    const vans = levelById('vans')!;
    for (const [speed, out] of [
      [0.5, false],
      [3, true],
    ] as const) {
      const { state, world } = round(vans);
      const van = world.lot.bays[157];
      const me = state.cars[0];
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

  /** Drive level `l`'s car into the side of an ordinary parked car at `speed` m/s; returns what became of it. */
  const bump = (l: LevelDef, speed: number) => {
    const { state, world } = round(l);
    const parked = world.lot.bays.find((b) => b.use === 'car' && !b.garage && b.type === 'perp' && b.variant === 0 && b.id !== state.target)!;
    const me = state.cars[0];
    state.phase = 'race';
    state.t = 5;
    const gap = 2.105 + 2.225 + 0.03;
    Object.assign(me, { x: parked.x - parked.ax * gap, z: parked.z - parked.az * gap, h: parked.h, vx: parked.ax * speed, vz: parked.az * speed, w: 0 });
    for (let i = 0; i < 60; i++) step(state, world, [press()]);
    return { out: me.dq !== null, grazes: me.grazes, phase: state.phase };
  };

  it('levels 1 to 4 never fail on a touch: a 10 km/h and even a 20 km/h bump is only a graze', () => {
    for (const l of CAMPAIGN.slice(0, 4)) {
      for (const kmh of [10, 20]) {
        const r = bump(l, kmh / 3.6);
        expect(r.out, `level ${l.n} at ${kmh} km/h`).toBe(false);
        expect(r.grazes, `level ${l.n} at ${kmh} km/h`).toBeGreaterThan(0);
        expect(r.phase).toBe('race');
      }
    }
  });

  it('a graze costs the clean star but a park after it still earns two', () => {
    const l = CAMPAIGN[0];
    const g = { finished: true, time: l.par - 1, grazes: 1, precision: 95 };
    expect(starsFor(l, g)).toBe(2);
  });

  it('levels 5 to 8 fail at 2.0 m/s (7 km/h) and forgive anything slower', () => {
    expect(failSpeedOf(CAMPAIGN[4])).toBe(2);
    expect(failSpeedOf(CAMPAIGN[7])).toBe(2);
    for (const l of CAMPAIGN.slice(4, 8)) {
      const soft = bump(l, 1.5);
      expect(soft.out, `level ${l.n} at 1.5 m/s`).toBe(false);
      expect(soft.grazes).toBeGreaterThan(0);
      expect(bump(l, 2.6).out, `level ${l.n} at 2.6 m/s`).toBe(true);
    }
  });

  it('level 9 on and every race keep their old rules', () => {
    expect(failSpeedOf(CAMPAIGN[8])).toBe(GRAZE_SPEED);
    expect(failSpeedOf(CAMPAIGN[29])).toBe(GRAZE_SPEED);
    expect(failSpeedOf(RACES[0])).toBe(CONTACT.minSpeed);
    expect(bump(CAMPAIGN[8], 1.5).out).toBe(true);
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

  it('times out at the level limit (counted from GO)', () => {
    const { state, world } = round(first);
    for (let i = 0; i < (RACE.countdown + first.limit + 1) / DT; i++) step(state, world, [press({ handbrake: true })]);
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

  it('gives a solo level 0.4 s on top of its par and limit for the reaction to GO (a race keeps its own times)', () => {
    const l = levelById('first-bay')!;
    expect(GO_GRACE).toBeCloseTo(0.4);
    expect(goalsOf(l, { finished: true, time: l.par + 0.35, grazes: 0, precision: 90 }).par).toBe(true);
    expect(goalsOf(l, { finished: true, time: l.par + 0.45, grazes: 0, precision: 90 }).par).toBe(false);
    expect(round(l).state.maxTime).toBeCloseTo(l.limit + 0.4);
    const race = levelById('first-race')!;
    expect(goalsOf(race, { finished: true, time: race.par + 0.2, grazes: 0, precision: 100 }).par).toBe(false);
    expect(createRound(lot, { seed: 4, bots: [false], level: race }).state.maxTime).toBe(race.limit);
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
    expect(loadProgress(store)).toEqual({ levels: { 'first-bay': { stars: 3, best: 0, precision: 0 } }, unlocked: ['first-bay', 'neighbours'] });
    store.setItem(CAMPAIGN_KEY, JSON.stringify({ v: 2, levels: {}, unlocked: ['nope', 7, 'trial'] }));
    expect(loadProgress(store)).toEqual({ levels: {}, unlocked: ['trial'] });
  });

  it('opens levels one by one and chapters by their star gates (campaign stars only)', () => {
    let p = emptyProgress();
    expect(levelOpen(p, CAMPAIGN[0])).toBe(true);
    expect(levelOpen(p, CAMPAIGN[1])).toBe(false);
    expect(continueLevel(p).id).toBe('first-bay');
    const done = (l: LevelDef, stars: number) => {
      const r = { finished: true, time: stars >= 2 ? l.par - 1 : l.limit - 1, grazes: stars >= 3 ? 0 : 1, precision: 100 };
      p = recordRun(p, l, r);
    };
    const ch1 = CAMPAIGN.filter((x) => x.chapter === 1);
    const firstOf2 = CAMPAIGN.find((x) => x.chapter === 2)!;
    const gate = CHAPTERS[1].gate;
    // Chapter 1 with one star each is not enough for chapter 2.
    for (const l of ch1) done(l, 1);
    expect(totalStars(p)).toBe(ch1.length);
    expect(totalStars(p)).toBeLessThan(gate);
    expect(levelOpen(p, firstOf2)).toBe(false);
    expect(nextOpenLevel(p, ch1[ch1.length - 1])).toBeNull();
    // Race stars do not count towards the campaign's gates.
    for (const r of RACES) done(r, 3);
    expect(totalStars(p)).toBe(ch1.length);
    expect(raceStars(p)).toBe(RACES.length * 3);
    // Better runs of the first levels: the gate is met and chapter 2 opens.
    for (const l of ch1) if (totalStars(p) < gate) done(l, 3);
    expect(totalStars(p)).toBeGreaterThanOrEqual(gate);
    expect(levelOpen(p, firstOf2)).toBe(true);
    expect(nextOpenLevel(p, ch1[ch1.length - 1])?.id).toBe(firstOf2.id);
    expect(continueLevel(p).id).toBe(firstOf2.id);
  });

  it('keeps the races in their own mode, opened one by one, and the endless race opens with the first race won', () => {
    expect(RACES.length).toBe(6);
    RACES.forEach((l, i) => expect(l.n).toBe(i + 1));
    expect(RACES.every((l) => l.type === 'race')).toBe(true);
    expect(CAMPAIGN.some((l) => l.type === 'race')).toBe(false);
    let p = emptyProgress();
    expect(levelOpen(p, RACES[0])).toBe(true);
    expect(levelOpen(p, RACES[1])).toBe(false);
    expect(endlessOpen(p)).toBe(false);
    expect(continueRace(p).id).toBe('first-race');
    p = recordRun(p, RACES[0], { finished: true, time: 50, grazes: 1, precision: 100 });
    expect(levelOpen(p, RACES[1])).toBe(true);
    expect(endlessOpen(p)).toBe(true);
    expect(racesWon(p)).toBe(1);
    expect(nextOpenLevel(p, RACES[0])?.id).toBe(RACES[1].id);
    expect(continueRace(p).id).toBe(RACES[1].id);
    // Winning a race opens nothing in the campaign.
    expect(levelOpen(p, CAMPAIGN[1])).toBe(false);
  });

  it('migrates a version 1 save (races inside the campaign) without closing anything that was open', () => {
    const store = memoryStore();
    // A player who finished old levels 1 to 16 (races 8 and 16 among them) with two stars each: 32 stars, chapter 3 open in
    // version 1. Old level 17 (ground floor) was their next level.
    const v1 = [
      'first-bay', 'neighbours', 'angled', 'swing', 'back-in', 'vans', 'trial', 'first-race',
      'crossing', 'pulling-out', 'kerbside', 'parallel', 'dead-end', 'trolleys', 'shuffle', 'saturday-race',
    ];
    store.setItem(CAMPAIGN_KEY, JSON.stringify({ v: 1, levels: Object.fromEntries(v1.map((id) => [id, { stars: 2, best: 30, precision: 70 }])) }));
    const p = loadProgress(store);
    // Every record is kept, the races' too (now in Race mode).
    expect(Object.keys(p.levels).sort()).toEqual([...v1].sort());
    expect(racesWon(p)).toBe(2);
    expect(levelOpen(p, levelById('decoy-race')!)).toBe(true);
    expect(endlessOpen(p)).toBe(true);
    // Every campaign level that was open is still open, the next one included, though the campaign alone now has fewer stars.
    for (const id of [...v1.filter((id) => !levelById(id)!.type.includes('race')), 'ground-floor']) expect(levelOpen(p, levelById(id)!), id).toBe(true);
    expect(totalStars(p)).toBe(28);
    expect(continueLevel(p).n).toBeLessThanOrEqual(levelById('ground-floor')!.n);
    // Saved again, it is a version 2 save that loads the same.
    saveProgress(store, p);
    expect(JSON.parse(store.getItem(CAMPAIGN_KEY)!).v).toBe(2);
    expect(loadProgress(store)).toEqual(p);
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

describe('fine steering', () => {
  it('on/off steering turns the wheel slower at a crawl, as fast as ever once moving', () => {
    const turned = (fine: boolean, speed: number) => {
      const c = makeCar(0, 'You', 0, false, 0, 0, 0);
      c.vz = speed;
      drive(c, press({ steer: 1, fine }));
      return c.steer;
    };
    expect(turned(true, 0)).toBeLessThan(turned(false, 0) * 0.7);
    expect(turned(true, 5)).toBeCloseTo(turned(false, 5), 5);
  });
});

describe('one tap to drive: where Play and Next level go', () => {
  const park = (p: ReturnType<typeof emptyProgress>, l: LevelDef, stars = 1) =>
    recordRun(p, l, { finished: true, time: stars >= 2 ? l.par - 1 : l.limit - 1, grazes: stars >= 3 ? 0 : 1, precision: 100 });

  it('a new player\'s Play starts level 1', () => {
    expect(continueLevel(emptyProgress()).id).toBe(CAMPAIGN[0].id);
  });

  it('a returning player\'s Play starts the next level they have not finished', () => {
    let p = park(emptyProgress(), CAMPAIGN[0], 3);
    p = park(p, CAMPAIGN[1], 2);
    expect(continueLevel(p).id).toBe(CAMPAIGN[2].id);
  });

  it('after a park, Next level is the very next level, open at once', () => {
    const p = park(emptyProgress(), CAMPAIGN[0]);
    expect(nextOpenLevel(p, CAMPAIGN[0])?.id).toBe(CAMPAIGN[1].id);
    expect(nextOpenLevel(emptyProgress(), CAMPAIGN[0])).toBeNull();
  });
});

describe('momentum on the result card', () => {
  it('the next level starts by itself after 4 s, except after the last level of a chapter and in races', () => {
    expect(AUTO_NEXT_SECS).toBe(4);
    expect(autoAdvances(CAMPAIGN[0])).toBe(true);
    expect(autoAdvances(CAMPAIGN[6])).toBe(true);
    for (const n of [8, 16, 24, 30]) expect(autoAdvances(CAMPAIGN[n - 1]), `level ${n}`).toBe(false);
    expect(autoAdvances(RACES[0])).toBe(false);
  });

  it('says how many stars open the next chapter only when that is close', () => {
    const star = (ids: string[], n: number) => ({ levels: Object.fromEntries(ids.map((id) => [id, { stars: n, best: 1, precision: 1 }])), unlocked: [] as string[] });
    expect(starsToNextChapter(emptyProgress(), 1)).toBe(0);
    // Seven levels at one star = 7, so 3 more open chapter 2 (gate 10).
    expect(starsToNextChapter(star(CAMPAIGN.slice(0, 7).map((l) => l.id), 1), 1)).toBe(3);
    expect(starsToNextChapter(star(CAMPAIGN.slice(0, 8).map((l) => l.id), 1), 1)).toBe(2);
    // Already open: nothing to say.
    expect(starsToNextChapter(star(CAMPAIGN.slice(0, 8).map((l) => l.id), 3), 1)).toBe(0);
    // The last chapter has nothing after it.
    expect(starsToNextChapter(emptyProgress(), 4)).toBe(0);
  });
});

describe('a rival early: Race 1 from level 3', () => {
  it('Race 1 is open from the start, and race 2 still needs a win in race 1', () => {
    expect(levelOpen(emptyProgress(), RACES[0])).toBe(true);
    expect(levelOpen(emptyProgress(), RACES[1])).toBe(false);
    const won = recordRun(emptyProgress(), RACES[0], { finished: true, time: 30, grazes: 0, precision: 100 });
    expect(levelOpen(won, RACES[1])).toBe(true);
    expect(endlessOpen(won)).toBe(true);
  });

  it('level 3 is the level whose card offers it, and level 4 is where Race 1 sends you back', () => {
    expect(CAMPAIGN[2].n).toBe(3);
    expect(CAMPAIGN[3].n).toBe(4);
    expect(RACES[0].id).toBe('first-race');
  });
});
