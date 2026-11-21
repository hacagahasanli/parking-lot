/**
 * Scripted drivers for the levels a bot cannot do (backing in, parallel bays, forward into a kerbside bay): what a careful
 * player does, as closed-loop manoeuvres with a few tuned numbers per level. The tests use them to prove those levels can be
 * finished inside their limits, and the browser checks replay the inputs they produce (`tapeFor`) through the real game.
 * Not used by the game itself.
 */
import { createRound, forwardSpeed, step } from './step';

import type { LevelDef } from './campaign';
import type { Lot } from './lot';
import type { Input } from './types';

const wrap = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));
const clamp = (v: number, a = -1, b = 1) => Math.max(a, Math.min(b, v));
const I = (t: number, b: number, s: number): Input => ({ throttle: t, brake: b, steer: clamp(s), handbrake: false, horn: false });

/** Back in: drive past the bay, reverse on lock until nearly square, then reverse straightening onto the bay's centre line. */
export interface BackIn {
  kind: 'backIn';
  past: number;
  lock: number;
  swing: number;
  turnTo: number;
  k: number;
  depth: number;
  gas: number;
}
/** Parallel: pull up level past the bay, reverse on full lock towards the kerb, the other lock until straight, then centre. */
export interface Parallel {
  kind: 'parallel';
  D: number;
  lane: number;
  th: number;
  gas: number;
  trim: number;
}
/** Held inputs for a time ('F' forward, 'S' stop against the motion). */
export interface Segments {
  kind: 'segments';
  segs: { g: 'F' | 'S'; steer: number; t: number }[];
}
export type Script = BackIn | Parallel | Segments;

export const SCRIPTS: Record<string, Script> = {
  'back-in': { kind: 'backIn', past: 2.9274351007883768, lock: 0.8850935390983647, swing: -0.033626947087225426, turnTo: 0.15628138235703304, k: 1.1801500986363693, depth: -0.4801156555210239, gas: 0.5114751845761314 },
  'column-reverse': { kind: 'backIn', past: 5.478789938514473, lock: -0.795460749820893, swing: -0.08586819295990109, turnTo: 0.02, k: -0.004152445109908032, depth: -0.2064874722137247, gas: 0.41779471252644973 },
  'last-space': { kind: 'backIn', past: 1.777049232014274, lock: 0.6693404273050515, swing: -0.22891943907158724, turnTo: 0.04139315478881223, k: 1.8176671527886277, depth: -0.5001134098075986, gas: 0.4992041580133223 },
  parallel: { kind: 'parallel', D: 6.331741775913403, lane: 4.304487594947341, th: 0.8733622744630339, gas: 0.5038511414927992, trim: 0.8875889558020889 },
  'parallel-pressure': { kind: 'parallel', D: 6.33, lane: 4.3, th: 0.873, gas: 0.504, trim: 0.888 },
  kerbside: {
    kind: 'segments',
    segs: [
      { g: 'F', steer: 1.059427762031555, t: 2.1292921781539915 },
      { g: 'F', steer: -0.4608800411224365, t: 1.7845240116119385 },
      { g: 'S', steer: -0.023530340194702126, t: 1 },
    ],
  },
};

/** Drives `level` with its script from a fresh round (seed 3); returns the round and the inputs it pressed, step by step. */
export const driveScript = (lot: Lot, level: LevelDef, script: Script, seed = 3) => {
  const { state, world } = createRound(lot, { seed, bots: [false], level });
  const me = state.cars[0];
  const tape: Input[] = [];
  const push = (i: Input) => {
    step(state, world, [i]);
    tape.push(i);
  };
  const live = () => state.phase !== 'done' && me.dq === null;
  const stop = (steer = 0) => {
    for (let k = 0; k < 150 && live(); k++) {
      const v = forwardSpeed(me);
      if (Math.abs(v) < 0.03 && k > 1) break;
      push(I(v < 0 ? 1 : 0, v > 0 ? 1 : 0, steer));
    }
  };
  // The countdown first (the car holds on the brake until GO).
  while (state.phase === 'countdown') push({ throttle: 0, brake: 0, steer: 0, handbrake: false, horn: false });
  const lim = 60 * 40;
  const bay = state.target >= 0 ? world.lot.bays[state.target] : null;
  if (script.kind === 'segments') {
    for (const s of script.segs) {
      if (s.g === 'S') stop(s.steer);
      else for (let k = 0; k < s.t * 60 && live(); k++) push(I(0.6, 0, s.steer));
    }
  } else if (bay) {
    const want = level.facing === 'tail' ? bay.h + Math.PI : bay.h;
    const fx = Math.sin(bay.h);
    const fz = Math.cos(bay.h);
    const along = () => (me.x - bay.x) * fx + (me.z - bay.z) * fz;
    const across = () => (me.x - bay.x) * fz - (me.z - bay.z) * fx;
    let n = 0;
    if (script.kind === 'backIn') {
      const p = script;
      const h0 = me.h;
      const pastOf = () => (me.x - bay.x) * Math.sin(h0) + (me.z - bay.z) * Math.cos(h0);
      while (pastOf() < p.past && n++ < lim && live()) push(I(p.gas, 0, (pastOf() > p.past - 6 ? p.swing : 0) - wrap(me.h - h0) * 2));
      stop();
      n = 0;
      while (Math.abs(wrap(me.h - want)) > p.turnTo && n++ < lim && live()) push(I(0, p.gas * 0.8, p.lock));
      n = 0;
      const sgn = level.facing === 'tail' ? -1 : 1;
      while (n++ < lim && live() && along() <= p.depth) push(I(0, 0.45, wrap(me.h - want) * 2.5 - across() * p.k * sgn));
      stop();
    } else {
      const p = script;
      const side = Math.sign(across());
      while (along() < p.D && n++ < lim && live()) push(I(p.gas, 0, -wrap(me.h - want) * 3 + (across() - side * p.lane) * 0.6 * side));
      stop();
      n = 0;
      while (Math.abs(wrap(me.h - want)) < Math.abs(p.th) && n++ < lim && live()) push(I(0, p.gas * 0.7, Math.sign(p.th) * side));
      n = 0;
      while (Math.abs(wrap(me.h - want)) > 0.02 && n++ < lim && live()) push(I(0, p.gas * 0.7, -Math.sign(p.th) * side * p.trim));
      stop();
      for (let rep = 0; rep < 3 && live(); rep++) {
        const d = along();
        if (Math.abs(d) < 0.12) break;
        n = 0;
        if (d < 0) while (along() < 0 && n++ < 300 && live()) push(I(0.25, 0, -wrap(me.h - want) * 3));
        else while (along() > 0 && n++ < 300 && live()) push(I(0, 0.25, wrap(me.h - want) * 3));
        stop();
      }
    }
  }
  for (let k = 0; k < 90 && state.phase !== 'done'; k++) push({ throttle: 0, brake: 0, steer: 0, handbrake: true, horn: false });
  return { state, world, tape };
};
