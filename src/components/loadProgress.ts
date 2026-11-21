/**
 * The loading bar's one number. The bar's width, the percentage beside it and the little car's place on the lot are all drawn
 * from `fraction(p)` (the number is its whole percent), so they can never disagree.
 *
 * Truthful by construction:
 * - `reach` records a real checkpoint (the page has run, the engine has arrived, the lot is built). The shown value eases up
 *   towards the furthest checkpoint reached; between checkpoints it may creep, but only a part of the way to the next one, so it
 *   never claims work that has not happened.
 * - It never goes backwards: a late or repeated checkpoint below the current value changes nothing.
 * - It never reads 100 while still working: until `finish` it is capped at 99. After `finish` it runs up to 100 quickly, and
 *   `complete` says when it is there (then the screen may fade).
 */

export interface LoadProgress {
  /** The value on screen, 0..1. */
  shown: number;
  /** The furthest real checkpoint reached, 0..1. */
  reached: number;
  /** The next checkpoint after it (the creep stops short of it), 0..1. */
  next: number;
  /** The game is ready (the first frame is drawn). */
  done: boolean;
}

/** Until ready the number stops here. */
export const CAP = 0.99;
/** How far towards the next checkpoint the creep may go (a share of the gap). */
export const CREEP_SHARE = 0.5;

export const createProgress = (): LoadProgress => ({ shown: 0, reached: 0, next: 0, done: false });

/** A real checkpoint was reached: `at` (0..1), and where the next one stands (for the creep; default: `at`, no creep). */
export const reach = (p: LoadProgress, at: number, next = at): LoadProgress => {
  if (p.done || at <= p.reached) return p;
  const reached = Math.min(at, CAP);
  return { ...p, reached, next: Math.min(Math.max(next, reached), CAP) };
};

/** The game is ready: the bar may now run to 100. */
export const finish = (p: LoadProgress): LoadProgress => (p.done ? p : { ...p, done: true, reached: 1, next: 1 });

/**
 * Advance the shown value by `dt` seconds: it eases towards the checkpoint (quickly, so a real step shows at once), then creeps
 * slowly towards the next one, never past `CREEP_SHARE` of the gap. Never backwards, capped at 99 % until `finish`.
 */
export const tick = (p: LoadProgress, dt: number): LoadProgress => {
  const ease = 1 - Math.exp(-dt * (p.done ? 14 : 7));
  const ceiling = p.done ? 1 : Math.min(CAP, p.reached + (p.next - p.reached) * CREEP_SHARE);
  let shown = p.shown;
  if (shown < p.reached) shown += (p.reached - shown) * ease + dt * 0.02;
  // Past the checkpoint: a slow creep (an asymptote, so it slows as it nears its ceiling).
  if (shown >= p.reached && shown < ceiling) shown += (ceiling - shown) * (1 - Math.exp(-dt * 0.35));
  // Finishing: snap the last sliver so it lands on 100.
  if (p.done && 1 - shown < 0.004) shown = 1;
  shown = Math.min(Math.max(shown, p.shown), p.done ? 1 : Math.max(ceiling, p.reached));
  return shown === p.shown ? p : { ...p, shown };
};

/** The one value everything is drawn from, 0..1: the bar's width and the car's place use it as is, the number is its whole percent. */
export const fraction = (p: LoadProgress) => (p.done && p.shown >= 1 ? 1 : Math.min(CAP, p.shown));

/** The whole percentage to show: 0..99 while working, 100 only when ready. */
export const percent = (p: LoadProgress) => Math.floor(fraction(p) * 100 + 1e-9);

/** The bar has reached 100 after `finish`: the loading screen can go. */
export const complete = (p: LoadProgress) => percent(p) === 100;
