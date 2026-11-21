/**
 * Nalbaki Support: styles for the shadow root. Flat and loud, like a game menu: night panels with cut corners, a huge
 * condensed display headline in bone and the studio orange, chunky square amount chips and one big orange button.
 * No glass, no glow, no mascot. Themeable from the host page:
 *   --ns-font (body), --ns-display (headlines; falls back to the host's --font-display, then Bricolage), --ns-accent,
 *   --ns-on-accent.
 * Everything that moves stops under prefers-reduced-motion.
 */
export const CSS = /* css */ `
:host {
  --k-night: #0b0c10;
  --k-panel: #14171e;
  --k-panel-2: #1b1f28;
  --k-bone: #f2efe8;
  --k-bone-2: #b5b8c0;
  --k-bone-3: #8d919b;
  --k-line: rgba(242, 239, 232, 0.13);
  --k-ember: #ff9a7f;
  --k-accent: var(--ns-accent, #ff4d2e);
  --k-on-accent: var(--ns-on-accent, #0b0c10);
  --k-display: var(--ns-display, var(--font-display, 'Bricolage', 'Arial Narrow', 'Helvetica Neue', Arial, sans-serif));
  --k-cut: polygon(18px 0, 100% 0, 100% calc(100% - 18px), calc(100% - 18px) 100%, 0 100%, 0 18px);
  --k-cut-s: polygon(8px 0, 100% 0, 100% calc(100% - 8px), calc(100% - 8px) 100%, 0 100%, 0 8px);
  display: block;
  container-type: inline-size;
  color: var(--k-bone);
  font-family: var(--ns-font, inherit);
  line-height: 1.5;
  -webkit-font-smoothing: antialiased;
}
:host([variant='pause']) { display: inline-block; container-type: normal; }
:host([hidden]) { display: none; }
*, *::before, *::after { box-sizing: border-box; }
p, h1, h2, h3, h4, h5, h6, fieldset, ul { margin: 0; padding: 0; }
fieldset { border: 0; min-width: 0; }
ul { list-style: none; }
svg { display: block; flex: none; }
img { display: block; max-width: 100%; height: auto; }
a { color: inherit; }
.sr { position: absolute !important; width: 1px; height: 1px; padding: 0; margin: -1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; border: 0; }
:focus-visible { outline: 3px solid var(--k-bone); outline-offset: 3px; }

/* ------------------------------------------------------------ type */
.title, .p-title, .s-title, .c-title, .chip b, .cta, .own-cur, .own-box input {
  font-family: var(--k-display);
  font-weight: 800;
  font-stretch: 75%;
  font-synthesis: none;
}
.title, .p-title, .s-title, .c-title, .cta { text-transform: uppercase; letter-spacing: 0; }
.title { line-height: 0.88; font-size: clamp(48px, 17cqi, 120px); }
.title > span:not(.sr) { display: block; }
.l1 { color: var(--k-bone); }
.home .l2, .page .l3 { color: var(--k-accent); }
.page .l2 { color: var(--k-night); -webkit-text-stroke: 4px var(--k-bone); paint-order: stroke fill; }
.bar { display: flex !important; gap: 0.07em; margin: 0.1em 0 0.12em; }
.bar i { width: 0.36em; height: 0.15em; background: var(--k-accent); }
.bar i.o { background: none; box-shadow: inset 0 0 0 3px var(--k-accent); }
.story { margin-top: 20px; max-width: 34em; font-size: clamp(16px, 1.1rem, 18px); line-height: 1.6; color: var(--k-bone-2); }
.story + .story { margin-top: 12px; }
.p-title, .s-title { font-size: 26px; line-height: 1; margin-bottom: 16px; }

/* ------------------------------------------------------------ "what it pays for" bars */
.pays.short { display: grid; gap: 8px; margin-top: 22px; color: var(--k-bone-2); }
.pays.short li { padding-left: 14px; border-left: 3px solid var(--k-accent); line-height: 1.45; }
.pays b { color: var(--k-bone); font-weight: 700; }
.pays:not(.short) { display: grid; gap: 8px; }
.pays:not(.short) li {
  display: flex; gap: 14px; align-items: flex-start;
  padding: 14px 16px;
  background: var(--k-panel);
  border-left: 4px solid var(--k-accent);
  color: var(--k-bone-2);
  line-height: 1.5;
}
.pays .ico { color: var(--k-accent); margin-top: 1px; }
.pays .py-games { border-left-color: var(--k-bone) !important; }
.pays .py-games .ico { color: var(--k-bone); }
.pays .py-polish { border-left-color: var(--k-ember) !important; }
.pays .py-polish .ico { color: var(--k-ember); }

/* ------------------------------------------------------------ the amount panel */
.panel {
  position: relative;
  background: var(--k-panel);
  clip-path: var(--k-cut);
  padding: clamp(20px, 3.4cqi, 30px);
}
.panel::before { content: ''; display: block; width: 56px; height: 6px; background: var(--k-accent); margin-bottom: 16px; }

.chips { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 8px; }
.chips-3 { grid-template-columns: repeat(3, minmax(0, 1fr)); }
.chip { position: relative; display: block; cursor: pointer; }
.chip input { position: absolute; inset: 0; width: 100%; height: 100%; margin: 0; opacity: 0; cursor: pointer; z-index: 1; }
.chip-in {
  position: relative;
  isolation: isolate;
  display: grid;
  place-items: center;
  align-content: center;
  gap: 6px;
  min-height: 84px;
  padding: 10px 4px 12px;
  color: var(--k-bone);
  transition: transform 0.15s ease;
}
.chip-in::before { content: ''; position: absolute; inset: 0; z-index: -1; background: rgba(242, 239, 232, 0.07); clip-path: var(--k-cut-s); transition: background 0.15s ease; }
.chip-in::after { content: ''; position: absolute; left: 0; right: 8px; bottom: 0; height: 4px; background: transparent; }
.chip .ico { color: var(--k-accent); }
.chip b { font-size: 28px; line-height: 1; }
.chip:hover .chip-in { transform: translateY(-2px); }
.chip:hover .chip-in::before { background: rgba(242, 239, 232, 0.14); }
.chip input:checked + .chip-in { color: var(--k-on-accent); transform: translateY(-2px); }
.chip input:checked + .chip-in::before { background: var(--k-accent); }
.chip input:checked + .chip-in::after { background: var(--k-bone); }
.chip input:checked + .chip-in .ico { color: var(--k-on-accent); }
.chip input:focus-visible + .chip-in::before { box-shadow: inset 0 0 0 3px var(--k-bone); }
.chip:has(input:focus-visible) { outline: 3px solid var(--k-bone); outline-offset: 3px; }

.chips.small .chip-in { display: flex; justify-content: center; gap: 8px; min-height: 50px; padding: 8px 6px 10px; }
.chips.small .chip b { font-size: 22px; }
.chips.small .ico svg { width: 18px; height: 18px; }

.own { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 8px 12px; margin-top: 14px; }
.own label { font-size: 15px; font-weight: 600; color: var(--k-bone-2); }
.own-box { display: flex; align-items: center; width: 150px; padding: 0 12px; background: var(--k-night); border-left: 3px solid var(--k-accent); }
.own-box:focus-within { outline: 3px solid var(--k-bone); outline-offset: 2px; }
.own-cur { font-size: 20px; color: var(--k-bone-2); }
.own-box input { width: 100%; min-height: 48px; padding: 0 4px 0 6px; background: none; border: 0; color: var(--k-bone); font-size: 22px; }
.own-box input::placeholder { color: var(--k-bone-3); opacity: 1; font-size: 18px; text-transform: uppercase; }
.own-box input:focus-visible { outline: none; }
.own-box:has(input[aria-invalid='true']) { border-left-color: var(--k-ember); }
.own-err { font-size: 14px; font-weight: 600; color: var(--k-ember); }
.own-err:not(:empty) { margin-top: 6px; }

/* ------------------------------------------------------------ the button */
.cta-row { margin-top: 18px; }
.cta {
  position: relative;
  isolation: isolate;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 12px;
  width: 100%;
  min-height: 62px;
  padding: 0 24px;
  color: var(--k-on-accent);
  font-size: 24px;
  line-height: 1;
  text-decoration: none;
  transition: transform 0.15s ease;
}
.cta::before { content: ''; position: absolute; inset: 0; z-index: -1; background: var(--k-accent); clip-path: var(--k-cut-s); transition: filter 0.15s ease; }
.cta::after { content: ''; position: absolute; left: 0; right: 8px; bottom: 0; height: 4px; z-index: -1; background: rgba(11, 12, 16, 0.28); }
.cta:hover { transform: translateY(-2px); color: var(--k-on-accent); }
.cta:hover::before { filter: brightness(1.08); }
.cta:active { transform: translateY(1px); }
.cta .arr { transition: transform 0.15s ease; }
.cta:hover .arr { transform: translateX(3px); }
.cta.small { min-height: 52px; font-size: 20px; }
.cta.pop { animation: pop 0.32s ease; }
@keyframes pop { 0% { transform: scale(1); } 40% { transform: scale(0.96); } 100% { transform: scale(1); } }

.note { margin-top: 14px; font-size: 15px; font-weight: 700; line-height: 1.45; color: var(--k-bone); }
.note.thanks { color: var(--k-accent); }
.fine { margin-top: 6px; font-size: 13px; line-height: 1.5; color: var(--k-bone-3); }
.pack-row { display: flex; align-items: center; gap: 14px; margin-top: 20px; padding-top: 18px; border-top: 1px solid var(--k-line); }
.pack-row img { width: 112px; flex: none; border: 2px solid #262a35; }
.pack-row p { font-size: 14px; line-height: 1.45; color: var(--k-bone-2); }
.pack-row b { color: var(--k-bone); }
.more { margin-top: 14px; font-size: 14px; }
.more a { color: var(--k-bone-2); text-underline-offset: 3px; }
.more a:hover { color: var(--k-accent); }

/* ------------------------------------------------------------ home */
.home { display: grid; gap: 32px; align-items: center; }
@container (min-width: 820px) {
  .home { grid-template-columns: minmax(0, 1.1fr) minmax(0, 0.9fr); gap: 56px; }
  .home .title { font-size: clamp(56px, 8cqi, 112px); }
}

/* ------------------------------------------------------------ page */
.page { display: grid; gap: 40px; }
.count { margin-top: 16px; font-weight: 700; color: var(--k-bone); }
.pack-text { margin: -4px 0 16px; color: var(--k-bone-2); line-height: 1.5; }
.pack-imgs { display: flex; gap: 14px; align-items: flex-end; }
.pack-imgs img { border: 2px solid #262a35; }
.pk-d { flex: 1 1 0; min-width: 0; }
.pk-p { width: 22%; flex: none; }
@container (min-width: 820px) {
  .page { grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); gap: 48px 56px; align-items: start; }
  .page .title { font-size: clamp(64px, 8.4cqi, 120px); }
}

/* ------------------------------------------------------------ game cards: menu and results */
.card {
  position: relative;
  padding: 20px 20px 18px;
  background: rgba(20, 23, 30, 0.95);
  clip-path: polygon(14px 0, 100% 0, 100% calc(100% - 14px), calc(100% - 14px) 100%, 0 100%, 0 14px);
}
.c-bar { display: block; width: 44px; height: 5px; margin-bottom: 12px; background: var(--k-accent); }
.c-title { font-size: 26px; line-height: 1; }
.c-text { margin: 6px 0 14px; font-size: 14.5px; line-height: 1.45; color: var(--k-bone-2); }
.card .cta-row { margin-top: 12px; }
.card .note { margin-top: 10px; font-size: 13px; font-weight: 600; color: var(--k-bone-2); }
.card .note.thanks { color: var(--k-accent); }
.card.neutral { padding: 16px 20px; }
.card.neutral .c-title { font-size: 20px; }

/* ------------------------------------------------------------ pause: one line */
.pause {
  position: relative;
  isolation: isolate;
  display: inline-flex;
  align-items: center;
  gap: 10px;
  min-height: 44px;
  padding: 0 16px;
  font-size: 15px;
  line-height: 1.2;
  color: var(--k-bone);
  text-decoration: none;
  white-space: nowrap;
}
.pause::before { content: ''; position: absolute; inset: 0; z-index: -1; background: rgba(20, 23, 30, 0.92); clip-path: var(--k-cut-s); }
.pause b { font-weight: 800; color: var(--k-accent); }
.p-mark { width: 10px; height: 10px; flex: none; background: var(--k-accent); }
.pause .arr { color: var(--k-accent); transition: transform 0.15s ease; }
a.pause:hover .arr { transform: translateX(3px); }
.pause.neutral b { color: inherit; }

/* ------------------------------------------------------------ phones */
@container (max-width: 420px) {
  .chips { gap: 6px; }
  .chip-in { min-height: 76px; }
  .chip b { font-size: 24px; }
  .cta { font-size: 21px; padding: 0 16px; }
  .own-box { width: 100%; }
  .p-title, .s-title { font-size: 24px; }
  .pk-p { width: 26%; }
}

@media (forced-colors: active) {
  .chip input:checked + .chip-in { outline: 3px solid Highlight; }
  .page .l2 { color: CanvasText; -webkit-text-stroke: 0; }
  .cta, .pause { border: 2px solid ButtonText; }
}

@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after { transition: none !important; animation: none !important; }
  .chip:hover .chip-in, .chip input:checked + .chip-in, .cta:hover, .cta:active { transform: none; }
  .cta:hover .arr, a.pause:hover .arr { transform: none; }
}
`;
