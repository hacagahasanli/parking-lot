import { BREAK_RULES, BreakScheduler } from './breaks';
import { createCrazyGamesPlatform } from './crazygames';
import { detectPlatform } from './index';
import { createWebPlatform, memoryStore } from './web';

import type { CrazySdk } from './crazygames';

/** A fake SDK that records calls; `ad` decides what each requestAd does. */
const fakeSdk = (opts: { where?: string; init?: () => Promise<void>; ad?: CrazySdk['ad']['requestAd']; muted?: boolean; device?: string } = {}) => {
  const calls: string[] = [];
  let listener: ((s: { muteAudio?: boolean }) => void) | null = null;
  const sdk: CrazySdk = {
    init: opts.init ?? (async () => void calls.push('init')),
    environment: opts.where ?? 'crazygames',
    game: {
      loadingStart: () => void calls.push('loadingStart'),
      loadingStop: () => void calls.push('loadingStop'),
      gameplayStart: () => void calls.push('gameplayStart'),
      gameplayStop: () => void calls.push('gameplayStop'),
      happytime: () => void calls.push('happytime'),
      settings: { muteAudio: opts.muted ?? false },
      addSettingsChangeListener: (l) => void (listener = l),
      removeSettingsChangeListener: () => void (listener = null),
    },
    ad: {
      requestAd:
        opts.ad ??
        ((type, cb) => {
          calls.push(`ad:${type}`);
          cb.adStarted?.();
          cb.adFinished?.();
        }),
    },
    user: { systemInfo: { device: { type: opts.device ?? 'mobile' } } },
    data: memoryStore(),
  };
  return { sdk, calls, fire: (s: { muteAudio?: boolean }) => listener?.(s) };
};

describe('choosing the platform', () => {
  it('falls back to the no-op web adapter when the SDK is missing', async () => {
    expect((await detectPlatform({})).id).toBe('web');
    expect((await detectPlatform(undefined)).id).toBe('web');
  });

  it('falls back when the SDK says the domain is not CrazyGames, when init fails, or when init hangs', async () => {
    expect((await detectPlatform({ CrazyGames: { SDK: fakeSdk({ where: 'disabled' }).sdk } })).id).toBe('web');
    expect((await detectPlatform({ CrazyGames: { SDK: fakeSdk({ init: () => Promise.reject(new Error('x')) }).sdk } })).id).toBe('web');
    expect((await detectPlatform({ CrazyGames: { SDK: fakeSdk({ init: () => new Promise(() => undefined) }).sdk } }, 20)).id).toBe('web');
  });

  it('uses CrazyGames on its own domains and locally ("local")', async () => {
    const f = fakeSdk({ where: 'local' });
    const p = await detectPlatform({ CrazyGames: { SDK: f.sdk } });
    expect(p.id).toBe('crazygames');
    expect(f.calls).toContain('init');
  });
});

describe('the web fallback', () => {
  it('does nothing, skips every break and never throws', async () => {
    const p = createWebPlatform(memoryStore());
    expect(p.ads).toBe(false);
    p.loadingStart();
    p.loadingStop();
    p.gameplayStart();
    p.gameplayStop();
    p.happytime();
    expect(await p.commercialBreak()).toBe('skipped');
    expect(await p.rewardedBreak()).toBe('skipped');
    expect(p.muted()).toBe(false);
    expect(p.deviceType()).toBeNull();
    p.storage.setItem('k', 'v');
    expect(p.storage.getItem('k')).toBe('v');
  });
});

