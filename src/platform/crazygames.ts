/**
 * CrazyGames SDK v3 (https://docs.crazygames.com/sdk/intro/). The page loads
 * `https://sdk.crazygames.com/crazygames-sdk-v3.js` in its <head>; this adapter wraps `window.CrazyGames.SDK`:
 *  - `init()` must be awaited before anything else; on a domain the SDK does not know, `environment` is 'disabled' and its
 *    calls throw, so `detectPlatform` falls back to the plain web adapter;
 *  - `game.loadingStart/Stop`, `game.gameplayStart/Stop` (forwarded only on a real change), `game.happytime`;
 *  - `ad.requestAd('rewarded', { adStarted, adFinished, adError })`: the game mutes and freezes in adStarted only, resumes
 *    in adFinished/adError. No midgame ads: they came after every round and broke the tempo;
 *  - `banner.requestResponsiveBanner(id)` / `banner.clearBanner(id)` (https://docs.crazygames.com/sdk/banners/): one
 *    banner, on the main menu only, in a container that is on screen and fully visible; the SDK picks the largest of its
 *    sizes (320x50, 300x250, 728x90, ...) that fits, refuses a refresh of the same container within 30 s and has a
 *    per-session refresh limit; any refusal (bannersDisabled, unfilled, notVisible, noAvailableSizes, bannerCooldown,
 *    maxRefreshReached, ...) just leaves the slot empty, and the menu collapses it;
 *  - `game.settings.muteAudio` and `game.addSettingsChangeListener` for the portal's mute;
 *  - `user.systemInfo.device.type` for the device (the docs ask for this instead of touch detection alone);
 *  - `data` (localStorage API, synced to the player's account) for saves.
 * Every call is wrapped: an SDK error never reaches the game.
 */
import { localStore } from './web';

import type { BreakHooks, BreakResult, DeviceType, KeyValue, Platform } from './types';

/** The part of the SDK we use (typed loosely: it is a third-party global). */
export interface CrazySdk {
  init(): Promise<void>;
  environment?: 'local' | 'crazygames' | 'disabled' | string;
  game: {
    loadingStart(): void;
    loadingStop(): void;
    gameplayStart(): void;
    gameplayStop(): void;
    happytime?(): void;
    settings?: { muteAudio?: boolean };
    addSettingsChangeListener?(cb: (s: { muteAudio?: boolean }) => void): void;
    removeSettingsChangeListener?(cb: (s: { muteAudio?: boolean }) => void): void;
  };
  ad: {
    requestAd(type: 'rewarded', cb: { adStarted?: () => void; adFinished?: () => void; adError?: (e: { code?: string } | string) => void }): void;
  };
  banner?: {
    requestResponsiveBanner(id: string): Promise<void> | void;
    clearBanner(id: string): void;
  };
  user?: { systemInfo?: { device?: { type?: string } } };
  data?: KeyValue;
}

/** If an ad has not even started this long after the request, the game goes on without it. */
export const AD_START_TIMEOUT_MS = 12000;

const safe = (fn: () => void) => {
  try {
    fn();
  } catch {
    /* an SDK call failed: the game carries on */
  }
};

export const createCrazyGamesPlatform = (sdk: CrazySdk, opts: { storage?: KeyValue; timeoutMs?: number } = {}): Platform => {
  let playing = false;
  let loading = false;
  let lastError: string | null = null;
  const timeoutMs = opts.timeoutMs ?? AD_START_TIMEOUT_MS;

  const request = (type: 'rewarded', hooks?: BreakHooks) =>
    new Promise<BreakResult>((resolve) => {
      let started = false;
      let done = false;
      const finish = (r: BreakResult) => {
        if (done) return;
        done = true;
        clearTimeout(timer);
        resolve(r);
      };
      const timer = setTimeout(() => {
        if (!started) {
          lastError = 'timeout';
          finish('error');
        }
      }, timeoutMs);
      lastError = null;
      try {
        sdk.ad.requestAd(type, {
          adStarted: () => {
            if (done) return;
            started = true;
            hooks?.onStart?.();
          },
          adFinished: () => finish('shown'),
          adError: (e) => {
            lastError = typeof e === 'string' ? e : (e?.code ?? 'other');
            finish('error');
          },
        });
      } catch {
        lastError = 'other';
        finish('error');
      }
    });

  return {
    id: 'crazygames',
    ads: true,
    init: async () => undefined,
    loadingStart: () => {
      if (loading) return;
      loading = true;
      safe(() => sdk.game.loadingStart());
    },
    loadingStop: () => {
      if (!loading) return;
      loading = false;
      safe(() => sdk.game.loadingStop());
    },
    gameplayStart: () => {
      if (playing) return;
      playing = true;
      safe(() => sdk.game.gameplayStart());
    },
    gameplayStop: () => {
      if (!playing) return;
      playing = false;
      safe(() => sdk.game.gameplayStop());
    },
    banners: !!sdk.banner,
    requestBanner: async (id) => {
      try {
        if (!sdk.banner) return false;
        await sdk.banner.requestResponsiveBanner(id);
        return true;
      } catch {
        return false;
      }
    },
    clearBanner: (id) => safe(() => sdk.banner?.clearBanner(id)),
    rewardedBreak: (hooks) => request('rewarded', hooks),
    lastBreakError: () => lastError,
    happytime: () => safe(() => sdk.game.happytime?.()),
    muted: () => {
      try {
        return !!sdk.game.settings?.muteAudio;
      } catch {
        return false;
      }
    },
    onMutedChange: (cb) => {
      const l = (s: { muteAudio?: boolean }) => cb(!!s?.muteAudio);
      safe(() => sdk.game.addSettingsChangeListener?.(l));
      return () => safe(() => sdk.game.removeSettingsChangeListener?.(l));
    },
    deviceType: () => {
      try {
        const t = sdk.user?.systemInfo?.device?.type;
        return t === 'desktop' || t === 'tablet' || t === 'mobile' ? (t as DeviceType) : null;
      } catch {
        return null;
      }
    },
    storage: opts.storage ?? (sdk.data ? guardStore(sdk.data) : localStore()),
  };
};

/** The SDK's data module, with every call guarded. */
const guardStore = (d: KeyValue): KeyValue => ({
  getItem: (k) => {
    try {
      return d.getItem(k);
    } catch {
      return null;
    }
  },
  setItem: (k, v) => safe(() => d.setItem(k, v)),
});
