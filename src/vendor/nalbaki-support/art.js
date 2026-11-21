/**
 * Nalbaki Support: the original art, as inline SVG strings.
 *  - Baki, the mascot: a small round creature flying a saucer ("nalbəki" is Azerbaijani for saucer), beaming light down.
 *  - The world: a tiny floating island that grows through five stages (0..4), driven only by real support data.
 * Moods and stages are shown and animated by CSS (styles.js) through classes on the host markup, so nothing here runs.
 */

/** Gradients the art uses. `p` keeps ids unique per instance (each instance has its own shadow root, but be safe). */
const defs = (p) => `
<defs>
  <radialGradient id="${p}glass" cx="0.4" cy="0.3" r="0.8"><stop offset="0" stop-color="#e9e3ff" stop-opacity=".55"/><stop offset="1" stop-color="#8e7bff" stop-opacity=".18"/></radialGradient>
  <radialGradient id="${p}body" cx="0.38" cy="0.32" r="0.8"><stop offset="0" stop-color="#fffdf7"/><stop offset=".7" stop-color="#f2efe8"/><stop offset="1" stop-color="#cbbff5"/></radialGradient>
  <linearGradient id="${p}disc" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ff7a5e"/><stop offset=".55" stop-color="#ff4d2e"/><stop offset="1" stop-color="#c8341c"/></linearGradient>
  <linearGradient id="${p}beam" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#d9ccff" stop-opacity=".55"/><stop offset="1" stop-color="#b9a8ff" stop-opacity="0"/></linearGradient>
  <linearGradient id="${p}flame" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff1b8"/><stop offset=".5" stop-color="#ffb35c"/><stop offset="1" stop-color="#ff4d2e" stop-opacity="0"/></linearGradient>
  <linearGradient id="${p}rock" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#4a4178"/><stop offset="1" stop-color="#1a1735"/></linearGradient>
  <linearGradient id="${p}water" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#bfe8ff"/><stop offset="1" stop-color="#8fd3ff" stop-opacity="0"/></linearGradient>
  <radialGradient id="${p}glow" cx=".5" cy=".5" r=".5"><stop offset="0" stop-color="#b9a8ff" stop-opacity=".45"/><stop offset="1" stop-color="#b9a8ff" stop-opacity="0"/></radialGradient>
  <linearGradient id="${p}ring" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#ffc48a"/><stop offset=".33" stop-color="#9ff0c8"/><stop offset=".66" stop-color="#8fd3ff"/><stop offset="1" stop-color="#c3a8ff"/></linearGradient>
</defs>`;

const sparkle = (x, y, s = 1) => `<g transform="translate(${x} ${y}) scale(${s})"><path d="M0-5 1.3-1.3 5 0 1.3 1.3 0 5-1.3 1.3-5 0-1.3-1.3Z"/></g>`;
const heart = (x, y, s = 1) => `<g transform="translate(${x} ${y}) scale(${s})"><path d="M0 3C-6-2-3-7 0-4 3-7 6-2 0 3Z"/></g>`;

