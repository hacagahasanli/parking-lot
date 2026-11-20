'use client';

/**
 * The main menu: the live lot behind it (bots hunting for the one free bay, the bay glowing yellow, a slow orbiting camera),
 * a slanted menu column on the left, and panels that slide in over the column (stage select, settings, how to play, credits).
 * On a phone held upright the column becomes a bottom sheet of big buttons under the logo.
 */
import { useEffect, useRef, useState } from 'react';

import { keyLabel } from '~/game/settings';
import { STAGES } from '~/game/sim/stages';
import { GAME_TITLE, GAME_VERSION, STUDIO_NAME } from '~/lib/studio';

import { SettingsPanel } from './SettingsPanel';
import { Kbd, Panel, useMenuNav, usePadNav } from './ui';

import type { Tab } from './SettingsPanel';
import type { HudState } from '~/game/render/game';
import type { Tier } from '~/game/render/quality';
import type { Settings, SettingsStore } from '~/game/settings';

export type MenuView = 'root' | 'stages' | 'settings' | 'how' | 'credits';

const Lock = () => (
  <svg viewBox="0 0 16 16" className="h-4 w-4" aria-hidden="true" fill="currentColor">
    <path d="M5 7V5a3 3 0 1 1 6 0v2h1a1 1 0 0 1 1 1v6a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V8a1 1 0 0 1 1-1zm1.6 0h2.8V5a1.4 1.4 0 1 0-2.8 0z" />
  </svg>
);

/** The LED sign over the gate, as a small chip above the logo. */
const Led = () => (
  <div className="inline-flex items-center gap-2 bg-black/60 px-2.5 py-1 font-mono text-[11px] font-bold tracking-[0.25em] text-[#ffb02e] ring-1 ring-[#ffb02e]/25">
    <span className="h-1.5 w-1.5 rounded-full bg-[#ff3b2e] shadow-[0_0_8px_#ff3b2e]" style={{ animation: 'ledBlink 1.6s steps(1) infinite' }} />
    FREE SPACES: <span style={{ animation: 'ledBlink 1.2s steps(1) infinite' }}>1</span>
  </div>
);

const Item = ({ id, label, sub, onPick, primary = false, delay, autoFocus = false, badge }: { id: string; label: string; sub?: string; onPick: () => void; primary?: boolean; delay: number; autoFocus?: boolean; badge?: string }) => (
  <li data-id={id} style={{ animation: `menuIn 0.45s cubic-bezier(0.2,0.8,0.2,1) ${delay}s both` }}>
    <button
      type="button"
      data-nav
      autoFocus={autoFocus}
      onClick={onPick}
      className={`menu-item font-display flex w-full -skew-x-[8deg] items-baseline gap-3 text-left uppercase outline-none ${
        primary ? 'bg-gold text-ink-deep hover:!text-ink-deep focus-visible:!text-ink-deep min-h-16 px-5 py-3 text-4xl shadow-[0_10px_40px_rgba(255,210,63,0.25)] sm:text-5xl' : 'text-cream min-h-12 px-5 py-2 text-xl sm:text-2xl'
      }`}
    >
      <span className="inline-block skew-x-[8deg]">{label}</span>
      {sub && <span className={`inline-block skew-x-[8deg] font-sans text-[11px] font-bold tracking-[0.2em] ${primary ? 'text-ink-deep/70' : 'text-lilac'}`}>{sub}</span>}
      {badge && <span className="bg-orange text-ink-deep ml-auto inline-block skew-x-[8deg] px-1.5 py-0.5 font-sans text-[10px] font-bold tracking-widest">{badge}</span>}
    </button>
  </li>
);

