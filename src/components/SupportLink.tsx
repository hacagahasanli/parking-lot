import { SUPPORT_URL } from '~/lib/links';

/*
 * Site only: the portal build has its own entry (portal/main.tsx) that never imports this file, so no outbound link
 * reaches dist/portal (scripts/portal-report.mjs checks it).
 */

/** A small warm pill to the studio's support page, for menus and the results screen. Opens in a new tab; never shown during play. */
export const SupportLink = ({ className = '' }: { className?: string }) => (
  <a
    href={SUPPORT_URL}
    target="_blank"
    rel="noopener"
    className={`inline-flex items-center gap-1.5 rounded-full border border-gold/40 bg-gold/10 px-3 py-1 text-xs font-semibold text-gold transition hover:bg-gold hover:text-ink-deep focus-visible:bg-gold focus-visible:text-ink-deep motion-reduce:transition-none ${className}`}
  >
    <span aria-hidden>☕</span> Buy us a coffee
    <span className="sr-only"> (opens in a new tab)</span>
  </a>
);

/**
 * The home-page version: a pay-and-display ticket for a coffee. A paper ticket with a torn-off stub carrying the car park's
 * blue P and a cup. The whole ticket is the link, so it is easy to hit with a thumb.
 */
export const SupportCard = () => (
  <a
    href={SUPPORT_URL}
    target="_blank"
    rel="noopener"
    className="group relative flex w-full max-w-md -rotate-1 items-stretch overflow-hidden rounded-xl bg-paper text-ink-deep shadow-[0_12px_32px_rgba(0,0,0,0.45)] transition duration-300 hover:-translate-y-1 hover:rotate-0 focus-visible:-translate-y-1 focus-visible:rotate-0 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-gold motion-reduce:transition-none motion-reduce:hover:translate-y-0"
  >
    <span aria-hidden className="relative flex w-20 shrink-0 flex-col items-center justify-center gap-1 border-r-2 border-dashed border-ink-deep/25 bg-[#1f5fd1] text-paper sm:w-24">
      <span className="font-display text-4xl leading-none sm:text-5xl">P</span>
      <span className="text-2xl leading-none transition duration-300 group-hover:-rotate-12 group-hover:scale-125 motion-reduce:transition-none">☕</span>
      <span className="absolute -right-[7px] top-2 h-3 w-3 rounded-full bg-ink-deep/80" />
      <span className="absolute -right-[7px] bottom-2 h-3 w-3 rounded-full bg-ink-deep/80" />
    </span>
    <span className="flex min-w-0 flex-1 flex-col gap-1.5 px-4 py-3 sm:px-5 sm:py-4">
      <span className="font-display text-xl leading-tight sm:text-2xl">Buy us a coffee</span>
      <span className="text-sm leading-snug text-ink-deep/75">The game is free. If you parked with a smile, a coffee helps us build the next stage.</span>
      <span className="mt-1 inline-flex items-center gap-2 self-start rounded-md bg-gold px-3.5 py-1.5 text-sm font-bold text-ink-deep shadow-[0_3px_0_#b8901c] transition group-hover:brightness-105 group-active:translate-y-0.5 group-active:shadow-none motion-reduce:transition-none">
        Pay &amp; display
        <span aria-hidden className="transition group-hover:translate-x-1 motion-reduce:transition-none">
          →
        </span>
      </span>
    </span>
    <span className="sr-only"> (opens the Nalbaki Games support page in a new tab)</span>
  </a>
);
