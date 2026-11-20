/**
 * Picks the adapter for the page the game runs on. The portal build loads the CrazyGames SDK script; if that script is missing
 * (blocked, offline, another portal, our own site) or its init fails or says 'disabled', the game gets the no-op web adapter
 * and plays exactly the same, without ads.
 */
import { createCrazyGamesPlatform } from './crazygames';
import { createWebPlatform } from './web';

import type { CrazySdk } from './crazygames';
import type { Platform } from './types';

export type { BreakResult, DeviceType, Platform } from './types';

/** How long the SDK's init may take before the game starts without it. */
export const INIT_TIMEOUT_MS = 4000;

const withTimeout = <T,>(p: Promise<T>, ms: number) =>
  new Promise<T>((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('timeout')), ms);
    p.then(
      (v) => {
        clearTimeout(t);
        resolve(v);
      },
      (e) => {
        clearTimeout(t);
        reject(e);
      },
    );
  });

export const detectPlatform = async (win: { CrazyGames?: { SDK?: CrazySdk } } | undefined = typeof window === 'undefined' ? undefined : (window as never), timeoutMs = INIT_TIMEOUT_MS): Promise<Platform> => {
  const sdk = win?.CrazyGames?.SDK;
  if (!sdk) return createWebPlatform();
  try {
    await withTimeout(sdk.init(), timeoutMs);
  } catch {
    return createWebPlatform();
  }
  if (sdk.environment === 'disabled') return createWebPlatform();
  return createCrazyGamesPlatform(sdk);
};