const StageSelect = ({ hud, onPlay, onBack }: { hud: HudState; onPlay: (n: number) => void; onBack: () => void }) => {
  const ref = useRef<HTMLDivElement>(null);
  useMenuNav(ref, onBack);
  usePadNav(ref, { onBack });
  const { unlocked, current } = hud.stage;
  return (
    <Panel title="Stage select" kicker={`${unlocked} of ${STAGES.length} open`} onBack={onBack} panelRef={ref}>
      <ol className="flex flex-col gap-2">
        {STAGES.map((st, i) => {
          const n = i + 1;
          const locked = n > unlocked;
          const [floor, name] = st.name.includes(' — ') ? st.name.split(' — ') : [`Stage ${n}`, st.name];
          return (
            <li key={n} style={{ animation: `menuIn 0.35s ease-out ${i * 0.04}s both` }}>
              <button
                type="button"
                data-nav
                autoFocus={n === current}
                disabled={locked}
                onClick={() => onPlay(n)}
                aria-label={`Stage ${n}, ${st.name}${locked ? ', locked: park first in the stage before' : ''}`}
                className={`menu-item flex w-full -skew-x-6 items-center gap-4 border-l-4 px-4 py-3 text-left ${locked ? 'border-cream/10 bg-cream/[0.03] text-cream/35 cursor-not-allowed' : n === current ? 'border-gold bg-gold/10 text-cream' : 'border-cream/25 bg-cream/[0.06] text-cream'}`}
              >
                <span className="font-display w-10 skew-x-6 text-3xl leading-none">{locked ? <Lock /> : n}</span>
                <span className="min-w-0 flex-1 skew-x-6">
                  <span className="text-lilac block text-[10px] font-bold tracking-[0.25em] uppercase">{floor}</span>
                  <span className="font-display block truncate text-lg leading-tight">{name}</span>
                  {!locked && <span className="text-cream/65 mt-0.5 line-clamp-2 block text-xs">{st.news}</span>}
                </span>
                {n === current && !locked && <span className="text-gold skew-x-6 text-[10px] font-bold tracking-widest uppercase">Last played</span>}
              </button>
            </li>
          );
        })}
      </ol>
      <p className="text-lilac mt-4 text-xs leading-relaxed">Park first in a stage to open the next. Every visit starts at stage 1: earn your way up the car park.</p>
    </Panel>
  );
};

const HowTo = ({ s, onBack, touch }: { s: Settings; onBack: () => void; touch: boolean }) => {
  const ref = useRef<HTMLDivElement>(null);
  useMenuNav(ref, onBack);
  usePadNav(ref, { onBack });
  const k = (a: keyof Settings['controls']['bindings']) => s.controls.bindings[a].filter(Boolean).map((c) => <Kbd key={c}>{keyLabel(c)}</Kbd>);
  const manual = s.controls.transmission === 'manual';
  const rows: [string, React.ReactNode][] = [
    ['Gas', k('up')],
    [manual ? 'Brake' : 'Brake, then reverse', k('down')],
    ['Steer', [...k('left'), ...k('right')]],
    ['Handbrake', k('handbrake')],
    ...(manual ? ([['Shift up / down', [...k('shiftUp'), ...k('shiftDown')]]] as [string, React.ReactNode][]) : []),
    ['Horn', k('horn')],
    ['Camera', k('camera')],
    ['Pause', k('pause')],
  ];
  return (
    <Panel title="How to play" kicker="One space left" onBack={onBack} panelRef={ref}>
      <ol className="flex flex-col gap-3">
        {[
          ['Find the free bay', 'One space left, and nobody tells you where. Drive the aisles; it lights up yellow when you are close.'],
          ['Park straight, then stop', 'All four wheels inside the lines, standing still. First car parked wins.'],
          ['Touch nothing', 'Another car, a post or a shopper puts you out. Slow is fast.'],
          ['Climb the car park', 'Win a stage to open the next floor: ground, first, the roof, then underground. Six stages.'],
        ].map(([t, d], i) => (
          <li key={t} className="flex gap-4" style={{ animation: `menuIn 0.35s ease-out ${i * 0.05}s both` }}>
            <span className="font-display text-gold w-8 text-3xl leading-none">{i + 1}</span>
            <span>
              <span className="text-cream block font-bold">{t}</span>
              <span className="text-lilac block text-sm">{d}</span>
            </span>
          </li>
        ))}
      </ol>
      <h3 className="text-lilac mt-6 mb-2 text-[11px] font-semibold tracking-[0.3em] uppercase">{touch ? 'Keyboard (when you have one)' : 'Your keys'}</h3>
      <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
        {rows.map(([label, keys]) => (
          <div key={label} className="contents">
            <dt className="text-cream/80">{label}</dt>
            <dd className="flex flex-wrap gap-1">{keys}</dd>
          </div>
        ))}
      </dl>
      {touch && <p className="text-cream/80 mt-4 text-sm">On a phone: ◀ ▶ steer, GAS and BRAKE on the right{manual ? ', + and − shift' : ''}. Swap sides in Settings › Controls.</p>}
      <p className="text-lilac mt-4 text-xs">Change any key in Settings › Controls. A gamepad works too.</p>
      <button type="button" data-nav autoFocus onClick={onBack} className="sr-only focus:not-sr-only">Back</button>
    </Panel>
  );
};

