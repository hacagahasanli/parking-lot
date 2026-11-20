/// <reference types="vite/client" />
/**
 * The portal build's entry: no home page and no outbound links. It opens on the main menu over the live lot (PLAY is focused,
 * one press from the race), with settings, stage select, how to play and credits. The platform adapter is chosen first; the
 * neutral copy and P-to-pause (Esc belongs to the portal's fullscreen and the menus) are fixed here.
 */
import { createRoot } from 'react-dom/client';

import { Race } from '~/components/Race';
import { STUDIO_NAME } from '~/lib/studio';
import { detectPlatform } from '~/platform';

import logo from './public/brand/logo.svg';
import './portal.css';

const testBreaks = import.meta.env.DEV && new URLSearchParams(location.search).has('testBreaks');

void detectPlatform().then((platform) => {
  createRoot(document.getElementById('root')!).render(<Race platform={platform} flavour="neutral" credit={STUDIO_NAME} escPause={false} testBreaks={testBreaks} menu logoSrc={logo} />);
});
