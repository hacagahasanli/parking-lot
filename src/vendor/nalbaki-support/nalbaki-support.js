/**
 * <nalbaki-support>: the Nalbaki Games support experience, one framework-free web component for the studio site and
 * every game. No dependencies; styles live in its shadow root, so a host page's CSS (Tailwind, the site's own) never
 * leaks in or out. Fonts and a few colours can be themed with CSS custom properties (see README).
 *
 *   <script type="module" src="/assets/support/nalbaki-support.js"></script>
 *   <nalbaki-support variant="home" href="https://…/purchase" page-href="/support" data-src="/support-world.json">
 *
 * Variants: home | page | menu | pause | results. Without `href` it renders a neutral thank-you with no links at all.
 * React and other frameworks: `mountSupport(element, options)` (below) creates and configures one, returning a cleanup.
 */
import { MOODS, STAGES, MAX_STAGE, TIERS, ctaLabel, ctaNote, linkProvider, normalizeWorld, parseAmount, selectionStatus, supportersLine, tierByAmount, tierById, updatedLine } from './core.js';
import { mascotSvg, sceneSvg, tierIcon } from './art.js';
import { CSS } from './styles.js';

const VARIANTS = ['home', 'page', 'menu', 'pause', 'results'];
const TIER_COLOR = { spark: '#ffc48a', power: '#8fd3ff', super: '#c3a8ff', custom: '#f2efe8' };
const ARROW = '<svg class="arr" viewBox="0 0 16 16" aria-hidden="true"><path d="M3 8h9M8.5 4l4 4-4 4" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const reducedMotion = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

/** One fetch per data URL, shared by every instance on the page. Failures resolve to the starting stage. */
const worldCache = new Map();
export const loadWorld = (url) => {
  if (!url) return Promise.resolve(normalizeWorld(null));
  if (!worldCache.has(url)) {
    worldCache.set(
      url,
      fetch(url, { cache: 'no-cache', credentials: 'omit' })
        .then((r) => (r.ok ? r.json() : null))
        .then(normalizeWorld, () => normalizeWorld(null)),
    );
  }
  return worldCache.get(url);
};

let uid = 0;

export class NalbakiSupport extends HTMLElement {
  static get observedAttributes() {
    return ['variant', 'href', 'page-href', 'data-src', 'heading-level', 'amount'];
  }

  constructor() {
    super();
    this._p = `ns${++uid}-`;
    this._tier = null;
    this._custom = null;
    this._world = normalizeWorld(null);
    this._provider = null;
    this._timers = new Set();
  }

  /** Replace the payment provider (see core.js linkProvider). Re-renders. */
  set provider(p) {
    this._provider = p;
    if (this.shadowRoot) this._render();
  }
  get provider() {
    return this._provider ?? linkProvider(this.getAttribute('href') ?? '');
  }

  /** Set world data directly instead of `data-src`. Always normalized: no fake numbers get through. */
  set world(raw) {
    this._world = normalizeWorld(raw);
    this._applyWorld();
  }
  get world() {
    return this._world;
  }

  connectedCallback() {
    if (!this.shadowRoot) this.attachShadow({ mode: 'open' });
    const pre = this.getAttribute('amount') ?? (this.variant === 'page' ? new URLSearchParams(location.search).get('amount') : null);
    const t = pre ? tierByAmount(pre) : null;
    if (t) this._tier = t.id;
    this._render();
    this._loadData();
  }

  disconnectedCallback() {
    this._timers.forEach(clearTimeout);
    this._timers.clear();
  }

  attributeChangedCallback(name, oldV, newV) {
    if (!this.shadowRoot || oldV === newV) return;
    if (name === 'data-src') return this._loadData();
    if (name === 'amount') {
      const t = tierByAmount(newV);
      this._tier = t ? t.id : null;
    }
    this._render();
  }

  get variant() {
    const v = this.getAttribute('variant');
    return VARIANTS.includes(v) ? v : 'menu';
  }

  get _href() {
    return this.getAttribute('href') || '';
  }

  _later(fn, ms) {
    const id = setTimeout(() => {
      this._timers.delete(id);
      fn();
    }, ms);
    this._timers.add(id);
  }

  _loadData() {
    const src = this.getAttribute('data-src');
    if (!src) return;
    loadWorld(src).then((w) => {
      this._world = w;
      this._applyWorld();
    });
  }

  _amount() {
    const t = tierById(this._tier);
    if (!t) return null;
    return t.amount ?? this._custom;
  }

  /* ------------------------------------------------------------------ markup */

