'use client';

/**
 * The campaign map: the real lot drawn from above (the minimap's layers, see render/lotmap.ts), each level a pin on its own bay,
 * the pins joined by a dashed route in play order, three star slots under each pin. One tab per chapter: the open lot for the
 * first two, the car park's four decks side by side for the third, the whole site for the last. A locked chapter is greyed
 * with the stars it needs. The level you would play next pulses; picking a pin shows its card, and Play (or Enter) starts it.
 *
 * Keyboard: arrows move between pins, Enter plays, Q / E (or Page Up / Down) change chapter, Esc goes back. Mouse and touch: tap
 * a pin, then Play; tap the selected pin again to play it.
 */
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';

import { drawLotMap, mapProjection } from '~/game/render/lotmap';
import { ALL_LEVELS, CAMPAIGN, CHAPTERS, RACES, chapterOpen, continueLevel, levelOpen, starsIn, totalStars } from '~/game/sim/campaign';
import { LEVEL_COLOR, levelName } from '~/game/sim/levels';
import { buildLot } from '~/game/sim/lot';

import { StarIcon, Stars } from './LevelUI';
import { useHoverSound } from '../menu/ui';

import type { MapRect, Screen } from '~/game/render/lotmap';
import type { CampaignProgress, LevelDef } from '~/game/sim/campaign';
import type { Lot } from '~/game/sim/lot';

const hex = (c: number) => '#' + c.toString(16).padStart(6, '0');

const LOT_VIEW: MapRect = { x0: -67, x1: 67, z0: -53, z1: 58 };
const SITE_VIEW: MapRect = { x0: -67, x1: 153, z0: -53, z1: 58 };
const GARAGE_VIEW: MapRect = { x0: 69, x1: 152, z0: -20, z1: 19 };
const DECKS = [2, 1, 0, -1];

/** Where a level's pin stands: its first bay, an unpark level's start, or the gate for a race whose bay is drawn at random. */
const pinSpot = (lot: Lot, l: LevelDef) => {
  // Race 1 stands beside level 3 (the result card of level 3 offers it): its pin starts on level 3's and is nudged apart.
  if (l.id === RACES[0].id) return pinSpot(lot, CAMPAIGN[2]);
  if (l.target.length) {
    const b = lot.bays[l.target[0]];
    return { x: b.x, z: b.z, deck: b.garage ? b.lvl : 0 };
  }
  if (l.spawn !== 'gate') return { x: l.spawn.x, z: l.spawn.z, deck: l.spawn.lvl };
  return { x: 0, z: lot.gateZ, deck: 0 };
};

interface Panel {
  view: MapRect;
  deck: number;
  screen: Screen;
  turn: boolean;
  label?: string;
}

/** The panels a chapter's map is drawn in, for a container of this size. */
const panelsFor = (view: 'lot' | 'garage' | 'site', w: number, h: number): Panel[] => {
  const tall = h > w * 1.1;
  if (view !== 'garage') return [{ view: view === 'lot' ? LOT_VIEW : SITE_VIEW, deck: 0, screen: { x: 0, y: 0, w, h }, turn: tall }];
  // The car park's decks as small maps: a column on a tall screen, two by two on a wide one (the roof first).
  const gap = 6;
  return DECKS.map((deck, i) => {
    const screen = tall
      ? { x: 0, y: (i * (h + gap)) / 4, w, h: (h - gap * 3) / 4 }
      : { x: (i % 2) * ((w + gap) / 2), y: Math.floor(i / 2) * ((h + gap) / 2), w: (w - gap) / 2, h: (h - gap) / 2 };
    return { view: GARAGE_VIEW, deck, screen, turn: false, label: levelName(deck) };
  });
};

export interface CampaignMapProps {
  progress: CampaignProgress;
  onPlay: (id: string) => void;
  onBack: () => void;
  /** Open on this level's chapter, with it selected (default: the level Continue would play). */
  focus?: string;
  onSound?: (kind: 'move' | 'pick' | 'back') => void;
}

