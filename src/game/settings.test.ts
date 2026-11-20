import { describe, expect, it } from 'vitest';

import {
  ACTIONS,
  DEFAULT_BINDINGS,
  DEFAULTS,
  LEGACY_KEYS,
  SETTINGS_KEY,
  createSettingsStore,
  keyLabel,
  keyMap,
  load,
  rebind,
  sanitize,
  unbind,
  unbound,
} from './settings';

import type { KeyValue } from './settings';

const memory = (init: Record<string, string> = {}): KeyValue & { data: Record<string, string> } => {
  const data = { ...init };
  return { data, getItem: (k) => (k in data ? data[k] : null), setItem: (k, v) => void (data[k] = v) };
};
const broken: KeyValue = {
  getItem: () => {
    throw new Error('blocked');
  },
  setItem: () => {
    throw new Error('quota');
  },
};

describe('settings: defaults', () => {
  it('an empty store gives the defaults', () => {
    expect(load(memory())).toEqual(DEFAULTS);
  });

  it('defaults: parking view, automatic, auto quality, every action bound', () => {
    const s = load(memory());
    expect(s.camera.mode).toBe('park');
    expect(s.controls.transmission).toBe('auto');
    expect(s.graphics.quality).toBe('auto');
    expect(unbound(s.controls.bindings)).toEqual([]);
  });

  it('no default key does two things', () => {
    const all = Object.values(DEFAULT_BINDINGS).flat().filter(Boolean);
    expect(new Set(all).size).toBe(all.length);
  });

  it('a blocked or broken storage never throws: defaults, and changes still apply in memory', () => {
    const store = createSettingsStore(broken);
    expect(store.get()).toEqual(DEFAULTS);
    expect(store.set('camera', { mode: 'chase' }).camera.mode).toBe('chase');
    expect(store.get().camera.mode).toBe('chase');
  });
});

describe('settings: persistence', () => {
  it('saves every change and loads it back', () => {
    const kv = memory();
    const a = createSettingsStore(kv);
    a.set('audio', { master: 0.25, muted: true });
    a.set('controls', { transmission: 'manual', leftHanded: true });
    a.set('access', { largeHud: true });
    const b = createSettingsStore(kv);
    expect(b.get().audio).toEqual({ ...DEFAULTS.audio, master: 0.25, muted: true });
    expect(b.get().controls.transmission).toBe('manual');
    expect(b.get().controls.leftHanded).toBe(true);
    expect(b.get().access.largeHud).toBe(true);
  });

  it('migrates an old save that says manual to the automatic gearbox, unless the player chose manual themselves', () => {
    const old = memory();
    old.setItem(SETTINGS_KEY, JSON.stringify({ controls: { transmission: 'manual' } }));
    expect(createSettingsStore(old).get().controls.transmission).toBe('auto');
    const chosen = memory();
    createSettingsStore(chosen).set('controls', { transmission: 'manual' });
    expect(createSettingsStore(chosen).get().controls.transmission).toBe('manual');
    expect(DEFAULTS.controls.transmission).toBe('auto');
  });

  it('sanitises bad values: out-of-range numbers clamp, unknown words fall back, junk JSON gives the defaults', () => {
    const s = sanitize({ audio: { master: 7, engine: -1, effects: 'loud' }, graphics: { quality: 'ultra', resolution: 0.1 }, camera: { mode: 'drone' } });
    expect(s.audio.master).toBe(1);
    expect(s.audio.engine).toBe(0);
    expect(s.audio.effects).toBe(DEFAULTS.audio.effects);
    expect(s.graphics.quality).toBe('auto');
    expect(s.graphics.resolution).toBe(0.5);
    expect(s.camera.mode).toBe('park');
    expect(load(memory({ [SETTINGS_KEY]: '{not json' }))).toEqual(DEFAULTS);
  });

  it('takes the old single-key choices as the starting values', () => {
    const kv = memory({ [LEGACY_KEYS.quality]: 'low', [LEGACY_KEYS.camera]: 'chase' });
    const local = memory({ [LEGACY_KEYS.volume]: JSON.stringify({ master: 0.3 }) });
    const s = load(kv, local);
    expect(s.graphics.quality).toBe('low');
    expect(s.camera.mode).toBe('chase');
    expect(s.audio.master).toBe(0.3);
  });

  it('reset puts one section back; reset all puts everything back', () => {
    const store = createSettingsStore(memory());
    store.set('graphics', { quality: 'low', showFps: true });
    store.set('audio', { master: 0.1 });
    store.reset('graphics');
    expect(store.get().graphics).toEqual(DEFAULTS.graphics);
    expect(store.get().audio.master).toBe(0.1);
    store.resetAll();
    expect(store.get()).toEqual(DEFAULTS);
  });

  it('tells subscribers about every change, until they unsubscribe', () => {
    const store = createSettingsStore(memory());
    const seen: string[] = [];
    const off = store.subscribe((s) => seen.push(s.camera.mode));
    store.set('camera', { mode: 'chase' });
    off();
    store.set('camera', { mode: 'park' });
    expect(seen).toEqual(['chase']);
  });
});