  _heading(cls, text, fallback = 'p') {
    const lvl = parseInt(this.getAttribute('heading-level') ?? '', 10);
    const tag = lvl >= 1 && lvl <= 6 ? `h${lvl}` : fallback;
    return `<${tag} class="${cls}">${text}</${tag}>`;
  }

  _tiers(list, kind) {
    const items = list
      .map((t) => {
        const amt = t.amount ? `$${t.amount}` : 'Custom';
        const pick = t.suggested && kind !== 'chips' ? '<span class="t-pick">Our pick</span>' : '';
        const extra = kind === 'chips' ? '' : `<span class="t-name">${esc(t.name)}</span>${kind === 'cards' ? `<span class="t-line">${esc(t.line)}</span>` : ''}`;
        return `<label class="tier t-${t.id}">
          <input type="radio" name="amount" value="${t.id}"${this._tier === t.id ? ' checked' : ''}>
          <span class="t-face">${kind === 'chips' ? '' : `<span class="t-ico">${tierIcon(t.id)}</span>`}<span class="t-amt">${amt}</span>${extra}${pick}</span>
        </label>`;
      })
      .join('');
    return `<fieldset class="tiers tiers-${kind}"><legend class="sr">Choose an amount</legend>${items}</fieldset>`;
  }

  _customField() {
    return `<div class="custom" ${this._tier === 'custom' ? '' : 'hidden'}>
      <label for="custom-amt">Your amount, in US dollars</label>
      <div class="custom-in"><span aria-hidden="true">$</span><input id="custom-amt" type="text" inputmode="numeric" autocomplete="off" placeholder="7" maxlength="6" aria-describedby="custom-err" value="${this._custom ?? ''}"></div>
      <p class="custom-err" id="custom-err" aria-live="polite"></p>
    </div>`;
  }

  _cta(size = '') {
    const a = this._amount();
    return `<a class="cta ${size}" href="${esc(this.provider.urlFor(a) || this._href)}" target="_blank" rel="noopener">
      <span class="cta-label">${ctaLabel(a)}</span>${ARROW}<span class="sr"> (opens ${esc(this.provider.name)} in a new tab)</span>
    </a>`;
  }

  _note() {
    return `<p class="note">${esc(ctaNote(this._amount(), this.provider))}</p>`;
  }

  _scene() {
    return `<div class="scene" data-stage="0">
      <div class="aura" aria-hidden="true"></div>
      ${sceneSvg(this._p)}
      <div class="fx" aria-hidden="true"></div>
      <p class="bubble" aria-hidden="true">${MOODS.idle.say}</p>
    </div>`;
  }

  _worldText() {
    return `<div class="world-text"><p class="w-line"></p><p class="w-count"></p></div>`;
  }

  _milestones() {
    return `<ol class="miles">${STAGES.map(
      (s, i) => `<li data-i="${i}"><span class="mi-dot" aria-hidden="true"></span><span class="mi-name">${esc(s.name)}</span><span class="mi-state sr"></span></li>`,
    ).join('')}</ol>`;
  }

