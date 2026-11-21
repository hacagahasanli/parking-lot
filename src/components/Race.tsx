'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { MainMenu } from '~/components/menu/MainMenu';
import { Modes } from '~/components/menu/Modes';
import { SettingsPanel } from '~/components/menu/SettingsPanel';
import { useApplySettings, useSettings } from '~/components/menu/useSettings';
import { useMenuNav, usePadNav } from '~/components/menu/ui';
import { Onboarding } from '~/components/Onboarding';
import { TouchControls, useTouch } from '~/components/TouchControls';
import { Countdown } from '~/components/Countdown';
import { LoadingScreen, Wipe } from '~/components/Transitions';
import { useSession } from '~/components/useSession';
import { useCampaign } from '~/components/useCampaign';
import { CampaignMap } from '~/components/campaign/CampaignMap';
import { HintButton, LevelBar, LevelIntro, LevelResult, PrecisionMeter, levelTag, objectiveOf } from '~/components/campaign/LevelUI';
import { ALL_LEVELS, isRace, levelById, nextOpenLevel } from '~/game/sim/campaign';
import { deviceFacts } from '~/game/render/deviceFacts';
import { resolveTier } from '~/game/render/quality';
import { keyLabel } from '~/game/settings';
import { createWebPlatform } from '~/platform/web';

import type { ComponentType, ReactNode } from 'react';
import type { Session } from '~/components/useSession';
import type { ModesView } from '~/components/menu/Modes';
import type { LoadStep, WipeKind } from '~/components/Transitions';
import type { CameraMode, Game, HudState } from '~/game/render/game';
import type { Tier } from '~/game/render/quality';
import type { Bindings } from '~/game/settings';
import type { Flavour } from '~/game/sim/flavour';
import type { Platform } from '~/platform/types';


/** The site's support module (SupportLink): `pill` is one line, `card` the result-screen card. */
export type SupportSlot = ComponentType<{ variant?: 'pill' | 'card' }>;

export interface RaceProps {
  /** The page the game runs on (a portal SDK or the plain web). Default: the plain web, every call a no-op. */
  platform?: Platform;
  /** 'neutral' on portals: no studio in-jokes in names, radio, plates or signs. */
  flavour?: Flavour;
  /** Our own site's way out to the home page (portals pass nothing: the game is the whole page, no outbound links). */
  exit?: (p: { className: string; label: string }) => ReactNode;
  /** Our own site's support module (portals pass nothing: no outbound links): `pill` in the pause menu, `card` on the result screens. */
  support?: SupportSlot;
  /** A small credit line in the pause menu ("A game by …"). */
  credit?: string;
  /** Esc pauses (default true). Portals reserve Esc for leaving fullscreen; P always pauses. */
  escPause?: boolean;
  /** Development only: shorter hint rules, so the screenshot script reaches the rewarded hint quickly. */
  testBreaks?: boolean;
  /** Open on the main menu (the portal build): PLAY starts the race, the pause menu can quit back to it. */
  menu?: boolean;
  /** The game's logo for the loading screen and the menu (an image URL). */
  logoSrc?: string;
}

const hex = (c: number) => '#' + c.toString(16).padStart(6, '0');
const fmtClock = (s: number) => `${Math.floor(s / 60)}:${(s % 60).toFixed(1).padStart(4, '0')}`;
const CAMERAS: Record<CameraMode, string> = { park: 'Parking view', chase: 'Chase' };

const Key = ({ k }: { k: string }) => (
  <kbd className="bg-cream/10 border-cream/30 text-cream inline-flex min-w-5 items-center justify-center rounded-sm border border-b-2 px-1.5 text-[11px] leading-5 font-bold">{k}</kbd>
);

const ordinal = (n: number) => `${n}${n % 100 >= 11 && n % 100 <= 13 ? 'th' : ['th', 'st', 'nd', 'rd'][n % 10] ?? 'th'}`;

/**
 * Who is where, live: the cars that have parked first, in the order they parked (with their place), then the ones still looking,
 * then the ones out. It never says who is nearest the free bay. On a phone (`compact`) the panel is narrow: a parked car gets
 * its place and a tick, a car that is out gets OUT.
 */
const Standings = ({ hud, compact }: { hud: HudState; compact: boolean }) => (
  <ol className={`panel-cut bg-ink-deep/75 backdrop-blur-sm ${compact ? 'w-[8.5rem] p-1' : 'w-52 p-2 sm:w-64'}`} aria-label="Standings">
    {hud.standings.map((s, i) => (
      <li
        key={s.id}
        className={`flex items-center ${compact ? 'gap-1.5 px-1.5 py-0.5 text-xs' : 'gap-2 px-2 py-1 text-sm'} ${s.me ? 'bg-gold/20 text-gold font-bold' : 'text-cream/85'}`}
      >
        <span className={`font-display text-xs ${compact ? 'w-2.5' : 'w-4'}`}>{i + 1}</span>
        <span className="h-3 w-3 shrink-0 rounded-sm border border-black/50" style={{ background: hex(s.color) }} />
        <span className="min-w-0 flex-1 truncate">{s.me ? 'You' : s.name}</span>
        {compact ? (
          (s.parked || s.out) && (
            <span className={`font-display shrink-0 text-[10px] ${s.parked ? 'text-green' : 'text-orange'}`}>
              {s.parked ? <span aria-label={`parked ${ordinal(s.place)}`}>{ordinal(s.place)} ✓</span> : 'OUT'}
            </span>
          )
        ) : (
          <span className={`tabular-nums ${s.parked ? 'font-display text-green text-xs' : s.out ? 'font-display text-orange text-xs' : 'text-cream/50 text-xs'}`}>
            {s.parked ? `PARKED ${ordinal(s.place)}` : s.out ? 'OUT' : 'looking'}
          </span>
        )}
      </li>
    ))}
  </ol>
);

/**
 * Your place in a race as it stands, big, beside the clock: the place you would take by parking now (one after every rival
 * already parked), green with a tick once you have parked, OUT once you are out.
 */
const PlaceBadge = ({ hud }: { hud: HudState }) => {
  const { now, of, parked, out } = hud.place;
  const tone = out ? 'text-orange' : parked ? 'text-green' : now === 1 ? 'text-gold' : 'text-cream';
  return (
    <div
      className={`panel-cut bg-ink-deep/80 font-display flex items-baseline gap-1 px-2.5 py-1 leading-none sm:px-3 ${tone}`}
      role="status"
      aria-label={out ? 'You are out' : parked ? `You parked ${ordinal(now)} of ${of}` : `Place ${ordinal(now)} of ${of}${now > 1 ? `, ${now - 1} parked ahead of you` : ''}`}
    >
      {out ? (
        <span className="self-center text-base sm:text-xl">OUT</span>
      ) : (
        <>
          <span key={now} className="text-xl tabular-nums sm:text-3xl" style={{ animation: 'riseIn 0.3s ease-out both' }}>{now}</span>
          <span className="text-xs sm:text-sm">{ordinal(now).slice(-2).toUpperCase()}</span>
          <span className="text-cream/50 text-xs sm:text-sm">/{of}</span>
          {parked && <span className="text-sm sm:text-base" aria-hidden="true">✓</span>}
        </>
      )}
    </div>
  );
};

