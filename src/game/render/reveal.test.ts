import { REVEAL, revealOf } from './reveal';

describe('the free bay reveals itself only up close', () => {
  it('is invisible from far away and on another deck', () => {
    expect(revealOf(40, 0, false)).toEqual({ paint: 0, found: false });
    expect(revealOf(REVEAL.far + 0.1, 0, false).paint).toBe(0);
    expect(revealOf(3, 3.1, false)).toEqual({ paint: 0, found: false });
  });

  it('fades in on the way, and is found within the near distance', () => {
    const mid = revealOf((REVEAL.far + REVEAL.near) / 2, 0, false);
    expect(mid.paint).toBeGreaterThan(0);
    expect(mid.paint).toBeLessThan(1);
    expect(mid.found).toBe(false);
    expect(revealOf(REVEAL.near, 0, false)).toEqual({ paint: 1, found: true });
  });

  it('stays lit once found, wherever you go', () => {
    expect(revealOf(80, 6, true)).toEqual({ paint: 1, found: true });
  });

  it('is closer than the distance a bot notices a bay from, so nothing is given away early', () => {
    expect(REVEAL.near).toBeLessThan(18);
  });
});