const Credits = ({ onBack }: { onBack: () => void }) => {
  const ref = useRef<HTMLDivElement>(null);
  useMenuNav(ref, onBack);
  usePadNav(ref, { onBack });
  return (
    <Panel title="Credits" onBack={onBack} panelRef={ref}>
      <div className="flex flex-col gap-5">
        <div>
          <div className="text-lilac text-[11px] font-semibold tracking-[0.3em] uppercase">A game by</div>
          <div className="font-display text-gold mt-1 text-3xl">{STUDIO_NAME}</div>
        </div>
        <div className="text-cream/85 text-sm leading-relaxed">
          Design, code, cars, car park, shoppers and every sound: made in code by {STUDIO_NAME}. No borrowed art, no samples.
        </div>
        <div className="text-cream/85 text-sm leading-relaxed">
          Type: Bungee and Chakra Petch (SIL Open Font Licence). Built with three.js and React.
        </div>
        <div className="text-lilac text-xs">
          {GAME_TITLE} v{GAME_VERSION}
        </div>
      </div>
      <button type="button" data-nav autoFocus onClick={onBack} className="sr-only focus:not-sr-only">Back</button>
    </Panel>
  );
};

export interface MainMenuProps {
  hud: HudState;
  settings: Settings;
  store: SettingsStore;
  touch: boolean;
  tier: Tier | null;
  portalMuted: boolean;
  logoSrc?: string;
  onPlay: (stage?: number) => void;
  onSound: (kind: 'move' | 'pick' | 'back') => void;
  /** Start on a sub-view (the screenshot script). */
  initialView?: MenuView;
  initialTab?: Tab;
}

