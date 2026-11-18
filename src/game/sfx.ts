/**
 * Every sound is synthesised with the Web Audio API, no files: engines (oscillators through a
 * soft-clipping waveshaper and a low-pass filter, pitched by RPM), tyre squeal (filtered noise),
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
    comp.threshold.value = -16;
    comp.ratio.value = 4;
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

  const panner = (x: number, z: number) => {
    const p = ctx!.createPanner();
    p.panningModel = 'equalpower';
    p.distanceModel = 'inverse';
    p.refDistance = 6;
    p.rolloffFactor = 1.1;
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

  const curve = (() => {
    const n = 1024;
    const c = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const x = (i / (n - 1)) * 2 - 1;
      c[i] = Math.tanh(x * 2.4);
    }
    return c;
  })();

  const engine = (): EngineVoice => {
    const c = init();
    // Two detuned saws and a sub an octave down: a four-cylinder's buzz.
    const o1 = c.createOscillator();
    o1.type = 'sawtooth';
    const o2 = c.createOscillator();
    o2.type = 'sawtooth';
    const sub = c.createOscillator();
    sub.type = 'triangle';
    const mix = c.createGain();
    mix.gain.value = 0.25;
    const shaper = c.createWaveShaper();
    shaper.curve = curve;
    const lp = c.createBiquadFilter();
    lp.type = 'lowpass';
    lp.Q.value = 2;
    const g = c.createGain();
    g.gain.value = 0;
    const p = panner(0, 0);
    o1.connect(mix);
    o2.connect(mix);
    sub.connect(mix);
    mix.connect(shaper).connect(lp).connect(g).connect(p).connect(engineBus);
    // Tyre squeal: band-passed noise.
    const sq = noiseSource();
    const bp = c.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 1500;
    bp.Q.value = 6;
    const sg = c.createGain();
    sg.gain.value = 0;
    sq.connect(bp).connect(sg).connect(p);
    // Horn: two square tones a third apart, filtered.
    const h1 = c.createOscillator();
    h1.type = 'square';
    h1.frequency.value = 415;
    const h2 = c.createOscillator();
    h2.type = 'square';
    h2.frequency.value = 523;
    const hf = c.createBiquadFilter();
    hf.type = 'lowpass';
    hf.frequency.value = 1800;
    const hg = c.createGain();
    hg.gain.value = 0;
    h1.connect(hf);
    h2.connect(hf);
    hf.connect(hg).connect(p);
    for (const o of [o1, o2, sub, h1, h2]) o.start();
    sq.start();
    const voice = {
      set: (rpm: number, load: number, slip: number, x: number, z: number, horn: boolean) => {
        const t = c.currentTime;
        const f = (rpm / 60) * 2; // four-stroke four-cylinder: two firings per revolution
        o1.frequency.setTargetAtTime(f, t, 0.03);
        o2.frequency.setTargetAtTime(f * 1.007, t, 0.03);
        sub.frequency.setTargetAtTime(f / 2, t, 0.03);
        lp.frequency.setTargetAtTime(300 + rpm * 0.18 + load * 900, t, 0.05);
        g.gain.setTargetAtTime(0.1 + load * 0.16 + (rpm / 6500) * 0.08, t, 0.05);
        sg.gain.setTargetAtTime(Math.min(0.32, Math.max(0, slip - 1.2) * 0.09), t, 0.04);
        bp.frequency.setTargetAtTime(1300 + slip * 90, t, 0.1);
        hg.gain.setTargetAtTime(horn ? 0.16 : 0, t, 0.015);
        p.positionX.setTargetAtTime(x, t, 0.02);
        p.positionZ.setTargetAtTime(z, t, 0.02);
      },
      stop: () => {
        g.gain.setTargetAtTime(0, c.currentTime, 0.05);
        setTimeout(() => {
          for (const o of [o1, o2, sub, h1, h2]) o.stop();
          sq.stop();
          p.disconnect();
        }, 300);
        voices.delete(voice);
      },
    };
    voices.add(voice);
    return voice;
  };

  const bump = (speed: number, x: number, z: number, metal: boolean) => {
    const c = init();
    const t = c.currentTime;
    const k = Math.min(1, speed / 9);
    const p = panner(x, z);
    p.connect(fxBus);
    // Body thump.
    const o = c.createOscillator();
    o.type = 'sine';
    o.frequency.setValueAtTime(90, t);
    o.frequency.exponentialRampToValueAtTime(40, t + 0.25);
    const og = c.createGain();
    og.gain.setValueAtTime(0.5 * k + 0.15, t);
    og.gain.exponentialRampToValueAtTime(0.001, t + 0.3);
    o.connect(og).connect(p);
    o.start(t);
    o.stop(t + 0.35);
    // Crunch: noise, brighter for metal on metal.
    const n = noiseSource();
    const f = c.createBiquadFilter();
    f.type = 'bandpass';
    f.frequency.value = metal ? 2400 : 900;
    f.Q.value = 0.8;
    const ng = c.createGain();
    ng.gain.setValueAtTime(0.5 * k + 0.08, t);
    ng.gain.exponentialRampToValueAtTime(0.001, t + 0.18 + k * 0.25);
    n.connect(f).connect(ng).connect(p);
    n.start(t);
    n.stop(t + 0.5);
    // Plastic and glass rattle on big hits.
    if (k > 0.45) {
      for (let i = 0; i < 4; i++) {
        const r = c.createOscillator();
        r.type = 'triangle';
        r.frequency.value = 2000 + Math.random() * 3000;
        const rg = c.createGain();
        const s = t + 0.05 + i * 0.04 + Math.random() * 0.05;
        rg.gain.setValueAtTime(0.05 * k, s);
        rg.gain.exponentialRampToValueAtTime(0.001, s + 0.08);
        r.connect(rg).connect(p);
        r.start(s);
        r.stop(s + 0.1);
      }
    }
  };

  /** The classic two-tone siren of a car alarm, sweeping, from the car that got hit. */
  const alarm = (x: number, z: number, seconds: number) => {
    const c = init();
    const t = c.currentTime;
    const o = c.createOscillator();
    o.type = 'square';
    const f = c.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = 2200;
    const g = c.createGain();
    g.gain.value = 0.07;
    const p = panner(x, z);
    o.connect(f).connect(g).connect(p).connect(fxBus);
    for (let s = 0; s < seconds; s += 0.5) {
      o.frequency.setValueAtTime(900, t + s);
      o.frequency.linearRampToValueAtTime(1500, t + s + 0.45);
    }
    g.gain.setValueAtTime(0.07, t + seconds - 0.1);
    g.gain.linearRampToValueAtTime(0, t + seconds);
    o.start(t);
    o.stop(t + seconds);
  };

  const tone = (freq: number, at: number, len: number, vol = 0.18, type: OscillatorType = 'square') => {
    const c = init();
    const t = c.currentTime + at;
    const o = c.createOscillator();
    o.type = type;
    o.frequency.value = freq;
    const g = c.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(vol, t + 0.01);
    g.gain.setValueAtTime(vol, t + len - 0.04);
    g.gain.linearRampToValueAtTime(0, t + len);
    const f = c.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = 3000;
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
    beep: (high) => tone(high ? 880 : 440, 0, high ? 0.45 : 0.18, 0.16),
    win: () => [523, 659, 784, 1047].forEach((f, i) => tone(f, i * 0.11, 0.22, 0.14, 'triangle')),
    lose: () => [392, 330, 262].forEach((f, i) => tone(f, i * 0.16, 0.26, 0.12, 'triangle')),
    click: () => tone(1200, 0, 0.04, 0.05),
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
