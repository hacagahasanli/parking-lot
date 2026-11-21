'use client';

import { useEffect } from 'react';

import { GAME_VERSION } from '~/lib/studio';
import { init } from '~/lib/telemetry';

/**
 * Starts anonymous visit counting on our own site, and only when NEXT_PUBLIC_STATS_URL is set (so local builds never send).
 * Only the Next site renders this (from the root layout); the portal build has its own entry (portal/main.tsx) that never
 * imports it, so portal builds send nothing and carry no stats address.
 */
export const TelemetryInit = () => {
  useEffect(() => {
    const endpoint = process.env.NEXT_PUBLIC_STATS_URL;
    if (endpoint)
      init({
        endpoint,
        game: 'parking-lot',
        build: process.env.NEXT_PUBLIC_BUILD || GAME_VERSION,
      });
  }, []);
  return null;
};
