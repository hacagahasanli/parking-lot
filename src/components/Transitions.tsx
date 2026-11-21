'use client';

/**
 * The loading screen and the screen-to-screen wipe.
 *
 * Loading: the car park itself, seen from above in daylight (a row of bays with parked cars, the one free bay lit gold under the
 * P, the yellow dashes of the aisle), drawn as one small SVG. Your red car drives down the aisle and turns into the free bay as
 * the game loads: its place, the bar and the percentage all come from one number (see loadProgress.ts), which moves only
 * towards real checkpoints (`LOAD_STEPS`: the page has run, the engine has arrived, the lot is built), never backwards, and
 * stops at 99 until the first frame is drawn.
 *
 * Wipe: a light-streak sweep, 450 ms, drawn over the screen change (menu to map, map to level, level to result). It never
 * takes a click or a key (pointer-events: none), so it can never block or delay input; with reduced motion it is a quick fade.
 */
import { useEffect, useRef, useState } from 'react';

import { createProgress, complete, finish, fraction, reach, tick } from './loadProgress';

/** The real checkpoints of a load: where each one puts the bar, where the next one stands (the bar may creep part way), and its words. */
export const LOAD_STEPS = {
  page: { at: 0.3, next: 0.85, label: 'Starting the engine' },
  engine: { at: 0.85, next: 0.95, label: 'Building the lot' },
  built: { at: 0.95, next: 0.99, label: 'Painting the lines' },
  ready: { at: 1, next: 1, label: 'Parked' },
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

/** The lot's parked cars, in the game's paint colours (the gap is the free bay). */
const PARKED = ['#f2c230', '#2c6fd6', '#f2f2ee', '#3cb44b', null, '#7b3fc4', '#f07a2a'];
const LOWER = ['#2c6fd6', '#d8d8d2', '#e0457b', '#3a3d44', '#f2c230', '#3cb44b', '#2c6fd6'];
const BAY_W = 52;
const ROW_X = 18;
const FREE = PARKED.indexOf(null);
const FREE_X = ROW_X + FREE * BAY_W + BAY_W / 2;
/** The aisle lane your car drives along (y of its centre), the bay's centre, and the radius of the turn in. */
const LANE = 132;
const BAY_Y = 62;
const TURN = 38;

/** A car from above, nose up, centred on 0,0 (40 long, 20 wide). */
const TopCar = ({ color, lit = false }: { color: string; lit?: boolean }) => (
  <g>
    <rect x="-10" y="-20" width="20" height="40" rx="6" fill={color} stroke="#16181b" strokeWidth="1.4" />
    <rect x="-7.5" y="-10" width="15" height="9" rx="2.5" fill="#0a1118" opacity="0.85" />
    <rect x="-7.5" y="7" width="15" height="7" rx="2.5" fill="#0a1118" opacity="0.75" />
    <rect x="-8" y="-20" width="5" height="2.4" rx="1" fill={lit ? '#fff6c8' : '#c9ced6'} />
    <rect x="3" y="-20" width="5" height="2.4" rx="1" fill={lit ? '#fff6c8' : '#c9ced6'} />
    <rect x="-8" y="17.8" width="5" height="2" rx="1" fill={lit ? '#ff3b2e' : '#8a0d10'} />
    <rect x="3" y="17.8" width="5" height="2" rx="1" fill={lit ? '#ff3b2e' : '#8a0d10'} />
  </g>
);

/** Where your car is at `pct` (0..100): down the aisle, then a quarter turn up into the free bay, then straight in. */
export const carPose = (pct: number) => {
  const p = Math.max(0, Math.min(100, pct)) / 100;
  const x0 = -30;
  const xTurn = FREE_X - TURN;
  if (p < 0.8) return { x: x0 + (xTurn - x0) * (p / 0.8), y: LANE, h: 90 };
  if (p < 0.95) {
    const a = ((p - 0.8) / 0.15) * (Math.PI / 2);
    return { x: xTurn + TURN * Math.sin(a), y: LANE - TURN + TURN * Math.cos(a), h: 90 - (a * 180) / Math.PI };
  }
  const k = (p - 0.95) / 0.05;
  return { x: FREE_X, y: LANE - TURN + (BAY_Y - (LANE - TURN)) * k, h: 0 };
};

/** The car park from above, your car placed by the load's percentage. Static apart from the car (cheap to draw). */
const LotScene = ({ pct }: { pct: number }) => {
  const car = carPose(pct);
  const parked = pct >= 100;
  return (
    <svg viewBox="0 0 400 200" className="block h-auto w-full" aria-hidden="true">
      <defs>
        <linearGradient id="ld-asph" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#3b3e46" />
          <stop offset="1" stopColor="#2c2f36" />
        </linearGradient>
        <radialGradient id="ld-glow" cx="0.5" cy="0.5" r="0.6">
          <stop offset="0" stopColor="#ffd23f" stopOpacity="0.55" />
          <stop offset="1" stopColor="#ffd23f" stopOpacity="0.08" />
        </radialGradient>
      </defs>
      <rect width="400" height="200" fill="url(#ld-asph)" />
      {/* Grass and trees along the top edge, the kerb under them. */}
      <rect width="400" height="22" fill="#5c9e3c" />
      <rect y="22" width="400" height="4" fill="#c9c4b8" />
      {[[30, '#f07a2a'], [92, '#6cc04a'], [170, '#f2a03a'], [248, '#6cc04a'], [320, '#e0603a'], [378, '#6cc04a']].map(([x, c]) => (
        <circle key={x as number} cx={x as number} cy="11" r="9" fill={c as string} stroke="#2d4a1e" strokeWidth="1" />
      ))}
      {/* The top row of bays: white lines, parked cars nose in, the free bay lit gold with the P over it. */}
      <rect x={FREE_X - BAY_W / 2 + 2} y="30" width={BAY_W - 4} height="64" fill="url(#ld-glow)" className="load-bay" style={parked ? { fill: 'rgba(61,220,132,0.35)' } : undefined} />
      {Array.from({ length: PARKED.length + 1 }, (_, i) => (
        <rect key={i} x={ROW_X + i * BAY_W - 1} y="30" width="2" height="64" fill="#f2f2ee" />
      ))}
      {PARKED.map((c, i) => c && <g key={i} transform={`translate(${ROW_X + i * BAY_W + BAY_W / 2} ${BAY_Y})`}><TopCar color={c} /></g>)}
      <g transform={`translate(${FREE_X} 40)`}>
        <rect x="-9" y="-9" width="18" height="18" rx="2" fill="#1f6fd6" stroke="#fff" strokeWidth="1.5" />
        <text y="5.5" textAnchor="middle" fontSize="15" fontWeight="700" fill="#fff" fontFamily="Bungee, system-ui, sans-serif">P</text>
      </g>
      {/* The aisle's yellow dashes. */}
      {Array.from({ length: 9 }, (_, i) => (
        <rect key={i} x={8 + i * 46} y={LANE + 15} width="26" height="3" fill="#e8c132" />
      ))}
      {/* The bottom row: bay lines and cars nose out, half off the edge. */}
      {Array.from({ length: LOWER.length + 1 }, (_, i) => (
        <rect key={i} x={ROW_X + i * BAY_W - 1} y="170" width="2" height="30" fill="#f2f2ee" />
      ))}
      {LOWER.map((c, i) => <g key={i} transform={`translate(${ROW_X + i * BAY_W + BAY_W / 2} 196) rotate(180)`}><TopCar color={c} /></g>)}
      {/* Your car. */}
      <g className="load-car" style={{ transform: `translate(${car.x}px, ${car.y}px) rotate(${car.h}deg)` }}>
        <TopCar color="#d8222b" lit />
      </g>
    </svg>
  );
};

/**
 * The loading screen: the logo, the lot with your car turning in, one bar and one percentage from the same number, and a tip.
 * `step` is the furthest real checkpoint; `ready` is the first frame drawn. `onDone` runs once the bar has reached 100.
 */
export const LoadingScreen = ({ step, leaving, logoSrc, onDone }: { step: LoadStep; leaving: boolean; logoSrc?: string; onDone?: () => void }) => {
  const [tip, setTip] = useState(0);
  /** The load's one value, in percent with a decimal (the bar and the car use it; the number is its whole part). */
  const [value, setValue] = useState(0);
  const model = useRef(createProgress());
  const done = useRef(onDone);
  done.current = onDone;
  useEffect(() => {
    const id = window.setInterval(() => setTip((t) => (t + 1) % TIPS.length), 2600);
    return () => window.clearInterval(id);
  }, []);
  // A checkpoint arrived: record it (the model ignores anything below what it has).
  useEffect(() => {
    const s = LOAD_STEPS[step];
    model.current = step === 'ready' ? finish(model.current) : reach(model.current, s.at, s.next);
  }, [step]);
  // One loop eases the value; the screen re-renders only when it moves by a tenth of a percent.
  useEffect(() => {
    let raf = 0;
    let last = performance.now();
    let fired = false;
    const frame = (now: number) => {
      model.current = tick(model.current, Math.min(0.1, (now - last) / 1000));
      last = now;
      setValue(Math.floor(fraction(model.current) * 1000 + 1e-6) / 10);
      if (complete(model.current) && !fired) {
        fired = true;
        done.current?.();
      }
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, []);
  const pct = Math.floor(value + 1e-9);
  const label = LOAD_STEPS[pct >= 100 ? 'ready' : step === 'ready' ? 'built' : step].label;
  return (
    <div
      className={`load-screen absolute inset-0 z-40 flex flex-col items-center justify-center gap-4 overflow-hidden px-4 text-center transition-opacity duration-300 sm:gap-5 ${leaving ? 'pointer-events-none opacity-0' : 'opacity-100'}`}
      role="progressbar"
      aria-label="Loading"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={pct}
      aria-valuetext={`${pct}%, ${label}`}
    >
      <div className="relative flex w-[min(34rem,92vw)] flex-col items-center gap-3 sm:gap-4 [@media(max-height:420px)]:gap-2">
        {logoSrc ? (
          <img src={logoSrc} alt="Parking Lot" className="h-auto w-[min(22rem,70vw)] drop-shadow-[0_10px_24px_rgba(0,0,0,0.55)] [@media(max-height:420px)]:w-48" draggable={false} />
        ) : (
          <div className="font-display text-gold -skew-x-6 text-5xl leading-none drop-shadow-[0_6px_0_#16110e] sm:text-6xl">Parking Lot</div>
        )}
        <div className="panel-cut w-full border-2 border-black/40 shadow-[0_18px_50px_rgba(0,0,0,0.5)] [@media(max-height:420px)]:w-[70%]">
          <LotScene pct={value} />
        </div>
        <div className="w-full">
          <div className="flex items-end justify-between gap-3">
            <span className="text-cream/85 text-sm font-semibold sm:text-base">{label}</span>
            <span className="font-display text-gold text-2xl leading-none tabular-nums sm:text-3xl">{pct}%</span>
          </div>
          <div className="mt-2 h-3 w-full -skew-x-12 overflow-hidden bg-black/45 ring-1 ring-white/10">
            <div className="load-fill h-full" style={{ width: `${value}%` }} />
          </div>
        </div>
        <p key={tip} className="text-cream/70 max-w-sm text-sm sm:text-base [@media(max-height:420px)]:hidden" style={{ animation: 'fadeIn 0.4s ease-out both' }}>
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
