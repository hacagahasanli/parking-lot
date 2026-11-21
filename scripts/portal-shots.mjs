/**
 * Portal capture tooling (not part of the game). Needs playwright-core and its Chromium: install them in a scratch folder
 * (npm i playwright-core@1.65.0) and run from there. Start `npm run dev:portal` first (port 3201); load.mjs needs serve.mjs.
 */
import { chromium, devices } from 'playwright-core';
const exe = process.env.HOME + '/Library/Caches/ms-playwright/chromium-1255/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing';
const OUT = process.argv[2];
const base = 'http://localhost:3201/?testBreaks';
const b = await chromium.launch({ executablePath: exe, args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'] });

const run = async (name, ctxOpts) => {
  const ctx = await b.newContext(ctxOpts);
  const p = await ctx.newPage();
  const errs = [];
  p.on('pageerror', (e) => errs.push(e.message));
  p.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); if (/HTML5 SDK/.test(m.text()) && /gameplay|loading|ad/i.test(m.text())) errs.push('SDK ' + m.text().replace(/%c|background-color[^;]*;|border-radius[^;]*;|padding[^;]*;|color:[^;]*;?/g, '').slice(0, 120)); });
  await p.goto(base);
  await p.waitForFunction(() => !!window.__game, null, { timeout: 20000 });
  await p.waitForTimeout(1500);
  await p.screenshot({ path: `${OUT}/${name}-1-onboarding.png` });
  // Drive: after GO, hold gas a moment and steer.
  await p.waitForTimeout(4200);
  const tap = ctxOpts.hasTouch;
  if (!tap) {
    await p.keyboard.down('KeyW');
    await p.waitForTimeout(1800);
    await p.keyboard.down('KeyD');
    await p.waitForTimeout(500);
    await p.keyboard.up('KeyD');
    await p.waitForTimeout(800);
    await p.keyboard.up('KeyW');
  } else {
    await p.evaluate(() => window.__game.setTouch({ throttle: 1, steer: 0 }));
    await p.waitForTimeout(2300);
    await p.evaluate(() => window.__game.setTouch({ throttle: 1, steer: 1 }));
    await p.waitForTimeout(500);
    await p.evaluate(() => window.__game.setTouch(null));
  }
  await p.waitForTimeout(600);
  await p.screenshot({ path: `${OUT}/${name}-2-gameplay.png` });
  // Round end: put the car in the free bay, still and straight; the hold ring fills and it parks first.
  await p.evaluate(() => {
    const g = window.__game, s = g.state, bay = g.world.lot.bays[s.target], c = s.cars[0];
    Object.assign(c, { x: bay.x + Math.sin(bay.h) * 0.1, z: bay.z + Math.cos(bay.h) * 0.1, h: bay.h, vx: 0, vz: 0, w: 0, steer: 0 });
  });
  await p.waitForSelector('[role="dialog"][aria-label="Result"]', { timeout: 15000 });
  await p.waitForTimeout(700);
  await p.screenshot({ path: `${OUT}/${name}-3-round-end.png` });
  // Leave the result card: straight into the next round, no midgame ad.
  const btn = p.getByRole('button', { name: /Next stage|Retry/ }).first();
  await btn.click();
  if (await p.locator('[aria-label="Ad break"]').count()) errs.push('an ad break came up between rounds');
  await p.waitForTimeout(1500);
  await p.screenshot({ path: `${OUT}/${name}-5-next-round.png` });
  // A loss: touch the car beside you, then the result card offers the hint.
  await p.waitForTimeout(5000);
  await p.evaluate(() => {
    const g = window.__game, s = g.state, me = s.cars[0], o = s.cars[1];
    Object.assign(me, { x: o.x - Math.sin(o.h) * 4.6, z: o.z - Math.cos(o.h) * 4.6, h: o.h, vx: Math.sin(o.h) * 4, vz: Math.cos(o.h) * 4 });
  });
  await p.waitForSelector('[role="dialog"][aria-label="Result"]', { timeout: 15000 });
  await p.waitForTimeout(700);
  await p.screenshot({ path: `${OUT}/${name}-6-loss-hint-offer.png` });
  const hintBtn = p.getByRole('button', { name: /hint/i });
  if (await hintBtn.count()) {
    await hintBtn.click();
    await p.waitForFunction(() => !document.querySelector('[aria-label="Ad break"]'), null, { timeout: 60000 }).catch(() => errs.push('rewarded cover never went away'));
    await p.waitForTimeout(1500);
    await p.screenshot({ path: `${OUT}/${name}-7-hint-round.png` });
  } else errs.push('no hint offer');
  // Pause menu (graphics setting, credit).
  if (!tap) await p.keyboard.press('KeyP');
  else await p.getByRole('button', { name: 'Pause' }).click();
  await p.waitForTimeout(500);
  await p.screenshot({ path: `${OUT}/${name}-8-pause.png` });
  console.log(name, '\n  ' + errs.join('\n  '));
  await ctx.close();
};

await run('desktop', { viewport: { width: 1280, height: 720 } });
await run('mobile', { ...devices['Pixel 7 landscape'] });
await b.close();
