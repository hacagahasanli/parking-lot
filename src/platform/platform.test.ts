import { createCrazyGamesPlatform } from './crazygames';
import { HintScheduler } from './hints';
import { detectPlatform } from './index';
import { createWebPlatform, memoryStore } from './web';

import type { CrazySdk } from './crazygames';

/** A fake SDK that records calls; `ad` decides what each requestAd does. */
const fakeSdk = (opts: { where?: string; init?: () => Promise<void>; ad?: CrazySdk['ad']['requestAd']; muted?: boolean; device?: string; banner?: CrazySdk['banner'] | null } = {}) => {
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
    banner:
      opts.banner === null
        ? undefined
        : (opts.banner ?? {
            requestResponsiveBanner: async (id) => void calls.push(`banner:${id}`),
            clearBanner: (id) => void calls.push(`clear:${id}`),
          }),
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
    expect(p.banners).toBe(false);
    expect(await p.requestBanner('slot')).toBe(false);
    p.clearBanner('slot');
    expect(await p.rewardedBreak()).toBe('skipped');
    expect(p.muted()).toBe(false);
    expect(p.deviceType()).toBeNull();
    p.storage.setItem('k', 'v');
    expect(p.storage.getItem('k')).toBe('v');
  });
});

describe('the CrazyGames adapter', () => {
  it('makes no ad or banner calls unless ads are turned on (Basic Launch rejects any)', async () => {
    let calls = 0;
    const p = createCrazyGamesPlatform(
      fakeSdk({
        ad: () => calls++,
        banner: { requestResponsiveBanner: () => void calls++, clearBanner: () => void calls++ },
      }).sdk,
    );
    expect(p.ads).toBe(false);
    expect(p.banners).toBe(false);
    expect(await p.rewardedBreak()).toBe('error');
    expect(await p.requestBanner('b')).toBe(false);
    p.clearBanner('b');
    expect(calls).toBe(0);
  });

  it('forwards gameplay start and stop only when they change', () => {
    const f = fakeSdk();
    const p = createCrazyGamesPlatform(f.sdk, { ads: true });
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
    const p = createCrazyGamesPlatform(f.sdk, { ads: true });
    const r = await p.rewardedBreak({ onStart: () => order.push('mute') });
    expect(r).toBe('shown');
    expect(order).toEqual(['request', 'mute', 'playing']);
  });

  it('turns ad errors, SDK exceptions and an ad that never starts into "error", and remembers why', async () => {
    const unfilled = createCrazyGamesPlatform(fakeSdk({ ad: (_t, cb) => cb.adError?.({ code: 'unfilled' }) }).sdk, { ads: true });
    expect(await unfilled.rewardedBreak()).toBe('error');
    expect(unfilled.lastBreakError()).toBe('unfilled');
    const throws = createCrazyGamesPlatform(
      fakeSdk({
        ad: () => {
          throw new Error('boom');
        },
      }).sdk,
      { ads: true },
    );
    expect(await throws.rewardedBreak()).toBe('error');
    const silent = createCrazyGamesPlatform(fakeSdk({ ad: () => undefined }).sdk, { ads: true, timeoutMs: 20 });
    let muted = false;
    expect(await silent.rewardedBreak({ onStart: () => (muted = true) })).toBe('error');
    expect(muted).toBe(false);
    expect(silent.lastBreakError()).toBe('timeout');
  });

  it('has no midgame ads at all: the platform offers only rewarded breaks', () => {
    const p = createCrazyGamesPlatform(fakeSdk().sdk, { ads: true });
    expect('commercialBreak' in p).toBe(false);
  });

  it('asks for a responsive banner in the given container and clears it', async () => {
    const f = fakeSdk();
    const p = createCrazyGamesPlatform(f.sdk, { ads: true });
    expect(p.banners).toBe(true);
    expect(await p.requestBanner('menu-banner')).toBe(true);
    p.clearBanner('menu-banner');
    expect(f.calls).toEqual(['banner:menu-banner', 'clear:menu-banner']);
  });

  it('reports a refused banner (cooldown, unfilled, disabled, an SDK without banners) as not shown, never throwing', async () => {
    const refused = createCrazyGamesPlatform(
      fakeSdk({
        banner: {
          requestResponsiveBanner: () => Promise.reject({ code: 'bannerCooldown' }),
          clearBanner: () => {
            throw new Error('x');
          },
        },
      }).sdk,
      { ads: true },
    );
    expect(await refused.requestBanner('b')).toBe(false);
    expect(() => refused.clearBanner('b')).not.toThrow();
    const none = createCrazyGamesPlatform(fakeSdk({ banner: null }).sdk, { ads: true });
    expect(none.banners).toBe(false);
    expect(await none.requestBanner('b')).toBe(false);
  });

  it('never throws when the SDK does', () => {
    const f = fakeSdk();
    f.sdk.game.gameplayStart = () => {
      throw new Error('sdk down');
    };
    const p = createCrazyGamesPlatform(f.sdk, { ads: true });
    expect(() => p.gameplayStart()).not.toThrow();
  });

  it("follows the portal's mute setting, reads the device type and saves through the data module", () => {
    const f = fakeSdk({ muted: true, device: 'tablet' });
    const p = createCrazyGamesPlatform(f.sdk, { ads: true });
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

describe('the rewarded hint offer', () => {
  /** Ends `n` rounds. */
  const play = (s: HintScheduler, n: number, won = false, stage = 1) => {
    for (let i = 0; i < n; i++) s.roundEnded(won, stage);
  };

  it('offers the hint only after a loss, not too often, and free after a losing streak', () => {
    const s = new HintScheduler();
    play(s, 1, true);
    expect(s.hintOffer(100, false, true)).toBeNull();
    play(s, 1, false);
    expect(s.hintOffer(100, true, true)).toBe('ad');
    s.offered(100);
    play(s, 1, false);
    expect(s.hintOffer(150, true, true)).toBeNull(); // within hintEvery
    expect(s.hintOffer(150, true, false)).toBeNull(); // no ads, no streak yet
    play(s, 1, false); // third loss in a row on stage 1
    expect(s.hintOffer(160, true, true)).toBe('free');
    expect(s.hintOffer(160, true, false)).toBe('free');
    s.hintTaken(true);
    play(s, 1, false);
    expect(s.hintOffer(400, true, false)).toBeNull(); // the free hint reset the streak
  });

  it('offers nothing more on a card where a hint was already taken', () => {
    const s = new HintScheduler();
    play(s, 1, false);
    expect(s.hintOffer(100, true, true)).toBe('ad');
    s.offered(100);
    s.hintTaken(false);
    expect(s.hintOffer(300, true, true)).toBeNull();
    play(s, 1, false);
    expect(s.hintOffer(300, true, true)).toBe('ad');
  });

  it('counts a losing streak per stage', () => {
    const s = new HintScheduler();
    play(s, 2, false, 2);
    play(s, 1, false, 3);
    expect(s.stats.streak).toBe(1);
  });
});