  _markup() {
    const v = this.variant;
    const href = this._href;
    const status = '<p class="sr" role="status" aria-live="polite"></p>';

    if (!href) {
      // No support link (portal builds, or the host chose none): a quiet thank-you with nothing to click.
      if (v === 'pause') return `<p class="ns pause neutral"><span class="p-art">${mascotSvg(this._p)}</span><span>Thanks for playing!</span></p>`;
      return `<div class="ns ${v} neutral"><div class="m-art">${mascotSvg(this._p)}</div><div class="m-body"><p class="m-title">Thanks for playing!</p></div></div>`;
    }

    if (v === 'pause') {
      const ph = this.getAttribute('page-href') || href;
      return `<a class="ns pause" href="${esc(ph)}" target="_blank" rel="noopener"><span class="p-art">${mascotSvg(this._p)}</span><span class="p-text">Enjoying it? <b>Support us</b></span>${ARROW}<span class="sr"> (opens in a new tab)</span></a>`;
    }

    if (v === 'menu' || v === 'results') {
      const title = v === 'results' ? 'Thanks for playing' : 'Support us';
      const text =
        v === 'results'
          ? 'If you had fun, you can support us and help make the next update.'
          : 'Made by a small studio, free to play. If you like it, you can chip in.';
      return `<div class="ns ${v}" data-mood="idle">
        <div class="m-art"><div class="aura" aria-hidden="true"></div>${mascotSvg(this._p, { beam: false })}<div class="fx" aria-hidden="true"></div></div>
        <div class="m-body">
          ${this._heading('m-title', title)}
          <p class="m-text">${text}</p>
          ${this._tiers(TIERS.filter((t) => t.amount), 'chips')}
          <div class="cta-row">${this._cta('small')}</div>
          ${this._note()}
        </div>
        ${status}
      </div>`;
    }

    const more = this.getAttribute('page-href');
    if (v === 'home') {
      return `<div class="ns home" data-mood="idle">
        <div class="copy">
          ${this._heading('title', 'Support us', 'h2')}
          <p class="lead">We make free games you can play right in your browser. If one of them made your day, you can help us build the next one.</p>
          ${this._tiers(TIERS, 'tiles')}
          ${this._customField()}
          <div class="cta-row">${this._cta()}${more ? `<a class="more" href="${esc(more)}">How support works</a>` : ''}</div>
          ${this._note()}
        </div>
        <div class="art-col">${this._scene()}${this._worldText()}</div>
        ${status}
      </div>`;
    }

    // page
    return `<div class="ns page" data-mood="idle">
      <div class="hero">
        <div class="copy">
          ${this._heading('title', 'Support us', 'h1')}
          <p class="lead">Every game we make is free: no install, no account, no paywall. If you enjoy them, you can help us make more. Pick a little boost below.</p>
          <p class="lead small">Meet Baki. Pick an amount and watch.</p>
        </div>
        <div class="art-col">${this._scene()}</div>
      </div>
      <div class="pick">
        <h2 class="h">Pick an amount</h2>
        ${this._tiers(TIERS, 'cards')}
        ${this._customField()}
        <div class="cta-row">${this._cta('big')}</div>
        ${this._note()}
      </div>
      <div class="growth">
        <h2 class="h">The world we are growing</h2>
        ${this._worldText()}
        ${this._milestones()}
        <p class="fine">We move the world forward by hand when real support comes in. No made-up numbers, ever.</p>
      </div>
      ${status}
    </div>`;
  }

  _render() {
    const root = this.shadowRoot;
    root.innerHTML = `<style>${CSS}</style>${this._markup()}`;
    this._bind();
    this._applyWorld();
    this._applyTier(false);
  }

  /* ------------------------------------------------------------------ state */

  _bind() {
    const root = this.shadowRoot;
    if (!this._rootBound) {
      this._rootBound = true;
      root.addEventListener('pointerdown', () => (this._pointer = true));
      root.addEventListener('keydown', () => (this._pointer = false));
    }
    root.querySelectorAll('input[name="amount"]').forEach((r) => r.addEventListener('change', () => this._select(r.value)));
    const ci = root.getElementById('custom-amt');
    if (ci) ci.addEventListener('input', () => this._customInput(ci.value));
    const cta = root.querySelector('.cta');
    if (cta) cta.addEventListener('click', (e) => this._go(e, cta));
  }

  _select(id) {
    this._tier = id;
    this._applyTier(true);
    // A tap or click on Custom goes straight to the field; arrow keys stay in the radio group (focus is not moved).
    if (id === 'custom' && this._pointer) this.shadowRoot.getElementById('custom-amt')?.focus({ preventScroll: true });
  }

  _customInput(raw) {
    const err = this.shadowRoot.querySelector('.custom-err');
    const n = parseAmount(raw);
    this._custom = n;
    if (err) err.textContent = raw.trim() && n == null ? 'Use a whole number from 1 to 1000.' : '';
    this._applyCta();
  }

  _applyCta() {
    const root = this.shadowRoot;
    const a = this._amount();
    const cta = root.querySelector('.cta');
    if (cta) {
      cta.href = this.provider.urlFor(a) || this._href;
      cta.querySelector('.cta-label').textContent = ctaLabel(a);
    }
    const note = root.querySelector('.note');
    if (note) note.textContent = ctaNote(a, this.provider);
  }

  _applyTier(animate) {
    const root = this.shadowRoot;
    const ns = root.querySelector('.ns');
    if (!ns || ns.classList.contains('neutral') || ns.classList.contains('pause')) return;
    const t = tierById(this._tier);
    const custom = root.querySelector('.custom');
    if (custom) custom.hidden = this._tier !== 'custom';
    this._applyCta();
    if (!t) return;
    this._mood(t.mood, animate);
    if (animate) {
      const st = root.querySelector('[role="status"]');
      if (st) st.textContent = selectionStatus(t, this._amount(), this.provider);
      this._burst(root.querySelector('.fx'), TIER_COLOR[t.id], t.id === 'super' ? 14 : 10);
    }
  }

  _mood(mood, animate) {
    const ns = this.shadowRoot.querySelector('.ns');
    ns.dataset.mood = mood;
    const b = this.shadowRoot.querySelector('.bubble');
    if (b) b.textContent = MOODS[mood]?.say ?? '';
    if (animate) {
      ns.removeAttribute('data-react');
      void ns.offsetWidth; // restart the one-shot reaction
      ns.setAttribute('data-react', '');
    }
  }

