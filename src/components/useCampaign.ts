'use client';

/**
 * The campaign's saved progress on the page: loaded once from the platform's storage (a portal's cloud save, or localStorage),
 * and updated when a level's result card appears (once per run). Remembers what the run changed, so the result card can say
 * "new best" and "chapter 2 is open".
 */
import { useCallback, useEffect, useRef, useState } from 'react';

import { CAMPAIGN, CAMPAIGN_KEY, CHAPTERS, chapterOpen, endlessOpen, levelById, loadProgress, recordRun, saveProgress } from '~/game/sim/campaign';

import type { CampaignProgress } from '~/game/sim/campaign';
import type { LevelHud } from '~/game/render/game';
import type { Platform } from '~/platform/types';

export interface RunNews {
  /** The stars this run beat the level's old best with (0 when it did not). */
  newStars: number;
  newBest: boolean;
  /** A chapter this run opened, if any. */
  opened: number | null;
  /** The endless race opened with this run. */
  endless: boolean;
}

export const useCampaign = (platform: Platform) => {
  const [progress, setProgress] = useState<CampaignProgress>(() => loadProgress(platform.storage));
  const [news, setNews] = useState<RunNews | null>(null);
  const seen = useRef<string | null>(null);

  // A portal's cloud save may arrive after the first render (the SDK initialises first): read again when the platform changes.
  useEffect(() => setProgress(loadProgress(platform.storage)), [platform]);

  /** Record a finished run once (`key` tells runs apart). */
  const record = useCallback(
    (key: string, hud: LevelHud) => {
      if (!hud.run || seen.current === key) return;
      seen.current = key;
      const level = levelById(hud.id);
      // The Daily Lot keeps its own save (useDaily), not a campaign level's.
      if (!level || hud.id === 'daily') return;
      setProgress((old) => {
        const next = recordRun(old, level, hud.run!);
        const before = old.levels[level.id];
        const after = next.levels[level.id];
        const opened = CHAPTERS.find((c) => !chapterOpen(old, c.n) && chapterOpen(next, c.n))?.n ?? null;
        setNews({
          newStars: after && after.stars > (before?.stars ?? 0) ? after.stars : 0,
          newBest: !!after && !!before && hud.run!.finished && hud.run!.time < before.best,
          opened,
          endless: !endlessOpen(old) && endlessOpen(next),
        });
        if (next !== old) saveProgress(platform.storage, next);
        return next;
      });
    },
    [platform],
  );

  const clearNews = useCallback(() => setNews(null), []);

  // Development only: the screenshot scripts set a progress to start from (`__setCampaign(json)`).
  useEffect(() => {
    if (process.env.NODE_ENV === 'production') return;
    Object.assign(window, {
      __setCampaign: (raw: string) => {
        platform.storage.setItem(CAMPAIGN_KEY, raw);
        setProgress(loadProgress(platform.storage));
      },
    });
  }, [platform]);

  return { progress, record, news, clearNews, levels: CAMPAIGN };
};
