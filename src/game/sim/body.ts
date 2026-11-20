/**
 * The shape of each car body, with no three.js in it: the style data, the smoothed curves, the cross-section that is lofted along
 * the length, and the plan outline the colliders use. The renderer (render/car.ts) builds its meshes from `profile()`, and the
 * sim builds each car's collider from `planOutline()`, which is taken from the same sections, so what you see is what touches.
 */
import { BODY } from './constants';

export type Key = [number, number][];

export interface Style {
  length: number;
  width: number;
  front: number;
  rear: number;
  wheelR: number;
  /** Heights (z along the car) of the sill, the shoulder line, the top surface and its half width as a fraction of the body's. */
  bot: Key;
  belt: Key;
  top: Key;
  tw: Key;
  /** Windscreen (base z, top z) and the fastback / tailgate glass (front z, back z) on the top surface. */
  ws: [number, number];
  rw: [number, number];
  /** Side windows: front edge (bottom z, top z) and rear edge (bottom z, top z). */
  win: { f: [number, number]; r: [number, number] }[];
  doors: number[];
  handles: number[];
  rails: boolean;
  headY: number;
  grilleY: number;
  tailY: number;
  plateY: [number, number];
  reverseY: number;
  mirrorZ: number;
}

const RAW_STYLES: Style[] = [
  // 0: fastback four-door (the racers): low nose, long bonnet, roof sweeping into a short boot.
  {
    length: 4.68,
    width: 1.83,
    front: 1.38,
    rear: -1.34,
    wheelR: 0.335,
    bot: [[2.34, 0.37], [2.2, 0.3], [1.95, 0.22], [1.6, 0.185], [-1.6, 0.185], [-1.95, 0.235], [-2.2, 0.31], [-2.34, 0.38]],
    belt: [[2.34, 0.7], [2.2, 0.74], [1.4, 0.9], [0.9, 0.96], [-1.0, 0.985], [-2.0, 1.0], [-2.34, 0.95]],
    top: [[2.34, 0.6], [2.26, 0.68], [2.0, 0.77], [1.4, 0.92], [1.05, 0.985], [0.98, 1.0], [0.1, 1.395], [-0.35, 1.42], [-0.8, 1.35], [-1.25, 1.17], [-1.6, 1.05], [-2.0, 1.045], [-2.2, 1.06], [-2.34, 1.03]],
    tw: [[-2.34, 0.86], [-1.4, 0.84], [-0.5, 0.8], [0.3, 0.8], [1.0, 0.84], [2.34, 0.84]],
    ws: [0.96, 0.14],
    rw: [-0.7, -1.55],
    win: [
      { f: [0.9, 0.26], r: [-0.05, -0.08] },
      { f: [-0.15, -0.17], r: [-1.0, -0.6] },
    ],
    doors: [0.92, -0.1, -1.05],
    handles: [0.2, -0.8],
    rails: false,
    headY: 0.6,
    grilleY: 0.48,
    tailY: 0.86,
    plateY: [0.46, 0.66],
    reverseY: 0.5,
    mirrorZ: 0.84,
  },
  // 1: crossover: taller, more upright glass, roof rails.
  {
    length: 4.6,
    width: 1.86,
    front: 1.4,
    rear: -1.35,
    wheelR: 0.36,
    bot: [[2.3, 0.46], [2.15, 0.38], [1.9, 0.3], [1.6, 0.28], [-1.6, 0.28], [-1.95, 0.32], [-2.15, 0.38], [-2.3, 0.46]],
    belt: [[2.3, 0.86], [2.1, 0.92], [1.4, 1.04], [0.9, 1.1], [-1.0, 1.12], [-2.0, 1.14], [-2.3, 1.12]],
    top: [[2.3, 0.8], [2.2, 0.9], [1.9, 1.0], [1.4, 1.08], [1.05, 1.13], [0.98, 1.14], [0.36, 1.66], [0.1, 1.69], [-1.7, 1.68], [-1.98, 1.6], [-2.14, 1.36], [-2.24, 1.2], [-2.3, 1.12]],
    tw: [[-2.3, 0.86], [-1.8, 0.84], [-1.0, 0.82], [0.4, 0.82], [1.1, 0.85], [2.3, 0.85]],
    ws: [1.0, 0.42],
    rw: [-1.8, -2.2],
    win: [
      { f: [1.0, 0.5], r: [0.06, 0.04] },
      { f: [-0.06, -0.08], r: [-1.55, -1.25] },
    ],
    doors: [1.02, -0.02, -1.6],
    handles: [0.22, -0.88],
    rails: true,
    headY: 0.78,
    grilleY: 0.62,
    tailY: 1.0,
    plateY: [0.58, 0.7],
    reverseY: 0.58,
    mirrorZ: 0.98,
  },
  // 2: hatchback: short tail, steep tailgate glass.
  {
    length: 4.3,
    width: 1.8,
    front: 1.28,
    rear: -1.3,
    wheelR: 0.315,
    bot: [[2.15, 0.36], [2.0, 0.29], [1.75, 0.2], [1.5, 0.18], [-1.5, 0.18], [-1.8, 0.22], [-2.0, 0.29], [-2.15, 0.36]],
    belt: [[2.15, 0.68], [2.0, 0.72], [1.3, 0.88], [0.85, 0.94], [-1.0, 0.97], [-2.0, 0.99], [-2.15, 0.96]],
    top: [[2.15, 0.7], [2.05, 0.75], [1.6, 0.82], [1.3, 0.9], [0.95, 0.97], [0.88, 0.98], [0.25, 1.4], [-0.1, 1.44], [-1.1, 1.42], [-1.6, 1.33], [-1.9, 1.12], [-2.05, 1.02], [-2.15, 0.98]],
    tw: [[-2.15, 0.86], [-1.5, 0.84], [-0.6, 0.8], [0.3, 0.8], [1.0, 0.84], [2.15, 0.84]],
    ws: [0.86, 0.3],
    rw: [-1.35, -1.98],
    win: [
      { f: [0.78, 0.34], r: [0.04, 0.02] },
      { f: [-0.08, -0.1], r: [-1.05, -0.8] },
    ],
    doors: [0.8, -0.03, -1.1],
    handles: [0.2, -0.75],
    rails: false,
    headY: 0.62,
    grilleY: 0.5,
    tailY: 0.88,
    plateY: [0.46, 0.64],
    reverseY: 0.5,
    mirrorZ: 0.8,
  },
];

