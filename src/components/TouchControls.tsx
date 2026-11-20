'use client';

import { useEffect, useRef, useState } from 'react';

import type { Input } from '~/game/sim/types';

type Key = 'left' | 'right' | 'gas' | 'brake' | 'hand' | 'horn';

/**
 * True on phones and tablets (known only after mount). The portal's own device type wins when it gives one (CrazyGames asks
 * games not to rely on touch detection alone); otherwise a coarse pointer decides. A laptop with a touch screen switches to
 * touch controls on its first touch.
 */
export const useTouch = (device: 'desktop' | 'tablet' | 'mobile' | null = null) => {
  const [touch, setTouch] = useState(false);
  useEffect(() => {
    setTouch(device ? device !== 'desktop' : !!window.matchMedia?.('(pointer: coarse)').matches);
    const onTouch = () => setTouch(true);
    window.addEventListener('touchstart', onTouch, { once: true, passive: true });
    return () => window.removeEventListener('touchstart', onTouch);
  }, [device]);
  return touch;
};

let askedFullscreen = false;
/** Ask once for fullscreen: on Android it hides the browser bars and turns the phone sideways. */
const goFullscreen = () => {
  if (askedFullscreen || typeof document === 'undefined') return;
  askedFullscreen = true;
  const el = document.documentElement;
  if (!el.requestFullscreen || document.fullscreenElement) return;
  el.requestFullscreen({ navigationUI: 'hide' })
    .then(() => (screen.orientation as ScreenOrientation & { lock?: (o: string) => Promise<void> }).lock?.('landscape'))
    .catch(() => undefined);
};

const Pad = ({
  id,
  label,
  press,
  className,
  tone = 'plain',
  fullscreen,
}: {
  id: Key;
  label: string;
  press: (k: Key, on: boolean) => void;
  className: string;
  tone?: 'plain' | 'gold' | 'green';
  fullscreen: boolean;
}) => {
  const [down, setDown] = useState(false);
  const set = (on: boolean) => {
    setDown(on);
    press(id, on);
  };
  const colour = down
    ? 'scale-95 border-gold bg-gold/90 text-ink-deep'
    : tone === 'green'
      ? 'border-green/70 bg-green/25 text-green'
      : tone === 'gold'
        ? 'border-gold/70 bg-ink-deep/60 text-gold'
        : 'border-cream/30 bg-ink-deep/55 text-cream/90';
  return (
    <button
      type="button"
      aria-label={label}
      className={`font-display absolute flex touch-none items-center justify-center border-2 uppercase shadow-lg transition-transform select-none ${colour} ${className}`}
      onPointerDown={(e) => {
        if (fullscreen) goFullscreen();
        e.currentTarget.setPointerCapture(e.pointerId);
        set(true);
      }}
      onPointerUp={() => set(false)}
      onPointerCancel={() => set(false)}
      onLostPointerCapture={() => set(false)}
      onContextMenu={(e) => e.preventDefault()}
    >
      {label}
    </button>
  );
};

/**
 * Phone controls. Left strip: steer left and right. Right strip: a big GAS under the thumb, BRAKE
 * (reverses once stopped) beside it, HANDBRAKE above. Horn and camera sit small at the top.
 * Every button is its own pointer, so any combination works at once.
 */
