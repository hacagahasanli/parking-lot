// Vendored from nalbaki-stats client/telemetry.ts v1, sha256 6734843c9ad6a554a02bae8558560a72b03a4e70ae8ebd32afa16bcde2a41345. Do not edit here: change the source and run scripts/vendor.mjs.
/*
 * Nalbaki Games telemetry client, version 1. No dependencies, no endpoint baked in: nothing is sent until `init` is called with one.
 * Source of truth: nalbaki-stats/client/telemetry.ts. Each game holds a vendored copy (see scripts/vendor.mjs, scripts/check-copies.mjs).
 *
 * What it does and does not do:
 *  - An anonymous random id lives in localStorage and is replaced after 13 months. A per-tab session id lives in sessionStorage
 *    and is replaced after 30 idle minutes. No cookies, no fingerprinting, no IP handling, no personal data.
 *  - It stays completely off (no storage written, nothing queued) for Global Privacy Control, `navigator.webdriver`, the `?nostats`
 *    link, a stored opt-out, and anywhere without a browser (server rendering).
 *  - Events are queued, sent in batches (every 10 s, at 20 events, and when the page hides), retried with backoff and capped at
 *    200 queued events. The server de-duplicates by (session, sequence), so a retry never double counts.
 *  - Every public function is safe to call at any time and never throws.
 */

export type Game = 'site' | 'parking-lot' | 'lcs' | 'floor-42';

export interface EventProps {
  session_start: { ref?: string; utm_source?: string; utm_medium?: string; utm_campaign?: string; utm_content?: string; path?: string; lang?: string; screen?: 's' | 'm' | 'l'; touch?: boolean; returning?: boolean; days_since_first?: number };
  page_view: { path: string };
  play_click: { game: string; where: string };
  support_click: { where: string };
  load_start: Record<never, never>;
  load_done: { ms: number };
  load_fail: { stage?: string; msg?: string };
  menu_view: Record<never, never>;
  round_start: { mode: string; level?: number; stage?: number; character?: string; n_in_session: number };
  round_end: { mode: string; level?: number; result: 'win' | 'lose' | 'quit' | 'crash' | 'timeout'; dur_s: number; placement?: number; of?: number; stars?: number; floor?: number; max_level: number };
  ping: { playing?: boolean };
  online_interest: { action?: 'open' | 'notify' | 'join' };
  js_error: { kind?: string; msg?: string };
}
export type EventName = keyof EventProps;
export type PropsOf<N extends EventName> = EventProps[N];
type TrackArgs<N extends EventName> = Record<never, never> extends EventProps[N] ? [props?: EventProps[N]] : [props: EventProps[N]];

export interface InitOptions {
  endpoint: string;
  game: Game;
  build: string;
}

interface Item {
  g: Game;
  b: string;
  a: string;
  i: string;
  n: EventName;
  s: number;
  t: number;
  p?: Record<string, unknown>;
}

interface Session {
  id: string;
  start: number;
  last: number;
  s: number;
  errors: number;
}

const DAY = 86400000;
const AID_KEY = 'nb_aid';
const SID_KEY = 'nb_sid';
const Q_KEY = 'nb_q';
const OFF_KEY = 'nb_off';
const AID_TTL = 395 * DAY; // 13 months
const IDLE_MS = 30 * 60 * 1000;
const MAX_SESSION_MS = 23 * 60 * 60 * 1000; // the server rejects offsets over 24 h
const MAX_QUEUE = 200;
const MAX_BATCH_EVENTS = 50;
const MAX_BATCH_BYTES = 16 * 1024;
const FLUSH_AT = 20;
const FLUSH_EVERY = 10000;
const PING_EVERY = 60000;
const BACKOFF = [10000, 30000, 120000, 600000];
const MAX_STR = 120;
const MAX_JS_ERRORS = 3;

interface State {
  o: InitOptions;
  aid: string;
  returning: boolean;
  daysSinceFirst: number;
  sess: Session;
  queue: Item[];
  busy: boolean;
  fails: number;
  nextAt: number;
  loading: boolean;
  loadFailed: boolean;
  bootAt: number;
}

let S: State | null = null;