/** Scale a style: z (length), x (width), y (height). Keys, windows and lamp heights follow. */
const scaleStyle = (s: Style, sz: number, sx: number, sy: number, wheelR: number, front: number, rear: number): Style => {
  const kz = (k: Key): Key => k.map(([z, v]) => [z * sz, v]);
  const ky = (k: Key): Key => k.map(([z, v]) => [z * sz, v * sy]);
  const pair = (p: [number, number]): [number, number] => [p[0] * sz, p[1] * sz];
  return {
    ...s,
    length: s.length * sz,
    width: s.width * sx,
    front,
    rear,
    wheelR,
    bot: ky(s.bot),
    belt: ky(s.belt),
    top: ky(s.top),
    tw: kz(s.tw),
    ws: pair(s.ws),
    rw: pair(s.rw),
    win: s.win.map((w) => ({ f: pair(w.f), r: pair(w.r) })),
    doors: s.doors.map((z) => z * sz),
    handles: s.handles.map((z) => z * sz),
    headY: s.headY * sy,
    grilleY: s.grilleY * sy,
    tailY: s.tailY * sy,
    plateY: [s.plateY[0] * sy, s.plateY[1] * sy],
    reverseY: s.reverseY * sy,
    mirrorZ: s.mirrorZ * sz,
  };
};

/**
 * The five body styles. Length and width come from `BODY` (sim/constants.ts), which the colliders use too, so the drawn car and
 * the one the rules test can never drift apart. Height, wheel size and axles are only for the drawing.
 */
