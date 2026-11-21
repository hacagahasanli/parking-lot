'use client';

/**
 * The session around the rounds: tells the platform when play starts and stops, and runs the optional rewarded hint
 * (`HintScheduler`). No midgame ads between rounds (they broke the tempo): leaving a result card goes straight on, and the
 * portal's only other ad is the banner under the main menu (MenuBanner). On our own site the platform is the no-op web
 * adapter, so all of this quietly does nothing but start the next round.
 */
import { useCallback, useEffect, useRef, useState } from 'react';

import { useTelemetry } from '~/components/useTelemetry';
import { loadDone } from '~/lib/telemetry';
import { HintScheduler } from '~/platform/hints';

import type { Game, HudState } from '~/game/render/game';
import type { HintOffer } from '~/platform/hints';
import type { Platform } from '~/platform/types';

export type BreakKind = 'rewarded';

export interface Session {
  /** The rewarded hint's ad is being requested or played: the UI is blocked until it ends. */
  inBreak: BreakKind | null;
  /** What the result card may offer this time. */
  hintOffer: HintOffer;
  /** A short message after the hint offer ("Hint ready…", "No video right now"). */
  notice: string | null;
  /** Leave the result card (Next stage, Retry, a stage chip, the map): straight on, no ad in between. */
  next: (action: () => void) => void;
  /** The rewarded (or free) hint: on success the next round starts with the hint circle. */
  takeHint: () => Promise<void>;
  /** Pause/resume through the menu (tells the platform). */
  setPaused: (paused: boolean) => void;
}

const now = () => performance.now() / 1000;

export const useSession = (game: Game | null, hud: HudState | null, platform: Platform, showResult: boolean, testRules?: ConstructorParameters<typeof HintScheduler>[0]): Session => {
  const sched = useRef(new HintScheduler(testRules));
  const [inBreak, setInBreak] = useState<BreakKind | null>(null);
  const [hintOffer, setHintOffer] = useState<HintOffer>(null);
  const [notice, setNotice] = useState<string | null>(null);
  /** Ads turned out to be off here (CrazyGames Basic Launch says 'adsDisabled'): the hint becomes free, never a dead button. */
  const adsOff = useRef(!platform.ads);
  const loaded = useRef(false);

  // The menu is not play (the bots idling behind it are scenery).
  const playing = !!hud && !hud.menu && !hud.paused && !hud.frozen && !showResult && hud.phase !== 'done' && inBreak === null;

  // Loading ends with the first HUD frame; then gameplay starts (the game lands straight in the countdown).
  useEffect(() => {
    if (hud && !loaded.current) {
      loaded.current = true;
      platform.loadingStop();
      loadDone();
    }
  }, [hud, platform]);

  // Anonymous usage events: a no-op unless the site started counting (never on a portal build).
  useTelemetry(hud, showResult);

  // gameplayStart/Stop follow what is on screen (the adapter forwards only changes).
  useEffect(() => {
    if (!hud) return;
    if (playing) platform.gameplayStart();
    else platform.gameplayStop();
  }, [playing, hud, platform]);

  // A round ended (the result card appears): decide what the card may offer.
  const resultKey = showResult && hud?.result ? `${hud.stage.n}:${hud.result.time}:${hud.result.reason}` : null;
  useEffect(() => {
    if (!resultKey || !hud?.result) return;
    const won = hud.result.won;
    sched.current.roundEnded(won, hud.stage.n);
    const offer = sched.current.hintOffer(now(), !won, !adsOff.current);
    if (offer === 'ad') sched.current.offered(now());
    setHintOffer(offer);
    setNotice(null);
    if (won && !hud.stage.hasNext && hud.stage.n === hud.stage.total) platform.happytime();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resultKey]);

  // The portal's mute button.
  useEffect(() => {
    if (!game) return;
    game.setPortalMuted(platform.muted());
    return platform.onMutedChange((m) => game.setPortalMuted(m));
  }, [game, platform]);

  const freeze = useCallback(() => game?.setFrozen(true), [game]);

  const next = useCallback(
    (action: () => void) => {
      if (inBreak) return;
      setHintOffer(null);
      setNotice(null);
      action();
    },
    [inBreak],
  );

  const takeHint = useCallback(async () => {
    if (inBreak || !hintOffer) return;
    const start = () => {
      setHintOffer(null);
      sched.current.hintTaken(hintOffer === 'free');
      game?.newRound({ hint: true });
    };
    if (hintOffer === 'free' || adsOff.current) {
      start();
      return;
    }
    setInBreak('rewarded');
    const r = await platform.rewardedBreak({ onStart: freeze });
    game?.setFrozen(false);
    setInBreak(null);
    if (r === 'shown') {
      start();
    } else if (platform.lastBreakError() === 'adsDisabled') {
      // Ads are switched off for this game here (CrazyGames Basic Launch): the hint is simply free from now on.
      adsOff.current = true;
      start();
    } else {
      setHintOffer(null);
      setNotice('No video available right now. Your next round starts as usual.');
    }
  }, [game, platform, inBreak, hintOffer, freeze]);

  const setPaused = useCallback((p: boolean) => game?.setPaused(p), [game]);

  return { inBreak, hintOffer, notice, next, takeHint, setPaused };
};
