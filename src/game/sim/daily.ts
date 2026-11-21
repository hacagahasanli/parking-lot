/**
 * The Daily Lot: one round a day, the same for everyone. The UTC date (`yyyymmdd`) seeds the lot, the free bay and the rivals, so
 * two players on the same day get the same round; it is the Endless generator at stage 1 or 2 (alternating by day) with two rivals
 * at race pace 0.6. Retries are unlimited and the best result of the day is kept. A streak counts the calendar days with at least
 * one park. The save sits next to the campaign's, through the platform's storage.
 */
import { setDaily, starsFor } from './campaign';

import type { LevelDef, RunResult } from './campaign';
import type { KeyValue } from '~/platform/types';

export const DAILY_ID = 'daily';
export const DAILY_KEY = 'parking-lot.daily';

const pad = (n: number) => String(n).padStart(2, '0');

/** The UTC date as `yyyymmdd`. */
export const dayKey = (d: Date = new Date()): string => `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}`;

const dateOf = (key: string) => Date.UTC(Number(key.slice(0, 4)), Number(key.slice(4, 6)) - 1, Number(key.slice(6, 8)));

/** Whole days since 1 January 1970 (UTC). */
export const dayNumber = (key: string): number => Math.floor(dateOf(key) / 86_400_000);

/** The day before `key`. */
export const prevKey = (key: string): string => dayKey(new Date(dateOf(key) - 86_400_000));

/** The round's seed: the date as a number. The same date always gives the same lot, bay and rivals. */
export const daySeed = (key: string): number => Number(key);

/** Stage 1 (the open lot) on even days, stage 2 (the car park opens) on odd days. */
export const dayStage = (key: string): number => 1 + (dayNumber(key) % 2);

/** The day's round as a race level: two rivals at pace 0.6, the bay picked from the seed, no leaver. */
export const dailyLevel = (key: string): LevelDef => {
  const stage = dayStage(key);
  return {
    id: DAILY_ID,
    n: 0,
    chapter: 1,
    name: 'Daily lot',
    teaches: "Today's one free space.",
    type: 'race',
    stage,
    spawn: 'gate',
    target: [],
    facing: 'any',
    leaver: false,
    bots: { n: 2, pace: { cruise: 0.6, launch: 6 } },
    par: stage === 1 ? 40 : 55,
    limit: 90,
  };
};

/** Make `key`'s round the one `levelById('daily')` finds (the game and the cards read the level through it). */
export const activateDaily = (key: string): LevelDef => {
  const l = dailyLevel(key);
  setDaily(l);
  return l;
};

export interface DailyBest {
  stars: number;
  /** Best finishing time (s). */
  time: number;
}

export interface DailySave {
  /** The best park of one day. */
  today: ({ key: string } & DailyBest) | null;
  /** The days in a row with a park, ending on `last`. */
  streak: { n: number; last: string } | null;
}

export const emptyDaily = (): DailySave => ({ today: null, streak: null });

export const loadDaily = (store: KeyValue): DailySave => {
  try {
    const raw = store.getItem(DAILY_KEY);
    if (!raw) return emptyDaily();
    const d = JSON.parse(raw) as { today?: Partial<DailySave['today'] & object> | null; streak?: { n?: unknown; last?: unknown } | null };
    const t = d.today;
    const today = t && typeof t.key === 'string' && /^\d{8}$/.test(t.key) && typeof t.stars === 'number' && typeof t.time === 'number' ? { key: t.key, stars: Math.max(0, Math.min(3, Math.round(t.stars))), time: t.time } : null;
    const s = d.streak;
    const streak = s && typeof s.last === 'string' && /^\d{8}$/.test(s.last) && typeof s.n === 'number' && s.n >= 1 ? { n: Math.floor(s.n), last: s.last } : null;
    return { today, streak };
  } catch {
    return emptyDaily();
  }
};

export const saveDaily = (store: KeyValue, d: DailySave) => {
  try {
    store.setItem(DAILY_KEY, JSON.stringify(d));
  } catch {
    /* storage full or blocked: this visit only */
  }
};

/** The streak as it stands on `key`: alive when the last park was today or yesterday, else 0. */
export const streakOn = (d: DailySave, key: string): number => (d.streak && (d.streak.last === key || d.streak.last === prevKey(key)) ? d.streak.n : 0);

/** The best result of `key`'s round so far, or null. */
export const bestOn = (d: DailySave, key: string): DailyBest | null => (d.today && d.today.key === key ? { stars: d.today.stars, time: d.today.time } : null);

/**
 * Records a run on day `key`. Only a park counts: it keeps the better of the day's results (more stars, then the faster time) and
 * moves the streak on (a second park the same day changes nothing; after a missed day it starts again at 1).
 */
export const recordDaily = (d: DailySave, key: string, run: RunResult): DailySave => {
  if (!run.finished) return d;
  const stars = starsFor(dailyLevel(key), run);
  const old = bestOn(d, key);
  const better = !old || stars > old.stars || (stars === old.stars && run.time < old.time);
  const today = better ? { key, stars, time: run.time } : d.today;
  const alive = streakOn(d, key);
  const streak = d.streak && d.streak.last === key ? d.streak : { n: alive + 1, last: key };
  return { today, streak };
};

/** Milliseconds until the next UTC midnight, when a new lot opens. */
export const msToNextLot = (now: Date = new Date()): number => Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1) - now.getTime();

/** "A new lot opens in 14 h 20 m" (under an hour: minutes only). */
export const nextLotLine = (ms: number): string => {
  const mins = Math.max(0, Math.ceil(ms / 60_000));
  const h = Math.floor(mins / 60);
  return `A new lot opens in ${h > 0 ? `${h} h ` : ''}${mins % 60} m`;
};