const sized = (raw: Style, b: { length: number; width: number }, sy: number, wheelR: number, front: number, rear: number) =>
  scaleStyle(raw, b.length / raw.length, b.width / raw.width, sy, wheelR, front, rear);
export const STYLES: Style[] = [
  // 0: the racers' fastback sedan, 4.45 x 1.78 x 1.40 m, wheelbase 2.62 m.
  sized(RAW_STYLES[0], BODY[0], 0.985, 0.335, 1.32, -1.3),
  // 1: crossover, 2: hatchback.
  sized(RAW_STYLES[1], BODY[1], 0.97, 0.35, 1.33, -1.29),
  sized(RAW_STYLES[2], BODY[2], 0.97, 0.305, 1.22, -1.24),
  // 3: SUV, 1.20 times as tall as the crossover it is drawn from.
  sized(RAW_STYLES[1], BODY[3], 1.2, 0.39, 1.45, -1.4),
  // 4: van, 1.6 times as tall: it hides what is behind it.
  sized(RAW_STYLES[2], BODY[4], 1.62, 0.36, 1.45, -1.5),
];

// ---------------------------------------------------------------------------
// Curves and the lofted body
// ---------------------------------------------------------------------------

export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
export const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));

/** Piecewise-linear keys, resampled and smoothed so creases become radii. Returns f(z). */
export const smoothCurve = (keys: Key, lo: number, hi: number, passes: number) => {
  const step = 0.02;
  const n = Math.round((hi - lo) / step) + 1;
  const ks = [...keys].sort((a, b) => a[0] - b[0]);
  let v = new Float32Array(n);
  let k = 0;
  for (let i = 0; i < n; i++) {
    const z = lo + i * step;
    while (k < ks.length - 2 && ks[k + 1][0] < z) k++;
    const [z0, y0] = ks[k];
    const [z1, y1] = ks[k + 1];
    v[i] = lerp(y0, y1, clamp((z - z0) / (z1 - z0 || 1), 0, 1));
  }
  for (let p = 0; p < passes; p++) {
    const w = new Float32Array(n);
    w[0] = v[0];
    w[n - 1] = v[n - 1];
    for (let i = 1; i < n - 1; i++) w[i] = (v[i - 1] + 2 * v[i] + v[i + 1]) / 4;
    v = w;
  }
  return (z: number) => {
    const f = clamp((z - lo) / step, 0, n - 1.001);
    const i = Math.floor(f);
    return lerp(v[i], v[i + 1], f - i);
  };
};

/**
 * The half-section is authored as nine points; the surface uses these refined, smoothly curved
 * ones. Points 4, 5 and 6 (character line, shoulder, roof edge) stay real creases, and the flank
 * and glasshouse bands between them stay dead straight so the glass and the trim lie flush.
 */
const SEG_STEPS = [1, 2, 2, 2, 3, 3, 2, 2];
export const I = { crease: 7, shoulder: 10, roof: 13, crown: 15, mid: 17 } as const;
export const HARD_REF = new Set<number>([I.crease, I.shoulder, I.roof]);
const HARD_SRC = new Set([4, 5, 6]);

