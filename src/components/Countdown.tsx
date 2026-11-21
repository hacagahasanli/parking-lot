'use client';

/**
 * The start of every round: after the lead-in (the camera coming down onto your car, which gas or brake skips), three start
 * lights come on one by one with a big 3, 2, 1 slammed into the middle of the screen, then all three turn green with GO.
 * The cars hold on the brake until GO (the sim's countdown); the pips and the GO chord are the sim's count events.
 * Reduced motion: no slam or ring, the numbers simply appear.
 */
import type { HudState } from '~/game/render/game';

const LAMPS = 3;

export const Countdown = ({ hud, touch }: { hud: HudState; touch: boolean }) => {
  const n = hud.phase === 'countdown' && !hud.intro ? hud.countdown : 0;
  const go = hud.phase === 'race' && hud.clock < 0.9 && !hud.result && hud.disqualified === null;
  if (hud.phase === 'countdown' && hud.intro) {
    return (
      <div className="pointer-events-none absolute inset-x-0 z-20 flex justify-center" style={{ bottom: touch ? 'calc(42% + env(safe-area-inset-bottom))' : 'calc(120px + env(safe-area-inset-bottom))' }}>
        <div className="panel-cut bg-ink-deep/80 text-cream border-gold/40 border px-3 py-1 text-xs font-semibold backdrop-blur-sm sm:text-sm" style={{ animation: 'fadeIn 0.4s ease-out 0.5s both' }}>
          {touch ? 'Tap GAS to skip' : 'Press gas to skip'}
        </div>
      </div>
    );
  }
  if (!n && !go) return null;
  const lit = go ? LAMPS : LAMPS + 1 - n;
  return (
    <div className="pointer-events-none absolute inset-0 z-20 flex flex-col items-center justify-center gap-2 sm:gap-4" role="status" aria-live="assertive" aria-label={go ? 'Go' : String(n)}>
      <div className="bg-ink-deep/85 flex gap-2 rounded-full border-2 border-black/60 px-3 py-2 shadow-[0_8px_30px_rgba(0,0,0,0.5)] sm:gap-3 sm:px-4" aria-hidden="true">
        {Array.from({ length: LAMPS }, (_, i) => {
          const on = i < lit;
          const color = go ? '#3ddc84' : '#ff3b2e';
          return (
            <span
              key={i}
              className="h-5 w-5 rounded-full border-2 border-black/50 sm:h-7 sm:w-7"
              style={{ background: on ? color : '#2a2d35', boxShadow: on ? `0 0 18px ${color}, inset 0 -3px 0 rgba(0,0,0,0.25)` : 'inset 0 2px 4px rgba(0,0,0,0.6)' }}
            />
          );
        })}
      </div>
      <div className="relative flex items-center justify-center">
        <span key={go ? 'go-ring' : `r${n}`} className="count-ring absolute rounded-full border-[6px]" style={{ borderColor: go ? '#3ddc84' : '#ffd23f' }} aria-hidden="true" />
        <span
          key={go ? 'go' : n}
          className={`count-num font-display leading-none ${go ? 'text-green text-[7rem] sm:text-[12rem]' : 'text-gold text-[6rem] sm:text-[10rem]'} [@media(max-height:420px)]:text-[4.5rem]`}
          style={{ WebkitTextStroke: '4px #0a0d18', paintOrder: 'stroke fill', textShadow: '0 8px 0 #0a0d18, 0 0 40px rgba(0,0,0,0.45)' }}
        >
          {go ? 'GO' : n}
        </span>
      </div>
    </div>
  );
};