// ---- storage with an in-memory fallback (private modes and blocked storage throw)
const mem: Record<string, string> = {};
const read = (area: 'local' | 'session', k: string): string | null => {
  try {
    const v = (area === 'local' ? window.localStorage : window.sessionStorage).getItem(k);
    return v === null && mem[area + k] !== undefined ? mem[area + k] : v;
  } catch {
    return mem[area + k] ?? null;
  }
};
const write = (area: 'local' | 'session', k: string, v: string): void => {
  mem[area + k] = v;
  try {
    (area === 'local' ? window.localStorage : window.sessionStorage).setItem(k, v);
  } catch {
    /* kept in memory only */
  }
};
const remove = (area: 'local' | 'session', k: string): void => {
  delete mem[area + k];
  try {
    (area === 'local' ? window.localStorage : window.sessionStorage).removeItem(k);
  } catch {
    /* nothing to remove */
  }
};
const parse = <T>(s: string | null): T | null => {
  if (!s) return null;
  try {
    return JSON.parse(s) as T;
  } catch {
    return null;
  }
};

const uuid = (): string => {
  const c = typeof crypto !== 'undefined' ? crypto : undefined;
  if (c && typeof c.randomUUID === 'function') return c.randomUUID();
  const b = new Uint8Array(16);
  if (c && c.getRandomValues) c.getRandomValues(b);
  else for (let k = 0; k < 16; k++) b[k] = Math.floor(Math.random() * 256);
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  const h = Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
};

const clip = (v: string): string => (v.length > MAX_STR ? v.slice(0, MAX_STR) : v);

const cleanProps = (p: unknown): Record<string, unknown> | undefined => {
  if (!p || typeof p !== 'object') return undefined;
  const out: Record<string, unknown> = {};
  for (const k of Object.keys(p as Record<string, unknown>)) {
    const v = (p as Record<string, unknown>)[k];
    if (typeof v === 'string') out[k] = clip(v);
    else if (typeof v === 'number') {
      if (isFinite(v)) out[k] = Math.round(v * 1000) / 1000;
    } else if (typeof v === 'boolean') out[k] = v;
  }
  return Object.keys(out).length ? out : undefined;
};

// ---- switches
const optedOut = (): boolean => {
  try {
    return read('local', OFF_KEY) === '1';
  } catch {
    return false;
  }
};

/** Off for: no browser, automation, Global Privacy Control, the ?nostats link, or a stored opt-out. */
const isOff = (): boolean => {
  if (typeof window === 'undefined' || typeof document === 'undefined' || typeof navigator === 'undefined') return true;
  const nav = navigator as Navigator & { globalPrivacyControl?: boolean };
  if (nav.webdriver === true || nav.globalPrivacyControl === true) return true;
  try {
    const q = new URLSearchParams(window.location.search);
    if (q.has('nostats')) write('local', OFF_KEY, '1');
    else if (q.get('stats') === 'on') remove('local', OFF_KEY);
  } catch {
    /* no query string available */
  }
  return optedOut();
};

/** Stop counting this browser (the Privacy section's button). Clears what was stored. */
export function optOut(): void {
  try {
    write('local', OFF_KEY, '1');
    remove('local', Q_KEY);
    remove('local', AID_KEY);
    remove('session', SID_KEY);
    S = null;
  } catch {
    /* never throws */
  }
}

export function optIn(): void {
  try {
    remove('local', OFF_KEY);
  } catch {
    /* never throws */
  }
}

export function isOptedOut(): boolean {
  try {
    return typeof window !== 'undefined' && optedOut();
  } catch {
    return false;
  }
}

// ---- queue persistence
const saveQueue = (): void => {
  if (!S) return;
  if (S.queue.length) write('local', Q_KEY, JSON.stringify(S.queue));
  else remove('local', Q_KEY);
};
const capQueue = (): void => {
  if (S && S.queue.length > MAX_QUEUE) S.queue.splice(0, S.queue.length - MAX_QUEUE);
};

// ---- sessions
const saveSession = (): void => {
  if (S) write('session', SID_KEY, JSON.stringify(S.sess));
};

/** Returns true when a new session was started (so session_start must be sent). */
const ensureSession = (now: number): boolean => {
  if (!S) return false;
  const s = S.sess;
  if (s.id && now - s.last <= IDLE_MS && now - s.start <= MAX_SESSION_MS) return false;
  S.sess = { id: uuid(), start: now, last: now, s: 0, errors: 0 };
  saveSession();
  return true;
};

const screenSize = (): 's' | 'm' | 'l' => {
  const w = Math.min(window.innerWidth || 0, window.innerHeight || window.innerWidth || 0) || window.innerWidth || 0;
  return w < 600 ? 's' : w < 1024 ? 'm' : 'l';
};

