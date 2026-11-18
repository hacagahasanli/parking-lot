'use client';

import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';

import { TouchControls, useTouch } from '~/components/TouchControls';
import type { CameraMode, Game, HudState } from '~/game/render/game';
import type { VolumeKind } from '~/game/sfx';

const hex = (c: number) => '#' + c.toString(16).padStart(6, '0');
const fmtClock = (s: number) => `${Math.floor(s / 60)}:${(s % 60).toFixed(1).padStart(4, '0')}`;
const CAMERAS: Record<CameraMode, string> = { chase: 'Chase', high: 'High', top: 'Overhead' };
const VOLUMES: { kind: VolumeKind; label: string }[] = [
  { kind: 'master', label: 'Master' },
  { kind: 'engine', label: 'Engines' },
  { kind: 'effects', label: 'Effects' },
];

const Key = ({ k }: { k: string }) => (
  <kbd className="bg-cream/10 border-cream/30 text-cream inline-flex min-w-5 items-center justify-center rounded-sm border border-b-2 px-1.5 text-[11px] leading-5 font-bold">{k}</kbd>
);

const Standings = ({ hud, compact }: { hud: HudState; compact: boolean }) => (
  <ol className={`panel-cut bg-ink-deep/75 backdrop-blur-sm ${compact ? 'w-[8.5rem] p-1' : 'w-52 p-2 sm:w-64'}`} aria-label="Standings">
    {hud.standings.map((s, i) => (
      <li
        key={s.id}
        className={`flex items-center gap-2 px-2 ${compact ? 'py-0.5 text-[11px]' : 'py-1 text-sm'} ${s.me ? 'bg-gold/20 text-gold font-bold' : 'text-cream/85'}`}
      >
        <span className="font-display w-4 text-xs">{i + 1}</span>
        <span className="h-3 w-3 shrink-0 rounded-sm border border-black/50" style={{ background: hex(s.color) }} />
        <span className="flex-1 truncate">{s.me ? 'You' : s.name}</span>
        <span className={`tabular-nums ${s.parked ? 'font-display text-green text-xs' : s.out ? 'font-display text-orange text-xs' : 'text-cream/60 text-xs'}`}>
          {s.parked ? 'PARKED' : s.out ? 'OUT' : `${s.bumps} ${s.bumps === 1 ? 'bump' : 'bumps'}`}
        </span>
      </li>
    ))}
  </ol>
);

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
 * The card before each countdown: which stage this is and what is new in it, with the countdown number at its foot (one column,
 * so the number can never land on the text). On a phone it sits between the standings and the right-hand buttons.
 */
const Intro = ({ hud, touch }: { hud: HudState; touch: boolean }) => (
  <div
    className={`pointer-events-none absolute z-[5] flex flex-col items-center gap-1.5 bg-[radial-gradient(ellipse_at_center,rgba(10,13,24,0.72),rgba(10,13,24,0.3)_70%,transparent)] px-6 py-3 text-center sm:gap-3 sm:py-6 ${touch ? 'portrait:top-[250px] portrait:inset-x-2 landscape:top-2 landscape:inset-x-[10.5rem]' : 'inset-x-0'}`}
    style={{ ...(touch ? {} : { top: 'calc(48px + env(safe-area-inset-top))' }), animation: 'fadeIn 0.3s ease-out both' }}
    role="group"
    aria-label={`Stage ${hud.stage.n}: ${hud.stage.name}`}
  >
    <div className="text-green/90 font-mono text-[10px] tracking-[0.3em] sm:text-xs">
      ONE SPACE LEFT{hud.stage.n > 0 && <> · STAGE {hud.stage.n} OF {hud.stage.total}</>}
    </div>
    <div className="font-display text-gold text-2xl leading-none drop-shadow-[0_4px_24px_rgba(0,0,0,0.85)] sm:text-6xl" style={{ animation: 'riseIn 0.5s ease-out both' }}>
      {hud.stage.n > 0 ? hud.stage.name : 'ONE SPACE LEFT'}
    </div>
    {hud.stage.news && (
      <div className="text-cream/90 max-w-md text-xs drop-shadow-[0_2px_8px_rgba(0,0,0,0.8)] sm:text-base [@media(max-height:420px)]:hidden portrait:max-sm:hidden" style={{ animation: 'fadeIn 0.8s ease-out both' }}>
        {hud.stage.news} Three rivals are looking too.
      </div>
    )}
    {hud.stage.n > 0 && <StageDots hud={hud} />}
    {hud.countdown > 0 && (
      <div key={hud.countdown} className="font-display text-gold mt-1 text-6xl leading-none drop-shadow-lg sm:mt-4 sm:text-9xl" style={{ animation: 'countPop 1s ease-out both' }}>
        {hud.countdown}
      </div>
    )}
  </div>
);

