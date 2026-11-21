/**
 * Every sound is synthesised with the Web Audio API, no files: engines (a rounded harmonic stack at
 * the firing frequency, soft-clipped and low-passed, with intake, exhaust and idle burble layers), tyre squeal (filtered noise),
 * crashes, horns, car alarms, countdown beeps and the car park's background hum.
 *
 * Sounds in the world go through a PannerNode, so a horn on your left is on your left and a
 * crash far away is quiet.
 *
 * The mix (docs/SOUND.md): voices -> engine / world / cue / ambience buses -> the player's sliders -> master -> compressor ->
 * limiter. Every one-shot asks the budget gate first (audioBudget.ts: cooldown and voice cap per sound). Behind the menu
 * only the world (quieter) and the ambience play; race cues (countdown, ticks, jingles, gearbox) are race-only.
 */
import { BUDGET, MIX, createGate } from './audioBudget';

import type { SoundName } from './audioBudget';

export type VolumeKind = 'master' | 'engine' | 'effects';
export type Scene = 'menu' | 'race' | 'paused';
const KEY = 'parking-lot:volume';

export interface EngineVoice {
  set: (rpm: number, load: number, slip: number, x: number, z: number, horn: boolean) => void;
  stop: () => void;
}

export interface Sfx {
  unlock: () => void;
  listener: (x: number, y: number, z: number, fx: number, fz: number) => void;
  engine: () => EngineVoice;
  bump: (speed: number, x: number, z: number, metal: boolean) => void;
  alarm: (x: number, z: number, seconds: number) => void;
  /** A shopper's shout and a long blast of the horn: someone was hit. */
  shout: (x: number, z: number) => void;
  /** A short toot of a horn (the radio's bots, a car pulling out). */
  toot: (x: number, z: number) => void;
  beep: (high: boolean) => void;
  win: () => void;
  lose: () => void;
  /** The free bay lit up near you: a bright two-note sparkle. */
  found: () => void;
  /** A rival has spotted the bay: a short low sting. */
  sting: () => void;
  /** A car went past close at speed: a filtered-noise whoosh. */
  whoosh: () => void;
  /** The last seconds of the round: a tick (high on the final three). */
  tick: (high: boolean) => void;
  click: () => void;
  /** Manual gearbox: a short mechanical clack into the next gear (up: a touch brighter), and the grind of a refused shift. */
  shift: (up: boolean) => void;
  grind: () => void;
  /** Menu sounds: -1 back, 0 focus moved, 1 picked. */
  ui: (kind: -1 | 0 | 1) => void;
  /** What is on screen: the menu (world quieter, no race cues), the race, or the race paused (engines down). */
  setScene: (scene: Scene) => void;
  /** Dev meter: plays and drops per sound (the budget gate), voices sounding now (engines and one-shots), and the output's peak over the last ~40 ms (dev builds). */
  meter: () => { stats: Record<string, { played: number; dropped: number }>; voices: number; peak: number };
  volumes: Record<VolumeKind, number>;
  setVolume: (k: VolumeKind, v: number) => void;
  /** Silence everything for a reason ('ad' while a video ad plays, 'portal' when the portal's mute is on), on top of the volumes. */
  setMuted: (reason: string, on: boolean) => void;
  dispose: () => void;
}

const loadVolumes = (): Record<VolumeKind, number> => {
  const base = { master: 0.8, engine: 0.7, effects: 0.8 };
  try {
    return { ...base, ...JSON.parse(localStorage.getItem(KEY) ?? '{}') };
  } catch {
    return base;
  }
};

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));

