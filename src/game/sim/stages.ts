/**
 * Stages. A round used to be played on the whole site from the first minute. Now a session climbs: stage 1 is the open lot
 * only (the car park's door is shut), and each stage after it opens one more floor of the car park, ground floor first, the
 * roof, then the underground. The free bay is always on the floor that has just opened; the floors opened before stay open
 * (you drive through them, and the board's flicker can use one as a decoy). The last stage opens everything and puts the bay
 * anywhere, which is how rounds used to be.
 *
 * A stage is a *view* of the same lot (`stageLot`): same bays, aisles and ids, with some barriers solid, some aisles closed to
 * every route, and the candidates cut down to the new floor. Nothing about the layout is rebuilt, so the renderer builds the
 * scene once and only shows or hides the barriers.
 *
 * Progress (`Progress`) lives in memory only: a page load starts again at stage 1.
 */
import { spottable } from './visibility';

import type { Closure, Lot, Open } from './lot';

export interface StageDef {
  n: number;
  /** "P0 — Ground floor": the name on the intro card and the result card (the stage number is shown beside it). */
  name: string;
  /** One sentence: what is new this stage. */
  news: string;
  /** The garage level that opens with this stage (null: the open lot, or the whole site). */
  newest: number | null;
  /** Which part of the site is open. */
  open: Open;
}

export const STAGES: StageDef[] = [
  { n: 1, name: 'The open lot', news: 'The car park is shut. The free bay is somewhere out here, in the open.', newest: null, open: { garage: false, levels: [] } },
  { n: 2, name: 'P0 — Ground floor', news: 'The car park is open, ground floor only. The free bay is in there; the ramps stay shut.', newest: 0, open: { garage: true, levels: [0] } },
  { n: 3, name: 'P1 — First floor', news: 'The ramp up is open. The free bay is one floor above the ground.', newest: 1, open: { garage: true, levels: [0, 1] } },
  { n: 4, name: 'P2 — The roof', news: 'The roof deck is open to the sky. The free bay is up there.', newest: 2, open: { garage: true, levels: [0, 1, 2] } },
  { n: 5, name: 'P-1 — Underground', news: 'The ramp down is open. The free bay is below ground, in the dark.', newest: -1, open: { garage: true, levels: [-1, 0, 1, 2] } },
  { n: 6, name: 'The whole site', news: 'Everything is open. The free bay could be anywhere.', newest: null, open: { garage: true, levels: [-1, 0, 1, 2] } },
];

export const STAGE_COUNT = STAGES.length;

/**
 * Stage 1 is the first thing a new player sees, so its free bay is always close to the entry road: at most `STAGE1_NEAR`
 * metres from the junction just past the barrier, which is the first two aisles each side. A player who turns the right way
 * sees it within about ten seconds of GO.
 */
export const STAGE1_NEAR = 36;

/**
 * How brisk the bots are, by stage: in stages 1 and 2 they cruise slower and leave the line later, so a new player can win the
 * first rounds; from stage 3 on they drive as they always did. Shown honestly: the bots are the same drivers, only less hurried.
 * Tuned on headless rounds (four bots, seeds 1-20): the first car parks at a median of about 63 s in stage 1 and 58 s in
 * stage 2 (it was 39 and 40 s with 0.88/1.2 and 0.94/0.5).
 */
export const botPace = (stage: number | undefined): { cruise: number; launch: number } =>
  stage === 1 ? { cruise: 0.45, launch: 14 } : stage === 2 ? { cruise: 0.5, launch: 8 } : { cruise: 1, launch: 0 };
export const stageDef = (n: number): StageDef => STAGES[Math.max(1, Math.min(STAGE_COUNT, n)) - 1];

/** Is a closure shut in this stage? */
export const isShut = (c: Closure, open: Open) => (c.opensWith === 'garage' ? !open.garage : !open.levels.includes(c.opensWith));

const cache = new WeakMap<Lot, Map<number, Lot>>();

/**
 * The lot as the given stage plays it: closed barriers are solid, aisles that lead into a shut part are closed (to every route
 * and every bot search), the candidates are the bays of the new floor (the open lot in stage 1, anywhere open in the last stage),
 * and `eligible` (where the car that pulls out may be parked) is every candidate bay of the open part of the site.
 */
export const stageLot = (lot: Lot, stage: number): Lot => {
  let byStage = cache.get(lot);
  if (!byStage) cache.set(lot, (byStage = new Map()));
  const hit = byStage.get(stage);
  if (hit) return hit;
  const def = stageDef(stage);
  const open = def.open;
  const shut = lot.closures.filter((c) => isShut(c, open));
  const nodeShut = (n: number) => {
    const lvl = lot.graph.nodes[n].lvl;
    return !open.levels.includes(lvl);
  };
  const aisleShut = (a: Lot['aisles'][number]) => (a.name === 'GATE' ? !open.garage : a.garage && a.nodes.some(nodeShut));
  const aisles = lot.aisles.map((a) => (aisleShut(a) ? { ...a, closed: true } : a));
  const edges = lot.graph.edges.map((e) => (aisles[e.aisle].closed ? { ...e, closed: true } : e));
  const inOpen = (id: number) => {
    const b = lot.bays[id];
    return !b.garage || open.levels.includes(b.lvl);
  };
  // A bay the bots could never make out (a van beside it on a one-way aisle) is for people only, so it is not the free bay.
  const eligible = lot.candidates.filter((id) => inOpen(id) && spottable(lot, id));
  const entry = lot.graph.nodes[lot.entryNode];
  const nearEntry = (id: number) => Math.hypot(lot.bays[id].x - entry.x, lot.bays[id].z - entry.z) <= STAGE1_NEAR;
  const candidates = stage === 1 ? eligible.filter((id) => !lot.bays[id].garage && nearEntry(id)) : def.newest === null ? eligible : eligible.filter((id) => lot.bays[id].garage && lot.bays[id].lvl === def.newest);
  const out: Lot = {
    ...lot,
    stage: def.n,
    open,
    aisles,
    graph: { ...lot.graph, edges },
    solids: [...lot.solids, ...shut.map((c) => c.solid)],
    candidates,
    eligible,
  };
  byStage.set(stage, out);
  return out;
};

/** Can the level (or the open lot, level null) be reached in this stage? */
export const isOpenLevel = (open: Open, lvl: number | null) => lvl === null || (open.garage && open.levels.includes(lvl));

// ---------------------------------------------------------------------------
// Progress through the stages (in memory)
// ---------------------------------------------------------------------------

export interface Progress {
  /** The stage being played (or about to be). */
  current: number;
  /** The highest stage you may start: stages up to here are unlocked. */
  unlocked: number;
}

/** A fresh session: stage 1, nothing else unlocked. A page load always makes one of these. */
export const newProgress = (): Progress => ({ current: 1, unlocked: 1 });

/** You parked first in `p.current`: the next stage unlocks (the last stage has no next). */
export const won = (p: Progress): Progress => {
  const unlocked = Math.min(STAGE_COUNT, Math.max(p.unlocked, p.current + 1));
  return { current: p.current, unlocked };
};

/** Move to a stage: only a stage that is unlocked. */
export const pick = (p: Progress, stage: number): Progress => (stage >= 1 && stage <= p.unlocked ? { ...p, current: stage } : p);

/** "Next stage": the stage after the current one, if it is unlocked. */
export const next = (p: Progress): Progress => pick(p, p.current + 1);

/** Is there a stage after the current one that you can go to? */
export const hasNext = (p: Progress) => p.current < p.unlocked && p.current < STAGE_COUNT;
