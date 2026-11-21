/**
 * <nalbaki-support>: the Nalbaki Games support experience, one framework-free web component for the studio site and
 * every game. No dependencies; styles live in its shadow root, so a host page's CSS (Tailwind, the site's own) never
 * leaks in or out. Fonts and the accent can be themed with CSS custom properties (see README).
 *
 *   <script type="module" src="/assets/support/nalbaki-support.js"></script>
 *   <nalbaki-support variant="home" href="https://…/purchase" page-href="/support"
 *     pack-desktop="/img/thanks-desktop.webp" pack-phone="/img/thanks-phone.webp">
 *
 * Variants: home | page | menu | pause | results. Without `href` it renders a neutral thank-you with no links at all.
 * React and other frameworks: `mountSupport(element, options)` (below) creates and configures one, returning a cleanup.
 */
import { PAYS, TIERS, ctaLabel, ctaNote, finePrint, linkProvider, normalizeWorld, parseAmount, selectionStatus, supportersLine, thanksNote, tierByAmount, tierById } from './core.js';
import { ARROW, payIcon, tierIcon } from './art.js';
import { CSS } from './styles.js';

const VARIANTS = ['home', 'page', 'menu', 'pause', 'results'];

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const reducedMotion = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

/** One fetch per data URL, shared by every instance on the page. Failures resolve to "no count". */
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

export class NalbakiSupport extends HTMLElement {
  static get observedAttributes() {
    return ['variant', 'href', 'page-href', 'data-src', 'heading-level', 'amount', 'pack-desktop', 'pack-phone'];
  }

  constructor() {
    super();
    this._tier = null;
    this._custom = null;
    this._world = normalizeWorld(null);
    this._provider = null;
  }

  /** Replace the payment provider (see core.js linkProvider). Re-renders. */
  set provider(p) {
    this._provider = p;
    if (this.shadowRoot) this._render();
  }
  get provider() {
    return this._provider ?? linkProvider(this.getAttribute('href') ?? '');
  }

