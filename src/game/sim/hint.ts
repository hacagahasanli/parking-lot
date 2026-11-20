/**
 * The free-spaces board. It says "FREE SPACES: 1" from the start and nothing more; the bay is
 * never pointed at. As the round goes on it gives away a little, to everyone at once (you, the bots,
 * the sign over the gate and the panel on your screen):
 *
 *  - from `HINT.zoneAt` seconds: which part of the site, the open lot or the car park (from the start in stages 2 to 5, where the
 *    intro card has already said the free bay is in the car park);
 *  - from `HINT.deckAt` seconds, when the bay is in the car park and more than one deck is open: two decks, flickering one after
 *    the other, and one of them is the right one (the other is a decoy chosen from the seed);
 *  - when a parked car pulls out: the count goes up to 2 (the radio says where).
 *
 * Pure: a function of the state, so a host and a guest show the same board.
 */
import { LEVELS, levelName } from './levels';

import type { Lot } from './lot';
import type { GameState } from './types';

export const HINT = { zoneAt: 12, deckAt: 32, flicker: 0.9 } as const;

/**
 * When the board gives things away, by stage. Early stages are quicker, so a new player gets a nudge within seconds:
 *  - stage 1 (the open lot, bay near the entry): from `sideAt` the board says which side of the entry road to look;
 *  - stages 3 to 5: the two decks from `deckAt` (26 s instead of 32);
 *  - stage 6 (everything open): the zone at 8 s and the decks at 24 s.
 * No stage (the home page's whole site) keeps `HINT`.
 */
export interface HintTimes {
  zoneAt: number;
  deckAt: number;
  /** Stage 1 only: when the board names the side (Infinity: never). */
  sideAt: number;
}

export const hintTimes = (stage: number | undefined): HintTimes => {
  if (stage === 1) return { zoneAt: HINT.zoneAt, deckAt: HINT.deckAt, sideAt: 2 };
  if (stage !== undefined && stage >= 2 && stage <= 5) return { zoneAt: HINT.zoneAt, deckAt: 26, sideAt: Infinity };
  if (stage === 6) return { zoneAt: 8, deckAt: 24, sideAt: Infinity };
  return { zoneAt: HINT.zoneAt, deckAt: HINT.deckAt, sideAt: Infinity };
};

/** Which side of the entry road a bay is on, seen from the cars at the barrier (they face +z, so +x is on their left). */
export const sideOf = (x: number, entryX: number): Side => (Math.abs(x - entryX) < 3 ? 'ahead' : x > entryX ? 'left' : 'right');

export type Side = 'left' | 'right' | 'ahead';

export type Zone = 'lot' | 'garage';

export interface Hint {
  /** How many bays are free right now. */
  free: number;
  /** 0 nothing, 1 the zone, 2 the zone and two decks. */
  stage: 0 | 1 | 2;
  /** The zone once it is given away. */
  zone: Zone | null;
  /** The two decks the board flickers between (the right one and a decoy), once given away. */
  decks: number[];
  /** The deck the board is showing at this moment (one of `decks`). */
  showing: number | null;
  /** Stage 1: the side of the entry road the bay is on, once given away (null before, and in every other stage). */
  side: Side | null;
}

export const hintOf = (state: GameState, lot: Lot): Hint => {
  const bay = lot.bays[state.target];
  const free = state.extra >= 0 ? 2 : 1;
  // In stages 2 to 5 the free bay is known to be in the car park from the start; the open decks are the ones that can flicker.
  const told = lot.stage !== undefined && lot.stage >= 2 && lot.stage <= 5;
  const open = lot.open?.levels ?? LEVELS;
  const others = LEVELS.filter((l) => l !== bay.lvl && open.includes(l));
  const at = hintTimes(lot.stage);
  const side = state.clock >= at.sideAt && !bay.garage ? sideOf(bay.x, lot.graph.nodes[lot.entryNode].x) : null;
  const stage = state.clock >= at.deckAt && bay.garage && others.length ? 2 : told || state.clock >= at.zoneAt ? 1 : 0;
  if (stage === 0) return { free, stage, zone: null, decks: [], showing: null, side };
  if (stage === 1 || !bay.garage) return { free, stage: stage === 2 ? 2 : 1, zone: bay.garage ? 'garage' : 'lot', decks: [], showing: null, side };
  const decoy = others[(state.seed * 7 + 3) % others.length];
  // The two decks take turns; which comes first also depends on the seed, so the first one flashed is no clue.
  const decks = (state.seed & 1 ? [decoy, bay.lvl] : [bay.lvl, decoy]).slice();
  const showing = decks[Math.floor(state.clock / HINT.flicker) % 2];
  return { free, stage: 2, zone: 'garage', decks: [...decks].sort((a, b) => a - b), showing, side: null };
};

const SIDE_LINE: Record<Side, string> = { left: 'LOOK LEFT', right: 'LOOK RIGHT', ahead: 'STRAIGHT AHEAD' };

/** The two lines of text for the board (and the HUD panel). */
export const hintLines = (h: Hint): [string, string] => [
  `FREE SPACES: ${h.free}`,
  h.side !== null ? SIDE_LINE[h.side] : h.stage === 0 ? '' : h.showing !== null ? levelName(h.showing) : h.zone === 'garage' ? 'IN THE GARAGE' : 'IN THE OPEN LOT',
];

/** Radius (m) of the circle the rewarded hint draws on the minimap. */
export const HINT_AREA_R = 18;

/**
 * The bonus hint (the player chose it between rounds): a circle on the minimap that holds the free bay, centred a seeded
 * distance away from it so it narrows the search without pointing at the bay. Only the player sees it; the bots never read it.
 */
export const hintArea = (state: GameState, lot: Lot): { x: number; z: number; r: number; lvl: number } => {
  const bay = lot.bays[state.target];
  const a = ((state.seed * 2654435761) % 6283) / 1000;
  const d = HINT_AREA_R * (0.25 + (((state.seed * 40503) % 1000) / 1000) * 0.35);
  return { x: bay.x + Math.cos(a) * d, z: bay.z + Math.sin(a) * d, r: HINT_AREA_R, lvl: bay.garage ? bay.lvl : 0 };
};
