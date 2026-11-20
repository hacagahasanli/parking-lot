'use client';

/**
 * The loading screen and the screen-to-screen wipe.
 *
 * Loading: the bar only moves on real events (see `LOAD_STEPS` and Race.tsx): the page's own script has run, the game engine's
 * chunk has arrived (most of the bytes), the lot is built, the first frame is drawn. Between them nothing creeps forward; the
 * motion (the grid rolling under a car whose headlights sweep, the scan line) is decoration and says nothing about progress.
 *
 * Wipe: a light-streak sweep, 450 ms, drawn over the screen change (menu to map, map to level, level to result). It never
 * takes a click or a key (pointer-events: none), so it can never block or delay input; with reduced motion it is a quick fade.
 */
import { useEffect, useState } from 'react';

/** The real milestones of a load, with each one's share of the work (by bytes: the engine chunk is about two thirds). */
export const LOAD_STEPS = {
  page: { at: 0.32, label: 'Starting the engine' },
  engine: { at: 0.86, label: 'Building the lot' },
  built: { at: 0.96, label: 'Painting the lines' },
  ready: { at: 1, label: 'Ready' },
} as const;
export type LoadStep = keyof typeof LOAD_STEPS;

const TIPS = [
  'There is exactly one free bay. Find it and park in it.',
  'Follow the P over the free bay, or the gold arrow at the edge of the screen.',
  'Stop inside the lines and hold still to park.',
  'Hold brake when stopped to reverse.',
  'Touch nothing: a hard hit ends the run.',
  'Esc or P pauses the game.',
];

/** A car seen from above, its headlight beams sweeping ahead. */
const CarTop = () => (
  <svg viewBox="0 0 120 200" className="load-car h-36 w-24 sm:h-44 sm:w-28" aria-hidden="true">
    <defs>
      <linearGradient id="beam" x1="0" y1="1" x2="0" y2="0">
        <stop offset="0" stopColor="#fff6c8" stopOpacity="0.75" />
        <stop offset="1" stopColor="#fff6c8" stopOpacity="0" />
      </linearGradient>
    </defs>
    <g className="load-beams">
      <path d="M38 62 L4 0 L52 0 Z" fill="url(#beam)" />
      <path d="M82 62 L68 0 L116 0 Z" fill="url(#beam)" />
    </g>
    <rect x="30" y="60" width="60" height="120" rx="18" fill="#d8222b" stroke="#0a0d18" strokeWidth="3" />
    <rect x="38" y="88" width="44" height="26" rx="6" fill="#0a0d18" opacity="0.8" />
    <rect x="38" y="138" width="44" height="20" rx="6" fill="#0a0d18" opacity="0.7" />
    <rect x="34" y="60" width="14" height="6" rx="2" fill="#fff6c8" />
    <rect x="72" y="60" width="14" height="6" rx="2" fill="#fff6c8" />
    <rect x="34" y="172" width="14" height="5" rx="2" fill="#ff3d6e" />
    <rect x="72" y="172" width="14" height="5" rx="2" fill="#ff3d6e" />
  </svg>
);

export const LoadingScreen = ({ step, leaving }: { step: LoadStep; leaving: boolean }) => {
  const [tip, setTip] = useState(0);
  useEffect(() => {
    const id = window.setInterval(() => setTip((t) => (t + 1) % TIPS.length), 2600);
    return () => window.clearInterval(id);
  }, []);
  const { at, label } = LOAD_STEPS[step];
  return (
    <div
      className={`load-screen bg-ink-deep absolute inset-0 z-40 flex flex-col items-center justify-center gap-5 overflow-hidden px-6 text-center transition-opacity duration-300 ${leaving ? 'pointer-events-none opacity-0' : 'opacity-100'}`}
      role="progressbar"
      aria-label="Loading"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(at * 100)}
      aria-valuetext={label}
    >
      <div className="load-grid" aria-hidden="true" />
      <div className="load-scan" aria-hidden="true" />
      <div className="relative flex flex-col items-center gap-4">
        <CarTop />
        <div className="font-display text-gold text-4xl leading-none drop-shadow-[0_0_24px_rgba(255,210,63,0.45)] sm:text-6xl">Parking Lot</div>
        <div className="w-[min(22rem,80vw)]">
          <div className="bg-cream/10 relative h-2 overflow-hidden rounded-full">
            <div className="load-fill h-full rounded-full" style={{ width: `${Math.round(at * 100)}%` }} />
          </div>
          <div className="text-cream/85 mt-2 flex justify-between text-xs font-semibold tabular-nums sm:text-sm">
            <span>{label}</span>
            <span className="text-gold">{Math.round(at * 100)}%</span>
          </div>
        </div>
        <p key={tip} className="text-lilac max-w-sm text-sm sm:text-base" style={{ animation: 'fadeIn 0.4s ease-out both' }}>
          {TIPS[tip]}
        </p>
      </div>
    </div>
  );
};

export type WipeKind = 'map' | 'level' | 'result' | 'menu';

/** One sweep of light across the screen; `id` changes to play it again. Draws nothing once it has run. */
export const Wipe = ({ id, kind }: { id: number; kind: WipeKind }) => {
  const [on, setOn] = useState(false);
  useEffect(() => {
    if (!id) return;
    setOn(true);
    // Gone when the band's sweep ends (a fallback in case the animation never runs, e.g. a hidden tab).
    const t = window.setTimeout(() => setOn(false), 1500);
    return () => window.clearTimeout(t);
  }, [id]);
  if (!on) return null;
  return (
    <div key={id} className={`wipe wipe-${kind} pointer-events-none absolute inset-0 z-[70] overflow-hidden`} aria-hidden="true">
      <div className="wipe-band" onAnimationEnd={() => setOn(false)} />
      <div className="wipe-streak wipe-streak-1" />
      <div className="wipe-streak wipe-streak-2" />
      <div className="wipe-streak wipe-streak-3" />
    </div>
  );
};