const Lock = () => (
  <svg viewBox="0 0 16 16" className="mx-auto h-3.5 w-3.5" aria-hidden="true" fill="currentColor">
    <path d="M5 7V5a3 3 0 1 1 6 0v2h1a1 1 0 0 1 1 1v6a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V8a1 1 0 0 1 1-1zm1.6 0h2.8V5a1.4 1.4 0 1 0-2.8 0z" />
  </svg>
);

/** The stage chips: cleared and open stages can be played, the rest are locked until you park first in the one before. */
const StageChips = ({ hud, game, onPick }: { hud: HudState; game: Game | null; onPick?: () => void }) => (
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
            game?.selectStage(n);
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

const Stat = ({ label, value }: { label: string; value: string }) => (
  <div className="bg-ink-deep/70 px-3 py-2 text-center">
    <div className="text-lilac text-[10px] font-semibold tracking-widest uppercase">{label}</div>
    <div className="font-display text-cream text-lg">{value}</div>
  </div>
);

const Result = ({ hud, game }: { hud: HudState; game: Game | null }) => {
  const r = hud.result!;
  const st = hud.stage;
  const unlockedNow = r.won && st.hasNext;
  return (
    <div className="absolute inset-0 z-30 flex items-center justify-center bg-ink-deep/70 p-4 backdrop-blur-sm" style={{ animation: 'fadeIn 0.4s ease-out both' }} role="dialog" aria-label="Result">
      <div className="panel-cut bg-ink border-blue/20 max-h-[calc(100dvh-16px)] w-full max-w-md overflow-y-auto border p-4 text-center sm:p-6" style={{ animation: 'riseIn 0.5s ease-out both' }}>
        {st.n > 0 && <div className="text-lilac text-[11px] font-semibold tracking-[0.25em] uppercase">Stage {st.n} · {st.name}</div>}
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
            <StageChips hud={hud} game={game} />
          </div>
        )}
        <div className="mt-4 flex flex-col gap-3 sm:mt-5 sm:flex-row [@media(max-height:420px)]:flex-row [@media(max-height:420px)]:gap-2">
          {unlockedNow && (
            <button type="button" autoFocus onClick={() => game?.nextStage()} className="panel-cut bg-gold font-display text-ink-deep flex flex-[1.7] items-center justify-center px-4 py-3 text-base whitespace-nowrap [@media(max-height:420px)]:py-2 transition hover:brightness-110 active:scale-95 sm:text-lg">
              Next stage →
            </button>
          )}
          <button
            type="button"
            autoFocus={!unlockedNow}
            onClick={() => game?.newRound()}
            className={`panel-cut font-display flex flex-1 items-center justify-center px-4 py-3 text-base transition active:scale-95 sm:text-lg ${unlockedNow ? 'bg-cream/10 text-cream hover:bg-cream/20' : 'bg-gold text-ink-deep hover:brightness-110'}`}
          >
            Retry
          </button>
          <Link href="/" className="panel-cut bg-cream/10 font-display text-cream flex flex-1 items-center justify-center px-4 py-3 text-base transition hover:bg-cream/20 active:scale-95 sm:text-lg">
            Home
          </Link>
        </div>
        <p className="text-lilac mt-3 hidden text-xs sm:block"><Key k="Enter" /> {unlockedNow ? 'goes to the next stage' : 'tries again'}</p>
      </div>
    </div>
  );
};