const refine = (pts: [number, number][]): [number, number][] => {
  const out: [number, number][] = [pts[0]];
  const dir = (a: [number, number], b: [number, number]) => {
    const dx = b[0] - a[0];
    const dy = b[1] - a[1];
    const l = Math.hypot(dx, dy) || 1;
    return [dx / l, dy / l] as const;
  };
  // Unit tangent at source point i as seen from the segment that starts (side=1) or ends (side=0) there.
  const tan = (i: number, side: 0 | 1) => {
    if (i === 0 || i === pts.length - 1 || HARD_SRC.has(i)) return side === 1 ? dir(pts[i], pts[Math.min(pts.length - 1, i + 1)]) : dir(pts[Math.max(0, i - 1)], pts[i]);
    return dir(pts[i - 1], pts[i + 1]);
  };
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i];
    const b = pts[i + 1];
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
    const ta = tan(i, 1);
    const tb = tan(i + 1, 0);
    const m = SEG_STEPS[i];
    for (let k = 1; k <= m; k++) {
      const t = k / m;
      const t2 = t * t;
      const t3 = t2 * t;
      const h00 = 2 * t3 - 3 * t2 + 1;
      const h10 = t3 - 2 * t2 + t;
      const h01 = -2 * t3 + 3 * t2;
      const h11 = t3 - t2;
      out.push([h00 * a[0] + h10 * len * ta[0] + h01 * b[0] + h11 * len * tb[0], h00 * a[1] + h10 * len * ta[1] + h01 * b[1] + h11 * len * tb[1]]);
    }
    out[out.length - 1] = [b[0], b[1]];
  }
  for (let i = 1; i < out.length; i++) out[i][1] = Math.max(out[i][1], out[i - 1][1] + 0.002);
  return out;
};

export const CROWN = 0.007;
export const END_R = 0.34;
const RAKE = { front: 0.11, rear: 0.07 };

/** Bumpers are raked: near either end the low part of the face sits back from the top of it. */
const shearZ = (P: { half: number; bot: (z: number) => number; top: (z: number) => number; belt: (z: number) => number }, z: number, y: number) => {
  const front = z > 0;
  const d = P.half - Math.abs(z);
  const f = clamp(1 - d / 0.5, 0, 1) ** 1.5;
  if (f <= 0) return 0;
  const bt = P.bot(z);
  const t = Math.max(P.top(z), P.belt(z) + 0.03);
  const u = clamp((y - bt) / (t - bt || 1), 0, 1);
  return (front ? -1 : 1) * RAKE[front ? 'front' : 'rear'] * (1 - u) * f;
};

export interface Profile {
  s: Style;
  shear: (z: number, y: number) => number;
  half: number;
  hw: number;
  top: (z: number) => number;
  belt: (z: number) => number;
  bot: (z: number) => number;
  section: (z: number) => [number, number][];
}

const profiles: Profile[] = [];

export const profile = (style: number): Profile => {
  if (profiles[style]) return profiles[style];
  const s = STYLES[style];
  const half = s.length / 2;
  const hw = s.width / 2;
  const top = smoothCurve(s.top, -half, half, 22);
  const belt = smoothCurve(s.belt, -half, half, 24);
  const bot = smoothCurve(s.bot, -half, half, 14);
  const tw = smoothCurve(s.tw, -half, half, 20);
  const section = (z: number): [number, number][] => {
    const d = Math.min(z + half, half - z);
    let k = d >= 0.9 ? 1 : 0.965 + 0.035 * clamp(d / 0.9, 0, 1) ** 2;
    if (d < END_R) {
      const r = (END_R - d) / END_R;
      k *= 0.62 + 0.38 * Math.sqrt(Math.max(0, 1 - r * r));
    }
    const w = hw * k;
    const b = belt(z);
    const y5 = b - 0.03;
    const t = Math.max(top(z), b + 0.03);
    const bt = bot(z);
    const f = tw(z);
    const pts: [number, number][] = [
      [0, bt],
      [w * 0.78, bt],
      [w * 0.945, bt + 0.06],
      [w * 0.985, lerp(bt, y5, 0.4)],
      [w * 0.972, lerp(bt, y5, lerp(0.55, 0.7, clamp((1.0 - z) / 2.3, 0, 1)))],
      [w, y5],
      [w * f, Math.max(b - 0.01, t - 0.045)],
      [w * f * 0.5, t + CROWN],
      [0, t + CROWN],
    ];
    for (let i = 1; i < pts.length; i++) pts[i][1] = Math.max(pts[i][1], pts[i - 1][1] + 0.004);
    return refine(pts);
  };
  const prof: Profile = { s, half, hw, top, belt, bot, section, shear: (z, y) => shearZ({ half, bot, top, belt }, z, y) };
  return (profiles[style] = prof);
};

