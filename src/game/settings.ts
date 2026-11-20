/**
 * The player's settings: one object, saved as JSON under one key through the platform's storage (the portal's cloud save,
 * or localStorage), applied live by the page (`Race.tsx`) and the game (`Game.applySettings`).
 *
 * Pure (no DOM, no three.js): the store takes any `KeyValue`, so the tests run it against a plain map. Every read is
 * sanitised (an old, partial or hand-edited save never breaks the game: unknown values fall back to the defaults), and every
 * storage call is wrapped (private mode, a full quota or a blocked cloud save only mean the settings are not remembered).
 *
 * Key bindings: each action has two slots (main and alternative) holding a `KeyboardEvent.code`. Rebinding a key that another
 * action uses swaps the two (the other action takes over the old key), so a key never does two things and nothing is lost.
 */
import type { CameraMode } from './render/view';
import type { QualitySetting } from './render/quality';

export const SETTINGS_KEY = 'parking-lot.settings';
/** Older single-value keys (before the settings menu): read once, as the starting values. */
export const LEGACY_KEYS = { quality: 'parking-lot.quality', camera: 'parking-lot.camera', volume: 'parking-lot:volume' } as const;

export type Action = 'up' | 'down' | 'left' | 'right' | 'handbrake' | 'horn' | 'camera' | 'pause' | 'shiftUp' | 'shiftDown';

/** Every action in the order the controls tab lists them, with its label. */
export const ACTIONS: { id: Action; label: string; manualOnly?: boolean }[] = [
  { id: 'up', label: 'Gas' },
  { id: 'down', label: 'Brake / reverse' },
  { id: 'left', label: 'Steer left' },
  { id: 'right', label: 'Steer right' },
  { id: 'handbrake', label: 'Handbrake' },
  { id: 'shiftUp', label: 'Shift up', manualOnly: true },
  { id: 'shiftDown', label: 'Shift down', manualOnly: true },
  { id: 'horn', label: 'Horn' },
  { id: 'camera', label: 'Switch camera' },
  { id: 'pause', label: 'Pause' },
];

export type Slot = 0 | 1;
export type Bindings = Record<Action, [string | null, string | null]>;

export const DEFAULT_BINDINGS: Bindings = {
  up: ['KeyW', 'ArrowUp'],
  down: ['KeyS', 'ArrowDown'],
  left: ['KeyA', 'ArrowLeft'],
  right: ['KeyD', 'ArrowRight'],
  handbrake: ['Space', null],
  shiftUp: ['KeyE', null],
  shiftDown: ['KeyQ', null],
  horn: ['KeyH', null],
  camera: ['KeyC', null],
  pause: ['KeyP', null],
};

/** Keys that can never be bound: Esc belongs to the menus and the portal's fullscreen, Tab and Enter to the focus. */
export const RESERVED_KEYS = new Set(['Escape', 'Tab', 'Enter', 'NumpadEnter', 'MetaLeft', 'MetaRight', 'ContextMenu', 'F11', 'F12']);

export type Transmission = 'auto' | 'manual';

export interface Settings {
  controls: {
    bindings: Bindings;
    transmission: Transmission;
    /** Touch buttons: size (0.8..1.3), opacity (0.3..1), and the left-handed swap (pedals left, steering right). */
    touchSize: number;
    touchOpacity: number;
    leftHanded: boolean;
  };
  camera: { mode: CameraMode; shake: boolean };
  graphics: { quality: QualitySetting; shadows: boolean; /** 0.5..1 of the tier's resolution. */ resolution: number; showFps: boolean };
  audio: { master: number; engine: number; effects: number; muted: boolean };
  access: { reducedMotion: boolean; colorBlind: boolean; largeHud: boolean };
}

export const DEFAULTS: Settings = {
  controls: { bindings: DEFAULT_BINDINGS, transmission: 'auto', touchSize: 1, touchOpacity: 0.9, leftHanded: false },
  camera: { mode: 'park', shake: true },
  graphics: { quality: 'auto', shadows: true, resolution: 1, showFps: false },
  audio: { master: 0.8, engine: 0.7, effects: 0.8, muted: false },
  access: { reducedMotion: false, colorBlind: false, largeHud: false },
};

// ---------------------------------------------------------------------------
// Sanitising
// ---------------------------------------------------------------------------