/** Baki in its saucer, in a 120 x 140 box (the beam reaches the bottom). */
const ufo = (p, beam = true) => `
<g class="ufo">
  ${beam ? `<polygon class="beam" points="42,64 78,64 106,140 14,140" fill="url(#${p}beam)"/>` : ''}
  <g class="sparks">${sparkle(20, 30, 0.9)}${sparkle(100, 24, 1.1)}${sparkle(12, 54, 0.7)}${sparkle(108, 50, 0.8)}</g>
  <g class="hearts">${heart(38, 22, 1.3)}${heart(60, 10, 1.6)}${heart(84, 20, 1.2)}</g>
  <g class="flames"><path d="M44 64Q48 84 52 64Q48 69 44 64Z"/><path d="M68 64Q72 84 76 64Q72 69 68 64Z"/></g>
  <g class="craft">
    <line x1="60" y1="18" x2="64" y2="4" stroke="#cbbff5" stroke-width="2" stroke-linecap="round"/>
    <circle class="antenna" cx="64.5" cy="3" r="3.4" fill="#ff4d2e"/>
    <path d="M28 54C28 12 92 12 92 54Z" fill="url(#${p}glass)"/>
    <g class="baki">
      <ellipse cx="46" cy="23" rx="4.2" ry="6.5" transform="rotate(-22 46 23)" fill="#f2efe8"/>
      <ellipse cx="74" cy="23" rx="4.2" ry="6.5" transform="rotate(22 74 23)" fill="#f2efe8"/>
      <circle cx="60" cy="36" r="17.5" fill="url(#${p}body)"/>
      <g class="eyes-n"><ellipse cx="53" cy="34" rx="3.4" ry="4.4" fill="#15131f"/><ellipse cx="67" cy="34" rx="3.4" ry="4.4" fill="#15131f"/><circle cx="54.3" cy="32.3" r="1.35" fill="#fff"/><circle cx="68.3" cy="32.3" r="1.35" fill="#fff"/></g>
      <g class="eyes-h" fill="none" stroke="#15131f" stroke-width="2.2" stroke-linecap="round"><path d="M49.5 35.5q3.5-4.5 7 0"/><path d="M63.5 35.5q3.5-4.5 7 0"/></g>
      <g class="eyes-s" fill="#ff4d2e">${sparkle(53, 34, 0.95)}${sparkle(67, 34, 0.95)}</g>
      <ellipse cx="47.5" cy="40.5" rx="3.3" ry="2" fill="#ff9eb0" opacity=".8"/>
      <ellipse cx="72.5" cy="40.5" rx="3.3" ry="2" fill="#ff9eb0" opacity=".8"/>
      <path class="m-smile" d="M56.5 41.5q3.5 3.4 7 0" fill="none" stroke="#15131f" stroke-width="1.8" stroke-linecap="round"/>
      <ellipse class="m-o" cx="60" cy="43" rx="2.2" ry="2.6" fill="#15131f"/>
    </g>
    <path d="M28 54C28 12 92 12 92 54" fill="none" stroke="#fff" stroke-opacity=".35" stroke-width="1.4"/>
    <path d="M35 42C36 30 44 22 53 20" fill="none" stroke="#fff" stroke-opacity=".55" stroke-width="2" stroke-linecap="round"/>
    <ellipse cx="60" cy="57" rx="45" ry="11.5" fill="url(#${p}disc)"/>
    <ellipse cx="60" cy="53.5" rx="36" ry="5" fill="#ff9a82" opacity=".5"/>
    <path d="M27 61Q60 78 93 61Q60 69 27 61Z" fill="#8e2414"/>
    <g class="lights">${[30, 45, 60, 75, 90].map((x, i) => `<circle style="--i:${i}" cx="${x}" cy="${[59, 61.5, 62.5, 61.5, 59][i]}" r="2.3"/>`).join('')}</g>
  </g>
</g>`;

/** Small seeded random, so the stars sit in the same places on every render. */
const rng = (seed) => () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;

const stars = (w, h, n, seed) => {
  const r = rng(seed);
  let s = '';
  for (let i = 0; i < n; i++) {
    const x = (r() * w).toFixed(1);
    const y = (r() * h * 0.78).toFixed(1);
    const rad = (0.45 + r() * 1.05).toFixed(2);
    s += `<circle style="--d:${(r() * 4).toFixed(2)}s" cx="${x}" cy="${y}" r="${rad}"/>`;
  }
  return `<g class="stars">${s}</g>`;
};

