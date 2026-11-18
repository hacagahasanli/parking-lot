/**
 * Cars built in code. The body is a lofted surface: a cross-section (sill, tucked flank, shoulder
 * crease, tumblehome, crowned roof) is swept along the length with its heights and widths driven by
 * smooth curves (hood, windscreen, roof, fastback glass, deck). Glass, lamps, door shut-lines and
 * wheel arches are thin patches laid on that surface, so the roof and the pillars stay body colour
 * and the whole thing reads as one shaped car, not boxes. Three styles share the code: a fastback
 * four-door sedan (the racers), a crossover and a hatchback (the parked cars).
 *
 * Every part is grouped by material so 130 parked cars can be drawn with a handful of instanced
 * draw calls, while the racers get their own meshes with spinning, steering wheels.
 */
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

export type PartKind = 'paint' | 'glass' | 'trim' | 'chrome' | 'head' | 'tail' | 'tyre' | 'rim' | 'plate';

type Key = [number, number][];

interface Style {
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

/** Sedan 4.45 x 1.78 x 1.40 m, wheelbase 2.62 m; the other two scale in proportion. */
export const STYLES: Style[] = [
  scaleStyle(RAW_STYLES[0], 4.45 / 4.68, 1.78 / 1.83, 0.985, 0.335, 1.32, -1.3),
  scaleStyle(RAW_STYLES[1], 0.955, 0.975, 0.97, 0.35, 1.33, -1.29),
  scaleStyle(RAW_STYLES[2], 0.955, 0.975, 0.97, 0.305, 1.22, -1.24),
  // 3: SUV, 4.72 x 1.92 m and 1.20 times as tall.
  scaleStyle(RAW_STYLES[1], 4.72 / 4.6, 1.92 / 1.86, 1.2, 0.39, 1.45, -1.4),
  // 4: van, 4.95 x 1.98 m and 1.6 times as tall: it hides what is behind it.
  scaleStyle(RAW_STYLES[2], 4.95 / 4.3, 1.98 / 1.8, 1.62, 0.36, 1.45, -1.5),
];

// ---------------------------------------------------------------------------
// Curves and the lofted body
// ---------------------------------------------------------------------------

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));