type Obj = Record<string, unknown>;
const obj = (v: unknown): Obj => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Obj) : {});
const bool = (v: unknown, d: boolean) => (typeof v === 'boolean' ? v : d);
const num = (v: unknown, d: number, lo: number, hi: number) => (typeof v === 'number' && Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : d);
const oneOf = <T extends string>(v: unknown, all: readonly T[], d: T): T => (all.includes(v as T) ? (v as T) : d);
const code = (v: unknown) => (typeof v === 'string' && /^[A-Za-z0-9]{1,24}$/.test(v) && !RESERVED_KEYS.has(v) ? v : null);

/** Saved bindings over the defaults; a key claimed twice keeps only its first claim (the save was edited or is from a bug). */
export const sanitizeBindings = (v: unknown): Bindings => {
  const src = obj(v);
  const out = {} as Bindings;
  const used = new Set<string>();
  for (const { id } of ACTIONS) {
    const saved = Array.isArray(src[id]) ? (src[id] as unknown[]) : null;
    const pair = ([0, 1] as const).map((i) => {
      const c = saved ? code(saved[i]) : DEFAULT_BINDINGS[id][i];
      if (!c || used.has(c)) return null;
      used.add(c);
      return c;
    }) as [string | null, string | null];
    out[id] = pair;
  }
  return out;
};

export const sanitize = (v: unknown): Settings => {
  const s = obj(v);
  const c = obj(s.controls);
  const cam = obj(s.camera);
  const g = obj(s.graphics);
  const a = obj(s.audio);
  const x = obj(s.access);
  const D = DEFAULTS;
  return {
    controls: {
      bindings: sanitizeBindings(c.bindings ?? D.controls.bindings),
      transmission: oneOf(c.transmission, ['auto', 'manual'] as const, D.controls.transmission),
      touchSize: num(c.touchSize, D.controls.touchSize, 0.8, 1.3),
      touchOpacity: num(c.touchOpacity, D.controls.touchOpacity, 0.3, 1),
      leftHanded: bool(c.leftHanded, D.controls.leftHanded),
    },
    camera: { mode: oneOf(cam.mode, ['park', 'chase'] as const, D.camera.mode), shake: bool(cam.shake, D.camera.shake) },
    graphics: {
      quality: oneOf(g.quality, ['auto', 'low', 'medium', 'high'] as const, D.graphics.quality),
      shadows: bool(g.shadows, D.graphics.shadows),
      resolution: num(g.resolution, D.graphics.resolution, 0.5, 1),
      showFps: bool(g.showFps, D.graphics.showFps),
    },
    audio: {
      master: num(a.master, D.audio.master, 0, 1),
      engine: num(a.engine, D.audio.engine, 0, 1),
      effects: num(a.effects, D.audio.effects, 0, 1),
      muted: bool(a.muted, D.audio.muted),
    },
    access: { reducedMotion: bool(x.reducedMotion, D.access.reducedMotion), colorBlind: bool(x.colorBlind, D.access.colorBlind), largeHud: bool(x.largeHud, D.access.largeHud) },
  };
};

// ---------------------------------------------------------------------------
// Bindings
// ---------------------------------------------------------------------------

export interface RebindResult {
  bindings: Bindings;
  /** The action (and slot) that had the key before and now has the rebound action's old key (null: the key was free). */
  swapped: { action: Action; slot: Slot } | null;
  /** The key cannot be bound (Esc, Tab, Enter …): nothing changed. */
  reserved: boolean;
}

/** Bind `key` to `action`'s `slot`. A key another action holds is swapped with this slot's old key. */
export const rebind = (b: Bindings, action: Action, slot: Slot, key: string): RebindResult => {
  if (RESERVED_KEYS.has(key)) return { bindings: b, swapped: null, reserved: true };
  const out = Object.fromEntries(ACTIONS.map(({ id }) => [id, [...b[id]]])) as Bindings;
  const old = out[action][slot];
  let swapped: RebindResult['swapped'] = null;
  for (const { id } of ACTIONS) {
    for (const s of [0, 1] as const) {
      if (out[id][s] === key && !(id === action && s === slot)) {
        // The same action's other slot: just move the key into this slot.
        out[id][s] = id === action ? null : old;
        if (id !== action) swapped = { action: id, slot: s };
      }
    }
  }
  out[action][slot] = key;
  return { bindings: out, swapped, reserved: false };
};

/** Clear one slot (the main slot of an action can be emptied too, but the controls tab warns when an action has no key). */
export const unbind = (b: Bindings, action: Action, slot: Slot): Bindings => ({ ...b, [action]: (slot === 0 ? [null, b[action][1]] : [b[action][0], null]) as [string | null, string | null] });

