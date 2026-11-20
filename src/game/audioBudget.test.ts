import { readFileSync } from 'fs';
import path from 'path';

import { BUDGET, MIX, createGate } from './audioBudget';

const sfxSource = readFileSync(path.resolve(__dirname, 'sfx.ts'), 'utf8');

describe('sound budget', () => {
  it('every one-shot in sfx.ts asks the gate, and every gated name has a budget row', () => {
    const asked = [...sfxSource.matchAll(/\b(?:may|cue)\('(\w+)'\)/g)].map((m) => m[1]);
    for (const name of asked) expect(BUDGET).toHaveProperty(name);
    // The one-shots of the Sfx interface (engines, listener and settings are not one-shots).
    for (const name of ['bump', 'alarm', 'shout', 'toot', 'beep', 'win', 'lose', 'found', 'sting', 'whoosh', 'tick', 'click', 'shift', 'grind', 'ui']) expect(asked).toContain(name);
  });

  it('every row has a cooldown or a voice cap of one, and a length', () => {
    for (const [name, b] of Object.entries(BUDGET)) {
      expect(b.maxVoices, name).toBeGreaterThanOrEqual(1);
      expect(b.maxVoices, name).toBeLessThanOrEqual(3);
      expect(b.lengthMs, name).toBeGreaterThan(0);
      expect(b.cooldownMs > 0 || b.maxVoices === 1, name).toBe(true);
    }
  });

  it('gear shifts hammered every 20 ms for a second play at most 10 times', () => {
    const g = createGate();
    let n = 0;
    for (let t = 0; t < 1000; t += 20) if (g.allow('shift', t)) n++;
    expect(n).toBeLessThanOrEqual(10);
    expect(g.stats().shift.dropped).toBeGreaterThan(0);
  });

  it('a refused shift grinds at most twice a second', () => {
    const g = createGate();
    let n = 0;
    for (let t = 0; t < 2000; t += 50) if (g.allow('grind', t)) n++;
    expect(n).toBeLessThanOrEqual(3);
  });

  it('a pile-up never sounds more than three bumps at once', () => {
    const g = createGate();
    let worst = 0;
    for (let t = 0; t < 2000; t += 10) {
      g.allow('bump', t);
      worst = Math.max(worst, g.active('bump', t));
    }
    expect(worst).toBeLessThanOrEqual(3);
  });

  it('only one car alarm sounds at a time', () => {
    const g = createGate();
    expect(g.allow('alarm', 0)).toBe(true);
    expect(g.allow('alarm', 1000)).toBe(false);
    expect(g.allow('alarm', BUDGET.alarm.lengthMs + 1)).toBe(true);
  });

  it('the ambience bed is quiet and the menu world is trimmed', () => {
    // -37 dB into the bus; with the bus, sliders and filter the bed lands near -60 dBFS.
    expect(20 * Math.log10(MIX.bed)).toBeLessThan(-30);
    expect(MIX.menuWorld).toBeLessThan(0.5);
  });

  it('race cues are race-only: the countdown, ticks, jingles and gearbox go through cue()', () => {
    for (const name of ['beep', 'tick', 'win', 'lose', 'found', 'sting', 'shift', 'grind']) expect(sfxSource).toMatch(new RegExp(`cue\\('${name}'\\)`));
  });
});
