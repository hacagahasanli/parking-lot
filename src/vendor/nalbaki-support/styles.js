/**
 * Nalbaki Support: styles for the shadow root. Dark studio night with a navy and violet glow, pastel tier colours and the
 * studio's orange for the one button that matters. Themeable from the host page:
 *   --ns-font (body), --ns-display (headings), --ns-accent, --ns-on-accent, --ns-radius.
 * Everything that moves stops under prefers-reduced-motion.
 */
export const CSS = /* css */ `
:host {
  --k-night: #0b0c10;
  --k-navy: #141a3d;
  --k-violet: #2b2160;
  --k-bone: #f2efe8;
  --k-bone-2: rgba(242, 239, 232, 0.74);
  --k-bone-3: rgba(242, 239, 232, 0.54);
  --k-line: rgba(242, 239, 232, 0.12);
  --k-accent: var(--ns-accent, #ff4d2e);
  --k-on-accent: var(--ns-on-accent, #0b0c10);
  --k-radius: var(--ns-radius, 22px);
  --k-peach: #ffc48a;
  --k-sky: #8fd3ff;
  --k-lav: #c3a8ff;
  --k-mint: #9ff0c8;
  --k-ease: cubic-bezier(0.2, 0.7, 0.1, 1);
  --k-bounce: cubic-bezier(0.34, 1.56, 0.64, 1);
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
p, h1, h2, h3, h4, h5, h6, fieldset, ol { margin: 0; padding: 0; }
fieldset { border: 0; min-width: 0; }
svg { display: block; }
.sr { position: absolute !important; width: 1px; height: 1px; padding: 0; margin: -1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; border: 0; }
a { color: inherit; }
:focus-visible { outline: 2px solid var(--k-bone); outline-offset: 3px; }

/* ------------------------------------------------------------ surfaces */
.home, .pick, .menu, .results {
  position: relative;
  isolation: isolate;
  border: 1px solid var(--k-line);
  border-radius: var(--k-radius);
  background:
    radial-gradient(120% 90% at 88% 0%, rgba(124, 92, 255, 0.26), transparent 60%),
    radial-gradient(80% 70% at 0% 100%, rgba(255, 77, 46, 0.12), transparent 60%),
    linear-gradient(165deg, #151a3c 0%, #0e1024 55%, var(--k-night) 100%);
  box-shadow: 0 30px 80px -30px rgba(0, 0, 0, 0.7), inset 0 1px 0 rgba(255, 255, 255, 0.06);
  overflow: hidden;
}
.home::before, .page .hero::before {
  /* faint drifting dust in the background */
  content: '';
  position: absolute;
  inset: -20%;
  z-index: -1;
  background-image:
    radial-gradient(1.2px 1.2px at 12% 22%, rgba(255,255,255,.55), transparent 60%),
    radial-gradient(1px 1px at 32% 78%, rgba(255,255,255,.4), transparent 60%),
    radial-gradient(1.4px 1.4px at 58% 14%, rgba(195,168,255,.6), transparent 60%),
    radial-gradient(1px 1px at 76% 64%, rgba(255,255,255,.35), transparent 60%),
    radial-gradient(1.3px 1.3px at 90% 30%, rgba(143,211,255,.5), transparent 60%),
    radial-gradient(1px 1px at 44% 46%, rgba(255,255,255,.3), transparent 60%);
  animation: drift 40s linear infinite;
  pointer-events: none;
}

/* ------------------------------------------------------------ type */
.title {
  font-family: var(--ns-display, inherit);
  font-weight: 800;
  font-size: clamp(2.4rem, 7cqi, 4.4rem);
  line-height: 0.95;
  letter-spacing: -0.02em;
  text-wrap: balance;
}
.title::after { content: '.'; color: var(--k-accent); }
.lead { color: var(--k-bone-2); font-size: 1.06rem; max-width: 34em; text-wrap: pretty; }
.lead.small { font-size: 0.95rem; color: var(--k-bone-3); }
.h { font-family: var(--ns-display, inherit); font-weight: 750; font-size: 1.5rem; line-height: 1.1; letter-spacing: -0.01em; }
.note { color: var(--k-bone-3); font-size: 0.86rem; text-wrap: pretty; }

/* ------------------------------------------------------------ tiers */
.tiers { display: grid; gap: 10px; }
.tier { position: relative; display: block; cursor: pointer; --tc: var(--k-bone); -webkit-tap-highlight-color: transparent; }
.t-spark { --tc: var(--k-peach); }
.t-power { --tc: var(--k-sky); }
.t-super { --tc: var(--k-lav); }
.t-custom { --tc: var(--k-bone); }
.tier input { position: absolute; inset: 0; opacity: 0; margin: 0; cursor: pointer; }
.t-face {
  position: relative;
  display: grid;
  height: 100%;
  border: 1px solid var(--k-line);
  border-radius: 16px;
  background: rgba(255, 255, 255, 0.045);
  -webkit-backdrop-filter: blur(10px);
  backdrop-filter: blur(10px);
  transition: transform 0.35s var(--k-bounce), border-color 0.25s, background 0.25s, box-shadow 0.35s var(--k-ease);
}
.tier:hover .t-face { transform: translateY(-3px); border-color: color-mix(in srgb, var(--tc) 45%, transparent); box-shadow: 0 14px 30px -14px color-mix(in srgb, var(--tc) 55%, transparent); }
.tier input:focus-visible + .t-face { outline: 2px solid var(--k-bone); outline-offset: 3px; }
.tier input:checked + .t-face {
  border-color: var(--tc);
  background:
    radial-gradient(120% 120% at 20% 0%, color-mix(in srgb, var(--tc) 30%, transparent), transparent 70%),
    rgba(255, 255, 255, 0.06);
  box-shadow: 0 0 0 1px var(--tc), 0 18px 40px -16px color-mix(in srgb, var(--tc) 70%, transparent), inset 0 1px 0 rgba(255,255,255,.12);
  animation: pick 0.5s var(--k-bounce);
}
.t-amt { font-family: var(--ns-display, inherit); font-weight: 800; font-size: 1.5rem; line-height: 1; color: var(--k-bone); }
.tier input:checked + .t-face .t-amt { color: var(--tc); }
.t-name { font-weight: 650; font-size: 0.95rem; }
.t-line { color: var(--k-bone-3); font-size: 0.86rem; line-height: 1.4; }
.t-ico { width: 30px; height: 30px; color: var(--tc); }
.t-ico svg { width: 100%; height: 100%; overflow: visible; }
.t-pick {
  position: absolute; top: -9px; right: 12px;
  padding: 2px 9px; border-radius: 999px;
  background: var(--k-sky); color: var(--k-night);
  font-size: 0.74rem; font-weight: 700;
}
/* each tier's icon has its own little motion when picked or hovered */
.tier:hover .t-spark .i-main, .t-spark input:checked + .t-face .i-main { animation: twinkle 1.6s ease-in-out infinite; transform-origin: 50% 50%; transform-box: fill-box; }
.t-spark input:checked + .t-face .i-dot { animation: blink 1.6s ease-in-out infinite; }
.t-power:hover .t-ico svg, .t-power input:checked + .t-face .t-ico svg { animation: hover 1.2s ease-in-out infinite; }
.t-power .i-flame { opacity: 0; transform-origin: 50% 0; transform-box: fill-box; }
.t-power:hover .i-flame, .t-power input:checked + .t-face .i-flame { opacity: 1; animation: flicker 0.18s steps(2) infinite alternate; }
.t-super .i-shine { opacity: 0; }
.t-super:hover .i-shine, .t-super input:checked + .t-face .i-shine { animation: shine 1.8s ease-in-out infinite; }
.t-custom:hover .t-ico svg, .t-custom input:checked + .t-face .t-ico svg { animation: spin 0.6s var(--k-bounce); }

/* tiles (home): 4 across on wide, 2 x 2 otherwise */
.tiers-tiles { grid-template-columns: repeat(2, minmax(0, 1fr)); }
.tiers-tiles .t-face { grid-template-columns: auto 1fr; grid-template-rows: auto auto; column-gap: 10px; align-items: center; padding: 12px 14px; min-height: 64px; }
.tiers-tiles .t-ico { grid-row: span 2; width: 26px; height: 26px; }
.tiers-tiles .t-amt { font-size: 1.25rem; }
.tiers-tiles .t-name { font-size: 0.82rem; color: var(--k-bone-2); }
@container (min-width: 1040px) { .home .tiers-tiles { grid-template-columns: repeat(4, minmax(0, 1fr)); } }
@container (min-width: 520px) and (max-width: 819px) { .home .tiers-tiles { grid-template-columns: repeat(4, minmax(0, 1fr)); } .home .tiers-tiles .t-face { grid-template-columns: 1fr; text-align: left; } .home .tiers-tiles .t-ico { grid-row: auto; } }

/* cards (/support): roomy, each with its own glow */
.tiers-cards { grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 14px; }
@container (min-width: 760px) { .tiers-cards { grid-template-columns: repeat(4, minmax(0, 1fr)); } }
.tiers-cards .t-face { align-content: start; gap: 6px; padding: 18px 16px 18px; min-height: 172px; }
.tiers-cards .t-ico { width: 38px; height: 38px; margin-bottom: 6px; }
.tiers-cards .t-amt { font-size: 2rem; }
@container (max-width: 420px) { .tiers-cards .t-face { min-height: 150px; padding: 14px 12px; } .tiers-cards .t-amt { font-size: 1.6rem; } .tiers-cards .t-line { font-size: 0.8rem; } }

/* chips (game cards): small and quick */
.tiers-chips { grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 8px; }
.tiers-chips .t-face { place-items: center; padding: 8px 4px; min-height: 44px; border-radius: 12px; }
.tiers-chips .t-amt { font-size: 1.05rem; }

/* custom amount */
.custom { display: grid; gap: 6px; max-width: 280px; animation: rise 0.35s var(--k-ease); }
.custom[hidden] { display: none; }
.custom label { font-size: 0.86rem; color: var(--k-bone-2); }
.custom-in {
  display: flex; align-items: center; gap: 6px;
  border: 1px solid color-mix(in srgb, var(--k-bone) 35%, transparent); border-radius: 12px;
  background: rgba(255,255,255,.06); padding: 0 12px;
  font-family: var(--ns-display, inherit); font-weight: 800; font-size: 1.3rem;
}
.custom-in:focus-within { border-color: var(--k-bone); box-shadow: 0 0 0 3px rgba(242,239,232,.18); }
.custom-in input { all: unset; width: 100%; min-height: 46px; font: inherit; color: var(--k-bone); }
.custom-in input::placeholder { color: var(--k-bone-3); }
.custom-err { min-height: 1.2em; font-size: 0.82rem; color: #ffb3a5; }

/* ------------------------------------------------------------ the button */
.cta-row { position: relative; display: flex; flex-wrap: wrap; align-items: center; gap: 12px 20px; }
.cta {
  position: relative;
  display: inline-flex; align-items: center; justify-content: center; gap: 10px;
  min-height: 52px; padding: 0 26px;
  border-radius: 999px;
  background: linear-gradient(180deg, color-mix(in srgb, var(--k-accent) 88%, #fff) 0%, var(--k-accent) 60%);
  color: var(--k-on-accent);
  font-weight: 750; font-size: 1.05rem; text-decoration: none;
  box-shadow: 0 12px 30px -10px color-mix(in srgb, var(--k-accent) 75%, transparent), inset 0 1px 0 rgba(255,255,255,.35);
  transition: transform 0.25s var(--k-bounce), box-shadow 0.25s, filter 0.2s;
}
.cta:hover { transform: translateY(-2px); box-shadow: 0 18px 36px -12px color-mix(in srgb, var(--k-accent) 85%, transparent), inset 0 1px 0 rgba(255,255,255,.35); }
.cta:active { transform: translateY(1px) scale(0.97); }
.cta .arr { width: 16px; height: 16px; transition: transform 0.25s var(--k-ease); }
.cta:hover .arr { transform: translateX(3px); }
.cta.pop { animation: pop 0.5s var(--k-bounce); }
.cta.big { min-height: 58px; padding: 0 34px; font-size: 1.12rem; }
.cta.small { min-height: 46px; padding: 0 18px; font-size: 0.98rem; width: 100%; }
.more { color: var(--k-bone-2); font-size: 0.95rem; text-underline-offset: 4px; text-decoration-color: rgba(242,239,232,.35); }
.more:hover { color: var(--k-bone); text-decoration-color: var(--k-accent); }

.confetti { position: absolute; left: 0; top: 0; width: 100%; height: 0; pointer-events: none; }
.confetti i { position: absolute; left: var(--l); top: 26px; width: 7px; height: 11px; border-radius: 2px; background: var(--c); animation: confetti 1.3s var(--k-ease) forwards; }

/* ------------------------------------------------------------ scene */
.scene { position: relative; width: 100%; aspect-ratio: 240 / 232; }
.scene-svg { position: relative; width: 100%; height: 100%; overflow: visible; }
.aura { position: absolute; inset: 8% 6% 10%; border-radius: 50%; background: radial-gradient(closest-side, rgba(124, 92, 255, 0.34), rgba(124, 92, 255, 0.08) 60%, transparent); filter: blur(6px); animation: breathe 7s ease-in-out infinite; }
.stars circle { fill: #fff; opacity: 0.55; animation: twinkleStar 4s ease-in-out infinite; animation-delay: var(--d); }
.bubble {
  position: absolute; top: 0; left: 64%;
  padding: 7px 12px; border-radius: 14px 14px 14px 4px;
  background: var(--k-bone); color: var(--k-night);
  font-size: 0.86rem; font-weight: 650; line-height: 1.25; white-space: nowrap;
  box-shadow: 0 10px 24px -10px rgba(0,0,0,.6);
  transform-origin: 0 100%;
}
[data-react] .bubble { animation: bubble 0.45s var(--k-bounce); }
.world-text { display: grid; gap: 4px; text-align: center; }
.w-line { color: var(--k-bone-2); font-size: 0.92rem; text-wrap: balance; }
.w-count { color: var(--k-mint); font-size: 0.86rem; font-weight: 600; }
.w-count[hidden] { display: none; }

/* world stages: each layer shows at its stage and above */
.scene .s1, .scene .s2, .scene .s3, .scene .s4 { display: none; }
.scene[data-stage='1'] .s1,
.scene[data-stage='2'] :is(.s1, .s2),
.scene[data-stage='3'] :is(.s1, .s2, .s3),
.scene[data-stage='4'] :is(.s1, .s2, .s3, .s4) { display: inline; }
.sprout { transform-origin: 120px 167px; animation: sway 4s ease-in-out infinite; }
.window { animation: glowWin 3s ease-in-out infinite; }
.bulbs circle { animation: blink 2.4s ease-in-out infinite; animation-delay: calc(var(--i) * 0.4s); }
.fall { animation: fall 0.8s linear infinite; }
.moon { animation: bob 6s ease-in-out infinite; }
.fw .fw-in { transform-origin: 0 0; animation: firework 3.3s ease-out infinite; animation-delay: var(--d); opacity: 0; }
.flag { transform-origin: 154.5px 120px; animation: flag 1.4s ease-in-out infinite alternate; }

/* ------------------------------------------------------------ Baki */
.ufo { transform-box: view-box; animation: bob 3.4s ease-in-out infinite; }
.beam { animation: beam 3.4s ease-in-out infinite; transform-origin: 60px 64px; }
.craft { transform-origin: 60px 45px; }
.lights circle { fill: #ffe3a3; animation: blink 1.8s ease-in-out infinite; animation-delay: calc(var(--i) * 0.25s); }
.antenna { animation: blink 2.2s ease-in-out infinite; }
.eyes-n { transform-origin: 60px 34px; animation: blinkEyes 5s infinite; }
.eyes-h, .eyes-s, .m-o, .flames, .hearts, .sparks { opacity: 0; }
.flames path { fill: #ffb35c; transform-origin: 50% 0; transform-box: fill-box; }
.sparks path { fill: var(--k-peach); }
.hearts path { fill: #ff9eb0; }
[data-mood='spark'] .eyes-n { opacity: 0; }
[data-mood='spark'] :is(.eyes-h, .sparks) { opacity: 1; }
[data-mood='spark'] .sparks path { animation: twinkle 1.4s ease-in-out infinite; transform-box: fill-box; transform-origin: center; }
[data-mood='spark'][data-react] .craft { animation: hop 0.6s var(--k-bounce); }
[data-mood='power'] .flames { opacity: 1; }
[data-mood='power'] .flames path { animation: flicker 0.16s steps(2) infinite alternate; }
[data-mood='power'] .m-smile { opacity: 0; }
[data-mood='power'] .m-o { opacity: 1; }
[data-mood='power'][data-react] .craft { animation: boost 0.9s var(--k-ease); }
[data-mood='super'] .eyes-n { opacity: 0; }
[data-mood='super'] .eyes-s { opacity: 1; }
[data-mood='super'] .eyes-s path { animation: twinkle 1.2s ease-in-out infinite; transform-box: fill-box; transform-origin: center; }
[data-mood='super'] .sparks { opacity: 1; }
[data-mood='super'] .sparks path { fill: var(--k-lav); animation: twinkle 1s ease-in-out infinite; transform-box: fill-box; transform-origin: center; }
[data-mood='super'][data-react] .craft { animation: loop 1s var(--k-ease); }
[data-mood='custom'] .craft { transform: rotate(-8deg); transition: transform 0.4s var(--k-bounce); }
[data-mood='custom'][data-react] .craft { animation: tilt 0.7s var(--k-bounce); }
[data-mood='thanks'] .eyes-n { opacity: 0; }
[data-mood='thanks'] .eyes-h { opacity: 1; }
[data-mood='thanks'] .hearts { opacity: 1; }
[data-mood='thanks'] .hearts path { animation: heartUp 1.8s var(--k-ease) infinite; transform-box: fill-box; transform-origin: center; }
[data-mood='thanks'] .hearts g:nth-child(2) path { animation-delay: 0.3s; }
[data-mood='thanks'] .hearts g:nth-child(3) path { animation-delay: 0.6s; }
[data-mood='thanks'][data-react] .craft { animation: hop 0.6s var(--k-bounce); }
[data-react] .aura { animation: aura 0.8s var(--k-ease); }

/* particles from the beam on each pick */
.fx { position: absolute; left: 50%; top: 52%; width: 0; height: 0; pointer-events: none; }
.fx i { position: absolute; width: 7px; height: 7px; margin: -3.5px; border-radius: 50%; background: var(--c); box-shadow: 0 0 10px var(--c); animation: burst 1s var(--k-ease) forwards; }
.fx i.star { border-radius: 1px; clip-path: polygon(50% 0, 62% 38%, 100% 50%, 62% 62%, 50% 100%, 38% 62%, 0 50%, 38% 38%); width: 11px; height: 11px; margin: -5.5px; box-shadow: none; }

/* ------------------------------------------------------------ home */
.home { display: grid; gap: 28px; padding: clamp(22px, 4.5cqi, 48px); align-items: center; }
.home .copy { display: grid; gap: 18px; align-content: center; }
.home .art-col { display: grid; gap: 6px; justify-items: center; }
.home .scene { max-width: 380px; }
@container (min-width: 820px) {
  .home { grid-template-columns: minmax(0, 1.2fr) minmax(0, 0.8fr); gap: 40px; }
  .home .art-col { order: 2; }
}
@container (max-width: 819px) {
  .home .art-col { order: -1; }
  .home .scene { max-width: 260px; margin-bottom: -6px; }
}
@container (max-width: 519px) {
  .home { gap: 16px; }
  .home .copy { gap: 14px; }
  .home .scene { max-width: 200px; }
  .home .w-line { font-size: 0.84rem; }
  .home .lead { font-size: 1rem; }
  .home .cta { flex: 1 1 100%; }
  .home .cta-row { justify-content: center; }
}

/* ------------------------------------------------------------ page */
.page { display: grid; gap: 28px; }
.page .hero { position: relative; isolation: isolate; display: grid; gap: 12px; align-items: center; padding: 8px 0; }
.page .hero .copy { display: grid; gap: 16px; }
.page .hero .title { font-size: clamp(3rem, 10cqi, 6rem); }
.page .art-col { justify-self: center; width: 100%; max-width: 460px; }
@container (min-width: 860px) { .page .hero { grid-template-columns: minmax(0, 1fr) minmax(0, 0.9fr); gap: 40px; } }
@container (max-width: 859px) { .page .art-col { max-width: 320px; order: -1; } }
.pick { display: grid; gap: 18px; padding: clamp(20px, 4cqi, 40px); }
.pick .tiers { margin-top: 6px; }
.growth { display: grid; gap: 14px; padding: clamp(20px, 4cqi, 36px); border: 1px solid var(--k-line); border-radius: var(--k-radius); background: rgba(255,255,255,.025); }
.growth .world-text { text-align: left; }
.miles { list-style: none; display: grid; grid-template-columns: repeat(5, minmax(0, 1fr)); gap: 6px; counter-reset: m; }
.miles li { position: relative; display: grid; gap: 8px; justify-items: start; color: var(--k-bone-3); font-size: 0.86rem; line-height: 1.3; }
.miles li::before { content: ''; position: absolute; left: 14px; right: -6px; top: 6px; height: 2px; background: var(--k-line); }
.miles li:last-child::before { display: none; }
.mi-dot { position: relative; width: 14px; height: 14px; border-radius: 50%; border: 2px solid rgba(242,239,232,.3); background: var(--k-night); }
.miles li.done { color: var(--k-bone-2); }
.miles li.done .mi-dot { border-color: var(--k-mint); background: var(--k-mint); }
.miles li.now { color: var(--k-bone); font-weight: 650; }
.miles li.now .mi-dot { box-shadow: 0 0 0 5px rgba(159, 240, 200, 0.18); animation: ping 2.4s ease-out infinite; }
@container (max-width: 560px) {
  .miles { grid-template-columns: 1fr; gap: 10px; }
  .miles li { grid-template-columns: 14px 1fr; align-items: center; gap: 12px; }
  .miles li::before { left: 6px; right: auto; top: 16px; bottom: -14px; width: 2px; height: auto; }
}
.fine { color: var(--k-bone-3); font-size: 0.84rem; }

/* ------------------------------------------------------------ game cards */
.menu, .results { display: grid; grid-template-columns: 84px minmax(0, 1fr); gap: 14px; padding: 16px; max-width: 440px; border-radius: 18px; }
.results { max-width: 560px; }
.m-art { position: relative; align-self: start; width: 84px; aspect-ratio: 1; display: grid; place-items: center; border-radius: 16px; background: radial-gradient(circle at 50% 60%, rgba(124,92,255,.35), rgba(124,92,255,.06) 70%); }
.m-art .aura { inset: 0; }
.m-art .mascot-svg { position: relative; width: 92%; overflow: visible; }
.m-art .fx { top: 50%; }
.m-body { display: grid; gap: 9px; min-width: 0; }
.m-title { font-family: var(--ns-display, inherit); font-weight: 800; font-size: 1.15rem; line-height: 1.1; }
.m-text { color: var(--k-bone-2); font-size: 0.9rem; line-height: 1.4; }
.menu .note, .results .note { font-size: 0.78rem; }
@container (max-width: 330px) {
  .menu:not(.neutral), .results:not(.neutral) { grid-template-columns: 1fr; }
  :not(.neutral) > .m-art { width: 64px; position: absolute; right: 10px; top: 8px; background: none; }
  .m-title, .m-text { padding-right: 64px; }
  .neutral .m-title { padding-right: 0; }
}
@container (min-width: 520px) {
  .results { grid-template-columns: 96px minmax(0, 1fr); padding: 18px 20px; }
  .results .m-art { width: 96px; }
}
.menu.neutral, .results.neutral { grid-template-columns: 56px 1fr; align-items: center; }
.neutral .m-art { width: 56px; }

/* pause line */
.pause {
  display: inline-flex; align-items: center; gap: 10px;
  min-height: 44px; padding: 4px 16px 4px 6px;
  border: 1px solid rgba(195, 168, 255, 0.35); border-radius: 999px;
  background: linear-gradient(120deg, rgba(43, 33, 96, 0.85), rgba(20, 26, 61, 0.85));
  color: var(--k-bone-2); font-size: 0.92rem; text-decoration: none;
  transition: border-color 0.2s, transform 0.25s var(--k-bounce), background 0.2s;
}
a.pause:hover { border-color: var(--k-lav); transform: translateY(-2px); color: var(--k-bone); }
.pause b { color: var(--k-bone); font-weight: 700; }
.p-art { width: 38px; height: 34px; display: grid; place-items: center; }
.p-art .mascot-svg { width: 38px; overflow: visible; }
.pause .arr { width: 14px; height: 14px; color: var(--k-lav); transition: transform 0.2s; }
a.pause:hover .arr { transform: translateX(3px); }
.pause.neutral { padding-right: 16px; border-style: dashed; }

/* ------------------------------------------------------------ motion */
@keyframes bob { 0%, 100% { transform: translateY(0); } 50% { transform: translateY(-5px); } }
@keyframes beam { 0%, 100% { opacity: 0.85; transform: scaleX(1); } 50% { opacity: 0.6; transform: scaleX(0.92); } }
@keyframes blink { 0%, 100% { opacity: 1; } 50% { opacity: 0.35; } }
@keyframes blinkEyes { 0%, 92%, 100% { transform: scaleY(1); } 95% { transform: scaleY(0.1); } }
@keyframes twinkle { 0%, 100% { transform: scale(1) rotate(0); } 50% { transform: scale(0.75) rotate(20deg); } }
@keyframes twinkleStar { 0%, 100% { opacity: 0.6; } 50% { opacity: 0.15; } }
@keyframes flicker { from { transform: scaleY(1); } to { transform: scaleY(0.7); } }
@keyframes hover { 0%, 100% { transform: translateY(0); } 50% { transform: translateY(-3px); } }
@keyframes shine { 0%, 100% { opacity: 0; } 40%, 60% { opacity: 0.8; } }
@keyframes spin { from { transform: rotate(-90deg) scale(0.8); } to { transform: rotate(0) scale(1); } }
@keyframes pick { 0% { transform: scale(0.96); } 60% { transform: scale(1.03); } 100% { transform: scale(1); } }
@keyframes rise { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: none; } }
@keyframes pop { 0% { transform: scale(1); } 40% { transform: scale(0.94); } 70% { transform: scale(1.05); } 100% { transform: scale(1); } }
@keyframes confetti { 0% { transform: translate(0, 0) rotate(0); opacity: 1; } 100% { transform: translate(var(--x), var(--y)) rotate(var(--r)); opacity: 0; } }
@keyframes burst { 0% { transform: translate(0, 0) scale(0.4) rotate(0); opacity: 1; } 100% { transform: translate(var(--x), var(--y)) scale(var(--s)) rotate(var(--r)); opacity: 0; } }
@keyframes bubble { 0% { transform: scale(0.6); opacity: 0; } 100% { transform: scale(1); opacity: 1; } }
@keyframes breathe { 0%, 100% { opacity: 0.85; transform: scale(1); } 50% { opacity: 1; transform: scale(1.04); } }
@keyframes aura { 0% { transform: scale(1); } 40% { transform: scale(1.12); opacity: 1; } 100% { transform: scale(1); } }
@keyframes hop { 0% { transform: translateY(0); } 35% { transform: translateY(-12px) scale(1.04, 0.97); } 70% { transform: translateY(2px) scale(0.98, 1.03); } 100% { transform: translateY(0); } }
@keyframes boost { 0% { transform: translateY(0); } 30% { transform: translateY(6px) scale(1.04, 0.95); } 65% { transform: translateY(-18px); } 100% { transform: translateY(0); } }
@keyframes loop { 0% { transform: rotate(0) translateY(0); } 50% { transform: rotate(180deg) translateY(-14px); } 100% { transform: rotate(360deg) translateY(0); } }
@keyframes tilt { 0% { transform: rotate(0); } 40% { transform: rotate(-14deg); } 100% { transform: rotate(-8deg); } }
@keyframes heartUp { 0% { transform: translateY(6px) scale(0.6); opacity: 0; } 30% { opacity: 1; } 100% { transform: translateY(-14px) scale(1.1); opacity: 0; } }
@keyframes sway { 0%, 100% { transform: rotate(-4deg); } 50% { transform: rotate(4deg); } }
@keyframes glowWin { 0%, 100% { opacity: 1; } 50% { opacity: 0.7; } }
@keyframes fall { to { stroke-dashoffset: -9; } }
@keyframes firework { 0% { transform: scale(0.2); opacity: 0; } 8% { opacity: 1; } 30% { transform: scale(1.2); opacity: 0; } 100% { opacity: 0; } }
@keyframes flag { from { transform: skewY(-4deg); } to { transform: skewY(4deg); } }
@keyframes ping { 0% { box-shadow: 0 0 0 0 rgba(159, 240, 200, 0.45); } 100% { box-shadow: 0 0 0 10px rgba(159, 240, 200, 0); } }
@keyframes drift { from { transform: translate3d(0, 0, 0); } to { transform: translate3d(-6%, -4%, 0); } }

@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after { animation: none !important; transition: none !important; }
  .fw .fw-in { opacity: 1; transform: scale(1); }
}
`;
