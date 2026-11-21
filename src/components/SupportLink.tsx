import { SUPPORT_URL } from '~/lib/links';
import { track } from '~/lib/telemetry';

/*
 * Site only: the portal build has its own entry (portal/main.tsx) that never imports this file, so no outbound link
 * reaches dist/portal (scripts/portal-report.mjs checks it).
 */

/** A paper cup with a lid, a P on its sleeve and steam that rises (still when motion is reduced). */
const Cup = ({ className = 'h-6 w-6' }: { className?: string }) => (
  <svg viewBox="0 0 32 32" className={className} aria-hidden="true">
    <g className="steam" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" opacity="0.85">
      <path d="M12 9c-1.4-1.6 1.4-2.6 0-4.4" />
      <path d="M16 9c-1.4-1.6 1.4-2.6 0-4.4" />
      <path d="M20 9c-1.4-1.6 1.4-2.6 0-4.4" />
    </g>
    <path d="M8.5 12h15l-1.6 16.2a1.6 1.6 0 0 1-1.6 1.4h-8.6a1.6 1.6 0 0 1-1.6-1.4z" fill="#f4f6fb" stroke="#0a0d18" strokeWidth="1.2" />
    <rect x="7.4" y="10" width="17.2" height="3" rx="1.2" fill="#ffd23f" stroke="#0a0d18" strokeWidth="1.2" />
    <path d="M9.6 17h12.8l-0.7 7.4H10.3z" fill="#1f6fd6" />
    <path d="M14.4 23v-4.6h2.1a1.5 1.5 0 0 1 0 3h-2.1" fill="none" stroke="#fff" strokeWidth="1.3" strokeLinejoin="round" />
  </svg>
);

/** A small warm pill to the studio's support page, for the pause menu and the results screen. Opens in a new tab; never shown during play. */
export const SupportLink = ({ className = '' }: { className?: string }) => (
  <a
    href={SUPPORT_URL}
    target="_blank"
    rel="noopener"
    onClick={() => track('support_click', { where: 'game' })}
    className={`group text-gold inline-flex items-center gap-1.5 rounded-full border border-gold/50 bg-gold/10 py-1 pr-3.5 pl-2 text-sm font-semibold transition hover:bg-gold hover:text-ink-deep focus-visible:bg-gold focus-visible:text-ink-deep motion-reduce:transition-none ${className}`}
  >
    <Cup className="h-6 w-6 transition group-hover:-rotate-6 motion-reduce:transition-none" />
    Buy us a coffee
    <span className="sr-only"> (opens the Nalbaki Games support page in a new tab)</span>
  </a>
);

/**
 * The home-page version: a pay-and-display ticket for a coffee. A paper ticket with a torn-off stub carrying the car park's blue
 * P and a steaming cup. The whole ticket is the link, so it is easy to hit with a thumb. A thank-you, not a plea.
 */
export const SupportCard = () => (
  <a
    href={SUPPORT_URL}
    target="_blank"
    rel="noopener"
    onClick={() => track('support_click', { where: 'home' })}
    className="group relative flex w-full max-w-md -rotate-1 items-stretch overflow-hidden rounded-xl bg-paper text-ink-deep shadow-[0_12px_32px_rgba(0,0,0,0.45)] transition duration-300 hover:-translate-y-1 hover:rotate-0 hover:shadow-[0_18px_40px_rgba(255,210,63,0.25)] focus-visible:-translate-y-1 focus-visible:rotate-0 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-gold motion-reduce:transition-none motion-reduce:hover:translate-y-0"
  >
    <span aria-hidden className="relative flex w-24 shrink-0 flex-col items-center justify-center gap-1 border-r-2 border-dashed border-ink-deep/25 bg-[#1f5fd1] text-paper sm:w-28">
      <span className="font-display text-3xl leading-none sm:text-4xl">P</span>
      <span className="text-paper">
        <Cup className="h-12 w-12 transition duration-300 group-hover:-rotate-6 group-hover:scale-110 motion-reduce:transition-none" />
      </span>
      <span className="absolute -right-[7px] top-2 h-3 w-3 rounded-full bg-ink-deep/80" />
      <span className="absolute -right-[7px] bottom-2 h-3 w-3 rounded-full bg-ink-deep/80" />
    </span>
    <span className="flex min-w-0 flex-1 flex-col gap-1.5 px-4 py-3 sm:px-5 sm:py-4">
      <span className="font-display text-xl leading-tight sm:text-2xl">Enjoyed the drive?</span>
      <span className="text-sm leading-snug text-ink-deep/75">
        Parking Lot is free to play. If it made you smile, a coffee keeps us going and helps us build the next level. Thank you for parking with us.
      </span>
      <span className="mt-1 inline-flex items-center gap-2 self-start rounded-md bg-gold px-3.5 py-1.5 text-sm font-bold text-ink-deep shadow-[0_3px_0_#b8901c] transition group-hover:brightness-105 group-active:translate-y-0.5 group-active:shadow-none motion-reduce:transition-none">
        Buy us a coffee
        <span aria-hidden className="transition group-hover:translate-x-1 motion-reduce:transition-none">
          →
        </span>
      </span>
    </span>
    <span className="sr-only"> (opens the Nalbaki Games support page in a new tab)</span>
  </a>
);