describe('settings: rebinding', () => {
  it('binds a free key', () => {
    const r = rebind(DEFAULT_BINDINGS, 'horn', 0, 'KeyJ');
    expect(r.bindings.horn).toEqual(['KeyJ', null]);
    expect(r.swapped).toBeNull();
    expect(r.reserved).toBe(false);
  });

  it('a key another action uses is swapped: that action takes the old key', () => {
    // Put the horn on W: Gas loses W and gets H.
    const r = rebind(DEFAULT_BINDINGS, 'horn', 0, 'KeyW');
    expect(r.bindings.horn[0]).toBe('KeyW');
    expect(r.bindings.up[0]).toBe('KeyH');
    expect(r.swapped).toEqual({ action: 'up', slot: 0 });
    const all = Object.values(r.bindings).flat().filter(Boolean);
    expect(new Set(all).size).toBe(all.length);
  });

  it('a key from the same action moves between its slots without a conflict', () => {
    const r = rebind(DEFAULT_BINDINGS, 'up', 1, 'KeyW');
    expect(r.bindings.up).toEqual([null, 'KeyW']);
    expect(r.swapped).toBeNull();
  });

  it('refuses reserved keys (Esc, Tab, Enter)', () => {
    for (const k of ['Escape', 'Tab', 'Enter']) {
      const r = rebind(DEFAULT_BINDINGS, 'pause', 0, k);
      expect(r.reserved).toBe(true);
      expect(r.bindings).toBe(DEFAULT_BINDINGS);
    }
  });

  it('does not change the bindings it was given', () => {
    const before = JSON.stringify(DEFAULT_BINDINGS);
    rebind(DEFAULT_BINDINGS, 'left', 0, 'KeyD');
    expect(JSON.stringify(DEFAULT_BINDINGS)).toBe(before);
  });

  it('unbinding leaves the action listed as unbound once both slots are empty', () => {
    const b = unbind(unbind(DEFAULT_BINDINGS, 'horn', 0), 'horn', 1);
    expect(unbound(b)).toEqual(['horn']);
  });

  it('a saved save with a key claimed twice keeps only the first claim', () => {
    const s = sanitize({ controls: { bindings: { ...DEFAULT_BINDINGS, horn: ['KeyW', null] } } });
    expect(s.controls.bindings.up[0]).toBe('KeyW');
    expect(s.controls.bindings.horn[0]).toBeNull();
  });

  it('a saved reserved key is dropped', () => {
    const s = sanitize({ controls: { bindings: { pause: ['Escape', 'KeyP'] } } });
    expect(s.controls.bindings.pause).toEqual([null, 'KeyP']);
  });
});

describe('settings: applying the bindings', () => {
  it('the key map sends every bound key to its action', () => {
    const m = keyMap(DEFAULT_BINDINGS);
    expect(m.KeyW).toBe('up');
    expect(m.ArrowUp).toBe('up');
    expect(m.Space).toBe('handbrake');
    expect(m.KeyE).toBe('shiftUp');
    expect(m.KeyQ).toBe('shiftDown');
    expect(Object.keys(m)).toHaveLength(Object.values(DEFAULT_BINDINGS).flat().filter(Boolean).length);
  });

  it('after a rebind the old key does nothing and the new one does the action', () => {
    const r = rebind(DEFAULT_BINDINGS, 'handbrake', 0, 'ShiftLeft');
    const m = keyMap(r.bindings);
    expect(m.ShiftLeft).toBe('handbrake');
    expect(m.Space).toBeUndefined();
  });

  it('a swap is applied both ways', () => {
    const m = keyMap(rebind(DEFAULT_BINDINGS, 'camera', 0, 'KeyH').bindings);
    expect(m.KeyH).toBe('camera');
    expect(m.KeyC).toBe('horn');
  });

  it('every action is listed once', () => {
    expect(new Set(ACTIONS.map((a) => a.id)).size).toBe(Object.keys(DEFAULT_BINDINGS).length);
  });

  it('labels keys like keycaps', () => {
    expect(keyLabel('KeyW')).toBe('W');
    expect(keyLabel('ArrowLeft')).toBe('←');
    expect(keyLabel('Digit3')).toBe('3');
    expect(keyLabel('ShiftLeft')).toBe('L-Shift');
    expect(keyLabel(null)).toBe('—');
  });
});
