import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';

import { afterEach, describe, expect, it, vi } from 'vitest';

import { resultOf } from '~/components/useTelemetry';
import { flush, loadDone, track } from '~/lib/telemetry';

import type { HudState } from '~/game/render/game';

const root = resolve(__dirname, '../..');

/** Every project file the portal entry can reach through static or dynamic imports. */
const reachable = (entry: string): Map<string, string> => {
  const seen = new Map<string, string>();
  const todo = [entry];
  while (todo.length) {
    const file = todo.pop()!;
    if (seen.has(file)) continue;
    const text = readFileSync(file, 'utf8');
    seen.set(file, text);
    for (const m of text.matchAll(/(?:from\s*|import\s*\(\s*|import\s+)['"]([^'"]+)['"]/g)) {
      const spec = m[1];
      let base: string | null = null;
      if (spec.startsWith('~/')) base = join(root, 'src', spec.slice(2));
      else if (spec.startsWith('.')) base = resolve(dirname(file), spec);
      if (!base) continue;
      for (const c of [base, `${base}.ts`, `${base}.tsx`, join(base, 'index.ts'), join(base, 'index.tsx')]) {
        if (/\.(ts|tsx)$/.test(c) && existsSync(c)) {
          todo.push(c);
          break;
        }
      }
    }
  }
  return seen;
};

describe('the portal build stays silent', () => {
  const files = reachable(join(root, 'portal/main.tsx'));
  const rel = (f: string) => f.slice(root.length + 1);

  it('sees the game through the portal entry (the walk works)', () => {
    const names = [...files.keys()].map(rel);
    expect(names).toContain('src/components/Race.tsx');
    expect(names).toContain('src/components/useSession.ts');
    expect(names).toContain('src/lib/telemetry.ts');
  });

  it('never reaches the site-only starter, the site entry or the stats address', () => {
    const names = [...files.keys()].map(rel);
    expect(names).not.toContain('src/components/TelemetryInit.tsx');
    expect(names).not.toContain('src/components/SiteRace.tsx');
    expect(names).not.toContain('src/app/layout.tsx');
    for (const [f, text] of files) {
      expect(text, rel(f)).not.toMatch(/NEXT_PUBLIC_STATS_URL|nalbakigames\.com\/v1|stats\.nalbakigames/);
    }
  });

  it('no file in the portal graph calls init() from the telemetry module', () => {
    for (const [f, text] of files) {
      if (rel(f) === 'src/lib/telemetry.ts') continue;
      expect(text, rel(f)).not.toMatch(/import\s*(?:type\s*)?\{[^}]*\binit\b[^}]*\}\s*from\s*['"]~\/lib\/telemetry['"]/);
    }
  });

  it('the vendored client carries no absolute web address', () => {
    expect(files.get(join(root, 'src/lib/telemetry.ts'))).not.toMatch(/https?:\/\/[a-z0-9.-]+\.[a-z]{2,}/i);
  });
});

describe('without init the client does nothing', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('track, loadDone and flush neither throw nor touch the network', () => {
    const fetchSpy = vi.fn();
    const beacon = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
    vi.stubGlobal('navigator', { sendBeacon: beacon });
    expect(() => {
      track('load_start');
      loadDone();
      track('round_start', { mode: 'campaign', n_in_session: 1 });
      flush();
    }).not.toThrow();
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(beacon).not.toHaveBeenCalled();
  });
});

describe('resultOf', () => {
  const hud = (o: Partial<HudState>) => o as HudState;
  it('maps level runs and race results to the event enum', () => {
    expect(resultOf(hud({ campaign: { run: { failed: null } } as HudState['campaign'] }))).toBe('win');
    expect(resultOf(hud({ campaign: { run: { failed: 'time' } } as HudState['campaign'] }))).toBe('timeout');
    expect(resultOf(hud({ campaign: { run: { failed: 'lost' } } as HudState['campaign'] }))).toBe('lose');
    expect(resultOf(hud({ campaign: { run: { failed: 'pedestrian' } } as HudState['campaign'] }))).toBe('crash');
    expect(resultOf(hud({ campaign: null, result: { won: true, reason: 'parked' } as HudState['result'] }))).toBe('win');
    expect(resultOf(hud({ campaign: null, result: { won: false, reason: 'time' } as HudState['result'] }))).toBe('timeout');
    expect(resultOf(hud({ campaign: null, result: { won: false, reason: 'pedestrian' } as HudState['result'] }))).toBe('crash');
    expect(resultOf(hud({ campaign: null, result: { won: false, reason: 'parked' } as HudState['result'] }))).toBe('lose');
    expect(resultOf(hud({ campaign: null, result: null }))).toBe('quit');
  });
});
