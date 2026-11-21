'use client';

import { SUPPORT_URL } from '~/lib/links';
import { track } from '~/lib/telemetry';

/*
 * Site only: the portal build has its own entry (portal/main.tsx) that never imports this file, and Race only shows the
 * `support` it is given (SiteRace passes SupportLink, the portal passes nothing), so no outbound link reaches dist/portal
 * (scripts/portal-report.mjs checks it).
 *
 * Support is one small "Support us" button that opens the studio's support page (nalbakigames.com/support) in a new tab.
 */

type Variant = 'menu' | 'pause' | 'results';

const VARIANT_WHERE: Record<Variant, string> = { menu: 'home', results: 'game', pause: 'game' };

export const Support = ({ variant, className = '' }: { variant: Variant; className?: string }) => (
  <a
    href={SUPPORT_URL}
    target="_blank"
    rel="noopener"
    onClick={() => track('support_click', { where: VARIANT_WHERE[variant] })}
    className={`inline-flex items-center gap-2 self-start rounded-full border-[1.5px] border-[#FF4D2E] bg-black/50 px-4 py-2 text-sm font-bold text-[#F2EFE8] backdrop-blur transition hover:-translate-y-0.5 hover:bg-[#FF4D2E]/20 hover:shadow-[0_6px_22px_-6px_rgba(255,77,46,0.7)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#F2EFE8] motion-reduce:transition-none motion-reduce:hover:translate-y-0 ${className}`}
  >
    <span aria-hidden="true" className="text-[#FF4D2E]">&hearts;</span> Support us
  </a>
);

/** What Race is handed by SiteRace and the web build: `pill` in the pause menu (one line), `card` on the result screens, `menu` on the main menu. */
export const SupportLink = ({ variant = 'pill' }: { variant?: 'pill' | 'card' | 'menu' }) =>
  variant === 'card' ? <Support variant="results" /> : variant === 'menu' ? <Support variant="menu" /> : <Support variant="pause" />;
