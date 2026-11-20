/**
 * Portal capture tooling (not part of the game). Needs playwright-core and its Chromium: install them in a scratch folder
 * (npm i playwright-core@1.65.0) and run from there. Start `npm run dev:portal` first (port 3201); load.mjs needs serve.mjs.
 */
import { chromium } from 'playwright-core';
const exe = process.env.HOME + '/Library/Caches/ms-playwright/chromium-1255/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing';
const OUT = process.argv[2];
const only = process.argv[3];
const b = await chromium.launch({ executablePath: exe, args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'] });
const SIZES = { landscape: [1920, 1080], portrait: [800, 1200], square: [800, 800] };
const BAY = Number(process.env.BAY ?? 47);
// Camera relative to the bay: D metres out over the aisle, S to the side, H up; look L metres out from the bay centre.
const VARIANTS = {
  A: { landscape: { D: 15, S: 6, H: 10, L: -1.5, fov: 46 }, portrait: { D: 15, S: 4, H: 15, L: -5, fov: 58 }, square: { D: 15, S: 5, H: 12, L: -3.5, fov: 52 } },
  B: { landscape: { D: 7, S: 0, H: 26, L: 3.2, fov: 42 }, portrait: { D: 5, S: 0, H: 30, L: 1.5, fov: 52 }, square: { D: 6, S: 0, H: 27, L: 2.4, fov: 48 } },
  C: { landscape: { D: 14, S: -4, H: 5, L: -3, fov: 46 }, portrait: { D: 14, S: -3, H: 8, L: -7, fov: 60 }, square: { D: 14, S: -3.5, H: 6.5, L: -5, fov: 54 } },
};
// Title layout per aspect: where it sits and how big.
const TITLE = {
  landscape: { top: '5%', left: '0', right: '0', size: 190, lines: ['PARKING LOT'] },
  portrait: { top: '4%', left: '0', right: '0', size: 150, lines: ['PARKING', 'LOT'] },
  square: { top: '5%', left: '0', right: '0', size: 92, lines: ['PARKING LOT'] },
};

for (const [vname, shots] of Object.entries(VARIANTS)) {
  if (only && only !== vname) continue;
  for (const [aspect, [W, H]] of Object.entries(SIZES)) {
    const scale = aspect === 'landscape' ? 1 : 2;
    const ctx = await b.newContext({ viewport: { width: W / scale, height: H / scale }, deviceScaleFactor: scale });
    const p = await ctx.newPage();
    await p.goto('http://localhost:3201/');
    await p.waitForFunction(() => !!window.__game);
    await p.waitForTimeout(800);
    const cam = shots[aspect];
    const ok = await p.evaluate(({ BAY, cam }) => {
      const g = window.__game;
      g.setTier('high');
      for (let i = 0; i < 120 && g.state.target !== BAY; i++) g.newRound();
      if (g.state.target !== BAY) return false;
      const s = g.state;
      const bay = g.world.lot.bays[BAY];
      const T = bay.approach[0].tail;
      const unit = (x, z) => { const l = Math.hypot(x, z); return [x / l, z / l]; };
      const head = (dx, dz) => Math.atan2(dx, dz);
      // Along the aisle: the start of a long approach, or (an angled bay's short one) the x-direction it comes in on.
      const [ax, az] = T.length >= 5 ? unit(T[1].x - T[0].x, T[1].z - T[0].z) : [Math.sign(T[1].x - T[0].x), 0];
      const [mx, mz] = unit(T[0].x - bay.x, T[0].z - bay.z);
      s.t = 6; s.phase = 'race'; s.gate.open = 1;
      const place = (c, x, z, h, steer = 0) => Object.assign(c, { x, z, h, vx: 0, vz: 0, w: 0, steer, y: 0 });
      const [me, blue, white, grey] = s.cars;
      const k = Math.max(0, T.length - 4);
      const rx = T.length >= 5 ? T[k].x : (T[0].x + T[1].x) / 2, rz = T.length >= 5 ? T[k].z : (T[0].z + T[1].z) / 2;
      const last = T[T.length - 1];
      place(me, rx, rz, head(last.x - rx, last.z - rz), 0.1);
      place(blue, T[0].x - ax * 1.2 + mx * 1.2, T[0].z - az * 1.2 + mz * 1.2, head(ax, az) - 0.45, -0.5);
      place(white, T[0].x + ax * 8 + mx * 0.6, T[0].z + az * 8 + mz * 0.6, head(-ax, -az) + 0.35, 0.5);
      place(grey, T[0].x - ax * 6.5, T[0].z - az * 6.5, head(ax, az), 0);
      if (s.leaver) place(s.leaver.car, -200, -200, 0);
      s.peds = [];
      const px = -mz, pz = mx;
      const eye = [bay.x + mx * cam.D + px * cam.S, cam.H, bay.z + mz * cam.D + pz * cam.S];
      const look = [bay.x + mx * cam.L, 0.3, bay.z + mz * cam.L];
      g.setShot({ eye, look, fov: cam.fov, bay: BAY });
      g.setFrozen(true);
      return true;
    }, { BAY, cam });
    if (!ok) { console.log('bay not found'); await ctx.close(); continue; }
    await p.waitForTimeout(900);
    const t = TITLE[aspect];
    await p.evaluate(({ t }) => {
      const st = document.createElement('style');
      st.textContent = `main > :not(canvas){display:none!important}
      #cover-title{position:fixed;z-index:99;text-align:center;font-family:Bungee,sans-serif;line-height:.92;color:#ffd23f;
        -webkit-text-stroke:${Math.round(t.size / 16)}px #0a0d18;paint-order:stroke fill;
        text-shadow:0 ${Math.round(t.size / 14)}px 0 #0a0d18, 0 ${Math.round(t.size / 8)}px ${Math.round(t.size / 4)}px rgba(0,0,0,.55);letter-spacing:.01em}`;
      document.head.appendChild(st);
      const d = document.createElement('div');
      d.id = 'cover-title';
      Object.assign(d.style, { top: t.top, left: t.left, right: t.right, fontSize: t.size / (window.devicePixelRatio === 2 ? 2 : 1) + 'px' });
      d.innerHTML = t.lines.join('<br>');
      document.body.appendChild(d);
    }, { t });
    await p.waitForTimeout(300);
    await p.screenshot({ path: `${OUT}/cover-${vname}-${aspect}-${W}x${H}.png` });
    await ctx.close();
  }
}
await b.close();