/** The floating island in a 240 x 230 scene. Each `.s1`..`.s4` group appears at that stage and above. */
const world = (p) => `
<g class="world">
  <ellipse cx="120" cy="214" rx="86" ry="14" fill="url(#${p}glow)"/>
  <g class="s4"><ellipse class="ring" cx="120" cy="186" rx="108" ry="26" fill="none" stroke="url(#${p}ring)" stroke-width="2" opacity=".55"/></g>
  <path d="M44 168C48 186 64 196 80 204 92 212 104 226 120 228 136 226 148 212 160 204 176 196 192 186 196 168Z" fill="url(#${p}rock)"/>
  <path d="M58 184q32 9 62 7t60-8M80 202q22 7 40 5t38-7M100 218q10 3 20 2" fill="none" stroke="#fff" stroke-opacity=".07" stroke-width="1.5" stroke-linecap="round"/>
  <ellipse cx="120" cy="168" rx="76" ry="14" fill="#574e7c"/>
  <ellipse cx="120" cy="166" rx="70" ry="10" fill="#6b6292"/>
  <g class="pebbles" fill="#8a82ad"><ellipse cx="78" cy="168" rx="3" ry="1.6"/><ellipse cx="160" cy="170" rx="2.4" ry="1.3"/><ellipse cx="140" cy="164" rx="1.8" ry="1"/></g>
  <g class="s1">
    <ellipse cx="120" cy="168" rx="76" ry="14" fill="#47a982"/>
    <ellipse cx="120" cy="166" rx="70" ry="10" fill="#7fd9a8"/>
    <path d="M52 172q2 6 4 0M70 177q2 7 4 0M168 176q2 6 4 0M184 171q2 5 4 0" fill="#47a982"/>
    <rect x="85.5" y="146" width="5" height="20" rx="2" fill="#7a4a3a"/>
    <circle cx="80" cy="146" r="8.5" fill="#47a982"/><circle cx="97" cy="146" r="9" fill="#47a982"/>
    <circle cx="88" cy="139" r="12.5" fill="#5ec79b"/><circle cx="84" cy="135" r="4.5" fill="#9ff0c8" opacity=".7"/>
    <g class="flowers"><circle cx="66" cy="169" r="2" fill="#ffc48a"/><circle cx="106" cy="172" r="2" fill="#c3a8ff"/><circle cx="134" cy="171" r="1.8" fill="#ffc48a"/><circle cx="172" cy="167" r="2" fill="#8fd3ff"/><circle cx="58" cy="165" r="1.6" fill="#c3a8ff"/></g>
  </g>
  <g class="sprout">
    <path d="M120 167q-1.5-8 1-15" fill="none" stroke="#8fe3b0" stroke-width="2.2" stroke-linecap="round"/>
    <path d="M121 154q8-7 13-1-7 5-13 1Z" fill="#9ff0c8"/><path d="M120 157q-8-6-12-1 6 4 12 1Z" fill="#7fd9a8"/>
  </g>
  <g class="s2">
    <ellipse cx="147" cy="172" rx="3" ry="1.4" fill="#a59fc4"/><ellipse cx="141" cy="175" rx="2.6" ry="1.2" fill="#a59fc4"/>
    <rect x="142" y="146" width="25" height="21" rx="2" fill="#ede6da"/>
    <polygon points="138,148 154.5,133 171,148" fill="#ff4d2e"/>
    <rect class="window" x="151" y="151" width="9" height="7.5" rx="1" fill="#ffd27a"/>
    <rect x="145" y="156" width="5" height="11" rx="1" fill="#7a4a3a"/>
  </g>
  <g class="s3">
    <path d="M90 128Q122 146 156 138" fill="none" stroke="#fff" stroke-opacity=".35" stroke-width=".8"/>
    <g class="bulbs">${[
      [98, 132.6, '#ffc48a'],
      [110, 137.6, '#8fd3ff'],
      [122, 140, '#c3a8ff'],
      [134, 140.3, '#9ff0c8'],
      [146, 139, '#ffc48a'],
    ]
      .map(([x, y, c], i) => `<circle style="--i:${i}" cx="${x}" cy="${y}" r="1.9" fill="${c}"/>`)
      .join('')}</g>
    <line x1="112" y1="166" x2="112" y2="148" stroke="#c9c3e0" stroke-width="1.6"/>
    <circle cx="112" cy="146.5" r="2.6" fill="#ffe3a3"/><circle cx="112" cy="146.5" r="7" fill="#ffe3a3" opacity=".18"/>
    <rect x="186" y="170" width="6" height="40" fill="url(#${p}water)"/>
    <path class="fall" d="M187.5 172v36M190.5 174v34" stroke="#fff" stroke-opacity=".7" stroke-width="1" stroke-dasharray="3 6"/>
    <g class="moon"><circle cx="208" cy="40" r="8" fill="#f4ead0"/><circle cx="205" cy="38" r="1.8" fill="#d9ccb0"/><circle cx="211" cy="43" r="1.2" fill="#d9ccb0"/></g>
  </g>
  <g class="s4">
    <line x1="154.5" y1="134" x2="154.5" y2="116" stroke="#ede6da" stroke-width="1.4"/>
    <path class="flag" d="M154.5 116l13 4.5-13 4.5Z" fill="#9ff0c8"/>
    <g class="fw" style="--d:0s" transform="translate(44 70)">${fireworkRays('#ffc48a')}</g>
    <g class="fw" style="--d:1.1s" transform="translate(196 96)">${fireworkRays('#c3a8ff')}</g>
    <g class="fw" style="--d:2.2s" transform="translate(70 110)">${fireworkRays('#8fd3ff')}</g>
  </g>
</g>`;