export const MainMenu = ({ hud, settings, store, touch, tier, portalMuted, logoSrc, onPlay, onSound, initialView = 'root', initialTab }: MainMenuProps) => {
  const [view, setViewState] = useState<MenuView>(initialView);
  const root = useRef<HTMLDivElement>(null);
  const lastFocus = useRef<string>('play');
  const setView = (v: MenuView) => {
    onSound(v === 'root' ? 'back' : 'pick');
    setViewState(v);
  };
  const back = () => setView('root');
  useMenuNav(root, undefined, view === 'root');
  usePadNav(root, { active: view === 'root' });
  // Back on the root: focus returns to the item that opened the panel.
  useEffect(() => {
    if (view !== 'root') return;
    root.current?.querySelector<HTMLElement>(`[data-id="${lastFocus.current}"] button`)?.focus();
  }, [view]);

  const { current, unlocked } = hud.stage;
  const stage = STAGES[current - 1];
  const open = (v: MenuView) => () => {
    lastFocus.current = v;
    setView(v);
  };

  return (
    <div className="absolute inset-0 z-30 select-none" onFocusCapture={(e) => (e.target as HTMLElement).hasAttribute('data-nav') && onSound('move')}>
      {/* Shade: dark down the left for the column, a vignette round the edges, a fade at the foot. */}
      <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(90deg,rgba(10,13,24,0.94)_0%,rgba(10,13,24,0.82)_26%,rgba(10,13,24,0.25)_48%,transparent_62%)] portrait:max-sm:bg-[linear-gradient(180deg,rgba(10,13,24,0.7)_0%,transparent_30%,transparent_42%,rgba(10,13,24,0.92)_62%)]" />
      <div className="pointer-events-none absolute inset-0 shadow-[inset_0_0_180px_rgba(0,0,0,0.65)]" />

      {/* Live caption, bottom right: this is the real game running. */}
      <div className="pointer-events-none absolute right-5 bottom-5 hidden items-center gap-2 text-[10px] font-bold tracking-[0.3em] text-cream/70 uppercase sm:flex" style={{ animation: 'fadeIn 1s ease-out 0.6s both' }}>
        <span className="h-2 w-2 rounded-full bg-[#ff3b2e]" style={{ animation: 'ledBlink 1.4s steps(1) infinite' }} />
        Live · three rivals, one space
      </div>

      <div
        ref={root}
        className={`absolute inset-y-0 left-0 flex w-full flex-col sm:w-[min(36vw,540px)] sm:min-w-[380px] ${view === 'root' ? '' : 'pointer-events-none'}`}
        style={{ paddingLeft: 'env(safe-area-inset-left)', opacity: view === 'root' ? 1 : 0, transition: 'opacity 0.25s' }}
        aria-hidden={view !== 'root'}
      >
        <div className="flex flex-1 flex-col justify-center px-6 pt-6 sm:px-10 [@media(max-height:500px)]:pt-3 portrait:max-sm:justify-between portrait:max-sm:pt-[calc(16px+env(safe-area-inset-top))]">
          <header style={{ animation: 'menuIn 0.6s cubic-bezier(0.2,0.8,0.2,1) both' }}>
            <Led />
            <h1 className="mt-4 [@media(max-height:500px)]:mt-2">
              {logoSrc ? (
                <img src={logoSrc} alt={GAME_TITLE} className="h-auto w-full max-w-[460px] drop-shadow-[0_12px_30px_rgba(0,0,0,0.6)] [@media(max-height:500px)]:max-w-[260px] portrait:max-sm:max-w-[300px]" draggable={false} />
              ) : (
                <span className="font-display text-cream block -skew-x-6 text-6xl leading-none">
                  Parking <span className="text-gold">Lot</span>
                </span>
              )}
            </h1>
            <p className="text-cream/85 mt-3 text-sm font-semibold tracking-wide sm:text-base [@media(max-height:500px)]:hidden">Four company cars. One free space. Touch nothing.</p>
          </header>

          <nav aria-label="Main menu" className="mt-8 [@media(max-height:500px)]:mt-3 portrait:max-sm:bg-ink-deep/80 portrait:max-sm:-mx-6 portrait:max-sm:mt-0 portrait:max-sm:px-6 portrait:max-sm:pt-4 portrait:max-sm:pb-2 portrait:max-sm:backdrop-blur-md" style={{ animation: touch ? 'sheetIn 0.45s cubic-bezier(0.2,0.8,0.2,1) both' : undefined }}>
            <div className="kerb mb-3 hidden h-1 portrait:max-sm:block" aria-hidden="true" />
            <ul className="flex flex-col gap-1.5 [@media(max-height:500px)]:gap-0.5">
              <Item id="play" label="Play" sub={stage ? `Stage ${current} · ${stage.name.split(' — ')[1] ?? stage.name}` : undefined} primary delay={0.08} autoFocus={initialView === 'root'} onPick={() => (onSound('pick'), onPlay())} />
              <Item id="stages" label="Stage select" sub={`${unlocked}/${STAGES.length}`} delay={0.14} onPick={open('stages')} />
              <Item id="settings" label="Settings" delay={0.2} onPick={open('settings')} badge={settings.controls.transmission === 'manual' ? 'MANUAL' : undefined} />
              <Item id="how" label="How to play" delay={0.26} onPick={open('how')} />
              <Item id="credits" label="Credits" delay={0.32} onPick={open('credits')} />
            </ul>
          </nav>
        </div>
        <footer className="flex items-center justify-between gap-3 px-6 pb-4 text-[10px] font-bold tracking-[0.25em] text-lilac uppercase sm:px-10 portrait:max-sm:bg-ink-deep/80" style={{ paddingBottom: 'calc(14px + env(safe-area-inset-bottom))', animation: 'fadeIn 0.8s ease-out 0.4s both' }}>
          <span>
            {STUDIO_NAME} · v{GAME_VERSION}
          </span>
          {!touch && (
            <span className="hidden items-center gap-1.5 normal-case tracking-normal lg:flex">
              <Kbd>↑</Kbd>
              <Kbd>↓</Kbd> choose <Kbd>Enter</Kbd> go
            </span>
          )}
        </footer>
      </div>

      {view === 'stages' && <StageSelect hud={hud} onBack={back} onPlay={(n) => (onSound('pick'), onPlay(n))} />}
      {view === 'settings' && <SettingsPanel settings={settings} store={store} onBack={back} tier={tier} touch={touch} portalMuted={portalMuted} initialTab={initialTab} kicker="Main menu" />}
      {view === 'how' && <HowTo s={settings} onBack={back} touch={touch} />}
      {view === 'credits' && <Credits onBack={back} />}
    </div>
  );
};