/** Piecewise-linear keys, resampled and smoothed so creases become radii. Returns f(z). */
const smoothCurve = (keys: Key, lo: number, hi: number, passes: number) => {
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
const I = { crease: 7, shoulder: 10, roof: 13, crown: 15, mid: 17 } as const;
const HARD_REF = new Set<number>([I.crease, I.shoulder, I.roof]);
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

const CROWN = 0.007;
const END_R = 0.34;
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

interface Profile {
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

const profile = (style: number): Profile => {
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
      [w * 0.925, lerp(bt, y5, lerp(0.5, 0.86, clamp((1.0 - z) / 2.3, 0, 1)))],
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
const stations = (half: number) => {
  const zs: number[] = [];
  for (let i = 0; i <= 10; i++) zs.push(-half + END_R * (i / 10) ** 2);
  for (let z = -half + END_R + 0.07; z < half - END_R - 0.04; z += 0.07) zs.push(z);
  for (let i = 10; i >= 0; i--) zs.push(half - END_R * (i / 10) ** 2);
  return zs;
};

/** x of the body's side at height y (right side), from a half-section. */
const xAtY = (pts: [number, number][], y: number) => {
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

const HARD = HARD_REF; // the character crease is a real edge

/** The body loft, both halves, per-band normals so the crease stays sharp and the rest stays soft. */
const bodyLoft = (P: Profile) => {
  const zs = stations(P.half);
  const secs = zs.map((z) => P.section(z));
  const pos: number[] = [];
  const nor: number[] = [];
  const idx: number[] = [];
  const nj = secs[0].length;
  const vtx = (sx: number, i: number, j: number) => new THREE.Vector3(secs[i][j][0] * sx, secs[i][j][1], zs[i] + P.shear(zs[i], secs[i][j][1]));
  const bands: number[] = [0, ...[...HARD, nj - 1].sort((a, b) => a - b)];
  for (const sx of [1, -1]) {
    for (let bi = 0; bi < bands.length - 1; bi++) {
      const j0 = bands[bi];
      const j1 = bands[bi + 1];
      const base = pos.length / 3;
      const cols = j1 - j0 + 1;
      for (let i = 0; i < zs.length; i++) {
        for (let jj = j0; jj <= j1; jj++) {
          const p = vtx(sx, i, jj);
          // Tangent across the section: inside a band it is smooth; at a crease it stays within the band.
          const jA = jj === j0 && HARD.has(jj) ? jj : Math.max(0, jj - 1);
          const jB = jj === j1 && HARD.has(jj) ? jj : Math.min(nj - 1, jj + 1);
          const dj = vtx(sx, i, jB).sub(vtx(sx, i, jA));
          const dz = vtx(sx, Math.min(zs.length - 1, i + 1), jj).sub(vtx(sx, Math.max(0, i - 1), jj));
          const n = new THREE.Vector3().crossVectors(dj, dz);
          if (sx < 0) n.negate();
          n.normalize();
          pos.push(p.x, p.y, p.z);
          nor.push(n.x, n.y, n.z);
        }
      }
      for (let i = 0; i < zs.length - 1; i++) {
        for (let k = 0; k < cols - 1; k++) {
          const a = base + i * cols + k;
          const b = a + 1;
          const c = a + cols;
          const d = c + 1;
          if (sx > 0) idx.push(a, b, c, b, d, c);
          else idx.push(a, c, b, b, c, d);
        }
      }
    }
  }
  // End caps: a gently domed disc of rings, its normals blending into the loft's at the rim.
  for (const [i, nz] of [[0, -1], [zs.length - 1, 1]] as [number, number][]) {
    const ring: THREE.Vector3[] = [];
    for (let j = 0; j < nj; j++) ring.push(vtx(1, i, j));
    for (let j = nj - 2; j >= 1; j--) ring.push(vtx(-1, i, j));
    const c = ring.reduce((acc, p) => acc.add(p), new THREE.Vector3()).multiplyScalar(1 / ring.length);
    const slope = (ring[nj - 1].z - ring[0].z) / (ring[nj - 1].y - ring[0].y || 1);
    const cn = new THREE.Vector3(0, -nz * slope, nz).normalize();
    const R2 = Math.max(...ring.map((p) => (p.x - c.x) ** 2 + (p.y - c.y) ** 2));
    const B = 0.035;
    const scales = [1, 0.72, 0.45, 0.2];
    const base = pos.length / 3;
    const n = ring.length;
    for (const sc of scales) {
      for (const p of ring) {
        const dx = (p.x - c.x) * sc;
        const dy = (p.y - c.y) * sc;
        pos.push(c.x + dx, c.y + dy, c.z + nz * B * (1 - (dx * dx + dy * dy) / R2));
        const nn = new THREE.Vector3(((2 * B) / R2) * dx * nz, ((2 * B) / R2) * dy * nz, 0).add(cn).normalize();
        nor.push(nn.x, nn.y, nn.z);
      }
    }
    const centre = pos.length / 3;
    pos.push(c.x, c.y, c.z + nz * B);
    nor.push(cn.x, cn.y, cn.z);
    const tri = (a: number, b: number, d: number) => {
      const A = new THREE.Vector3(pos[a * 3], pos[a * 3 + 1], pos[a * 3 + 2]);
      const Bv = new THREE.Vector3(pos[b * 3], pos[b * 3 + 1], pos[b * 3 + 2]);
      const C = new THREE.Vector3(pos[d * 3], pos[d * 3 + 1], pos[d * 3 + 2]);
      const cr = Bv.sub(A).cross(C.sub(A));
      if (cr.z * nz > 0) idx.push(a, b, d);
      else idx.push(a, d, b);
    };
    for (let r = 0; r < scales.length - 1; r++) {
      for (let k = 0; k < n; k++) {
        const k2 = (k + 1) % n;
        const a = base + r * n + k;
        const b = base + r * n + k2;
        const d = base + (r + 1) * n + k;
        const e = base + (r + 1) * n + k2;
        tri(a, b, d);
        tri(b, e, d);
      }
    }
    for (let k = 0; k < n; k++) tri(base + (scales.length - 1) * n + k, base + (scales.length - 1) * n + ((k + 1) % n), centre);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setIndex(idx);
  return g;
};

/** A grid of points (rows x columns) as a surface, wound so its normal faces `hint`. */
const gridSurface = (rows: THREE.Vector3[][], hint: THREE.Vector3) => {
  const nu = rows[0].length;
  const pos: number[] = [];
  for (const r of rows) for (const p of r) pos.push(p.x, p.y, p.z);
  const idx: number[] = [];
  const sum = new THREE.Vector3();
  const tmp = new THREE.Vector3();
  for (let v = 0; v < rows.length - 1; v++) {
    for (let u = 0; u < nu - 1; u++) {
      const a = v * nu + u;
      const b = a + 1;
      const c = a + nu;
      const d = c + 1;
      idx.push(a, b, c, b, d, c);
      for (const [p, q, r] of [[a, b, c], [b, d, c]]) {
        const A = rows[Math.floor(p / nu)][p % nu];
        const B = rows[Math.floor(q / nu)][q % nu];
        const C = rows[Math.floor(r / nu)][r % nu];
        sum.add(tmp.subVectors(B, A).cross(new THREE.Vector3().subVectors(C, A)));
      }
    }
  }
  if (sum.dot(hint) < 0) for (let i = 0; i < idx.length; i += 3) [idx[i + 1], idx[i + 2]] = [idx[i + 2], idx[i + 1]];
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
};

const range = (n: number) => Array.from({ length: n + 1 }, (_, i) => i / n);

/** Offset along the outward normal of the top surface at z. */
const topNormal = (P: Profile, z: number) => {
  const d = (P.top(z + 0.03) - P.top(z - 0.03)) / 0.06;
  return new THREE.Vector3(0, 1, -d).normalize();
};

/** y of the top surface at |x| (between the roof corner, the crown and the centre line). */
const topY = (pts: [number, number][], x: number) => {
  const [c, m, e] = [pts[I.roof], pts[I.crown], pts[I.mid]];
  const ax = Math.abs(x);
  return ax >= m[0] ? lerp(m[1], c[1], clamp((ax - m[0]) / (c[0] - m[0] || 1), 0, 1)) : lerp(e[1], m[1], clamp(ax / (m[0] || 1), 0, 1));
};

const windscreen = (P: Profile, a: number, b: number, inset: number, off: number) => {
  const rows = range(8).map((u) => {
    const z = lerp(a, b, u);
    const pts = P.section(z);
    const xe = pts[I.roof][0] - inset;
    const n = topNormal(P, z).multiplyScalar(off);
    return range(10).map((v) => {
      const x = (v * 2 - 1) * xe;
      return new THREE.Vector3(x, topY(pts, x), z).add(n);
    });
  });
  return gridSurface(rows, new THREE.Vector3(0, 1, 0));
};

const sideWindow = (P: Profile, w: Style['win'][number], sx: number, off: number) => {
  const rows = range(8).map((v) => {
    const zf = lerp(w.f[0], w.f[1], v);
    const zr = lerp(w.r[0], w.r[1], v);
    const t = lerp(0.1, 0.9, v);
    return range(10).map((u) => {
      const z = lerp(zr, zf, u);
      const pts = P.section(z);
      const p5 = new THREE.Vector2(pts[I.shoulder][0], pts[I.shoulder][1]);
      const p6 = new THREE.Vector2(pts[I.roof][0], pts[I.roof][1]);
      const q = p5.clone().lerp(p6, t);
      const dir = p6.clone().sub(p5).normalize();
      return new THREE.Vector3((q.x + dir.y * off) * sx, q.y - dir.x * off, z);
    });
  });
  return gridSurface(rows, new THREE.Vector3(sx, 0, 0));
};

/** A strip laid on the flank between two heights and two z, at `off` outside the body. */
const flankStrip = (P: Profile, z0: number, z1: number, y0: number, y1: number, sx: number, off: number, nz = 2) =>
  gridSurface(
    range(12).map((v) =>
      range(nz).map((u) => {
        const z = lerp(z0, z1, u / nz);
        const y = lerp(y0, y1, v);
        return new THREE.Vector3((xAtY(P.section(z), y) + off) * sx, y, z);
      }),
    ),
    new THREE.Vector3(sx, 0, 0),
  );

/**
 * A band of light or trim that follows the body's outline at height y round a bumper: from
 * `run` metres back along one side, across the face and back along the other. `keep` picks which
 * x range of it to build (so the same call makes a full-width bar, or just the corner clusters).
 */
const bumperBand = (P: Profile, end: 1 | -1, y: number, h: number, off: number, keep: (ax: number) => boolean, run = 0.55) => {
  const zEnd = end * P.half;
  const sideZ = stations(P.half).filter((z) => (end > 0 ? z >= zEnd - run : z <= zEnd + run && z >= -P.half));
  if (end > 0) sideZ.sort((a, b) => a - b);
  else sideZ.sort((a, b) => b - a);
  type Pt = { x: number; z: number; y: number };
  const at = (z: number): Pt => {
    const pts = P.section(z);
    const yy = clamp(y, P.bot(z) + 0.03, Math.max(P.top(z), P.belt(z) + 0.03) - 0.04);
    return { x: xAtY(pts, yy), z: z + P.shear(z, yy), y: yy };
  };
  const right = sideZ.map(at);
  const face = at(zEnd);
  const cap: Pt[] = range(30).map((u) => ({ x: lerp(face.x, -face.x, u), z: face.z, y: face.y }));
  const left = [...right].reverse().map((p) => ({ ...p, x: -p.x }));
  const path = [...right, ...cap.slice(1, -1), ...left];
  const geos: THREE.BufferGeometry[] = [];
  let runPts: { p: THREE.Vector3; n: THREE.Vector3 }[] = [];
  const flush = () => {
    if (runPts.length > 1) {
      const lo = runPts.map(({ p, n }) => new THREE.Vector3(p.x + n.x * off, p.y - h / 2, p.z + n.z * off));
      const hi = runPts.map(({ p, n }) => new THREE.Vector3(p.x + n.x * off, p.y + h / 2, p.z + n.z * off));
      const hint = runPts.reduce((acc, { n }) => acc.add(n), new THREE.Vector3());
      geos.push(gridSurface([lo, hi], hint));
    }
    runPts = [];
  };
  path.forEach((p, i) => {
    const a = path[Math.max(0, i - 1)];
    const b = path[Math.min(path.length - 1, i + 1)];
    let n = new THREE.Vector3(b.z - a.z, 0, -(b.x - a.x)).normalize();
    if (n.x * p.x + n.z * p.z < 0) n = n.negate();
    if (keep(Math.abs(p.x))) runPts.push({ p: new THREE.Vector3(p.x, p.y, p.z), n });
    else flush();
  });
  flush();
  return geos;
};

const archDisc = (P: Profile, wz: number, sx: number) => {
  const r0 = P.s.wheelR + 0.035;
  const rows = range(7).map((v) =>
    range(28).map((u) => {
      const a = u * Math.PI * 2;
      const r = r0 * v;
      const z = wz + Math.cos(a) * r;
      const y = Math.max(P.bot(z) + 0.015, P.s.wheelR + Math.sin(a) * r);
      const sec = P.section(z);
      const x = Math.max(xAtY(sec, y), xAtY(sec, y + 0.1), xAtY(sec, y - 0.1));
      return new THREE.Vector3((x + 0.007) * sx, y, z);
    }),
  );
  return gridSurface(rows, new THREE.Vector3(sx, 0, 0));
};

const box = (w: number, h: number, d: number, x: number, y: number, z: number) => {
  const g = new THREE.BoxGeometry(w, h, d);
  g.translate(x, y, z);
  return g;
};

/** A tyre as a lathe (rounded shoulders), axis along x. */
export const tyreGeometry = (r: number) => {
  const w = 0.12;
  const pts = [
    new THREE.Vector2(r * 0.66, -w),
    new THREE.Vector2(r * 0.93, -w),
    new THREE.Vector2(r, -w * 0.7),
    new THREE.Vector2(r, w * 0.7),
    new THREE.Vector2(r * 0.93, w),
    new THREE.Vector2(r * 0.66, w),
  ];
  const g = new THREE.LatheGeometry(pts, 24);
  g.rotateZ(Math.PI / 2);
  return g;
};

/** Alloy rim: dish, five spokes and a centre cap, facing +x (flip for the left side). */
export const rimGeometry = (r: number) => {
  const parts: THREE.BufferGeometry[] = [];
  const dish = new THREE.CylinderGeometry(r * 0.68, r * 0.68, 0.16, 20, 1, true);
  dish.rotateZ(Math.PI / 2);
  parts.push(dish);
  const face = new THREE.CylinderGeometry(r * 0.2, r * 0.2, 0.05, 12);
  face.rotateZ(Math.PI / 2);
  face.translate(0.09, 0, 0);
  parts.push(face);
  for (let i = 0; i < 5; i++) {
    const spoke = new THREE.BoxGeometry(0.04, r * 0.5, 0.085);
    spoke.translate(0.09, r * 0.42, 0);
    spoke.rotateX((i / 5) * Math.PI * 2);
    parts.push(spoke);
  }
  const lip = new THREE.TorusGeometry(r * 0.66, 0.018, 6, 24);
  lip.rotateY(Math.PI / 2);
  lip.translate(0.08, 0, 0);
  parts.push(lip);
  return mergeGeometries(parts.map((p) => p.toNonIndexed()))!;
};

export type CarGeometry = Record<PartKind, THREE.BufferGeometry | null>;

/** Where the wheels sit across the car: the tyre's outer face is flush with the flank. */
const wheelX = (s: Style) => s.width / 2 - 0.115;

/**
 * All the static parts of one body style, merged per material. With `wheels` the four wheels are
 * baked in (parked cars); without, the racers add their own so they can turn.
 */
export const carGeometry = (style: number, wheels: boolean): CarGeometry => {
  const P = profile(style);
  const { s, half, hw } = P;
  const parts: Record<PartKind, THREE.BufferGeometry[]> = {
    paint: [],
    glass: [],
    trim: [],
    chrome: [],
    head: [],
    tail: [],
    tyre: [],
    rim: [],
    plate: [],
  };

  parts.paint.push(bodyLoft(P));

  // Glass: windscreen, the glass at the back, and the side windows, laid just proud of the paint.
  parts.glass.push(windscreen(P, s.ws[0], s.ws[1], 0.07, 0.006));
  parts.glass.push(windscreen(P, s.rw[0], s.rw[1], 0.1, 0.006));
  for (const sx of [1, -1]) for (const w of s.win) parts.glass.push(sideWindow(P, w, sx, 0.005));

  // Door shut-lines, rocker panels, handles, mirrors, roof rails.
  const zs0 = s.rear + s.wheelR + 0.1;
  const zs1 = s.front - s.wheelR - 0.1;
  for (const sx of [1, -1]) {
    for (const z of s.doors) parts.trim.push(flankStrip(P, z - 0.004, z + 0.004, P.bot(z) + 0.2, P.belt(z) + 0.0, sx, 0.006, 1));
    parts.trim.push(flankStrip(P, zs0, zs1, P.bot(0) + 0.07, P.bot(0) + 0.19, sx, 0.007, 8));
    for (const z of s.handles) {
      const y = P.belt(z) - 0.1;
      parts.chrome.push(box(0.02, 0.028, 0.16, sx * (xAtY(P.section(z), y) + 0.008), y, z));
    }
    const mz = s.mirrorZ;
    const my = P.belt(mz) + 0.03;
    parts.paint.push(box(0.08, 0.085, 0.15, sx * (hw + 0.07), my, mz - 0.03));
    parts.trim.push(box(0.1, 0.03, 0.04, sx * (hw + 0.02), my - 0.035, mz));
    parts.trim.push(archDisc(P, s.front, sx), archDisc(P, s.rear, sx));
    if (s.rails) {
      const z = (s.ws[1] + s.rw[0]) / 2;
      const len = s.ws[1] - s.rw[0] - 0.3;
      const x = P.section(z)[I.roof][0] - 0.1;
      parts.trim.push(box(0.04, 0.035, len, sx * x, P.top(z) + 0.03, z));
    }
  }

  // Front: a full-width LED strip across the nose, lamp housings at the corners, grille below.
  const hf = bumperBand(P, 1, s.headY, 0.022, 0.009, () => true);
  parts.head.push(...hf);
  parts.trim.push(...bumperBand(P, 1, s.headY - 0.005, 0.085, 0.004, (ax) => ax > 0.18));
  parts.head.push(...bumperBand(P, 1, s.headY - 0.055, 0.025, 0.009, (ax) => ax > 0.5 && ax < 0.8, 0.3));
  parts.trim.push(...bumperBand(P, 1, s.grilleY, 0.12, 0.005, (ax) => ax < 0.62, 0.1));
  parts.trim.push(...bumperBand(P, 1, P.bot(half) + 0.06, 0.05, 0.004, () => true, 0.7));
  parts.plate.push(box(0.52, 0.12, 0.02, 0, s.plateY[0], half + P.shear(half, s.plateY[0]) + 0.004));

  // The boot: a shut line across the lid and a crisp spoiler lip on its rear edge.
  parts.trim.push(windscreen(P, s.rw[1] - 0.03, s.rw[1] - 0.045, 0.03, 0.004));
  {
    const z = -half + 0.3;
    const x = P.section(z)[I.roof][0] * 0.78;
    const lip = new THREE.BoxGeometry(x * 2, 0.022, 0.12);
    lip.rotateX(0.05);
    lip.translate(0, P.top(z) + 0.008, z);
    parts.paint.push(lip);
  }

  // Rear: one thin bar of light across the whole boot with deeper clusters at the corners.
  parts.tail.push(...bumperBand(P, -1, s.tailY, 0.026, 0.008, () => true, 0.3));
  parts.tail.push(...bumperBand(P, -1, s.tailY - 0.04, 0.17, 0.007, (ax) => ax > 0.43, 0.3));
  parts.trim.push(...bumperBand(P, -1, P.bot(-half) + 0.1, 0.17, 0.004, () => true, 0.7));
  parts.plate.push(box(0.52, 0.12, 0.02, 0, s.plateY[1], -half + P.shear(-half, s.plateY[1]) - 0.004));

  if (wheels) {
    for (const [wx, wz] of [
      [wheelX(s), s.front],
      [-wheelX(s), s.front],
      [wheelX(s), s.rear],
      [-wheelX(s), s.rear],
    ]) {
      const t = tyreGeometry(s.wheelR);
      t.translate(wx, s.wheelR, wz);
      parts.tyre.push(t);
      const r = rimGeometry(s.wheelR);
      if (wx < 0) r.rotateY(Math.PI);
      r.translate(wx, s.wheelR, wz);
      parts.rim.push(r);
    }
  }

  const out = {} as CarGeometry;
  for (const k of Object.keys(parts) as PartKind[]) {
    out[k] = parts[k].length
      ? mergeGeometries(
          parts[k].map((p) => {
            const g = p.index ? p.toNonIndexed() : p;
            g.deleteAttribute('uv');
            return g;
          }),
        )!
      : null;
  }
  return out;
};

// ---------------------------------------------------------------------------
// Materials
// ---------------------------------------------------------------------------

export const carMaterials = () => ({
  glass: new THREE.MeshPhysicalMaterial({ color: 0x1b2833, metalness: 0.35, roughness: 0.08, clearcoat: 1, envMapIntensity: 1.8 }),
  trim: new THREE.MeshStandardMaterial({ color: 0x15171a, roughness: 0.55, metalness: 0.1 }),
  chrome: new THREE.MeshStandardMaterial({ color: 0xd6dadf, roughness: 0.18, metalness: 1 }),
  tyre: new THREE.MeshStandardMaterial({ color: 0x1b1c1e, roughness: 0.92 }),
  rim: new THREE.MeshStandardMaterial({ color: 0xb9bec6, roughness: 0.28, metalness: 0.9 }),
  plate: new THREE.MeshStandardMaterial({ color: 0xf1f1ea, roughness: 0.5 }),
});

/** Deeper, more saturated paint with a real clearcoat: dark base, tight clearcoat highlights. */
const deepen = (color: number) => {
  const c = new THREE.Color(color);
  const hsl = { h: 0, s: 0, l: 0 };
  c.getHSL(hsl);
  return c.setHSL(hsl.h, Math.min(1, hsl.s * 1.15), hsl.l * 0.52);
};

export const paintMaterial = (color: number) =>
  new THREE.MeshPhysicalMaterial({ color: deepen(color), metalness: 0.35, roughness: 0.4, clearcoat: 0.35, clearcoatRoughness: 0.15, envMapIntensity: 0.2 });

/** Number plate texture with a short word on it. */
export const plateTexture = (text: string) => {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 60;
  const g = c.getContext('2d')!;
  g.fillStyle = '#f2f2ea';
  g.fillRect(0, 0, 256, 60);
  g.fillStyle = '#1d4fa8';
  g.fillRect(0, 0, 26, 60);
  g.strokeStyle = '#222';
  g.lineWidth = 4;
  g.strokeRect(2, 2, 252, 56);
  g.fillStyle = '#111';
  g.font = 'bold 40px "Arial Narrow", Arial, sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(text, 140, 32);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
};

// ---------------------------------------------------------------------------
// A racer: its own meshes, wheels that steer and spin, lights that react, a body that leans.
// ---------------------------------------------------------------------------

export interface RacerRig {
  root: THREE.Group;
  /** The body rides on this (pitch and roll from the suspension). */
  body: THREE.Group;
  wheels: { pivot: THREE.Group; spin: THREE.Group; front: boolean }[];
  head: THREE.MeshStandardMaterial;
  tail: THREE.MeshStandardMaterial;
  reverse: THREE.MeshStandardMaterial;
  paint: THREE.MeshPhysicalMaterial;
  /** Wheel rotation angle so far. */
  roll: number;
  /** Suspension state: pitch/roll angles and their velocities. */
  pitch: number;
  pitchV: number;
  lean: number;
  leanV: number;
}

let racerShared: { geo: CarGeometry; mats: ReturnType<typeof carMaterials>; tyre: THREE.BufferGeometry; rim: THREE.BufferGeometry } | null = null;

export const buildRacer = (color: number, plate: string): RacerRig => {
  if (!racerShared) {
    racerShared = { geo: carGeometry(0, false), mats: carMaterials(), tyre: tyreGeometry(STYLES[0].wheelR), rim: rimGeometry(STYLES[0].wheelR) };
  }
  const { geo, mats, tyre, rim } = racerShared;
  const s = STYLES[0];
  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body);
  const paint = paintMaterial(color);
  const head = new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xeaf4ff, emissiveIntensity: 1.6 });
  const tail = new THREE.MeshStandardMaterial({ color: 0x4a0406, emissive: 0xff0000, emissiveIntensity: 1.3 });
  const reverse = new THREE.MeshStandardMaterial({ color: 0xdddddd, emissive: 0xffffff, emissiveIntensity: 0 });
  const plateMat = new THREE.MeshStandardMaterial({ map: plateTexture(plate), roughness: 0.5 });
  const add = (g: THREE.BufferGeometry | null, m: THREE.Material) => {
    if (!g) return;
    const mesh = new THREE.Mesh(g, m);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    body.add(mesh);
  };
  add(geo.paint, paint);
  add(geo.glass, mats.glass);
  add(geo.trim, mats.trim);
  add(geo.chrome, mats.chrome);
  add(geo.head, head);
  add(geo.tail, tail);
  // Plates: map the texture onto the outward faces with their own little planes.
  for (const [z, y, ry] of [
    [s.length / 2 + profile(0).shear(s.length / 2, s.plateY[0]) + 0.006, s.plateY[0], 0],
    [-s.length / 2 + profile(0).shear(-s.length / 2, s.plateY[1]) - 0.006, s.plateY[1], Math.PI],
  ]) {
    const p = new THREE.Mesh(new THREE.PlaneGeometry(0.52, 0.12), plateMat);
    p.position.set(0, y, z);
    p.rotation.y = ry;
    body.add(p);
  }
  // Reversing lamps: two small white squares low on the tail.
  for (const sx of [-1, 1]) {
    const r = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.05, 0.02), reverse);
    r.position.set(sx * 0.42, s.reverseY, -s.length / 2 + profile(0).shear(-s.length / 2, s.reverseY) - 0.004);
    body.add(r);
  }

  const wheels: RacerRig['wheels'] = [];
  const hw = s.width / 2;
  for (const [wx, wz, front] of [
    [wheelX(s), s.front, true],
    [-wheelX(s), s.front, true],
    [wheelX(s), s.rear, false],
    [-wheelX(s), s.rear, false],
  ] as [number, number, boolean][]) {
    const pivot = new THREE.Group();
    pivot.position.set(wx, s.wheelR, wz);
    const spin = new THREE.Group();
    pivot.add(spin);
    const t = new THREE.Mesh(tyre, mats.tyre);
    t.castShadow = true;
    spin.add(t);
    const r = new THREE.Mesh(rim, mats.rim);
    if (wx < 0) r.rotation.y = Math.PI;
    spin.add(r);
    root.add(pivot);
    wheels.push({ pivot, spin, front });
  }
  return { root, body, wheels, head, tail, reverse, paint, roll: 0, pitch: 0, pitchV: 0, lean: 0, leanV: 0 };
};

