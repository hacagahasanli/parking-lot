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
import { CAR, DT, PED, RACE } from '../sim/constants';
import { COPY } from '../sim/flavour';
import { hintArea, hintLines, hintOf } from '../sim/hint';
import { LEVELS, LEVEL_COLOR, LEVEL_H, levelName, levelOf, levelY } from '../sim/levels';
import { BAY, CONE_R, CORRAL, bayCones, buildLot, parkedSpot } from '../sim/lot';
import { radio } from '../sim/radio';
import { hasNext, isShut, newProgress, next, pick, stageDef, STAGE_COUNT, won } from '../sim/stages';
import { createRound, distanceToTarget, forwardSpeed, standings, step } from '../sim/step';
import { NO_INPUT } from '../sim/types';
import { MANUAL, band, gearName } from '../sim/gearbox';
import { DEFAULT_BINDINGS, keyMap } from '../settings';
import { readPad } from './pad';

import { buildParked, buildRacer } from './car';
import { buildAmbience } from './ambience';
import { buildPeds } from './peds';
import { circleHit, boxHit } from './sight';
import { FpsGuard, lowerTier, TIERS } from './quality';
import { CAMERA_MODES, parkFollow, parkPose } from './view';
import { NEAR_MISS, REVEAL, revealOf } from './reveal';
import { buildFreeBayPaint, buildTargetMarker, buildWorld } from './world';

import type { BotBrain } from '../sim/bot';
import type { Progress } from '../sim/stages';
import type { Lot } from '../sim/lot';
import type { Car, GameState, Input, World } from '../sim/types';
import type { VolumeKind } from '../sfx';
import type { RacerRig } from './car';
import type { Flavour } from '../sim/flavour';
import type { Tier } from './quality';
import type { CameraMode } from './view';
import type { Action, Transmission } from '../settings';
import type { PadState } from './pad';

// ---------------------------------------------------------------------------
// HUD snapshot for React
// ---------------------------------------------------------------------------

export type { CameraMode } from './view';

export interface Standing {
  id: number;
  name: string;
  color: number;
  /** Bumps so far: the standings never say how close anyone is to the free bay. */
  bumps: number;
  parked: boolean;
  /** Disqualified for hitting a pedestrian, a car or something hard. */
  out: boolean;
  me: boolean;
}

/** A line on the radio. */
export interface ChatBubble {
  id: number;
  name: string;
  color: number;
  text: string;
  /** Seconds since it was said (for fading). */
  age: number;
}

export interface HudState {
  phase: GameState['phase'];
  countdown: number;
  clock: number;
  speed: number;
  gear: string;
  /** The manual gearbox's dials (null with the automatic): gear, revs, the shift light and the limiter. */
  manual: null | { gear: string; rpm: number; idle: number; redline: number; band: number; light: boolean; limiter: boolean; shiftId: number; denied: number };
  /** The menu is showing (the world idles behind it: bots only, a slow camera). */
  menu: boolean;
  standings: Standing[];
  chat: ChatBubble[];
  /** Seconds since you were disqualified, or null; and what you hit ('pedestrian', 'car' or 'obstacle') and its name ("Staging", "a parked car", "a post"). */
  disqualified: number | null;
  dqWhy: { kind: 'pedestrian' | 'car' | 'obstacle'; what: string } | null;
  park: number;
  inBay: number;
  camera: CameraMode;
  paused: boolean;
  /** A full-screen flash (a new id each time): finding the bay, winning, losing. */
  flash: { id: number; kind: 'found' | 'win' | 'lose' } | null;
  /** A big word in the middle of the screen for a moment (a new id each time). */
  callout: { id: number; text: string; tone: 'good' | 'bad' | 'warn' } | null;
  /** Seconds left in the round (the clock turns red in the last ten). */
  left: number;
  /** Set when the round is over. */
  result: null | {
    winner: string | null;
    winnerColor: number;
    won: boolean;
    /** Why it ended for you: 'parked' (someone did), 'pedestrian' (you hit one), 'crash' (you touched a car or something hard), 'time'. */
    reason: 'parked' | 'pedestrian' | 'crash' | 'time';
    /** What you hit when you were disqualified for a crash ("Staging", "a parked car", "a post"). */
    hit: string;
    incidents: number;
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
  /** The level you are on (-1 underground .. 2 the roof), its name, whether you are inside the car park, and the colour of the level. */
  level: number;
  levelName: string;
  inGarage: boolean;
  levelColor: number;
  /** The free-spaces board: the two lines of text, and the deck colour of the second line when it names a deck. */
  board: { free: number; line: string; deckColor: number | null };
  /** The stage being played (n is 0 on the home page, where the whole site is open), what is new in it, and how far you have got this visit. */
  stage: { n: number; name: string; news: string; total: number; unlocked: number; hasNext: boolean; /** The stage PLAY starts (the last one picked). */ current: number };
  /** This round has the bonus hint (a circle on the minimap around the free bay). */
  hinted: boolean;
  /** The quality tier being drawn, and whether the game is frozen for an ad. */
  tier: Tier;
  frozen: boolean;
  /** The minimap's tabs and the one being shown. */
  mapLevel: number;
  mapLevels: { level: number; name: string; color: number }[];
}

/** A fixed camera for key art (covers, thumbnails): where the eye is, what it looks at, and which bay to light up. */
export interface Shot {
  eye: [number, number, number];
  look: [number, number, number];
  fov?: number;
  /** The bay whose outline and beam are shown (the free bay of a staged "four cars, one space" moment). */
  bay?: number;
}

export interface GameOptions {
  /** 'race': you drive car 0. 'showcase': four bots, a slow cinematic camera (the home page). */
  mode: 'race' | 'showcase';
  seed?: number;
  onHud?: (hud: HudState) => void;
  /** The words (driver names, radio, plates, shop signs): 'studio' on our site, 'neutral' on portals. Default 'studio'. */
  flavour?: Flavour;
  /** The quality tier to start with (default 'high'), and whether it was picked automatically (then a low frame rate steps it down). */
  tier?: Tier;
  autoTier?: boolean;
  /** Called when the frame-rate guard steps the tier down. */
  onTier?: (tier: Tier) => void;
  /** Enter on the result card: the page decides (it may show an ad break first). Default: `confirm()` at once. */
  onConfirm?: () => void;
  /** Esc pauses (default true). Portals reserve Esc for leaving fullscreen, so they pass false and use P. */
  escPause?: boolean;
  /** The camera to start with (the player's saved choice). Default 'park'. */
  camera?: CameraMode;
  /** Called when the player switches camera (CAM button or C), so the page can remember it. */
  onCamera?: (mode: CameraMode) => void;
  /** Race mode only: start in the menu (bots idle the lot behind it) until `startRace`. */
  menu?: boolean;
}

/** The actions a held key drives (the rest are presses: camera, pause, shifts). */
const HELD: Partial<Record<Action, keyof Pressed>> = { up: 'up', down: 'down', left: 'left', right: 'right', handbrake: 'handbrake', horn: 'horn' };

interface Pressed {
  up: boolean;
  down: boolean;
  left: boolean;
  right: boolean;
  handbrake: boolean;
  horn: boolean;
}

/** How long (s) the cars hold still where they touched when the touch puts you out, before the sim and the fail flow go on. */
const CONTACT_HOLD = 0.4;

const lerpAngle = (a: number, b: number, t: number) => a + Math.atan2(Math.sin(b - a), Math.cos(b - a)) * t;

/** The "!" over a rival that has spotted the free bay: a round orange badge that faces the camera. */
const rivalMark = () => {
  const c = document.createElement('canvas');
  c.width = 128;
  c.height = 128;
  const g = c.getContext('2d')!;
  g.fillStyle = '#ff7a2e';
  g.beginPath();
  g.arc(64, 64, 56, 0, Math.PI * 2);
  g.fill();
  g.lineWidth = 8;
  g.strokeStyle = '#0a0d18';
  g.stroke();
  g.fillStyle = '#ffffff';
  g.font = 'bold 92px Arial, sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText('!', 64, 70);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const m = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false, transparent: true }));
  m.renderOrder = 11;
  m.visible = false;
  return m;
};

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
  const puff = (x: number, y: number, z: number, vx: number, vz: number, amount: number) => {
    const p = smoke[nextSmoke++ % smoke.length];
    p.life = 1;
    p.vx = vx * 0.15 + (Math.random() - 0.5) * 0.6;
    p.vz = vz * 0.15 + (Math.random() - 0.5) * 0.6;
    p.s.position.set(x, y + 0.25, z);
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
  const skid = (ax: number, az: number, bx: number, bz: number, floor: number, strength: number) => {
    const dx = bx - ax;
    const dz = bz - az;
    const len = Math.hypot(dx, dz);
    if (len < 0.01 || len > 2) return;
    const w = 0.11;
    const nx = (-dz / len) * w;
    const nz = (dx / len) * w;
    const i = nextMark++ % MAX;
    const y = floor + 0.02;
    const v = [ax + nx, y, az + nz, ax - nx, y, az - nz, bx + nx, y, bz + nz, ax - nx, y, az - nz, bx - nx, y, bz - nz, bx + nx, y, bz + nz];
    pos.set(v, i * 18);
    for (let k = 0; k < 6; k++) col.set([0.05, 0.05, 0.06, Math.min(0.55, strength * 0.2)], i * 24 + k * 4);
    geo.attributes.position.needsUpdate = true;
    geo.attributes.color.needsUpdate = true;
  };

  // Sparks and bits of plastic on a hard hit.
  const sparks: { s: THREE.Sprite; life: number; v: THREE.Vector3; floor: number }[] = [];
  for (let i = 0; i < 60; i++) {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: dot, color: 0xffc46b, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
    s.visible = false;
    s.scale.setScalar(0.18);
    scene.add(s);
    sparks.push({ s, life: 0, v: new THREE.Vector3(), floor: 0 });
  }
  let nextSpark = 0;
  const burst = (x: number, y: number, z: number, speed: number) => {
    const n = Math.min(22, Math.floor(speed * 2.5));
    for (let i = 0; i < n; i++) {
      const p = sparks[nextSpark++ % sparks.length];
      p.life = 0.5 + Math.random() * 0.4;
      p.v.set((Math.random() - 0.5) * 6, 1.5 + Math.random() * 3, (Math.random() - 0.5) * 6);
      p.s.position.set(x, y + 0.6, z);
      p.floor = y;
      p.s.visible = true;
    }
  };

  // The flash where two bodies touched: a bright soft blob that swells and fades while the cars hold still.
  const flare = new THREE.Sprite(new THREE.SpriteMaterial({ map: dot, color: 0xfff0c8, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, depthTest: false }));
  flare.visible = false;
  flare.renderOrder = 10;
  scene.add(flare);
  let flareLife = 0;
  const FLARE = 0.45;
  /** A touch that puts you out: the flash at the contact point and a shower of sparks from it. */
  const contact = (x: number, y: number, z: number) => {
    flare.position.set(x, y + 0.55, z);
    flare.visible = true;
    flareLife = FLARE;
    burst(x, y - 0.05, z, 7);
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

  const update = (dt: number, t: number, alarms: { x: number; y: number; z: number; h: number }[]) => {
    if (flareLife > 0) {
      flareLife = Math.max(0, flareLife - dt);
      const k = 1 - flareLife / FLARE;
      flare.scale.setScalar(0.35 + 1.25 * Math.sqrt(k));
      (flare.material as THREE.SpriteMaterial).opacity = (1 - k) ** 1.5;
      flare.visible = flareLife > 0;
    }
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
      if (p.s.position.y < p.floor + 0.05) {
        p.s.position.y = p.floor + 0.05;
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
        s.position.set(a.x + fx * lf + fz * ls, a.y + 0.8, a.z + fz * lf - fx * ls);
      }
    }
    for (; k < hazards.length; k++) hazards[k].visible = false;
  };

  return { puff, skid, burst, contact, update };
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
  private pedView = buildPeds(PED.count);
  private prev: { x: number; y: number; z: number; h: number }[] = [];
  private slope: number[] = [];
  private deckParked: THREE.Group[] = [];
  private camSolids: { s: World['solids'][number] }[] = [];
  private hemi!: THREE.HemisphereLight;
  private fill!: THREE.PointLight;
  /** 0 outdoors .. 1 deep underground: how dark and how artificially lit the scene is round the player. */
  private dark = 0;
  private mapPick: number | null = null;
  private mapShown = 0;
  private parked: THREE.Group | null = null;
  private marker = buildTargetMarker();
  /** The free bays' yellow paint (the target, and the second bay when a car pulls out), lit only up close (reveal.ts). */
  private paints = [buildFreeBayPaint(), buildFreeBayPaint()];
  private found = [false, false];
  private fx: HudState['flash'] = null;
  private callout: HudState['callout'] = null;
  private fxId = 0;
  /** Which bots have spotted the bay (they get a "!" over the roof). */
  private rivalMarks: THREE.Sprite[] = [];
  private rivalWarned = false;
  private nearMissAt = -99;
  private lastTick = -1;
  /** Real time until which the world runs in slow motion (the winning park). */
  private slowUntil = -1;
  private fovKick = 0;
  private canopyFade = 1;
  private worldView;
  private ambience;
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
  private cameraMode: CameraMode = 'park';
  private portrait = false;
  private paused = false;
  private endedAt = -1;
  /** Game time you were disqualified at, or -1. */
  private dqAt = -1;
  /**
   * Until this game time the sim waits after you touched something: the cars stay drawn exactly where they met (no gap, no
   * overlap), with a flash and sparks at the contact point, so you see the touch that put you out. -1 when not holding.
   */
  private holdUntil = -1;
  /** The crunch of your touch already played this step (the bump event of the same hit stays quiet). */
  private crunched = false;
  private seed: number;
  private disposed = false;
  private minimap: HTMLCanvasElement | null = null;
  private roundNo = 0;
  /** How far this visit has got (in memory only: a page load starts at stage 1). */
  private progress: Progress = newProgress();
  /** How far the exit barrier is lifted (0..1), eased. */
  private exitOpen = 0;
  private joltSeen: number[] = [];
  private tier: Tier;
  private fpsGuard = new FpsGuard();
  private hinted = false;
  private frozen = false;
  private shot: Shot | null = null;
  /** Settings the page applies live (see `settings.ts`). */
  private keymap: Record<string, Action> = keyMap(DEFAULT_BINDINGS);
  private manual = false;
  /** A shift pressed since the last step (one press is one shift). */
  private shiftQ: 1 | -1 | 0 = 0;
  private shiftId = 0;
  private deniedId = 0;
  private shakeOn = true;
  private calm = false;
  private shadowsOn = true;
  private resScale = 1;
  /** The menu is up: the world idles (bots only) under a slow orbiting camera. */
  private menu = false;
  private pad: PadState | null = null;
  private padPrev: boolean[] = [];
  private halfRate = false;

  /** You are driving car 0 (not the home page's showcase, not the menu). */
  private get racing() {
    return this.opts.mode === 'race' && !this.menu;
  }

  /** Bots only, under the slow cinematic camera (the home page, or the menu). */
  private get idle() {
    return !this.racing;
  }

  constructor(
    private canvas: HTMLCanvasElement,
    private opts: GameOptions,
  ) {
    this.seed = opts.seed ?? Math.floor(Math.random() * 1e6);
    this.tier = opts.tier ?? 'high';
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: TIERS[this.tier].antialias, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, TIERS[this.tier].dprCap));
    this.renderer.shadowMap.enabled = TIERS[this.tier].shadows;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    // Neutral tone mapping keeps paint and foliage saturated (ACES at low exposure washed everything towards grey).
    this.renderer.toneMapping = THREE.NeutralToneMapping;
    this.renderer.toneMappingExposure = 0.92;
    this.camera = new THREE.PerspectiveCamera(62, 1, 0.1, 900);

