import { CAP, complete, createProgress, finish, fraction, percent, reach, tick } from './loadProgress';

import type { LoadProgress } from './loadProgress';

/** Run the model for `s` seconds at 60 fps, checking on every frame that it never goes backwards; returns the last state. */
const run = (p: LoadProgress, s: number, seen: number[] = []) => {
  let q = p;
  for (let i = 0; i < Math.round(s * 60); i++) {
    const before = q.shown;
    q = tick(q, 1 / 60);
    expect(q.shown).toBeGreaterThanOrEqual(before);
    // The number and the bar are one value: the number is the bar's whole percent, and the bar is full only at 100.
    expect(percent(q)).toBe(Math.floor(fraction(q) * 100 + 1e-9));
    expect(fraction(q) === 1).toBe(percent(q) === 100);
    seen.push(percent(q));
  }
  return q;
};

describe('the loading bar', () => {
  it('starts at 0 and stands still with no checkpoint', () => {
    const p = run(createProgress(), 3);
    expect(percent(p)).toBe(0);
  });

  it('eases up to a checkpoint (not a jump) and gets there within a second', () => {
    const p = reach(createProgress(), 0.4);
    const one = tick(p, 1 / 60);
    expect(percent(one)).toBeGreaterThan(0);
    expect(percent(one)).toBeLessThan(40);
    expect(percent(run(p, 1))).toBeGreaterThanOrEqual(39);
  });

  it('creeps between checkpoints only part of the way to the next one, never past it', () => {
    const p = run(reach(createProgress(), 0.3, 0.8), 60);
    expect(p.shown).toBeGreaterThan(0.3);
    expect(p.shown).toBeLessThanOrEqual(0.3 + (0.8 - 0.3) * 0.5 + 1e-9);
    // With no next checkpoint given it does not creep at all.
    const q = run(reach(createProgress(), 0.3), 60);
    expect(q.shown).toBeLessThanOrEqual(0.3 + 0.02);
  });

  it('never goes backwards, even when a lower checkpoint arrives late', () => {
    let p = run(reach(createProgress(), 0.8), 2);
    const at = p.shown;
    p = reach(p, 0.3, 0.5);
    p = run(p, 2);
    expect(p.shown).toBeGreaterThanOrEqual(at);
    expect(p.reached).toBe(0.8);
  });

  it('never reads 100 while still working: capped at 99 even when told 100', () => {
    const seen: number[] = [];
    const p = run(reach(createProgress(), 1, 1), 30, seen);
    expect(Math.max(...seen)).toBe(99);
    expect(p.shown).toBeLessThanOrEqual(CAP);
    expect(complete(p)).toBe(false);
  });

  it('runs to 100 quickly once ready, and only then is complete', () => {
    let p = run(reach(createProgress(), 0.95), 1);
    expect(complete(p)).toBe(false);
    p = finish(p);
    const seen: number[] = [];
    p = run(p, 0.6, seen);
    expect(percent(p)).toBe(100);
    expect(complete(p)).toBe(true);
    // 100 shows only at the very end: every earlier frame read less.
    expect(seen.indexOf(100)).toBe(seen.length - seen.filter((v) => v === 100).length);
  });

  it('a whole load: the number only climbs, every frame, from 0 to 100', () => {
    const seen: number[] = [];
    let p = createProgress();
    p = run(p, 0.2, seen);
    p = reach(p, 0.3, 0.85);
    p = run(p, 1.5, seen);
    p = reach(p, 0.85, 0.95);
    p = run(p, 0.4, seen);
    p = reach(p, 0.95);
    p = run(p, 0.3, seen);
    p = finish(p);
    p = run(p, 1, seen);
    for (let i = 1; i < seen.length; i++) expect(seen[i]).toBeGreaterThanOrEqual(seen[i - 1]);
    expect(seen.at(-1)).toBe(100);
  });

  it('ignores checkpoints after it is finished', () => {
    const p = finish(createProgress());
    expect(reach(p, 0.5)).toBe(p);
  });
});