  /** Set supporter data directly instead of `data-src`. Always normalized: no fake numbers get through. */
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
    this._preselect(pre);
    this._render();
    this._loadData();
  }

  attributeChangedCallback(name, oldV, newV) {
    if (!this.shadowRoot || oldV === newV) return;
    if (name === 'data-src') return this._loadData();
    if (name === 'amount') this._preselect(newV);
    this._render();
  }

  get variant() {
    const v = this.getAttribute('variant');
    return VARIANTS.includes(v) ? v : 'menu';
  }

  get _href() {
    return this.getAttribute('href') || '';
  }

  /** "5" picks the $5 chip; any other valid amount fills the own-amount field (home and page only). */
  _preselect(raw) {
    this._tier = null;
    this._custom = null;
    if (raw == null || raw === '') return;
    const t = tierByAmount(raw);
    if (t) this._tier = t.id;
    else if ((this.variant === 'home' || this.variant === 'page') && parseAmount(raw) != null) {
      this._tier = 'custom';
      this._custom = parseAmount(raw);
    }
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

  _level(offset = 0, fallback = 2) {
    const lvl = parseInt(this.getAttribute('heading-level') ?? '', 10);
    const base = lvl >= 1 && lvl <= 6 ? lvl : fallback;
    return Math.min(6, base + offset);
  }

  _h(cls, html, offset = 0, fallback = 2, noHeading = false) {
    if (noHeading && !this.hasAttribute('heading-level')) return `<p class="${cls}">${html}</p>`;
    const n = this._level(offset, fallback);
    return `<h${n} class="${cls}">${html}</h${n}>`;
  }

  _chips(list, size) {
    const items = list
      .map((t) => {
        const face = t.amount ? `$${t.amount}` : 'Own';
        const sr = t.amount ? '' : '<span class="sr"> amount</span>';
        return `<label class="chip t-${t.id}">
          <input type="radio" name="amount" value="${t.id}"${this._tier === t.id ? ' checked' : ''}>
          <span class="chip-in"><span class="ico">${tierIcon(t.id)}</span><b>${face}</b>${sr}</span>
        </label>`;
      })
      .join('');
    return `<fieldset class="chips chips-${list.length} ${size}"><legend class="sr">Choose an amount</legend>${items}</fieldset>`;
  }

  _own() {
    return `<div class="own">
      <label for="own-amt">Or your own amount</label>
      <span class="own-box"><span class="own-cur" aria-hidden="true">$</span><input id="own-amt" type="text" inputmode="numeric" autocomplete="off" placeholder="Custom" maxlength="6" aria-describedby="own-err" value="${this._custom ?? ''}"></span>
    </div>
    <p class="own-err" id="own-err" aria-live="polite"></p>`;
  }

  _cta(size = '') {
    const a = this._amount();
    return `<a class="cta ${size}" href="${esc(this.provider.urlFor(a) || this._href)}" target="_blank" rel="noopener">
      <span class="cta-label">${ctaLabel(a)}</span>${ARROW}<span class="sr"> (opens ${esc(this.provider.name)} in a new tab)</span>
    </a>`;
  }

  _notes(withFine = true) {
    const fine = withFine ? finePrint(this.provider) : '';
    return `<p class="note">${esc(ctaNote(this._amount(), this.provider))}</p>${fine ? `<p class="fine">${esc(fine)}</p>` : ''}`;
  }

  _packImgs() {
    const d = this.getAttribute('pack-desktop');
    const p = this.getAttribute('pack-phone');
    if (!d && !p) return '';
    return `<div class="pack-imgs">
      ${d ? `<img class="pk-d" src="${esc(d)}" width="960" height="540" loading="lazy" decoding="async" alt="Thank-you wallpaper for desktop, preview">` : ''}
      ${p ? `<img class="pk-p" src="${esc(p)}" width="300" height="650" loading="lazy" decoding="async" alt="Thank-you wallpaper for phone, preview">` : ''}
    </div>`;
  }

  _panel(variant) {
    const home = variant === 'home';
    const d = this.getAttribute('pack-desktop');
    const more = home ? this.getAttribute('page-href') : null;
    return `<div class="panel">
      ${this._h('p-title', 'Pick an amount', 1)}
      ${this._chips(TIERS, 'big')}
      ${this._own()}
      <div class="cta-row">${this._cta('big')}</div>
      ${this._notes()}
      ${
        home && d
          ? `<div class="pack-row"><img src="${esc(d)}" width="960" height="540" loading="lazy" decoding="async" alt="Thank-you wallpaper for desktop, preview"><p><b>Every supporter gets the thank-you pack:</b> a desktop and a phone wallpaper.</p></div>`
          : ''
      }
      ${more ? `<p class="more"><a href="${esc(more)}">How support works</a></p>` : ''}
    </div>`;
  }

  _markup() {
    const v = this.variant;
    const href = this._href;
    const status = '<p class="sr" role="status" aria-live="polite"></p>';

    if (!href) {
      // No support link (portal builds, or the host chose none): a quiet thank-you with nothing to click.
      if (v === 'pause') return `<p class="ns pause neutral"><span class="p-mark" aria-hidden="true"></span><span>Thanks for playing!</span></p>`;
      return `<div class="ns card ${v} neutral"><p class="c-title">Thanks for playing!</p></div>`;
    }

    if (v === 'pause') {
      const ph = this.getAttribute('page-href') || href;
      return `<a class="ns pause" href="${esc(ph)}" target="_blank" rel="noopener"><span class="p-mark" aria-hidden="true"></span><span class="p-text">Enjoying it? <b>Support us</b></span>${ARROW}<span class="sr"> (opens in a new tab)</span></a>`;
    }

    if (v === 'menu' || v === 'results') {
      const title = v === 'results' ? 'Thanks for playing' : 'Support us';
      const text = v === 'results' ? 'Had fun? Support us and help make the next update.' : 'Free to play, made by a small studio. Like it? Chip in.';
      return `<div class="ns card ${v}">
        <span class="c-bar" aria-hidden="true"></span>
        ${this._h('c-title', title, 0, 2, true)}
        <p class="c-text">${text}</p>
        ${this._chips(TIERS.filter((t) => t.amount), 'small')}
        <div class="cta-row">${this._cta('small')}</div>
        ${this._notes(false)}
        ${status}
      </div>`;
    }

    if (v === 'home') {
      return `<div class="ns home">
        <div class="copy">
          ${this._h('title', '<span class="l1">Free games</span><span class="sr">, </span><span class="bar" aria-hidden="true"><i></i><i></i><i></i><i></i><i></i><i></i><i class="o"></i><i class="o"></i></span><span class="l2">your round</span>', 0, 2)}
          <p class="story">Nalbaki is a small studio making free games that run in your browser. No install, no account, no paywall. Just a link.</p>
          <p class="story">If a round made your day, your support pays for the servers that keep matches quick, and for the next game.</p>
          <ul class="pays short">${PAYS.map((p) => `<li class="py-${p.id}"><b>${p.title}</b> ${p.short}</li>`).join('')}</ul>
        </div>
        ${this._panel('home')}
        ${status}
      </div>`;
    }

    // page
    const pack = this._packImgs();
    return `<div class="ns page">
      <div class="intro">
        ${this._h('title', '<span class="l1">Support</span> <span class="l2">the next</span> <span class="l3">round</span>', 0, 1)}
        <p class="story">Our games are free and always will be. Servers, new games and late-night polish are not. If a round made your day, help us make the next one.</p>
        <p class="count" hidden></p>
      </div>
      ${this._panel('page')}
      <div class="pays-wrap">
        ${this._h('s-title', 'What your support pays for', 1, 1)}
        <ul class="pays">${PAYS.map((p) => `<li class="py-${p.id}"><span class="ico">${payIcon(p.id)}</span><span><b>${p.title}</b> ${p.line}</span></li>`).join('')}</ul>
      </div>
      ${
        pack
          ? `<div class="pack">
        ${this._h('s-title', 'Say thanks, get a pack', 1, 1)}
        <p class="pack-text">Every supporter gets the thank-you pack on itch.io: a desktop and a phone wallpaper.</p>
        ${pack}
      </div>`
          : ''
      }
      ${status}
    </div>`;
  }

  _render() {
    const root = this.shadowRoot;
    root.innerHTML = `<style>${CSS}</style>${this._markup()}`;
    this._bind();
    this._applyWorld();
    this._applyCta();
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
    const own = root.getElementById('own-amt');
    if (own) {
      own.addEventListener('input', () => this._ownInput(own.value));
    }
    const cta = root.querySelector('.cta');
    if (cta) cta.addEventListener('click', (e) => this._go(e, cta));
  }

  _check(id, announce) {
    this._tier = id;
    const r = this.shadowRoot.querySelector(`input[name="amount"][value="${id}"]`);
    if (r) r.checked = true;
    this._applyCta();
    if (announce) this._announce();
  }

  _select(id) {
    this._tier = id;
    // A preset chip replaces whatever was typed, so the button and the field never disagree.
    if (id !== 'custom') {
      const own = this.shadowRoot.getElementById('own-amt');
      if (own && own.value) {
        own.value = '';
        own.removeAttribute('aria-invalid');
        this.shadowRoot.getElementById('own-err').textContent = '';
      }
      this._custom = null;
    }
    this._applyCta();
    this._announce();
    // A tap on Own goes straight to the field; arrow keys stay in the radio group.
    if (id === 'custom' && this._pointer) this.shadowRoot.getElementById('own-amt')?.focus({ preventScroll: true });
  }

  _announce() {
    const st = this.shadowRoot.querySelector('[role="status"]');
    if (st) st.textContent = selectionStatus(tierById(this._tier), this._amount(), this.provider);
  }

  _ownInput(raw) {
    const err = this.shadowRoot.getElementById('own-err');
    const own = this.shadowRoot.getElementById('own-amt');
    const n = parseAmount(raw);
    this._custom = n;
    if (this._tier !== 'custom') this._check('custom', false);
    const bad = raw.trim() !== '' && n == null;
    if (err) err.textContent = bad ? 'Use a whole number from 1 to 1000.' : '';
    if (bad) own.setAttribute('aria-invalid', 'true');
    else own.removeAttribute('aria-invalid');
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
    if (note) {
      note.textContent = ctaNote(a, this.provider);
      note.classList.remove('thanks');
    }
  }

  _go(e, cta) {
    const amount = this._amount();
    const detail = { amount, tier: this._tier, variant: this.variant, url: cta.href };
    const ok = this.dispatchEvent(new CustomEvent('nalbaki-support:intent', { detail, bubbles: true, composed: true, cancelable: true }));
    if (!ok) e.preventDefault();
    // A thank-you for thinking of us, never a claim that a payment happened: we cannot know that.
    const note = this.shadowRoot.querySelector('.note');
    if (note && ok) {
      note.textContent = thanksNote(amount, this.provider);
      note.classList.add('thanks');
    }
    if (!reducedMotion()) {
      cta.classList.remove('pop');
      void cta.offsetWidth;
      cta.classList.add('pop');
    }
  }

  _applyWorld() {
    const root = this.shadowRoot;
    if (!root) return;
    const count = root.querySelector('.count');
    if (count) {
      const txt = supportersLine(this._world);
      count.textContent = txt;
      count.hidden = !txt;
    }
  }
}

export const TAG = 'nalbaki-support';
export const define = () => {
  if (typeof customElements !== 'undefined' && !customElements.get(TAG)) customElements.define(TAG, NalbakiSupport);
};
define();

/**
 * Create one inside `host` (any element). Options: variant, href, pageHref, dataSrc, headingLevel, amount, packDesktop,
 * packPhone, world, provider. Returns a cleanup function. Used by the games' React wrappers.
 */
export const mountSupport = (host, opts = {}) => {
  define();
  const el = document.createElement(TAG);
  const attrs = {
    variant: opts.variant,
    href: opts.href,
    'page-href': opts.pageHref,
    'data-src': opts.dataSrc,
    'heading-level': opts.headingLevel,
    amount: opts.amount,
    'pack-desktop': opts.packDesktop,
    'pack-phone': opts.packPhone,
  };
  for (const [k, v] of Object.entries(attrs)) if (v != null && v !== '') el.setAttribute(k, String(v));
  if (opts.provider) el.provider = opts.provider;
  if (opts.world) el.world = opts.world;
  host.appendChild(el);
  return () => el.remove();
};

export { MAX_STAGE, TIERS, normalizeWorld, parseAmount, linkProvider } from './core.js';
