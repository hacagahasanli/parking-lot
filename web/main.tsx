/// <reference types="vite/client" />
/**
 * The web build's entry (parkinglot.nalbakigames.com): the portal build's game, menu and loading screen, plus a small
 * Support us pill (main menu, pause menu, result screens) and the studio's anonymous stats. No CrazyGames SDK: the plain web
 * adapter, so no ads and no banners. If this page ever runs on CrazyGames, the pill and the stats stay off.
 */
import { createRoot } from 'react-dom/client';

import { Race } from '~/components/Race';
import { SupportLink } from '~/components/SupportLink';
import { GAME_VERSION, STUDIO_NAME } from '~/lib/studio';
import { init, track } from '~/lib/telemetry';
import { createWebPlatform } from '~/platform/web';

import logo from '../portal/public/brand/logo.svg';
import '../portal/portal.css';

/** The studio's stats endpoint (public; the Next site read it from NEXT_PUBLIC_STATS_URL). */
const STATS_URL = 'https://stats.nalbakigames.com/v1/b';

const onCrazyGames = () => {
  try {
    if ((window as { CrazyGames?: unknown }).CrazyGames) return true;
    const where = [location.hostname, document.referrer, ...Array.from(location.ancestorOrigins ?? [])].join(' ');
    return /crazygames/i.test(where);
  } catch {
    return false;
  }
};

const testBreaks = import.meta.env.DEV && new URLSearchParams(location.search).has('testBreaks');
const crazy = onCrazyGames();
if (!crazy) {
  init({ endpoint: STATS_URL, game: 'parking-lot', build: GAME_VERSION });
  // Loading starts now; loadDone() fires with the first HUD frame (useSession).
  track('load_start');
}

createRoot(document.getElementById('root')!).render(
  <Race platform={createWebPlatform()} flavour="neutral" credit={STUDIO_NAME} testBreaks={testBreaks} menu logoSrc={logo} support={crazy ? undefined : SupportLink} />,
);
