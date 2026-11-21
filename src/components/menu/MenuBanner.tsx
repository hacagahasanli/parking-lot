'use client';

/**
 * The portal's only ad: one display banner under the main menu (CrazyGames banner rules: menus a player stays on, never
 * during a round, never over game UI, fully inside the window, clearly apart from the game).
 *  - Requested once the menu is really on screen (the loading screen gone, no panel open), cleared when the menu goes
 *    (Play opens the game modes), so it never shows in a race.
 *  - A responsive banner: the SDK picks the largest size that fits the slot, 320x50 on most screens, 300x250 on tall ones.
 *  - Only where there is room: screens shorter than `MIN_HEIGHT` (phones held sideways) get no slot at all.
 *  - No SDK (our own site, a blocked script) or any refusal (no fill, cooldown, banners disabled): the slot collapses, so
 *    there is never an empty box.
 */
import { useEffect, useState } from 'react';

import type { Platform } from '~/platform/types';

export const MENU_BANNER_ID = 'pl-menu-banner';
/** Below this window height the menu has no spare room for a banner. */
export const MIN_HEIGHT = 560;
/** At least this tall: the slot grows to take a 300x250 banner. */
const TALL = 880;

const roomy = () => typeof window !== 'undefined' && window.innerHeight >= MIN_HEIGHT && window.innerWidth >= 340;

export const MenuBanner = ({ platform, active }: { platform: Platform; active: boolean }) => {
  const [state, setState] = useState<'wait' | 'asking' | 'shown' | 'gone'>('wait');
  const [fits, setFits] = useState(roomy);
  const [tall] = useState(() => typeof window !== 'undefined' && window.innerHeight >= TALL);

  useEffect(() => {
    const onResize = () => setFits(roomy());
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  // Ask once, when the menu is visible and settled (after its entrance slide).
  useEffect(() => {
    if (!platform.banners || !fits || !active || state !== 'wait') return;
    const t = setTimeout(() => {
      setState('asking');
      void platform.requestBanner(MENU_BANNER_ID).then((ok) => setState((s) => (s === 'asking' ? (ok ? 'shown' : 'gone') : s)));
    }, 700);
    return () => clearTimeout(t);
  }, [platform, fits, active, state]);

  // The window got too small: the banner goes for good this visit to the menu.
  useEffect(() => {
    if (!fits && state !== 'wait' && state !== 'gone') {
      platform.clearBanner(MENU_BANNER_ID);
      setState('gone');
    }
  }, [fits, state, platform]);

  // Leaving the menu clears it before its slot goes.
  useEffect(() => () => platform.clearBanner(MENU_BANNER_ID), [platform]);

  if (!platform.banners || !fits || state === 'gone') return null;
  return (
    <aside
      aria-label="Advertisement"
      className={`pointer-events-auto w-fit shrink-0 rounded-sm p-1 transition-colors duration-300 ${state === 'shown' ? 'bg-ink-deep/70 ring-1 ring-cream/15' : ''}`}
    >
      <div id={MENU_BANNER_ID} style={{ width: 320, height: tall ? 250 : 50 }} />
    </aside>
  );
};
