import { botInput, createBrain, planSweeps } from './bot';
import { hintOf } from './hint';
import { levelOf, levelY } from './levels';
import { buildLot } from './lot';
import { reachableFrom } from './nav';
import { radio } from './radio';
import { hasNext, isShut, newProgress, next, pick, STAGES, STAGE_COUNT, stageDef, stageLot, won } from './stages';
import { createRound, step } from './step';
import { SIGHT } from './visibility';

import type { Input } from './types';

const lot = buildLot();
const press = (p: Partial<Input>): Input => ({ throttle: 0, brake: 0, steer: 0, handbrake: false, horn: false, ...p });
const stages = STAGES.map((s) => s.n);
const GX0 = lot.garage.x0;

describe('the stages', () => {
  it('open one more floor each time: the open lot, then P0, P1, the roof, the underground, then everything', () => {
    expect(STAGE_COUNT).toBe(6);
    expect(STAGES.map((s) => s.open.levels)).toEqual([[], [0], [0, 1], [0, 1, 2], [-1, 0, 1, 2], [-1, 0, 1, 2]]);
    expect(STAGES.map((s) => s.newest)).toEqual([null, 0, 1, 2, -1, null]);
    expect(STAGES.map((s) => s.open.garage)).toEqual([false, true, true, true, true, true]);
    // The card has words for each one.
    for (const s of STAGES) {
      expect(s.name.length).toBeGreaterThan(3);
      expect(s.news.length).toBeGreaterThan(20);
    }
  });

  it.each(stages)('stage %i: the free bay and the bays a car may leave are only in the open part, the free bay only in the new floor', (stage) => {
    const def = stageDef(stage);
    const sl = stageLot(lot, stage);
    expect(sl.candidates.length).toBeGreaterThan(8);
    const inside = (id: number) => !lot.bays[id].garage || (def.open.garage && def.open.levels.includes(lot.bays[id].lvl));
    for (const id of sl.eligible) expect(inside(id), `eligible ${id}`).toBe(true);
    for (const id of sl.candidates) {
      expect(sl.eligible).toContain(id);
      const b = lot.bays[id];
      if (stage === 1) expect(b.garage).toBe(false);
      else if (def.newest !== null) expect(b.garage && b.lvl === def.newest).toBe(true);
    }
    for (let seed = 1; seed <= 30; seed++) {
      const { state, world } = createRound(lot, { seed, bots: [true], stage });
      expect(sl.candidates).toContain(state.target);
      expect(inside(world.lot.bays[state.leaver!.bay].id)).toBe(true);
    }
  });

  it('is cached, and the whole-site default (no stage) is untouched', () => {
    expect(stageLot(lot, 3)).toBe(stageLot(lot, 3));
    expect(createRound(lot, { seed: 1, bots: [true] }).world.lot).toBe(lot);
    expect(lot.closures.every((c) => !('closed' in c))).toBe(true);
    expect(lot.graph.edges.some((e) => e.closed)).toBe(false);
  });
});

