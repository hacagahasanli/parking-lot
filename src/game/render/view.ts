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
