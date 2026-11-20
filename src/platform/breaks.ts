/**
 * When the game may ask for an ad. Pure: the caller passes the time, so the rules are tested without a browser.
 *
 * Midgame ads (CrazyGames ad requirements, https://docs.crazygames.com/requirements/ads/):
 *  - only between rounds: the game asks only when the player leaves a result card (Retry or Next stage), never during play
 *    and never from a menu button;
 *  - not before the player has had a fair amount of play: at least `firstAfterRounds` finished rounds and `firstAfterPlay`
 *    seconds of driving;
 *  - at most one every `interval` seconds (the SDK's own cooldown is 3 minutes and counts rewarded ads too, so we never ask
 *    for one it would refuse);
 *  - never in the same gap between two rounds as a rewarded hint.
 *
 * The rewarded hint:
 *  - offered only on the result card after a lost round (never during play), at most once every `hintEvery` seconds;
 *  - after `freeHintAfter` losses in a row on the same stage, the hint is free (the "other way to earn it" the rules ask for),
 *    and it is always free where there are no ads at all.
 */
export const BREAK_RULES = {
  firstAfterRounds: 2,
  firstAfterPlay: 120,
  interval: 180,
  hintEvery: 90,
  freeHintAfter: 3,
} as const;

export type HintOffer = 'ad' | 'free' | null;

export class BreakScheduler {
  private play = 0;
  private rounds = 0;
  private lastAd = -Infinity;
  private lastOffer = -Infinity;
  private gapUsed = false;
  private streak = 0;
  private streakStage = 0;

  constructor(private rules: typeof BREAK_RULES = BREAK_RULES) {}

  /** Seconds of real driving (countdown and race, not paused, not on a result card). */
  addPlay(seconds: number) {
    if (seconds > 0 && Number.isFinite(seconds)) this.play += seconds;
  }

  /** A round ended. Opens a new gap between rounds. */
  roundEnded(won: boolean, stage: number) {
    this.rounds++;
    this.gapUsed = false;
    if (won || stage !== this.streakStage) this.streak = 0;
    this.streakStage = stage;
    if (!won) this.streak++;
  }

  /** May a midgame ad play now, as the player leaves the result card? */
  shouldBreak(now: number): boolean {
    const r = this.rules;
    return !this.gapUsed && this.rounds >= r.firstAfterRounds && this.play >= r.firstAfterPlay && now - this.lastAd >= r.interval;
  }

  /** What the result card may offer after this round (ask once per card; `adsAvailable` false means no video ads on this page). */
  hintOffer(now: number, lost: boolean, adsAvailable: boolean): HintOffer {
    if (!lost || this.gapUsed) return null;
    if (this.streak >= this.rules.freeHintAfter || !adsAvailable) return this.streak >= this.rules.freeHintAfter ? 'free' : null;
    if (now - this.lastOffer < this.rules.hintEvery) return null;
    return 'ad';
  }

  /** The card showed an 'ad' offer (whatever the player picks, the next one waits `hintEvery`). */
  offered(now: number) {
    this.lastOffer = now;
  }

  /** An ad played (midgame or rewarded): the cooldown starts again and this gap between rounds has had its ad. */
  adShown(now: number) {
    this.lastAd = now;
    this.gapUsed = true;
  }

  /** The player took a hint (by ad or free): no midgame in this gap, and a free hint resets the losing streak. */
  hintTaken(free: boolean) {
    this.gapUsed = true;
    if (free) this.streak = 0;
  }

  get stats() {
    return { play: this.play, rounds: this.rounds, streak: this.streak };
  }
}
