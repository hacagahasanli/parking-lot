/**
 * Nalbaki Support: the few small icons. Flat, chunky, one colour (currentColor), drawn on a 24 px grid so they sit on
 * the pixel. No mascot, no scene.
 */
const svg = (body) => `<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" focusable="false">${body}</svg>`;

/** One icon per tier: a spark ($3), a power-up bolt ($5), a crown ($10), a pencil (your own amount). */
export const tierIcon = (id) =>
  ({
    spark: svg('<path d="M12 2l2.4 7.6L22 12l-7.6 2.4L12 22l-2.4-7.6L2 12l7.6-2.4z" fill="currentColor"/>'),
    power: svg('<path d="M14 1L4 14h6l-2 9 10-13h-6z" fill="currentColor"/>'),
    super: svg('<path d="M2 7l5 4 5-7 5 7 5-4-2 12H4z" fill="currentColor"/><rect x="4" y="20" width="16" height="2.5" fill="currentColor"/>'),
    custom: svg('<path d="M15.5 3.5l5 5L9 20H4v-5z" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linejoin="round"/><path d="M13 6l5 5" stroke="currentColor" stroke-width="2.6"/>'),
  })[id] ?? '';

/** Icons for the three "what it pays for" bars. */
export const payIcon = (id) =>
  ({
    servers: svg('<rect x="3" y="3" width="18" height="7" fill="none" stroke="currentColor" stroke-width="2.4"/><rect x="3" y="14" width="18" height="7" fill="none" stroke="currentColor" stroke-width="2.4"/><rect x="6" y="5.5" width="3" height="2" fill="currentColor"/><rect x="6" y="16.5" width="3" height="2" fill="currentColor"/>'),
    games: svg('<path d="M6 7h12a4 4 0 0 1 4 4v4a3 3 0 0 1-5.5 1.6L15 15H9l-1.5 1.6A3 3 0 0 1 2 15v-4a4 4 0 0 1 4-4z" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linejoin="round"/><path d="M7 10v4M5 12h4" stroke="currentColor" stroke-width="2.2"/><rect x="15" y="10" width="2.4" height="2.4" fill="currentColor"/>'),
    polish: svg('<path d="M15 3a9 9 0 1 0 6 15A7.5 7.5 0 0 1 15 3z" fill="currentColor"/>'),
  })[id] ?? '';

/** The arrow on the buttons. */
export const ARROW = '<svg class="arr" viewBox="0 0 16 16" width="16" height="16" aria-hidden="true" focusable="false"><path d="M2 8h10M8 3.5L12.5 8 8 12.5" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="square"/></svg>';
