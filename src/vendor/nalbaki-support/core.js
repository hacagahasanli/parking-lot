/**
 * Nalbaki Support: the pure parts (no DOM). Tiers, the world-data boundary, amounts, payment boundary and copy.
 * Everything here is unit-tested in test/core.test.mjs.
 */

/** The highest world stage. 0 is the starting stage (a rock with one sprout); 4 is fully grown. */
export const MAX_STAGE = 4;

/**
 * The support tiers. `amount` is in US dollars; the custom tier has none. `suggested` marks the one we suggest: it is
 * labelled "Our pick", never "most popular" (we have no such numbers), and it is never pre-selected.
 */
export const TIERS = Object.freeze([
  { id: 'spark', amount: 3, name: 'Tiny spark', line: 'A small hello that keeps us going.', mood: 'spark' },
  { id: 'power', amount: 5, name: 'Power-up', line: 'Helps build the next level.', mood: 'power', suggested: true },
  { id: 'super', amount: 10, name: 'Super supporter', line: 'Helps keep the game servers running.', mood: 'super' },
  { id: 'custom', amount: null, name: 'Your call', line: 'Any amount you like, from $1.', mood: 'custom' },
]);

export const tierById = (id) => TIERS.find((t) => t.id === id) ?? null;
export const tierByAmount = (amount) => TIERS.find((t) => t.amount != null && t.amount === Number(amount)) ?? null;

export const MIN_AMOUNT = 1;
export const MAX_AMOUNT = 1000;

/**
 * A custom amount typed by the visitor: whole US dollars from 1 to 1000. Returns the number, or null when the field is
 * empty or not a valid amount ("3.50" rounds to the nearest dollar; "abc", "0", "-2" and "5000" are rejected).
 */
export const parseAmount = (raw) => {
  if (raw == null) return null;
  const s = String(raw).trim().replace(/^\$/, '').replace(',', '.');
  if (!/^\d+(\.\d{1,2})?$/.test(s)) return null;
  const n = Math.round(Number(s));
  if (!Number.isFinite(n) || n < MIN_AMOUNT || n > MAX_AMOUNT) return null;
  return n;
};

/**
 * The world-data boundary. The site keeps a small JSON file, updated by hand from real supporters:
 *   { "supporters": number | null, "stage": 0..4, "updatedAt": "YYYY-MM-DD" | null }
 * Anything missing, broken or unknown falls back to the starting stage with no count. When `supporters` is null or 0
 * the stage is always 0: the world never grows without real support behind it.
 */
export const normalizeWorld = (raw) => {
  const r = raw && typeof raw === 'object' ? raw : {};
  const supporters = Number.isInteger(r.supporters) && r.supporters > 0 ? r.supporters : null;
  let stage = Number.isInteger(r.stage) ? Math.min(MAX_STAGE, Math.max(0, r.stage)) : 0;
  if (supporters == null) stage = 0;
  const updatedAt = typeof r.updatedAt === 'string' && !Number.isNaN(Date.parse(r.updatedAt)) ? r.updatedAt : null;
  return { supporters, stage, updatedAt };
};

/** What each stage of the world looks like, in one short line (shown under the world). */
export const STAGES = Object.freeze([
  { name: 'A rock and a sprout', line: 'Our little world is a rock with one sprout. It grows as real support comes in.' },
  { name: 'Grass and a tree', line: 'Grass, flowers and a first tree. Thank you to everyone who chipped in.' },
  { name: 'A tiny studio', line: 'A tiny studio with the lights on. Something is being built in there.' },
  { name: 'Lights and a moon', line: 'String lights, a waterfall and its own moon. It feels like home.' },
  { name: 'Fully grown', line: 'Fully grown. Fireworks, because you made this happen.' },
]);

/** A real count, or nothing. Never invents a number. */
export const supportersLine = (world) => {
  const n = world?.supporters;
  if (!Number.isInteger(n) || n <= 0) return '';
  return n === 1 ? '1 person has supported us so far.' : `${n.toLocaleString('en-US')} people have supported us so far.`;
};

export const updatedLine = (world) => {
  if (!world?.updatedAt) return '';
  const d = new Date(world.updatedAt);
  if (Number.isNaN(d.getTime())) return '';
  return `Updated ${d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' })}.`;
};

/**
 * The payment boundary. A provider turns an amount into where the Support button goes. Today the only provider is a plain
 * link to the studio's real support page; it cannot pre-fill an amount (itch.io has no URL parameter for one), so
 * `prefillsAmount` is false and the copy tells the visitor to type the amount on the next page. A future provider (a
 * checkout with preset amounts) sets `prefillsAmount: true` and returns a URL per amount, or handles the
 * `nalbaki-support:intent` event itself.
 */
export const linkProvider = (href) => ({
  name: providerLabel(href),
  prefillsAmount: false,
  urlFor: () => href,
});

/** "itch.io" for an itch.io link; otherwise a neutral "the next page". */
export const providerLabel = (href) => {
  try {
    const host = new URL(href, 'https://x.invalid').hostname;
    if (/(^|\.)itch\.io$/.test(host)) return 'itch.io';
  } catch {
    /* fall through */
  }
  return 'the next page';
};

/** The Support button's words. */
export const ctaLabel = (amount) => (amount ? `Support with $${amount}` : 'Support us');

/** The honest line under the button: where it goes and who picks the amount. */
export const ctaNote = (amount, provider) => {
  const where = provider.name;
  const site = where === 'itch.io' ? 'itch.io' : 'it';
  if (provider.prefillsAmount && amount) return `Opens ${where} in a new tab with $${amount} filled in.`;
  if (amount) return `Opens ${where} in a new tab. Choose $${amount} there; ${site} handles card and PayPal.`;
  return `Opens ${where} in a new tab, where you choose the amount.`;
};

/** What the mascot says (visual bubble) and what a screen reader hears, per mood. */
export const MOODS = Object.freeze({
  idle: { say: "Hi, I'm Baki!", sr: '' },
  spark: { say: 'Ooh, a spark!', sr: 'Baki’s eyes light up.' },
  power: { say: 'Boosters on!', sr: 'Baki fires up the boosters.' },
  super: { say: 'Wheee!', sr: 'Baki does a happy loop.' },
  custom: { say: 'Any amount is lovely.', sr: 'Baki tilts its head, curious.' },
  thanks: { say: 'Thank you for thinking of us!', sr: '' },
});

/** The status line a screen reader hears after picking a tier. */
export const selectionStatus = (tier, amount, provider) => {
  if (!tier) return '';
  const what = amount ? `$${amount}, ${tier.name}` : tier.name;
  return `${what} selected. ${MOODS[tier.mood]?.sr ?? ''} ${ctaNote(amount, provider)}`.replace(/\s+/g, ' ').trim();
};