/** What the bots say over the radio: the latest few lines, each fading out. */
const Radio = ({ hud, compact }: { hud: HudState; compact: boolean }) => (
  <ul className={`flex flex-col gap-1 ${compact ? 'w-44' : 'w-60 sm:w-72'}`} aria-label="Radio" aria-live="off">
    {hud.chat.map((l) => (
      <li
        key={l.id}
        className={`bg-ink-deep/75 border-l-4 px-2 py-1 backdrop-blur-sm ${compact ? 'text-[10px] leading-tight' : 'text-xs'}`}
        style={{ borderColor: hex(l.color), opacity: l.age > 5 ? Math.max(0, 6.5 - l.age) / 1.5 : 1, animation: 'riseIn 0.25s ease-out both' }}
      >
        <span className="font-bold" style={{ color: hex(l.color) === '#3a3d44' ? '#9aa3b2' : hex(l.color) }}>{l.name}</span>
        <span className="text-cream/90">{': '}{l.text}</span>
      </li>
    ))}
  </ul>
);

const Meter = ({ hud }: { hud: HudState }) => {
  const parked = hud.park >= 1;
  const hint = parked ? 'Parked' : hud.inBay < 0.999 ? 'Straighten up' : hud.speed > 1.6 ? 'Stop' : 'Inside the lines';
  return (
    <div
      className="panel-cut bg-ink-deep/80 pointer-events-none w-56 p-3 text-center backdrop-blur-sm"
      style={{ animation: hud.inBay >= 0.999 ? 'glowPulse 1s ease-in-out infinite' : undefined }}
    >
      <div className="font-display text-sm tracking-wide" style={{ color: hud.inBay >= 0.999 ? '#3ddc84' : '#e6ebf5' }}>{hint}</div>
      <div className="bg-cream/10 mt-2 h-2.5 w-full overflow-hidden rounded-sm" role="progressbar" aria-label="Park progress" aria-valuenow={Math.round(hud.park * 100)} aria-valuemin={0} aria-valuemax={100}>
        <div className="bg-green h-full" style={{ width: `${Math.round(hud.park * 100)}%`, transition: 'width 0.1s linear' }} />
      </div>
      <div className="bg-cream/10 mt-1.5 h-1 w-full overflow-hidden rounded-sm">
        <div className="bg-blue h-full" style={{ width: `${Math.round(hud.inBay * 100)}%` }} />
      </div>
    </div>
  );
};

/** Six dots: cleared stages filled, the one you are on gold and larger, unlocked ones outlined, locked ones dim. */
const StageDots = ({ hud }: { hud: HudState }) => (
  <div className="flex items-center justify-center gap-2" role="img" aria-label={`Stage ${hud.stage.n} of ${hud.stage.total}`}>
    {Array.from({ length: hud.stage.total }, (_, i) => {
      const n = i + 1;
      const now = n === hud.stage.n;
      const cleared = n < hud.stage.unlocked;
      return (
        <span
          key={n}
          className={`rounded-full ${now ? 'bg-gold h-3.5 w-3.5 ring-2 ring-gold/40' : cleared ? 'bg-green h-2.5 w-2.5' : n <= hud.stage.unlocked ? 'border-cream/70 h-2.5 w-2.5 border-2' : 'bg-cream/25 h-2.5 w-2.5'}`}
        />
      );
    })}
  </div>
);

/**
 * The card before each round: which stage this is and what is new in it (the 3-2-1 itself is `Countdown`, in the middle of the
 * screen). On a phone it sits between the standings and the right-hand buttons.
 */
const Intro = ({ hud, touch, onboard }: { hud: HudState; touch: boolean; onboard: boolean }) => (
  <div
    className={`pointer-events-none absolute z-[5] flex flex-col items-center gap-1.5 bg-[radial-gradient(ellipse_at_center,rgba(10,13,24,0.72),rgba(10,13,24,0.3)_70%,transparent)] px-6 py-3 text-center sm:gap-3 sm:py-6 ${touch ? 'portrait:top-[250px] portrait:inset-x-2 landscape:top-[96px] landscape:inset-x-[10.5rem] landscape:py-1' : 'inset-x-0'}`}
    style={{ ...(touch ? {} : { top: 'calc(48px + env(safe-area-inset-top))' }), animation: 'fadeIn 0.3s ease-out both' }}
    role="group"
    aria-label={`Stage ${hud.stage.n}: ${hud.stage.name}`}
  >
    <div className="font-display text-gold text-2xl leading-none drop-shadow-[0_4px_24px_rgba(0,0,0,0.85)] sm:text-6xl [@media(max-height:420px)]:text-xl" style={{ animation: 'riseIn 0.5s ease-out both' }}>
      {hud.stage.n > 0 ? hud.stage.name : 'ONE SPACE LEFT'}
    </div>
    {onboard && <Onboarding touch={touch} />}
    {hud.hinted && (
      <div className="panel-cut bg-gold/90 text-ink-deep px-3 py-1 text-xs font-bold tracking-wide sm:text-sm" style={{ animation: 'fadeIn 0.4s ease-out both' }}>
        HINT: the free space is inside the yellow circle on your map
      </div>
    )}
    {!onboard && hud.stage.news && (
      <div className="text-cream/90 max-w-md text-xs drop-shadow-[0_2px_8px_rgba(0,0,0,0.8)] sm:text-base [@media(max-height:420px)]:hidden portrait:max-sm:hidden" style={{ animation: 'fadeIn 0.8s ease-out both' }}>
        {hud.stage.news} Three rivals are looking too.
      </div>
    )}
    {hud.stage.n > 0 && <StageDots hud={hud} />}
  </div>
);

const Lock = () => (
  <svg viewBox="0 0 16 16" className="mx-auto h-3.5 w-3.5" aria-hidden="true" fill="currentColor">
    <path d="M5 7V5a3 3 0 1 1 6 0v2h1a1 1 0 0 1 1 1v6a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V8a1 1 0 0 1 1-1zm1.6 0h2.8V5a1.4 1.4 0 1 0-2.8 0z" />
  </svg>
);

/** The stage chips: cleared and open stages can be played, the rest are locked until you park first in the one before. */
const StageChips = ({ hud, game, onPick, via }: { hud: HudState; game: Game | null; onPick?: () => void; via?: (action: () => void) => void }) => (
  <div className="flex flex-wrap justify-center gap-1.5" role="group" aria-label="Stages">
    {Array.from({ length: hud.stage.total }, (_, i) => {
      const n = i + 1;
      const locked = n > hud.stage.unlocked;
      const now = n === hud.stage.n;
      return (
        <button
          key={n}
          type="button"
          disabled={locked}
          aria-current={now ? 'step' : undefined}
          aria-label={`Stage ${n}${locked ? ', locked' : now ? ', current' : ''}`}
          onClick={() => {
            const go = () => game?.selectStage(n);
            if (via) via(go);
            else go();
            onPick?.();
          }}
          className={`font-display min-h-9 min-w-9 px-2 text-sm transition ${now ? 'bg-gold text-ink-deep' : locked ? 'bg-cream/5 text-cream/30 cursor-not-allowed' : 'bg-cream/10 text-cream hover:bg-cream/20'}`}
        >
          {locked ? <Lock /> : n}
        </button>
      );
    })}
  </div>
);

