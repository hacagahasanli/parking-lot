/**
 * The plain web page: our own site, a local build, or a portal whose SDK did not load. Every call is a no-op, breaks resolve
 * at once as 'skipped', and saves go to localStorage (when the browser allows it).
 */
import type { KeyValue, Platform } from './types';

export const localStore = (): KeyValue => ({
  getItem: (k) => {
    try {
      return window.localStorage.getItem(k);
    } catch {
      return null;
    }
  },
  setItem: (k, v) => {
    try {
      window.localStorage.setItem(k, v);
    } catch {
      /* private mode or blocked storage: the setting is simply not remembered */
    }
  },
});

/** An in-memory store (tests, or a page with no storage at all). */
export const memoryStore = (): KeyValue => {
  const m = new Map<string, string>();
  return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => void m.set(k, v) };
};

export const createWebPlatform = (storage: KeyValue = typeof window === 'undefined' ? memoryStore() : localStore()): Platform => ({
  id: 'web',
  ads: false,
  init: async () => undefined,
  loadingStart: () => undefined,
  loadingStop: () => undefined,
  gameplayStart: () => undefined,
  gameplayStop: () => undefined,
  commercialBreak: async () => 'skipped',
  rewardedBreak: async () => 'skipped',
  lastBreakError: () => null,
  happytime: () => undefined,
  muted: () => false,
  onMutedChange: () => () => undefined,
  deviceType: () => null,
  storage,
});
