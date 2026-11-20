/**
 * Performance tiers. The same scene, drawn with less on weaker machines so it stays smooth on mid-range phones and 4 GB
 * Chromebooks (CrazyGames disables games on ChromeOS that do not run smoothly on a 4 GB device).
 *
 *  - high:   device pixel ratio up to 2, sun shadows (2048 map, soft PCF), antialiasing;
 *  - medium: pixel ratio up to 1.5, shadows with a 1024 map, antialiasing;
 *  - low:    pixel ratio 1, no shadows, no antialiasing, a shorter view distance.
 *
 * 'auto' picks one from what the browser says about the device (`autoTier`), then steps down once if the frame rate stays
 * low (`FpsGuard`). The player can pick a tier in the pause menu; that choice is saved and wins over auto.
 * Pure (no DOM): the caller passes the facts, so the choice is tested.
 */
export type Tier = 'low' | 'medium' | 'high';
export type QualitySetting = Tier | 'auto';

export interface TierSpec {
  /** Highest device pixel ratio the canvas renders at. */
  dprCap: number;
  shadows: boolean;
  shadowMap: number;
  /** Antialiasing is fixed when the WebGL context is made: a change applies on the next load. */
  antialias: boolean;
  /** Fog end (m): the far edge of the view, so less is drawn on low. */
  fogFar: number;
}

export const TIERS: Record<Tier, TierSpec> = {
  high: { dprCap: 2, shadows: true, shadowMap: 2048, antialias: true, fogFar: 620 },
  medium: { dprCap: 1.5, shadows: true, shadowMap: 1024, antialias: true, fogFar: 480 },
  low: { dprCap: 1, shadows: false, shadowMap: 512, antialias: false, fogFar: 340 },
};

export interface DeviceFacts {
  /** From the portal SDK if it says, else guessed from the pointer and screen. */
  device: 'desktop' | 'tablet' | 'mobile';
  /** navigator.hardwareConcurrency (undefined when hidden). */
  cores?: number;
  /** navigator.deviceMemory in GB (Chrome only; capped at 8 by the browser). */
  memory?: number;
  /** The WebGL renderer string, when the browser shares it. */
  gpu?: string;
  /** User agent, for ChromeOS. */
  ua?: string;
}

/** Software renderers and old integrated GPUs: always low. */
const SOFTWARE_GPU = /swiftshader|llvmpipe|softpipe|software|microsoft basic render/i;
const WEAK_GPU = /mali-[gt][0-9]{2}\b|mali-4|adreno \(tm\) [1-5][0-9]{2}\b|powervr|intel\(r\) (hd|uhd) graphics( [0-9]{3})?\b|intel hd graphics/i;

export const autoTier = (f: DeviceFacts): Tier => {
  const gpu = f.gpu ?? '';
  if (SOFTWARE_GPU.test(gpu)) return 'low';
  const cores = f.cores ?? 4;
  const memory = f.memory ?? 4;
  const chromebook = /\bCrOS\b/.test(f.ua ?? '');
  if (f.device === 'mobile' || f.device === 'tablet') {
    // Only flagship phones get medium; nothing on a phone gets high (a small screen does not need it and the battery does).
    return memory >= 6 && cores >= 8 && !WEAK_GPU.test(gpu) ? 'medium' : 'low';
  }
  if (chromebook) return memory >= 8 && cores >= 8 && !WEAK_GPU.test(gpu) ? 'medium' : 'low';
  if (memory <= 2 || cores <= 2) return 'low';
  if (memory <= 4 || cores <= 4 || WEAK_GPU.test(gpu)) return 'medium';
  return 'high';
};

/** The tier to use: the player's choice, or the automatic one. */
export const resolveTier = (setting: QualitySetting, facts: DeviceFacts): Tier => (setting === 'auto' ? autoTier(facts) : setting);

export const lowerTier = (t: Tier): Tier => (t === 'high' ? 'medium' : 'low');

export const parseSetting = (v: string | null | undefined): QualitySetting => (v === 'low' || v === 'medium' || v === 'high' || v === 'auto' ? v : 'auto');

/**
 * Watches the frame rate on 'auto' and steps the tier down once it has stayed under `minFps` for `window` seconds of play
 * (never during the first `grace` seconds, while shaders compile). It never steps up again, so the picture does not pump.
 */
export class FpsGuard {
  private low = 0;
  private seen = 0;

  constructor(
    private minFps = 40,
    private window = 4,
    private grace = 3,
  ) {}

  /** Feed one frame (its length in seconds); true when it is time to step down. */
  frame(dt: number): boolean {
    if (!(dt > 0) || dt > 0.5) return false; // a hidden tab or a breakpoint
    this.seen += dt;
    if (this.seen < this.grace) return false;
    if (1 / dt < this.minFps) this.low += dt;
    else this.low = Math.max(0, this.low - dt * 0.5);
    if (this.low >= this.window) {
      this.low = 0;
      this.seen = 0;
      return true;
    }
    return false;
  }
}
