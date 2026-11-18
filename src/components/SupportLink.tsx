import { SUPPORT_URL } from '~/lib/links';

/** A small, quiet link to the studio's donation page. Opens in a new tab; never shown during play. */
export const SupportLink = ({ className = '' }: { className?: string }) => (
  <a
    href={SUPPORT_URL}
    target="_blank"
    rel="noopener"
    className={`text-xs font-semibold uppercase tracking-widest text-cream/60 underline-offset-4 transition hover:text-gold hover:underline focus-visible:text-gold focus-visible:underline ${className}`}
  >
    ☕ Support the studio
  </a>
);

/** The home-page version: a small warm card under the Play button. Free forever, no ads; the button opens the studio's donate page. */
export const SupportCard = () => (
  <div className="panel-cut group mt-1 flex max-w-md items-center gap-3 border border-gold/20 bg-ink/70 p-3 backdrop-blur-sm transition hover:border-gold/50 sm:gap-4 sm:p-4">
    {/* The studio mark: a small static image, so a plain <img> with a fixed size is right (no layout shift). */}
    {/* eslint-disable-next-line @next/next/no-img-element */}
    <img src="/studio-logo.png" alt="" width={56} height={56} className="h-12 w-12 shrink-0 transition duration-300 group-hover:-rotate-6 group-hover:scale-110 sm:h-14 sm:w-14" />
    <div className="flex min-w-0 flex-1 flex-col items-start gap-2">
      <p className="text-sm leading-snug text-cream/80">Free forever, no ads. If this game made your day, buy the studio a coffee ☕</p>
      <a
        href={SUPPORT_URL}
        target="_blank"
        rel="noopener"
        className="panel-cut bg-gold/90 px-4 py-1.5 text-xs font-bold uppercase tracking-wider text-ink-deep transition hover:-translate-y-0.5 hover:bg-gold hover:shadow-[0_4px_18px_rgba(255,210,63,0.35)] focus-visible:-translate-y-0.5 focus-visible:bg-gold motion-reduce:transition-none motion-reduce:hover:translate-y-0"
      >
        ☕ Support the studio
      </a>
    </div>
  </div>
);
