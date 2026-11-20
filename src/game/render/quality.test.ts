import { autoTier, FpsGuard, lowerTier, parseSetting, resolveTier, TIERS } from './quality';

describe('performance tiers', () => {
  it('get cheaper from high to low: pixel ratio, shadows, antialiasing, view distance', () => {
    expect(TIERS.high.dprCap).toBeGreaterThan(TIERS.medium.dprCap);
    expect(TIERS.medium.dprCap).toBeGreaterThan(TIERS.low.dprCap);
    expect(TIERS.low).toMatchObject({ dprCap: 1, shadows: false, antialias: false });
    expect(TIERS.high.shadowMap).toBeGreaterThan(TIERS.medium.shadowMap);
    expect(TIERS.low.fogFar).toBeLessThan(TIERS.high.fogFar);
  });

  it('pick low on software renderers, mid-range phones and 4 GB Chromebooks', () => {
    expect(autoTier({ device: 'desktop', cores: 16, memory: 8, gpu: 'Google SwiftShader' })).toBe('low');
    expect(autoTier({ device: 'mobile', cores: 8, memory: 4, gpu: 'Adreno (TM) 610' })).toBe('low');
    expect(autoTier({ device: 'mobile', cores: 8, memory: 8, gpu: 'Mali-G52' })).toBe('low');
    expect(autoTier({ device: 'tablet' })).toBe('low');
    expect(autoTier({ device: 'desktop', cores: 4, memory: 4, ua: 'Mozilla/5.0 (X11; CrOS x86_64 14541.0.0)' })).toBe('low');
  });

  it('give flagship phones medium, ordinary laptops medium and good desktops high', () => {
    expect(autoTier({ device: 'mobile', cores: 8, memory: 8, gpu: 'Adreno (TM) 740' })).toBe('medium');
    expect(autoTier({ device: 'mobile', cores: 8, memory: 8, gpu: 'Apple GPU' })).toBe('medium');
    expect(autoTier({ device: 'desktop', cores: 4, memory: 8, gpu: 'ANGLE (Intel, Intel(R) UHD Graphics 620)' })).toBe('medium');
    expect(autoTier({ device: 'desktop', cores: 8, memory: 8, gpu: 'Intel(R) UHD Graphics 620' })).toBe('medium');
    expect(autoTier({ device: 'desktop', cores: 2, memory: 8 })).toBe('low');
    expect(autoTier({ device: 'desktop', cores: 10, memory: 8, gpu: 'ANGLE (Apple, ANGLE Metal Renderer: Apple M2)' })).toBe('high');
    expect(autoTier({ device: 'desktop', cores: 12, memory: 8, gpu: 'NVIDIA GeForce RTX 3060' })).toBe('high');
  });

  it("let the player's choice win over auto, and read a saved setting safely", () => {
    const phone = { device: 'mobile' as const, cores: 4, memory: 2 };
    expect(resolveTier('auto', phone)).toBe('low');
    expect(resolveTier('high', phone)).toBe('high');
    expect(parseSetting('medium')).toBe('medium');
    expect(parseSetting(null)).toBe('auto');
    expect(parseSetting('ultra')).toBe('auto');
    expect(lowerTier('high')).toBe('medium');
    expect(lowerTier('medium')).toBe('low');
    expect(lowerTier('low')).toBe('low');
  });
});

describe('the frame-rate guard', () => {
  const run = (g: FpsGuard, fps: number, seconds: number) => {
    let fired = 0;
    for (let t = 0; t < seconds; t += 1 / fps) if (g.frame(1 / fps)) fired++;
    return fired;
  };

  it('steps down after a few seconds under 40 fps, not during the first seconds', () => {
    const g = new FpsGuard();
    expect(run(g, 25, 2.5)).toBe(0); // grace while shaders compile
    expect(run(g, 25, 5)).toBe(1);
  });

  it('leaves a smooth game alone, and ignores a single long frame or a hidden tab', () => {
    const g = new FpsGuard();
    expect(run(g, 60, 30)).toBe(0);
    expect(g.frame(2)).toBe(false);
    expect(g.frame(0.2)).toBe(false);
    expect(run(g, 60, 10)).toBe(0);
  });
});
