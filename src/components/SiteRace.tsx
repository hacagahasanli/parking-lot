'use client';

import Link from 'next/link';
import { useEffect } from 'react';

import { Race } from '~/components/Race';
import { SupportLink } from '~/components/SupportLink';
import { STUDIO_NAME } from '~/lib/studio';
import { track } from '~/lib/telemetry';

/** The race on our own site: the studio's words, a way home, and the support link. */
export const SiteRace = () => {
  // Loading starts when the game's page opens; loadDone() fires with the first HUD frame (useSession).
  useEffect(() => track('load_start'), []);
  return (
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
};