const PauseMenu = ({ hud, game, onResume }: { hud: HudState; game: Game | null; onResume: () => void }) => (
  <div className="absolute inset-0 z-30 flex items-center justify-center bg-ink-deep/75 p-4 backdrop-blur-sm" role="dialog" aria-label="Paused">
    <div className="panel-cut bg-ink border-blue/20 max-h-[calc(100dvh-16px)] w-full max-w-sm overflow-y-auto border p-4 sm:p-6">
      <div className="font-display text-gold text-center text-3xl sm:text-4xl">Paused</div>
      <div className="mt-3 flex flex-col gap-2.5">
        {VOLUMES.map(({ kind, label }) => (
          <label key={kind} className="text-cream/80 flex items-center gap-3 text-sm">
            <span className="w-16 shrink-0">{label}</span>
            <input
              type="range"
              min={0}
              max={100}
              value={Math.round(hud.volumes[kind] * 100)}
              onChange={(e) => game?.setVolume(kind, Number(e.target.value) / 100)}
              className="h-1.5 flex-1 cursor-pointer accent-[#ffd23f]"
              aria-label={label}
            />
            <span className="w-8 text-right text-xs tabular-nums">{Math.round(hud.volumes[kind] * 100)}</span>
          </label>
        ))}
        <button type="button" onClick={() => game?.cycleCamera()} className="bg-cream/10 text-cream hover:bg-cream/20 mt-1 flex items-center justify-between px-3 py-2 text-sm">
          <span>Camera</span>
          <span className="text-gold font-bold">{CAMERAS[hud.camera]}</span>
        </button>
        {hud.stage.n > 0 && (
          <div className="mt-2">
            <div className="text-lilac mb-1.5 text-center text-[11px] font-semibold tracking-[0.25em] uppercase">Stage {hud.stage.n} · {hud.stage.name}</div>
            <StageChips hud={hud} game={game} />
          </div>
        )}
      </div>
      <div className="mt-4 flex flex-col gap-2 sm:mt-6">
        <button type="button" autoFocus onClick={onResume} className="panel-cut bg-gold font-display text-ink-deep px-6 py-2 text-lg transition hover:brightness-110 active:scale-95 sm:py-3">
          Resume
        </button>
        <Link href="/" className="panel-cut bg-cream/10 font-display text-cream px-6 py-2 text-center text-lg transition hover:bg-cream/20 sm:py-3">
          Leave
        </Link>
      </div>
    </div>
  </div>
);