export const CampaignMap = ({ progress, onPlay, onBack, focus, onSound }: CampaignMapProps) => {
  const lot = useMemo(() => buildLot(), []);
  const cont = continueLevel(progress);
  const start = CAMPAIGN.find((l) => l.id === focus) ?? cont;
  const [chapter, setChapter] = useState<number>(start.chapter);
  const [sel, setSel] = useState<string>(start.id);
  const box = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  const total = totalStars(progress);
  const def = CHAPTERS[chapter - 1];
  const levels = CAMPAIGN.filter((l) => l.chapter === chapter);
  const selected = ALL_LEVELS.find((l) => l.id === sel) ?? levels[0];
  /** Chapter 1 also shows Race 1 as a node beside level 3 (same data as Race mode; not on the route). */
  const nodes = useMemo(() => (chapter === 1 ? [...levels, RACES[0]] : levels), [chapter, levels]);
  const chOpen = chapterOpen(progress, chapter);

  useLayoutEffect(() => {
    const el = box.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setSize({ w: el.clientWidth, h: el.clientHeight }));
    ro.observe(el);
    setSize({ w: el.clientWidth, h: el.clientHeight });
    return () => ro.disconnect();
  }, []);

  const panels = useMemo(() => (size.w && size.h ? panelsFor(def.view, size.w, size.h) : []), [def.view, size]);

  // Draw the lot (once per chapter and size).
  useEffect(() => {
    const c = canvas.current;
    if (!c || !size.w) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    c.width = Math.round(size.w * dpr);
    c.height = Math.round(size.h * dpr);
    const g = c.getContext('2d');
    if (!g) return;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, size.w, size.h);
    for (const p of panels) {
      g.setTransform(dpr, 0, 0, dpr, 0, 0);
      g.fillStyle = '#0e1628';
      g.fillRect(p.screen.x, p.screen.y, p.screen.w, p.screen.h);
      // Draw at device pixels: scale the panel's transform by the pixel ratio.
      const scaled = { x: p.screen.x * dpr, y: p.screen.y * dpr, w: p.screen.w * dpr, h: p.screen.h * dpr };
      g.setTransform(1, 0, 0, 1, 0, 0);
      drawLotMap(g, lot, p.view, scaled, p.turn, p.deck, { pad: 8 * dpr, lot: def.view !== 'garage' });
      g.setTransform(dpr, 0, 0, dpr, 0, 0);
      if (p.label) {
        g.fillStyle = hex(LEVEL_COLOR[p.deck]);
        g.font = 'bold 15px Bungee, "Arial Narrow", Arial, sans-serif';
        g.textAlign = 'left';
        g.fillText(p.label, p.screen.x + 8, p.screen.y + 20);
        g.strokeStyle = hex(LEVEL_COLOR[p.deck]) + '88';
        g.lineWidth = 1.5;
        g.strokeRect(p.screen.x + 0.75, p.screen.y + 0.75, p.screen.w - 1.5, p.screen.h - 1.5);
      }
    }
  }, [lot, panels, size, def.view]);

  // Pins in screen space, nudged apart where two would overlap.
  const pins = useMemo(() => {
    const out = nodes.map((l) => {
      const s = pinSpot(lot, l);
      const panel = panels.find((p) => p.deck === s.deck) ?? panels[0];
      const at = panel ? mapProjection(panel.view, panel.screen, panel.turn).at(s.x, s.z) : { x: 0, y: 0 };
      return { l, x: at.x, y: at.y, ax: at.x, ay: at.y, deck: s.deck };
    });
    // A pin with its stars is about 40 x 52 px: keep them that far apart (taller than wide).
    const R = 50;
    for (let it = 0; it < 60; it++) {
      for (let i = 0; i < out.length; i++)
        for (let j = i + 1; j < out.length; j++) {
          const dx = out[j].x - out[i].x;
          const dy = (out[j].y - out[i].y) * 0.75;
          const d = Math.hypot(dx, dy) || 0.01;
          if (d < R) {
            const push = (R - d) / 2;
            out[i].x -= (dx / d) * push;
            out[i].y -= (dy / d) * push;
            out[j].x += (dx / d) * push;
            out[j].y += (dy / d) * push;
          }
        }
    }
    for (const p of out) {
      p.x = Math.max(18, Math.min(size.w - 18, p.x));
      p.y = Math.max(18, Math.min(size.h - 30, p.y));
    }
    return out;
  }, [nodes, lot, panels, size]);

  const go = useCallback(
    (l: LevelDef) => {
      if (!levelOpen(progress, l)) return;
      onSound?.('pick');
      onPlay(l.id);
    },
    [onPlay, onSound, progress],
  );

  const pickChapter = useCallback(
    (n: number) => {
      const c = Math.max(1, Math.min(CHAPTERS.length, n));
      if (c === chapter) return;
      onSound?.('move');
      setChapter(c);
      const inIt = CAMPAIGN.filter((l) => l.chapter === c);
      setSel((inIt.find((l) => l.id === cont.id) ?? inIt.find((l) => levelOpen(progress, l) && !(progress.levels[l.id]?.stars)) ?? inIt[0]).id);
    },
    [chapter, cont.id, onSound, progress],
  );

  // Keyboard: arrows between pins, Enter to play, Q/E or Page Up/Down between chapters, Esc back.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const i = levels.findIndex((l) => l.id === sel);
      if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
        e.preventDefault();
        if (i < levels.length - 1) (setSel(levels[i + 1].id), onSound?.('move'));
        else pickChapter(chapter + 1);
      } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
        e.preventDefault();
        if (i > 0) (setSel(levels[i - 1].id), onSound?.('move'));
        else if (chapter > 1) pickChapter(chapter - 1);
      } else if (e.key === 'Enter' || e.key === ' ') {
        if ((e.target as HTMLElement)?.tagName === 'BUTTON' && (e.target as HTMLElement).dataset.pin === undefined) return;
        e.preventDefault();
        go(selected);
      } else if (e.code === 'KeyE' || e.key === 'PageDown' || e.key === ']') pickChapter(chapter + 1);
      else if (e.code === 'KeyQ' || e.key === 'PageUp' || e.key === '[') pickChapter(chapter - 1);
      else if (e.key === 'Escape' || e.key === 'Backspace') {
        e.preventDefault();
        onSound?.('back');
        onBack();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [chapter, go, levels, onBack, onSound, pickChapter, sel, selected]);

  // The route: pin to pin in play order (on the car park's decks, only between pins on the same deck).
  const route = pins.filter((p) => p.l.type !== 'race');
  const legs = route.slice(1).map((p, i) => ({ a: route[i], b: p, done: !!progress.levels[p.l.id] })).filter((s) => def.view !== 'garage' || s.a.deck === s.b.deck);
  const rec = progress.levels[selected.id];
  const selOpen = levelOpen(progress, selected);

  const hover = useHoverSound(() => onSound?.('move'), 'button');

  return (
    <div className="bg-ink-deep absolute inset-0 z-40 flex flex-col select-none" role="dialog" aria-label="Level map" data-keys-capture onPointerOver={hover} style={{ animation: 'zoomIn 0.35s cubic-bezier(0.2,0.8,0.2,1) both' }}>
      {/* Top: back, chapter tabs, the star total. */}
      <header className="flex items-center gap-2 px-3 pt-2 pb-1.5 sm:gap-3 sm:px-5 sm:pt-3" style={{ paddingTop: 'max(8px, env(safe-area-inset-top))', paddingLeft: 'max(12px, env(safe-area-inset-left))', paddingRight: 'max(12px, env(safe-area-inset-right))' }}>
        <button type="button" onClick={() => (onSound?.('back'), onBack())} className="panel-cut bg-cream/10 font-display text-cream hover:bg-cream/20 flex min-h-10 items-center px-3 text-sm sm:text-base" aria-label="Back to the menu">
          ← <span className="ml-1 hidden sm:inline">Menu</span>
        </button>
        <nav className="flex min-w-0 flex-1 gap-1 overflow-x-auto" role="tablist" aria-label="Chapters">
          {CHAPTERS.map((c) => {
            const open = chapterOpen(progress, c.n);
            const on = c.n === chapter;
            return (
              <button
                key={c.n}
                type="button"
                role="tab"
                aria-selected={on}
                onClick={() => pickChapter(c.n)}
                className={`panel-cut flex min-h-10 shrink-0 items-center gap-1.5 px-2.5 text-left transition sm:px-3 ${on ? 'bg-gold text-ink-deep' : open ? 'bg-cream/10 text-cream hover:bg-cream/20' : 'bg-cream/5 text-cream/40'}`}
                aria-label={`Chapter ${c.n}, ${c.name}${open ? `, ${starsIn(progress, c.n)} stars` : `, locked: ${c.gate} stars to open`}`}
              >
                <span className="font-display text-base leading-none sm:text-lg">{c.n}</span>
                <span className="hidden text-xs leading-tight font-bold lg:inline">{c.name}</span>
                {open ? (
                  <span className={`text-[11px] font-bold tabular-nums ${on ? 'text-ink-deep/70' : 'text-gold'}`}>{starsIn(progress, c.n)}★</span>
                ) : (
                  <span className="text-[11px] font-bold">🔒{c.gate}★</span>
                )}
              </button>
            );
          })}
        </nav>
        <div className="panel-cut bg-ink flex min-h-10 items-center gap-1 px-2.5" aria-label={`${total} of ${CAMPAIGN.length * 3} stars`}>
          <StarIcon on className="h-5 w-5" />
          <span className="font-display text-gold text-base tabular-nums sm:text-lg">{total}</span>
          <span className="text-lilac text-xs">/{CAMPAIGN.length * 3}</span>
        </div>
      </header>

      <div className="flex min-h-0 flex-1 flex-col gap-2 px-3 pb-3 sm:px-5 landscape:flex-row portrait:sm:flex-row" style={{ paddingBottom: 'max(10px, env(safe-area-inset-bottom))', paddingLeft: 'max(12px, env(safe-area-inset-left))', paddingRight: 'max(12px, env(safe-area-inset-right))' }}>
        {/* The map, with the pins and the route over it. */}
        <div ref={box} className="relative min-h-0 flex-1 overflow-hidden rounded-sm">
          <canvas ref={canvas} className="absolute inset-0 h-full w-full" aria-hidden="true" />
          <svg className="pointer-events-none absolute inset-0 h-full w-full" aria-hidden="true">
            {legs.map(({ a, b, done }) => (
              <line
                key={a.l.id}
                x1={a.x}
                y1={a.y}
                x2={b.x}
                y2={b.y}
                stroke={done ? '#ffd23f' : 'rgba(230,235,245,0.55)'}
                strokeWidth={done ? 3 : 2.5}
                strokeDasharray="7 5"
                strokeLinecap="round"
                style={done ? undefined : { animation: 'dashCrawl 1.2s linear infinite' }}
              />
            ))}
            {pins.map((p) => (Math.hypot(p.x - p.ax, p.y - p.ay) > 4 ? <line key={p.l.id} x1={p.x} y1={p.y} x2={p.ax} y2={p.ay} stroke="rgba(255,255,255,0.5)" strokeWidth="1" /> : null))}
            {pins.map((p) => (
              <circle key={`d${p.l.id}`} cx={p.ax} cy={p.ay} r="2.5" fill="#fff" opacity="0.8" />
            ))}
          </svg>
          {pins.map((p) => {
            const open = levelOpen(progress, p.l);
            const stars = progress.levels[p.l.id]?.stars ?? 0;
            const isSel = p.l.id === sel;
            const isNext = p.l.id === cont.id && open;
            return (
              <button
                key={p.l.id}
                type="button"
                data-pin
                onClick={() => {
                  if (isSel && open) go(p.l);
                  else (setSel(p.l.id), onSound?.('move'));
                }}
                className="absolute flex -translate-x-1/2 -translate-y-1/2 flex-col items-center outline-none"
                style={{ left: p.x, top: p.y }}
                aria-label={`${p.l.type === 'race' ? 'Race' : 'Level'} ${p.l.n}, ${p.l.name}${open ? `, ${stars} of 3 stars` : ', locked'}`}
                aria-pressed={isSel}
              >
                <span
                  className={`font-display flex h-8 w-8 items-center justify-center rounded-full border-2 text-sm leading-none shadow-lg transition sm:h-9 sm:w-9 sm:text-base ${
                    !open ? 'border-cream/30 bg-ink text-cream/40' : stars ? 'border-ink-deep bg-gold text-ink-deep' : 'border-gold bg-ink-deep text-gold'
                  } ${isSel ? 'ring-cream scale-110 ring-2 ring-offset-2 ring-offset-transparent' : ''} ${p.l.type === 'race' && open ? 'rounded-md' : ''}`}
                  style={isNext ? { animation: 'pinPulse 1.6s ease-out infinite' } : undefined}
                >
                  {open ? (p.l.type === 'race' ? `R${p.l.n}` : p.l.n) : '🔒'}
                </span>
                <span className="bg-ink-deep/85 mt-0.5 rounded-sm px-0.5">
                  <Stars n={stars} size="h-2.5 w-2.5 sm:h-3 sm:w-3" label={false} />
                </span>
              </button>
            );
          })}
          {!chOpen && (
            <div className="bg-ink-deep/70 absolute inset-0 flex flex-col items-center justify-center gap-2 text-center backdrop-grayscale">
              <div className="font-display text-cream text-2xl sm:text-3xl">🔒 {def.name}</div>
              <div className="text-cream/85 text-sm sm:text-base">
                Collect {def.gate} stars to open this chapter. You have {total}.
              </div>
              <div className="text-lilac max-w-xs text-xs">Replay levels for the stars you missed: under par, and a clean, straight park.</div>
            </div>
          )}
        </div>

        {/* The selected level's card. */}
        <aside className="panel-cut bg-ink flex shrink-0 flex-col gap-2 p-3 sm:p-4 landscape:w-64 portrait:sm:w-72 lg:w-80" aria-live="polite">
          <div className="text-lilac text-xs font-semibold">
            Chapter {chapter} · {def.name}
          </div>
          <div className="flex items-baseline gap-2">
            <span className="font-display text-gold text-3xl leading-none">{selected.type === 'race' ? `R${selected.n}` : selected.n}</span>
            <span className="font-display text-cream text-xl leading-tight">{selected.name}</span>
          </div>
          <p className="text-cream/85 text-sm leading-snug">{selected.teaches}</p>
          <div className="flex items-center gap-3">
            <Stars n={rec?.stars ?? 0} size="h-6 w-6" />
            {rec && <span className="text-lilac text-xs tabular-nums">Best {rec.best.toFixed(1)} s · par {selected.par} s</span>}
            {!rec && <span className="text-lilac text-xs">Par {selected.par} s{selected.type === 'race' ? ' · race' : ''}</span>}
          </div>
          {/* Every level of the chapter, as a list (tall screens with room for it). */}
          <ol className="mt-1 hidden min-h-0 flex-1 flex-col gap-0.5 overflow-y-auto [@media(min-height:560px)]:landscape:flex portrait:sm:flex" aria-label={`Levels of chapter ${chapter}`}>
            {levels.map((l) => {
              const open = levelOpen(progress, l);
              const st = progress.levels[l.id]?.stars ?? 0;
              return (
                <li key={l.id}>
                  <button
                    type="button"
                    tabIndex={-1}
                    onClick={() => (setSel(l.id), onSound?.('move'))}
                    onDoubleClick={() => go(l)}
                    className={`flex w-full items-center gap-2 px-2 py-1 text-left text-sm transition ${l.id === sel ? 'bg-gold/15 text-cream' : open ? 'text-cream/80 hover:bg-cream/5' : 'text-cream/35'}`}
                  >
                    <span className="font-display w-6 text-right">{l.n}</span>
                    <span className="min-w-0 flex-1 truncate">{l.name}</span>
                    {open ? <Stars n={st} size="h-3 w-3" label={false} /> : <span className="text-xs">🔒</span>}
                  </button>
                </li>
              );
            })}
          </ol>
          <button
            type="button"
            autoFocus
            disabled={!selOpen}
            onClick={() => go(selected)}
            className={`panel-cut font-display mt-auto flex min-h-12 items-center justify-center px-4 text-lg transition active:scale-95 ${selOpen ? 'bg-gold text-ink-deep hover:brightness-110' : 'bg-cream/10 text-cream/40 cursor-not-allowed'}`}
          >
            {selOpen ? (rec ? 'Play again' : 'Play') : chOpen ? 'Finish the level before' : `${def.gate}★ to open`}
          </button>
          <p className="text-lilac hidden text-[11px] sm:block">Arrows choose · Enter plays · Q / E chapter · Esc back</p>
        </aside>
      </div>
    </div>
  );
};
