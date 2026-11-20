'use client';

/**
 * The campaign level's screens over the game: the intro card on the start line, the top bar (time against par, the stars still
 * in reach), the parking meter with precision, and the result card with the stars landing one by one.
 */
import { CHAPTERS, PRECISION_STAR } from '~/game/sim/campaign';

import type { HudState, LevelHud } from '~/game/render/game';
import type { RunNews } from '~/components/useCampaign';

const fmt = (s: number) => `${Math.floor(s / 60)}:${(s % 60).toFixed(1).padStart(4, '0')}`;

export const StarIcon = ({ on, className = 'h-5 w-5', style }: { on: boolean; className?: string; style?: React.CSSProperties }) => (
  <svg viewBox="0 0 24 24" className={className} style={style} aria-hidden="true">
    <path
      d="M12 2.6l2.9 6 6.6.8-4.9 4.5 1.3 6.5L12 17.2l-5.9 3.2 1.3-6.5-4.9-4.5 6.6-.8z"
      fill={on ? '#ffd23f' : 'rgba(230,235,245,0.08)'}
      stroke={on ? '#b8860b' : 'rgba(230,235,245,0.45)'}
      strokeWidth="1.4"
      strokeLinejoin="round"
    />
  </svg>
);

export const Stars = ({ n, size = 'h-4 w-4', label = true }: { n: number; size?: string; label?: boolean }) => (
  <span className="inline-flex items-center gap-0.5" role={label ? 'img' : undefined} aria-label={label ? `${n} of 3 stars` : undefined}>
    {[0, 1, 2].map((i) => (
      <StarIcon key={i} on={i < n} className={size} />
    ))}
  </span>
);

const chapterName = (n: number) => CHAPTERS[n - 1]?.name ?? '';

/** What to do in this level, in one plain sentence (the core idea first: the lot has one free bay, find it and park in it). */
export const objectiveOf = (lv: LevelHud): string =>
  lv.type === 'unpark'
    ? 'Back out of your bay and drive into the green circle'
    : lv.type === 'race'
      ? 'Find the one free bay and park in it before your rivals'
      : lv.legs > 1
        ? `Park in each marked bay in turn (${lv.legs} bays)`
        : lv.facing === 'tail'
          ? 'Find the free bay under the P and reverse into it'
          : 'Find the free bay under the P and park in it';

/** The controls in a line, for the intro card: keys on a keyboard, the on-screen pads on a phone. */
const ControlsLine = ({ touch }: { touch: boolean }) => (
  <div className="text-cream/80 flex flex-wrap items-center justify-center gap-x-3 gap-y-1 text-[11px] sm:text-xs">
    {touch ? (
      <>
        <span><b className="text-green">GAS</b> to drive</span>
        <span><b className="text-cream">BRAKE</b> (hold to reverse)</span>
        <span><b className="text-cream">◀ ▶</b> steer</span>
      </>
    ) : (
      <>
        <span><Kbd>W</Kbd> <Kbd>↑</Kbd> gas</span>
        <span><Kbd>S</Kbd> <Kbd>↓</Kbd> brake, hold to reverse</span>
        <span><Kbd>A</Kbd> <Kbd>D</Kbd> steer</span>
        <span><Kbd>Esc</Kbd> pause</span>
      </>
    )}
  </div>
);

const Kbd = ({ children }: { children: React.ReactNode }) => (
  <kbd className="bg-cream/10 border-cream/30 text-cream inline-flex min-w-5 items-center justify-center rounded-sm border border-b-2 px-1 text-[10px] leading-4 font-bold">{children}</kbd>
);

