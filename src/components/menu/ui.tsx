'use client';

/**
 * The menu's building blocks: the slide-in panel, setting rows (segmented choice, switch, slider), and keyboard / gamepad
 * navigation. Everything is a real button, radio or range input, so Tab, arrows, Enter and Space work as a browser expects;
 * `useMenuNav` adds ↑/↓ between items and Esc for back, and `usePadNav` drives the same from a gamepad.
 */
import { useEffect, useRef } from 'react';

import type { ReactNode, RefObject } from 'react';

/** Move focus to the next / previous `[data-nav]` element inside `root` (wrapping). */
export const moveFocus = (root: HTMLElement, dir: 1 | -1) => {
  const items = Array.from(root.querySelectorAll<HTMLElement>('[data-nav]')).filter((el) => !el.hasAttribute('disabled') && el.offsetParent !== null);
  if (!items.length) return;
  const i = items.indexOf(document.activeElement as HTMLElement);
  const next = items[(i + dir + items.length) % items.length] ?? items[0];
  next.focus();
};

/**
 * ↑/↓ move between the `[data-nav]` items of a menu, Esc goes back. Arrow keys inside a slider or a radio group keep their
 * own meaning (left/right change the value), so only up/down are taken, and only when the focus is not in a text field.
 */
export const useMenuNav = (root: RefObject<HTMLElement | null>, onBack?: () => void, active = true) => {
  const back = useRef(onBack);
  back.current = onBack;
  useEffect(() => {
    if (!active) return;
    const onKey = (e: KeyboardEvent) => {
      const el = root.current;
      if (!el || e.defaultPrevented) return;
      if (document.querySelector('[data-capturing]')) return;
      if (e.key === 'Escape' && back.current) {
        e.preventDefault();
        back.current();
      } else if ((e.key === 'ArrowDown' || e.key === 'ArrowUp') && !(document.activeElement instanceof HTMLInputElement && document.activeElement.type === 'text')) {
        e.preventDefault();
        moveFocus(el, e.key === 'ArrowDown' ? 1 : -1);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [root, active]);
};

/** Set a range input's value from code so React's onChange sees it (a gamepad nudging a slider). */
const nudge = (input: HTMLInputElement, dir: 1 | -1) => {
  const step = Number(input.step) || 1;
  const v = Math.min(Number(input.max), Math.max(Number(input.min), Number(input.value) + dir * step * 5));
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set?.call(input, String(v));
  input.dispatchEvent(new Event('input', { bubbles: true }));
};

/**
 * A gamepad in the menus: d-pad / left stick up and down move between items, left and right change a slider or a choice,
 * A picks, B goes back, LB / RB switch settings tabs (through `onTab`).
 */
export const usePadNav = (root: RefObject<HTMLElement | null>, { onBack, onTab, active = true }: { onBack?: () => void; onTab?: (dir: 1 | -1) => void; active?: boolean }) => {
  const cb = useRef({ onBack, onTab });
  cb.current = { onBack, onTab };
  useEffect(() => {
    if (!active || typeof navigator === 'undefined' || !navigator.getGamepads) return;
    let raf = 0;
    let prev: boolean[] = [];
    let repeatAt = 0;
    const loop = (t: number) => {
      raf = requestAnimationFrame(loop);
      let pad: Gamepad | null = null;
      try {
        pad = Array.from(navigator.getGamepads()).find((g) => g && g.connected) ?? null;
      } catch {
        return;
      }
      if (!pad) return;
      const ay = pad.axes[1] ?? 0;
      const ax = pad.axes[0] ?? 0;
      const now = [
        pad.buttons[12]?.pressed || ay < -0.6,
        pad.buttons[13]?.pressed || ay > 0.6,
        pad.buttons[14]?.pressed || ax < -0.6,
        pad.buttons[15]?.pressed || ax > 0.6,
        pad.buttons[0]?.pressed,
        pad.buttons[1]?.pressed,
        pad.buttons[4]?.pressed,
        pad.buttons[5]?.pressed,
      ].map(Boolean);
      const held = now.slice(0, 4).some(Boolean);
      const fresh = (i: number) => now[i] && (!prev[i] || (held && t > repeatAt));
      const el = root.current;
      const focus = document.activeElement as HTMLElement | null;
      if (el) {
        if (fresh(0) || fresh(1)) moveFocus(el, fresh(0) ? -1 : 1);
        if (fresh(2) || fresh(3)) {
          const dir = fresh(2) ? -1 : 1;
          if (focus instanceof HTMLInputElement && focus.type === 'range') nudge(focus, dir);
          else if (focus?.getAttribute('role') === 'radio') {
            const group = Array.from(focus.parentElement?.querySelectorAll<HTMLElement>('[role="radio"]') ?? []);
            const next = group[group.indexOf(focus) + dir];
            next?.focus();
            next?.click();
          }
        }
        if (fresh(4) && focus && el.contains(focus)) focus.click();
        if (fresh(5)) cb.current.onBack?.();
        if (fresh(6)) cb.current.onTab?.(-1);
        if (fresh(7)) cb.current.onTab?.(1);
      }
      if (held && (now.some((v, i) => v && !prev[i]) || t > repeatAt)) repeatAt = t + (now.some((v, i) => v && !prev[i]) ? 380 : 140);
      prev = now;
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [root, active]);
};

/** The panel that slides in from the left over the menu column (settings, stage select, how to play, credits). */
export const Panel = ({
  title,
  kicker,
  onBack,
  children,
  footer,
  wide = false,
  panelRef,
}: {
  title: string;
  kicker?: string;
  onBack: () => void;
  children: ReactNode;
  footer?: ReactNode;
  wide?: boolean;
  panelRef?: RefObject<HTMLDivElement | null>;
}) => (
  <div
    ref={panelRef}
    className={`settings bg-ink-deep/95 bay-lines absolute inset-y-0 left-0 z-40 flex w-full flex-col shadow-[24px_0_80px_rgba(0,0,0,0.6)] backdrop-blur-md ${wide ? 'sm:w-[min(640px,100vw)]' : 'sm:w-[min(560px,100vw)]'}`}
    style={{ animation: 'panelIn 0.32s cubic-bezier(0.2,0.8,0.2,1) both', paddingLeft: 'env(safe-area-inset-left)' }}
    role="dialog"
    aria-label={title}
    data-keys-capture
  >
    <div className="kerb h-1.5 shrink-0" aria-hidden="true" />
    <header className="flex shrink-0 items-end justify-between gap-4 px-5 pt-5 pb-3 sm:px-8 sm:pt-7">
      <div>
        <h2 className="font-display text-cream -skew-x-6 text-3xl leading-none sm:text-4xl">{title}</h2>
        {kicker && <div className="text-lilac mt-2 text-sm">{kicker}</div>}
      </div>
      <button type="button" data-nav onClick={onBack} className="text-lilac hover:text-cream flex min-h-11 items-center gap-2 px-2 text-sm font-bold tracking-widest uppercase">
        <kbd className="border-cream/30 rounded-sm border px-1.5 text-[10px]">Esc</kbd> Back
      </button>
    </header>
    <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 pb-6 sm:px-8">{children}</div>
    {footer && <div className="border-cream/10 flex shrink-0 items-center justify-between gap-3 border-t px-5 py-3 sm:px-8" style={{ paddingBottom: 'calc(12px + env(safe-area-inset-bottom))' }}>{footer}</div>}
  </div>
);

export const Row = ({ label, hint, children, id }: { label: string; hint?: ReactNode; children: ReactNode; id?: string }) => (
  <div className="border-cream/8 flex flex-col gap-2 border-b py-3.5 sm:flex-row sm:items-center sm:gap-4">
    <div className="sm:w-44 sm:shrink-0">
      <div id={id} className="text-cream text-sm font-bold">{label}</div>
      {hint && <div className="text-lilac mt-0.5 text-xs leading-snug">{hint}</div>}
    </div>
    <div className="min-w-0 flex-1">{children}</div>
  </div>
);

export const Segmented = <T extends string>({ value, options, onChange, label }: { value: T; options: { v: T; label: string }[]; onChange: (v: T) => void; label: string }) => (
  <div className="flex gap-1" role="radiogroup" aria-label={label}>
    {options.map((o) => (
      <button
        key={o.v}
        type="button"
        role="radio"
        data-nav
        aria-checked={value === o.v}
        onClick={() => onChange(o.v)}
        onKeyDown={(e) => {
          if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
          e.preventDefault();
          const i = options.findIndex((x) => x.v === value) + (e.key === 'ArrowRight' ? 1 : -1);
          const next = options[Math.max(0, Math.min(options.length - 1, i))];
          onChange(next.v);
          (e.currentTarget.parentElement?.querySelectorAll<HTMLElement>('[role="radio"]')[options.indexOf(next)])?.focus();
        }}
        className={`min-h-10 flex-1 -skew-x-6 px-2 text-xs font-bold tracking-wide uppercase transition sm:text-sm ${value === o.v ? 'bg-gold text-ink-deep' : 'bg-cream/8 text-cream hover:bg-cream/15'}`}
      >
        <span className="inline-block skew-x-6">{o.label}</span>
      </button>
    ))}
  </div>
);

export const Toggle = ({ on, onChange, label }: { on: boolean; onChange: (v: boolean) => void; label: string }) => (
  <button
    type="button"
    role="switch"
    data-nav
    aria-checked={on}
    aria-label={label}
    onClick={() => onChange(!on)}
    className="group flex min-h-10 items-center gap-3"
  >
    <span className={`relative h-6 w-12 -skew-x-12 transition ${on ? 'bg-gold' : 'bg-cream/15'}`}>
      <span className={`bg-ink-deep absolute top-1 h-4 w-4 transition-all ${on ? 'left-7' : 'left-1'}`} />
    </span>
    <span className={`text-xs font-bold tracking-widest uppercase ${on ? 'text-gold' : 'text-lilac'}`}>{on ? 'On' : 'Off'}</span>
  </button>
);

export const Slider = ({ value, onChange, label, min = 0, max = 100, step = 1, format = (v: number) => `${v}` }: { value: number; onChange: (v: number) => void; label: string; min?: number; max?: number; step?: number; format?: (v: number) => string }) => (
  <div className="flex items-center gap-3">
    <input
      type="range"
      data-nav
      min={min}
      max={max}
      step={step}
      value={value}
      aria-label={label}
      onChange={(e) => onChange(Number(e.target.value))}
      className="slider min-w-0 flex-1"
      style={{ ['--fill' as string]: `${((value - min) / (max - min)) * 100}%` }}
    />
    <span className="text-cream w-12 text-right text-sm font-bold tabular-nums">{format(value)}</span>
  </div>
);

export const Kbd = ({ children }: { children: ReactNode }) => (
  <kbd className="bg-cream/10 border-cream/30 text-cream inline-flex min-w-6 items-center justify-center rounded-sm border border-b-2 px-1.5 text-[11px] leading-5 font-bold">{children}</kbd>
);
