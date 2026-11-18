/**
 * The running game: owns the three.js scene, the fixed-step loop, the inputs, the camera and the
 * sound, and hands React a small HUD snapshot ten times a second.
 *
 * Loop: real time is cut into fixed 1/60 s steps (a "fixed timestep with accumulator"), so the
 * physics behave the same on a 60 Hz laptop and a 120 Hz phone. Drawing happens once per screen
 * frame, *interpolating* between the last two steps so motion stays smooth at any refresh rate.
 */
import * as THREE from 'three';
import { Sky } from 'three/examples/jsm/objects/Sky.js';

import { createSfx } from '../sfx';
import { botInput, createBrain } from '../sim/bot';
import { CAR, DT, RACE } from '../sim/constants';
import { BAY, buildLot } from '../sim/lot';
import { createRound, distanceToTarget, forwardSpeed, standings, step } from '../sim/step';
import { NO_INPUT } from '../sim/types';

import { buildParked, buildRacer } from './car';
import { buildTargetMarker, buildWorld } from './world';

import type { BotBrain } from '../sim/bot';
import type { Lot } from '../sim/lot';
import type { GameState, Input, World } from '../sim/types';
import type { VolumeKind } from '../sfx';
import type { RacerRig } from './car';

// ---------------------------------------------------------------------------
// HUD snapshot for React
// ---------------------------------------------------------------------------

export type CameraMode = 'chase' | 'high' | 'top';

export interface Standing {
  id: number;
  name: string;
  color: number;
  dist: number;
  parked: boolean;
  me: boolean;
}

export interface HudState {
  phase: GameState['phase'];
  countdown: number;
  clock: number;
  speed: number;
  gear: 'D' | 'R' | 'P';
  standings: Standing[];
  dist: number;
  park: number;
  inBay: number;
  camera: CameraMode;
  paused: boolean;
  /** Set when the round is over. */
  result: null | {
    winner: string | null;
    winnerColor: number;
    won: boolean;
    place: number;
    time: number;
    topSpeed: number;
    bumps: number;
    distance: number;
  };
  /** Seconds since the round ended (the result card waits a moment). */
  endedFor: number;
  fps: number;
  volumes: Record<VolumeKind, number>;
}

export interface GameOptions {
  /** 'race': you drive car 0. 'showcase': four bots, a slow cinematic camera (the home page). */
  mode: 'race' | 'showcase';
  seed?: number;
  onHud?: (hud: HudState) => void;
}

const KEYS: Record<string, keyof Pressed> = {
  KeyW: 'up',
  ArrowUp: 'up',
  KeyS: 'down',
  ArrowDown: 'down',
  KeyA: 'left',
  ArrowLeft: 'left',
  KeyD: 'right',
  ArrowRight: 'right',
  Space: 'handbrake',
  KeyH: 'horn',
};

interface Pressed {
  up: boolean;
  down: boolean;
  left: boolean;
  right: boolean;
  handbrake: boolean;
  horn: boolean;
}

const lerpAngle = (a: number, b: number, t: number) => a + Math.atan2(Math.sin(b - a), Math.cos(b - a)) * t;

// ---------------------------------------------------------------------------
// Small pooled effects: tyre smoke, skid marks, sparks, hazard lights
// ---------------------------------------------------------------------------

const softDot = () => {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d')!;
  const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.5, 'rgba(255,255,255,0.45)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
};