/** The card on the start line: what this level is about and its three goals. Compact on a retry. */
export const LevelIntro = ({ hud, touch, compact }: { hud: HudState; touch: boolean; compact: boolean }) => {
  const lv = hud.campaign!;
  return (
    <div
      className={`pointer-events-none absolute z-[5] flex flex-col items-center gap-1.5 px-4 text-center ${touch ? 'portrait:top-[200px] portrait:inset-x-2 landscape:top-[64px] landscape:inset-x-[11rem]' : 'left-3 w-[26rem] max-w-[40vw] lg:left-6'}`}
      style={{ ...(touch ? {} : { top: 'calc(56px + env(safe-area-inset-top))' }), animation: 'fadeIn 0.25s ease-out both' }}
      role="group"
      aria-label={`Level ${lv.n}: ${lv.name}`}
    >
      <div className="panel-cut bg-ink-deep/80 flex max-w-lg flex-col items-center gap-1.5 px-5 py-3 backdrop-blur-sm sm:px-7 sm:py-4">
        <div className="text-lilac text-xs font-semibold sm:text-sm">
          Level {lv.n} · {chapterName(lv.chapter)}
        </div>
        <div className="font-display text-gold text-2xl leading-none sm:text-4xl [@media(max-height:420px)]:text-xl" style={{ animation: 'riseIn 0.4s ease-out both' }}>
          {lv.name}
        </div>
        <div className="bg-gold/15 border-gold/50 text-gold mt-1 border px-3 py-1.5 text-sm font-bold sm:text-base [@media(max-height:420px)]:py-0.5 [@media(max-height:420px)]:text-xs">{objectiveOf(lv)}</div>
        {!compact && <div className="text-cream/90 max-w-md text-sm sm:text-base [@media(max-height:420px)]:text-xs">{lv.teaches}</div>}
        {(!compact || lv.n <= 2) && <ControlsLine touch={touch} />}
        <ul className={`mt-1 flex flex-col items-start gap-0.5 text-left text-xs sm:text-sm ${compact ? 'hidden sm:flex' : ''} [@media(max-height:420px)]:hidden`} aria-label="Star goals">
          <li className="text-lilac text-[11px] sm:text-xs">Each goal earns a star:</li>
          {lv.goals.map((g) => (
            <li key={g} className="text-cream/85 flex items-center gap-2">
              <StarIcon on className="h-3.5 w-3.5" />
              <span>{g}</span>
            </li>
          ))}
        </ul>
        {lv.waiting ? (
          <div className="font-display text-green mt-1 text-base tracking-wide sm:text-lg" style={{ animation: 'glowPulse 1.4s ease-in-out infinite' }}>
            {touch ? 'Press GAS to start' : 'Press gas to start'}
          </div>
        ) : hud.countdown > 0 ? (
          <div key={hud.countdown} className="font-display text-gold text-5xl leading-none sm:text-7xl" style={{ animation: 'countPop 1s ease-out both' }}>
            {hud.countdown}
          </div>
        ) : null}
        {lv.facing === 'tail' && <div className="text-blue text-xs font-bold sm:text-sm">Back in: the arrow shows where the nose must point.</div>}
      </div>
    </div>
  );
};

/** Top bar: the level, the time against par (and the limit at the end), and the three stars still in reach. */
export const LevelBar = ({ hud, touch }: { hud: HudState; touch: boolean }) => {
  const lv = hud.campaign!;
  const t = hud.clock;
  const hurry = hud.phase === 'race' && hud.left <= 10;
  return (
    <div className="flex items-stretch gap-1.5" role="status" aria-label={`Level ${lv.n}, ${fmt(t)}, two stars for under ${lv.par} seconds`}>
      <div className="panel-cut bg-ink-deep/75 font-display text-gold flex items-center px-2 text-xs whitespace-nowrap sm:px-3 sm:text-sm">
        {lv.n}
        <span className={`text-cream/80 pl-1.5 ${touch ? 'hidden' : 'hidden sm:inline'}`}>{lv.name}</span>
        {lv.legs > 1 && <span className="text-blue pl-1.5">{`Bay ${lv.leg + 1}/${lv.legs}`}</span>}
      </div>
      <div className={`panel-cut bg-ink-deep/75 flex items-center gap-2 px-3 py-1 sm:px-4 ${hurry ? 'text-orange' : 'text-cream'}`} style={hurry ? { animation: 'hurry 1s ease-in-out infinite' } : undefined}>
        <span className="font-display text-base tabular-nums sm:text-xl">{hurry ? `0:${String(Math.ceil(hud.left)).padStart(2, '0')}` : fmt(t)}</span>
        {/* The time goal in words: the second star is for parking under this time (the stars themselves land on the result card). */}
        <span className={`flex items-center gap-1 text-[11px] font-bold tabular-nums whitespace-nowrap sm:text-xs ${t <= lv.par ? 'text-green' : 'text-lilac'}`} title="Park under this time for the second star">
          <StarIcon on className="h-3 w-3" />
          {t <= lv.par ? `under ${lv.par} s` : `missed ${lv.par} s`}
        </span>
      </div>
    </div>
  );
};