  _burst(layer, color, n) {
    if (!layer || reducedMotion()) return;
    for (let i = 0; i < n; i++) {
      const s = document.createElement('i');
      const a = (Math.PI * 2 * i) / n + Math.random() * 0.5;
      const d = 34 + Math.random() * 40;
      s.style.cssText = `--x:${(Math.cos(a) * d).toFixed(1)}px;--y:${(Math.sin(a) * d - 18).toFixed(1)}px;--c:${color};--r:${Math.round(Math.random() * 180)}deg;--s:${(0.6 + Math.random() * 0.8).toFixed(2)}`;
      if (i % 3 === 0) s.className = 'star';
      layer.appendChild(s);
      this._later(() => s.remove(), 1100);
    }
  }

  _go(e, cta) {
    const amount = this._amount();
    const detail = { amount, tier: this._tier, variant: this.variant, url: cta.href };
    const ok = this.dispatchEvent(new CustomEvent('nalbaki-support:intent', { detail, bubbles: true, composed: true, cancelable: true }));
    if (!ok) e.preventDefault();
    // A thank-you for thinking of us, never a claim that a payment happened: we cannot know that.
    this._mood('thanks', true);
    const note = this.shadowRoot.querySelector('.note');
    if (note && ok) note.textContent = amount ? `${this.provider.name === 'itch.io' ? 'itch.io' : 'The next page'} opened in a new tab. Choose $${amount} there. Thank you!` : 'Opened in a new tab. Thank you!';
    if (!reducedMotion()) {
      cta.classList.remove('pop');
      void cta.offsetWidth;
      cta.classList.add('pop');
      this._confetti(cta);
    }
  }

  _confetti(cta) {
    const layer = document.createElement('span');
    layer.className = 'confetti';
    layer.setAttribute('aria-hidden', 'true');
    cta.parentElement.appendChild(layer);
    const colors = Object.values(TIER_COLOR).concat('#ff4d2e');
    for (let i = 0; i < 18; i++) {
      const c = document.createElement('i');
      c.style.cssText = `--x:${(Math.random() * 220 - 110).toFixed(0)}px;--y:${(-40 - Math.random() * 90).toFixed(0)}px;--c:${colors[i % colors.length]};--r:${Math.round(Math.random() * 540 - 270)}deg;--l:${(10 + Math.random() * 60).toFixed(0)}%`;
      layer.appendChild(c);
    }
    this._later(() => layer.remove(), 1400);
  }

  _applyWorld() {
    const root = this.shadowRoot;
    if (!root) return;
    const w = this._world;
    root.querySelectorAll('.scene').forEach((s) => (s.dataset.stage = String(w.stage)));
    const line = root.querySelector('.w-line');
    if (line) line.textContent = STAGES[w.stage].line;
    const count = root.querySelector('.w-count');
    if (count) {
      const txt = [supportersLine(w), updatedLine(w)].filter(Boolean).join(' ');
      count.textContent = txt;
      count.hidden = !txt;
    }
    root.querySelectorAll('.miles li').forEach((li) => {
      const i = Number(li.dataset.i);
      li.classList.toggle('done', i <= w.stage);
      li.classList.toggle('now', i === w.stage);
      if (i === w.stage) li.setAttribute('aria-current', 'step');
      else li.removeAttribute('aria-current');
      li.querySelector('.mi-state').textContent = i === w.stage ? ' (where we are now)' : i < w.stage ? ' (reached)' : '';
    });
  }
}

export const TAG = 'nalbaki-support';
export const define = () => {
  if (typeof customElements !== 'undefined' && !customElements.get(TAG)) customElements.define(TAG, NalbakiSupport);
};
define();

/**
 * Create one inside `host` (any element). Options: variant, href, pageHref, dataSrc, headingLevel, amount, world,
 * provider. Returns a cleanup function. Used by the games' React wrappers.
 */
export const mountSupport = (host, opts = {}) => {
  define();
  const el = document.createElement(TAG);
  const attrs = { variant: opts.variant, href: opts.href, 'page-href': opts.pageHref, 'data-src': opts.dataSrc, 'heading-level': opts.headingLevel, amount: opts.amount };
  for (const [k, v] of Object.entries(attrs)) if (v != null && v !== '') el.setAttribute(k, String(v));
  if (opts.provider) el.provider = opts.provider;
  if (opts.world) el.world = opts.world;
  host.appendChild(el);
  return () => el.remove();
};

export { MAX_STAGE, TIERS, normalizeWorld, parseAmount, linkProvider };
