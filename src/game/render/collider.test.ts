/**
 * The collider is the car you see. Every car's collider is built from its body's plan outline (sim/body.ts); these tests hold it
 * to the meshes the renderer actually draws, so a touch is only ever registered when the cars visibly touch, and always is.
 *
 * "Mesh outline" here is the convex hull, seen from above, of every vertex of the drawn car except the door mirrors (which the
 * players do not count, and which the rules ignore too).
 */
import { BODY } from '../sim/constants';
import { collide } from '../sim/collide';
import { bayCones, bayShapes, buildLot, CONE_R, LAYOUT, parkedSpot, VARIANT_SIZE } from '../sim/lot';
import { carShape, createRound, step } from '../sim/step';
import { carGeometry, STYLES } from './car';

import type { Bay, Box } from '../sim/lot';
import type { Input } from '../sim/types';

type P = [number, number];

const hull = (pts: P[]): P[] => {
  const p = [...pts].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const cr = (o: P, a: P, b: P) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lo: P[] = [];
  const up: P[] = [];
  for (const q of p) {
    while (lo.length >= 2 && cr(lo[lo.length - 2], lo[lo.length - 1], q) <= 0) lo.pop();
    lo.push(q);
  }
  for (const q of p.reverse()) {
    while (up.length >= 2 && cr(up[up.length - 2], up[up.length - 1], q) <= 0) up.pop();
    up.push(q);
  }
  return lo.slice(0, -1).concat(up.slice(0, -1));
};

/** The drawn car's plan outline, car frame (x right, z to the nose), mirrors left out. */
const meshOutline = (style: number): P[] => {
  const g = carGeometry(style, true);
  const hw = STYLES[style].width / 2;
  const pts: P[] = [];
  for (const geo of Object.values(g)) {
    if (!geo) continue;
    const a = geo.attributes.position.array;
    for (let i = 0; i < a.length; i += 3) if (Math.abs(a[i]) <= hw + 0.01) pts.push([a[i], a[i + 2]]);
  }
  return hull(pts);
};
const MESH = [0, 1, 2, 3, 4].map(meshOutline);

const segDist = (p: P, a: P, b: P) => {
  const dx = b[0] - a[0];
  const dz = b[1] - a[1];
  const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dz) / (dx * dx + dz * dz || 1)));
  return Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dz);
};
const toBoundary = (p: P, poly: P[]) => Math.min(...poly.map((a, i) => segDist(p, a, poly[(i + 1) % poly.length])));
/** Is p inside the convex polygon (either winding)? */
const inside = (p: P, poly: P[]) => {
  let pos = false;
  let neg = false;
  poly.forEach((a, i) => {
    const b = poly[(i + 1) % poly.length];
    const c = (b[0] - a[0]) * (p[1] - a[1]) - (b[1] - a[1]) * (p[0] - a[0]);
    if (c > 1e-9) pos = true;
    if (c < -1e-9) neg = true;
  });
  return !(pos && neg);
};

/** A shape in the world as world points (same frame as the sim: local x -> (cos h, -sin h), local z -> (sin h, cos h)). */
const place = (poly: readonly (readonly [number, number])[], x: number, z: number, h: number): P[] =>
  poly.map(([px, pz]) => [x + px * Math.cos(h) + pz * Math.sin(h), z - px * Math.sin(h) + pz * Math.cos(h)]);
/** Distance between two convex polygons (0 when they cross; negative is not measured). */
const gap = (A: P[], B: P[]) => {
  if (A.some((p) => inside(p, B)) || B.some((p) => inside(p, A))) return 0;
  return Math.min(...A.map((p) => toBoundary(p, B)), ...B.map((p) => toBoundary(p, A)));
};
/** The drawn meshes as boxes with their outline, so the sim's own SAT tells whether the meshes overlap. */
const meshBox = (style: number, x: number, z: number, h: number): Box => ({ kind: 'box', x, z, h, hw: 3, hl: 3, outline: MESH[style] });

