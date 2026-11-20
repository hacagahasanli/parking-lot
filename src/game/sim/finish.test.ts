/**
 * Bots finish their rounds. With the two-minute cap, rounds in the deep stages used to end "Out of time" (stage 4 in about two
 * rounds out of three) because every bot that spotted a car-park bay was already past the start of its swing in and planned a
 * whole lap of the deck to come back to it, searched decks the stage card had ruled out, and crawled the long way up at
 * search pace. These play headless rounds (four bots, no player input) and check that someone parks inside the cap, but not
 * in the first seconds, so a player still has a round to win.
 */
import { botInput, createBrain, JOIN_AHEAD, PACE, toldDeck } from './bot';
import { RACE } from './constants';
import { buildLot } from './lot';
import { routeLength } from './nav';
import { roundCap, stageDef, stageLot } from './stages';
import { createRound, step } from './step';
import { SIGHT } from './visibility';

const lot = buildLot();
const idle = { throttle: 0, brake: 0, steer: 0, handbrake: false, horn: false };

/** Plays a round with bots in every seat; returns when the first car parked (Infinity: nobody did) and the spot routes. */
const play = (stage: number, seed: number, bots = 4, maxTime?: number) => {
  const { state, world } = createRound(lot, { seed, stage, bots: Array(bots).fill(true), maxTime });
  const brains = state.cars.map((c) => createBrain(world, c, seed));
  const spotRoutes: number[] = [];
  while (state.phase !== 'done') {
    const inputs = state.cars.map((c) => botInput(state, world, c, brains[c.id]));
    for (const b of brains) for (const e of b.outbox.splice(0)) if (e.type === 'spot') spotRoutes.push(routeLength(b.route));
    step(state, world, inputs);
  }
  return { first: Math.min(...state.cars.map((c) => c.parkedAt ?? Infinity)), state, spotRoutes };
};

describe('bots finish rounds in the deep stages', () => {
  // Seeds 1-8 of each stage, plus the seeds that used to run out of time for a reason of their own (stage 4 seed 13: a car
  // rocking on the bay line; stage 5 and 6 seed 9: the car pulling out of P-1 drove into the parked row and plugged the aisle).
  const rounds = [4, 5, 6].flatMap((stage) => [1, 2, 3, 4, 5, 6, 7, 8].map((seed) => [stage, seed]));
  rounds.push([4, 13], [5, 9], [6, 9]);

  it.each(rounds)('stage %i seed %i: a bot parks inside the cap, and not straight away', async (stage, seed) => {
    const { first, state } = play(stage, seed);
    expect(first, `bay ${state.target} (deck ${lot.bays[state.target].lvl})`).toBeLessThan(roundCap(stage) - 5);
    expect(first).toBeGreaterThan(20);
    await new Promise((r) => setTimeout(r, 0));
  }, 30000);
});

describe('a bot that spots the bay goes straight in', () => {
  it('notices a bay early enough to swing in from the far side, without being able to see through floors', () => {
    expect(SIGHT.notice).toBeGreaterThan(SIGHT.range);
    expect(SIGHT.notice).toBeLessThanOrEqual(20);
    expect(JOIN_AHEAD).toBeGreaterThanOrEqual(4);
  });

  it.each([2, 3, 5])('in the car park (stage %i) the way from spotting to the bay is short, not a lap of the deck', (stage) => {
    for (const seed of [1, 2, 3]) {
      // One bot alone, at the stage's slow early pace: give it the two minutes (the stage cap is for a race of four).
      const { spotRoutes, first } = play(stage, seed, 1, RACE.maxTime);
      expect(spotRoutes.length).toBeGreaterThan(0);
      // A deck is a one-way ring about 110 m round; going round again was the old way.
      expect(spotRoutes[0]).toBeLessThan(40);
      expect(first).toBeLessThan(RACE.maxTime);
    }
  }, 60000);
});

describe('bots take in what the stage card says', () => {
  it.each([2, 3, 4, 5])('stage %i: from GO they search the deck that has just opened first', (stage) => {
    const newest = stageDef(stage).newest!;
    expect(toldDeck(stageLot(lot, stage))).toBe(newest);
    const { state, world } = createRound(lot, { seed: 4, stage, bots: [true, true, true, true] });
    const brains = state.cars.map((c) => createBrain(world, c, 4));
    // Past the countdown and every driver's pull-away delay (a driver reads the board when it sets off).
    const setOff = Math.max(...brains.map((b) => b.launch)) + 0.1;
    while (state.phase === 'countdown' || state.clock < setOff) step(state, world, state.cars.map(() => idle));
    for (const c of state.cars) {
      botInput(state, world, c, brains[c.id]);
      const sw = brains[c.id].sweeps[0];
      const a = world.lot.aisles[sw.aisle];
      expect(a.garage).toBe(true);
      expect(world.lot.graph.nodes[a.nodes[0]].lvl).toBe(newest);
    }
  });

  it('never names a deck in the open lot or the whole site', () => {
    expect(toldDeck(stageLot(lot, 1))).toBeNull();
    expect(toldDeck(stageLot(lot, 6))).toBeNull();
    expect(toldDeck(lot)).toBeNull();
  });

  it('only sweeps aisles that have a bay, and drives briskly between them', () => {
    const sl = stageLot(lot, 6);
    const { state, world } = createRound(lot, { seed: 2, stage: 6, bots: [true] });
    const holds = new Set(sl.eligible.map((id) => sl.bays[id].aisle));
    for (const sw of createBrain(world, state.cars[0], 2).sweeps) expect(holds.has(sw.aisle)).toBe(true);
    expect(PACE.transit).toBeGreaterThan(PACE.search);
    expect(PACE.lateral).toBeLessThan(6);
  });
});

describe('the car that pulls out', () => {
  it('drives out of a nose-out bay on a deck along the aisle in front of it, not through the parked row', () => {
    // Bay 265 on P-1 is square to its aisle; the car used to be put on the lane behind the row and sat against a parked car.
    const { state, world } = createRound(lot, { seed: 9, stage: 5, bots: [false], maxTime: 200 });
    const l = state.leaver!;
    expect(l.bay).toBe(265);
    while (state.phase !== 'done' && l.phase !== 'gone') step(state, world, [idle]);
    expect(l.phase).toBe('gone');
    // It reached the exit (the give-up timer is 150 s).
    expect(l.t).toBeLessThan(140);
  });
});