const createEffects = (scene: THREE.Scene) => {
  const dot = softDot();
  // Smoke.
  const smoke: { s: THREE.Sprite; life: number; vx: number; vz: number }[] = [];
  for (let i = 0; i < 90; i++) {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: dot, color: 0xd8d8d8, transparent: true, depthWrite: false, opacity: 0 }));
    s.visible = false;
    scene.add(s);
    smoke.push({ s, life: 0, vx: 0, vz: 0 });
  }
  let nextSmoke = 0;
  const puff = (x: number, z: number, vx: number, vz: number, amount: number) => {
    const p = smoke[nextSmoke++ % smoke.length];
    p.life = 1;
    p.vx = vx * 0.15 + (Math.random() - 0.5) * 0.6;
    p.vz = vz * 0.15 + (Math.random() - 0.5) * 0.6;
    p.s.position.set(x, 0.25, z);
    p.s.scale.setScalar(0.5);
    p.s.visible = true;
    (p.s.material as THREE.SpriteMaterial).opacity = 0.35 * amount;
  };

  // Skid marks: a ring buffer of dark quads, one per wheel per stretch of sliding.
  const MAX = 900;
  const pos = new Float32Array(MAX * 6 * 3);
  const col = new Float32Array(MAX * 6 * 4);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(col, 4));
  const marks = new THREE.Mesh(
    geo,
    new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4 }),
  );
  marks.frustumCulled = false;
  scene.add(marks);
  let nextMark = 0;
  const skid = (ax: number, az: number, bx: number, bz: number, strength: number) => {
    const dx = bx - ax;
    const dz = bz - az;
    const len = Math.hypot(dx, dz);
    if (len < 0.01 || len > 2) return;
    const w = 0.11;
    const nx = (-dz / len) * w;
    const nz = (dx / len) * w;
    const i = nextMark++ % MAX;
    const y = 0.02;
    const v = [ax + nx, y, az + nz, ax - nx, y, az - nz, bx + nx, y, bz + nz, ax - nx, y, az - nz, bx - nx, y, bz - nz, bx + nx, y, bz + nz];
    pos.set(v, i * 18);
    for (let k = 0; k < 6; k++) col.set([0.05, 0.05, 0.06, Math.min(0.55, strength * 0.2)], i * 24 + k * 4);
    geo.attributes.position.needsUpdate = true;
    geo.attributes.color.needsUpdate = true;
  };

  // Sparks and bits of plastic on a hard hit.
  const sparks: { s: THREE.Sprite; life: number; v: THREE.Vector3 }[] = [];
  for (let i = 0; i < 60; i++) {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: dot, color: 0xffc46b, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
    s.visible = false;
    s.scale.setScalar(0.18);
    scene.add(s);
    sparks.push({ s, life: 0, v: new THREE.Vector3() });
  }
  let nextSpark = 0;
  const burst = (x: number, z: number, speed: number) => {
    const n = Math.min(22, Math.floor(speed * 2.5));
    for (let i = 0; i < n; i++) {
      const p = sparks[nextSpark++ % sparks.length];
      p.life = 0.5 + Math.random() * 0.4;
      p.v.set((Math.random() - 0.5) * 6, 1.5 + Math.random() * 3, (Math.random() - 0.5) * 6);
      p.s.position.set(x, 0.6, z);
      p.s.visible = true;
    }
  };

  // Hazard lights blinking on a parked car whose alarm is going.
  const hazards: THREE.Sprite[] = [];
  for (let i = 0; i < 16; i++) {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: dot, color: 0xffa21a, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
    s.scale.setScalar(0.7);
    s.visible = false;
    scene.add(s);
    hazards.push(s);
  }

  const update = (dt: number, t: number, alarms: { x: number; z: number; h: number }[]) => {
    for (const p of smoke) {
      if (p.life <= 0) continue;
      p.life -= dt * 0.7;
      p.s.position.x += p.vx * dt;
      p.s.position.z += p.vz * dt;
      p.s.position.y += dt * 0.6;
      p.s.scale.setScalar(0.5 + (1 - p.life) * 2.6);
      const m = p.s.material as THREE.SpriteMaterial;
      m.opacity = Math.max(0, m.opacity - dt * 0.25);
      if (p.life <= 0) p.s.visible = false;
    }
    for (const p of sparks) {
      if (p.life <= 0) continue;
      p.life -= dt;
      p.v.y -= 9.8 * dt;
      p.s.position.addScaledVector(p.v, dt);
      if (p.s.position.y < 0.05) {
        p.s.position.y = 0.05;
        p.v.y *= -0.3;
        p.v.x *= 0.6;
        p.v.z *= 0.6;
      }
      if (p.life <= 0) p.s.visible = false;
    }
    const on = Math.sin(t * Math.PI * 3) > 0;
    let k = 0;
    for (const a of alarms) {
      const fx = Math.sin(a.h);
      const fz = Math.cos(a.h);
      for (const [lf, ls] of [
        [2.2, 0.7],
        [2.2, -0.7],
        [-2.25, 0.7],
        [-2.25, -0.7],
      ]) {
        const s = hazards[k++];
        if (!s) break;
        s.visible = on;
        s.position.set(a.x + fx * lf + fz * ls, 0.8, a.z + fz * lf - fx * ls);
      }
    }
    for (; k < hazards.length; k++) hazards[k].visible = false;
  };

  return { puff, skid, burst, update };
};

// ---------------------------------------------------------------------------
// The game
// ---------------------------------------------------------------------------

