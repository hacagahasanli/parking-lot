'use client';

/**
 * The Daily Lot's saved state on the page: loaded from the platform's storage, updated once per run when the result card shows,
 * and the UTC day re-read every minute (a page left open over midnight shows `New` again).
 */
import { useCallback, useEffect, useRef, useState } from 'react';

import { DAILY_ID, activateDaily, bestOn, dayKey, daySeed, loadDaily, recordDaily, saveDaily, streakOn } from '~/game/sim/daily';

import type { DailyBest, DailySave } from '~/game/sim/daily';
import type { LevelHud } from '~/game/render/game';
import type { Platform } from '~/platform/types';

export interface DailyView {
  /** The best park of today, or null (the menu says New). */
  best: DailyBest | null;
  /** Days in a row with a park, as it stands today (0: none running). */
  streak: number;
}

export const useDaily = (platform: Platform) => {
  const [save, setSave] = useState<DailySave>(() => loadDaily(platform.storage));
  const [key, setKey] = useState(() => dayKey());
  const seen = useRef<string | null>(null);

  // A portal's cloud save may arrive after the first render: read again when the platform changes.
  useEffect(() => setSave(loadDaily(platform.storage)), [platform]);
  useEffect(() => {
    const t = window.setInterval(() => setKey(dayKey()), 60_000);
    return () => window.clearInterval(t);
  }, []);

  const view: DailyView = { best: bestOn(save, key), streak: streakOn(save, key) };

  /** Start today's round: the level and its seed. */
  const start = useCallback(() => {
    const k = dayKey();
    setKey(k);
    return { level: activateDaily(k), seed: daySeed(k), key: k };
  }, []);

  /** Record a finished run once (`runKey` tells runs apart). */
  const record = useCallback(
    (runKey: string, hud: LevelHud) => {
      if (hud.id !== DAILY_ID || !hud.run || seen.current === runKey) return;
      seen.current = runKey;
      setSave((old) => {
        const next = recordDaily(old, dayKey(), hud.run!);
        if (next !== old) saveDaily(platform.storage, next);
        return next;
      });
    },
    [platform],
  );

  return { view, start, record };
};