/** Station positions along z: dense near both ends where the plan outline turns. */
export const stations = (half: number) => {
  const zs: number[] = [];
  for (let i = 0; i <= 10; i++) zs.push(-half + END_R * (i / 10) ** 2);
  for (let z = -half + END_R + 0.07; z < half - END_R - 0.04; z += 0.07) zs.push(z);
  for (let i = 10; i >= 0; i--) zs.push(half - END_R * (i / 10) ** 2);
  return zs;
};

/** x of the body's side at height y (right side), from a half-section. */
export const xAtY = (pts: [number, number][], y: number) => {
  const yy = clamp(y, pts[0][1], pts[pts.length - 1][1]);
  for (let j = 0; j < pts.length - 1; j++) {
    if (yy <= pts[j + 1][1] + 1e-9) {
      const [x0, y0] = pts[j];
      const [x1, y1] = pts[j + 1];
      return lerp(x0, x1, clamp((yy - y0) / (y1 - y0 || 1), 0, 1));
    }
  }
  return pts[pts.length - 1][0];
};

// ---------------------------------------------------------------------------
// End caps and wheels (drawn by render/car.ts, and part of the plan outline)
// ---------------------------------------------------------------------------

export type Pt3 = readonly [number, number, number];

/** How far the middle of each end cap bulges out (m), and the rings it is drawn with. */
export const END_DOME = 0.01;
export const CAP_SCALES = [1, 0.72, 0.45, 0.2];

/**
 * The cap closing the loft at station z (nz +1 the nose, -1 the tail): its rim (the section all round), its centre, and where
 * a rim point lands when the rim is shrunk by `sc` towards the centre and domed out.
 */
export const endCap = (P: Profile, z: number, nz: 1 | -1) => {
  const sec = P.section(z);
  const nj = sec.length;
  const v = (sx: number, j: number): Pt3 => [sec[j][0] * sx, sec[j][1], z + P.shear(z, sec[j][1])];
  const ring: Pt3[] = [];
  for (let j = 0; j < nj; j++) ring.push(v(1, j));
  for (let j = nj - 2; j >= 1; j--) ring.push(v(-1, j));
  const sum = ring.reduce((a, p) => [a[0] + p[0], a[1] + p[1], a[2] + p[2]] as Pt3, [0, 0, 0] as Pt3);
  const c: Pt3 = [sum[0] / ring.length, sum[1] / ring.length, sum[2] / ring.length];
  const R2 = Math.max(...ring.map((p) => (p[0] - c[0]) ** 2 + (p[1] - c[1]) ** 2));
  const dome = (p: Pt3, sc: number): Pt3 => {
    const dx = (p[0] - c[0]) * sc;
    const dy = (p[1] - c[1]) * sc;
    return [c[0] + dx, c[1] + dy, c[2] + (p[2] - c[2]) * sc + nz * END_DOME * (1 - (dx * dx + dy * dy) / R2)];
  };
  const top: Pt3 = [c[0], c[1], c[2] + nz * END_DOME];
  return { ring, c, R2, dome, top };
};

/** Tyre half-width (m); its sidewall bulges to 1.03 times that, a little under 0.88 of the radius out from the hub. */
export const TYRE_W = 0.115;
/** Where the wheels sit across the car: the tyre's outer face is flush with the flank. */
export const wheelX = (s: Style) => s.width / 2 - TYRE_W;

// ---------------------------------------------------------------------------
// Plan outline (the collider)
// ---------------------------------------------------------------------------

/** A point in the car's own frame: `x` to its right, `z` towards its nose (metres). */
export type PlanPt = readonly [number, number];

const cross = (o: PlanPt, a: PlanPt, b: PlanPt) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);