export const TouchControls = ({
  onInput,
  onCamera,
  onPause,
  onRetry,
  fullscreen = true,
  onShift,
  size = 1,
  opacity = 0.9,
  leftHanded = false,
}: {
  onInput: (input: Partial<Input>) => void;
  onCamera: () => void;
  onPause: () => void;
  /** A campaign level: restart it at once. */
  onRetry?: () => void;
  /** Ask for fullscreen on the first touch (our own site only: portals provide fullscreen and forbid games asking for it). */
  fullscreen?: boolean;
  /** The manual gearbox's + / − buttons (shown only when given). */
  onShift?: (dir: 1 | -1) => void;
  /** Settings: button size (scale), opacity, and the left-handed swap (pedals left, steering right). */
  size?: number;
  opacity?: number;
  leftHanded?: boolean;
}) => {
  const state = useRef<Record<Key, boolean>>({ left: false, right: false, gas: false, brake: false, hand: false, horn: false });
  const press = (k: Key, on: boolean) => {
    state.current[k] = on;
    const s = state.current;
    onInput({
      steer: (s.right ? 1 : 0) - (s.left ? 1 : 0),
      throttle: s.gas ? 1 : 0,
      brake: s.brake ? 1 : 0,
      handbrake: s.hand,
      horn: s.horn,
    });
  };
  useEffect(() => () => onInput({ steer: 0, throttle: 0, brake: 0, handbrake: false, horn: false }), [onInput]);
  const steerSide = leftHanded ? 'right' : 'left';
  const pedalSide = leftHanded ? 'left' : 'right';
  return (
    <div className="pointer-events-none absolute inset-0 z-20 select-none">
      <div
        className="pointer-events-auto absolute"
        style={{ [steerSide]: `calc(16px + env(safe-area-inset-${steerSide}))`, bottom: 'calc(16px + env(safe-area-inset-bottom))', width: 160, height: 84, transform: `scale(${size})`, transformOrigin: `bottom ${steerSide}`, opacity }}
      >
        <Pad id="left" label="◀" press={press} fullscreen={fullscreen} className="top-0 left-0 h-[84px] w-[76px] rounded-3xl text-3xl" />
        <Pad id="right" label="▶" press={press} fullscreen={fullscreen} className="top-0 right-0 h-[84px] w-[76px] rounded-3xl text-3xl" />
      </div>
      <div
        className="pointer-events-auto absolute"
        style={{ [pedalSide]: `calc(16px + env(safe-area-inset-${pedalSide}))`, bottom: 'calc(16px + env(safe-area-inset-bottom))', width: 188, height: 150, transform: `scale(${size})`, transformOrigin: `bottom ${pedalSide}`, opacity }}
      >
        {/* Mirrored for the left hand: gas stays under the thumb at the outer edge. */}
        <Pad id="gas" label="Gas" press={press} fullscreen={fullscreen} tone="green" className={`bottom-0 h-24 w-24 rounded-full text-lg ${leftHanded ? 'left-0' : 'right-0'}`} />
        <Pad id="brake" label="Brake" press={press} fullscreen={fullscreen} className={`bottom-0 h-[68px] w-[68px] rounded-full text-xs ${leftHanded ? 'right-0' : 'left-0'}`} />
        <Pad id="hand" label="Hand" press={press} fullscreen={fullscreen} tone="gold" className={`top-2 h-14 w-14 rounded-full text-[10px] ${leftHanded ? 'right-6' : 'left-6'}`} />
        {onShift && (
          <div className={`absolute bottom-0 flex flex-col gap-2 ${leftHanded ? '-right-[66px]' : '-left-[66px]'}`}>
            {([1, -1] as const).map((d) => (
              <button
                key={d}
                type="button"
                aria-label={d === 1 ? 'Shift up' : 'Shift down'}
                onPointerDown={(e) => {
                  e.preventDefault();
                  onShift(d);
                }}
                onContextMenu={(e) => e.preventDefault()}
                className="font-display border-gold/70 bg-ink-deep/60 text-gold flex h-[52px] w-[52px] touch-none items-center justify-center rounded-xl border-2 text-2xl shadow-lg select-none active:scale-90 active:bg-gold active:text-ink-deep"
              >
                {d === 1 ? '+' : '−'}
              </button>
            ))}
          </div>
        )}
      </div>
      <div className="pointer-events-auto absolute flex gap-2" style={{ top: 'calc(10px + env(safe-area-inset-top))', right: 'calc(12px + env(safe-area-inset-right))' }}>
        <div className="relative h-11 w-11">
          <Pad id="horn" label="Horn" press={press} fullscreen={fullscreen} className="inset-0 rounded-full text-[9px]" />
        </div>
        <button
          type="button"
          aria-label="Camera"
          onClick={onCamera}
          className="font-display border-cream/30 bg-ink-deep/55 text-cream/90 h-11 w-11 rounded-full border-2 text-[9px] uppercase"
        >
          Cam
        </button>
        {onRetry && (
          <button
            type="button"
            aria-label="Restart level"
            onClick={onRetry}
            className="font-display border-gold/60 bg-ink-deep/55 text-gold h-11 w-11 rounded-full border-2 text-xl leading-none"
          >
            ↻
          </button>
        )}
        <button
          type="button"
          aria-label="Pause"
          onClick={onPause}
          className="font-display border-cream/30 bg-ink-deep/55 text-cream/90 h-11 w-11 rounded-full border-2 text-sm"
        >
          ❚❚
        </button>
      </div>
    </div>
  );
};