export class Game {
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera: THREE.PerspectiveCamera;
  private sun: THREE.DirectionalLight;
  private lot: Lot;
  private state!: GameState;
  private world!: World;
  private brains: (BotBrain | null)[] = [];
  private rigs: RacerRig[] = [];
  private prev: { x: number; z: number; h: number }[] = [];
  private parked: THREE.Group | null = null;
  private marker = buildTargetMarker();
  private worldView;
  private effects;
  private sfx = createSfx();
  private engines: ReturnType<ReturnType<typeof createSfx>['engine']>[] = [];
  private rpm: number[] = [];
  private wheelPrev: { x: number; z: number }[][] = [];
  private keys: Pressed = { up: false, down: false, left: false, right: false, handbrake: false, horn: false };
  private touch: Partial<Input> | null = null;
  private acc = 0;
  private last = 0;
  private time = 0;
  private raf = 0;
  private hudAt = 0;
  private frames = 0;
  private fpsAt = 0;
  private fps = 60;
  private trauma = 0;
  private cam = { x: 0, y: 6, z: -50, yaw: 0, look: new THREE.Vector3() };
  private cameraMode: CameraMode = 'chase';
  private paused = false;
  private endedAt = -1;
  private seed: number;
  private disposed = false;
  private minimap: HTMLCanvasElement | null = null;
  private pointer: HTMLElement | null = null;
  private roundNo = 0;

  constructor(
    private canvas: HTMLCanvasElement,
    private opts: GameOptions,
  ) {
    this.seed = opts.seed ?? Math.floor(Math.random() * 1e6);
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 0.62;
    this.camera = new THREE.PerspectiveCamera(62, 1, 0.1, 900);

    // Sky with a low autumn sun from the south-west; the same sky lights the car paint.
    const sky = new Sky();
    sky.scale.setScalar(4000);
    const sunDir = new THREE.Vector3().setFromSphericalCoords(1, THREE.MathUtils.degToRad(90 - 24), THREE.MathUtils.degToRad(215));
    const u = sky.material.uniforms;
    u.turbidity.value = 6;
    u.rayleigh.value = 1.4;
    u.mieCoefficient.value = 0.006;
    u.mieDirectionalG.value = 0.85;
    u.sunPosition.value.copy(sunDir);
    this.scene.add(sky);
    const pmrem = new THREE.PMREMGenerator(this.renderer);
    const envScene = new THREE.Scene();
    const envSky = new Sky();
    envSky.scale.setScalar(1000);
    for (const k of Object.keys(u)) (envSky.material.uniforms[k].value as unknown) = u[k].value;
    envScene.add(envSky);
    this.scene.environment = pmrem.fromScene(envScene, 0.02).texture;
    this.scene.environmentIntensity = 0.75;
    this.scene.fog = new THREE.Fog(0xc9d3dc, 140, 520);

    this.sun = new THREE.DirectionalLight(0xffe2bd, 3.1);
    this.sun.position.copy(sunDir).multiplyScalar(80);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    const sc = this.sun.shadow.camera;
    sc.left = sc.bottom = -34;
    sc.right = sc.top = 34;
    sc.near = 1;
    sc.far = 220;
    this.sun.shadow.bias = -0.0004;
    this.sun.shadow.normalBias = 0.03;
    this.scene.add(this.sun, this.sun.target);
    this.scene.add(new THREE.HemisphereLight(0xcfe0ff, 0x5b5040, 0.7));

    this.lot = buildLot();
    this.worldView = buildWorld(this.lot);
    this.scene.add(this.worldView.group);
    this.scene.add(this.marker.group);
    this.effects = createEffects(this.scene);

    this.newRound();
    this.resize();
    window.addEventListener('resize', this.resize);
    if (opts.mode === 'race') {
      window.addEventListener('keydown', this.onKey);
      window.addEventListener('keyup', this.onKey);
      window.addEventListener('blur', this.onBlur);
    }
    this.last = performance.now();
    this.raf = requestAnimationFrame(this.frame);
  }

  // ----- round -----

  newRound = () => {
    this.roundNo++;
    const seed = this.seed + this.roundNo * 101;
    const bots = this.opts.mode === 'race' ? [false, true, true, true] : [true, true, true, true];
    const { state, world } = createRound(this.lot, { seed, bots });
    this.state = state;
    this.world = world;
    this.brains = state.cars.map((c) => (c.bot ? createBrain(world, c, state.target, seed) : null));
    this.prev = state.cars.map((c) => ({ x: c.x, z: c.z, h: c.h }));
    this.wheelPrev = state.cars.map(() => []);
    this.endedAt = -1;
    this.paused = false;

    // Parked cars: everything except the free bay.
    if (this.parked) {
      this.scene.remove(this.parked);
      this.parked.traverse((o) => (o as THREE.Mesh).geometry?.dispose());
    }
    const spots = this.lot.bays
      .filter((b) => b.use === 'car' && b.id !== state.target)
      .map((b) => ({ x: b.x + Math.sin(b.h) * 0.12, z: b.z + Math.cos(b.h) * 0.12, h: b.h, style: b.variant, color: b.color }));
    this.parked = buildParked(spots);
    this.parked.add(this.bayProps());
    this.scene.add(this.parked);

    const bay = this.lot.bays[state.target];
    this.marker.group.position.set(bay.x, 0, bay.z);
    this.marker.group.rotation.y = bay.h;

    for (const r of this.rigs) this.scene.remove(r.root);
    const plates = ['MRG 042', 'STG 001', 'FIX 911', 'OLD 1999'];
    this.rigs = state.cars.map((c) => {
      const rig = buildRacer(c.color, plates[c.id]);
      this.scene.add(rig.root);
      return rig;
    });
    for (const e of this.engines) e.stop();
    this.engines = [];
    this.rpm = state.cars.map(() => 850);

    // Camera starts behind your car (or high over the lot on the home page).
    const me = state.cars[0];
    this.cam.yaw = me.h;
    this.cam.x = me.x - Math.sin(me.h) * 7;
    this.cam.z = me.z - Math.cos(me.h) * 7;
    this.cam.y = 3;
    this.cam.look.set(me.x, 1, me.z);
  };

