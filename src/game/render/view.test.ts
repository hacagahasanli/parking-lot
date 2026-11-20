import { CAMERA_MODES, parkFollow, parkPose, parseCamera } from './view';

describe('camera views', () => {
  it('defaults to the parking view and remembers chase; old or broken saves fall back to the parking view', () => {
    expect(CAMERA_MODES[0]).toBe('park');
    expect(parseCamera(null)).toBe('park');
    expect(parseCamera('chase')).toBe('chase');
    expect(parseCamera('top')).toBe('park');
    expect(parseCamera('garbage')).toBe('park');
  });

  it('the parking view is high, behind the car and looks ahead of it along the heading', () => {
    for (const yaw of [0, 1, -2.5]) {
      for (const portrait of [false, true]) {
        const { eye, look } = parkPose(10, 3, -4, yaw, 0, portrait);
        const fx = Math.sin(yaw), fz = Math.cos(yaw);
        expect(eye[1]).toBeGreaterThan(3 + 15);
        expect((eye[0] - 10) * fx + (eye[2] + 4) * fz).toBeLessThan(0);
        expect((look[0] - 10) * fx + (look[2] + 4) * fz).toBeGreaterThan(3);
        expect(look[1]).toBe(3);
        // Steep: at least 55 degrees down, so cars and bays read from above.
        const flat = Math.hypot(look[0] - eye[0], look[2] - eye[2]);
        expect(Math.atan2(eye[1] - look[1], flat)).toBeGreaterThan((55 * Math.PI) / 180);
      }
    }
  });

  it('portrait goes higher than landscape (a narrow screen needs the height to show the lot ahead)', () => {
    expect(parkPose(0, 0, 0, 0, 0, true).eye[1]).toBeGreaterThan(parkPose(0, 0, 0, 0, 0, false).eye[1]);
  });

  it('looks further ahead when driving faster', () => {
    expect(parkPose(0, 0, 0, 0, 8, false).look[2]).toBeGreaterThan(parkPose(0, 0, 0, 0, 0, false).look[2]);
  });

  it('turns calmly: slower at a crawl, capped when fast', () => {
    expect(parkFollow(0)).toBeLessThan(parkFollow(5));
    expect(parkFollow(40)).toBeLessThanOrEqual(1.8);
  });
});