describe('the closed parts are closed', () => {
  it.each(stages)('stage %i: no route, no search pass and no reachable edge leads into a shut part', (stage) => {
    const def = stageDef(stage);
    const sl = stageLot(lot, stage);
    const okLevel = (l: number) => def.open.garage && def.open.levels.includes(l);
    const g = sl.graph;
    const reach = new Set([...reachableFrom(g, lot.entryNode)]);
    for (const e of g.edges) {
      const a = lot.aisles[e.aisle];
      const shut = (a.name === 'GATE' && !def.open.garage) || (a.garage && a.nodes.some((n) => !okLevel(g.nodes[n].lvl)));
      expect(!!e.closed, `${a.name}`).toBe(shut);
      if (e.closed) expect(reach.has(e.id), `${a.name} reachable`).toBe(false);
    }
    const car = createRound(lot, { seed: 1, bots: [true], stage }).state.cars[0];
    for (const sw of planSweeps(sl, car, 1)) expect(g.edges.filter((e) => e.aisle === sw.aisle).every((e) => !e.closed), `sweep on ${sl.aisles[sw.aisle].name}`).toBe(true);
    // The open lot's roads are all open.
    for (const e of g.edges) if (!lot.aisles[e.aisle].garage && lot.aisles[e.aisle].name !== 'GATE') expect(e.closed).toBeFalsy();
  });

  it('has a solid barrier at every way in that a stage keeps shut, and none where it is open', () => {
    for (const stage of stages) {
      const sl = stageLot(lot, stage);
      const open = stageDef(stage).open;
      for (const c of lot.closures) expect(sl.solids.includes(c.solid), `${c.id} in stage ${stage}`).toBe(isShut(c, open));
    }
    expect(lot.closures.map((c) => c.id).sort()).toEqual(['door', 'down', 'up1', 'up2']);
  });

  /** A car at full throttle straight at each shut way in: it never gets through (x stays short of the barrier), however long it tries. */
  it.each([1, 2, 3, 4])('stage %i: a car driven at every shut barrier stays on the near side', (stage) => {
    const open = stageDef(stage).open;
    for (const c of lot.closures.filter((x) => isShut(x, open))) {
      const { state, world } = createRound(lot, { seed: 2, bots: [false], stage });
      const car = state.cars[0];
      Object.assign(car, { x: c.x - 14, z: c.z, y: levelY(c.lvl), h: Math.PI / 2, vx: 0, vz: 0 });
      state.phase = 'race';
      state.gate.open = 1;
      let far = -Infinity;
      for (let i = 0; i < 60 * 8; i++) {
        step(state, world, [press({ throttle: 1 })]);
        far = Math.max(far, car.x);
      }
      expect(far, `${c.id}`).toBeLessThan(c.x);
      expect(levelOf(car.y)).toBe(c.lvl);
    }
  });

  it('opens the way once the stage allows it: the same drive goes through where the barrier is gone', () => {
    const c = lot.closures.find((x) => x.id === 'door')!;
    const { state, world } = createRound(lot, { seed: 2, bots: [false], stage: 2 });
    const car = state.cars[0];
    Object.assign(car, { x: c.x - 14, z: c.z, y: 0, h: Math.PI / 2 });
    state.phase = 'race';
    for (let i = 0; i < 60 * 4; i++) step(state, world, [press({ throttle: 1 })]);
    expect(car.x).toBeGreaterThan(GX0 + 3);
  });

  it('has no shoppers on a floor that is shut, and the shoppers outdoors in every stage', () => {
    for (const stage of stages) {
      const open = stageDef(stage).open;
      const { state } = createRound(lot, { seed: 4, bots: [false], stage });
      for (const p of state.peds) {
        const level = levelOf(p.y);
        const outdoors = p.x < GX0 - 1;
        expect(outdoors || (open.garage && open.levels.includes(level)), `ped at ${p.x.toFixed(0)}, level ${level}`).toBe(true);
      }
      expect(state.peds.filter((p) => p.x < GX0 - 1).length).toBeGreaterThan(15);
    }
  });
});

describe('the board in a stage', () => {
  it('tells you the car park from the start in stages 2 to 5 and flickers only between decks that are open', () => {
    for (const stage of [2, 3, 4, 5]) {
      const { state, world } = createRound(lot, { seed: 5, bots: [true], stage });
      state.clock = 1;
      expect(hintOf(state, world.lot).zone, `stage ${stage}`).toBe('garage');
      state.clock = 40;
      const h = hintOf(state, world.lot);
      const open = stageDef(stage).open.levels;
      if (stage === 2) expect(h.decks).toEqual([]);
      else {
        expect(h.decks).toHaveLength(2);
        expect(h.decks).toContain(lot.bays[state.target].lvl);
        for (const d of h.decks) expect(open).toContain(d);
      }
    }
  });
  it('stays quiet at first in stage 1 (the open lot): only the count, then the part of the site at 12 s', () => {
    const { state, world } = createRound(lot, { seed: 5, bots: [true], stage: 1 });
    state.clock = 3;
    expect(hintOf(state, world.lot).stage).toBe(0);
    state.clock = 13;
    expect(hintOf(state, world.lot).zone).toBe('lot');
  });
});