/** The free-spaces board as a HUD panel: the same words as the LED sign over the gate and at the garage door. */
const Board = ({ hud }: { hud: HudState }) => (
  <div className="panel-cut bg-ink-deep/85 pointer-events-none flex flex-col items-center px-3 py-1 font-mono tracking-widest" aria-label="Free spaces board" role="status">
    <span className="text-[11px] font-bold text-[#ffb02e] sm:text-sm">FREE SPACES: {hud.board.free}</span>
    {hud.board.line && (
      <span className="text-[10px] font-bold sm:text-xs" style={{ color: hud.board.deckColor !== null ? hex(hud.board.deckColor) : '#ff7a2e' }}>
        {hud.board.line}
      </span>
    )}
  </div>
);

/** One tab per level above the minimap; a dot marks the level you are on. */
const MapTabs = ({ hud, game }: { hud: HudState; game: Game | null }) =>
  hud.mapLevels.length < 2 ? null : (
  <div className="pointer-events-auto flex gap-0.5" role="tablist" aria-label="Minimap level">
    {hud.mapLevels.map((l) => {
      const on = hud.mapLevel === l.level;
      return (
        <button
          key={l.level}
          type="button"
          role="tab"
          aria-selected={on}
          aria-label={`Level ${l.name}${hud.level === l.level ? ', you are here' : ''}`}
          onClick={() => game?.setMapLevel(l.level)}
          className="font-display relative min-w-9 px-1.5 py-0.5 text-[11px] leading-4 transition sm:min-w-11 sm:py-1 sm:text-xs"
          style={{ background: on ? hex(l.color) : 'rgba(10,13,24,0.8)', color: on ? (l.level === 2 ? '#15161a' : '#fff') : hex(l.color), outline: on ? 'none' : `1px solid ${hex(l.color)}66` }}
        >
          {l.name}
          {hud.level === l.level && <span className="absolute -top-0.5 -right-0.5 h-2 w-2 rounded-full bg-[#ffd23f] ring-1 ring-black/60" />}
        </button>
      );
    })}
  </div>
  );

const HINT_BTN = 'panel-cut bg-blue/90 text-ink-deep flex flex-1 items-center justify-center gap-2 px-3 py-2.5 text-sm font-bold uppercase leading-tight tracking-wide transition hover:brightness-110 active:scale-95';

const TIER_NAME: Record<Tier, string> = { low: 'Low', medium: 'Mid', high: 'High' };

/** The "this needs a video ad" mark on the rewarded button. */
const VideoIcon = () => (
  <svg viewBox="0 0 24 24" className="h-5 w-5 shrink-0" aria-label="Video ad" role="img" fill="currentColor">
    <rect x="2" y="5" width="15" height="14" rx="2" />
    <path d="M18 10l4-2.5v9L18 14z" />
  </svg>
);

/** While an ad is requested or plays: the game is paused and the UI blocked until it ends (the portal draws the ad on top). */
const BreakCover = () => (
  <div className="bg-ink-deep/90 absolute inset-0 z-50 flex flex-col items-center justify-center gap-3 p-6 text-center" role="alertdialog" aria-label="Ad break" aria-busy="true">
    <div className="font-display text-gold text-2xl sm:text-4xl">Your hint is loading</div>
    <div className="text-cream/80 text-sm sm:text-base">The next round starts right after the ad.</div>
    <div className="border-gold/30 border-t-gold mt-2 h-8 w-8 animate-spin rounded-full border-4" aria-hidden="true" />
  </div>
);

const Stat = ({ label, value }: { label: string; value: string }) => (
  <div className="bg-ink-deep/70 px-3 py-2 text-center">
    <div className="text-lilac text-[10px] font-semibold tracking-widest uppercase">{label}</div>
    <div className="font-display text-cream text-lg">{value}</div>
  </div>
);

const Result = ({ hud, game, session, exit, support: Support, onMenu }: { hud: HudState; game: Game | null; session: Session; exit?: RaceProps['exit']; support?: SupportSlot; onMenu?: () => void }) => {
  const r = hud.result!;
  const st = hud.stage;
  const unlockedNow = r.won && st.hasNext;
  return (
    <div className="absolute inset-0 z-30 flex items-center justify-center bg-ink-deep/70 p-4 backdrop-blur-sm" style={{ animation: 'fadeIn 0.4s ease-out both' }} role="dialog" aria-label="Result">
      <div className="panel-cut bg-ink border-blue/20 max-h-[calc(100dvh-16px)] w-full max-w-md overflow-y-auto border p-4 text-center sm:p-6" style={{ animation: 'riseIn 0.5s ease-out both' }}>
        {st.n > 0 && <div className="text-lilac text-sm font-semibold">Stage {st.n} · {st.name}</div>}
        <div className={`font-display text-3xl sm:text-4xl ${r.won ? 'text-green' : 'text-orange'}`}>
          {r.reason === 'pedestrian' || r.reason === 'crash' ? 'DISQUALIFIED' : r.won ? 'PARKED FIRST' : r.winner ? `${r.winner} took your spot` : 'Out of time'}
        </div>
        {r.reason === 'crash' && <p className="text-cream/85 mt-2 text-sm">You hit {r.hit}. Touching a car or anything hard puts you out, so your round is over.</p>}
        {r.reason === 'pedestrian' && <p className="text-cream/85 mt-2 text-sm">You hit a pedestrian. Shoppers have right of way, so your round is over.</p>}
        {unlockedNow && <p className="text-gold mt-2 text-sm">Stage {st.n + 1} is open now.</p>}
        {r.won && !st.hasNext && st.n === st.total && <p className="text-gold mt-2 text-sm">You cleared every stage.</p>}
        <div className="font-display text-gold mt-2 text-5xl sm:text-6xl">#{r.place}<span className="text-lilac text-2xl">/4</span></div>
        <div className="mt-3 grid grid-cols-2 gap-1.5 sm:mt-4 [@media(max-height:420px)]:hidden">
          <Stat label="Time" value={fmtClock(r.time)} />
          <Stat label="Top speed" value={`${Math.round(r.topSpeed)} km/h`} />
          <Stat label="Bumps" value={String(r.bumps)} />
          <Stat label="Pedestrians hit" value={String(r.incidents)} />
          <Stat label="Distance" value={`${Math.round(r.distance)} m`} />
        </div>
        {st.n > 0 && (
          <div className="mt-4">
            <StageChips hud={hud} game={game} via={(go) => session.next(go)} />
          </div>
        )}
        {session.hintOffer && (
          // The optional hint, and the plain retry beside it in exactly the same size, font and colour: skipping is as easy as watching.
          <div className="mt-4 flex gap-2" role="group" aria-label="Optional hint">
            <button type="button" onClick={() => void session.takeHint()} className={HINT_BTN}>
              {session.hintOffer === 'ad' && <VideoIcon />}
              <span>{session.hintOffer === 'ad' ? 'Watch ad: retry with a hint' : 'Free hint: retry with a hint'}</span>
            </button>
            <button type="button" onClick={() => session.next(() => game?.newRound())} className={HINT_BTN}>
              <span>No thanks: retry</span>
            </button>
          </div>
        )}
        {session.notice && <p className="text-cream/80 mt-3 text-sm">{session.notice}</p>}
        <div className="mt-4 flex flex-col gap-3 sm:mt-5 sm:flex-row [@media(max-height:420px)]:flex-row [@media(max-height:420px)]:gap-2">
          {unlockedNow && (
            <button type="button" autoFocus onClick={() => session.next(() => game?.nextStage())} className="panel-cut bg-gold font-display text-ink-deep flex flex-[1.7] items-center justify-center px-4 py-3 text-base whitespace-nowrap [@media(max-height:420px)]:py-2 transition hover:brightness-110 active:scale-95 sm:text-lg">
              Next stage →
            </button>
          )}
          {!session.hintOffer && <button
            type="button"
            autoFocus={!unlockedNow}
            onClick={() => session.next(() => game?.newRound())}
            className={`panel-cut font-display flex flex-1 items-center justify-center px-4 py-3 text-base transition active:scale-95 sm:text-lg ${unlockedNow ? 'bg-cream/10 text-cream hover:bg-cream/20' : 'bg-gold text-ink-deep hover:brightness-110'}`}
          >
            Retry
          </button>}
          {onMenu && (
            <button type="button" onClick={onMenu} className="panel-cut bg-cream/10 font-display text-cream flex flex-1 items-center justify-center px-4 py-3 text-base transition hover:bg-cream/20 active:scale-95 sm:text-lg">
              Menu
            </button>
          )}
          {exit?.({ className: 'panel-cut bg-cream/10 font-display text-cream flex flex-1 items-center justify-center px-4 py-3 text-base transition hover:bg-cream/20 active:scale-95 sm:text-lg', label: 'Home' })}
        </div>
        <p className="text-lilac mt-3 hidden text-xs sm:block"><Key k="Enter" /> {unlockedNow ? 'goes to the next stage' : 'tries again'}</p>
        {Support && (
          <div className="mt-4">
            <Support variant="card" />
          </div>
        )}
      </div>
    </div>
  );
};

