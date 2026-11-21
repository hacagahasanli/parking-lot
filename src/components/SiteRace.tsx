'use client';

import Link from 'next/link';

import { Race } from '~/components/Race';
import { SupportLink } from '~/components/SupportLink';
import { STUDIO_NAME } from '~/lib/studio';

/** The race on our own site: the studio's words, a way home, and the support link. */
export const SiteRace = () => (
  <Race
    flavour="studio"
    credit={STUDIO_NAME}
    logoSrc="/brand/logo.svg"
    exit={({ className, label }) => (
      <Link href="/" className={className}>
        {label}
      </Link>
    )}
    support={<SupportLink />}
  />
);