const refHost = (): string | undefined => {
  try {
    if (!document.referrer) return undefined;
    const h = new URL(document.referrer).hostname;
    return h && h !== window.location.hostname ? clip(h) : undefined;
  } catch {
    return undefined;
  }
};

const sessionStartProps = (): EventProps['session_start'] => {
  const p: EventProps['session_start'] = {};
  const ref = refHost();
  if (ref) p.ref = ref;
  try {
    const q = new URLSearchParams(window.location.search);
    for (const k of ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content'] as const) {
      const v = q.get(k);
      if (v) p[k] = clip(v);
    }
    p.path = clip(window.location.pathname);
  } catch {
    /* no location */
  }
  const lang = (navigator.language || '').split('-')[0];
  if (lang) p.lang = clip(lang.toLowerCase());
  p.screen = screenSize();
  p.touch = typeof window.matchMedia === 'function' ? window.matchMedia('(pointer: coarse)').matches : 'ontouchstart' in window;
  p.returning = S?.returning ?? false;
  p.days_since_first = S?.daysSinceFirst ?? 0;
  return p;
};

const push = (n: EventName, p?: Record<string, unknown>): void => {
  if (!S) return;
  const now = Date.now();
  if (ensureSession(now)) pushRaw('session_start', now, cleanProps(sessionStartProps()));
  pushRaw(n, now, p);
};

const pushRaw = (n: EventName, now: number, p?: Record<string, unknown>): void => {
  if (!S) return;
  const sess = S.sess;
  const item: Item = { g: S.o.game, b: S.o.build, a: S.aid, i: sess.id, n, s: sess.s, t: Math.max(0, Math.min(now - sess.start, 86400000)), ...(p ? { p } : {}) };
  sess.s += 1;
  sess.last = now;
  saveSession();
  S.queue.push(item);
  capQueue();
  saveQueue();
  if (S.queue.length >= FLUSH_AT) void send(false);
};

// ---- sending
const takeBatch = (): { body: string; items: Item[] } | null => {
  if (!S || !S.queue.length) return null;
  const first = S.queue[0];
  const items: Item[] = [];
  const events: Array<{ n: EventName; s: number; t: number; p?: Record<string, unknown> }> = [];
  const head = { v: 1, g: first.g, build: first.b, aid: first.a, sid: first.i };
  let body = JSON.stringify({ ...head, e: events });
  for (const it of S.queue) {
    if (it.g !== first.g || it.b !== first.b || it.a !== first.a || it.i !== first.i || events.length >= MAX_BATCH_EVENTS) break;
    events.push({ n: it.n, s: it.s, t: it.t, ...(it.p ? { p: it.p } : {}) });
    const next = JSON.stringify({ ...head, e: events });
    if (next.length > MAX_BATCH_BYTES && events.length > 1) {
      events.pop();
      break;
    }
    body = next;
    items.push(it);
  }
  S.queue.splice(0, items.length);
  saveQueue();
  return { body, items };
};

const requeue = (items: Item[]): void => {
  if (!S) return;
  S.queue.unshift(...items);
  capQueue();
  saveQueue();
};

const fail = (): void => {
  if (!S) return;
  S.nextAt = Date.now() + BACKOFF[Math.min(S.fails, BACKOFF.length - 1)];
  S.fails += 1;
};

/** Send the queue. `hiding` uses sendBeacon (survives the page closing); otherwise fetch with keepalive, one batch at a time. */
const send = async (hiding: boolean): Promise<void> => {
  if (!S) return;
  const url = S.o.endpoint;
  if (hiding) {
    while (S && S.queue.length) {
      const b = takeBatch();
      if (!b) return;
      let queued = false;
      try {
        queued = typeof navigator.sendBeacon === 'function' && navigator.sendBeacon(url, new Blob([b.body], { type: 'text/plain;charset=UTF-8' }));
      } catch {
        queued = false;
      }
      if (!queued) {
        requeue(b.items);
        return;
      }
    }
    return;
  }
  if (S.busy || Date.now() < S.nextAt || typeof fetch !== 'function') return;
  const b = takeBatch();
  if (!b) return;
  S.busy = true;
  try {
    const res = await fetch(url, { method: 'POST', body: b.body, keepalive: true, credentials: 'omit', headers: { 'content-type': 'text/plain;charset=UTF-8' } });
    if (!S) return;
    S.busy = false;
    if (res.ok || (res.status >= 400 && res.status < 500 && res.status !== 429)) {
      // accepted, or refused for good (a 4xx other than 429 will never succeed): do not retry the same events
      S.fails = 0;
      S.nextAt = 0;
      if (S.queue.length) void send(false);
    } else {
      requeue(b.items);
      fail();
    }
  } catch {
    if (!S) return;
    S.busy = false;
    requeue(b.items);
    fail();
  }
};

