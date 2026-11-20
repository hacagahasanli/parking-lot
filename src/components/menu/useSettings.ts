'use client';

/**
 * The settings for this page: one store over the platform's storage (the portal's cloud save, or localStorage), read once,
 * and applied live to the game and to the page (`useApplySettings`).
 */
import { useEffect, useMemo, useState } from 'react';

import { deviceFacts } from '~/game/render/deviceFacts';
import { resolveTier } from '~/game/render/quality';
import { createSettingsStore, keyMap } from '~/game/settings';

import type { Game } from '~/game/render/game';
import type { Settings, SettingsStore } from '~/game/settings';
import type { Platform } from '~/platform/types';

const localStore = () => {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
};

export const useSettings = (platform: Platform): [Settings, SettingsStore] => {
  const store = useMemo(() => createSettingsStore(platform.storage, localStore()), [platform]);
  const [settings, setSettings] = useState(store.get);
  useEffect(() => store.subscribe(setSettings), [store]);
  return [settings, store];
};

/** Push the settings into the game and the page whenever either changes. Each game setter ignores a value it already has. */
export const useApplySettings = (game: Game | null, s: Settings, platform: Platform) => {
  const { bindings, transmission } = s.controls;
  useEffect(() => game?.setBindings(keyMap(bindings)), [game, bindings]);
  useEffect(() => game?.setTransmission(transmission), [game, transmission]);
  useEffect(() => {
    if (!game) return;
    game.setCameraMode(s.camera.mode);
    game.setShake(s.camera.shake);
  }, [game, s.camera]);
  useEffect(() => game?.setCalm(s.access.reducedMotion), [game, s.access.reducedMotion]);
  const { quality, shadows, resolution } = s.graphics;
  useEffect(() => {
    if (!game) return;
    game.setRenderPrefs({ shadows, resolution });
    game.setAutoTier(quality === 'auto');
    game.setTier(resolveTier(quality, deviceFacts(platform.deviceType())));
  }, [game, quality, shadows, resolution, platform]);
  const { master, engine, effects, muted } = s.audio;
  useEffect(() => {
    if (!game) return;
    game.setVolume('master', master);
    game.setVolume('engine', engine);
    game.setVolume('effects', effects);
    game.setUserMuted(muted);
  }, [game, master, engine, effects, muted]);
  // Page-wide accessibility classes (see globals.css).
  useEffect(() => {
    const html = document.documentElement.classList;
    html.toggle('pl-calm', s.access.reducedMotion);
    html.toggle('pl-cb', s.access.colorBlind);
    html.toggle('pl-large', s.access.largeHud);
  }, [s.access]);
};
