/**
 * Nalbaki Support: the pure parts (no DOM). Tiers, amounts, the supporter-data boundary, the payment boundary and copy.
 * Everything here is unit-tested in test/core.test.mjs.
 */

/**
 * The support tiers. `amount` is in US dollars; the custom tier has none. `suggested` marks the one we suggest; it is
 * never pre-selected and never called "most popular" (we have no such numbers).
 */
export const TIERS = Object.freeze([
  { id: 'spark', amount: 3, name: 'Tiny spark' },
  { id: 'power', amount: 5, name: 'Power-up', suggested: true },
  { id: 'super', amount: 10, name: 'Super supporter' },
  { id: 'custom', amount: null, name: 'Your own amount' },
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

/** Kept for the data file's `stage` field (no longer drawn). */
export const MAX_STAGE = 4;

/**
 * The supporter-data boundary. The site keeps a small JSON file, updated by hand from real supporters:
 *   { "supporters": number | null, "stage": 0..4, "updatedAt": "YYYY-MM-DD" | null }
 * Anything missing, broken or unknown means "no count". Only a positive whole number of supporters is ever shown.
 */
export const normalizeWorld = (raw) => {
  const r = raw && typeof raw === 'object' ? raw : {};
  const supporters = Number.isInteger(r.supporters) && r.supporters > 0 ? r.supporters : null;
  let stage = Number.isInteger(r.stage) ? Math.min(MAX_STAGE, Math.max(0, r.stage)) : 0;
  if (supporters == null) stage = 0;
  const updatedAt = typeof r.updatedAt === 'string' && !Number.isNaN(Date.parse(r.updatedAt)) ? r.updatedAt : null;
  return { supporters, stage, updatedAt };
};

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
 * `prefillsAmount` is false and the copy tells the visitor which amount to choose on the next page. A future provider (a
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

/** The honest line under the button: where it goes and exactly what to do there. */
export const ctaNote = (amount, provider) => {
  const where = provider.name;
  if (provider.prefillsAmount && amount) return `Opens ${where} in a new tab with $${amount} filled in.`;
  if (amount) return `Opens ${where} in a new tab. Choose $${amount} there and pay by card or PayPal.`;
  return `Opens ${where} in a new tab, where you choose the amount.`;
};

/** The small print under the note (itch.io only; another provider gets none). */
export const finePrint = (provider) => (provider.name === 'itch.io' ? 'Pay what you want, from $1. Payments are handled securely by itch.io.' : '');

/** The note after a click: a thank-you for thinking of us, never a claim that a payment went through. */
export const thanksNote = (amount, provider) => {
  const where = provider.name === 'itch.io' ? 'itch.io' : 'The next page';
  return amount ? `${where} opened in a new tab. Choose $${amount} there. Thank you!` : `${where} opened in a new tab. Thank you!`;
};

/** The status line a screen reader hears after picking an amount. */
export const selectionStatus = (tier, amount, provider) => {
  if (!tier) return '';
  const what = amount ? `$${amount}` : tier.name;
  return `${what} selected. ${ctaNote(amount, provider)}`;
};

/** What support pays for: three honest lines. */
export const PAYS = Object.freeze([
  { id: 'servers', title: 'Servers', line: 'for quick online duels in Floor 42, and Last Commit Standing rooms next.', short: 'for quick online duels' },
  { id: 'games', title: 'New games', line: 'from the first sketch to the first round you can play.', short: 'from sketch to playable' },
  { id: 'polish', title: 'Late-night polish', line: 'on the bugs and little details that make you hit Play again.', short: 'on the little details' },
]);