/** In the bay: what to do, the hold filling, and how precise the park is (the third star wants 80 %). */
export const PrecisionMeter = ({ hud }: { hud: HudState }) => {
  const lv = hud.campaign!;
  const parked = hud.park >= 1;
  const p = lv.precision;
  const hint = parked
    ? 'Parked'
    : hud.inBay < 0.999
      ? 'Get all of it inside'
      : !lv.aligned
        ? lv.facing === 'tail'
          ? 'Back in: nose out'
          : lv.facing === 'nose'
            ? 'Nose in, and straighten'
            : 'Straighten up'
        : hud.speed > 1.6
          ? 'Stop'
          : 'Hold still…';
  return (
    <div className="panel-cut bg-ink-deep/85 pointer-events-none w-64 p-3 text-center backdrop-blur-sm" style={{ animation: lv.aligned ? 'glowPulse 1s ease-in-out infinite' : undefined }}>
      <div className="font-display text-sm tracking-wide" style={{ color: lv.aligned ? '#3ddc84' : '#e6ebf5' }}>{hint}</div>
      <div className="bg-cream/10 mt-2 h-2.5 w-full overflow-hidden rounded-sm" role="progressbar" aria-label="Park hold" aria-valuenow={Math.round(hud.park * 100)} aria-valuemin={0} aria-valuemax={100}>
        <div className="bg-green h-full" style={{ width: `${Math.round(hud.park * 100)}%`, transition: 'width 0.1s linear' }} />
      </div>
      {lv.scoresPrecision && (
        <div className="mt-2 flex items-center gap-2">
          <span className="text-lilac text-[11px] font-semibold">Precision</span>
          <div className="bg-cream/10 relative h-2 flex-1 rounded-sm" role="meter" aria-label="Precision" aria-valuenow={p ?? 0} aria-valuemin={0} aria-valuemax={100}>
            <div className={`h-full rounded-sm ${p !== null && p >= PRECISION_STAR ? 'bg-gold' : 'bg-blue'}`} style={{ width: `${p ?? 0}%`, transition: 'width 0.15s linear' }} />
            <div className="bg-cream absolute top-[-3px] h-[14px] w-[2px]" style={{ left: `${PRECISION_STAR}%` }} aria-hidden="true" />
          </div>
          <span className={`font-display w-10 text-right text-sm tabular-nums ${p !== null && p >= PRECISION_STAR ? 'text-gold' : 'text-cream'}`}>{p ?? 0}%</span>
        </div>
      )}
    </div>
  );
};

const FAIL_TITLE: Record<string, string> = { time: 'Out of time', crash: 'Too hard a hit', pedestrian: 'You hit a shopper', lost: 'Beaten to it' };

