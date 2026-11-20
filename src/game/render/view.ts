/**
 * The two cameras a player can pick, and the pure maths of the default one, kept out of `game.ts` so it can be tested.
 *
 * - 'park' (the default): high over the car and a little behind it, tilted about 60 degrees down, so the player reads the
 *   lot (free bays, rival cars, the arrows on the ground) the way the covers show it. It turns with the car, but slowly,
 *   so the car's left stays on the left of the screen without the world spinning.
 * - 'chase': low behind the car, like a racing game.
 */
export type CameraMode = 'park' | 'chase';

export const CAMERA_MODES: CameraMode[] = ['park', 'chase'];

/** Where the camera choice is saved (through the platform's storage). */
export const CAMERA_KEY = 'parking-lot.camera';

/** A saved value, or the default when it is missing or from an older build ('high' and 'top' are now the parking view). */
export const parseCamera = (v: string | null): CameraMode => (v === 'chase' ? 'chase' : 'park');

/** How fast the parking view's yaw catches up with the car's heading (per second): calm when crawling, a little brisker when driving. */
export const parkFollow = (speed: number) => (Math.abs(speed) < 0.5 ? 0.5 : Math.min(1.8, 0.8 + Math.abs(speed) * 0.12));

export interface ParkPose {
  eye: [number, number, number];
  look: [number, number, number];
}

/**
 * The parking view for a car at (x, y, z) with the camera's (smoothed) yaw. Portrait screens are tall and narrow (and the
 * view is 78 degrees tall there): the camera goes higher and steeper, which puts the car a little below the middle (above the
 * thumbs) and about 30 m of lot ahead of it on screen. Speed pushes the look point ahead.
 */
export const parkPose = (x: number, y: number, z: number, yaw: number, speed: number, portrait: boolean): ParkPose => {
  const height = portrait ? 22 : 17.5;
  const back = portrait ? 4 : 6.5;
  const ahead = (portrait ? 3.5 : 4) + Math.min(4, Math.max(0, speed) * 0.35);
  const sx = Math.sin(yaw);
  const cz = Math.cos(yaw);
  return {
    eye: [x - sx * back, y + height, z - cz * back],
    look: [x + sx * ahead, y, z + cz * ahead],
  };
};

/**
 * How the parking view is framed. 'classic' is the view above (about 60 degrees down, a wide lens). 'precision' looks almost
 * straight down (82 degrees) through a long lens (36 degrees, 46 on a tall phone) from further away, so the same patch of
 * ground fills the screen but the sides of vans and SUVs no longer hide the gap beside them. 'top' is the same lens straight
 * down (a prototype, kept for comparison; the car still points up the screen).
 */
export type ParkStyle = 'classic' | 'precision' | 'top';

export const PRECISION = {
  /** Degrees down from the horizon. */
  pitch: 82,
  /** Vertical field of view (degrees), landscape and portrait. */
  fov: 36,
  fovPortrait: 46,
  /** Distance from the look point (m): chosen so the ground on screen matches the classic view. */
  dist: 38,
  distPortrait: 52,
  /** How much closer the camera comes once the car is slow and partly inside the bay. */
  closeIn: 0.28,
} as const;

/** The field of view (degrees) a style uses on this screen. */
export const styleFov = (style: ParkStyle, portrait: boolean) => (style === 'classic' ? (portrait ? 78 : 62) : portrait ? PRECISION.fovPortrait : PRECISION.fov);

/**
 * The precision (or top-down) view for a car at (x, y, z) with the camera's smoothed yaw. `close` (0..1) eases it in for the
 * last metres of a park. The look point sits a little ahead of the car (more when moving), so the car is a little below the
 * middle of the screen, above a phone's thumbs.
 */
export const precisionPose = (x: number, y: number, z: number, yaw: number, speed: number, portrait: boolean, close = 0, top = false): ParkPose => {
  const pitch = ((top ? 89.5 : PRECISION.pitch) * Math.PI) / 180;
  const dist = (portrait ? PRECISION.distPortrait : PRECISION.dist) * (1 - PRECISION.closeIn * Math.max(0, Math.min(1, close)));
  // Look the way the car is going: ahead when driving, behind it when reversing (the bay you back into stays on screen).
  const ahead = speed < -0.2 ? -(1.5 + Math.min(3, -speed * 0.6)) : (portrait ? 3 : 2) * (1 - 0.5 * close) + Math.min(3.5, Math.max(0, speed) * 0.3);
  const sx = Math.sin(yaw);
  const cz = Math.cos(yaw);
  const lx = x + sx * ahead;
  const lz = z + cz * ahead;
  const back = Math.cos(pitch) * dist;
  return { eye: [lx - sx * back, y + Math.sin(pitch) * dist, lz - cz * back], look: [lx, y, lz] };
};