/** The race: full-screen canvas, the HUD on top, touch controls on phones. */
export const Race = () => {
  const canvas = useRef<HTMLCanvasElement>(null);
  const minimap = useRef<HTMLCanvasElement>(null);
  const gameRef = useRef<Game | null>(null);
  const [hud, setHud] = useState<HudState | null>(null);
  const touch = useTouch();

  useEffect(() => {
    let cancelled = false;
    void import('~/game/render/game').then(({ Game }) => {
      if (cancelled || !canvas.current) return;
      const g = new Game(canvas.current, { mode: 'race', onHud: setHud });
      g.attachMinimap(minimap.current);
      gameRef.current = g;
      if (process.env.NODE_ENV !== 'production') (window as unknown as { __game?: Game }).__game = g;
    });
    return () => {
      cancelled = true;
      gameRef.current?.dispose();
      gameRef.current = null;
    };
  }, []);

  const onInput = useCallback((i: Parameters<Game['setTouch']>[0]) => gameRef.current?.setTouch(i), []);

  const showResult = !!hud?.result && hud.endedFor >= (hud.result.reason === 'pedestrian' || hud.result.reason === 'crash' ? 2.2 : 1.2);
  const showMeter = !!hud && hud.phase !== 'countdown' && (hud.inBay > 0 || hud.park > 0) && !hud.result;
  const showHint = !touch && !!hud && hud.phase !== 'done' && hud.clock < 9 && !hud.paused && !showMeter;

  return (
    <main className="fixed inset-0 overflow-hidden bg-ink-deep select-none" onPointerDown={() => gameRef.current?.unlockAudio()}>
      <canvas ref={canvas} className="absolute inset-0 h-full w-full touch-none" />
      <div
        className="absolute z-10 flex flex-col gap-1"
        style={{
          left: 'calc(10px + env(safe-area-inset-left))',
          ...(touch ? { top: 'calc(112px + env(safe-area-inset-top))' } : { bottom: 'calc(10px + env(safe-area-inset-bottom))' }),
          visibility: hud ? 'visible' : 'hidden',
        }}
      >
        {hud && <MapTabs hud={hud} game={gameRef.current} />}
        <canvas ref={minimap} width={360} height={216} className={`border-cream/25 pointer-events-none border-2 ${touch ? 'h-[4.8rem] w-32' : 'h-28 w-[11.7rem] sm:h-44 sm:w-[18.3rem]'}`} aria-label="Minimap" />
      </div>

      {!hud && (
        <div className="bg-ink-deep absolute inset-0 z-40 flex items-center justify-center">
          <div className="font-display text-gold text-3xl">Loading the lot…</div>
        </div>
      )}

      {hud && (
        <>
          <div className="pointer-events-none absolute z-10" style={{ top: 'calc(10px + env(safe-area-inset-top))', left: 'calc(10px + env(safe-area-inset-left))' }}>
            <div className="flex flex-col gap-2">
              <Standings hud={hud} compact={touch} />
              {!touch && <Radio hud={hud} compact={false} />}
            </div>
          </div>
          {touch && (
            <div className="pointer-events-none absolute z-10 flex flex-col items-start gap-1" style={{ top: 'calc(232px + env(safe-area-inset-top))', left: 'calc(10px + env(safe-area-inset-left))' }}>
              {hud.phase === 'race' && !hud.result && <Board hud={hud} />}
              <Radio hud={hud} compact />
            </div>
          )}
          <div
            className={`pointer-events-none absolute z-10 flex items-stretch gap-1.5 ${touch ? '' : 'left-1/2 -translate-x-1/2'}`}
            style={touch ? { top: 'calc(60px + env(safe-area-inset-top))', right: 'calc(12px + env(safe-area-inset-right))' } : { top: 'calc(10px + env(safe-area-inset-top))' }}
          >
            {hud.stage.n > 0 && (
              <div className="panel-cut bg-ink-deep/75 font-display text-gold flex items-center px-2 text-xs tracking-wide whitespace-nowrap sm:px-3 sm:text-sm" aria-label={`Stage ${hud.stage.n} of ${hud.stage.total}: ${hud.stage.name}`}>
                STAGE {hud.stage.n}<span className="text-cream/60 hidden pl-1.5 sm:inline">{hud.stage.name.split(' — ')[0]}</span>
              </div>
            )}
            <div className="panel-cut bg-ink-deep/75 font-display text-cream px-3 py-1 text-base tabular-nums sm:px-5 sm:py-1.5 sm:text-xl">{fmtClock(hud.clock)}</div>
          </div>

          {hud.phase === 'countdown' && <Intro hud={hud} touch={touch} />}
          {!touch && hud.phase === 'race' && !hud.result && (
            <div className="pointer-events-none absolute left-1/2 z-10 -translate-x-1/2" style={{ top: 'calc(54px + env(safe-area-inset-top))' }}>
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
          {hud.phase === 'race' && hud.clock < 1 && (
            <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center">
              <div className="font-display text-green text-8xl drop-shadow-lg" style={{ animation: 'countPop 1s ease-out both' }}>GO</div>
            </div>
          )}


          <div className="pointer-events-none absolute z-10 text-right" style={{ right: 'calc(14px + env(safe-area-inset-right))', ...(touch ? { top: 'calc(92px + env(safe-area-inset-top))' } : { bottom: 'calc(14px + env(safe-area-inset-bottom))' }) }}>
            <div className={`font-display text-cream tabular-nums drop-shadow-lg ${touch ? 'text-3xl' : 'text-5xl'}`}>{Math.round(hud.speed)}<span className="text-lilac ml-1 text-base">km/h</span></div>
            <div className="font-display text-gold text-2xl drop-shadow-lg">{hud.gear}</div>
            {(hud.inGarage || hud.level !== 0) && (
              <div className="font-display mt-1 inline-block px-2 py-0.5 text-lg" style={{ background: hex(hud.levelColor), color: hud.level === 2 ? '#15161a' : '#fff' }} aria-label={`Level ${hud.levelName}`}>
                {hud.levelName}
              </div>
            )}
          </div>

          {showMeter && (
            <div className="pointer-events-none absolute left-1/2 z-10 -translate-x-1/2" style={{ bottom: 'calc(16px + env(safe-area-inset-bottom))' }}>
              <Meter hud={hud} />
            </div>
          )}

          {showHint && (
            <div className="pointer-events-none absolute bottom-24 left-1/2 z-10 flex -translate-x-1/2 flex-wrap justify-center gap-x-4 gap-y-1 text-xs text-cream" style={{ animation: 'fadeIn 0.5s ease-out both' }}>
              <span className="bg-ink-deep/70 flex flex-wrap items-center justify-center gap-x-4 gap-y-1 px-3 py-1.5">
                <span><Key k="W" /> <Key k="S" /> gas · brake/reverse</span>
                <span><Key k="A" /> <Key k="D" /> steer</span>
                <span><Key k="Space" /> handbrake</span>
                <span><Key k="H" /> horn</span>
                <span><Key k="C" /> camera</span>
                <span><Key k="Esc" /> pause</span>
              </span>
            </div>
          )}

          {!touch && (
            <div className="text-lilac pointer-events-none absolute z-10 text-[11px]" style={{ top: 'calc(14px + env(safe-area-inset-top))', right: 'calc(14px + env(safe-area-inset-right))' }}>
              <Key k="Esc" /> pause
            </div>
          )}

          {touch && !hud.paused && !hud.result && (
            <TouchControls onInput={onInput} onCamera={() => gameRef.current?.cycleCamera()} onPause={() => gameRef.current?.setPaused(true)} />
          )}

          {hud.paused && <PauseMenu hud={hud} game={gameRef.current} onResume={() => gameRef.current?.setPaused(false)} />}
          {showResult && <Result hud={hud} game={gameRef.current} />}
        </>
      )}
    </main>
  );
};