    // Sky with a low autumn sun from the south-west; the same sky lights the car paint.
    const sky = new Sky();
    sky.scale.setScalar(4000);
    const sunDir = new THREE.Vector3().setFromSphericalCoords(1, THREE.MathUtils.degToRad(90 - 15), THREE.MathUtils.degToRad(215));
    const u = sky.material.uniforms;
    u.turbidity.value = 4.5;
    u.rayleigh.value = 2.8;
    u.mieCoefficient.value = 0.004;
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
    this.scene.environmentIntensity = 0.6;
    this.scene.fog = new THREE.Fog(0xe3bf92, 160, 620);

    this.sun = new THREE.DirectionalLight(0xffb560, 3.6);
    this.sun.position.copy(sunDir).multiplyScalar(80);
    this.sun.castShadow = TIERS[this.tier].shadows;
    this.sun.shadow.mapSize.set(TIERS[this.tier].shadowMap, TIERS[this.tier].shadowMap);
    const sc = this.sun.shadow.camera;
    sc.left = sc.bottom = -34;
    sc.right = sc.top = 34;
    sc.near = 1;
    sc.far = 220;
    this.sun.shadow.bias = -0.0004;
    this.sun.shadow.normalBias = 0.03;
    this.scene.add(this.sun, this.sun.target);
    this.hemi = new THREE.HemisphereLight(0xffdca8, 0x5a4026, 0.55);
    this.scene.add(this.hemi);
    // The light of the car park's strip lamps, moving with the player: off in the open air.
    this.fill = new THREE.PointLight(0xfff0d8, 0, 20, 1.5);
    this.scene.add(this.fill);

    this.lot = buildLot();
    // Portal builds: neutral shop signs (the sim never reads the names).
    const copy = COPY[opts.flavour ?? 'studio'];
    this.lot.shops = this.lot.shops.map((s, i) => ({ ...s, name: copy.shops[i] ?? s.name }));
    if (this.scene.fog instanceof THREE.Fog) this.scene.fog.far = TIERS[this.tier].fogFar;
    this.worldView = buildWorld(this.lot);
    this.ambience = buildAmbience(this.lot);
    this.scene.add(this.worldView.group);
    this.scene.add(this.ambience.group);
    this.scene.add(this.marker.group);
    for (const p of this.paints) this.scene.add(p.group);
    this.rivalMarks = [1, 2, 3].map(() => {
      const m = rivalMark();
      this.scene.add(m);
      return m;
    });
    this.scene.add(this.pedView.group);
    // The free bay is not marked: the outline is only shown for a moment when the round is over.
    this.marker.group.visible = false;
    this.effects = createEffects(this.scene);