/** The level's result: the stars land one by one, each goal is ticked or not, then Next, Retry and the map. */
export const LevelResult = ({
  hud,
  news,
  next,
  onNext,
  onRetry,
  onMap,
}: {
  hud: HudState;
  news: RunNews | null;
  /** The next level's name when it is open now. */
  next: { n: number; name: string } | null;
  onNext: () => void;
  onRetry: () => void;
  onMap: () => void;
}) => {
  const lv = hud.campaign!;
  const run = lv.run!;
  const ok = run.failed === null;
  const rows: [string, boolean, string][] = [
    [lv.goals[0], run.goals.finish, ok ? fmt(run.time) : run.failed === 'crash' ? `hit ${hud.result?.hit ?? 'something'}` : FAIL_TITLE[run.failed!]],
    [lv.goals[1], run.goals.par, ok ? `${run.time.toFixed(1)} s / ${lv.par} s` : '–'],
    [lv.goals[2], run.goals.clean, ok ? `${run.grazes === 0 ? 'no grazes' : `${run.grazes} ${run.grazes === 1 ? 'graze' : 'grazes'}`}${lv.scoresPrecision ? ` · ${run.precision}%` : ''}` : '–'],
  ];
  const title = ok ? (run.stars === 3 ? 'Perfect' : lv.type === 'unpark' ? "You're out" : lv.type === 'race' ? 'Parked first' : 'Parked') : FAIL_TITLE[run.failed!];
  return (
    <div className="bg-ink-deep/70 absolute inset-0 z-30 flex items-center justify-center p-3 backdrop-blur-sm" style={{ animation: 'fadeIn 0.3s ease-out both' }} role="dialog" aria-label="Result">
      <div className="panel-cut bg-ink border-blue/20 max-h-[calc(100dvh-16px)] w-full max-w-md overflow-y-auto border p-4 text-center sm:p-6" style={{ animation: 'riseIn 0.4s ease-out both' }}>
        <div className="text-lilac text-sm font-semibold">
          Level {lv.n} · {lv.name}
        </div>
        <div className={`font-display text-3xl sm:text-4xl ${ok ? 'text-green' : 'text-orange'}`}>{title}</div>
        <div className="my-2 flex items-end justify-center gap-2 sm:my-3 [@media(max-height:420px)]:my-1" role="img" aria-label={`${run.stars} of 3 stars`}>
          {[0, 1, 2].map((i) => (
            <StarIcon
              key={i}
              on={i < run.stars}
              className={`fx-star ${i === 1 ? 'h-16 w-16 sm:h-20 sm:w-20 [@media(max-height:420px)]:h-12 [@media(max-height:420px)]:w-12' : 'h-12 w-12 sm:h-16 sm:w-16 [@media(max-height:420px)]:h-10 [@media(max-height:420px)]:w-10'}`}
              style={i < run.stars ? { animation: `starPop 0.45s cubic-bezier(0.2,0.8,0.2,1) ${0.25 + i * 0.3}s both` } : { opacity: 0.7 }}
            />
          ))}
        </div>
        <ul className="flex flex-col gap-1 text-left text-sm [@media(max-height:420px)]:text-xs">
          {rows.map(([goal, met, detail]) => (
            <li key={goal} className="bg-ink-deep/60 flex items-center gap-2 px-3 py-1.5">
              <StarIcon on={met} className="h-3.5 w-3.5" style={met ? undefined : { opacity: 0.6 }} />
              <span className={`flex-1 ${met ? 'text-cream' : 'text-cream/55'}`}>{goal}</span>
              <span className={`text-xs tabular-nums ${met ? 'text-green' : 'text-lilac'}`}>{detail}</span>
              <span className={`w-4 text-center font-bold ${met ? 'text-green' : 'text-orange/80'}`} aria-label={met ? 'met' : 'missed'}>
                {met ? '✓' : '✗'}
              </span>
            </li>
          ))}
        </ul>
        {news && (news.opened || news.newBest || news.endless) && (
          <div className="text-gold mt-2 flex flex-col gap-0.5 text-sm font-semibold">
            {news.opened && <span>Chapter {news.opened}, {CHAPTERS[news.opened - 1].name}, is open.</span>}
            {news.endless && <span>Endless race is open in the main menu.</span>}
            {news.newBest && !news.opened && <span>New best time.</span>}
          </div>
        )}
        {ok && run.stars < 3 && (
          <p className="text-lilac mt-2 text-xs">
            {!run.goals.par ? `Beat ${lv.par} s for the second star.` : lv.scoresPrecision ? `Park clean and ${PRECISION_STAR}% straight for the third.` : 'Touch nothing for the third star.'}
          </p>
        )}
        {next && (
          <p className="text-cream/70 mt-3 text-sm [@media(max-height:420px)]:mt-1 [@media(max-height:420px)]:text-xs">
            Up next: <b className="text-cream">{next.name}</b>
          </p>
        )}
        <div className="mt-2 flex flex-col gap-2 sm:flex-row [@media(max-height:420px)]:flex-row">
          {next && (
            <button type="button" autoFocus onClick={onNext} className="panel-cut bg-gold font-display text-ink-deep flex min-w-0 flex-[1.4] items-center justify-center px-4 py-3 text-base whitespace-nowrap transition hover:brightness-110 active:scale-95 sm:text-lg [@media(max-height:420px)]:py-2">
              Next <span className="ml-1">→</span>
            </button>
          )}
          <button
            type="button"
            autoFocus={!next}
            onClick={onRetry}
            className={`panel-cut font-display flex flex-1 items-center justify-center px-4 py-3 text-base transition active:scale-95 sm:text-lg [@media(max-height:420px)]:py-2 ${next ? 'bg-cream/10 text-cream hover:bg-cream/20' : 'bg-gold text-ink-deep hover:brightness-110'}`}
          >
            Retry
          </button>
          <button type="button" onClick={onMap} className="panel-cut bg-cream/10 font-display text-cream flex flex-1 items-center justify-center px-4 py-3 text-base transition hover:bg-cream/20 active:scale-95 sm:text-lg [@media(max-height:420px)]:py-2">
            Map
          </button>
        </div>
        <p className="text-lilac mt-3 hidden text-xs sm:block">
          <kbd className="font-bold">Enter</kbd> {next ? 'plays the next level' : 'tries again'} · <kbd className="font-bold">R</kbd> restarts any time
        </p>
      </div>
    </div>
  );
};
