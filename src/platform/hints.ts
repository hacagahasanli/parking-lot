/**
 * When the result card may offer the rewarded hint. Pure: the caller passes the time, so the rules are tested without a
 * browser. There are no midgame ads any more (an ad after every few rounds broke the tempo); the only other ad is the
 * banner under the main menu (MenuBanner).
 *
 * The rewarded hint (the player chooses it; CrazyGames ad requirements, https://docs.crazygames.com/requirements/ads/):
 *  - offered only on the result card after a lost round (never during play), at most once every `hintEvery` seconds;
 *  - after `freeHintAfter` losses in a row on the same stage, the hint is free (the "other way to earn it" the rules ask for),
 *    and it is always free where there are no ads at all.
 */
export interface HintRules {
  hintEvery: number;
  freeHintAfter: number;
}

export const HINT_RULES: HintRules = {
  hintEvery: 90,
  freeHintAfter: 3,
};

export type HintOffer = 'ad' | 'free' | null;

export class HintScheduler {
  private lastOffer = -Infinity;
  private taken = false;
  private streak = 0;
  private streakStage = 0;

  constructor(private rules: HintRules = HINT_RULES) {}

  /** A round ended: a new result card, which may offer a hint again. */
  roundEnded(won: boolean, stage: number) {
    this.taken = false;
    if (won || stage !== this.streakStage) this.streak = 0;
    this.streakStage = stage;
    if (!won) this.streak++;
  }

  /** What the result card may offer after this round (ask once per card; `adsAvailable` false means no video ads on this page). */
  hintOffer(now: number, lost: boolean, adsAvailable: boolean): HintOffer {
    if (!lost || this.taken) return null;
    if (this.streak >= this.rules.freeHintAfter || !adsAvailable) return this.streak >= this.rules.freeHintAfter ? 'free' : null;
    if (now - this.lastOffer < this.rules.hintEvery) return null;
    return 'ad';
  }

  /** The card showed an 'ad' offer (whatever the player picks, the next one waits `hintEvery`). */
  offered(now: number) {
    this.lastOffer = now;
  }

  /** The player took a hint (by ad or free): a free hint resets the losing streak. */
  hintTaken(free: boolean) {
    this.taken = true;
    if (free) this.streak = 0;
  }

  get stats() {
    return { streak: this.streak };
  }
}