describe('every car collider is the car that is drawn', () => {
  it.each([0, 1, 2, 3, 4])('style %i: every corner of the collider lies on the drawn body, within 2 cm of its outline', (style) => {
    const col = carShape({ x: 0, z: 0, h: 0 });
    const outline = style === 0 ? col.outline! : (bayShapes({ use: 'car', variant: style, x: 0, z: 0, h: 0, ax: 0, az: 1, garage: false, y: 0 } as Bay)[0] as Box).outline!;
    const mesh = MESH[style];
    expect(outline.length).toBeGreaterThanOrEqual(12);
    for (const v of outline) {
      const p: P = [v[0], v[1]];
      expect(toBoundary(p, mesh), `vertex ${p.map((n) => n.toFixed(3))}`).toBeLessThan(0.02);
      // ...and never outside it (a hair for float noise): the collider cannot touch where the paint does not.
      expect(inside(p, mesh) || toBoundary(p, mesh) < 0.002, `vertex ${p.map((n) => n.toFixed(3))} sticks out`).toBe(true);
    }
    // The other way round: nothing drawn sticks out of the collider by more than 1.2 cm (the end caps' slight dome, trim on the body).
    const col2 = outline.map(([x, z]) => [x, z] as P);
    for (const p of mesh) if (!inside(p, col2)) expect(toBoundary(p, col2), `mesh point ${p.map((n) => n.toFixed(3))}`).toBeLessThan(0.012);
  });

  it('sizes every parked car as its own body style (the renderer and the sim share one table)', () => {
    BODY.forEach((b, i) => {
      expect(STYLES[i].length).toBeCloseTo(b.length, 9);
      expect(STYLES[i].width).toBeCloseTo(b.width, 9);
      expect(VARIANT_SIZE[i]).toEqual({ l: b.length, w: b.width });
    });
  });

  it('puts a parked car collider exactly where the parked car is drawn', () => {
    const bay = { use: 'car', variant: 2, x: 10, z: -4, h: 0.7, ax: Math.sin(0.7), az: Math.cos(0.7), garage: false, y: 0 } as Bay;
    const shape = bayShapes(bay)[0] as Box;
    const spot = parkedSpot(bay);
    expect([shape.x, shape.z, shape.h]).toEqual([spot.x, spot.z, spot.h]);
  });

  it('makes every drawn cone in a coned-off bay solid', () => {
    const bay = { use: 'cones', variant: 0, x: 0, z: 0, h: 0, ax: 0, az: 1, garage: false, y: 0 } as Bay;
    const shapes = bayShapes(bay);
    expect(shapes).toHaveLength(bayCones(bay).length);
    shapes.forEach((s, i) => expect(s).toMatchObject({ kind: 'circle', x: bayCones(bay)[i].x, z: bayCones(bay)[i].z, r: CONE_R }));
  });
});

/**
 * Two cars meeting the ways they do while parking. The player's sedan (style 0) comes at a parked car of every style (drawn and
 * solid at its `parkedSpot`), or at another racer, along a straight line; the test finds where the drawn bodies first touch.
 */
describe('contact happens when the drawn cars touch, never with air between them', () => {
  const D = Math.PI / 180;
  const cases: { name: string; rel: number; dir: number; off?: number }[] = [
    { name: 'front corner sweeping its rear corner at 45 degrees', rel: 45 * D, dir: 200 * D },
    { name: 'nose into its end', rel: 0, dir: 180 * D },
    { name: 'diagonal, corner to corner', rel: 0, dir: 204 * D },
    { name: 'flank to flank', rel: 0, dir: 90 * D },
    { name: 'nose into its flank at 30 degrees', rel: 30 * D, dir: 90 * D },
  ];
  const targets: (number | 'racer')[] = [0, 1, 2, 3, 4, 'racer'];

  for (const t of targets) {
    for (const c of cases) {
      it(`${t === 'racer' ? 'another racer' : `parked style ${t}`}: ${c.name}`, () => {
        const bay = { use: 'car', variant: t === 'racer' ? 0 : t, x: 0, z: 0, h: 0, ax: 0, az: 1, garage: false, y: 0 } as Bay;
        const other: Box = t === 'racer' ? carShape({ x: 0, z: 0, h: 0 }) : (bayShapes(bay)[0] as Box);
        const spot = t === 'racer' ? { x: 0, z: 0, h: 0 } : parkedSpot(bay);
        const otherMesh = meshBox(t === 'racer' ? 0 : t, spot.x, spot.z, spot.h);
        const ux = Math.sin(c.dir);
        const uz = Math.cos(c.dir);
        const at = (r: number) => ({ x: ux * r, z: uz * r, h: c.rel });
        // Where the drawn bodies first touch, coming in from 20 m out.
        let lo = 0;
        let hi = 20;
        for (let i = 0; i < 50; i++) {
          const m = (lo + hi) / 2;
          const p = at(m);
          if (collide(meshBox(0, p.x, p.z, p.h), otherMesh)) lo = m;
          else hi = m;
        }
        const touch = hi;
        const meshGap = (r: number) => {
          const p = at(r);
          return gap(place(MESH[0], p.x, p.z, p.h), place(MESH[t === 'racer' ? 0 : t], spot.x, spot.z, spot.h));
        };
        // 3 cm of real clearance between the drawn cars (and anything more) is never contact.
        let r3 = touch;
        while (meshGap(r3) < 0.03) r3 += 0.002;
        for (const extra of [0, 0.01, 0.05, 0.2]) expect(collide(carShape(at(r3 + extra)), other), `with ${(0.03 + extra) * 100} cm or more`).toBeNull();
        // Where the colliders first meet, the drawn bodies are less than a centimetre apart (the visible gap at contact)...
        let a = touch - 0.05;
        let b = touch + 0.5;
        for (let i = 0; i < 50; i++) {
          const m = (a + b) / 2;
          if (collide(carShape(at(m)), other)) a = m;
          else b = m;
        }
        expect(meshGap(b), 'visible gap when the colliders first meet').toBeLessThan(0.01);
        // ...and once the drawn bodies overlap by a centimetre, it is contact.
        let r1 = touch;
        while ((collide(meshBox(0, at(r1).x, at(r1).z, c.rel), otherMesh)?.depth ?? 0) < 0.01) r1 -= 0.001;
        expect(collide(carShape(at(r1)), other)).not.toBeNull();
      });
    }
  }
});

