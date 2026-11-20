/**
 * Portal pacing: a round is capped at two minutes, stage 1's free bay is near the entry and its bots are less hurried, the
 * board gives things away sooner in the early stages, and the bonus hint's circle always holds the bay.
 */
import { botInput, createBrain } from './bot';
import { RACE } from './constants';
import { HINT, HINT_AREA_R, hintArea, hintLines, hintOf, hintTimes, sideOf } from './hint';
import { buildLot } from './lot';
import { botPace, STAGE1_NEAR, stageLot } from './stages';
import { createRound, step } from './step';

const lot = buildLot();
const entry = lot.graph.nodes[lot.entryNode];

describe('the round cap', () => {
  it('is two minutes from GO, and nobody wins when it runs out', () => {
    expect(RACE.maxTime).toBe(120);
    const { state, world } = createRound(lot, { seed: 3, bots: [false], stage: 1 });
    expect(state.maxTime).toBe(120);
    const idle = { throttle: 0, brake: 0, steer: 0, handbrake: false, horn: false };
    for (let i = 0; i < 60 * (RACE.countdown + 121) && state.phase !== 'done'; i++) step(state, world, [idle]);
    expect(state.phase).toBe('done');
    expect(state.winner).toBeNull();
    expect(state.clock).toBeGreaterThanOrEqual(120);
    expect(state.clock).toBeLessThan(120.1);
  });

  it('can be raised for a test that measures a long search', () => {
    expect(createRound(lot, { seed: 1, bots: [true], maxTime: 200 }).state.maxTime).toBe(200);
  });
});

describe('stage 1: the bay near the start', () => {
  const sl = stageLot(lot, 1);

  it('only offers outdoor bays within the first two aisles of the entry road', () => {
    expect(sl.candidates.length).toBeGreaterThanOrEqual(10);
    for (const id of sl.candidates) {
      const b = lot.bays[id];
      expect(b.garage).toBe(false);
      expect(Math.hypot(b.x - entry.x, b.z - entry.z)).toBeLessThanOrEqual(STAGE1_NEAR);
    }
    // Both sides of the entry road are used, so the first turn is a real choice.
    expect(new Set(sl.candidates.map((id) => sideOf(lot.bays[id].x, entry.x))).size).toBeGreaterThanOrEqual(2);
  });

  it.each(Array.from({ length: 40 }, (_, i) => i + 1))('puts the free bay near the entry (seed %i)', (seed) => {
    const { state } = createRound(lot, { seed, bots: [false, true, true, true], stage: 1 });
    const b = lot.bays[state.target];
    expect(Math.hypot(b.x - entry.x, b.z - entry.z)).toBeLessThanOrEqual(STAGE1_NEAR);
  });

  it('makes the bots less hurried in stage 1 and 2 only', () => {
    expect(botPace(1).cruise).toBeLessThan(1);
    expect(botPace(1).launch).toBeGreaterThan(0);
    expect(botPace(2).cruise).toBeGreaterThan(botPace(1).cruise);
    for (const s of [3, 4, 5, 6, undefined]) expect(botPace(s)).toEqual({ cruise: 1, launch: 0 });
    const w1 = createRound(lot, { seed: 4, bots: [false, true], stage: 1 });
    const w6 = createRound(lot, { seed: 4, bots: [false, true], stage: 6 });
    const b1 = createBrain(w1.world, w1.state.cars[1], 4);
    const b6 = createBrain(w6.world, w6.state.cars[1], 4);
    expect(b1.cruise).toBeCloseTo(b6.cruise * botPace(1).cruise, 6);
    expect(b1.launch).toBeCloseTo(b6.launch + botPace(1).launch, 6);
  });

  // The bots still finish a stage-1 round well inside the cap, but not in the first few seconds: a new player has a chance.
  it.each(Array.from({ length: 12 }, (_, i) => i + 1))('bots park inside the cap, leaving the player time (seed %i)', (seed) => {
    const { state, world } = createRound(lot, { seed, stage: 1, bots: [true, true, true, true] });
    const brains = state.cars.map((c) => createBrain(world, c, seed));
    while (state.phase !== 'done') step(state, world, state.cars.map((c) => botInput(state, world, c, brains[c.id])));
    expect(state.winner, `bay ${state.target}`).not.toBeNull();
    const first = Math.min(...state.cars.map((c) => c.parkedAt ?? Infinity));
    expect(first).toBeGreaterThan(12);
    expect(first).toBeLessThan(RACE.maxTime);
  }, 30000);
});

describe('the board, by stage', () => {
  it('gives things away sooner in the early stages, and keeps the old timing without a stage', () => {
    expect(hintTimes(undefined)).toEqual({ zoneAt: HINT.zoneAt, deckAt: HINT.deckAt, sideAt: Infinity });
    expect(hintTimes(1).sideAt).toBeLessThanOrEqual(3);
    for (const s of [3, 4, 5]) expect(hintTimes(s).deckAt).toBeLessThan(HINT.deckAt);
    expect(hintTimes(6).zoneAt).toBeLessThan(HINT.zoneAt);
    expect(hintTimes(6).deckAt).toBeLessThan(HINT.deckAt);
  });

  it('in stage 1 names the side of the entry road from two seconds after GO', () => {
    for (let seed = 1; seed <= 20; seed++) {
      const { state, world } = createRound(lot, { seed, bots: [false], stage: 1 });
      state.clock = 1;
      expect(hintOf(state, world.lot).side).toBeNull();
      expect(hintLines(hintOf(state, world.lot))[1]).toBe('');
      state.clock = hintTimes(1).sideAt + 0.1;
      const h = hintOf(state, world.lot);
      const b = lot.bays[state.target];
      expect(h.side).toBe(b.x > entry.x + 3 ? 'left' : b.x < entry.x - 3 ? 'right' : 'ahead');
      expect(hintLines(h)[1]).toMatch(/^(LOOK LEFT|LOOK RIGHT|STRAIGHT AHEAD)$/);
    }
  });

  it('never names a side outside stage 1', () => {
    for (const stage of [2, 3, 6]) {
      const { state, world } = createRound(lot, { seed: 9, bots: [false], stage });
      state.clock = 60;
      expect(hintOf(state, world.lot).side).toBeNull();
    }
  });
});

describe('the bonus hint circle', () => {
  it.each([1, 2, 3, 4, 5, 6])('always holds the free bay without being centred on it (stage %i)', (stage) => {
    for (let seed = 1; seed <= 25; seed++) {
      const { state, world } = createRound(lot, { seed, bots: [false], stage });
      const a = hintArea(state, world.lot);
      const b = lot.bays[state.target];
      const d = Math.hypot(a.x - b.x, a.z - b.z);
      expect(a.r).toBe(HINT_AREA_R);
      expect(d).toBeLessThan(a.r * 0.7);
      expect(d).toBeGreaterThan(a.r * 0.2);
      expect(a.lvl).toBe(b.garage ? b.lvl : 0);
    }
  });
});