// ---------------------------------------------------------------------------
// Parked cars: one InstancedMesh per material per body style.
// ---------------------------------------------------------------------------

export interface ParkedSpot {
  x: number;
  z: number;
  h: number;
  style: number;
  color: number;
}

export const buildParked = (spots: ParkedSpot[]) => {
  const group = new THREE.Group();
  const mats = carMaterials();
  const paint = new THREE.MeshPhysicalMaterial({ color: 0xdddddd, metalness: 0.3, roughness: 0.38, clearcoat: 1, clearcoatRoughness: 0.08, envMapIntensity: 0.4 });
  const head = new THREE.MeshStandardMaterial({ color: 0xc9ced6, emissive: 0x000000, roughness: 0.2, metalness: 0.4 });
  const tail = new THREE.MeshStandardMaterial({ color: 0x8a0d10, emissive: 0x2a0000, roughness: 0.3 });
  const byMat: Record<PartKind, THREE.Material> = { paint, head, tail, ...mats };
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const up = new THREE.Vector3(0, 1, 0);
  const one = new THREE.Vector3(1, 1, 1);
  const color = new THREE.Color();
  for (let style = 0; style < STYLES.length; style++) {
    const mine = spots.filter((s) => s.style === style);
    if (!mine.length) continue;
    const geo = carGeometry(style, true);
    for (const kind of Object.keys(geo) as PartKind[]) {
      const g = geo[kind];
      if (!g) continue;
      const inst = new THREE.InstancedMesh(g, byMat[kind], mine.length);
      inst.castShadow = kind !== 'chrome' && kind !== 'plate';
      inst.receiveShadow = true;
      mine.forEach((s, i) => {
        q.setFromAxisAngle(up, s.h);
        m.compose(new THREE.Vector3(s.x, 0, s.z), q, one);
        inst.setMatrixAt(i, m);
        if (kind === 'paint') inst.setColorAt(i, color.setHex(s.color));
      });
      group.add(inst);
    }
  }
  return group;
};
