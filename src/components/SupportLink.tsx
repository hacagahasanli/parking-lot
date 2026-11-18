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
