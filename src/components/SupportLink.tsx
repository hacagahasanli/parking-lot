'use client';

import { useEffect, useRef } from 'react';

import { SUPPORT_PAY_URL, SUPPORT_URL } from '~/lib/links';
import { track } from '~/lib/telemetry';

/*
 * Site only: the portal build has its own entry (portal/main.tsx) that never imports this file, and Race only shows the
 * `support` it is given (SiteRace passes SupportLink, the portal passes nothing), so no outbound link reaches dist/portal
 * (scripts/portal-report.mjs checks it).
 *
 * The support UI itself is the studio's shared module, vendored in src/vendor/nalbaki-support (synced by
 * scripts/sync-nalbaki-support.mjs): a flat "Support us" card, $3 / $5 / $10 chips and a button to the real itch.io page. It is a
 * web component, so it is loaded on the client only, after the page has painted. A click on any of its links (the Support
 * button, or the pause line to /support) counts as a support click; picking an amount does not.
 */

type Variant = 'menu' | 'pause' | 'results';

/** Space kept for each variant while the module loads, so nothing jumps. */
const RESERVE: Record<Variant, string> = { menu: 'min-h-[214px]', results: 'min-h-[190px]', pause: 'min-h-11' };

export const Support = ({ variant, className = '' }: { variant: Variant; className?: string }) => {
  const host = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = host.current;
    const onClick = (e: MouseEvent) => {
      if (e.composedPath().some((n) => n instanceof HTMLAnchorElement && n.href)) track('support_click', { where: variant === 'menu' ? 'home' : 'game' });
    };
    el?.addEventListener('click', onClick);
    let gone = false;
    let cleanup: (() => void) | undefined;
    void import('~/vendor/nalbaki-support/nalbaki-support.js').then(({ mountSupport }) => {
      if (gone || !host.current) return;
      cleanup = mountSupport(host.current, { variant, href: SUPPORT_PAY_URL, pageHref: SUPPORT_URL });
    });
    return () => {
      gone = true;
      el?.removeEventListener('click', onClick);
      cleanup?.();
    };
  }, [variant]);
  return <div ref={host} className={`${RESERVE[variant]} ${className}`} />;
};

/** What Race is handed by SiteRace: `pill` in the pause menu (one line), `card` on the result screens. */
export const SupportLink = ({ variant = 'pill' }: { variant?: 'pill' | 'card' }) =>
  variant === 'card' ? <Support variant="results" className="w-full" /> : <Support variant="pause" />;
