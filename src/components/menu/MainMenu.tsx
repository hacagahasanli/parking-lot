'use client';

/**
 * The main menu: the live lot behind it (bots hunting for the one free bay, the bay glowing yellow, a slow orbiting camera),
 * a slanted menu column on the left, and panels that slide in over the column (settings, how to play, credits). Play starts the next campaign level at once; Modes opens the game modes (Modes.tsx).
 * On a phone held upright the column becomes a bottom sheet of big buttons under the logo.
 */
import { useEffect, useRef, useState } from 'react';

import { keyLabel } from '~/game/settings';
import { CAMPAIGN, continueLevel, totalStars } from '~/game/sim/campaign';

import type { CampaignProgress } from '~/game/sim/campaign';
import { GAME_TITLE, GAME_VERSION, STUDIO_NAME } from '~/lib/studio';

import { MenuBanner } from './MenuBanner';
import { SettingsPanel } from './SettingsPanel';
import { Kbd, Panel, useMenuNav, usePadNav, useHoverSound } from './ui';

import type { Tab } from './SettingsPanel';
import type { SupportSlot } from '~/components/Race';
import type { HudState } from '~/game/render/game';
import type { Tier } from '~/game/render/quality';
import type { Settings, SettingsStore } from '~/game/settings';
import type { Platform } from '~/platform/types';

export type MenuView = 'root' | 'settings' | 'how' | 'credits';

const Item = ({ id, label, sub, onPick, primary = false, delay, autoFocus = false, badge }: { id: string; label: string; sub?: string; onPick: () => void; primary?: boolean; delay: number; autoFocus?: boolean; badge?: string }) => (
  <li data-id={id} style={{ animation: `menuIn 0.45s cubic-bezier(0.2,0.8,0.2,1) ${delay}s both` }}>
    <button
      type="button"
      data-nav
      autoFocus={autoFocus}
      onClick={onPick}
      className={`menu-item font-display flex w-full -skew-x-[8deg] items-baseline gap-3 text-left uppercase outline-none ${
        primary ? 'bg-gold text-ink-deep hover:!text-ink-deep focus-visible:!text-ink-deep min-h-16 px-5 py-3 text-4xl [@media(max-height:500px)]:min-h-11 [@media(max-height:500px)]:py-1 [@media(max-height:500px)]:text-3xl shadow-[0_10px_40px_rgba(255,210,63,0.25)] sm:text-5xl' : 'text-cream min-h-12 px-5 py-2 text-xl sm:text-2xl [@media(max-height:500px)]:min-h-9 [@media(max-height:500px)]:py-0.5 [@media(max-height:500px)]:text-lg'
      }`}
    >
      <span className="inline-block skew-x-[8deg]">{label}</span>
      {sub && <span className={`inline-block skew-x-[8deg] font-sans text-[11px] font-bold tracking-[0.2em] ${primary ? 'text-ink-deep/70' : 'text-lilac'}`}>{sub}</span>}
      {badge && <span className="bg-orange text-ink-deep ml-auto inline-block skew-x-[8deg] px-1.5 py-0.5 font-sans text-[10px] font-bold tracking-widest">{badge}</span>}
    </button>
  </li>
);

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
    ['Hint (one star)', k('hint')],
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
          ['Earn your stars', 'Campaign: the levels on the map, each with one new trick and a bay that is harder to find. Park inside the time, beat the par, and park clean and straight for three stars. Stars open the next chapter. Stuck? H shows the way, for one star.'],
          ['Then race', 'Race: who parks first, against up to three rivals. Win the first race and Endless opens: the original game, a random bay and three rivals.'],
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
          <div className="text-lilac text-sm font-semibold">A game by</div>
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
  /** Play: straight into the next campaign level (the first one for a new player). */
  onPlay: (levelId: string) => void;
  /** Modes: the game modes screen (campaign map, Race, Endless). */
  onModes: () => void;
  onSound: (kind: 'move' | 'pick' | 'back') => void;
  /** The saved progress (Play shows where the campaign continues). */
  campaign?: CampaignProgress;
  /** The page's platform: on a portal with banners, one banner sits under the menu (MenuBanner); nothing on our own site. */
  platform?: Platform;
  /** The menu is really on screen (the loading screen has gone): the banner may be requested. */
  shown?: boolean;
  /** Our own site's Support us pill under the menu (portals pass nothing: no outbound links). */
  support?: SupportSlot;
  /** Start on a sub-view (the screenshot script). */
  initialView?: MenuView;
  initialTab?: Tab;
}