const PAUSE_BTN = 'menu-item font-display flex min-h-12 w-full -skew-x-6 items-center px-5 text-left text-xl uppercase sm:text-2xl';

/** Paused: Resume · Settings · Quit to menu (the same settings panel as the main menu), and the stage chips. */
const PauseMenu = ({
  hud,
  game,
  onResume,
  onSettings,
  onQuit,
  exit,
  support: Support,
  credit,
  onRetry,
  onMap,
}: {
  hud: HudState;
  game: Game | null;
  onResume: () => void;
  onSettings: () => void;
  onQuit?: () => void;
  onRetry?: () => void;
  onMap?: () => void;
  exit?: RaceProps['exit'];
  support?: SupportSlot;
  credit?: string;
}) => {
  const ref = useRef<HTMLDivElement>(null);
  useMenuNav(ref, onResume);
  usePadNav(ref, { onBack: onResume });
  return (
    <div className="bg-ink-deep/70 absolute inset-0 z-30 flex items-stretch backdrop-blur-[3px]" role="dialog" aria-label="Paused" data-keys-capture>
      <div
        ref={ref}
        className="settings bg-ink-deep/95 bay-lines flex w-full max-w-md flex-col justify-center overflow-y-auto px-6 py-6 shadow-[24px_0_80px_rgba(0,0,0,0.6)] sm:px-10"
        style={{ animation: 'panelIn 0.28s cubic-bezier(0.2,0.8,0.2,1) both', paddingLeft: 'calc(24px + env(safe-area-inset-left))' }}
      >
        <div className="kerb mb-5 h-1.5 w-24" aria-hidden="true" />
        <div className="font-display text-gold -skew-x-6 text-5xl leading-none sm:text-6xl">Paused</div>
        {hud.campaign ? (
          <div className="text-lilac mt-2 text-sm font-semibold">{levelTag(hud.campaign)} · {hud.campaign.name} · {CAMERAS[hud.camera]}</div>
        ) : (
          hud.stage.n > 0 && <div className="text-lilac mt-2 text-sm font-semibold">Stage {hud.stage.n} · {hud.stage.name} · {CAMERAS[hud.camera]}</div>
        )}
        <div className="mt-6 flex flex-col gap-1.5">
          <button type="button" data-nav autoFocus onClick={onResume} className={`${PAUSE_BTN} bg-gold text-ink-deep hover:!text-ink-deep focus-visible:!text-ink-deep`}>
            <span className="inline-block skew-x-6">Resume</span>
          </button>
          {onRetry && (
            <button type="button" data-nav onClick={onRetry} className={`${PAUSE_BTN} text-cream`}>
              <span className="inline-block skew-x-6">Restart level</span>
            </button>
          )}
          {onMap && (
            <button type="button" data-nav onClick={onMap} className={`${PAUSE_BTN} text-cream`}>
              <span className="inline-block skew-x-6">{hud.campaign?.type === 'race' ? 'Race list' : 'Level map'}</span>
            </button>
          )}
          <button type="button" data-nav onClick={onSettings} className={`${PAUSE_BTN} text-cream`}>
            <span className="inline-block skew-x-6">Settings</span>
          </button>
          {onQuit && (
            <button type="button" data-nav onClick={onQuit} className={`${PAUSE_BTN} text-cream`}>
              <span className="inline-block skew-x-6">Quit to menu</span>
            </button>
          )}
          {exit?.({ className: `${PAUSE_BTN} text-cream`, label: 'Leave' })}
        </div>
        {hud.stage.n > 0 && !hud.campaign && (
          <div className="mt-6">
            <div className="text-lilac mb-1.5 text-[11px] font-semibold tracking-[0.25em] uppercase">Jump to stage</div>
            <StageChips hud={hud} game={game} />
          </div>
        )}
        {Support && (
          <div className="mt-5">
            <Support />
          </div>
        )}
        {credit && <div className="text-lilac mt-6 text-[11px] tracking-wide">A game by {credit}</div>}
      </div>
    </div>
  );
};

