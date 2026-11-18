/**
 * Every sound is synthesised with the Web Audio API, no files: engines (a rounded harmonic stack at
 * the firing frequency, soft-clipped and low-passed, with intake, exhaust and idle burble layers), tyre squeal (filtered noise),
 * crashes, horns, car alarms, countdown beeps and the car park's background hum.
 *
 * Sounds in the world go through a PannerNode, so a horn on your left is on your left and a
 * crash far away is quiet.
 */

export type VolumeKind = 'master' | 'engine' | 'effects';
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
  click: () => void;
  volumes: Record<VolumeKind, number>;
  setVolume: (k: VolumeKind, v: number) => void;
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
  let noise: AudioBuffer;
  const voices = new Set<{ stop: () => void }>();

  const init = () => {
    if (ctx) return ctx;
    ctx = new AudioContext();
    master = ctx.createGain();
    master.gain.value = volumes.master;
    // A gentle compressor keeps four engines and a crash from clipping.
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -18;
    comp.knee.value = 14;
    comp.ratio.value = 5;
    comp.attack.value = 0.004;
    comp.release.value = 0.22;
    master.connect(comp).connect(ctx.destination);
    engineBus = ctx.createGain();
    engineBus.gain.value = volumes.engine;
    engineBus.connect(master);
    fxBus = ctx.createGain();
    fxBus.gain.value = volumes.effects;
    fxBus.connect(master);
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

  /** Distant traffic and the hum of the store's air handlers, very low. */
  const ambience = () => {
    const c = ctx!;
    const n = noiseSource();
    const lp = c.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 260;
    const g = c.createGain();
    g.gain.value = 0.05;
    n.connect(lp).connect(g).connect(fxBus);
    n.start();
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
        gg.gain.linearRampToValueAtTime(0.025, t + k * 0.12 + 0.01);
        gg.gain.linearRampToValueAtTime(0, t + k * 0.12 + 0.08);
      }
      const p = panner((Math.random() - 0.5) * 80, (Math.random() - 0.5) * 60);
      o.connect(gg).connect(p).connect(fxBus);
      o.start(t);
      o.stop(t + 0.5);
      setTimeout(chirp, 4000 + Math.random() * 9000);
    };
    setTimeout(chirp, 3000);
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
    mix.connect(shaper).connect(lp).connect(body).connect(dip).connect(g).connect(p).connect(engineBus);

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

  const bump = (speed: number, x: number, z: number, metal: boolean) => {
    const c = init();
    const t = c.currentTime;
    const k = Math.min(1, speed / 9);
    const p = panner(x, z);
    p.connect(fxBus);
    // Body thump: a fast attack, then a falling sine. Punchy, with the weight in the low end.
    const o = c.createOscillator();
    o.type = 'sine';
    o.frequency.setValueAtTime(110, t);
    o.frequency.exponentialRampToValueAtTime(42, t + 0.22);
    const og = c.createGain();
    og.gain.setValueAtTime(0, t);
    og.gain.linearRampToValueAtTime(0.32 * k + 0.12, t + 0.004);
    og.gain.exponentialRampToValueAtTime(0.001, t + 0.28);
    o.connect(og).connect(p);
    o.start(t);
    o.stop(t + 0.32);
    // Crunch: noise through a band and a low-pass, so it crumples instead of hissing.
    const n = noiseSource();
    const f = c.createBiquadFilter();
    f.type = 'bandpass';
    f.frequency.value = metal ? 1500 : 700;
    f.Q.value = 0.7;
    const lp = c.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = metal ? 3200 : 1800;
    const ng = c.createGain();
    ng.gain.setValueAtTime(0, t);
    ng.gain.linearRampToValueAtTime(0.3 * k + 0.05, t + 0.003);
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

  /** The classic two-tone sweep of a car alarm, rounded so it nags without stabbing. */
  const alarm = (x: number, z: number, seconds: number) => {
    const c = init();
    const t = c.currentTime;
    const o = c.createOscillator();
    o.setPeriodicWave(wave('alarm', 9, 2, 0));
    const f = c.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = 1700;
    f.Q.value = 0.5;
    const g = c.createGain();
    const vol = 0.055;
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(vol, t + 0.05);
    g.gain.setValueAtTime(vol, t + seconds - 0.2);
    g.gain.linearRampToValueAtTime(0, t + seconds);
    const p = panner(x, z);
    o.connect(f).connect(g).connect(p).connect(fxBus);
    for (let s = 0; s < seconds; s += 0.55) {
      o.frequency.setValueAtTime(720, t + s);
      o.frequency.linearRampToValueAtTime(1250, t + s + 0.5);
    }
    o.start(t);
    o.stop(t + seconds);
  };

  /** A shout: a voice sliding down through two vowel filters, over a long two-note horn. */
  const shout = (x: number, z: number) => {
    const c = init();
    const t = c.currentTime;
    const p = panner(x, z);
    p.connect(fxBus);
    const voice = c.createOscillator();
    voice.setPeriodicWave(wave('voice', 16, 1.1, 1));
    voice.frequency.setValueAtTime(300, t);
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
    const c = init();
    const p = panner(x, z);
    p.connect(fxBus);
    hornBlast(c, p, c.currentTime, 0.24, 0.045);
  };

  const tone = (freq: number, at: number, len: number, vol = 0.18, type: OscillatorType = 'triangle') => {
    const c = init();
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
    f.frequency.value = 2600;
    o.connect(f).connect(g).connect(fxBus);
    o.start(t);
    o.stop(t + len + 0.02);
  };

  return {
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
    beep: (high) => tone(high ? 880 : 440, 0, high ? 0.45 : 0.18, 0.1, 'sine'),
    win: () => [523, 659, 784, 1047].forEach((f, i) => tone(f, i * 0.11, 0.22, 0.12)),
    lose: () => [392, 330, 262].forEach((f, i) => tone(f, i * 0.16, 0.26, 0.1)),
    click: () => tone(1100, 0, 0.04, 0.04, 'sine'),
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
      node.gain.setTargetAtTime(v, ctx.currentTime, 0.03);
    },
    dispose: () => {
      for (const v of [...voices]) v.stop();
      const c = ctx;
      ctx = null;
      setTimeout(() => void c?.close(), 400);
    },
  };
};
