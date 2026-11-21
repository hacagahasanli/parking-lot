/**
 * The portal adapter: everything the game asks of the page that hosts it (a portal's SDK, or nothing at all on our own site).
 * The game only ever talks to this interface, so a Poki or Yandex adapter is one more file next to `crazygames.ts`.
 *
 * Rules every adapter keeps:
 *  - every call is safe at any time, including before `init` resolves and after an SDK error (they never throw);
 *  - `gameplayStart`/`gameplayStop` are idempotent (the adapter forwards only real changes);
 *  - a rewarded break resolves when the game may go on, whether or not an ad was shown; the game mutes and pauses only in `onStart`.
 */
export type DeviceType = 'desktop' | 'tablet' | 'mobile';

/** How a break ended: 'shown' (an ad played to the end: a rewarded break earns its reward), 'skipped' (no ad on this platform), 'error' (no fill, ad blocker, cooldown, failure). */
export type BreakResult = 'shown' | 'skipped' | 'error';

export interface BreakHooks {
  /** The ad has really started: mute the audio and freeze the game now (not when it is requested). */
  onStart?: () => void;
}

/** A small key-value store with the localStorage API (the portal's cloud save where there is one). */
export interface KeyValue {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export interface Platform {
  readonly id: 'web' | 'crazygames';
  /** Whether video ads can be requested here at all (false: never show a rewarded button that needs one). */
  readonly ads: boolean;
  init(): Promise<void>;
  loadingStart(): void;
  loadingStop(): void;
  gameplayStart(): void;
  gameplayStop(): void;
  /** A rewarded ad the player chose; give the reward only on 'shown'. */
  rewardedBreak(hooks?: BreakHooks): Promise<BreakResult>;
  /**
   * Whether display banners can be requested here (false: never render a banner slot). The game shows one only on the main
   * menu, never during a round, and asks for no midgame video ads at all (they broke the tempo between rounds).
   */
  readonly banners: boolean;
  /**
   * Fills the element with this id (on screen, fully visible, with a size) with a responsive banner that fits it. Resolves
   * true when one is shown, false when none can be (no fill, cooldown, banners disabled, no size fits, no SDK).
   */
  requestBanner(id: string): Promise<boolean>;
  /** Removes the banner in that element (call before the element goes away). */
  clearBanner(id: string): void;
  /** Why the last break failed, if the SDK said ('adsDisabled', 'unfilled', 'adblock', 'adCooldown', 'other'). */
  lastBreakError(): string | null;
  /** A big moment (every stage cleared): portals may celebrate it. */
  happytime(): void;
  /** The portal wants the game silent (its own mute button), independent of the in-game volume. */
  muted(): boolean;
  onMutedChange(cb: (muted: boolean) => void): () => void;
  /** The portal's idea of the device, or null when it does not say (then the game decides for itself). */
  deviceType(): DeviceType | null;
  storage: KeyValue;
}