describe('the CrazyGames adapter', () => {
  it('forwards gameplay start and stop only when they change', () => {
    const f = fakeSdk();
    const p = createCrazyGamesPlatform(f.sdk);
    p.gameplayStart();
    p.gameplayStart();
    p.gameplayStop();
    p.gameplayStop();
    p.gameplayStart();
    p.loadingStart();
    p.loadingStop();
    p.loadingStop();
    expect(f.calls).toEqual(['gameplayStart', 'gameplayStop', 'gameplayStart', 'loadingStart', 'loadingStop']);
  });

  it('mutes only when the ad starts, and reports a finished rewarded ad as shown', async () => {
    const order: string[] = [];
    const f = fakeSdk({
      ad: (_type, cb) => {
        order.push('request');
        setTimeout(() => {
          cb.adStarted?.();
          order.push('playing');
          cb.adFinished?.();
        }, 5);
      },
    });
    const p = createCrazyGamesPlatform(f.sdk);
    const r = await p.rewardedBreak({ onStart: () => order.push('mute') });
    expect(r).toBe('shown');
    expect(order).toEqual(['request', 'mute', 'playing']);
  });

  it('turns ad errors, SDK exceptions and an ad that never starts into "error", and remembers why', async () => {
    const unfilled = createCrazyGamesPlatform(fakeSdk({ ad: (_t, cb) => cb.adError?.({ code: 'unfilled' }) }).sdk);
    expect(await unfilled.commercialBreak()).toBe('error');
    expect(unfilled.lastBreakError()).toBe('unfilled');
    const throws = createCrazyGamesPlatform(
      fakeSdk({
        ad: () => {
          throw new Error('boom');
        },
      }).sdk,
    );
    expect(await throws.rewardedBreak()).toBe('error');
    const silent = createCrazyGamesPlatform(fakeSdk({ ad: () => undefined }).sdk, { timeoutMs: 20 });
    let muted = false;
    expect(await silent.commercialBreak({ onStart: () => (muted = true) })).toBe('error');
    expect(muted).toBe(false);
    expect(silent.lastBreakError()).toBe('timeout');
  });

  it('never throws when the SDK does', () => {
    const f = fakeSdk();
    f.sdk.game.gameplayStart = () => {
      throw new Error('sdk down');
    };
    const p = createCrazyGamesPlatform(f.sdk);
    expect(() => p.gameplayStart()).not.toThrow();
  });

  it("follows the portal's mute setting, reads the device type and saves through the data module", () => {
    const f = fakeSdk({ muted: true, device: 'tablet' });
    const p = createCrazyGamesPlatform(f.sdk);
    expect(p.muted()).toBe(true);
    const seen: boolean[] = [];
    const off = p.onMutedChange((m) => seen.push(m));
    f.fire({ muteAudio: false });
    f.fire({ muteAudio: true });
    off();
    f.fire({ muteAudio: false });
    expect(seen).toEqual([false, true]);
    expect(p.deviceType()).toBe('tablet');
    p.storage.setItem('q', 'low');
    expect(f.sdk.data!.getItem('q')).toBe('low');
  });
});

describe('ad-break scheduling', () => {
  const R = BREAK_RULES;
  /** Plays `n` rounds of `secs` seconds each. */
  const play = (s: BreakScheduler, n: number, secs: number, won = false, stage = 1) => {
    for (let i = 0; i < n; i++) {
      s.addPlay(secs);
      s.roundEnded(won, stage);
    }
  };

  it('never asks before the player has had enough play', () => {
    const s = new BreakScheduler();
    expect(s.shouldBreak(1000)).toBe(false);
    play(s, 1, 500);
    expect(s.shouldBreak(1000)).toBe(false); // one round only
    const t = new BreakScheduler();
    play(t, 5, 10);
    expect(t.shouldBreak(1000)).toBe(false); // five short rounds, under the play time
    play(t, 1, R.firstAfterPlay);
    expect(t.shouldBreak(1000)).toBe(true);
  });

  it('asks at most once per gap between rounds and once per interval', () => {
    const s = new BreakScheduler();
    play(s, 2, 80);
    expect(s.shouldBreak(500)).toBe(true);
    s.adShown(500);
    expect(s.shouldBreak(500)).toBe(false);
    play(s, 1, 60);
    expect(s.shouldBreak(500 + R.interval - 1)).toBe(false);
    expect(s.shouldBreak(500 + R.interval)).toBe(true);
  });

  it('a rewarded ad counts toward the interval, and a hint gap never also gets a midgame ad', () => {
    const s = new BreakScheduler();
    play(s, 2, 60, true);
    play(s, 1, 60);
    expect(s.hintOffer(400, true, true)).toBe('ad');
    s.offered(400);
    s.hintTaken(false);
    s.adShown(400);
    expect(s.shouldBreak(400 + R.interval + 10)).toBe(false); // same gap
    play(s, 1, 30);
    expect(s.shouldBreak(400 + R.interval - 1)).toBe(false);
    expect(s.shouldBreak(400 + R.interval)).toBe(true);
  });

  it('offers the hint only after a loss, not too often, and free after a losing streak', () => {
    const s = new BreakScheduler();
    play(s, 1, 30, true);
    expect(s.hintOffer(100, false, true)).toBeNull();
    play(s, 1, 30, false);
    expect(s.hintOffer(100, true, true)).toBe('ad');
    s.offered(100);
    play(s, 1, 30, false);
    expect(s.hintOffer(150, true, true)).toBeNull(); // within hintEvery
    expect(s.hintOffer(150, true, false)).toBeNull(); // no ads, no streak yet
    play(s, 1, 30, false); // third loss in a row on stage 1
    expect(s.hintOffer(160, true, true)).toBe('free');
    expect(s.hintOffer(160, true, false)).toBe('free');
    s.hintTaken(true);
    play(s, 1, 30, false);
    expect(s.hintOffer(400, true, false)).toBeNull(); // the free hint reset the streak
  });

  it('counts a losing streak per stage', () => {
    const s = new BreakScheduler();
    play(s, 2, 30, false, 2);
    play(s, 1, 30, false, 3);
    expect(s.stats.streak).toBe(1);
  });

  it('ignores nonsense play time', () => {
    const s = new BreakScheduler();
    s.addPlay(-5);
    s.addPlay(Number.NaN);
    s.addPlay(Infinity);
    expect(s.stats.play).toBe(0);
  });
});