/** Which action a key does: the table the game's key handler reads. */
export const keyMap = (b: Bindings): Record<string, Action> => {
  const m: Record<string, Action> = {};
  for (const { id } of ACTIONS) for (const k of b[id]) if (k && !(k in m)) m[k] = id;
  return m;
};

/** Actions with no key at all (shown as a warning). */
export const unbound = (b: Bindings): Action[] => ACTIONS.filter(({ id }) => !b[id][0] && !b[id][1]).map(({ id }) => id);

const NAMED: Record<string, string> = {
  ArrowUp: '↑',
  ArrowDown: '↓',
  ArrowLeft: '←',
  ArrowRight: '→',
  Space: 'Space',
  ShiftLeft: 'L-Shift',
  ShiftRight: 'R-Shift',
  ControlLeft: 'L-Ctrl',
  ControlRight: 'R-Ctrl',
  AltLeft: 'L-Alt',
  AltRight: 'R-Alt',
  Backspace: 'Bksp',
  CapsLock: 'Caps',
  Backquote: '`',
  Minus: '-',
  Equal: '=',
  BracketLeft: '[',
  BracketRight: ']',
  Backslash: '\\',
  Semicolon: ';',
  Quote: "'",
  Comma: ',',
  Period: '.',
  Slash: '/',
};

/** A key code as a player reads it on a keycap: 'KeyW' → 'W', 'Digit1' → '1', 'ArrowUp' → '↑'. */
export const keyLabel = (code: string | null): string => {
  if (!code) return '—';
  if (NAMED[code]) return NAMED[code];
  if (/^Key[A-Z]$/.test(code)) return code.slice(3);
  if (/^Digit\d$/.test(code)) return code.slice(5);
  if (/^Numpad/.test(code)) return 'Num ' + code.slice(6);
  return code;
};

// ---------------------------------------------------------------------------
// The store
// ---------------------------------------------------------------------------

export interface KeyValue {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export interface SettingsStore {
  get(): Settings;
  /** Change one section (merged, sanitised, saved, then every listener is told). */
  set<K extends keyof Settings>(section: K, patch: Partial<Settings[K]>): Settings;
  /** One section back to its defaults (the controls tab's "Reset to default"). */
  reset(section: keyof Settings): Settings;
  resetAll(): Settings;
  subscribe(cb: (s: Settings) => void): () => void;
}

const safeGet = (kv: KeyValue, key: string) => {
  try {
    return kv.getItem(key);
  } catch {
    return null;
  }
};

/** Starting values from the old single keys, for a player who set them before the settings menu existed. */
const legacy = (kv: KeyValue, local: KeyValue | null): unknown => {
  const quality = safeGet(kv, LEGACY_KEYS.quality);
  const camera = safeGet(kv, LEGACY_KEYS.camera);
  let audio: unknown = {};
  try {
    audio = JSON.parse((local && safeGet(local, LEGACY_KEYS.volume)) ?? '{}');
  } catch {
    /* a broken old save: defaults */
  }
  return { graphics: { quality: quality ?? undefined }, camera: { mode: camera === 'chase' ? 'chase' : 'park' }, audio };
};

export const load = (kv: KeyValue, local: KeyValue | null = null): Settings => {
  const raw = safeGet(kv, SETTINGS_KEY);
  if (raw === null) return sanitize(legacy(kv, local));
  try {
    return sanitize(JSON.parse(raw));
  } catch {
    return sanitize({});
  }
};

/** `local` is the browser's own localStorage, read once for the old volume key (the sound saved its volumes there). */
export const createSettingsStore = (kv: KeyValue, local: KeyValue | null = null): SettingsStore => {
  let s = load(kv, local);
  const subs = new Set<(s: Settings) => void>();
  const commit = (next: Settings) => {
    s = next;
    try {
      kv.setItem(SETTINGS_KEY, JSON.stringify(s));
    } catch {
      /* not remembered, still applied */
    }
    for (const cb of subs) cb(s);
    return s;
  };
  return {
    get: () => s,
    set: (section, patch) => commit(sanitize({ ...s, [section]: { ...s[section], ...patch } })),
    reset: (section) => commit({ ...s, [section]: DEFAULTS[section] }),
    resetAll: () => commit(sanitize({})),
    subscribe: (cb) => {
      subs.add(cb);
      return () => subs.delete(cb);
    },
  };
};