/** The manual gearbox's dial: a big gear letter, a rev bar with a red zone, and a shift light that flashes at the top. */
const Tacho = ({ m, speed, compact }: { m: NonNullable<HudState['manual']>; speed: number; compact: boolean }) => {
  const share = Math.max(0, Math.min(1, (m.rpm - m.idle * 0.6) / (m.redline - m.idle * 0.6)));
  const segs = compact ? 14 : 20;
  const lit = Math.round(share * segs);
  return (
    <div className={`flex items-end gap-3 ${compact ? 'flex-row-reverse' : ''}`} aria-label={`Gear ${m.gear}, ${Math.round(m.rpm)} rpm`} role="status">
      <div className="flex flex-col items-end gap-1">
        <div className="flex items-center gap-1.5">
          <span
            className={`h-3 w-3 rounded-full ${m.light || m.limiter ? 'bg-orange shadow-[0_0_14px_var(--color-orange)]' : 'bg-cream/15'}`}
            style={m.limiter ? { animation: 'limiter 0.12s steps(1) infinite' } : m.light ? { animation: 'limiter 0.3s steps(1) infinite' } : undefined}
            aria-hidden="true"
          />
          <span className="text-lilac text-[10px] font-bold tracking-widest uppercase">{m.limiter ? 'Limiter' : m.light ? 'Shift' : `${(m.rpm / 1000).toFixed(1)}k`}</span>
        </div>
        <div className={`flex items-end gap-[3px] ${compact ? 'h-5' : 'h-7'}`} aria-hidden="true">
          {Array.from({ length: segs }, (_, i) => {
            const red = i >= segs * 0.84;
            const on = i < lit;
            return (
              <span
                key={i}
                className={`w-1.5 -skew-x-12 ${on ? (red ? 'bg-orange' : i >= segs * 0.68 ? 'bg-gold' : 'bg-green') : red ? 'bg-orange/20' : 'bg-cream/12'}`}
                style={{ height: `${35 + (i / segs) * 65}%` }}
              />
            );
          })}
        </div>
        <div className="text-cream/80 text-xs font-bold tabular-nums">{Math.round(speed)} km/h</div>
      </div>
      <div
        key={`${m.shiftId}-${m.denied}`}
        className={`font-display bg-ink-deep/80 flex items-center justify-center border-2 leading-none ${m.gear === 'R' ? 'border-orange text-orange' : m.gear === 'N' ? 'border-cream/40 text-cream/70' : 'border-gold text-gold'} ${compact ? 'h-12 w-11 text-3xl' : 'h-16 w-14 text-5xl'}`}
        style={{ animation: 'shiftFlash 0.25s ease-out both' }}
      >
        {m.gear}
      </div>
    </div>
  );
};

/** The keys bound to an action, as keycaps. */
const BoundKeys = ({ b, a }: { b: Bindings; a: keyof Bindings }) => (
  <>
    {b[a].filter(Boolean).map((c, i) => (
      <span key={c}>
        {i > 0 && ' '}
        <Key k={keyLabel(c)} />
      </span>
    ))}
  </>
);