export const MainMenu = ({ hud, settings, store, touch, tier, portalMuted, logoSrc, onPlay, onModes, onSound, initialView = 'root', initialTab, campaign, platform, shown = true, support: Support }: MainMenuProps) => {
  const hover = useHoverSound(() => onSound('move'));
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

  const cont = campaign ? continueLevel(campaign) : CAMPAIGN[0];
  const stars = campaign ? totalStars(campaign) : 0;
  const open = (v: MenuView) => () => {
    lastFocus.current = v;
    setView(v);
  };

  return (
    <div className="absolute inset-0 z-30 select-none" onPointerOver={hover} onFocusCapture={(e) => (e.target as HTMLElement).hasAttribute('data-nav') && onSound('move')}>
      {/* Shade: dark down the left for the column, a vignette round the edges, a fade at the foot. */}
      <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(90deg,rgba(10,13,24,0.94)_0%,rgba(10,13,24,0.82)_26%,rgba(10,13,24,0.25)_48%,transparent_62%)] portrait:max-sm:bg-[linear-gradient(180deg,rgba(10,13,24,0.7)_0%,transparent_30%,transparent_42%,rgba(10,13,24,0.92)_62%)]" />
      <div className="pointer-events-none absolute inset-0 shadow-[inset_0_0_180px_rgba(0,0,0,0.65)]" />

      <div
        ref={root}
        className={`absolute inset-y-0 left-0 flex w-full flex-col sm:w-[min(36vw,540px)] sm:min-w-[380px] ${view === 'root' ? '' : 'pointer-events-none'}`}
        style={{ paddingLeft: 'env(safe-area-inset-left)', opacity: view === 'root' ? 1 : 0, transition: 'opacity 0.25s' }}
        aria-hidden={view !== 'root'}
      >
        <div className="flex flex-1 flex-col justify-center px-6 pt-6 sm:px-10 [@media(max-height:500px)]:pt-3 portrait:max-sm:justify-between portrait:max-sm:pt-[calc(16px+env(safe-area-inset-top))]">
          <header style={{ animation: 'menuIn 0.6s cubic-bezier(0.2,0.8,0.2,1) both' }}>
            <h1>
              {logoSrc ? (
                <img src={logoSrc} alt={GAME_TITLE} className="h-auto w-full max-w-[460px] drop-shadow-[0_12px_30px_rgba(0,0,0,0.6)] [@media(max-height:500px)]:max-w-[210px] portrait:max-sm:max-w-[300px]" draggable={false} />
              ) : (
                <span className="font-display text-cream block -skew-x-6 text-6xl leading-none">
                  Parking <span className="text-gold">Lot</span>
                </span>
              )}
            </h1>
            <p className="text-cream/85 mt-3 text-sm font-semibold tracking-wide sm:text-base [@media(max-height:500px)]:hidden">Four company cars. One free space. Touch nothing.</p>
          </header>

          <nav aria-label="Main menu" className="mt-8 [@media(max-height:500px)]:mt-3 portrait:max-sm:bg-ink-deep/80 portrait:max-sm:-mx-6 portrait:max-sm:mt-0 portrait:max-sm:px-6 portrait:max-sm:pt-4 portrait:max-sm:pb-2 portrait:max-sm:backdrop-blur-md portrait:max-sm:[animation:sheetIn_0.45s_cubic-bezier(0.2,0.8,0.2,1)_both]">
            <div className="kerb mb-3 hidden h-1 portrait:max-sm:block" aria-hidden="true" />
            <ul className="flex flex-col gap-1.5 [@media(max-height:500px)]:gap-0.5">
              <Item id="play" label="Play" sub={`Level ${cont.n}${stars ? ` · ${stars}★` : ''}`} primary delay={0.08} autoFocus={initialView === 'root'} onPick={() => (onSound('pick'), onPlay(cont.id))} />
              <Item id="modes" label="Modes" delay={0.11} onPick={() => (onSound('pick'), onModes())} />
              <Item id="settings" label="Settings" delay={0.14} onPick={open('settings')} badge={settings.controls.transmission === 'manual' ? 'MANUAL' : undefined} />
              <Item id="how" label="How to play" delay={0.2} onPick={open('how')} />
              <Item id="credits" label="Credits" delay={0.26} onPick={open('credits')} />
            </ul>
            {/* Our own site's support pill (never on a portal): under the menu items, inside the sheet on a phone. */}
            {Support && (
              <div className="mt-5 [@media(max-height:500px)]:mt-2 portrait:max-sm:mt-3" style={{ animation: 'menuIn 0.45s cubic-bezier(0.2,0.8,0.2,1) 0.32s both' }}>
                <Support variant="menu" />
              </div>
            )}
          </nav>
          {/* The portal's banner (none on our own site): under the menu, on a phone at the foot of the sheet, collapsed when empty. */}
          {platform && (
            <div className="mt-4 portrait:max-sm:bg-ink-deep/80 portrait:max-sm:-mx-6 portrait:max-sm:mt-0 portrait:max-sm:px-6 portrait:max-sm:pb-2 empty:hidden">
              <MenuBanner platform={platform} active={shown && view === 'root'} />
            </div>
          )}
        </div>
        <footer className="flex items-center justify-between gap-3 px-6 pb-4 text-xs font-semibold text-lilac sm:px-10 portrait:max-sm:bg-ink-deep/80" style={{ paddingBottom: 'calc(14px + env(safe-area-inset-bottom))', animation: 'fadeIn 0.8s ease-out 0.4s both' }}>
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

      {view === 'settings' && <SettingsPanel settings={settings} store={store} onBack={back} tier={tier} touch={touch} portalMuted={portalMuted} initialTab={initialTab} kicker="Main menu" />}
      {view === 'how' && <HowTo s={settings} onBack={back} touch={touch} />}
      {view === 'credits' && <Credits onBack={back} />}
    </div>
  );
};
