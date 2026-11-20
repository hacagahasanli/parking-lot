/**
 * The free bay hides in plain sight: from far away it is one more empty space between parked cars. Its yellow paint lights up
 * only when you drive close (`REVEAL.near` metres, on the same deck), and the first time it does the game cheers: "FOUND IT!",
 * a chime and a flash. From then on it stays lit for you (and shows on your minimap). The bots never read this; they have
 * their own eyes (`SIGHT` in sim/visibility.ts). Pure, so it can be tested.
 */
export const REVEAL = {
  /** Within this distance (m, flat) on the same deck the bay counts as found. */
  near: 13,
  /** The paint starts to show at this distance and is full at `near`. */
  far: 17,
  /** Same deck: the height difference (m) under which the bay is on your level. */
  sameDeck: 1.6,
} as const;

/** How visible the free bay's paint is (0..1) for a car at a flat distance `d` and height difference `dy`, and whether it is found. */
export const revealOf = (d: number, dy: number, found: boolean): { paint: number; found: boolean } => {
  if (found) return { paint: 1, found: true };
  if (Math.abs(dy) > REVEAL.sameDeck) return { paint: 0, found: false };
  const paint = Math.min(1, Math.max(0, (REVEAL.far - d) / (REVEAL.far - REVEAL.near)));
  return { paint, found: d <= REVEAL.near };
};

/** A near miss: another car passed this close (m, between centres, side by side) while you were going at least `speed` m/s. */
export const NEAR_MISS = { gap: 2.7, speed: 4.5, cooldown: 2.5 } as const;
