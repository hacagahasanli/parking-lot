/**
 * The sound budget: how often each one-shot may play and how many of it may sound at once. `sfx.ts` asks the gate before
 * it builds a voice; a request over budget is dropped (never queued). The table is the contract in docs/SOUND.md: a new
 * one-shot gets a row here first, and the test fails if a sound has none.
 *
 * Kept free of Web Audio so it runs (and is tested) in node.
 */

export interface Budget {
  /** Minimum time between two starts of this sound. */
  cooldownMs: number;
  /** How many of it may sound at once. */
  maxVoices: number;
  /** How long one voice lasts (counts towards `maxVoices` for this long). */
  lengthMs: number;
}

export const BUDGET = {
  // Feedback for the player's own car: short, soft, never a wall of clicks.
  shift: { cooldownMs: 150, maxVoices: 1, lengthMs: 90 },
  grind: { cooldownMs: 700, maxVoices: 1, lengthMs: 180 },
  // The world: crashes stay loud, but a pile-up is three voices, not twelve.
  bump: { cooldownMs: 70, maxVoices: 3, lengthMs: 450 },
  alarm: { cooldownMs: 0, maxVoices: 1, lengthMs: 5000 },
  shout: { cooldownMs: 1200, maxVoices: 1, lengthMs: 1000 },
  toot: { cooldownMs: 1500, maxVoices: 1, lengthMs: 260 },
  whoosh: { cooldownMs: 2000, maxVoices: 1, lengthMs: 450 },
  // Race cues.
  beep: { cooldownMs: 300, maxVoices: 1, lengthMs: 450 },
  tick: { cooldownMs: 400, maxVoices: 1, lengthMs: 60 },
  found: { cooldownMs: 1500, maxVoices: 1, lengthMs: 400 },
  sting: { cooldownMs: 3000, maxVoices: 1, lengthMs: 400 },
  win: { cooldownMs: 1500, maxVoices: 1, lengthMs: 600 },
  lose: { cooldownMs: 1500, maxVoices: 1, lengthMs: 600 },
  // Menus.
  ui: { cooldownMs: 45, maxVoices: 2, lengthMs: 120 },
  click: { cooldownMs: 45, maxVoices: 2, lengthMs: 40 },
} as const satisfies Record<string, Budget>;

export type SoundName = keyof typeof BUDGET;

/**
 * Bus levels (linear gain, before the player's sliders) and the scene trims. The ambience bed sits about 60 dB under full
 * scale: noticed only when it stops.
 */
export const MIX = {
  engine: 1,
  world: 1,
  cue: 0.8,
  ambience: 1,
  /** The bed's own gain into the ambience bus (low-passed noise). */
  bed: 0.014,
  /** Behind the menu the bots' world is a backdrop: about -9 dB, and no race cues at all. */
  menuWorld: 0.35,
  /** Paused: the idling engines drop about -12 dB. */
  pausedEngine: 0.25,
  /** Ducking on a crash, a hit shopper, a win or a loss: ambience about -10 dB, engines about -4 dB. */
  duckAmbience: 0.32,
  duckEngine: 0.63,
} as const;

export interface Gate {
  /** True if `name` may start now (and records the start); false if it is over budget. */
  allow: (name: SoundName, now: number) => boolean;
  /** Starts and drops per sound since creation (the dev meter and the tests read it). */
  stats: () => Record<string, { played: number; dropped: number }>;
  /** Voices of `name` still sounding at `now`. */
  active: (name: SoundName, now: number) => number;
}

export const createGate = (budget: Record<string, Budget> = BUDGET): Gate => {
  const last = new Map<string, number>();
  const ends = new Map<string, number[]>();
  const counts: Record<string, { played: number; dropped: number }> = {};
  const live = (name: string, now: number) => {
    const e = (ends.get(name) ?? []).filter((t) => t > now);
    ends.set(name, e);
    return e;
  };
  return {
    allow: (name, now) => {
      const b = budget[name];
      const c = (counts[name] ??= { played: 0, dropped: 0 });
      const prev = last.get(name);
      const e = live(name, now);
      if ((prev !== undefined && now - prev < b.cooldownMs) || e.length >= b.maxVoices) {
        c.dropped++;
        return false;
      }
      last.set(name, now);
      e.push(now + b.lengthMs);
      c.played++;
      return true;
    },
    stats: () => counts,
    active: (name, now) => live(name, now).length,
  };
};