  /** Trolley corrals and traffic cones in the bays that hold them. */
  private bayProps() {
    const g = new THREE.Group();
    const metal = new THREE.MeshStandardMaterial({ color: 0xb4b9c0, roughness: 0.35, metalness: 0.85 });
    const cone = new THREE.MeshStandardMaterial({ color: 0xf06a1d, roughness: 0.6 });
    const white = new THREE.MeshStandardMaterial({ color: 0xf2f2f2, roughness: 0.6 });
    for (const b of this.lot.bays) {
      if (b.use === 'corral') {
        const c = new THREE.Group();
        for (const sx of [-0.85, 0.85]) {
          const rail = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.06, 4.6), metal);
          rail.position.set(sx, 1.0, 0);
          c.add(rail);
          for (const z of [-2.2, 0, 2.2]) {
            const post = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 1.0, 6), metal);
            post.position.set(sx, 0.5, z);
            c.add(post);
          }
        }
        const back = new THREE.Mesh(new THREE.BoxGeometry(1.76, 0.06, 0.06), metal);
        back.position.set(0, 1.0, 2.3);
        c.add(back);
        // A couple of trolleys left in it.
        for (const z of [1.2, 0.6]) {
          const t = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.45, 0.85), metal);
          t.position.set(0, 0.65, z);
          c.add(t);
        }
        c.position.set(b.x, 0, b.z);
        c.rotation.y = b.h;
        c.traverse((o) => (o.castShadow = true));
        g.add(c);
      } else if (b.use === 'cones') {
        for (const d of [-1.8, 0, 1.8]) {
          const k = new THREE.Group();
          const body = new THREE.Mesh(new THREE.ConeGeometry(0.22, 0.7, 14), cone);
          body.position.y = 0.37;
          const band = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.16, 0.1, 14), white);
          band.position.y = 0.42;
          const foot = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.04, 0.5), cone);
          foot.position.y = 0.02;
          k.add(body, band, foot);
          k.position.set(b.x - b.ax * (1.8 - d * 0.4) + b.az * d * 0.3, 0, b.z - b.az * (1.8 - d * 0.4) - b.ax * d * 0.3);
          k.traverse((o) => (o.castShadow = true));
          g.add(k);
        }
      }
    }
    return g;
  }

  // ----- inputs -----

  private onKey = (e: KeyboardEvent) => {
    const down = e.type === 'keydown';
    const k = KEYS[e.code];
    if (k) {
      this.keys[k] = down;
      e.preventDefault();
      this.sfx.unlock();
    }
    if (down && e.code === 'KeyC') this.cycleCamera();
    if (down && e.code === 'Escape') this.setPaused(!this.paused);
    if (down && e.code === 'Enter' && this.state.phase === 'done') this.newRound();
  };

  private onBlur = () => {
    this.keys = { up: false, down: false, left: false, right: false, handbrake: false, horn: false };
  };

  /** Touch controls feed the same input (null when no finger is down). */
  setTouch = (input: Partial<Input> | null) => {
    this.touch = input;
    this.sfx.unlock();
  };

  cycleCamera = () => {
    const order: CameraMode[] = ['chase', 'high', 'top'];
    this.cameraMode = order[(order.indexOf(this.cameraMode) + 1) % order.length];
  };

  setPaused = (p: boolean) => {
    if (this.opts.mode !== 'race' || this.state.phase === 'done') return;
    this.paused = p;
    this.emitHud(true);
  };

  setVolume = (k: VolumeKind, v: number) => {
    this.sfx.setVolume(k, v);
    this.emitHud(true);
  };

  unlockAudio = () => this.sfx.unlock();

  attachMinimap = (c: HTMLCanvasElement | null) => {
    this.minimap = c;
  };

  attachPointer = (el: HTMLElement | null) => {
    this.pointer = el;
  };

  private playerInput(): Input {
    const k = this.keys;
    const t = this.touch;
    return {
      throttle: Math.max(k.up ? 1 : 0, t?.throttle ?? 0),
      brake: Math.max(k.down ? 1 : 0, t?.brake ?? 0),
      steer: Math.max(-1, Math.min(1, (k.right ? 1 : 0) - (k.left ? 1 : 0) + (t?.steer ?? 0))),
      handbrake: k.handbrake || !!t?.handbrake,
      horn: k.horn || !!t?.horn,
    };
  }

  // ----- loop -----

  private resize = () => {
    const w = this.canvas.clientWidth || window.innerWidth;
    const h = this.canvas.clientHeight || window.innerHeight;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    // Portrait phones: widen the view so the car and the lane ahead both fit.
    this.camera.fov = w < h ? 78 : 62;
    this.camera.updateProjectionMatrix();
  };

  private frame = (now: number) => {
    if (this.disposed) return;
    this.raf = requestAnimationFrame(this.frame);
    const dt = Math.min(0.1, (now - this.last) / 1000);
    this.last = now;
    this.frames++;
    if (now - this.fpsAt > 1000) {
      this.fps = (this.frames * 1000) / (now - this.fpsAt);
      this.frames = 0;
      this.fpsAt = now;
    }
    if (!this.paused) {
      this.time += dt;
      this.acc += dt;
      while (this.acc >= DT) {
        this.acc -= DT;
        this.tick();
      }
    }
    this.draw(dt, this.paused ? 1 : this.acc / DT);
    if (now - this.hudAt > 100) {
      this.hudAt = now;
      this.emitHud(false);
    }
  };

  private tick() {
    const s = this.state;
    this.prev = s.cars.map((c) => ({ x: c.x, z: c.z, h: c.h }));
    const inputs = s.cars.map((c, i) => {
      const brain = this.brains[i];
      if (brain) return botInput(s, this.world, c, brain);
      return this.opts.mode === 'race' && i === 0 ? this.playerInput() : NO_INPUT;
    });
    step(s, this.world, inputs);
    for (const e of s.events) {
      if (e.type === 'count') this.sfx.beep(false);
      else if (e.type === 'go') this.sfx.beep(true);
      else if (e.type === 'bump') {
        const near = this.focusCar();
        const d = Math.hypot(e.x - near.x, e.z - near.z);
        if (e.car === 0 || e.other === 0 || this.opts.mode === 'showcase') this.trauma = Math.min(1, this.trauma + Math.min(0.6, e.speed * 0.07) * (d < 8 ? 1 : 0.3));
        this.sfx.bump(e.speed, e.x, e.z, e.bay >= 0 || e.other >= 0);
        if (e.speed > 3) this.effects.burst(e.x, e.z, e.speed);
      } else if (e.type === 'alarm') {
        const b = this.lot.bays[e.bay];
        this.sfx.alarm(b.x, b.z, 9);
      } else if (e.type === 'end') {
        this.endedAt = this.time;
        if (this.opts.mode === 'race') {
          if (e.winner === 0) this.sfx.win();
          else this.sfx.lose();
        }
      }
    }
    // Home page: start the next round a few seconds after someone parks.
    if (this.opts.mode === 'showcase' && s.phase === 'done' && this.time - this.endedAt > 4) this.newRound();
  }

  private focusCar() {
    if (this.opts.mode === 'race') return this.state.cars[0];
    // Showcase: follow whoever is closest to the free bay.
    return [...this.state.cars].sort((a, b) => distanceToTarget(this.state, this.world, a) - distanceToTarget(this.state, this.world, b))[0];
  }

  private draw(dt: number, alpha: number) {
    const s = this.state;
    const t = this.time;
    s.cars.forEach((c, i) => {
      const rig = this.rigs[i];
      const p = this.prev[i] ?? c;
      const x = p.x + (c.x - p.x) * alpha;
      const z = p.z + (c.z - p.z) * alpha;
      const h = lerpAngle(p.h, c.h, alpha);
      rig.root.position.set(x, 0, z);
      rig.root.rotation.y = h;
      const vF = forwardSpeed(c);
      // Wheels: spin with the road speed, front pair turned by the steering.
      rig.roll += (vF / 0.32) * dt;
      for (const w of rig.wheels) {
        w.spin.rotation.x = rig.roll;
        if (w.front) w.pivot.rotation.y = -c.steer;
      }
      // Suspension: the body pitches under braking/acceleration and rolls out of corners, on springs.
      const accel = c.braking ? -1 : c.throttle * (c.gear === 1 ? 1 : -1);
      const pitchWant = -accel * 0.022 * Math.min(1, Math.abs(vF) / 2 + 0.3);
      const leanWant = Math.max(-0.05, Math.min(0.05, -c.w * vF * 0.006));
      rig.pitchV += ((pitchWant - rig.pitch) * 90 - rig.pitchV * 11) * dt;
      rig.pitch += rig.pitchV * dt;
      rig.leanV += ((leanWant - rig.lean) * 80 - rig.leanV * 10) * dt;
      rig.lean += rig.leanV * dt;
      rig.body.rotation.x = rig.pitch;
      rig.body.rotation.z = rig.lean;
      rig.body.position.y = Math.sin(t * 31 + i) * 0.003 * (c.throttle > 0 ? 1 : 0.4);
      // Lights.
      rig.tail.emissiveIntensity = c.braking || (c.handbrake && Math.abs(vF) > 0.5) ? 3.2 : 0.8;
      rig.reverse.emissiveIntensity = c.gear === -1 ? 2.2 : 0;

      // Tyre smoke and skid marks while sliding.
      const fx = Math.sin(c.h);
      const fz = Math.cos(c.h);
      const wheels = [
        [CAR.rearAxle, 0.78],
        [CAR.rearAxle, -0.78],
        [CAR.frontAxle, 0.78],
        [CAR.frontAxle, -0.78],
      ].map(([lf, ls]) => ({ x: c.x + fx * lf + fz * ls, z: c.z + fz * lf - fx * ls }));
      const sliding = c.slip > 2.2;
      if (sliding) {
        const prevW = this.wheelPrev[i];
        wheels.forEach((w, k) => {
          if (k >= 2 && c.slip < 4) return;
          if (prevW[k]) this.effects.skid(prevW[k].x, prevW[k].z, w.x, w.z, c.slip);
        });
        if (Math.random() < Math.min(0.9, c.slip * 0.12)) {
          const w = wheels[Math.floor(Math.random() * 2)];
          this.effects.puff(w.x, w.z, c.vx, c.vz, Math.min(1, c.slip / 5));
        }
      }
      this.wheelPrev[i] = sliding ? wheels : [];

      // Engine note: revs from the road speed through a five-speed automatic, plus the throttle.
      const v = Math.abs(vF);
      let rpm: number;
      if (s.phase === 'countdown') rpm = 850 + c.throttle * 5200;
      else if (c.gear === -1) rpm = 900 + (v / 6.2) * 3600 + c.throttle * 400;
      else {
        const shifts = [0, 4.2, 8.5, 12.5, 16, 30];
        let g = 0;
        while (g < 4 && v > shifts[g + 1]) g++;
        const frac = (v - shifts[g]) / (shifts[g + 1] - shifts[g]);
        rpm = v < 0.3 && c.throttle === 0 ? 850 : 1500 + frac * 4200 + c.throttle * 500;
      }
      this.rpm[i] += (rpm - this.rpm[i]) * Math.min(1, dt * 10);
    });

    // Sound: engines follow their cars, the listener rides with the camera.
    if (this.engines.length === 0 && this.opts.mode === 'race') {
      try {
        this.engines = s.cars.map(() => this.sfx.engine());
      } catch {
        this.engines = [];
      }
    }
    this.engines.forEach((e, i) => {
      const c = s.cars[i];
      e.set(this.rpm[i], c.throttle, c.slip, c.x, c.z, c.horn);
    });

    // Target bay: pulse, and turn amber while someone is half in.
    const bay = this.lot.bays[s.target];
    const someone = Math.max(...s.cars.map((c) => c.inBay));
    const color = s.winner !== null ? 0x3ec5ff : someone >= 1 ? 0xffd23f : 0x3ddc84;
    this.marker.lineMat.color.setHex(color);
    this.marker.fillMat.color.setHex(color);
    this.marker.fillMat.opacity = 0.12 + Math.sin(t * 4) * 0.05;
    this.marker.beamMat.uniforms.uTime.value = t;
    (this.marker.beamMat.uniforms.uColor.value as THREE.Color).setHex(color);
    this.marker.sign.position.y = 3.4 + Math.sin(t * 2) * 0.15;
    this.marker.sign.visible = s.winner === null;

    // Alarms going off.
    const alarms = Object.entries(s.alarms)
      .filter(([, until]) => until > s.t)
      .map(([id]) => this.lot.bays[Number(id)]);
    this.effects.update(dt, t, alarms);
    this.worldView.trees.update(t);
    this.worldView.sign.emissiveIntensity = 1.3 + (Math.sin(t * 37) > 0.97 ? -0.6 : 0);

    this.updateCamera(dt);
    this.drawMinimap();
    this.updatePointer(bay.x, bay.z);
    this.renderer.render(this.scene, this.camera);
  }

  private updateCamera(dt: number) {
    const s = this.state;
    const car = this.focusCar();
    const rig = this.rigs[car.id];
    const x = rig.root.position.x;
    const z = rig.root.position.z;
    const h = rig.root.rotation.y;
    const showcase = this.opts.mode === 'showcase';
    let want: THREE.Vector3;
    let look: THREE.Vector3;
    if (showcase) {
      // A slow sway behind and above the leader, always looking north up the lot so the frame is
      // cars, bays and the store sign (never the road or the empty grass behind the camera).
      const a = Math.sin(this.time * 0.1) * 0.55 + 0.25;
      want = new THREE.Vector3(x - Math.sin(a) * 16, 6.2, z - Math.cos(a) * 16);
      look = new THREE.Vector3(x + 5 + Math.sin(a) * 4, 0.9, z + 13);
    } else if (this.cameraMode === 'top') {
      // Straight down, north up: for squeezing into the bay.
      want = new THREE.Vector3(x, 22, z - 0.01);
      look = new THREE.Vector3(x, 0, z);
    } else {
      // Chase: behind the car, the yaw catching up with the heading on a spring so turns feel
      // like turns (a camera bolted to the car makes the world spin instead).
      const vF = forwardSpeed(s.cars[car.id]);
      const follow = Math.abs(vF) < 0.5 ? 1.2 : 3.2;
      this.cam.yaw = lerpAngle(this.cam.yaw, h, Math.min(1, dt * follow));
      const dist = this.cameraMode === 'high' ? 10.5 : 6.4 + Math.min(1.6, Math.abs(vF) * 0.09);
      const height = this.cameraMode === 'high' ? 6.5 : 2.55;
      want = new THREE.Vector3(x - Math.sin(this.cam.yaw) * dist, height, z - Math.cos(this.cam.yaw) * dist);
      look = new THREE.Vector3(x + Math.sin(h) * 2.4, 1.05, z + Math.cos(h) * 2.4);
    }
    const k = Math.min(1, dt * (showcase ? 1.5 : this.cameraMode === 'top' ? 5 : 8));
    this.cam.x += (want.x - this.cam.x) * k;
    this.cam.y += (want.y - this.cam.y) * k;
    this.cam.z += (want.z - this.cam.z) * k;
    this.cam.look.lerp(look, Math.min(1, dt * 10));
    // Shake from crashes: trauma squared, smooth noise, fades in about a second.
    const shake = this.trauma * this.trauma;
    const n = (f: number, p: number) => Math.sin(this.time * f + p) * 0.6 + Math.sin(this.time * f * 2.3 + p) * 0.4;
    this.camera.position.set(this.cam.x + n(23, 1.3) * 0.25 * shake, this.cam.y + n(19, 4.1) * 0.18 * shake, this.cam.z + n(17, 2.2) * 0.25 * shake);
    this.camera.lookAt(this.cam.look);
    if (this.cameraMode === 'top' && !showcase) this.camera.up.set(0, 1, 0);
    this.trauma = Math.max(0, this.trauma - dt * 1.4);
    this.sfx.listener(this.camera.position.x, this.camera.position.y, this.camera.position.z, Math.sin(this.cam.yaw), Math.cos(this.cam.yaw));

    // Shadows: the sun's shadow box follows the car, snapped to whole shadow-map texels so the
    // edges don't shimmer as it moves.
    const texel = 68 / 2048;
    const fx = Math.round(x / texel) * texel;
    const fz = Math.round(z / texel) * texel;
    const dir = this.sun.position.clone().sub(this.sun.target.position).normalize();
    this.sun.target.position.set(fx, 0, fz);
    this.sun.position.set(fx, 0, fz).addScaledVector(dir, 80);
  }

  /** Edge-of-screen arrow towards the free bay when it is off screen. */
  private updatePointer(bx: number, bz: number) {
    const el = this.pointer;
    if (!el) return;
    const v = new THREE.Vector3(bx, 1.5, bz).project(this.camera);
    const behind = v.z > 1;
    const onScreen = !behind && Math.abs(v.x) < 0.9 && Math.abs(v.y) < 0.85;
    if (onScreen || this.state.phase === 'done') {
      el.style.opacity = '0';
      return;
    }
    let ax = behind ? -v.x : v.x;
    let ay = behind ? -v.y : v.y;
    if (behind && Math.abs(ax) < 0.01 && Math.abs(ay) < 0.01) ay = -1;
    const m = Math.max(Math.abs(ax) / 0.88, Math.abs(ay) / 0.8);
    ax /= m;
    ay /= m;
    const sx = ((ax + 1) / 2) * window.innerWidth;
    const sy = ((1 - ay) / 2) * window.innerHeight;
    const angle = Math.atan2(-ay, ax);
    el.style.opacity = '1';
    el.style.transform = `translate(${sx}px, ${sy}px) translate(-50%, -50%) rotate(${angle}rad)`;
  }

  private drawMinimap() {
    const c = this.minimap;
    if (!c) return;
    const g = c.getContext('2d');
    if (!g) return;
    const { bounds } = this.lot;
    const W = c.width;
    const H = c.height;
    const pad = 6;
    const sx = (W - pad * 2) / (bounds.x1 - bounds.x0);
    const sz = (H - pad * 2) / (bounds.z1 - bounds.z0);
    const sc = Math.min(sx, sz);
    // North (the store) at the top; x flipped so the map matches the chase view from the entrance.
    const px = (x: number) => W / 2 - x * sc;
    const pz = (z: number) => H - pad - (z - bounds.z0) * sc;
    g.clearRect(0, 0, W, H);
    g.fillStyle = 'rgba(10,13,24,0.72)';
    g.fillRect(0, 0, W, H);
    g.fillStyle = 'rgba(120,128,140,0.35)';
    g.fillRect(px(bounds.x1), pz(bounds.z1), (bounds.x1 - bounds.x0) * sc, (bounds.z1 - bounds.z0) * sc);
    g.fillStyle = 'rgba(96,140,80,0.8)';
    for (const isl of this.lot.islands) g.fillRect(px(isl.x1), pz(isl.z1), (isl.x1 - isl.x0) * sc, (isl.z1 - isl.z0) * sc);
    g.fillStyle = 'rgba(200,190,170,0.6)';
    g.fillRect(px(this.lot.store.x1), 0, (this.lot.store.x1 - this.lot.store.x0) * sc, 4);
    const bay = this.lot.bays[this.state.target];
    const pulse = 0.6 + Math.sin(this.time * 6) * 0.4;
    g.fillStyle = `rgba(61,220,132,${pulse})`;
    g.beginPath();
    g.arc(px(bay.x), pz(bay.z), 5, 0, Math.PI * 2);
    g.fill();
    for (const car of this.state.cars) {
      const x = px(car.x);
      const y = pz(car.z);
      g.save();
      g.translate(x, y);
      g.rotate(-car.h);
      g.fillStyle = '#' + car.color.toString(16).padStart(6, '0');
      g.strokeStyle = car.id === 0 && this.opts.mode === 'race' ? '#ffd23f' : 'rgba(0,0,0,0.6)';
      g.lineWidth = car.id === 0 ? 2 : 1;
      g.beginPath();
      g.moveTo(0, -5);
      g.lineTo(3.2, 4);
      g.lineTo(-3.2, 4);
      g.closePath();
      g.fill();
      g.stroke();
      g.restore();
    }
  }

  private emitHud(force: boolean) {
    const cb = this.opts.onHud;
    if (!cb) return;
    const s = this.state;
    const me = s.cars[0];
    const vF = forwardSpeed(me);
    const order = standings(s, this.world);
    const result =
      s.phase === 'done'
        ? {
            winner: s.winner !== null ? s.cars[s.winner].name : null,
            winnerColor: s.winner !== null ? s.cars[s.winner].color : 0xffffff,
            won: s.winner === 0,
            place: order.findIndex((c) => c.id === 0) + 1,
            time: me.parkedAt ?? s.clock,
            topSpeed: me.topSpeed * 3.6,
            bumps: me.bumps,
            distance: me.distance,
          }
        : null;
    cb({
      phase: s.phase,
      countdown: Math.max(0, Math.ceil(RACE.countdown - s.t)),
      clock: s.clock,
      speed: Math.abs(vF) * 3.6,
      gear: me.parkedAt !== null ? 'P' : me.gear === -1 ? 'R' : 'D',
      standings: order.map((c) => ({ id: c.id, name: c.name, color: c.color, dist: distanceToTarget(s, this.world, c), parked: c.parkedAt !== null, me: c.id === 0 })),
      dist: distanceToTarget(s, this.world, me),
      park: me.park,
      inBay: me.inBay,
      camera: this.cameraMode,
      paused: this.paused,
      result,
      endedFor: this.endedAt < 0 ? 0 : this.time - this.endedAt,
      fps: this.fps,
      volumes: { ...this.sfx.volumes },
    });
    void force;
  }

  /** Bay size, for the HUD's parking guide. */
  static bay = BAY;

  dispose() {
    this.disposed = true;
    cancelAnimationFrame(this.raf);
    window.removeEventListener('resize', this.resize);
    window.removeEventListener('keydown', this.onKey);
    window.removeEventListener('keyup', this.onKey);
    window.removeEventListener('blur', this.onBlur);
    this.sfx.dispose();
    this.renderer.dispose();
  }
}
