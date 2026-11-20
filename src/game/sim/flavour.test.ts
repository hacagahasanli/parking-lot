import { COPY } from './flavour';
import { buildLot } from './lot';
import { radio } from './radio';
import { createRound } from './step';

/** Words that would betray a developer joke. */
const OFFICE_WORDS = /\b(merge|merged|commit|git|deploy|deploying|pull request|code|review|sprint|backlog|ticket|release|rollback|rolled back|revert|rebas|build|bug|prod|production|hotfix|staging|legacy|changelog|unit test|stand-?up|lgtm|main|ship|shipped|shipping|push|force|critical path|race condition|hot desk|company|insurance)\b/i;

describe('the neutral copy (portal builds)', () => {
  const all = (f: keyof typeof COPY) => [...COPY[f].rivals, ...COPY[f].plates, ...COPY[f].shops, ...Object.values(COPY[f].radio).flat()];

  it('has no developer, git or office jokes', () => {
    for (const text of all('neutral')) expect(text, text).not.toMatch(OFFICE_WORDS);
    // The word list does catch the studio copy, so the test above is not passing by accident.
    expect(all('studio').filter((t) => OFFICE_WORDS.test(t)).length).toBeGreaterThan(20);
  });

  it('has lines for every radio moment the studio copy has, and five plates', () => {
    expect(Object.keys(COPY.neutral.radio).sort()).toEqual(Object.keys(COPY.studio.radio).sort());
    for (const lines of Object.values(COPY.neutral.radio)) expect(lines.length).toBeGreaterThanOrEqual(3);
    expect(COPY.neutral.plates).toHaveLength(5);
  });

  it('names the rivals and speaks over the radio in the round\'s flavour', () => {
    const lot = buildLot();
    const { state } = createRound(lot, { seed: 2, bots: [false, true, true, true], flavour: 'neutral' });
    expect(state.cars.map((c) => c.name)).toEqual(['You', ...COPY.neutral.rivals]);
    state.t = 10;
    radio(state, [{ type: 'spot', car: 1, bay: state.target, dist: 10 }]);
    expect(state.chat).toHaveLength(1);
    expect(COPY.neutral.radio.spot).toContain(state.chat[0].text);
    const studio = createRound(lot, { seed: 2, bots: [false, true, true, true] }).state;
    expect(studio.cars[1].name).toBe('Staging');
  });
});