export const createSfx = (): Sfx => {
  const volumes = loadVolumes();
  let ctx: AudioContext | null = null;
  let master: GainNode;
  let engineBus: GainNode;
  let fxBus: GainNode;
  /** Scene and duck trims under the sliders: engines; the world's one-shots; race cues and menu sounds; the bed and birds. */
  let engineTrim: GainNode;
  let worldBus: GainNode;
  let cueBus: GainNode;
  let ambBus: GainNode;
  let meterNode: AnalyserNode | null = null;
  let noise: AudioBuffer;
  let scene: Scene = 'menu';
  const gate = createGate(BUDGET);
  const voices = new Set<{ stop: () => void }>();
  const muted = new Set<string>();
  const masterLevel = () => (muted.size ? 0 : volumes.master);
  const ms = () => (ctx ? ctx.currentTime * 1000 : 0);
  /** Over budget (or audio not running yet): the sound is dropped. One-shots wait for the first tap or key, since before it the browser keeps audio suspended and they would only queue up. */
  const may = (name: SoundName) => !!ctx && ctx.state === 'running' && gate.allow(name, ms());
  /** Race cues are for the race only: the menu's bot rounds count down and finish in silence. */
  const cue = (name: SoundName) => scene !== 'menu' && may(name);
  /** A little variation so ten in a row do not sound identical. */
  const vary = (v: number, k = 0.1) => v * (1 + (Math.random() * 2 - 1) * k);

  const init = () => {
    if (ctx) return ctx;
    ctx = new AudioContext();
    master = ctx.createGain();
    master.gain.value = masterLevel();
    // A gentle compressor keeps four engines and a crash from clipping; a fast limiter after it catches what is left.
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -18;
    comp.knee.value = 14;
    comp.ratio.value = 5;
    comp.attack.value = 0.004;
    comp.release.value = 0.22;
    const limit = ctx.createDynamicsCompressor();
    limit.threshold.value = -3;
    limit.knee.value = 0;
    limit.ratio.value = 20;
    limit.attack.value = 0.001;
    limit.release.value = 0.1;
    master.connect(comp).connect(limit).connect(ctx.destination);
    if (process.env.NODE_ENV !== 'production') {
      meterNode = ctx.createAnalyser();
      meterNode.fftSize = 2048;
      limit.connect(meterNode);
    }
    engineBus = ctx.createGain();
    engineBus.gain.value = volumes.engine;
    engineBus.connect(master);
    engineTrim = ctx.createGain();
    engineTrim.gain.value = MIX.engine;
    engineTrim.connect(engineBus);
    fxBus = ctx.createGain();
    fxBus.gain.value = volumes.effects;
    fxBus.connect(master);
    const bus = (level: number) => {
      const g = ctx!.createGain();
      g.gain.value = level;
      g.connect(fxBus);
      return g;
    };
    worldBus = bus(scene === 'menu' ? MIX.world * MIX.menuWorld : MIX.world);
    cueBus = bus(MIX.cue);
    ambBus = bus(MIX.ambience);
    noise = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const d = noise.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    ambience();
    return ctx;
  };

  const panner = (x: number, z: number, rolloff = 1.1, ref = 6) => {
    const p = ctx!.createPanner();
    p.panningModel = 'equalpower';
    p.distanceModel = 'inverse';
    p.refDistance = ref;
    p.rolloffFactor = rolloff;
    p.positionX.value = x;
    p.positionY.value = 0.6;
    p.positionZ.value = z;
    return p;
  };

  const noiseSource = () => {
    const s = ctx!.createBufferSource();
    s.buffer = noise;
    s.loop = true;
    s.loopStart = Math.random();
    return s;
  };

  /**
   * Distant traffic and the hum of the store's air handlers: about -60 dBFS, two low-pass poles at 170 Hz so it is a
   * rumble under everything and never a hiss, breathing slowly so it is not a constant tone.
   */
  const ambience = () => {
    const c = ctx!;
    const n = noiseSource();
    const lp = c.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 170;
    lp.Q.value = 0.5;
    const lp2 = c.createBiquadFilter();
    lp2.type = 'lowpass';
    lp2.frequency.value = 170;
    lp2.Q.value = 0.5;
    const g = c.createGain();
    g.gain.value = MIX.bed;
    const breathe = c.createOscillator();
    breathe.frequency.value = 0.07;
    const depth = c.createGain();
    depth.gain.value = MIX.bed * 0.35;
    breathe.connect(depth).connect(g.gain);
    n.connect(lp).connect(lp2).connect(g).connect(ambBus);
    n.start();
    breathe.start();
    // Now and then a bird.
    const chirp = () => {
      if (!ctx) return;
      const t = c.currentTime;
      const o = c.createOscillator();
      const gg = c.createGain();
      o.type = 'sine';
      const f = 2600 + Math.random() * 1400;
      for (let k = 0; k < 3; k++) {
        o.frequency.setValueAtTime(f, t + k * 0.12);
        o.frequency.exponentialRampToValueAtTime(f * 1.4, t + k * 0.12 + 0.07);
      }
      gg.gain.setValueAtTime(0, t);
      for (let k = 0; k < 3; k++) {
        gg.gain.linearRampToValueAtTime(0.012, t + k * 0.12 + 0.01);
        gg.gain.linearRampToValueAtTime(0, t + k * 0.12 + 0.08);
      }
      const p = panner((Math.random() - 0.5) * 80, (Math.random() - 0.5) * 60);
      o.connect(gg).connect(p).connect(ambBus);
      o.start(t);
      o.stop(t + 0.5);
      setTimeout(chirp, 9000 + Math.random() * 14000);
    };
    setTimeout(chirp, 6000);
  };

  /** A soft clip: adds a little warmth to the engine without the fizz of a hard waveshaper. */
  const curve = (() => {
    const n = 1024;
    const c = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const x = (i / (n - 1)) * 2 - 1;
      c[i] = Math.tanh(x * 1.3) / Math.tanh(1.3);
    }
    return c;
  })();

  /**
   * A periodic wave from a harmonic recipe: amplitude falls off as n^-rolloff, with fixed odd
   * phases so the peaks do not stack into a buzzy saw. `even` lifts the even harmonics.
   */
  const waves = new Map<string, PeriodicWave>();
  const wave = (key: string, harmonics: number, rolloff: number, even = 1, odd = 1) => {
    const hit = waves.get(key);
    if (hit) return hit;
    const real = new Float32Array(harmonics + 1);
    const imag = new Float32Array(harmonics + 1);
    for (let n = 1; n <= harmonics; n++) {
      const a = n ** -rolloff * (n % 2 === 0 ? even : odd);
      const ph = n * 0.9 + n * n * 0.17;
      real[n] = a * Math.cos(ph);
      imag[n] = a * Math.sin(ph);
    }
    const w = ctx!.createPeriodicWave(real, imag);
    waves.set(key, w);
    return w;
  };

  const engine = (): EngineVoice => {
    const c = init();
    // A four-cylinder fires twice a revolution, so the oscillator runs at the firing frequency.
    // The wave is a rounded harmonic stack (strong 2nd and 4th), not a sawtooth.
    const w = wave('engine', 16, 1.9, 1.3);
    const o1 = c.createOscillator();
    o1.setPeriodicWave(w);
    const o2 = c.createOscillator();
    o2.setPeriodicWave(w);
    const o2g = c.createGain();
    o2g.gain.value = 0.4;
    const sub = c.createOscillator(); // crank order: half the firing rate, the "lope" at idle
    sub.type = 'sine';
    const subG = c.createGain();
    subG.gain.value = 0.4;
    const mix = c.createGain();
    mix.gain.value = 0.36;
    const shaper = c.createWaveShaper();
    shaper.curve = curve;
    const lp = c.createBiquadFilter();
    lp.type = 'lowpass';
    lp.Q.value = 0.6;
    const body = c.createBiquadFilter(); // the engine bay's boom
    body.type = 'peaking';
    body.frequency.value = 150;
    body.Q.value = 0.9;
    body.gain.value = 4;
    const dip = c.createGain(); // lifts off the throttle between gears
    dip.gain.value = 1;
    const g = c.createGain();
    g.gain.value = 0;
    const p = panner(0, 0, 1.7, 4); // other cars fade out quickly with distance
    o1.connect(mix);
    o2.connect(o2g).connect(mix);
    sub.connect(subG).connect(mix);
    mix.connect(shaper).connect(lp).connect(body).connect(dip).connect(g).connect(p).connect(engineTrim);

    // Slow, uneven wobble in pitch and level: the idle burble. It fades out as the revs rise.
    const wobA = c.createOscillator();
    wobA.frequency.value = 2.3;
    const wobB = c.createOscillator();
    wobB.frequency.value = 3.7 + Math.random() * 0.6;
    const wobPitch = c.createGain();
    wobPitch.gain.value = 0;
    const wobAmp = c.createGain();
    wobAmp.gain.value = 0;
    wobA.connect(wobPitch);
    wobB.connect(wobPitch);
    wobPitch.connect(o1.detune);
    wobPitch.connect(o2.detune);
    wobA.connect(wobAmp);
    wobB.connect(wobAmp);
    wobAmp.connect(g.gain);

    // Intake: breathy band of noise that opens with the throttle.
    const intake = noiseSource();
    const intakeBp = c.createBiquadFilter();
    intakeBp.type = 'bandpass';
    intakeBp.frequency.value = 600;
    intakeBp.Q.value = 0.7;
    const intakeG = c.createGain();
    intakeG.gain.value = 0;
    const intakeLp = c.createBiquadFilter();
    intakeLp.type = 'lowpass';
    intakeLp.frequency.value = 1800;
    intake.connect(intakeBp).connect(intakeLp).connect(intakeG).connect(p);
    // Exhaust: low noise chopped at the firing rate, a putt-putt at idle that smooths into a hum.
    const exhaust = noiseSource();
    const exLp = c.createBiquadFilter();
    exLp.type = 'lowpass';
    exLp.frequency.value = 220;
    exLp.Q.value = 0.5;
    const exChop = c.createGain();
    exChop.gain.value = 0.55;
    const exDepth = c.createGain();
    exDepth.gain.value = 0.3;
    const exLfo = c.createOscillator();
    exLfo.frequency.value = 30;
    exLfo.connect(exDepth).connect(exChop.gain);
    const exG = c.createGain();
    exG.gain.value = 0;
    exhaust.connect(exLp).connect(exChop).connect(exG).connect(p);

    // Tyre squeal: two soft bands of noise, low-passed so it howls rather than hisses.
    const sq = noiseSource();
    const bp = c.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 1000;
    bp.Q.value = 3;
    const bp2 = c.createBiquadFilter();
    bp2.type = 'bandpass';
    bp2.frequency.value = 1700;
    bp2.Q.value = 2.5;
    const sqMix = c.createGain();
    sqMix.gain.value = 1;
    const sqLp = c.createBiquadFilter();
    sqLp.type = 'lowpass';
    sqLp.frequency.value = 2000;
    sqLp.Q.value = 0.5;
    const sqLp2 = c.createBiquadFilter(); // a second pole: a steeper roll-off above the howl
    sqLp2.type = 'lowpass';
    sqLp2.frequency.value = 2400;
    sqLp2.Q.value = 0.5;
    const sg = c.createGain();
    sg.gain.value = 0;
    sq.connect(bp).connect(sqMix);
    sq.connect(bp2).connect(sqMix);
    sqMix.connect(sqLp).connect(sqLp2).connect(sg).connect(p);

    // Horn: two three-note-ish tones a third apart, each a soft harmonic stack, low-passed.
    const hw = wave('horn', 12, 1.4, 0.8);
    const horn1 = c.createOscillator();
    horn1.setPeriodicWave(hw);
    horn1.frequency.value = 415;
    const horn2 = c.createOscillator();
    horn2.setPeriodicWave(hw);
    horn2.frequency.value = 523;
    const hf = c.createBiquadFilter();
    hf.type = 'lowpass';
    hf.frequency.value = 1500;
    hf.Q.value = 0.4;
    const hg = c.createGain();
    hg.gain.value = 0;
    horn1.connect(hf);
    horn2.connect(hf);
    hf.connect(hg).connect(p);

    const oscs = [o1, o2, sub, wobA, wobB, exLfo, horn1, horn2];
    const noises = [intake, exhaust, sq];
    for (const o of oscs) o.start();
    for (const n of noises) n.start();

    let slow = -1; // a slow follower of the revs: a quick drop below it is a gear change
    let dipUntil = 0;
    const voice = {
      set: (rpm: number, load: number, slip: number, x: number, z: number, horn: boolean) => {
        const t = c.currentTime;
        const f = rpm / 30; // two firings per revolution
        const r = clamp01((rpm - 800) / 5200);
        const idle = 1 - clamp01((rpm - 900) / 1400);
        if (slow < 0) slow = rpm;
        slow += (rpm - slow) * 0.06;
        if (slow - rpm > 450 && load < 0.9 && t > dipUntil) dipUntil = t + 0.22;
        const dipping = t < dipUntil;
        o1.frequency.setTargetAtTime(f, t, 0.05);
        o2.frequency.setTargetAtTime(f * 1.004, t, 0.05);
        sub.frequency.setTargetAtTime(f / 2, t, 0.05);
        exLfo.frequency.setTargetAtTime(f, t, 0.05);
        lp.frequency.setTargetAtTime((dipping ? 300 : 380) + rpm * 0.15 + load * 320, t, 0.09);
        dip.gain.setTargetAtTime(dipping ? 0.74 : 1, t, dipping ? 0.03 : 0.09);
        g.gain.setTargetAtTime(0.045 + load * 0.04 + r * 0.03, t, 0.09);
        wobPitch.gain.setTargetAtTime(idle * 6, t, 0.25); // cents
        wobAmp.gain.setTargetAtTime(idle * 0.005, t, 0.25);
        intakeBp.frequency.setTargetAtTime(500 + rpm * 0.22, t, 0.1);
        intakeG.gain.setTargetAtTime((0.003 + load * 0.012 + r * 0.005) * (dipping ? 0.3 : 1), t, 0.07);
        exG.gain.setTargetAtTime(0.04 + idle * 0.03 + load * 0.02, t, 0.1);
        exLp.frequency.setTargetAtTime(170 + rpm * 0.035, t, 0.1);
        sg.gain.setTargetAtTime(Math.min(0.1, Math.max(0, slip - 1.3) * 0.03), t, 0.08);
        bp.frequency.setTargetAtTime(950 + slip * 40, t, 0.15);
        bp2.frequency.setTargetAtTime(1600 + slip * 60, t, 0.15);
        hg.gain.setTargetAtTime(horn ? 0.07 : 0, t, horn ? 0.015 : 0.05);
        p.positionX.setTargetAtTime(x, t, 0.03);
        p.positionZ.setTargetAtTime(z, t, 0.03);
      },
      stop: () => {
        const t = c.currentTime;
        g.gain.setTargetAtTime(0, t, 0.06);
        sg.gain.setTargetAtTime(0, t, 0.04);
        hg.gain.setTargetAtTime(0, t, 0.04);
        intakeG.gain.setTargetAtTime(0, t, 0.04);
        exG.gain.setTargetAtTime(0, t, 0.04);
        setTimeout(() => {
          try {
            for (const o of oscs) o.stop();
            for (const n of noises) n.stop();
            p.disconnect();
          } catch {
            /* the context was closed first */
          }
        }, 500);
        voices.delete(voice);
      },
    };
    voices.add(voice);
    return voice;
  };

  /** Two horn tones, a soft stack each, with a short fade in and out so nothing clicks. */
  const hornBlast = (c: AudioContext, dest: AudioNode, t: number, len: number, vol: number) => {
    const hw = wave('horn', 12, 1.4, 0.8);
    const hf = c.createBiquadFilter();
    hf.type = 'lowpass';
    hf.frequency.value = 1500;
    hf.Q.value = 0.4;
    const g = c.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(vol, t + 0.025);
    g.gain.setValueAtTime(vol, t + Math.max(0.03, len - 0.08));
    g.gain.linearRampToValueAtTime(0, t + len);
    hf.connect(g).connect(dest);
    for (const f of [415, 523]) {
      const o = c.createOscillator();
      o.setPeriodicWave(hw);
      o.frequency.value = f;
      o.connect(hf);
      o.start(t);
      o.stop(t + len + 0.02);
    }
  };


  /**
   * Big moments: the ambience drops about 10 dB in 30 ms and the engines about 4 dB, then both come back over ~0.6 s. The
   * one-shot itself is never ducked, so the impact keeps its punch.
   */
  const duck = () => {
    if (!ctx) return;
    const t = ctx.currentTime;
    for (const [node, to, base] of [
      [ambBus, MIX.duckAmbience, MIX.ambience],
      [engineTrim, MIX.duckEngine, sceneEngine()],
    ] as const) {
      node.gain.cancelScheduledValues(t);
      node.gain.setTargetAtTime(base * to, t, 0.01);
      node.gain.setTargetAtTime(base, t + 0.25, 0.2);
    }
  };
  const sceneEngine = () => (scene === 'paused' ? MIX.engine * MIX.pausedEngine : MIX.engine);
  const sceneWorld = () => (scene === 'menu' ? MIX.world * MIX.menuWorld : MIX.world);

  const bump = (speed: number, x: number, z: number, metal: boolean) => {
    if (!may('bump')) return;
    const c = ctx!;
    const t = c.currentTime;
    const k = Math.min(1, speed / 9);
    // A crash ducks the bed; a nudge does not.
    if (k > 0.5 && scene === 'race') duck();
    const p = panner(x, z);
    p.connect(worldBus);
    // Body thump: a fast attack, then a falling sine. Punchy, with the weight in the low end. Small touches are much softer.
    const soft = 0.35 + 0.65 * k;
    const o = c.createOscillator();
    o.type = 'sine';
    o.frequency.setValueAtTime(vary(110, 0.08), t);
    o.frequency.exponentialRampToValueAtTime(42, t + 0.22);
    const og = c.createGain();
    og.gain.setValueAtTime(0, t);
    og.gain.linearRampToValueAtTime((0.32 * k + 0.12) * soft, t + 0.004);
    og.gain.exponentialRampToValueAtTime(0.001, t + 0.28);
    o.connect(og).connect(p);
    o.start(t);
    o.stop(t + 0.32);
    // Crunch: noise through a band and a low-pass, so it crumples instead of hissing.
    const n = noiseSource();
    const f = c.createBiquadFilter();
    f.type = 'bandpass';
    f.frequency.value = vary(metal ? 1500 : 700, 0.12);
    f.Q.value = 0.7;
    const lp = c.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = metal ? 3200 : 1800;
    const ng = c.createGain();
    ng.gain.setValueAtTime(0, t);
    ng.gain.linearRampToValueAtTime((0.3 * k + 0.05) * soft, t + 0.003);
    ng.gain.exponentialRampToValueAtTime(0.001, t + 0.14 + k * 0.2);
    n.connect(f).connect(lp).connect(ng).connect(p);
    n.start(t);
    n.stop(t + 0.5);
    // A short low rumble of the body settling on bigger hits.
    if (k > 0.3) {
      const rn = noiseSource();
      const rl = c.createBiquadFilter();
      rl.type = 'lowpass';
      rl.frequency.value = 240;
      const rg = c.createGain();
      rg.gain.setValueAtTime(0, t);
      rg.gain.linearRampToValueAtTime(0.25 * k, t + 0.01);
      rg.gain.exponentialRampToValueAtTime(0.001, t + 0.35);
      rn.connect(rl).connect(rg).connect(p);
      rn.start(t);
      rn.stop(t + 0.4);
    }
    // Plastic and glass rattle on big hits: soft, short, and not too high.
    if (k > 0.45) {
      for (let i = 0; i < 3; i++) {
        const r = c.createOscillator();
        r.type = 'sine';
        r.frequency.value = 1100 + Math.random() * 1700;
        const rg = c.createGain();
        const s = t + 0.05 + i * 0.045 + Math.random() * 0.04;
        rg.gain.setValueAtTime(0, s);
        rg.gain.linearRampToValueAtTime(0.03 * k, s + 0.004);
        rg.gain.exponentialRampToValueAtTime(0.001, s + 0.09);
        r.connect(rg).connect(p);
        r.start(s);
        r.stop(s + 0.1);
      }
    }
  };

  /**
   * The classic two-tone sweep of a car alarm, rounded so it nags without stabbing. One at a time, at most 5 s, and never
   * behind the menu (a looping alarm there was the "beeping that never stops").
   */
  const alarm = (x: number, z: number, seconds: number) => {
    if (scene === 'menu' || !may('alarm')) return;
    const c = ctx!;
    const t = c.currentTime;
    const len = Math.min(seconds, BUDGET.alarm.lengthMs / 1000);
    const o = c.createOscillator();
    o.setPeriodicWave(wave('alarm', 9, 2, 0));
    const f = c.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = 1500;
    f.Q.value = 0.5;
    const g = c.createGain();
    const vol = 0.035;
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(vol, t + 0.05);
    // It tails off over its last second and a half instead of stopping dead.
    g.gain.setValueAtTime(vol, t + len - 1.5);
    g.gain.linearRampToValueAtTime(0, t + len);
    const p = panner(x, z);
    o.connect(f).connect(g).connect(p).connect(worldBus);
    for (let s = 0; s < len; s += 0.55) {
      o.frequency.setValueAtTime(720, t + s);
      o.frequency.linearRampToValueAtTime(1250, t + s + 0.5);
    }
    o.start(t);
    o.stop(t + len);
  };

  /** A shout: a voice sliding down through two vowel filters, over a long two-note horn. */
  const shout = (x: number, z: number) => {
    if (!may('shout')) return;
    const c = ctx!;
    const t = c.currentTime;
    if (scene === 'race') duck();
    const p = panner(x, z);
    p.connect(worldBus);
    const voice = c.createOscillator();
    voice.setPeriodicWave(wave('voice', 16, 1.1, 1));
    voice.frequency.setValueAtTime(vary(300, 0.06), t);
    voice.frequency.exponentialRampToValueAtTime(185, t + 0.5);
    const vib = c.createOscillator();
    vib.frequency.value = 6;
    const vibD = c.createGain();
    vibD.gain.value = 9;
    vib.connect(vibD).connect(voice.detune);
    const f1 = c.createBiquadFilter();
    f1.type = 'bandpass';
    f1.frequency.value = 650;
    f1.Q.value = 2;
    const f2 = c.createBiquadFilter();
    f2.type = 'bandpass';
    f2.frequency.value = 1300;
    f2.Q.value = 2.5;
    const vl = c.createBiquadFilter();
    vl.type = 'lowpass';
    vl.frequency.value = 2400;
    const vg = c.createGain();
    vg.gain.setValueAtTime(0, t);
    vg.gain.linearRampToValueAtTime(0.38, t + 0.05);
    vg.gain.exponentialRampToValueAtTime(0.001, t + 0.55);
    voice.connect(f1).connect(vl);
    voice.connect(f2).connect(vl);
    vl.connect(vg).connect(p);
    voice.start(t);
    vib.start(t);
    voice.stop(t + 0.6);
    vib.stop(t + 0.6);
    hornBlast(c, p, t, 1.0, 0.05);
  };

  const toot = (x: number, z: number) => {
    if (!may('toot')) return;
    const c = ctx!;
    const p = panner(x, z);
    p.connect(worldBus);
    hornBlast(c, p, c.currentTime, 0.24, 0.045);
  };

  const tone = (dest: AudioNode, freq: number, at: number, len: number, vol = 0.18, type: OscillatorType = 'triangle', cutoff = 2600) => {
    const c = ctx!;
    const t = c.currentTime + at;
    const o = c.createOscillator();
    o.type = type;
    o.frequency.value = freq;
    const g = c.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(vol, t + 0.012);
    g.gain.setValueAtTime(vol, t + Math.max(0.013, len - 0.05));
    g.gain.linearRampToValueAtTime(0, t + len);
    const f = c.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = cutoff;
    o.connect(f).connect(g).connect(dest);
    o.start(t);
    o.stop(t + len + 0.02);
  };

  const whoosh = () => {
    if (!cue('whoosh')) return;
    const c = ctx!;
    const t = c.currentTime;
    const n = noiseSource();
    const bp = c.createBiquadFilter();
    bp.type = 'bandpass';
    bp.Q.value = 1.4;
    bp.frequency.setValueAtTime(500, t);
    bp.frequency.exponentialRampToValueAtTime(vary(2000, 0.15), t + 0.18);
    bp.frequency.exponentialRampToValueAtTime(700, t + 0.42);
    const g = c.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.16, t + 0.12);
    g.gain.linearRampToValueAtTime(0, t + 0.45);
    n.connect(bp).connect(g).connect(worldBus);
    n.start(t);
    n.stop(t + 0.5);
  };

  /** A short filtered-noise burst: the body of a gear clack or a grind. */
  const burst = (at: number, len: number, freq: number, q: number, vol: number, type: BiquadFilterType = 'bandpass') => {
    const c = ctx!;
    const t = c.currentTime + at;
    const n = noiseSource();
    const f = c.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    f.Q.value = q;
    const g = c.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(vol, t + 0.004);
    g.gain.exponentialRampToValueAtTime(0.0008, t + len);
    n.connect(f).connect(g).connect(cueBus);
    n.start(t);
    n.stop(t + len + 0.02);
  };

  /** One soft clack of the lever into the gate and a small thunk through the body (up: a touch brighter). Rapid shifts merge into one. */
  const shift = (up: boolean) => {
    if (!cue('shift')) return;
    burst(0, 0.045, vary(up ? 1700 : 1400, 0.08), 4, vary(0.055));
    tone(cueBus, up ? 92 : 78, 0.01, 0.07, 0.045, 'sine');
  };

  /** Gears that will not mesh: a short, dull rasp (once per 0.7 s however often the key is pressed). */
  const grind = () => {
    if (!cue('grind')) return;
    burst(0, 0.16, 1800, 1.2, 0.07);
    tone(cueBus, vary(140, 0.04), 0, 0.15, 0.025, 'sawtooth', 900);
  };

  const ui = (kind: -1 | 0 | 1) => {
    if (!may('ui')) return;
    if (kind === 0) tone(cueBus, 1560, 0, 0.035, 0.03, 'sine');
    else if (kind === 1) [880, 1320].forEach((f, i) => tone(cueBus, f, i * 0.05, 0.08, 0.06, 'triangle'));
    else tone(cueBus, 520, 0, 0.07, 0.045, 'triangle');
  };

  return {
    shift,
    grind,
    ui,
    unlock: () => {
      const c = init();
      if (c.state === 'suspended') void c.resume();
    },
    listener: (x, y, z, fx, fz) => {
      if (!ctx) return;
      const l = ctx.listener;
      const t = ctx.currentTime;
      l.positionX.setTargetAtTime(x, t, 0.02);
      l.positionY.setTargetAtTime(y, t, 0.02);
      l.positionZ.setTargetAtTime(z, t, 0.02);
      l.forwardX.setTargetAtTime(fx, t, 0.02);
      l.forwardY.setTargetAtTime(0, t, 0.02);
      l.forwardZ.setTargetAtTime(fz, t, 0.02);
    },
    engine,
    bump,
    alarm,
    shout,
    toot,
    // Countdown: soft sine pips, the GO a little brighter. Race only.
    // The start lights: each of 3-2-1 a short square pip with its octave (it cuts through the engines), GO a bright two-note chord.
    beep: (high) => {
      if (!cue('beep')) return;
      if (high) {
        tone(cueBus, 880, 0, 0.45, 0.07, 'sawtooth', 2400);
        tone(cueBus, 1320, 0, 0.45, 0.05, 'square', 2400);
        tone(cueBus, 1760, 0.02, 0.3, 0.035, 'sine');
      } else {
        tone(cueBus, 523, 0, 0.16, 0.06, 'square', 1800);
        tone(cueBus, 1046, 0, 0.12, 0.03, 'sine');
      }
    },
    win: () => {
      if (!cue('win')) return;
      duck();
      [523, 659, 784, 1047].forEach((f, i) => tone(cueBus, f, i * 0.11, 0.22, 0.12));
    },
    lose: () => {
      if (!cue('lose')) return;
      duck();
      [392, 330, 262].forEach((f, i) => tone(cueBus, f, i * 0.16, 0.26, 0.09));
    },
    click: () => may('click') && tone(cueBus, 1100, 0, 0.04, 0.035, 'sine'),
    found: () => cue('found') && [988, 1319, 1976].forEach((f, i) => tone(cueBus, f, i * 0.07, 0.2, 0.08, 'sine')),
    sting: () => cue('sting') && [196, 185].forEach((f, i) => tone(cueBus, f, i * 0.14, 0.22, 0.07, 'sawtooth', 1400)),
    whoosh,
    tick: (high) => cue('tick') && tone(cueBus, high ? 1320 : 990, 0, 0.06, high ? 0.05 : 0.035, 'triangle'),
    setScene: (next) => {
      if (next === scene) return;
      scene = next;
      if (!ctx) return;
      const t = ctx.currentTime;
      engineTrim.gain.setTargetAtTime(sceneEngine(), t, 0.15);
      worldBus.gain.setTargetAtTime(sceneWorld(), t, 0.3);
    },
    meter: () => {
      let peak = 0;
      if (meterNode) {
        const d = new Float32Array(meterNode.fftSize);
        meterNode.getFloatTimeDomainData(d);
        for (const v of d) peak = Math.max(peak, Math.abs(v));
      }
      const now = ms();
      const oneShots = (Object.keys(BUDGET) as SoundName[]).reduce((n, k) => n + gate.active(k, now), 0);
      return { stats: gate.stats(), voices: voices.size + oneShots, peak };
    },
    volumes,
    setVolume: (k, v) => {
      volumes[k] = v;
      try {
        localStorage.setItem(KEY, JSON.stringify(volumes));
      } catch {
        /* private mode: volumes just aren't remembered */
      }
      if (!ctx) return;
      const node = k === 'master' ? master : k === 'engine' ? engineBus : fxBus;
      node.gain.setTargetAtTime(k === 'master' ? masterLevel() : v, ctx.currentTime, 0.03);
    },
    setMuted: (reason, on) => {
      if (on) muted.add(reason);
      else muted.delete(reason);
      if (ctx) master.gain.setTargetAtTime(masterLevel(), ctx.currentTime, 0.02);
    },
    dispose: () => {
      for (const v of [...voices]) v.stop();
      const c = ctx;
      ctx = null;
      setTimeout(() => void c?.close(), 400);
    },
  };
};
