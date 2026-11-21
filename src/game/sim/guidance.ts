/**
 * Calm guidance to the bay. Nothing points at it from afar: no light column, no edge arrow, no ring on the minimap. The bay to
 * park in is a quiet marking on the ground that reads only from close by (`markOpacity`). If you have not found it after a
 * while (`hintDelay`: longer in later levels), a short pulse shows the way (an arrow for `GUIDE.pulse` seconds), and again every
 * `GUIDE.repeat` seconds until you find it. The hint key (H, or the touch button) fires a pulse at once; in a level it costs one
 * star (`starsFor` in campaign.ts), the first time only. Pure, so it can be tested.
 */
import type { LevelDef } from './campaign';

export const GUIDE = {
  /** The ground marking is full within this flat distance (m) on the same deck... */
  near: 10,
  /** ...and gone from this distance on. */
  fadeTo: 16,
  /** Same deck: the height difference (m) under which the bay is on your level. */
  sameDeck: 1.6,
  /** How long (s) a pulse shows the direction. */
  pulse: 3,
  /** After the first automatic pulse, another every this many seconds until the bay is found. */
  repeat: 10,
  /** The endless race's first automatic pulse (s after GO). */
  endless: 12,
} as const;

/** The first automatic pulse (s after GO) in each campaign chapter: the later the chapter, the longer you search alone. */
const CHAPTER_DELAY = [12, 15, 19, 24];

/** When (s after GO) the first automatic pulse comes, if the bay has not been found by then. */
export const hintDelay = (l: LevelDef | null): number => {
  if (!l) return GUIDE.endless;
  if (l.hintAfter !== undefined) return l.hintAfter;
  if (l.type === 'race') return 12 + (l.n - 1) * 2;
  return CHAPTER_DELAY[l.chapter - 1] ?? 12;
};

/** How strongly the bay's ground marking shows (0..1) for a car at a flat distance `d` and height difference `dy`. */
export const markOpacity = (d: number, dy: number): number => {
  if (Math.abs(dy) > GUIDE.sameDeck) return 0;
  return Math.min(1, Math.max(0, (GUIDE.fadeTo - d) / (GUIDE.fadeTo - GUIDE.near)));
};

/** An automatic pulse is due: not found yet, and the clock has reached the delay plus one repeat per pulse already fired. */
export const autoPulseDue = (clock: number, delay: number, fired: number, found: boolean): boolean => !found && clock >= delay + fired * GUIDE.repeat;

/** A pulse started at `at` (race clock, s) is still showing at `clock`. */
export const pulseOn = (clock: number, at: number | null): boolean => at !== null && clock >= at && clock - at < GUIDE.pulse;
