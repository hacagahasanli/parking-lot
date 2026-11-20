/// <reference types="vite/client" />
/**
 * The portal build's entry: no home page, no outbound links, straight into the race (CrazyGames asks that new players land in
 * gameplay). The platform adapter is chosen first; the neutral copy and P-to-pause (Esc belongs to the portal's fullscreen)
 * are fixed here.
 */
import { createRoot } from 'react-dom/client';

import { Race } from '~/components/Race';
import { STUDIO_NAME } from '~/lib/studio';
import { detectPlatform } from '~/platform';

import './portal.css';

const testBreaks = import.meta.env.DEV && new URLSearchParams(location.search).has('testBreaks');

void detectPlatform().then((platform) => {
  createRoot(document.getElementById('root')!).render(<Race platform={platform} flavour="neutral" credit={STUDIO_NAME} escPause={false} testBreaks={testBreaks} />);
});