/** The race: full-screen canvas, the HUD on top, touch controls on phones. */
export const Race = ({ platform: given, flavour = 'studio', exit, support, credit, escPause = true, testBreaks = false, menu = false, logoSrc }: RaceProps) => {
  const canvas = useRef<HTMLCanvasElement>(null);
  const minimap = useRef<HTMLCanvasElement>(null);
  const pointer = useRef<HTMLDivElement>(null);
  const gameRef = useRef<Game | null>(null);
  const [game, setGame] = useState<Game | null>(null);
  const [hud, setHud] = useState<HudState | null>(null);
  const platform = useMemo(() => given ?? createWebPlatform(), [given]);
  const touch = useTouch(platform.deviceType());
  const [settings, store] = useSettings(platform);
  const settingsRef = useRef(settings);
  settingsRef.current = settings;
  /** The settings panel over the pause menu. */
  const [pauseSettings, setPauseSettings] = useState(false);
  const [portalMuted, setPortalMuted] = useState(() => platform.muted());
  useEffect(() => platform.onMutedChange(setPortalMuted), [platform]);
  /** Enter on the result card goes through the session (an ad break may come first), like the buttons. */
  const confirmRef = useRef<() => void>(() => gameRef.current?.confirm());
  /** Rounds started this visit: the rule card shows on the first stage-1 rounds. */
  const [roundsSeen, setRoundsSeen] = useState(0);
  const campaign = useCampaign(platform);
  /**
   * A screen over the game: the game modes (over the live lot in the portal's menu), or the campaign's level map (the game is
   * not drawn behind it). Our own site opens on the modes.
   */
  const [screen, setScreen] = useState<{ kind: 'modes'; view?: ModesView; focus?: string } | { kind: 'map'; focus?: string } | null>(menu ? null : { kind: 'modes' });
  const map = screen?.kind === 'map' ? screen : null;
  const modes = screen?.kind === 'modes' ? screen : null;
  /** The level being played and the round of its first attempt (the intro card is shorter on a retry). */
  const attempts = useRef<{ id: string; n: number }>({ id: '', n: 0 });

  /** How far the load has really got (the bar eases only towards these checkpoints), the bar at 100, and the screen gone. */
  const [loadStep, setLoadStep] = useState<LoadStep>('page');
  const [loadFull, setLoadFull] = useState(false);
  const [loadGone, setLoadGone] = useState(false);
  /** The light-streak wipe over a screen change (menu, map, level, result), with a whoosh. */
  const [wipe, setWipe] = useState<{ id: number; kind: WipeKind }>({ id: 0, kind: 'map' });
  const playWipe = useCallback((kind: WipeKind) => {
    setWipe((w) => ({ id: w.id + 1, kind }));
    gameRef.current?.uiSound('whoosh');
  }, []);

  useEffect(() => {
    let cancelled = false;
    platform.loadingStart();
    void import('~/game/render/game').then(async ({ Game }) => {
      if (cancelled || !canvas.current) return;
      // The engine has arrived; let the bar show it before the lot is built (that blocks the page for a moment).
      setLoadStep('engine');
      await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
      if (cancelled || !canvas.current) return;
      const facts = deviceFacts(platform.deviceType());
      const s = settingsRef.current;
      const g = new Game(canvas.current, {
        mode: 'race',
        onHud: setHud,
        onConfirm: () => confirmRef.current(),
        flavour,
        tier: resolveTier(s.graphics.quality, facts),
        autoTier: s.graphics.quality === 'auto',
        escPause,
        camera: s.camera.mode,
        onCamera: (m) => store.set('camera', { mode: m }),
        menu,
      });
      g.attachMinimap(minimap.current);
      g.attachPointer(pointer.current);
      gameRef.current = g;
      setGame(g);
      setLoadStep('built');
      if (process.env.NODE_ENV !== 'production') Object.assign(window, { __game: g, __levels: ALL_LEVELS });
    });
    return () => {
      cancelled = true;
      gameRef.current?.dispose();
      gameRef.current = null;
    };
  }, [platform, flavour, escPause, menu, store]);

  useApplySettings(game, settings, platform);
  // The first frame is drawn and the bar has run to 100: the loading screen fades out, then goes.
  const ready = !!hud;
  useEffect(() => {
    if (!loadFull) return;
    const t = window.setTimeout(() => setLoadGone(true), 350);
    return () => window.clearTimeout(t);
  }, [loadFull]);
  // Nothing is drawn behind the map (nor behind the modes on our own site, where no menu lot is running).
  const hideGame = !!map || (!!modes && !menu);
  useEffect(() => {
    game?.setHidden(hideGame);
  }, [game, hideGame]);
  const paused = !!hud?.paused;
  useEffect(() => {
    if (!paused) setPauseSettings(false);
  }, [paused]);

  const onInput = useCallback((i: Parameters<Game['setTouch']>[0]) => gameRef.current?.setTouch(i), []);

  const inMenu = !!hud?.menu;
  const showResult = !inMenu && !!hud?.result && hud.endedFor >= (hud.result.reason === 'pedestrian' || hud.result.reason === 'crash' ? 2.2 : 1.2);
  const showMeter = !inMenu && !!hud && hud.phase !== 'countdown' && (hud.inBay > 0 || hud.park > 0) && !hud.result;
  // The keys stay on screen the whole time you drive (a quiet strip at the foot), except while the park meter has that spot.
  const showHint = !inMenu && !touch && !!hud && hud.phase !== 'done' && !hud.paused && !showMeter && !hud.result;
  const session = useSession(game, hud, platform, showResult, testBreaks ? { hintEvery: 10, freeHintAfter: 3 } : undefined);

  const lvHud = !inMenu ? (hud?.campaign ?? null) : null;
  const nextLevel = lvHud?.run?.failed === null ? nextOpenLevel(campaign.progress, levelById(lvHud.id)!) : null;
  const playLevel = useCallback((id: string) => {
    playWipe('level');
    setScreen(null);
    campaign.clearNews();
    gameRef.current?.playLevel(id);
  }, [campaign, playWipe]);
  /** Back to where a level was picked: the campaign's map, or Race mode's list. */
  const openMap = useCallback((focus?: string) => {
    playWipe('map');
    const l = focus ? levelById(focus) : undefined;
    if (l && isRace(l)) {
      setScreen({ kind: 'modes', view: 'races', focus });
      // The portal's modes stand over the live menu lot, not over the level that just ended.
      if (menu) gameRef.current?.enterMenu();
    } else setScreen({ kind: 'map', focus });
  }, [playWipe, menu]);
  const openModes = useCallback(() => (playWipe('menu'), setScreen({ kind: 'modes' })), [playWipe]);
  confirmRef.current = () => {
    if (lvHud?.run) session.next(() => (nextLevel ? playLevel(nextLevel.id) : (campaign.clearNews(), gameRef.current?.retry())));
    else session.next(() => gameRef.current?.confirm());
  };
  // The result card arrives under a sweep.
  useEffect(() => {
    if (showResult) playWipe('result');
  }, [showResult, playWipe]);
  // A level's result: record it (once per attempt) as soon as the card shows.
  useEffect(() => {
    if (showResult && lvHud?.run) campaign.record(`${lvHud.id}:${lvHud.round}`, lvHud);
  }, [showResult, lvHud, campaign]);
  // The first attempt at a level gets the full intro card; a retry the short one.
  if (lvHud && attempts.current.id !== lvHud.id) attempts.current = { id: lvHud.id, n: lvHud.round };
  const firstTry = !!lvHud && attempts.current.n === lvHud.round;

  // Count the rounds (each new countdown is a new round), for the rule card.
  const phase = hud?.phase;
  useEffect(() => {
    if (phase === 'countdown') setRoundsSeen((n) => n + 1);
  }, [phase]);
  const onboard = !inMenu && !!hud && hud.stage.n === 1 && roundsSeen <= 2 && !hud.hinted;

  return (
    <main className="fixed inset-0 overflow-hidden bg-ink-deep select-none" onPointerDown={() => gameRef.current?.unlockAudio()}>
      <canvas ref={canvas} className="absolute inset-0 h-full w-full touch-none" />
      {/* The hint pulse's arrow (guidance.ts): shown for a few seconds only, over the bay or at the screen edge in its direction. */}
      <div ref={pointer} className="pointer-events-none absolute top-0 left-0 z-[12] flex flex-col items-center gap-0.5 transition-opacity duration-200" style={{ opacity: 0 }} aria-hidden="true">
        <div className="flex h-12 w-12 items-center justify-center rounded-full border-2 border-[#ffd23f] bg-[#0a0d18]/80 shadow-[0_0_18px_rgba(255,210,63,0.6)] sm:h-14 sm:w-14">
          <svg viewBox="0 0 24 24" className="h-7 w-7" fill="#ffd23f"><path d="M5 11h9.2l-3.6-3.6L12 6l6 6-6 6-1.4-1.4 3.6-3.6H5z" /></svg>
        </div>
        <div className="rounded-sm bg-[#0a0d18]/85 px-1.5 py-0.5 text-[11px] font-bold whitespace-nowrap text-[#ffd23f]">
          <span className="font-display mr-1">P</span>
          <span data-dist />
        </div>
      </div>
      {settings.graphics.showFps && hud && (
        <div className="bg-ink-deep/70 text-green pointer-events-none absolute z-[60] px-1.5 py-0.5 font-mono text-[11px] font-bold tabular-nums" style={{ bottom: 'calc(4px + env(safe-area-inset-bottom))', right: 'calc(4px + env(safe-area-inset-right))' }}>
          {Math.round(hud.fps)} FPS
        </div>
      )}
      <div
        className="absolute z-10 flex flex-col gap-1"
        style={{
          left: 'calc(10px + env(safe-area-inset-left))',
          ...(touch ? { top: 'calc(112px + env(safe-area-inset-top))' } : { bottom: 'calc(10px + env(safe-area-inset-bottom))' }),
          visibility: hud && !inMenu ? 'visible' : 'hidden',
        }}
      >
        {hud && <MapTabs hud={hud} game={gameRef.current} />}
        <canvas ref={minimap} width={360} height={216} className={`border-cream/25 pointer-events-none border-2 ${touch ? 'h-[4.8rem] w-32' : 'h-28 w-[11.7rem] sm:h-44 sm:w-[18.3rem]'}`} aria-label="Minimap" />
      </div>

      {!loadGone && <LoadingScreen step={ready ? 'ready' : loadStep} leaving={loadFull} logoSrc={logoSrc} onDone={() => setLoadFull(true)} />}
      <Wipe id={wipe.id} kind={wipe.kind} />

      {hud && inMenu && !modes && (
        <MainMenu
          hud={hud}
          settings={settings}
          store={store}
          touch={touch}
          tier={hud.tier}
          portalMuted={portalMuted}
          logoSrc={logoSrc}
          onPlay={openModes}
          onSound={(k) => gameRef.current?.uiSound(k)}
          campaign={campaign.progress}
          platform={platform}
          shown={loadGone}
        />
      )}

      {hud && modes && (
        <Modes
          key={`${modes.view ?? 'root'}:${modes.focus ?? ''}`}
          progress={campaign.progress}
          stage={hud.stage}
          initialView={modes.view}
          focus={modes.focus}
          solid={!menu}
          onCampaign={() => openMap()}
          onRace={playLevel}
          onEndless={(n) => {
            playWipe('level');
            setScreen(null);
            gameRef.current?.startRace(n);
          }}
          onBack={
            menu
              ? () => {
                  playWipe('menu');
                  setScreen(null);
                  gameRef.current?.enterMenu();
                }
              : undefined
          }
          home={menu ? undefined : exit?.({ className: 'panel-cut bg-cream/10 font-display text-cream hover:bg-cream/20 flex min-h-11 items-center gap-1 px-3 text-sm sm:text-base', label: '← Home' })}
          onSound={(k) => gameRef.current?.uiSound(k)}
        />
      )}

      {hud && map && (
        <CampaignMap
          progress={campaign.progress}
          focus={map.focus}
          onPlay={playLevel}
          onBack={() => {
            playWipe('menu');
            setScreen({ kind: 'modes' });
          }}
          onSound={(k) => gameRef.current?.uiSound(k)}
        />
      )}

      {hud && !inMenu && !screen && (
        <>
          <div className="pointer-events-none absolute z-10" style={{ top: 'calc(10px + env(safe-area-inset-top))', left: 'calc(10px + env(safe-area-inset-left))' }}>
            <div className="flex flex-col gap-2">
              {!lvHud?.solo && <Standings hud={hud} compact={touch} />}
              {!touch && !lvHud?.solo && <Radio hud={hud} compact={false} />}
            </div>
          </div>
          {touch && !lvHud?.solo && (
            <div className="pointer-events-none absolute z-10 flex flex-col items-start gap-1" style={{ top: 'calc(232px + env(safe-area-inset-top))', left: 'calc(10px + env(safe-area-inset-left))' }}>
              <Radio hud={hud} compact />
            </div>
          )}
          <div
            className={`pointer-events-none absolute z-10 flex items-stretch gap-1.5 ${touch ? '' : 'left-1/2 -translate-x-1/2'}`}
            style={touch ? { top: 'calc(60px + env(safe-area-inset-top))', right: 'calc(12px + env(safe-area-inset-right))' } : { top: 'calc(10px + env(safe-area-inset-top))' }}
          >
            {!lvHud?.solo && hud.phase !== 'countdown' && <PlaceBadge hud={hud} />}
            {lvHud && <LevelBar hud={hud} touch={touch} />}
            {lvHud && hud.phase === 'race' && !hud.result && (
              <HintButton hud={hud} touch={touch} onHint={() => gameRef.current?.useHint()} keyName={settings.controls.bindings.hint[0] ? keyLabel(settings.controls.bindings.hint[0]) : null} />
            )}
            {!lvHud && hud.stage.n > 0 && (
              <div className="panel-cut bg-ink-deep/75 font-display text-gold flex items-center px-2 text-xs tracking-wide whitespace-nowrap sm:px-3 sm:text-sm" aria-label={`Stage ${hud.stage.n} of ${hud.stage.total}: ${hud.stage.name}`}>
                STAGE {hud.stage.n}<span className="text-cream/60 hidden pl-1.5 sm:inline">{hud.stage.name.split(' — ')[0]}</span>
              </div>
            )}
            {/* The clock counts up; in the last ten seconds it turns red, pulses and shows what is left. */}
            {!lvHud && <div
              className={`panel-cut bg-ink-deep/75 font-display px-3 py-1 text-base tabular-nums sm:px-5 sm:py-1.5 sm:text-xl ${hud.phase === 'race' && hud.left <= 10 ? 'text-orange' : 'text-cream'}`}
              style={hud.phase === 'race' && hud.left <= 10 ? { animation: 'hurry 1s ease-in-out infinite' } : undefined}
              aria-label={hud.phase === 'race' && hud.left <= 10 ? `${Math.ceil(hud.left)} seconds left` : undefined}
            >
              {hud.phase === 'race' && hud.left <= 10 ? `0:${String(Math.ceil(hud.left)).padStart(2, '0')}` : fmtClock(hud.clock)}
            </div>}
          </div>

          {/* What to do, in words, while you drive a solo level (the first two levels keep it up the whole time). */}
          {lvHud?.solo && hud.phase === 'race' && !hud.result && hud.disqualified === null && (lvHud.n <= 2 || hud.clock < 8) && (
            <div
              className={`pointer-events-none absolute left-1/2 z-10 -translate-x-1/2 ${touch ? 'portrait:top-[calc(204px+env(safe-area-inset-top))] portrait:max-w-[92vw] landscape:top-[calc(60px+env(safe-area-inset-top))] landscape:max-w-[calc(100vw-22rem)]' : 'top-[calc(56px+env(safe-area-inset-top))] max-w-[92vw]'}`}
              style={{ animation: 'fadeIn 0.4s ease-out both' }}
              role="status"
            >
              <div className="panel-cut bg-ink-deep/80 border-gold/40 text-cream flex items-center gap-2 border px-3 py-1 text-xs font-semibold backdrop-blur-sm sm:text-sm">
                <span className="font-display bg-[#1f6fd6] px-1.5 text-white">P</span>
                {objectiveOf(lvHud)}
              </div>
            </div>
          )}
          {/* The card: through the countdown on a desktop (it sits to the side); on a phone only in the lead-in, so the 3-2-1 has the middle. */}
          {hud.phase === 'countdown' && (!touch || hud.intro) && (lvHud ? <LevelIntro hud={hud} touch={touch} compact={!firstTry} /> : <Intro hud={hud} touch={touch} onboard={onboard} />)}
          {hud.phase === 'race' && !hud.result && !lvHud?.solo && (
            // On a phone held upright the top edge has no room between the standings and the buttons: the board goes under the
            // stage and clock on the right (and the speed moves down to make way).
            <div
              className={`pointer-events-none absolute left-1/2 z-10 -translate-x-1/2 ${touch ? 'top-[calc(10px+env(safe-area-inset-top))] portrait:top-[calc(100px+env(safe-area-inset-top))] portrait:right-[calc(14px+env(safe-area-inset-right))] portrait:left-auto portrait:translate-x-0' : 'top-[calc(54px+env(safe-area-inset-top))]'}`}
            >
              <Board hud={hud} />
            </div>
          )}
          {hud.disqualified !== null && !showResult && (
            <div className="pointer-events-none absolute inset-x-0 top-1/3 z-20 -translate-y-1/2" role="alert" style={{ animation: 'fadeIn 0.2s ease-out both' }}>
              <div className="bg-orange/95 text-ink-deep w-full px-4 py-3 text-center shadow-2xl">
                <div className="font-display text-2xl sm:text-5xl">
                  {hud.dqWhy?.kind === 'car' ? 'YOU HIT A CAR' : hud.dqWhy?.kind === 'obstacle' ? `YOU HIT ${hud.dqWhy.what.toUpperCase()}` : 'YOU HIT A PEDESTRIAN'}
                </div>
                <div className="font-display text-lg tracking-widest sm:text-3xl">DISQUALIFIED</div>
                {hud.dqWhy?.kind === 'car' && <div className="text-sm font-semibold tracking-wide sm:text-xl">{hud.dqWhy.what}</div>}
              </div>
            </div>
          )}
          {hud.flash && hud.endedFor < 3 && (
            <div
              key={`f${hud.flash.id}`}
              className="fx-motion pointer-events-none absolute inset-0 z-20"
              style={{
                animation: 'screenFlash 0.6s ease-out both',
                background: hud.flash.kind === 'found' ? 'radial-gradient(circle, rgba(255,210,63,0.15) 30%, rgba(255,210,63,0.75))' : hud.flash.kind === 'win' ? 'rgba(255,255,255,0.8)' : 'radial-gradient(circle, rgba(255,60,40,0) 35%, rgba(255,60,40,0.7))',
              }}
            />
          )}
          {hud.callout && !showResult && (
            <div key={`c${hud.callout.id}`} className="pointer-events-none absolute inset-x-0 top-[38%] z-20 flex justify-center" role="status">
              <div
                className={`fx-motion font-display px-4 text-center text-4xl drop-shadow-[0_4px_0_#0a0d18] sm:text-6xl ${hud.callout.tone === 'good' ? 'text-gold' : hud.callout.tone === 'bad' ? 'text-orange' : 'text-cream'}`}
                style={{ animation: 'calloutPop 1.6s ease-out both', WebkitTextStroke: '2px #0a0d18' }}
              >
                {hud.callout.text}
              </div>
            </div>
          )}
          <Countdown hud={hud} touch={touch} />


          <div
            className={`pointer-events-none absolute z-10 text-right ${touch ? 'top-[calc(112px+env(safe-area-inset-top))] portrait:top-[calc(152px+env(safe-area-inset-top))]' : ''}`}
            style={{ right: 'calc(14px + env(safe-area-inset-right))', ...(touch ? {} : { bottom: 'calc(14px + env(safe-area-inset-bottom))' }) }}
          >
            {hud.manual ? (
              <Tacho m={hud.manual} speed={hud.speed} compact={touch} />
            ) : (
              <>
                <div className={`font-display text-cream tabular-nums drop-shadow-lg ${touch ? 'text-3xl' : 'text-5xl'}`}>{Math.round(hud.speed)}<span className="text-lilac ml-1 text-base">km/h</span></div>
                <div className="font-display text-gold text-2xl drop-shadow-lg">{hud.gear}</div>
              </>
            )}
            {(hud.inGarage || hud.level !== 0) && (
              <div className="font-display mt-1 inline-block px-2 py-0.5 text-lg" style={{ background: hex(hud.levelColor), color: hud.level === 2 ? '#15161a' : '#fff' }} aria-label={`Level ${hud.levelName}`}>
                {hud.levelName}
              </div>
            )}
          </div>

          {showMeter && (
            <div
              className={`pointer-events-none absolute left-1/2 z-10 -translate-x-1/2 ${touch ? 'bottom-[calc(16px+env(safe-area-inset-bottom))] portrait:bottom-[calc(168px+env(safe-area-inset-bottom))]' : 'bottom-[calc(16px+env(safe-area-inset-bottom))]'}`}
            >
              {lvHud?.solo ? <PrecisionMeter hud={hud} /> : <Meter hud={hud} />}
            </div>
          )}

          {showHint && (
            <div className="pointer-events-none absolute left-1/2 z-10 flex max-w-[calc(100vw-2*19.5rem)] min-w-[24rem] -translate-x-1/2 flex-wrap justify-center gap-x-4 gap-y-1 text-xs text-cream" style={{ bottom: 'calc(12px + env(safe-area-inset-bottom))', animation: 'fadeIn 0.5s ease-out both' }} aria-label="Controls">
              <span className="bg-ink-deep/75 flex flex-wrap items-center justify-center gap-x-4 gap-y-1 px-3 py-1.5 backdrop-blur-sm">
                <span><BoundKeys b={settings.controls.bindings} a="up" /> gas · <BoundKeys b={settings.controls.bindings} a="down" /> {hud.manual ? 'brake' : 'brake/reverse'}</span>
                <span><BoundKeys b={settings.controls.bindings} a="left" /> <BoundKeys b={settings.controls.bindings} a="right" /> steer</span>
                <span><BoundKeys b={settings.controls.bindings} a="handbrake" /> handbrake</span>
                {hud.manual && <span><BoundKeys b={settings.controls.bindings} a="shiftUp" /> <BoundKeys b={settings.controls.bindings} a="shiftDown" /> shift up/down</span>}
                <span><BoundKeys b={settings.controls.bindings} a="horn" /> horn</span>
                <span><BoundKeys b={settings.controls.bindings} a="camera" /> camera</span>
                {lvHud && <span><BoundKeys b={settings.controls.bindings} a="hint" /> hint</span>}
                <span>{escPause && <Key k="Esc" />} <BoundKeys b={settings.controls.bindings} a="pause" /> pause</span>
              </span>
            </div>
          )}

          {!touch && (
            <div className="text-lilac pointer-events-none absolute z-10 text-[11px]" style={{ top: 'calc(14px + env(safe-area-inset-top))', right: 'calc(14px + env(safe-area-inset-right))' }}>
              {escPause ? <Key k="Esc" /> : <BoundKeys b={settings.controls.bindings} a="pause" />} pause
              {lvHud && (
                <>
                  {' · '}
                  <BoundKeys b={settings.controls.bindings} a="retry" /> restart
                </>
              )}
            </div>
          )}

          {touch && !hud.paused && !hud.result && (
            <TouchControls
              onInput={onInput}
              onCamera={() => gameRef.current?.cycleCamera()}
              onPause={() => gameRef.current?.setPaused(true)}
              onShift={hud.manual ? (d) => gameRef.current?.shift(d) : undefined}
              onRetry={lvHud ? () => gameRef.current?.retry() : undefined}
              fullscreen={platform.id === 'web' && !!exit}
              size={settings.controls.touchSize}
              opacity={settings.controls.touchOpacity}
              leftHanded={settings.controls.leftHanded}
            />
          )}

          {hud.paused && !pauseSettings && (
            <PauseMenu
              hud={hud}
              game={gameRef.current}
              onResume={() => session.setPaused(false)}
              onSettings={() => (gameRef.current?.uiSound('pick'), setPauseSettings(true))}
              onQuit={menu ? () => (playWipe('menu'), gameRef.current?.enterMenu()) : () => (gameRef.current?.setPaused(false), openModes())}
              exit={exit}
              support={support}
              credit={credit}
              onRetry={lvHud ? () => gameRef.current?.retry() : undefined}
              onMap={lvHud ? () => (gameRef.current?.setPaused(false), openMap(lvHud.id)) : undefined}
            />
          )}
          {hud.paused && pauseSettings && (
            <SettingsPanel settings={settings} store={store} onBack={() => (gameRef.current?.uiSound('back'), setPauseSettings(false))} tier={hud.tier} touch={touch} portalMuted={portalMuted} kicker="Paused" />
          )}
          {showResult && lvHud?.run && (
            <LevelResult
              hud={hud}
              news={campaign.news}
              next={nextLevel ? { n: nextLevel.n, name: nextLevel.name } : null}
              onNext={() => session.next(() => nextLevel && playLevel(nextLevel.id))}
              onRetry={() => session.next(() => (campaign.clearNews(), gameRef.current?.retry()))}
              onMap={() => session.next(() => openMap(lvHud.id))}
              support={support}
            />
          )}
          {showResult && !lvHud?.run && <Result hud={hud} game={gameRef.current} session={session} exit={exit} support={support} onMenu={menu ? () => (playWipe('menu'), gameRef.current?.enterMenu()) : openModes} />}
          {session.inBreak && <BreakCover />}
        </>
      )}
    </main>
  );
};
