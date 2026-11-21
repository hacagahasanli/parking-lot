'use client';

/**
 * The game modes, between Play and the game: three big tiles over the live lot. Campaign (the solo parking levels on the map),
 * Race (who parks first, six races against rivals) and Endless (the original race, six random stages). Race and Endless open
 * their list as a panel over the tiles; Campaign goes straight to the level map.
 *
 * Keyboard: arrows move between tiles, Enter or Space picks, 1 / 2 / 3 pick a tile directly, Esc goes back. Mouse and touch: tap a
 * tile. A gamepad moves with the d-pad, picks with A and goes back with B.
 */
import { useEffect, useRef, useState } from 'react';

import { STAGES } from '~/game/sim/stages';
import { CAMPAIGN, RACES, continueLevel, continueRace, endlessOpen, levelOpen, raceStars, racesWon, totalStars } from '~/game/sim/campaign';

import { Stars } from '~/components/campaign/LevelUI';
import { Panel, moveFocus, useMenuNav, usePadNav, useHoverSound } from './ui';

import type { ReactNode } from 'react';
import type { CampaignProgress } from '~/game/sim/campaign';

export type ModesView = 'root' | 'races' | 'endless';

const Lock = ({ className = 'h-4 w-4' }: { className?: string }) => (
  <svg viewBox="0 0 16 16" className={className} aria-hidden="true" fill="currentColor">
    <path d="M5 7V5a3 3 0 1 1 6 0v2h1a1 1 0 0 1 1 1v6a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V8a1 1 0 0 1 1-1zm1.6 0h2.8V5a1.4 1.4 0 1 0-2.8 0z" />
  </svg>
);

