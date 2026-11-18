/**
 * The free-spaces board. It says "FREE SPACES: 1" from the start and nothing more; the bay is
 * never pointed at. As the round goes on it gives away a little, to everyone at once (you, the bots,
 * the sign over the gate and the panel on your screen):
 *
 *  - from `HINT.zoneAt` seconds: which part of the site, the open lot or the car park;
 *  - from `HINT.deckAt` seconds, when the bay is in the car park: two decks, flickering one after
 *    the other, and one of them is the right one (the other is a decoy chosen from the seed);
 *  - when a parked car pulls out: the count goes up to 2 (the radio says where).
 *
 * Pure: a function of the state, so a host and a guest show the same board.
 */
import { LEVELS, levelName } from './levels';

import type { Lot } from './lot';
import type { GameState } from './types';

export const HINT = { zoneAt: 12, deckAt: 32, flicker: 0.9 } as const;

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
}

export const hintOf = (state: GameState, lot: Lot): Hint => {
  const bay = lot.bays[state.target];
  const free = state.extra >= 0 ? 2 : 1;
  const stage = state.clock >= HINT.deckAt && bay.garage ? 2 : state.clock >= HINT.zoneAt ? 1 : 0;
  if (stage === 0) return { free, stage, zone: null, decks: [], showing: null };
  if (stage === 1 || !bay.garage) return { free, stage: stage === 2 ? 2 : 1, zone: bay.garage ? 'garage' : 'lot', decks: [], showing: null };
  const others = LEVELS.filter((l) => l !== bay.lvl);
  const decoy = others[(state.seed * 7 + 3) % others.length];
  // The two decks take turns; which comes first also depends on the seed, so the first one flashed is no clue.
  const decks = (state.seed & 1 ? [decoy, bay.lvl] : [bay.lvl, decoy]).slice();
  const showing = decks[Math.floor(state.clock / HINT.flicker) % 2];
  return { free, stage: 2, zone: 'garage', decks: [...decks].sort((a, b) => a - b), showing };
};

/** The two lines of text for the board (and the HUD panel). */
export const hintLines = (h: Hint): [string, string] => [
  `FREE SPACES: ${h.free}`,
  h.stage === 0 ? '' : h.showing !== null ? levelName(h.showing) : h.zone === 'garage' ? 'IN THE GARAGE' : 'IN THE OPEN LOT',
];