describe('bots in every stage', () => {
  /** The bots drive at 20 to 27 km/h now: the quickest stage is about a minute, the longest (the roof) takes them up to three minutes (measured over 24 seeds: the slowest of 144 rounds took 187 s). */
  const LIMIT = 200;
  const where = (stage: number, id: number) => `stage ${stage}, bay ${id} on ${lot.bays[id].garage ? 'P' + lot.bays[id].lvl : 'the open lot'}`;
  describe.each(stages)('stage %i', (stage) => {
    it.each(Array.from({ length: 12 }, (_, i) => i + 1))('park within the limit, and never leave the open part (seed %i)', (seed) => {
      const { state, world } = createRound(lot, { seed, stage, bots: [true, true, true, true], maxTime: LIMIT });
      const open = stageDef(stage).open;
      const brains = state.cars.map((c) => createBrain(world, c, seed));
      for (let i = 0; i < 60 * LIMIT && state.phase !== 'done'; i++) {
        step(state, world, state.cars.map((c) => botInput(state, world, c, brains[c.id])));
        radio(state, [...state.events, ...brains.flatMap((b) => b.outbox.splice(0))]);
        if (i % 30 === 0) {
          for (const c of state.cars) {
            const inGarage = c.x > GX0;
            if (!open.garage) expect(inGarage, `car ${c.id} at ${c.x.toFixed(0)}`).toBe(false);
            else if (inGarage) expect(open.levels, `car ${c.id} on level ${levelOf(c.y)}`).toContain(levelOf(c.y));
          }
        }
      }
      expect(state.winner, where(stage, state.target)).not.toBeNull();
      expect(state.clock).toBeLessThan(LIMIT);
    }, 60000);
  });

  it.each([1, 2, 3, 4, 5, 6])('a bot never heads for the bay before it has spotted it (stage %i)', (stage) => {
    for (const seed of [3, 8]) {
      const { state, world } = createRound(lot, { seed, stage, bots: [true, true, true, true], maxTime: LIMIT });
      const brains = state.cars.map((c) => createBrain(world, c, seed));
      const approaches = (id: number) => lot.bays[id].approach.flatMap((ap) => ap.tail);
      for (let i = 0; i < 60 * LIMIT && state.phase !== 'done'; i++) {
        step(state, world, state.cars.map((c) => botInput(state, world, c, brains[c.id])));
        for (const b of brains) {
          for (const e of b.outbox.splice(0)) if (e.type === 'spot') expect(e.dist).toBeLessThanOrEqual(SIGHT.notice + 0.01);
          if (!b.spotted) {
            expect(b.target).toBe(-1);
            for (const id of [state.target, state.extra].filter((x) => x >= 0)) for (const pt of approaches(id)) expect(b.route.some((r) => r.x === pt.x && r.z === pt.z)).toBe(false);
          }
        }
      }
    }
  }, 120000);
});

describe('progress through the stages', () => {
  it('starts every session at stage 1 with only stage 1 unlocked (nothing is saved between visits)', () => {
    expect(newProgress()).toEqual({ current: 1, unlocked: 1 });
    expect(hasNext(newProgress())).toBe(false);
    expect(next(newProgress())).toEqual({ current: 1, unlocked: 1 });
  });

  it('unlocks the next stage when you win, and Next stage moves to it', () => {
    let p = won(newProgress());
    expect(p).toEqual({ current: 1, unlocked: 2 });
    expect(hasNext(p)).toBe(true);
    p = next(p);
    expect(p).toEqual({ current: 2, unlocked: 2 });
    p = next(won(p));
    expect(p).toEqual({ current: 3, unlocked: 3 });
  });

  it('keeps the highest unlock when you replay an earlier stage, and never opens a locked stage', () => {
    let p = { current: 1, unlocked: 1 };
    for (let i = 0; i < 3; i++) p = next(won(p));
    expect(p).toEqual({ current: 4, unlocked: 4 });
    p = pick(p, 2);
    expect(p).toEqual({ current: 2, unlocked: 4 });
    expect(won(p).unlocked).toBe(4);
    expect(pick(p, 5)).toEqual(p);
    expect(pick(p, 0)).toEqual(p);
    expect(pick(p, 4).current).toBe(4);
  });

  it('losing changes nothing (retry), and the last stage has no next', () => {
    const p = { current: 3, unlocked: 3 };
    expect(pick(p, p.current)).toEqual(p);
    let q = newProgress();
    for (let i = 0; i < 10; i++) q = next(won(q));
    expect(q).toEqual({ current: STAGE_COUNT, unlocked: STAGE_COUNT });
    expect(hasNext(q)).toBe(false);
    expect(won(q).unlocked).toBe(STAGE_COUNT);
  });
});