/** A painted bay seen from above with a P in it: the campaign. */
const BayArt = () => (
  <svg viewBox="0 0 120 90" className="absolute inset-0 h-full w-full" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
    <rect x="0" y="0" width="120" height="90" fill="#1b2235" />
    {[14, 46, 78, 110].map((x) => (
      <rect key={x} x={x - 2} y="8" width="4" height="58" fill="#e6ebf5" opacity="0.85" />
    ))}
    <rect x="12" y="8" width="100" height="4" fill="#e6ebf5" opacity="0.85" />
    <rect x="20" y="18" width="20" height="40" rx="5" fill="#3a4a6b" />
    <rect x="84" y="18" width="20" height="40" rx="5" fill="#5b4b8a" />
    <rect x="50" y="20" width="24" height="38" fill="#ffd23f" opacity="0.18" />
    <text x="62" y="49" textAnchor="middle" fontFamily="Bungee, Arial, sans-serif" fontSize="26" fill="#ffd23f">P</text>
    <path d="M62 86 L62 70 M55 77 L62 69 L69 77" stroke="#3ec5ff" strokeWidth="4" fill="none" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

/** Three cars nose to nose for one bay under a chequered strip: the race. */
const RaceArt = () => (
  <svg viewBox="0 0 120 90" className="absolute inset-0 h-full w-full" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
    <rect x="0" y="0" width="120" height="90" fill="#1b2235" />
    {Array.from({ length: 12 }, (_, i) => (
      <rect key={i} x={i * 10} y={i % 2 ? 0 : 6} width="10" height="6" fill="#e6ebf5" opacity="0.9" />
    ))}
    <rect x="46" y="22" width="4" height="34" fill="#e6ebf5" opacity="0.85" />
    <rect x="72" y="22" width="4" height="34" fill="#e6ebf5" opacity="0.85" />
    <rect x="50" y="24" width="22" height="30" fill="#ffd23f" opacity="0.2" />
    <rect x="22" y="58" width="16" height="28" rx="4" fill="#ff3d6e" transform="rotate(28 30 72)" />
    <rect x="53" y="60" width="16" height="28" rx="4" fill="#e6ebf5" />
    <rect x="84" y="58" width="16" height="28" rx="4" fill="#3ec5ff" transform="rotate(-28 92 72)" />
  </svg>
);

/** A loop of road with a car on it: the endless race. */
const EndlessArt = () => (
  <svg viewBox="0 0 120 90" className="absolute inset-0 h-full w-full" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
    <rect x="0" y="0" width="120" height="90" fill="#1b2235" />
    <path d="M60 45 C 40 15, 12 20, 14 45 C 16 70, 42 72, 60 45 C 78 18, 104 20, 106 45 C 108 70, 80 75, 60 45 Z" fill="none" stroke="#3a4a6b" strokeWidth="14" />
    <path d="M60 45 C 40 15, 12 20, 14 45 C 16 70, 42 72, 60 45 C 78 18, 104 20, 106 45 C 108 70, 80 75, 60 45 Z" fill="none" stroke="#ffd23f" strokeWidth="2" strokeDasharray="6 6" />
    <rect x="95" y="36" width="10" height="17" rx="3" fill="#ff3d6e" />
  </svg>
);

const Tile = ({
  n,
  title,
  line,
  status,
  art,
  accent,
  locked,
  onPick,
  autoFocus,
  delay,
}: {
  n: number;
  title: string;
  line: string;
  status: ReactNode;
  art: ReactNode;
  accent: string;
  locked?: string;
  onPick: () => void;
  autoFocus?: boolean;
  delay: number;
}) => (
  <li className="flex min-w-0 sm:flex-1 landscape:flex-1" style={{ animation: `menuIn 0.45s cubic-bezier(0.2,0.8,0.2,1) ${delay}s both` }}>
    <button
      type="button"
      data-nav
      data-tile={n}
      autoFocus={autoFocus}
      onClick={onPick}
      aria-label={`${title}. ${line}${locked ? `. Locked: ${locked}` : ''}`}
      aria-disabled={locked ? true : undefined}
      className={`mode-tile panel-cut group flex w-full min-w-0 flex-col overflow-hidden text-left outline-none portrait:max-sm:flex-row ${locked ? 'bg-ink/80' : 'bg-ink/95'}`}
      style={{ ['--accent' as string]: accent }}
    >
      <div className={`relative aspect-[16/9] w-full shrink-0 bg-[#1b2235] landscape:max-lg:aspect-auto landscape:max-lg:h-24 portrait:max-sm:aspect-auto portrait:max-sm:w-28 portrait:max-sm:self-stretch ${locked ? 'opacity-35 grayscale' : ''}`}>
        {art}
        <span className="font-display bg-ink-deep/80 text-cream absolute top-2 left-2 flex h-7 w-7 items-center justify-center text-sm [@media(hover:none)]:hidden">{n}</span>
      </div>
      <div className="flex min-w-0 flex-1 flex-col gap-1 border-t-4 p-3 sm:p-4 landscape:max-lg:p-2.5 portrait:max-sm:border-t-0 portrait:max-sm:border-l-4" style={{ borderColor: accent }}>
        <span className={`font-display -skew-x-6 text-3xl leading-none sm:text-4xl landscape:max-lg:text-xl portrait:max-sm:text-2xl ${locked ? 'text-cream/45' : 'text-cream group-hover:text-gold group-focus-visible:text-gold'}`}>{title}</span>
        <span className={`text-sm leading-snug landscape:max-lg:line-clamp-2 landscape:max-lg:text-xs ${locked ? 'text-cream/45' : 'text-cream/85'}`}>{line}</span>
        <span className="mt-auto flex flex-wrap items-center gap-x-2 pt-1 text-sm font-bold landscape:max-lg:text-xs">
          {locked ? (
            <span className="text-orange flex items-center gap-1.5">
              <Lock /> {locked}
            </span>
          ) : (
            status
          )}
        </span>
      </div>
    </button>
  </li>
);

/** Race mode's list: six races, each opened by winning the one before. */
const RaceList = ({ progress, focus, onPlay, onBack }: { progress: CampaignProgress; focus?: string; onPlay: (id: string) => void; onBack: () => void }) => {
  const ref = useRef<HTMLDivElement>(null);
  useMenuNav(ref, onBack);
  usePadNav(ref, { onBack });
  const cont = continueRace(progress);
  const start = RACES.find((l) => l.id === focus) ?? cont;
  return (
    <Panel title="Race" kicker={`${racesWon(progress)} of ${RACES.length} races won · ${raceStars(progress)}★`} onBack={onBack} panelRef={ref}>
      <ol className="flex flex-col gap-2">
        {RACES.map((l, i) => {
          const open = levelOpen(progress, l);
          const stars = progress.levels[l.id]?.stars ?? 0;
          const rivals = l.bots?.n ?? 0;
          return (
            <li key={l.id} style={{ animation: `menuIn 0.35s ease-out ${i * 0.04}s both` }}>
              <button
                type="button"
                data-nav
                autoFocus={l.id === start.id}
                disabled={!open}
                onClick={() => onPlay(l.id)}
                aria-label={`Race ${l.n}, ${l.name}, ${rivals} ${rivals === 1 ? 'rival' : 'rivals'}${open ? `, ${stars} of 3 stars` : ', locked: win the race before'}`}
                className={`menu-item flex w-full -skew-x-6 items-center gap-4 border-l-4 px-4 py-3 text-left ${!open ? 'border-cream/10 bg-cream/[0.03] text-cream/35 cursor-not-allowed' : l.id === cont.id ? 'border-gold bg-gold/10 text-cream' : 'border-cream/25 bg-cream/[0.06] text-cream'}`}
              >
                <span className="font-display w-10 skew-x-6 text-3xl leading-none">{open ? l.n : <Lock />}</span>
                <span className="min-w-0 flex-1 skew-x-6">
                  <span className="font-display block truncate text-lg leading-tight">{l.name}</span>
                  <span className="text-cream/65 mt-0.5 line-clamp-2 block text-xs">{l.teaches}</span>
                </span>
                <span className="flex skew-x-6 flex-col items-end gap-1">
                  <span className="text-lilac text-xs font-semibold whitespace-nowrap">
                    {rivals} {rivals === 1 ? 'rival' : 'rivals'}
                  </span>
                  {open && <Stars n={stars} size="h-3.5 w-3.5" />}
                </span>
              </button>
            </li>
          );
        })}
      </ol>
      <p className="text-lilac mt-4 text-xs leading-relaxed">One free bay and rivals looking for it too. Park first to win and open the next race; win the first to open Endless.</p>
    </Panel>
  );
};

/** Endless: the six stages of the original race (park first in one to open the next). */
const StageList = ({ unlocked, current, onPlay, onBack }: { unlocked: number; current: number; onPlay: (n: number) => void; onBack: () => void }) => {
  const ref = useRef<HTMLDivElement>(null);
  useMenuNav(ref, onBack);
  usePadNav(ref, { onBack });
  return (
    <Panel title="Endless" kicker={`${unlocked} of ${STAGES.length} stages open`} onBack={onBack} panelRef={ref}>
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
                  <span className="text-lilac block text-xs font-semibold">{floor}</span>
                  <span className="font-display block truncate text-lg leading-tight">{name}</span>
                  {!locked && <span className="text-cream/65 mt-0.5 line-clamp-2 block text-xs">{st.news}</span>}
                </span>
                {n === current && !locked && <span className="text-gold skew-x-6 text-xs font-bold">Last played</span>}
              </button>
            </li>
          );
        })}
      </ol>
      <p className="text-lilac mt-4 text-xs leading-relaxed">Three rivals, one free bay picked at random. Park first in a stage to open the next; every visit starts at stage 1.</p>
    </Panel>
  );
};

