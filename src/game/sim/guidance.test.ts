import { CAMPAIGN, RACES, levelById, starsFor } from './campaign';
import { GUIDE, autoPulseDue, hintDelay, markOpacity, pulseOn } from './guidance';

describe('calm guidance', () => {
  it('shows the ground marking only from close by, and only on the same deck', () => {
    expect(markOpacity(5, 0)).toBe(1);
    expect(markOpacity(GUIDE.near, 0)).toBe(1);
    expect(markOpacity(13, 0)).toBeGreaterThan(0);
    expect(markOpacity(13, 0)).toBeLessThan(1);
    expect(markOpacity(GUIDE.fadeTo, 0)).toBe(0);
    expect(markOpacity(40, 0)).toBe(0);
    expect(markOpacity(3, 3.2)).toBe(0);
  });

  it('waits longer before the first pulse in later chapters and later races (12 s first, 18 to 25 s late)', () => {
    const first = hintDelay(CAMPAIGN[0]);
    const last = hintDelay(CAMPAIGN[CAMPAIGN.length - 1]);
    expect(first).toBe(12);
    expect(last).toBeGreaterThanOrEqual(18);
    expect(last).toBeLessThanOrEqual(25);
    for (let i = 1; i < CAMPAIGN.length; i++) expect(hintDelay(CAMPAIGN[i]), CAMPAIGN[i].id).toBeGreaterThanOrEqual(hintDelay(CAMPAIGN[i - 1]));
    expect(hintDelay(RACES[0])).toBe(12);
    expect(hintDelay(RACES[RACES.length - 1])).toBeGreaterThanOrEqual(18);
    expect(hintDelay(null)).toBe(GUIDE.endless);
  });

  it('pulses at the delay, then again every repeat, and never once the bay is found', () => {
    expect(autoPulseDue(11.9, 12, 0, false)).toBe(false);
    expect(autoPulseDue(12, 12, 0, false)).toBe(true);
    expect(autoPulseDue(15, 12, 1, false)).toBe(false);
    expect(autoPulseDue(12 + GUIDE.repeat, 12, 1, false)).toBe(true);
    expect(autoPulseDue(30, 12, 0, true)).toBe(false);
  });

  it('a pulse shows for three seconds', () => {
    expect(GUIDE.pulse).toBe(3);
    expect(pulseOn(5, null)).toBe(false);
    expect(pulseOn(5, 5)).toBe(true);
    expect(pulseOn(7.9, 5)).toBe(true);
    expect(pulseOn(8, 5)).toBe(false);
  });

  it('a hint costs one star, but a finished run keeps at least one', () => {
    const l = levelById('first-bay')!;
    const run = { finished: true, time: l.par - 1, grazes: 0, precision: 95 };
    expect(starsFor(l, run)).toBe(3);
    expect(starsFor(l, { ...run, hinted: true })).toBe(2);
    expect(starsFor(l, { ...run, time: l.limit - 1, grazes: 2, hinted: true })).toBe(1);
    expect(starsFor(l, { ...run, finished: false, hinted: true })).toBe(0);
    expect(starsFor(RACES[0], { finished: true, time: 10, grazes: 0, precision: 100, hinted: true })).toBe(2);
  });
});
