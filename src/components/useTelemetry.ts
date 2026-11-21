'use client';

/**
 * The game's anonymous usage events (menu_view, round_start, round_end). Reads the HUD only; it never changes play.
 * On a portal build nothing is sent: `init` is never called there (it lives in TelemetryInit, which only the Next site renders),
 * so every `track` below returns at once.
 */
import { useEffect, useRef } from 'react';

import { track } from '~/lib/telemetry';

import type { HudState } from '~/game/render/game';

type RoundResult = 'win' | 'lose' | 'quit' | 'crash' | 'timeout';

interface OpenRound {
  startedAt: number;
  mode: string;
  level?: number;
  stage?: number;
}

/** How the round ended for this player, from the result card's own data. */
export const resultOf = (hud: HudState): RoundResult => {
  const run = hud.campaign?.run;
  if (run) {
    if (run.failed === null) return 'win';
    if (run.failed === 'time') return 'timeout';
    if (run.failed === 'lost') return 'lose';
    return 'crash';
  }
  const r = hud.result;
  if (!r) return 'quit';
  if (r.won) return 'win';
  if (r.reason === 'time') return 'timeout';
  if (r.reason === 'crash' || r.reason === 'pedestrian') return 'crash';
  return 'lose';
};

export const useTelemetry = (
  hud: HudState | null,
  showResult: boolean,
): void => {
  const menuSent = useRef(false);
  const open = useRef<OpenRound | null>(null);
  const rounds = useRef(0);
  const maxLevel = useRef(0);
  const prevPhase = useRef<string | null>(null);
  const hudRef = useRef(hud);
  hudRef.current = hud;

  const endRound = (result: RoundResult, h: HudState | null) => {
    const r = open.current;
    if (!r) return;
    open.current = null;
    const done = result !== 'quit' && h?.result ? h : null;
    const run = h?.campaign?.run ?? null;
    const dur = run
      ? run.time
      : done?.result
        ? done.result.time
        : (performance.now() - r.startedAt) / 1000;
    track('round_end', {
      mode: r.mode,
      ...(r.level !== undefined ? { level: r.level } : {}),
      ...(r.stage !== undefined ? { stage: r.stage } : {}),
      result,
      dur_s: Math.max(0, Math.round(dur * 10) / 10),
      ...(done?.result && !h?.campaign?.solo
        ? { placement: done.result.place, of: done.place.of }
        : {}),
      ...(run ? { stars: run.stars } : {}),
      max_level: maxLevel.current,
    });
  };

  // The first HUD frame is the first screen the player can act on (the main menu, or the modes screen on our site).
  useEffect(() => {
    if (hud && !menuSent.current) {
      menuSent.current = true;
      track('menu_view');
    }
  }, [hud]);

  // A round starts when the race leaves its countdown (GO), and ends early if a new one starts or the player goes back to the menu.
  const inMenu = !!hud?.menu;
  const phase = hud && !inMenu ? hud.phase : null;
  useEffect(() => {
    const h = hudRef.current;
    if (phase === 'race' && prevPhase.current !== 'race' && h) {
      if (open.current) endRound('quit', h);
      rounds.current += 1;
      const c = h.campaign;
      if (c) maxLevel.current = Math.max(maxLevel.current, c.n);
      open.current = {
        startedAt: performance.now(),
        mode: c ? (c.type === 'race' ? 'race' : 'campaign') : 'stage',
        ...(c ? { level: c.n } : { stage: h.stage.n }),
      };
      track('round_start', {
        mode: open.current.mode,
        ...(c ? { level: c.n } : { stage: h.stage.n }),
        n_in_session: rounds.current,
      });
    }
    prevPhase.current = phase;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase]);

  useEffect(() => {
    if (inMenu && open.current) endRound('quit', hudRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inMenu]);

  // The result card appears: the round is over.
  const resultKey =
    showResult && hud?.result
      ? `${hud.stage.n}:${hud.result.time}:${hud.result.reason}`
      : null;
  useEffect(() => {
    if (resultKey && hudRef.current?.result)
      endRound(resultOf(hudRef.current), hudRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resultKey]);
};