function fireworkRays(c) {
  let s = `<g class="fw-in" stroke="${c}" stroke-width="1.6" stroke-linecap="round">`;
  for (let i = 0; i < 8; i++) {
    const a = (i * Math.PI) / 4;
    s += `<line x1="${(Math.cos(a) * 4).toFixed(1)}" y1="${(Math.sin(a) * 4).toFixed(1)}" x2="${(Math.cos(a) * 11).toFixed(1)}" y2="${(Math.sin(a) * 11).toFixed(1)}"/>`;
  }
  return s + '</g>';
}

/** The full scene: stars, the world and Baki above it. Decorative: the words around it carry the meaning. */
export const sceneSvg = (p, { starsCount = 26 } = {}) =>
  `<svg class="scene-svg" viewBox="0 0 240 232" aria-hidden="true" focusable="false">${defs(p)}${stars(240, 232, starsCount, 7)}${world(p)}<g transform="translate(45 10) scale(1.25)">${ufo(p)}</g></svg>`;

/** Baki alone (no world), for the compact game cards and the pause line. */
export const mascotSvg = (p, { beam = false } = {}) =>
  `<svg class="mascot-svg" viewBox="${beam ? '0 -4 120 144' : '10 -4 100 84'}" aria-hidden="true" focusable="false">${defs(p)}${ufo(p, beam)}</svg>`;

/** Small tier icons, one per tier, each with its own little motion (styles.js). */
export const tierIcon = (id) =>
  ({
    spark: `<svg viewBox="0 0 32 32" aria-hidden="true"><path class="i-main" d="M16 3l3 10 10 3-10 3-3 10-3-10-10-3 10-3z" fill="currentColor"/><circle class="i-dot" cx="26" cy="6" r="1.8" fill="currentColor"/></svg>`,
    power: `<svg viewBox="0 0 32 32" aria-hidden="true"><path class="i-flame" d="M12 22q4 9 8 0z" fill="#ffb35c"/><path class="i-main" d="M16 3c5 4 7 9 6 17h-12c-1-8 1-13 6-17z" fill="currentColor"/><circle cx="16" cy="12" r="2.6" fill="#0b0c10" opacity=".55"/><path d="M10 15l-4 5h4zM22 15l4 5h-4z" fill="currentColor" opacity=".7"/></svg>`,
    super: `<svg viewBox="0 0 32 32" aria-hidden="true"><path class="i-main" d="M9 5h14l6 8-13 15L3 13z" fill="currentColor"/><path d="M3 13h26M12 5l4 23 4-23" fill="none" stroke="#0b0c10" stroke-opacity=".3" stroke-width="1.2"/><path class="i-shine" d="M10 7l4 0-5 6h-3z" fill="#fff" opacity=".6"/></svg>`,
    custom: `<svg viewBox="0 0 32 32" aria-hidden="true"><circle cx="16" cy="16" r="12" fill="none" stroke="currentColor" stroke-width="2.4"/><path class="i-main" d="M16 9v14M9 16h14" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"/></svg>`,
  })[id] ?? '';