    this.cameraMode = opts.camera ?? 'park';
    this.portrait = (canvas.clientWidth || window.innerWidth) < (canvas.clientHeight || window.innerHeight);
    this.newRound();
    this.resize();
    window.addEventListener('resize', this.resize);
    if (opts.mode === 'race') {
      window.addEventListener('keydown', this.onKey);
      window.addEventListener('keyup', this.onKey);
      window.addEventListener('blur', this.onBlur);
    }
    // A game made for the menu starts in it (the portal build); `startRace` turns it into a race.
    if (opts.menu) this.menu = true;
    this.last = performance.now();
    this.raf = requestAnimationFrame(this.frame);
  }

  // ----- round -----

  /** Start a round of the current stage; `hint` adds the bonus hint circle to the minimap for this round. */
  newRound = (opts: { hint?: boolean } = {}) => {
    this.hinted = opts.hint === true;
    this.roundNo++;
    const seed = this.seed + this.roundNo * 101;
    const racing = this.racing;
    const bots = racing ? [false, true, true, true] : [true, true, true, true];
    // The menu idles on the open lot (stage 1), where the glowing bay is in the open air; the home page uses the whole site.
    const stage = racing ? this.progress.current : this.menu ? 1 : undefined;
    const { state, world } = createRound(this.lot, { seed, bots, stage, flavour: this.opts.flavour, manual: racing && this.manual });
    this.shiftQ = 0;
    this.state = state;
    this.world = world;
    this.brains = state.cars.map((c) => (c.bot ? createBrain(world, c, seed) : null));
    this.prev = this.allCars().map((c) => ({ x: c.x, y: c.y, z: c.z, h: c.h }));
    this.slope = this.allCars().map(() => 0);
    this.wheelPrev = this.allCars().map(() => []);
    this.endedAt = -1;
    this.dqAt = -1;
    this.holdUntil = -1;
    this.paused = false;
    this.found = [false, false];
    this.fx = null;
    this.callout = null;
    this.rivalWarned = false;
    this.lastTick = -1;
    this.slowUntil = -1;

    // Parked cars: everything except the free bay.
    if (this.parked) {
      this.scene.remove(this.parked);
      this.parked.traverse((o) => (o as THREE.Mesh).geometry?.dispose());
    }
    // Drawn where the sim's collider is (`parkedSpot`), as the body style its collider is shaped from.
    const spotOf = (b: Lot['bays'][number]) => ({ ...parkedSpot(b), style: b.variant, color: b.color });
    const open = this.lot.bays.filter((b) => !b.garage && b.use === 'car' && b.id !== state.target && b.id !== state.leaver?.bay).map(spotOf);
    // The delivery van in the yard is a tall van like the ones in the bays.
    for (const p of this.lot.props) if (p.kind === 'van') open.push({ x: p.x, z: p.z, h: p.h, style: 4, color: p.color ?? 0x2a4d8f });
    this.parked = buildParked(open);
    this.parked.add(this.bayProps(this.lot.bays.filter((b) => !b.garage), 0));
    this.scene.add(this.parked);
    // Each deck of the car park has its own group of parked cars (hidden with the deck, so the ones out of sight cost nothing).
    for (const g of this.deckParked) {
      g.parent?.remove(g);
      g.traverse((o) => (o as THREE.Mesh).geometry?.dispose());
    }
    this.deckParked = [];
    for (const L of LEVELS) {
      const spots = this.lot.bays.filter((b) => b.garage && b.lvl === L && b.use === 'car' && b.id !== state.target && b.id !== state.leaver?.bay).map(spotOf);
      const g = buildParked(spots);
      // The trolley corrals and cones on this deck stand in it too, hidden with it.
      g.add(this.bayProps(this.lot.bays.filter((b) => b.garage && b.lvl === L), levelY(L)));
      g.position.y = levelY(L);
      this.worldView.garage.decks.get(L)?.add(g);
      this.deckParked.push(g);
    }
    // The barriers of the ways this stage keeps shut.
    const stageOpen = world.lot.open;
    this.worldView.setClosures(stageOpen ? this.lot.closures.filter((c) => isShut(c, stageOpen)).map((c) => c.id) : []);
    this.camSolids = world.solids.map((sh, i) => ({ sh, i })).filter(({ sh, i }) => sh.y0 !== undefined && world.owner[i] === -1).map(({ sh }) => ({ s: sh }));

    this.marker.group.visible = false;

    for (const r of this.rigs) this.scene.remove(r.root);
    const plates = COPY[this.opts.flavour ?? 'studio'].plates;
    this.rigs = this.allCars().map((c) => {
      const rig = buildRacer(c.color, plates[c.id]);
      this.scene.add(rig.root);
      return rig;
    });
    for (const e of this.engines) e.stop();
    this.engines = [];
    this.rpm = this.allCars().map(() => 850);

    // Camera starts where the chosen view puts it (the home page's showcase eases in from behind the car).
    const me = state.cars[0];
    this.cam.yaw = me.h;
    if (this.cameraMode === 'park' && this.racing) {
      const { eye, look } = parkPose(me.x, 0, me.z, me.h, 0, this.portrait);
      [this.cam.x, this.cam.y, this.cam.z] = eye;
      this.cam.look.set(...look);
    } else {
      this.cam.x = me.x - Math.sin(me.h) * 7;
      this.cam.z = me.z - Math.cos(me.h) * 7;
      this.cam.y = 3;
      this.cam.look.set(me.x, 1, me.z);
    }
  };

  /** The racers and, if there is one, the parked car that pulls out. */
  private allCars(): Car[] {
    return this.state.leaver ? [...this.state.cars, this.state.leaver.car] : this.state.cars;
  }

  /** Trolley corrals and traffic cones in the bays that hold them. */
  /** Trolley corrals and cones in `bays`, in a group that sits at height `y0` (a deck's group, or the ground). */
  private bayProps(bays: Lot['bays'], y0: number) {
    const g = new THREE.Group();
    const metal = new THREE.MeshStandardMaterial({ color: 0xb4b9c0, roughness: 0.35, metalness: 0.85 });
    const cone = new THREE.MeshStandardMaterial({ color: 0xf06a1d, roughness: 0.6 });
    const white = new THREE.MeshStandardMaterial({ color: 0xf2f2f2, roughness: 0.6 });
    for (const b of bays) {
      if (b.use === 'corral') {
        const c = new THREE.Group();
        // Rails 6 cm thick whose outer faces are the sim's corral box.
        for (const sx of [-(CORRAL.hw - 0.03), CORRAL.hw - 0.03]) {
          const rail = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.06, 2 * CORRAL.hl - 0.06), metal);
          rail.position.set(sx, 1.0, 0);
          c.add(rail);
          for (const z of [-2.2, 0, 2.2]) {
            const post = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 1.0, 6), metal);
            post.position.set(sx, 0.5, z);
            c.add(post);
          }
        }
        const back = new THREE.Mesh(new THREE.BoxGeometry(1.76, 0.06, 0.06), metal);
        back.position.set(0, 1.0, CORRAL.hl - 0.03);
        c.add(back);
        // A couple of trolleys left in it.
        for (const z of [1.2, 0.6]) {
          const t = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.45, 0.85), metal);
          t.position.set(0, 0.65, z);
          c.add(t);
        }
        c.position.set(b.x, b.y - y0, b.z);
        c.rotation.y = b.h;
        c.traverse((o) => (o.castShadow = true));
        g.add(c);
      } else if (b.use === 'cones') {
        // One cone on each of the sim's solid cones.
        for (const p of bayCones(b)) {
          const k = new THREE.Group();
          const body = new THREE.Mesh(new THREE.ConeGeometry(CONE_R, 0.7, 14), cone);
          body.position.y = 0.37;
          const band = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.16, 0.1, 14), white);
          band.position.y = 0.42;
          const foot = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.04, 0.5), cone);
          foot.position.y = 0.02;
          k.add(body, band, foot);
          k.position.set(p.x, b.y - y0, p.z);
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
    // The menus own the keyboard while they are up (and a key being rebound is never driving).
    if (this.menu || (e.target as HTMLElement | null)?.closest?.('[data-keys-capture]')) return;
    const action = this.keymap[e.code];
    const held = action ? HELD[action] : undefined;
    if (held) {
      this.keys[held] = down;
      e.preventDefault();
      this.sfx.unlock();
    }
    if (down && !e.repeat) {
      if (action === 'camera') this.cycleCamera();
      if (action === 'shiftUp') this.shift(1);
      if (action === 'shiftDown') this.shift(-1);
    }
    if (down && !e.repeat && (action === 'pause' || (e.code === 'Escape' && this.opts.escPause !== false))) this.setPaused(!this.paused);
    if (down && e.code === 'Enter' && (this.state.phase === 'done' || this.state.cars[0].dq !== null)) {
      // (the result card's focused button would also click on Enter: one press, one action)
      e.preventDefault();
      (this.opts.onConfirm ?? this.confirm)();
    }
  };

  // ----- stages -----

  /** The result card's main button: the next stage after a win (when there is one), otherwise the same stage again. */
  confirm = () => {
    if (this.state.winner === 0 && hasNext(this.progress)) this.nextStage();
    else this.newRound();
  };

  /** Go on to the stage after this one (only once it is unlocked). */
  nextStage = () => {
    this.progress = next(this.progress);
    this.newRound();
  };

  /** Start an unlocked stage (a locked one does nothing). */
  selectStage = (n: number) => {
    this.progress = pick(this.progress, n);
    this.newRound();
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
    this.cameraMode = CAMERA_MODES[(CAMERA_MODES.indexOf(this.cameraMode) + 1) % CAMERA_MODES.length];
    this.opts.onCamera?.(this.cameraMode);
    this.emitHud(true);
  };

  /** Shift the manual gearbox one gear (keys, the pad's bumpers, the phone's + / − buttons). Applied on the next step. */
  shift = (dir: 1 | -1) => {
    if (!this.manual || !this.racing || this.paused) return;
    this.shiftQ = dir;
    this.sfx.unlock();
  };

  // ----- settings (applied live by the page; see settings.ts) -----

  setBindings = (map: Record<string, Action>) => {
    this.keymap = map;
    this.onBlur();
  };

  /** Automatic or manual for the player's car; a change applies at once (a manual car starts in 1st). */
  setTransmission = (t: Transmission) => {
    const on = t === 'manual';
    if (on === this.manual) return;
    this.manual = on;
    const me = this.state?.cars[0];
    if (me && this.racing) {
      me.box = on ? 'manual' : 'auto';
      me.mgear = 1;
      me.rpm = 0;
    }
    this.emitHud(true);
  };

  setCameraMode = (m: CameraMode) => {
    if (m === this.cameraMode) return;
    this.cameraMode = m;
    this.emitHud(true);
  };

  /** Crash shake on or off (also off with reduced motion). */
  setShake = (on: boolean) => {
    this.shakeOn = on;
  };

  /** Reduced motion: no shake, no speed zoom, the menu camera holds still. */
  setCalm = (on: boolean) => {
    this.calm = on;
  };

  /** Shadows (only where the tier draws them) and the resolution scale (0.5..1 of the tier's pixel ratio). */
  setRenderPrefs = (p: { shadows: boolean; resolution: number }) => {
    if (p.shadows === this.shadowsOn && p.resolution === this.resScale) return;
    this.shadowsOn = p.shadows;
    this.resScale = p.resolution;
    this.setTier(this.tier);
  };

  /** 'Auto' quality: the frame-rate guard may step the tier down. */
  setAutoTier = (on: boolean) => {
    this.opts.autoTier = on;
  };

  /** The player's own mute (the Audio tab), on top of the portal's and the ad's. */
  setUserMuted = (on: boolean) => this.sfx.setMuted('user', on);

  /** A soft tick for menu focus and a click for menu choices (sound needs a first click or key press to start). */
  uiSound = (kind: 'move' | 'pick' | 'back') => {
    if (kind === 'move') this.sfx.ui(0);
    else if (kind === 'pick') this.sfx.ui(1);
    else this.sfx.ui(-1);
  };

  // ----- menu -----

  /** Back to the menu: the race is dropped and the bots idle the lot. Progress (unlocked stages) is kept. */
  enterMenu = () => {
    this.menu = true;
    this.paused = false;
    this.onBlur();
    this.newRound();
    this.emitHud(true);
  };

  /** Leave the menu and start a round: of `stage` if given (and unlocked), else of the current stage. */
  startRace = (stage?: number) => {
    this.menu = false;
    if (stage !== undefined) this.progress = pick(this.progress, stage);
    this.newRound();
    this.emitHud(true);
  };

  setPaused = (p: boolean) => {
    if (!this.racing || this.state.phase === 'done') return;
    this.paused = p;
    this.emitHud(true);
  };

  /** Freeze the game and silence it while a video ad plays (the ad has started; it is not frozen while one is only requested). */
  setFrozen = (on: boolean) => {
    this.frozen = on;
    this.keys = { up: false, down: false, left: false, right: false, handbrake: false, horn: false };
    this.touch = null;
    this.sfx.setMuted('ad', on);
    this.last = performance.now();
    this.emitHud(true);
  };

  /** The portal's own mute button. */
  setPortalMuted = (on: boolean) => this.sfx.setMuted('portal', on);

  /** Draw at another quality tier: pixel ratio, shadows and view distance change at once (antialiasing on the next load). */
  setTier = (tier: Tier) => {
    const spec = TIERS[tier];
    const hadShadows = this.renderer.shadowMap.enabled;
    this.tier = tier;
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, spec.dprCap) * this.resScale);
    this.renderer.shadowMap.enabled = spec.shadows;
    this.sun.castShadow = spec.shadows;
    if (!this.shadowsOn) {
      this.renderer.shadowMap.enabled = false;
      this.sun.castShadow = false;
    }
    if (this.sun.shadow.mapSize.x !== spec.shadowMap) {
      this.sun.shadow.mapSize.set(spec.shadowMap, spec.shadowMap);
      this.sun.shadow.map?.dispose();
      this.sun.shadow.map = null as unknown as THREE.WebGLRenderTarget;
    }
    if (this.scene.fog instanceof THREE.Fog) this.scene.fog.far = spec.fogFar;
    // Turning shadows on or off changes the shaders: every material must recompile once.
    if (hadShadows !== this.renderer.shadowMap.enabled) this.scene.traverse((o) => {
      const m = (o as THREE.Mesh).material;
      if (m) for (const mm of Array.isArray(m) ? m : [m]) mm.needsUpdate = true;
    });
    this.resize();
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

  private playerInput(): Input {
    const k = this.keys;
    const t = this.touch;
    const p = this.pad;
    const shift = this.shiftQ || undefined;
    this.shiftQ = 0;
    return {
      throttle: Math.max(k.up ? 1 : 0, t?.throttle ?? 0, p?.throttle ?? 0),
      brake: Math.max(k.down ? 1 : 0, t?.brake ?? 0, p?.brake ?? 0),
      steer: Math.max(-1, Math.min(1, (k.right ? 1 : 0) - (k.left ? 1 : 0) + (t?.steer ?? 0) + (p?.steer ?? 0))),
      handbrake: k.handbrake || !!t?.handbrake || !!p?.handbrake,
      horn: k.horn || !!t?.horn || !!p?.horn,
      shift,
    };
  }

  /** The gamepad, once per frame: held controls feed `playerInput`, presses (camera, shifts, pause) act at once. */
  private pollPad() {
    const p = this.racing ? readPad() : null;
    this.pad = p;
    if (!p) return;
    const was = this.padPrev;
    const hit = (i: number) => !!p.buttons[i] && !was[i];
    if (hit(9)) this.setPaused(!this.paused);
    if (!this.paused) {
      if (hit(3)) this.cycleCamera();
      if (hit(5)) this.shift(1);
      if (hit(4)) this.shift(-1);
    }
    this.padPrev = p.buttons;
    if (p.throttle > 0 || p.brake > 0) this.sfx.unlock();
  }

  // ----- loop -----

  private resize = () => {
    const w = this.canvas.clientWidth || window.innerWidth;
    const h = this.canvas.clientHeight || window.innerHeight;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    // Portrait phones: widen the view so the car and the lane ahead both fit.
    this.portrait = w < h;
    this.camera.fov = (w < h ? 78 : 62) + this.fovKick;
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
    this.pollPad();
    if (this.opts.autoTier && !this.paused && !this.frozen && this.state.phase === 'race' && this.tier !== 'low' && this.fpsGuard.frame(dt)) {
      this.setTier(lowerTier(this.tier));
      this.opts.onTier?.(this.tier);
    }
    if (!this.paused && !this.frozen) {
      this.time += dt;
      if (this.holdUntil >= 0 && this.time >= this.holdUntil) this.endHold();
      // The winning park plays in slow motion for a moment; the touch that put you out holds still (see `holdUntil`).
      if (this.holdUntil < 0) this.acc += this.time < this.slowUntil ? dt * 0.3 : dt;
      while (this.acc >= DT && this.holdUntil < 0) {
        this.acc -= DT;
        this.tick();
      }
    }
    // Behind the menu on the low tier, draw every other frame (the backdrop is slow; the battery and the fan thank us).
    this.halfRate = this.menu && this.tier === 'low' && !this.halfRate;
    // While holding, draw the step the touch happened in as it is: the sim has just set the bodies exactly against each other.
    if (!this.halfRate) this.draw(dt, this.paused || this.frozen || this.holdUntil >= 0 ? 1 : this.acc / DT);
    if (now - this.hudAt > 100) {
      this.hudAt = now;
      this.emitHud(false);
    }
  };

  private tick() {
    const s = this.state;
    this.prev = this.allCars().map((c) => ({ x: c.x, y: c.y, z: c.z, h: c.h }));
    const inputs = s.cars.map((c, i) => {
      const brain = this.brains[i];
      if (brain) return botInput(s, this.world, c, brain);
      return this.racing && i === 0 ? this.playerInput() : NO_INPUT;
    });
    step(s, this.world, inputs);
    const me = s.cars[0];
    if (this.racing && me.shifted) {
      if (me.shifted === 'denied') {
        this.deniedId++;
        this.sfx.grind();
      } else {
        this.shiftId++;
        this.sfx.shift(me.shifted === 'up');
        // A little jolt through the body on a shift under load.
        if (me.throttle > 0.3 && me.shifted === 'up') me.jolt = Math.max(me.jolt, 0.25);
      }
      this.emitHud(true);
    }
    // What the bots did on their own (spotted the bay, honked, backed out) goes to the radio with the sim's events.
    const botEvents = this.brains.flatMap((b) => (b ? b.outbox.splice(0) : []));
    radio(s, [...s.events, ...botEvents]);
    if (this.racing) this.tension(botEvents);
    this.crunched = false;
    for (const e of s.events) {
      if (e.type === 'count') this.sfx.beep(false);
      else if (e.type === 'go') this.sfx.beep(true);
      else if (e.type === 'bump') {
        const near = this.focusCar();
        const d = Math.hypot(e.x - near.x, e.z - near.z);
        // The hit that put you out already crunched, and shakes once the hold is over.
        if (this.crunched && (e.car === 0 || e.other === 0)) continue;
        if (e.car === 0 || e.other === 0 || this.idle) this.trauma = Math.min(1, this.trauma + Math.min(0.6, e.speed * 0.07) * (d < 8 ? 1 : 0.3));
        this.sfx.bump(e.speed, e.x, e.z, e.bay >= 0 || e.other >= 0);
        if (e.speed > 3) this.effects.burst(e.x, this.allCars()[e.car]?.y ?? 0, e.z, e.speed);
      } else if (e.type === 'alarm') {
        const b = this.lot.bays[e.bay];
        this.sfx.alarm(b.x, b.z, 9);
      } else if (e.type === 'incident') {
        this.sfx.shout(e.x, e.z);
        this.effects.burst(e.x, this.allCars()[e.car]?.y ?? 0, e.z, 3);
        if (e.car === 0 && this.racing) {
          this.trauma = 1;
          this.dqAt = this.time;
          if (this.endedAt < 0) this.endedAt = this.time;
          this.sfx.lose();
        }
      } else if (e.type === 'crash') {
        if (e.car === 0 && this.racing) {
          // Show the touch: hold the cars where they met, flash and spark at the contact point, crunch. Then the usual
          // way out (the shake, the sting and, a moment later, the result).
          this.holdUntil = this.time + CONTACT_HOLD;
          this.acc = 0;
          this.effects.contact(e.x, this.allCars()[e.car]?.y ?? 0, e.z);
          this.sfx.bump(Math.max(5, e.speed), e.x, e.z, true);
          this.crunched = true;
          this.dqAt = this.time;
          if (this.endedAt < 0) this.endedAt = this.time;
        } else if (e.speed <= 1.2) this.sfx.bump(e.speed, e.x, e.z, true);
      } else if (e.type === 'leave') {
        const b = this.lot.bays[e.bay];
        this.sfx.toot(b.x, b.z);
      } else if (e.type === 'end') {
        if (this.endedAt < 0) this.endedAt = this.time;
        if (this.racing) {
          if (e.winner !== null) this.slowUntil = this.time + 1.2;
          if (e.winner === 0) {
            this.sfx.win();
            this.progress = won(this.progress);
            // A steal: a rival was right there, going for it too.
            const bay = this.lot.bays[s.winBay];
            const close = s.cars.some((c) => c.id !== 0 && (this.brains[c.id]?.spotted ?? false) && Math.hypot(c.x - bay.x, c.z - bay.z) < 12);
            this.pop('win', close ? 'STOLEN IT!' : 'PARKED!', 'good');
          } else {
            this.sfx.lose();
            const me = s.cars[0];
            if (me.dq === null) this.pop('lose', e.winner === null ? 'TIME UP' : me.park > 0.25 ? 'SO CLOSE!' : `${s.cars[e.winner].name.toUpperCase()} GOT IT`, 'bad');
          }
        }
      }
    }
    // Home page: start the next round a few seconds after someone parks.
    if (this.idle && s.phase === 'done' && this.time - this.endedAt > 4) this.newRound();
  }

  /** The contact hold is over: the sim runs on, and you are told you are out. */
  private endHold() {
    this.holdUntil = -1;
    this.trauma = 1;
    this.sfx.lose();
  }

  /** Show a flash and a word (both optional), and push the HUD at once. */
  private pop(flash: 'found' | 'win' | 'lose' | null, text: string | null, tone: 'good' | 'bad' | 'warn' = 'good') {
    this.fxId++;
    if (flash) this.fx = { id: this.fxId, kind: flash };
    if (text) this.callout = { id: this.fxId, text, tone };
    this.emitHud(true);
  }

  /** The race's tension, once a tick: a rival spotting the bay, near misses, the last ten seconds. */
  private tension(botEvents: { type: string; car?: number }[]) {
    const s = this.state;
    if (s.phase !== 'race') return;
    const me = s.cars[0];
    if (!this.rivalWarned && me.parkedAt === null && me.dq === null && botEvents.some((e) => e.type === 'spot')) {
      this.rivalWarned = true;
      this.sfx.sting();
      this.pop(null, 'A RIVAL SPOTTED IT!', 'warn');
    }
    // Near miss: another car slides past your side, close, while you are quick, and nobody touched.
    const v = Math.hypot(me.vx, me.vz);
    if (v > NEAR_MISS.speed && this.time - this.nearMissAt > NEAR_MISS.cooldown && me.dq === null) {
      for (const c of s.cars) {
        if (c.id === 0 || Math.abs(c.y - me.y) > 1.5) continue;
        const dx = c.x - me.x;
        const dz = c.z - me.z;
        const side = Math.abs(dx * Math.cos(me.h) - dz * Math.sin(me.h));
        const along = Math.abs(dx * Math.sin(me.h) + dz * Math.cos(me.h));
        if (side > 1.75 && side < NEAR_MISS.gap && along < 2.2) {
          this.nearMissAt = this.time;
          this.sfx.whoosh();
          this.pop(null, 'CLOSE ONE!', 'warn');
          break;
        }
      }
    }
    // The last ten seconds tick.
    const left = Math.ceil(s.maxTime - s.clock);
    if (left <= 10 && left > 0 && left !== this.lastTick) {
      this.lastTick = left;
      this.sfx.tick(left <= 3);
    }
  }

  /** The free bays' paint: hidden until you are close, then a "found it" moment; the bots' "!" when they have seen it. */
  private updatePaint(t: number) {
    const s = this.state;
    const race = this.racing && s.phase !== 'countdown';
    const me = this.rigs[0]?.root.position;
    [s.target, s.extra].forEach((id, k) => {
      const paint = this.paints[k];
      if (this.menu && k === 0 && id >= 0) {
        // The menu shows the prize: the free bay glowing yellow.
        const bay = this.lot.bays[id];
        paint.group.position.set(bay.x, bay.y, bay.z);
        paint.group.rotation.y = bay.h;
        paint.group.scale.set(bay.w / BAY.width, 1, bay.d / BAY.depth);
        paint.set(1, t);
        return;
      }
      if (!race || s.phase === 'done' || id < 0 || !me || this.shot) {
        paint.set(0, t);
        return;
      }
      const bay = this.lot.bays[id];
      const r = revealOf(Math.hypot(bay.x - me.x, bay.z - me.z), bay.y - me.y, this.found[k]);
      if (r.found && !this.found[k] && s.cars[0].dq === null) {
        this.found[k] = true;
        this.sfx.found();
        this.pop('found', 'FOUND IT!', 'good');
      }
      paint.group.position.set(bay.x, bay.y, bay.z);
      paint.group.rotation.y = bay.h;
      paint.group.scale.set(bay.w / BAY.width, 1, bay.d / BAY.depth);
      // The deck it is on may be hidden (looking from another level): then so is the paint.
      paint.set(this.worldView.garage.floorShown(bay.x, bay.y + 0.1, bay.z) ? r.paint : 0, t);
    });
    this.rivalMarks.forEach((m, i) => {
      const c = s.cars[i + 1];
      const rig = this.rigs[i + 1];
      const on = race && s.phase === 'race' && !!c && !!rig && rig.root.visible && c.parkedAt === null && (this.brains[i + 1]?.spotted ?? false);
      m.visible = on;
      if (on) {
        m.position.set(rig.root.position.x, rig.root.position.y + 2.6 + Math.sin(t * 6) * 0.15, rig.root.position.z);
        const k = this.cameraMode === 'park' ? 2.6 : 1.3;
        m.scale.set(k, k, 1);
      }
    });
    // In the parking view the carport roof goes see-through when you are near it, so the bays under it read like any others.
    for (const c of this.worldView.canopies) {
      const near = !!me && this.cameraMode === 'park' && this.racing && me.x > c.x0 - REVEAL.far && me.x < c.x1 + REVEAL.far && me.z > c.z0 - REVEAL.far && me.z < c.z1 + REVEAL.far;
      this.canopyFade += ((near ? 0.22 : 1) - this.canopyFade) * 0.08;
      c.fade(this.canopyFade);
    }
  }

  private focusCar() {
    if (this.racing) return this.state.cars[0];
    // Showcase: follow whoever is closest to the free bay.
    return [...this.state.cars].sort((a, b) => distanceToTarget(this.state, this.world, a) - distanceToTarget(this.state, this.world, b))[0];
  }

  private draw(dt: number, alpha: number) {
    const s = this.state;
    const t = this.time;
    this.allCars().forEach((c, i) => {
      const rig = this.rigs[i];
      if (!rig) return;
      const p = this.prev[i] ?? c;
      const x = p.x + (c.x - p.x) * alpha;
      const z = p.z + (c.z - p.z) * alpha;
      const y = p.y + (c.y - p.y) * alpha;
      const h = lerpAngle(p.h, c.h, alpha);
      rig.root.position.set(x, y, z);
      rig.root.rotation.order = 'YXZ';
      rig.root.rotation.y = h;
      // On a ramp the whole car leans with the slope (the nose lifts going up, dips going down).
      this.slope[i] += ((c.grade || 0) - (this.slope[i] ?? 0)) * Math.min(1, dt * 8);
      rig.root.rotation.x = -Math.atan(this.slope[i]);
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
      // A speed bump kicks the body (the sim slowed the car and set `jolt`).
      if (c.jolt > (this.joltSeen[i] ?? 0) + 0.2) rig.pitchV += 5 * c.jolt;
      this.joltSeen[i] = c.jolt;
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
          if (prevW[k]) this.effects.skid(prevW[k].x, prevW[k].z, w.x, w.z, c.y, c.slip);
        });
        if (Math.random() < Math.min(0.9, c.slip * 0.12)) {
          const w = wheels[Math.floor(Math.random() * 2)];
          this.effects.puff(w.x, c.y, w.z, c.vx, c.vz, Math.min(1, c.slip / 5));
        }
      }
      this.wheelPrev[i] = sliding ? wheels : [];

      // Engine note: revs from the road speed through a five-speed automatic, plus the throttle.
      const v = Math.abs(vF);
      let rpm: number;
      if (c.box === 'manual' && s.phase !== 'countdown') rpm = c.rpm + (c.limiter ? Math.sin(this.time * 55) * 380 - 200 : 0);
      else if (c.box === 'manual' && c.mgear !== 0 && c.throttle > 0) rpm = 850 + c.throttle * 5400;
      else if (s.phase === 'countdown') rpm = 850 + c.throttle * 5200;
      else if (c.gear === -1) rpm = 900 + (v / 4) * 3600 + c.throttle * 400;
      else {
        const shifts = [0, 2.2, 4.4, 6.6, 8.6, 30];
        let g = 0;
        while (g < 4 && v > shifts[g + 1]) g++;
        const frac = (v - shifts[g]) / (shifts[g + 1] - shifts[g]);
        rpm = v < 0.3 && c.throttle === 0 ? 850 : 1500 + frac * 4200 + c.throttle * 500;
      }
      this.rpm[i] += (rpm - this.rpm[i]) * Math.min(1, dt * 10);
    });

    // Sound: engines follow their cars, the listener rides with the camera.
    if (this.engines.length === 0 && this.racing) {
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

    // The free bay is not marked while the round is on. Only when it is over, a short reveal of
    // where it was (the bay the winner took).
    const shotBay = this.shot?.bay;
    // The menu shows the prize: the free bay's beam and outline stand over the lot while the bots hunt for it.
    const menuBay = this.menu && s.phase !== 'done';
    const reveal = shotBay !== undefined || menuBay || (s.phase === 'done' && this.time - this.endedAt < 6 && this.endedAt >= 0);
    this.marker.group.visible = reveal;
    if (reveal) {
      const bay = this.lot.bays[shotBay ?? (s.winBay >= 0 ? s.winBay : s.target)];
      this.marker.group.position.set(bay.x, bay.y, bay.z);
      this.marker.group.rotation.y = bay.h;
      this.marker.group.scale.set(bay.w / BAY.width, 1, bay.d / BAY.depth);
      const fade = shotBay !== undefined || menuBay ? 1 : Math.min(1, (this.time - this.endedAt) * 2) * Math.min(1, (6 - (this.time - this.endedAt)) * 2);
      this.marker.lineMat.opacity = 0.95 * fade;
      this.marker.fillMat.opacity = shotBay !== undefined ? 0.32 : menuBay ? 0.22 + Math.sin(t * 2.4) * 0.08 : (0.12 + Math.sin(t * 4) * 0.05) * fade;
      this.marker.beamMat.uniforms.uTime.value = t;
      this.marker.sign.position.y = 3.4 + Math.sin(t * 2) * 0.15;
      (this.marker.sign.material as THREE.SpriteMaterial).opacity = fade;
    }
    this.updatePaint(t);
    // Which decks are drawn first, then whatever stands on a hidden one goes with it (or it hangs in the sky).
    this.updateGarage(dt);
    const floorShown = this.worldView.garage.floorShown;
    this.allCars().forEach((c, i) => {
      const rig = this.rigs[i];
      if (rig) rig.root.visible = c.x < 5000 && floorShown(rig.root.position.x, rig.root.position.y, rig.root.position.z);
    });
    this.pedView.update(s.peds, t, floorShown);

    // Alarms going off.
    const alarms: { x: number; y: number; z: number; h: number }[] = Object.entries(s.alarms)
      .filter(([, until]) => until > s.t)
      .map(([id]) => this.lot.bays[Number(id)]);
    // A disqualified car pulls over with its hazards on.
    for (const c of s.cars) if (c.dq !== null) alarms.push({ x: c.x, y: c.y, z: c.z, h: c.h });
    // Not on a deck that is hidden (the lights would blink in mid-air).
    this.effects.update(dt, t, alarms.filter((a) => floorShown(a.x, a.y, a.z)));
    this.worldView.trees.update(t);
    this.ambience.update(t, dt);
    this.worldView.signs.forEach((m, i) => (m.emissiveIntensity = 1.3 + (Math.sin(t * 37 + i * 5) > 0.97 ? -0.6 : 0)));
    // The entry barriers lift from the sim's gate; the exit one lifts for the car that is pulling out and drives to it.
    const exit = this.lot.gates.find((g) => g.kind === 'exit')!;
    const lv = s.leaver;
    const nearExit = lv && lv.phase === 'out' ? Math.hypot(lv.car.x - (exit.px + exit.tx) / 2, lv.car.z - exit.z) < 13 : false;
    this.exitOpen += ((nearExit ? 1 : 0) - this.exitOpen) * Math.min(1, dt * 2.2);
    this.worldView.setGates(s.gate.open, this.exitOpen);

    this.updateCamera(dt);
    this.drawMinimap();
    this.renderer.render(this.scene, this.camera);
  }

  /** Is the car inside the car park's footprint (the walls), and on which level? */
  private garageOf(x: number, z: number, y: number) {
    const g = this.lot.garage;
    const inside = x > g.x0 && x < g.x1 && z > g.z0 && z < g.z1;
    return { inside, level: levelOf(y) };
  }

  /**
   * The car park round the player: only the decks next to the player's are drawn, the light inside
   * is the strip lamps (the sky light is turned down and a lamp follows the car), and underground is darker.
   */
  private updateGarage(dt: number) {
    const car = this.focusCar();
    const rig = this.rigs[car.id];
    const { inside, level } = this.garageOf(rig.root.position.x, rig.root.position.z, rig.root.position.y);
    const high = this.cameraMode !== 'chase' || this.idle;
    this.worldView.garage.showAround(inside ? level : null, inside && high);
    // How enclosed the player is: nothing on the open roof or outside, most on P-1.
    const enclosed = !inside ? 0 : level === 2 ? 0 : level === 1 ? 0.55 : level === 0 ? 0.75 : 1;
    this.dark += (enclosed - this.dark) * Math.min(1, dt * 4);
    const d = this.dark;
    this.hemi.intensity = 0.55 * (1 - 0.72 * d);
    this.scene.environmentIntensity = 0.6 * (1 - 0.8 * d);
    this.fill.position.set(rig.root.position.x, rig.root.position.y + 2.6, rig.root.position.z);
    this.fill.intensity = d * 38;
    this.fill.color.setHex(level < 0 ? 0xcfe0ff : 0xfff0d8);
    // The boards: the one over the gate, and the one at the car park's door.
    const hint = hintOf(this.state, this.world.lot);
    const [head, tail] = hintLines(hint);
    // The number blinks like a real LED sign while the cars wait, and once a second afterwards.
    const blink = this.state.phase === 'countdown' ? Math.floor(this.time * 2) % 2 === 0 : Math.floor(this.time * 1.2) % 6 !== 0;
    const lit = head.replace(/\d+$/, (n) => (blink ? n : ' '.repeat(n.length)));
    const color = hint.showing !== null ? '#' + LEVEL_COLOR[hint.showing].toString(16).padStart(6, '0') : '#ff7a2e';
    const rows = [{ text: lit, size: tail ? 12 : 16 }, ...(tail ? [{ text: tail, size: 13, color }] : [])];
    this.worldView.setBoothBoard(rows);
    this.worldView.garage.setBoard([{ text: 'GARAGE', size: 9, color: '#ffffff' }, ...rows.map((r) => ({ ...r, size: Math.min(r.size, 11) }))]);
  }

  private updateCamera(dt: number) {
    const s = this.state;
    const car = this.focusCar();
    const rig = this.rigs[car.id];
    const x = rig.root.position.x;
    const y = rig.root.position.y;
    const z = rig.root.position.z;
    const h = rig.root.rotation.y;
    const showcase = this.idle;
    const { inside, level } = this.garageOf(x, z, y);
    // Under a deck the ceiling is 3.1 m up: the camera stays under it.
    const ceil = inside && level < 2 && this.cameraMode === 'chase' ? levelY(level) + LEVEL_H - 0.5 - 0.7 : Infinity;
    let want: THREE.Vector3;
    let look: THREE.Vector3;
    if (this.menu) {
      // The menu: a slow orbit round the glowing free bay, high enough to read the lot, with the look point pushed to the
      // left of the bay so the bay sits in the open right side of the screen (the menu column covers the left).
      const bay = this.lot.bays[Math.max(0, s.target)];
      const a = (this.calm ? 0 : this.time * 0.045) + 2.4;
      const r = this.portrait ? 30 : 34;
      want = new THREE.Vector3(bay.x + Math.sin(a) * r, bay.y + (this.portrait ? 19 : 14), bay.z + Math.cos(a) * r);
      const side = this.portrait ? 0 : 9;
      look = new THREE.Vector3(bay.x - Math.cos(a) * side, bay.y + 0.5, bay.z + Math.sin(a) * side);
      // Start in place (no swoop from the old camera), then follow the orbit.
      if (this.cam.y < 8) {
        this.cam.x = want.x;
        this.cam.y = want.y;
        this.cam.z = want.z;
        this.cam.look.copy(look);
      }
    } else if (showcase) {
      // A slow sway behind and above the leader, always looking north up the lot so the frame is
      // cars, bays and the store sign (never the road or the empty grass behind the camera).
      const a = Math.sin(this.time * 0.1) * 0.55 + 0.25;
      want = new THREE.Vector3(x - Math.sin(a) * 16, y + 6.2, z - Math.cos(a) * 16);
      look = new THREE.Vector3(x + 5 + Math.sin(a) * 4, y + 0.9, z + 13);
    } else if (this.cameraMode === 'park') {
      // The parking view (view.ts): high and tilted, turning slowly with the car. The decks above are hidden (updateGarage),
      // so it sees into the car park from above and is never inside a ceiling, a wall or a ramp.
      const vF = forwardSpeed(s.cars[car.id]);
      this.cam.yaw = lerpAngle(this.cam.yaw, h, Math.min(1, dt * parkFollow(vF)));
      const pose = parkPose(x, y, z, this.cam.yaw, vF, this.portrait);
      want = new THREE.Vector3(...pose.eye);
      look = new THREE.Vector3(...pose.look);
    } else {
      // Chase: behind the car, the yaw catching up with the heading on a spring so turns feel
      // like turns (a camera bolted to the car makes the world spin instead).
      const vF = forwardSpeed(s.cars[car.id]);
      const follow = Math.abs(vF) < 0.5 ? 1.2 : 3.2;
      this.cam.yaw = lerpAngle(this.cam.yaw, h, Math.min(1, dt * follow));
      const dist = 6.4 + Math.min(1.6, Math.abs(vF) * 0.09);
      const height = 2.55;
      want = new THREE.Vector3(x - Math.sin(this.cam.yaw) * dist, y + height, z - Math.cos(this.cam.yaw) * dist);
      look = new THREE.Vector3(x + Math.sin(h) * 2.4, y + 1.05, z + Math.cos(h) * 2.4);
    }
    // Inside the car park: keep under the ceiling, and pull in so the camera never ends up inside a wall, a column or a ramp's side.
    if (!showcase && inside && this.cameraMode === 'chase') {
      want.y = Math.min(want.y, ceil);
      let t = 1;
      for (const { s: sh } of this.camSolids) {
        if (y + 1.2 < (sh.y0 ?? -Infinity) || y > (sh.y1 ?? Infinity)) continue;
        if (Math.abs(sh.x - x) > 14 + (sh.kind === 'box' ? sh.hl : 0) || Math.abs(sh.z - z) > 14 + (sh.kind === 'box' ? sh.hl : 0)) continue;
        const hit = sh.kind === 'circle' ? circleHit(x, z, want.x, want.z, sh.x, sh.z, sh.r + 0.3) : boxHit(x, z, want.x, want.z, sh);
        if (hit !== null) t = Math.min(t, Math.max(0.28, hit - 0.04));
      }
      if (t < 1) {
        want.x = x + (want.x - x) * t;
        want.z = z + (want.z - z) * t;
        want.y = y + 1.6 + (want.y - y - 1.6) * Math.max(0.5, t);
      }
    }
    const k = Math.min(1, dt * (showcase ? 1.5 : this.cameraMode === 'park' ? 6 : 8));
    this.cam.x += (want.x - this.cam.x) * k;
    this.cam.y += (want.y - this.cam.y) * k;
    this.cam.z += (want.z - this.cam.z) * k;
    this.cam.look.lerp(look, Math.min(1, dt * 10));
    // Shake from crashes: trauma squared, smooth noise, fades in about a second.
    const shake = this.shakeOn && !this.calm ? this.trauma * this.trauma : 0;
    const n = (f: number, p: number) => Math.sin(this.time * f + p) * 0.6 + Math.sin(this.time * f * 2.3 + p) * 0.4;
    this.camera.position.set(this.cam.x + n(23, 1.3) * 0.25 * shake, Math.min(this.cam.y + n(19, 4.1) * 0.18 * shake, ceil), this.cam.z + n(17, 2.2) * 0.25 * shake);
    this.camera.lookAt(this.cam.look);
    // Speed feel: the view widens a little as you go faster (up to 6 degrees), and snaps back when you brake.
    if (!this.shot && !showcase) {
      const kick = this.calm ? 0 : Math.min(6, Math.max(0, forwardSpeed(s.cars[car.id]) - 3) * 0.55);
      const next = this.fovKick + (kick - this.fovKick) * Math.min(1, dt * 3);
      if (Math.abs(next - this.fovKick) > 0.01) {
        this.camera.fov += next - this.fovKick;
        this.fovKick = next;
        this.camera.updateProjectionMatrix();
      }
    }
    this.trauma = Math.max(0, this.trauma - dt * 1.4);
    this.sfx.listener(this.camera.position.x, this.camera.position.y, this.camera.position.z, Math.sin(this.cam.yaw), Math.cos(this.cam.yaw));

    // Shadows: the sun's shadow box follows the car, snapped to whole shadow-map texels so the
    // edges don't shimmer as it moves.
    const texel = 68 / 2048;
    const fx = Math.round(x / texel) * texel;
    const fz = Math.round(z / texel) * texel;
    const dir = this.sun.position.clone().sub(this.sun.target.position).normalize();
    this.sun.target.position.set(fx, y, fz);
    this.sun.position.set(fx, y, fz).addScaledVector(dir, 80);
    if (this.shot) {
      const [ex, ey, ez] = this.shot.eye;
      const [lx, ly, lz] = this.shot.look;
      this.camera.position.set(ex, ey, ez);
      this.camera.up.set(0, 1, 0);
      this.camera.lookAt(lx, ly, lz);
      if (this.shot.fov && this.camera.fov !== this.shot.fov) {
        this.camera.fov = this.shot.fov;
        this.camera.updateProjectionMatrix();
      }
      this.sun.target.position.set(lx, ly, lz);
      this.sun.position.set(lx, ly, lz).addScaledVector(dir, 80);
    }
  }

  /** Key art: hold a fixed camera (and light a bay) until called with null. Freeze the game first to stage the cars. */
  setShot = (shot: Shot | null) => {
    this.shot = shot;
    if (!shot) this.resize();
  };

  /** The map's fixed layers, one per level (tarmac, roads, islands, shops, the carport, the gates, or a deck's bays and walls), drawn once and blitted each frame. */
  private mapLayers = new Map<number, HTMLCanvasElement>();

  /** The part of the site a map tab shows: the whole site on P0 (lot and ground floor), the car park alone on the other decks. */
  private mapView(level: number) {
    const g = this.lot.garage;
    const b = this.lot.bounds;
    const x0 = level === 0 ? b.x0 - 6 : g.x0 - 1.5;
    const x1 = g.x1 + 1.5;
    const z0 = level === 0 ? b.z0 - 4 : g.z0 - 1.5;
    const z1 = level === 0 ? b.z1 + 6 : g.z1 + 1.5;
    return { x0, x1, z0, z1 };
  }

  /** Metres to canvas pixels for a level's view: north at the top, x flipped so the map matches the chase view from the entrance. */
  private mapScale(level: number, W: number, H: number) {
    const v = this.mapView(level);
    const pad = 6;
    const sc = Math.min((W - pad * 2) / (v.x1 - v.x0), (H - pad * 2) / (v.z1 - v.z0));
    const cx = (v.x0 + v.x1) / 2;
    const cz = (v.z0 + v.z1) / 2;
    return { sc, px: (x: number) => W / 2 - (x - cx) * sc, pz: (z: number) => H / 2 - (z - cz) * sc };
  }

  private buildMapLayer(level: number, W: number, H: number) {
    const layer = document.createElement('canvas');
    layer.width = W;
    layer.height = H;
    const g = layer.getContext('2d')!;
    const { px, pz, sc } = this.mapScale(level, W, H);
    const { bounds, graph, aisles } = this.lot;
    const gar = this.lot.garage;
    const accent = '#' + LEVEL_COLOR[level].toString(16).padStart(6, '0');
    const rect = (x0: number, x1: number, z0: number, z1: number) => g.fillRect(px(x1), pz(z1), (x1 - x0) * sc, (z1 - z0) * sc);
    if (level === 0) {
      g.fillStyle = 'rgba(58,138,60,0.92)';
      g.fillRect(0, 0, W, H);
      // Tarmac.
      g.fillStyle = 'rgba(52,56,68,0.97)';
      rect(bounds.x0, bounds.x1, bounds.z0, bounds.z1);
    } else {
      g.fillStyle = 'rgba(14,22,40,0.96)';
      g.fillRect(0, 0, W, H);
    }
    // A deck's floor.
    const lvl = gar.levels.find((l) => l.lvl === level)!;
    g.fillStyle = level === 0 ? 'rgba(66,70,84,0.98)' : 'rgba(54,60,78,0.98)';
    for (const f of lvl.floors) rect(f.x0, f.x1, f.z0, f.z1);
    // Roads and aisles, at their real width: the open lot's on P0, a deck's own aisles, and the ramps that start or end on it.
    g.lineCap = 'butt';
    for (const a of aisles) {
      const levels = a.nodes.map((n) => graph.nodes[n].lvl);
      const here = a.garage ? levels.includes(level) : level === 0;
      if (!here) continue;
      g.strokeStyle = a.kind === 'ramp' ? accent : a.kind === 'aisle' ? 'rgba(98,106,122,1)' : 'rgba(128,138,156,1)';
      g.globalAlpha = a.kind === 'ramp' ? 0.85 : 1;
      g.lineWidth = a.width * sc;
      g.beginPath();
      a.nodes.forEach((id, i) => {
        const n = graph.nodes[id];
        if (i === 0) g.moveTo(px(n.x), pz(n.z));
        else g.lineTo(px(n.x), pz(n.z));
      });
      g.stroke();
      g.globalAlpha = 1;
    }
    // Bay rows as short ticks (every bay looks the same, so nothing is given away).
    g.strokeStyle = 'rgba(255,255,255,0.4)';
    g.lineWidth = 1;
    g.beginPath();
    for (const s of this.lot.stripes) {
      if ((s.lvl ?? 0) !== level) continue;
      g.moveTo(px(s.a.x), pz(s.a.z));
      g.lineTo(px(s.b.x), pz(s.b.z));
    }
    g.stroke();
    if (level === 0) {
      // Islands, lawns and the carport.
      for (const isl of this.lot.islands) {
        g.fillStyle = isl.kind === 'lawn' || isl.kind === 'planter' || isl.kind === 'hedge' ? 'rgb(64,160,64)' : isl.kind === 'chargers' ? 'rgb(40,200,120)' : 'rgb(190,184,170)';
        rect(isl.x0, isl.x1, isl.z0, isl.z1);
      }
      for (const c of this.lot.canopies) {
        g.fillStyle = 'rgba(70,110,230,0.8)';
        rect(c.x0, c.x1, c.z0, c.z1);
      }
      // The shops along the top, the gates (the entry bottom centre) as short bars.
      for (const shop of this.lot.shops) {
        g.fillStyle = shop === this.lot.shops[0] ? 'rgb(238,184,98)' : 'rgb(222,100,62)';
        g.fillRect(px(shop.x1), pz(bounds.z1) - 8, (shop.x1 - shop.x0) * sc, 7);
      }
      g.fillStyle = 'rgba(255,210,63,0.95)';
      for (const gate of this.lot.gates) g.fillRect(px((gate.px + gate.tx) / 2) - 3, pz(gate.z) - 1, 6, 2);
    }
    // Walls and columns of the deck, and its name.
    g.fillStyle = 'rgba(200,204,214,0.95)';
    for (const w of lvl.walls) rect(w.x0, w.x1, w.z0, w.z1);
    for (const c of lvl.columns) g.fillRect(px(c.x) - 1.5, pz(c.z) - 1.5, 3, 3);
    g.strokeStyle = accent;
    g.lineWidth = 2;
    g.strokeRect(1, 1, W - 2, H - 2);
    g.fillStyle = accent;
    g.font = 'bold 22px "Arial Narrow", Arial, sans-serif';
    g.textAlign = 'right';
    g.fillText(levelName(level), W - 8, 24);
    return layer;
  }

  /** Which level the minimap shows: the one picked with a tab, until you change level yourself. */
  setMapLevel = (level: number | null) => {
    this.mapPick = level;
  };

  private drawMinimap() {
    const c = this.minimap;
    if (!c) return;
    const g = c.getContext('2d');
    if (!g) return;
    const W = c.width;
    const H = c.height;
    const me = this.state.cars[0];
    const myLevel = levelOf(me.y);
    if (myLevel !== this.mapSeenLevel) {
      this.mapSeenLevel = myLevel;
      this.mapPick = null;
    }
    // Once the round is over the map goes to the level where the bay was (and shows it); until then it follows you, or the tab you picked.
    const done = this.state.phase === 'done';
    const revealed = this.lot.bays[this.state.winBay >= 0 ? this.state.winBay : this.state.target].lvl;
    const level = this.mapPick ?? (done ? revealed : myLevel);
    this.mapShown = level;
    let layer = this.mapLayers.get(level);
    if (!layer || layer.width !== W || layer.height !== H) {
      if (layer && (layer.width !== W || layer.height !== H)) this.mapLayers.clear();
      layer = this.buildMapLayer(level, W, H);
      this.mapLayers.set(level, layer);
    }
    const { px, pz } = this.mapScale(level, W, H);
    g.clearRect(0, 0, W, H);
    g.drawImage(layer, 0, 0);
    const here = (y: number) => Math.abs(y - levelY(level)) < LEVEL_H * 0.6;
    // Shoppers as small bright dots on this level; the free bay only once the round is over.
    g.fillStyle = 'rgba(255,214,90,0.95)';
    for (const p of this.state.peds) if (here(p.y)) g.fillRect(px(p.x) - 1.2, pz(p.z) - 1.2, 2.4, 2.4);
    // The bonus hint: a pulsing circle that holds the free bay (not centred on it), on the bay's level.
    if (this.hinted && this.state.phase !== 'done') {
      const a = hintArea(this.state, this.lot);
      if (a.lvl === level) {
        const r = Math.abs(px(a.x + a.r) - px(a.x));
        g.save();
        g.fillStyle = 'rgba(255,210,63,0.16)';
        g.strokeStyle = `rgba(255,210,63,${0.65 + Math.sin(this.time * 4) * 0.3})`;
        g.lineWidth = 2.5;
        g.setLineDash([6, 4]);
        g.beginPath();
        g.arc(px(a.x), pz(a.z), r, 0, Math.PI * 2);
        g.fill();
        g.stroke();
        g.restore();
      }
    }
    // A bay you found yourself stays on your map (yellow) until the round is over.
    if (this.state.phase !== 'done') {
      [this.state.target, this.state.extra].forEach((id, k) => {
        if (id < 0 || !this.found[k]) return;
        const bay = this.lot.bays[id];
        if (!here(bay.y)) return;
        g.fillStyle = `rgba(255,210,63,${0.7 + Math.sin(this.time * 6) * 0.3})`;
        g.beginPath();
        g.arc(px(bay.x), pz(bay.z), 5, 0, Math.PI * 2);
        g.fill();
      });
    }
    if (this.state.phase === 'done') {
      const bay = this.lot.bays[this.state.winBay >= 0 ? this.state.winBay : this.state.target];
      if (here(bay.y)) {
        g.fillStyle = `rgba(61,220,132,${0.6 + Math.sin(this.time * 6) * 0.4})`;
        g.beginPath();
        g.arc(px(bay.x), pz(bay.z), 5, 0, Math.PI * 2);
        g.fill();
      }
    }
    for (const car of this.state.cars) {
      // Cars on other levels are not drawn: that would show who is where upstairs. (On a ramp, a car shows on both ends' maps.)
      const onRamp = Math.abs(car.y / LEVEL_H - Math.round(car.y / LEVEL_H)) > 0.15;
      if (!here(car.y) && !(onRamp && Math.abs(car.y - levelY(level)) < LEVEL_H)) continue;
      const mine = car.id === 0 && this.racing;
      g.save();
      g.translate(px(car.x), pz(car.z));
      g.rotate(-car.h);
      g.fillStyle = '#' + car.color.toString(16).padStart(6, '0');
      g.strokeStyle = mine ? '#ffd23f' : 'rgba(0,0,0,0.7)';
      g.lineWidth = mine ? 2.2 : 1.2;
      g.beginPath();
      g.moveTo(0, -6);
      g.lineTo(4, 5);
      g.lineTo(-4, 5);
      g.closePath();
      g.fill();
      g.stroke();
      g.restore();
    }
  }
  private mapSeenLevel = 0;

  private emitHud(force: boolean) {
    const cb = this.opts.onHud;
    if (!cb) return;
    const s = this.state;
    const me = s.cars[0];
    const vF = forwardSpeed(me);
    // In the race the list never says who is closest to the free bay: seat order, with the parked ones first.
    const seats = [...s.cars].sort((x, y) => (x.parkedAt !== null ? 0 : 1) - (y.parkedAt !== null ? 0 : 1) || x.id - y.id);
    const order = s.phase === 'done' || me.dq !== null ? standings(s, this.world) : seats;
    const over = s.phase === 'done' || me.dq !== null;
    const result = over
      ? {
          winner: s.winner !== null ? s.cars[s.winner].name : null,
          winnerColor: s.winner !== null ? s.cars[s.winner].color : 0xffffff,
          won: s.winner === 0,
          reason: (me.dq !== null ? (me.dqWhy ? 'crash' : 'pedestrian') : s.winner !== null ? 'parked' : 'time') as 'parked' | 'pedestrian' | 'crash' | 'time',
          hit: me.dqWhy?.what ?? '',
          incidents: me.incidents,
          place: order.findIndex((c) => c.id === 0) + 1,
          time: me.parkedAt ?? me.dq ?? s.clock,
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
      gear: me.parkedAt !== null ? 'P' : me.box === 'manual' ? gearName(me.mgear) : me.gear === -1 ? 'R' : 'D',
      manual:
        me.box === 'manual' && this.racing
          ? {
              gear: gearName(me.mgear),
              rpm: this.rpm[0] ?? MANUAL.idle,
              idle: MANUAL.idle,
              redline: MANUAL.redline,
              band: band(me.mgear, forwardSpeed(me)),
              light: me.mgear >= 1 && me.mgear < MANUAL.top && band(me.mgear, forwardSpeed(me)) >= MANUAL.shiftLight,
              limiter: me.limiter,
              shiftId: this.shiftId,
              denied: this.deniedId,
            }
          : null,
      menu: this.menu,
      standings: order.map((c) => ({ id: c.id, name: c.name, color: c.color, bumps: c.bumps, parked: c.parkedAt !== null, out: c.dq !== null, me: c.id === 0 })),
      chat: s.chat.filter((l) => s.t - l.t < 6.5).slice(-3).map((l) => ({ id: l.id, name: l.name, color: l.color, text: l.text, age: s.t - l.t })),
      disqualified: me.dq !== null && this.dqAt >= 0 ? this.time - this.dqAt : null,
      dqWhy: me.dq !== null ? (me.dqWhy ?? { kind: 'pedestrian', what: 'a pedestrian' }) : null,
      park: me.park,
      inBay: me.inBay,
      camera: this.cameraMode,
      paused: this.paused,
      flash: this.fx,
      callout: this.callout,
      left: Math.max(0, s.maxTime - s.clock),
      result,
      endedFor: this.endedAt < 0 ? 0 : this.time - this.endedAt,
      fps: this.fps,
      volumes: { ...this.sfx.volumes },
      level: levelOf(me.y),
      levelName: levelName(levelOf(me.y)),
      inGarage: this.garageOf(me.x, me.z, me.y).inside,
      levelColor: LEVEL_COLOR[levelOf(me.y)] ?? 0xffffff,
      board: (() => {
        const h = hintOf(s, this.world.lot);
        const [head, tail] = hintLines(h);
        return { free: h.free, line: tail || head.replace(/^FREE SPACES: \d+$/, ''), deckColor: h.showing !== null ? LEVEL_COLOR[h.showing] : null };
      })(),
      mapLevel: this.mapShown,
      hinted: this.hinted,
      tier: this.tier,
      frozen: this.frozen,
      stage: (() => {
        const n = this.world.lot.stage ?? 0;
        const def = n ? stageDef(n) : null;
        return { n, name: def?.name ?? 'The whole site', news: def?.news ?? '', total: STAGE_COUNT, unlocked: this.opts.mode === 'race' ? this.progress.unlocked : STAGE_COUNT, current: this.progress.current, hasNext: s.winner === 0 && hasNext(this.progress) };
      })(),
      // Only the floors that are open get a tab (the open lot alone has none to choose from).
      mapLevels: LEVELS.filter((l) => !this.world.lot.open || this.world.lot.open.levels.includes(l)).map((l) => ({ level: l, name: levelName(l), color: LEVEL_COLOR[l] })),
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