/** Convex hull, counter-clockwise (x right, z forward), no repeated or collinear points. */
export const hull = (pts: PlanPt[]): PlanPt[] => {
  const p = [...pts].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  if (p.length < 3) return p;
  const lo: PlanPt[] = [];
  const up: PlanPt[] = [];
  for (const q of p) {
    while (lo.length >= 2 && cross(lo[lo.length - 2], lo[lo.length - 1], q) <= 0) lo.pop();
    lo.push(q);
  }
  for (let i = p.length - 1; i >= 0; i--) {
    const q = p[i];
    while (up.length >= 2 && cross(up[up.length - 2], up[up.length - 1], q) <= 0) up.pop();
    up.push(q);
  }
  return lo.slice(0, -1).concat(up.slice(0, -1));
};

/** Distance from p to the segment a-b. */
export const segDist = (p: PlanPt, a: PlanPt, b: PlanPt) => {
  const dx = b[0] - a[0];
  const dz = b[1] - a[1];
  const t = clamp(((p[0] - a[0]) * dx + (p[1] - a[1]) * dz) / (dx * dx + dz * dz || 1), 0, 1);
  return Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dz);
};

/** Douglas-Peucker on an open chain: keep the ends, and any point the chord between kept points would pass more than `tol` from. */
const simplify = (c: PlanPt[], tol: number): PlanPt[] => {
  if (c.length <= 2) return c;
  let worst = 0;
  let at = -1;
  for (let i = 1; i < c.length - 1; i++) {
    const d = segDist(c[i], c[0], c[c.length - 1]);
    if (d > worst) (worst = d), (at = i);
  }
  if (worst <= tol) return [c[0], c[c.length - 1]];
  return [...simplify(c.slice(0, at + 1), tol).slice(0, -1), ...simplify(c.slice(at), tol)];
};

/** How far (m) the collider may cut inside the drawn body between two of its corners. */
export const OUTLINE_TOL = 0.004;

const outlines: PlanPt[][] = [];

/**
 * The car's footprint seen from above, as a convex polygon (counter-clockwise, car frame, symmetric left to right), for body style `style`. It is the
 * hull of the very points the body loft is built from (every section at every station, with the bumper rake), so its corners
 * lie on the drawn body and its edges cut inside it by at most `OUTLINE_TOL`. Mirrors are not in it (players do not count them).
 */
export const planOutline = (style: number): PlanPt[] => {
  if (outlines[style]) return outlines[style];
  const P = profile(style);
  // The right half of the body (the loft is mirrored, so the left is the same), as the hull of every loft point.
  const pts: PlanPt[] = [];
  for (const z of stations(P.half)) {
    for (const [x, y] of P.section(z)) {
      const zz = z + P.shear(z, y);
      pts.push([x, zz], [-x, zz]);
    }
  }
  // The domed end caps (they bulge a centimetre past the bumper's top edge) and the tyres' sidewalls (they stand out of the
  // body where it narrows towards the ends).
  const zs = stations(P.half);
  for (const [z, nz] of [[zs[0], -1], [zs[zs.length - 1], 1]] as [number, 1 | -1][]) {
    const cap = endCap(P, z, nz);
    for (const sc of CAP_SCALES) for (const p of cap.ring) pts.push([cap.dome(p, sc)[0], cap.dome(p, sc)[2]]);
    pts.push([cap.top[0], cap.top[2]]);
  }
  const s = P.s;
  for (const axle of [s.front, s.rear]) {
    for (const sx of [1, -1]) {
      const x = sx * (wheelX(s) + TYRE_W * 1.03);
      pts.push([x, axle + s.wheelR * 0.88], [x, axle - s.wheelR * 0.88]);
    }
  }
  const h = hull(pts);
  // Its right side, nose to tail (the hull runs counter-clockwise, so the right side runs from the tail up to the nose).
  const right = h.filter((p) => p[0] > 1e-6).sort((a, b) => b[1] - a[1]);
  const side = simplify(right, OUTLINE_TOL);
  // Mirror it, and run round counter-clockwise (x right, z forward): down the left side from the nose, up the right side.
  const out: PlanPt[] = [...side, ...side.map(([x, z]) => [-x, z] as PlanPt).reverse()].reverse();
  return (outlines[style] = out);
};