/**
 * The same in a real round, through the whole step: your car drives past the corner of a car standing in the road at 45 degrees,
 * at a jog, on a line that leaves 3 cm of paint-to-paint clearance. Nobody is out. On a line that clips the corner, you are.
 */
describe('driving past a corner in a round', () => {
  // The real lot, with a clear patch of road round the two cars (no kerb or parked car to scrape on the diagonal).
  const full = buildLot();
  const far = (s: { x: number; z: number }) => Math.hypot(s.x + 30, s.z - LAYOUT.ZM) > 14;
  const lot = { ...full, solids: full.solids.filter(far), bays: full.bays.map((b) => (far(b) ? b : { ...b, use: 'free' as const })) };
  const press = (p: Partial<Input>): Input => ({ throttle: 0, brake: 0, steer: 0, handbrake: false, horn: false, ...p });
  const B = { x: -30, z: LAYOUT.ZM, h: Math.PI / 2 };
  const hA = B.h + Math.PI / 4;
  const fx = Math.sin(hA);
  const fz = Math.cos(hA);
  // A's line: through B's centre offset sideways by `off` (to A's left), 5 m back along A's heading.
  const start = (off: number) => ({ x: B.x - fx * 5 - fz * off, z: B.z - fz * 5 + fx * off });
  const bMesh = place(MESH[0], B.x, B.z, B.h);
  const closest = (off: number) => {
    const p = start(off);
    let d = Infinity;
    for (let t = 2; t < 8; t += 0.02) d = Math.min(d, gap(place(MESH[0], p.x + fx * t, p.z + fz * t, hA), bMesh));
    return d;
  };
  // The offset where the drawn bodies just touch on the way past (B's rear-left corner, A's front-right), then 3 cm out.
  const offFor = (want: number) => {
    let lo = 0; // overlapping
    let hi = 4; // clear
    for (let i = 0; i < 26; i++) {
      const m = (lo + hi) / 2;
      if (closest(m) < want) lo = m;
      else hi = m;
    }
    return hi;
  };
  const drive = (off: number) => {
    const r = createRound(lot, { seed: 4, bots: [false, false], target: full.candidates.find((id) => far(full.bays[id]))! });
    r.state.phase = 'race';
    r.state.peds = [];
    const [a, b] = r.state.cars;
    const p = start(off);
    Object.assign(a, { x: p.x, z: p.z, h: hA, vx: fx * 2, vz: fz * 2, w: 0 });
    Object.assign(b, { ...B, vx: 0, vz: 0, w: 0 });
    let seen = Infinity;
    for (let i = 0; i < 240 && a.dq === null; i++) {
      step(r.state, r.world, [press({ throttle: 0.15 }), press({ handbrake: true })]);
      seen = Math.min(seen, gap(place(MESH[0], a.x, a.z, a.h), place(MESH[0], b.x, b.z, b.h)));
    }
    return { a, seen };
  };

  it('3 cm of clearance is a clean pass', () => {
    const off = offFor(0.03);
    const { a, seen } = drive(off);
    expect(a.dq).toBeNull();
    // It really went that close (the car stays on its line).
    expect(seen).toBeLessThan(0.035);
  }, 30000);

  it('a corner that clips it is contact, and you are out', () => {
    // 10 cm further over: the bodies meet about 7 cm deep on the way past, hard enough to count (a lighter brush is a feather).
    const { a } = drive(offFor(0.03) - 0.1);
    expect(a.dq).not.toBeNull();
    expect(a.dqWhy?.kind).toBe('car');
  }, 30000);
});
