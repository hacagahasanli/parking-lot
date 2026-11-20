/**
 * The words the game says, in two flavours:
 *  - 'studio': our own site, with the studio's office humour (drivers called Staging and Hotfix, radio lines about pull requests);
 *  - 'neutral': portal builds, for players who are not developers. Plain parking-lot humour, no code, git or office jokes.
 *
 * Pure data (no DOM): the sim picks radio lines and driver names from here, the renderer picks plates and shop signs.
 * The portal build replaces `copy/studio.ts` with `copy/neutral.ts` (see vite.portal.config.ts), so both flavours read neutral there.
 */
import { NEUTRAL } from './copy/neutral';
import { STUDIO } from './copy/studio';

import type { ChatLine } from './types';

export type Flavour = 'studio' | 'neutral';

type Kind = ChatLine['kind'];

export interface FlavourCopy {
  /** Names of the three rival drivers (seats 1 to 3; seat 0 is always "You"). */
  rivals: [string, string, string];
  /** Number plates by seat (the 5th is the car that pulls out). */
  plates: string[];
  /** The two shop signs: the supermarket, then the café. */
  shops: [string, string];
  radio: Record<Kind, string[]>;
}

export const COPY: Record<Flavour, FlavourCopy> = { studio: STUDIO, neutral: NEUTRAL };
