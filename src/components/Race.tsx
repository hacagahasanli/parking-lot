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
  <ol className={`panel-cut bg-ink-deep/75 backdrop-blur-sm ${compact ? 'w-40 p-1' : 'w-52 p-2 sm:w-64'}`} aria-label="Standings">
    {hud.standings.map((s, i) => (
      <li
        key={s.id}
        className={`flex items-center gap-2 px-2 ${compact ? 'py-0.5 text-xs' : 'py-1 text-sm'} ${s.me ? 'bg-gold/20 text-gold font-bold' : 'text-cream/85'}`}
      >
        <span className="font-display w-4 text-xs">{i + 1}</span>
        <span className="h-3 w-3 shrink-0 rounded-sm border border-black/50" style={{ background: hex(s.color) }} />
        <span className="flex-1 truncate">{s.me ? 'You' : s.name}</span>
        <span className={`tabular-nums ${s.parked ? 'font-display text-green text-xs' : 'text-cream/60 text-xs'}`}>
          {s.parked ? 'PARKED' : `${Math.round(s.dist)} m`}
        </span>
      </li>
    ))}
  </ol>
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

const Stat = ({ label, value }: { label: string; value: string }) => (
  <div className="bg-ink-deep/70 px-3 py-2 text-center">
    <div className="text-lilac text-[10px] font-semibold tracking-widest uppercase">{label}</div>
    <div className="font-display text-cream text-lg">{value}</div>
  </div>
);

const Result = ({ hud, onAgain }: { hud: HudState; onAgain: () => void }) => {
  const r = hud.result!;
  return (
    <div className="absolute inset-0 z-30 flex items-center justify-center bg-ink-deep/70 p-4 backdrop-blur-sm" style={{ animation: 'fadeIn 0.4s ease-out both' }} role="dialog" aria-label="Result">
      <div className="panel-cut bg-ink border-blue/20 max-h-[calc(100dvh-16px)] w-full max-w-md overflow-y-auto border p-4 text-center sm:p-6" style={{ animation: 'riseIn 0.5s ease-out both' }}>
        <div className={`font-display text-3xl sm:text-4xl ${r.won ? 'text-green' : 'text-orange'}`}>
          {r.won ? 'PARKED FIRST' : r.winner ? `${r.winner} took your spot` : 'Out of time'}
        </div>
        <div className="font-display text-gold mt-2 text-6xl">#{r.place}<span className="text-lilac text-2xl">/4</span></div>
        <div className="mt-4 grid grid-cols-2 gap-1.5">
          <Stat label="Time" value={fmtClock(r.time)} />
          <Stat label="Top speed" value={`${Math.round(r.topSpeed)} km/h`} />
          <Stat label="Bumps" value={String(r.bumps)} />
          <Stat label="Distance" value={`${Math.round(r.distance)} m`} />
        </div>
        <div className="mt-6 flex flex-col gap-3 sm:flex-row">
          <button type="button" autoFocus onClick={onAgain} className="panel-cut bg-gold font-display text-ink-deep flex-1 px-6 py-3 text-lg transition hover:brightness-110 active:scale-95">
            Play again
          </button>
          <Link href="/" className="panel-cut bg-cream/10 font-display text-cream flex-1 px-6 py-3 text-lg transition hover:bg-cream/20 active:scale-95">
            Home
          </Link>
        </div>
        <p className="text-lilac mt-3 hidden text-xs sm:block"><Key k="Enter" /> plays again</p>
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
  const pointer = useRef<HTMLDivElement>(null);
  const gameRef = useRef<Game | null>(null);
  const [hud, setHud] = useState<HudState | null>(null);
  const touch = useTouch();

  useEffect(() => {
    let cancelled = false;
    void import('~/game/render/game').then(({ Game }) => {
      if (cancelled || !canvas.current) return;
      const g = new Game(canvas.current, { mode: 'race', onHud: setHud });
      g.attachMinimap(minimap.current);
      g.attachPointer(pointer.current);
      gameRef.current = g;
      if (process.env.NODE_ENV !== 'production') (window as unknown as { __game?: Game }).__game = g;
    });
    return () => {
      cancelled = true;
      gameRef.current?.dispose();
      gameRef.current = null;
    };
  }, []);

  const again = useCallback(() => gameRef.current?.newRound(), []);
  const onInput = useCallback((i: Parameters<Game['setTouch']>[0]) => gameRef.current?.setTouch(i), []);

  useEffect(() => {
    if (!hud?.result || hud.endedFor < 1.2) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.code === 'Enter') again();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [hud?.result, hud?.endedFor, again]);

  const showResult = !!hud?.result && hud.endedFor >= 1.2;
  const showMeter = !!hud && hud.phase !== 'countdown' && (hud.dist < 12 || hud.park > 0) && !hud.result;
  const showHint = !touch && !!hud && hud.phase !== 'done' && hud.clock < 9 && !hud.paused && !showMeter;

  return (
    <main className="fixed inset-0 overflow-hidden bg-ink-deep select-none" onPointerDown={() => gameRef.current?.unlockAudio()}>
      <canvas ref={canvas} className="absolute inset-0 h-full w-full touch-none" />
      <div ref={pointer} className="pointer-events-none fixed top-0 left-0 z-10" style={{ willChange: 'transform', opacity: 0 }} aria-hidden>
        <svg width="46" height="46" viewBox="0 0 46 46" className="drop-shadow-lg">
          <path d="M6 8 L40 23 L6 38 L14 23 Z" fill="#3ddc84" stroke="#0a0d18" strokeWidth="3" strokeLinejoin="round" />
        </svg>
      </div>
      <div
        className="pointer-events-none absolute z-10"
        style={{
          left: 'calc(10px + env(safe-area-inset-left))',
          ...(touch ? { top: 'calc(112px + env(safe-area-inset-top))' } : { bottom: 'calc(10px + env(safe-area-inset-bottom))' }),
          visibility: hud ? 'visible' : 'hidden',
        }}
      >
        <canvas ref={minimap} width={280} height={160} className={`border-cream/20 border ${touch ? 'h-14 w-24' : 'h-20 w-36 sm:h-32 sm:w-56'}`} aria-label="Minimap" />
      </div>

      {!hud && (
        <div className="bg-ink-deep absolute inset-0 z-40 flex items-center justify-center">
          <div className="font-display text-gold text-3xl">Loading the lot…</div>
        </div>
      )}

      {hud && (
        <>
          <div className="pointer-events-none absolute z-10" style={{ top: 'calc(10px + env(safe-area-inset-top))', left: 'calc(10px + env(safe-area-inset-left))' }}>
            <Standings hud={hud} compact={touch} />
          </div>
          <div
            className={`pointer-events-none absolute z-10 ${touch ? '' : 'left-1/2 -translate-x-1/2'}`}
            style={touch ? { top: 'calc(60px + env(safe-area-inset-top))', right: 'calc(12px + env(safe-area-inset-right))' } : { top: 'calc(10px + env(safe-area-inset-top))' }}
          >
            <div className="panel-cut bg-ink-deep/75 font-display text-cream px-4 py-1 text-base tabular-nums sm:px-5 sm:py-1.5 sm:text-xl">{fmtClock(hud.clock)}</div>
          </div>

          {hud.phase === 'countdown' && hud.countdown > 0 && (
            <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center">
              <div key={hud.countdown} className="font-display text-gold text-9xl drop-shadow-lg" style={{ animation: 'countPop 1s ease-out both' }}>{hud.countdown}</div>
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
          {showResult && <Result hud={hud} onAgain={again} />}
        </>
      )}
    </main>
  );
};