export interface ModesProps {
  progress: CampaignProgress;
  /** The endless race's stages (open, and the one Play would start). */
  stage: { unlocked: number; current: number };
  onCampaign: () => void;
  onRace: (id: string) => void;
  onEndless: (stage: number) => void;
  /** Back to the main menu (the portal); without one, `home` stands in its place (our own site's link home). */
  onBack?: () => void;
  home?: ReactNode;
  onSound: (kind: 'move' | 'pick' | 'back') => void;
  /** Open on a list (back from a race's result goes to the race list). */
  initialView?: ModesView;
  /** The race to select in the race list. */
  focus?: string;
  /** No live lot behind (our own site's page, where the game is hidden until a level starts). */
  solid?: boolean;
}

export const Modes = ({ progress, stage, onCampaign, onRace, onEndless, onBack, home, onSound, initialView = 'root', focus, solid = false }: ModesProps) => {
  const hover = useHoverSound(() => onSound('move'));
  const [view, setViewState] = useState<ModesView>(initialView);
  const root = useRef<HTMLDivElement>(null);
  const last = useRef<number>(initialView === 'races' ? 2 : initialView === 'endless' ? 3 : 1);
  const setView = (v: ModesView) => {
    onSound(v === 'root' ? 'back' : 'pick');
    setViewState(v);
  };
  const endless = endlessOpen(progress);
  const cont = continueLevel(progress);
  const stars = totalStars(progress);
  const raceNext = continueRace(progress);

  const pick = (n: number) => {
    last.current = n;
    if (n === 1) (onSound('pick'), onCampaign());
    else if (n === 2) setView('races');
    else if (endless) setView('endless');
    else onSound('back');
  };

  const back = onBack ? () => (onSound('back'), onBack()) : undefined;
  usePadNav(root, { active: view === 'root', onBack: back });
  // Arrows in every direction move between the tiles (they sit in a row or a column), 1-3 pick one, Esc goes back.
  useEffect(() => {
    if (view !== 'root') return;
    const onKey = (e: KeyboardEvent) => {
      const el = root.current;
      if (!el || e.defaultPrevented) return;
      if ((e.key === 'Escape' || e.key === 'Backspace') && back) {
        e.preventDefault();
        back();
      } else if (['ArrowDown', 'ArrowRight', 'ArrowUp', 'ArrowLeft'].includes(e.key)) {
        e.preventDefault();
        moveFocus(el, e.key === 'ArrowDown' || e.key === 'ArrowRight' ? 1 : -1);
      } else if (e.key === '1' || e.key === '2' || e.key === '3') {
        e.preventDefault();
        pick(Number(e.key));
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });
  // Back on the tiles: focus returns to the tile that opened the list.
  useEffect(() => {
    if (view === 'root') root.current?.querySelector<HTMLElement>(`[data-tile="${last.current}"]`)?.focus();
  }, [view]);

  return (
    <div className="absolute inset-0 z-40 select-none" role="dialog" aria-label="Game modes" data-keys-capture onPointerOver={hover} onFocusCapture={(e) => (e.target as HTMLElement).hasAttribute('data-nav') && onSound('move')}>
      <div className={`pointer-events-none absolute inset-0 ${solid ? 'bg-ink-deep bay-lines' : 'bg-[linear-gradient(180deg,rgba(10,13,24,0.88)_0%,rgba(10,13,24,0.7)_45%,rgba(10,13,24,0.92)_100%)]'}`} />
      <div
        ref={root}
        className={`relative flex h-full flex-col gap-3 px-4 py-4 sm:gap-5 sm:px-10 sm:py-8 ${view === 'root' ? '' : 'pointer-events-none'}`}
        style={{
          paddingTop: 'max(16px, env(safe-area-inset-top))',
          paddingBottom: 'max(14px, env(safe-area-inset-bottom))',
          paddingLeft: 'max(16px, env(safe-area-inset-left))',
          paddingRight: 'max(16px, env(safe-area-inset-right))',
          opacity: view === 'root' ? 1 : 0.25,
          transition: 'opacity 0.25s',
        }}
        aria-hidden={view !== 'root'}
      >
        <header className="flex items-center gap-3" style={{ animation: 'menuIn 0.4s cubic-bezier(0.2,0.8,0.2,1) both' }}>
          {back ? (
            <button type="button" onClick={back} className="panel-cut bg-cream/10 font-display text-cream hover:bg-cream/20 flex min-h-11 items-center gap-1 px-3 text-sm sm:text-base" aria-label="Back to the main menu">
              ← <span className="hidden sm:inline">Back</span>
            </button>
          ) : (
            home
          )}
          <h2 className="font-display text-cream -skew-x-6 text-3xl leading-none sm:text-5xl landscape:max-lg:text-3xl">Game modes</h2>
        </header>

        <ul className="mx-auto flex min-h-0 w-full max-w-6xl flex-1 flex-col justify-center gap-3 sm:flex-row sm:items-center sm:gap-5 landscape:flex-row landscape:items-center landscape:max-lg:gap-3">
          <Tile
            n={1}
            title="Campaign"
            line={`Solo parking. ${CAMPAIGN.length} levels on the map, each harder to find. Search the lot, park it straight.`}
            status={
              <>
                <span className="text-gold">{stars}★</span>
                <span className="text-cream/70">of {CAMPAIGN.length * 3}</span>
                <span className="text-cream/70 landscape:max-lg:hidden">· next: {cont.n} {cont.name}</span>
              </>
            }
            art={<BayArt />}
            accent="#ffd23f"
            autoFocus={initialView === 'root'}
            onPick={() => pick(1)}
            delay={0.05}
          />
          <Tile
            n={2}
            title="Race"
            line="Who parks first. One free bay, up to three rivals looking for it too. Touch nothing."
            status={
              <>
                <span className="text-blue">{racesWon(progress)}/{RACES.length} won</span>
                <span className="text-cream/70 landscape:max-lg:hidden">· next: {raceNext.name}</span>
              </>
            }
            art={<RaceArt />}
            accent="#3ec5ff"
            onPick={() => pick(2)}
            delay={0.1}
          />
          <Tile
            n={3}
            title="Endless"
            line="The original race. Six stages, a random bay each round, three rivals, up through the car park."
            status={<span className="text-green">{stage.unlocked}/{STAGES.length} stages open</span>}
            art={<EndlessArt />}
            accent="#ff3d6e"
            locked={endless ? undefined : 'Win race 1 to open'}
            onPick={() => pick(3)}
            delay={0.15}
          />
        </ul>
      </div>

      {view === 'races' && <RaceList progress={progress} focus={focus} onBack={() => setView('root')} onPlay={(id) => (onSound('pick'), onRace(id))} />}
      {view === 'endless' && <StageList unlocked={stage.unlocked} current={stage.current} onBack={() => setView('root')} onPlay={(n) => (onSound('pick'), onEndless(n))} />}
    </div>
  );
};