const onError = (kind: string, raw: unknown): void => {
  if (!S) return;
  const msg = clip(String(raw ?? '').replace(/https?:\/\/\S+/g, '<url>'));
  if (S.loading && !S.loadFailed) {
    S.loadFailed = true;
    push('load_fail', cleanProps({ stage: 'boot', msg }));
    return;
  }
  if (S.sess.errors >= MAX_JS_ERRORS) return;
  S.sess.errors += 1;
  push('js_error', cleanProps({ kind, msg }));
};

export function init(o: InitOptions): void {
  try {
    if (S || !o || !o.endpoint || isOff()) return;
    const now = Date.now();
    const rec = parse<{ id: string; created: number }>(read('local', AID_KEY));
    let aid: string;
    let created: number;
    let returning = false;
    if (rec && typeof rec.id === 'string' && typeof rec.created === 'number' && now - rec.created < AID_TTL && now >= rec.created) {
      aid = rec.id;
      created = rec.created;
      returning = true;
    } else {
      aid = uuid();
      created = now;
      write('local', AID_KEY, JSON.stringify({ id: aid, created }));
    }
    const stored = parse<Session>(read('session', SID_KEY));
    const queue = (parse<Item[]>(read('local', Q_KEY)) ?? []).filter((x) => x && typeof x.i === 'string' && typeof x.s === 'number');
    S = {
      o: { endpoint: o.endpoint, game: o.game, build: o.build },
      aid,
      returning,
      daysSinceFirst: Math.floor((now - created) / DAY),
      sess: stored && typeof stored.id === 'string' && typeof stored.start === 'number' ? stored : { id: '', start: 0, last: 0, s: 0, errors: 0 },
      queue,
      busy: false,
      fails: 0,
      nextAt: 0,
      loading: false,
      loadFailed: false,
      bootAt: typeof performance !== 'undefined' ? performance.now() : 0,
    };
    capQueue();
    const leftover = queue.length > 0;
    if (ensureSession(now)) pushRaw('session_start', now, cleanProps(sessionStartProps()));

    const hide = (): void => {
      if (!S) return;
      if (document.visibilityState === 'hidden' && S.o.game !== 'site') push('ping', undefined);
      void send(true);
    };
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') hide();
    });
    window.addEventListener('pagehide', () => void send(true));
    window.addEventListener('error', (e) => onError('error', e.message));
    window.addEventListener('unhandledrejection', (e) => onError('promise', (e as PromiseRejectionEvent).reason && (e as PromiseRejectionEvent).reason.message ? (e as PromiseRejectionEvent).reason.message : (e as PromiseRejectionEvent).reason));
    setInterval(() => void send(false), FLUSH_EVERY);
    if (o.game !== 'site') setInterval(() => document.visibilityState === 'visible' && push('ping', undefined), PING_EVERY);
    if (leftover) void send(false); // events left from an earlier visit go out now; this visit's wait for the 10 s flush
  } catch {
    S = null;
  }
}

export function track<N extends EventName>(name: N, ...args: TrackArgs<N>): void {
  try {
    if (!S) return;
    if (name === 'load_start') {
      S.loading = true;
      S.loadFailed = false;
      S.bootAt = typeof performance !== 'undefined' ? performance.now() : 0;
    }
    if (name === 'js_error') {
      if (S.sess.errors >= MAX_JS_ERRORS) return;
      S.sess.errors += 1;
    }
    push(name, cleanProps(args[0]));
  } catch {
    /* never throws */
  }
}

/** The game finished loading: sends load_done with the milliseconds since load_start (once per load). */
export function loadDone(): void {
  try {
    if (!S || !S.loading) return;
    S.loading = false;
    const ms = typeof performance !== 'undefined' ? Math.round(performance.now() - S.bootAt) : 0;
    push('load_done', { ms: Math.max(0, ms) });
  } catch {
    /* never throws */
  }
}

export function flush(): void {
  try {
    void send(typeof document !== 'undefined' && document.visibilityState === 'hidden');
  } catch {
    /* never throws */
  }
}
