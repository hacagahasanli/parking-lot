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
import { CAP_SCALES, CROWN, END_DOME, HARD_REF, I, STYLES, TYRE_W, clamp, endCap, lerp, profile, stations, wheelX, xAtY } from '../sim/body';
import type { Profile, Style } from '../sim/body';

/** The body styles and their curves live in sim/body.ts (no three.js there), shared with the colliders. */
export { STYLES };

export type PartKind = 'paint' | 'glass' | 'trim' | 'chrome' | 'head' | 'tail' | 'tyre' | 'rim' | 'plate';

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
  for (const [i, nz] of [[0, -1], [zs.length - 1, 1]] as [number, 1 | -1][]) {
    // The cap's points come from sim/body.ts (the collider's outline is taken from them too); the normals are drawn here.
    const cap = endCap(P, zs[i], nz);
    const ring = cap.ring.map(([x, y, z]) => new THREE.Vector3(x, y, z));
    const c = new THREE.Vector3(...cap.c);
    const slope = (ring[nj - 1].z - ring[0].z) / (ring[nj - 1].y - ring[0].y || 1);
    const cn = new THREE.Vector3(0, -nz * slope, nz).normalize();
    const { R2 } = cap;
    const B = END_DOME;
    const scales = CAP_SCALES;
    const base = pos.length / 3;
    const n = ring.length;
    for (const sc of scales) {
      for (const p of cap.ring) {
        const q = cap.dome(p, sc);
        pos.push(q[0], q[1], q[2]);
        const dx = q[0] - c.x;
        const dy = q[1] - c.y;
        const nn = new THREE.Vector3(((2 * B) / R2) * dx, ((2 * B) / R2) * dy, 0).add(cn).normalize();
        nor.push(nn.x, nn.y, nn.z);
      }
    }
    const centre = pos.length / 3;
    pos.push(...cap.top);
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
        const z = lerp(z0, z1, u);
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
  const cap: Pt[] = range(30).map((u) => ({ x: lerp(face.x, -face.x, u), z: face.z + end * 0.01, y: face.y }));
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

/** A tyre as a lathe: round shoulders, a slight sidewall bulge and a brake disc behind the spokes. Axis along x. */
export const tyreGeometry = (r: number) => {
  const w = TYRE_W;
  const pts: THREE.Vector2[] = [new THREE.Vector2(r * 0.7, -w * 0.9)];
  // Sidewall bulging out a touch, a round shoulder into a slightly crowned tread, and back.
  const sh = 0.045;
  pts.push(new THREE.Vector2(r * 0.78, -w * 1.0), new THREE.Vector2(r * 0.88, -w * 1.03));
  const rs = r - sh;
  for (let i = 0; i <= 5; i++) {
    const a = (i / 5) * (Math.PI / 2);
    pts.push(new THREE.Vector2(rs + Math.sin(a) * sh, -w + sh - Math.cos(a) * sh + sh * 0));
  }
  pts.push(new THREE.Vector2(r + 0.002, -w * 0.4), new THREE.Vector2(r + 0.004, 0), new THREE.Vector2(r + 0.002, w * 0.4));
  for (let i = 5; i >= 0; i--) {
    const a = (i / 5) * (Math.PI / 2);
    pts.push(new THREE.Vector2(rs + Math.sin(a) * sh, w - sh + Math.cos(a) * sh));
  }
  pts.push(new THREE.Vector2(r * 0.88, w * 1.03), new THREE.Vector2(r * 0.78, w * 1.0), new THREE.Vector2(r * 0.7, w * 0.9));
  const g = new THREE.LatheGeometry(pts, 48);
  g.rotateZ(Math.PI / 2);
  const parts: THREE.BufferGeometry[] = [g];
  // Brake disc set back inside the rim.
  const disc = new THREE.CylinderGeometry(r * 0.52, r * 0.52, 0.02, 32, 1, false);
  disc.rotateZ(Math.PI / 2);
  disc.translate(0.02, 0, 0);
  parts.push(disc);
  return mergeGeometries(parts.map((q) => q.toNonIndexed().deleteAttribute('uv')))!;
};

/** Alloy rim: lip, dish, ten slim spokes in five pairs and a centre cap, facing +x (flip for the left side). */
export const rimGeometry = (r: number) => {
  const parts: THREE.BufferGeometry[] = [];
  const dish = new THREE.CylinderGeometry(r * 0.7, r * 0.66, 0.16, 40, 1, true);
  dish.rotateZ(Math.PI / 2);
  parts.push(dish);
  const cap = new THREE.CylinderGeometry(r * 0.17, r * 0.19, 0.045, 24);
  cap.rotateZ(Math.PI / 2);
  cap.translate(0.1, 0, 0);
  parts.push(cap);
  const hubRing = new THREE.CylinderGeometry(r * 0.27, r * 0.27, 0.03, 24);
  hubRing.rotateZ(Math.PI / 2);
  hubRing.translate(0.085, 0, 0);
  parts.push(hubRing);
  for (let i = 0; i < 5; i++) {
    for (const off of [-0.17, 0.17]) {
      const spoke = new THREE.BoxGeometry(0.034, r * 0.5, 0.04);
      spoke.translate(0.09 + (off > 0 ? 0.003 : 0), r * 0.45, 0);
      spoke.rotateX((i / 5) * Math.PI * 2 + off);
      parts.push(spoke);
    }
  }
  const lip = new THREE.TorusGeometry(r * 0.69, 0.016, 10, 48);
  lip.rotateY(Math.PI / 2);
  lip.translate(0.09, 0, 0);
  parts.push(lip);
  return mergeGeometries(parts.map((q) => q.toNonIndexed().deleteAttribute('uv')))!;
};

export type CarGeometry = Record<PartKind, THREE.BufferGeometry | null>;

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
    parts.trim.push(flankStrip(P, zs0, zs1, P.bot(0) + 0.06, P.bot(0) + 0.15, sx, 0.008, 10));
    for (const z of s.handles) {
      const y = P.belt(z) - 0.1;
      parts.chrome.push(box(0.02, 0.028, 0.16, sx * (xAtY(P.section(z), y) + 0.008), y, z));
    }
    const mz = s.mirrorZ;
    const my = P.belt(mz) + 0.03;
    // Mirror: a rounded housing on a short stalk, with a dark glass face looking back.
    const housing = new THREE.SphereGeometry(0.5, 18, 12);
    housing.scale(0.085, 0.1, 0.19);
    housing.translate(sx * (hw + 0.075), my, mz - 0.03);
    parts.paint.push(housing);
    const face = new THREE.CircleGeometry(0.04, 14);
    face.scale(1, 1.1, 1);
    face.rotateY(Math.PI);
    face.translate(sx * (hw + 0.075), my, mz - 0.03 - 0.094);
    parts.glass.push(face);
    parts.trim.push(box(0.1, 0.03, 0.05, sx * (hw + 0.02), my - 0.04, mz));
    parts.trim.push(archDisc(P, s.front, sx), archDisc(P, s.rear, sx));
    if (s.rails) {
      const z = (s.ws[1] + s.rw[0]) / 2;
      const len = s.ws[1] - s.rw[0] - 0.3;
      const x = P.section(z)[I.roof][0] - 0.1;
      parts.trim.push(box(0.04, 0.035, len, sx * x, P.top(z) + 0.03, z));
    }
  }

  // A shark-fin antenna on the roof behind the middle, and a thin chrome-free window seal under the glass.
  {
    const z = (s.ws[1] + s.rw[0]) / 2 + (s.rw[0] - s.ws[1]) * 0.12;
    const fin = new THREE.ConeGeometry(0.045, 0.1, 10);
    fin.scale(0.45, 1, 1.9);
    fin.rotateX(-0.25);
    fin.translate(0, P.top(z) + CROWN + 0.04, z);
    parts.trim.push(fin);
  }

  // Front: a full-width LED strip across the nose, lamp housings at the corners, grille below.
  const hf = bumperBand(P, 1, s.headY, 0.022, 0.009, () => true);
  parts.head.push(...hf);
  parts.trim.push(...bumperBand(P, 1, s.headY - 0.005, 0.085, 0.004, (ax) => ax > 0.18));
  parts.head.push(...bumperBand(P, 1, s.headY - 0.055, 0.025, 0.009, (ax) => ax > 0.5 && ax < 0.8, 0.3));
  parts.trim.push(...bumperBand(P, 1, s.grilleY, 0.12, 0.005, (ax) => ax < 0.62, 0.1));
  parts.trim.push(...bumperBand(P, 1, P.bot(half) + 0.06, 0.05, 0.01, () => true, 0.2));
  parts.plate.push(box(0.52, 0.12, 0.02, 0, s.plateY[0], half + P.shear(half, s.plateY[0]) + 0.016));

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
  parts.tail.push(...bumperBand(P, -1, s.tailY - 0.025, 0.075, 0.007, (ax) => ax > 0.5, 0.16));
  parts.trim.push(...bumperBand(P, -1, P.bot(-half) + 0.1, 0.13, 0.012, () => true, 0.2));
  parts.plate.push(box(0.52, 0.12, 0.02, 0, s.plateY[1], -half + P.shear(-half, s.plateY[1]) - 0.016));

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

/**
 * three.js ignores a material's envMapIntensity for `scene.environment`, so car materials pick the
 * scene's environment up on their first render and then honour their own reflection strength.
 */
const ownEnv = <M extends THREE.MeshStandardMaterial>(m: M, k: number): M => {
  m.envMapIntensity = k;
  m.onBeforeRender = (_r, scene) => {
    if (scene.environment && m.envMap !== scene.environment) {
      m.envMap = scene.environment;
      m.needsUpdate = true;
    }
  };
  return m;
};

export const carMaterials = () => ({
  glass: ownEnv(new THREE.MeshPhysicalMaterial({ color: 0x0a1118, metalness: 0.15, roughness: 0.03, clearcoat: 1, clearcoatRoughness: 0.02, ior: 1.52, specularIntensity: 1, }), 1.5),
  trim: ownEnv(new THREE.MeshStandardMaterial({ color: 0x16181b, roughness: 0.5, metalness: 0.1 }), 0.12),
  chrome: ownEnv(new THREE.MeshStandardMaterial({ color: 0xd6dadf, roughness: 0.18, metalness: 1 }), 1),
  tyre: ownEnv(new THREE.MeshStandardMaterial({ color: 0x08090a, roughness: 1 }), 0.12),
  rim: ownEnv(new THREE.MeshStandardMaterial({ color: 0xb9bec6, roughness: 0.28, metalness: 0.9 }), 0.9),
  plate: new THREE.MeshStandardMaterial({ color: 0xf1f1ea, roughness: 0.5 }),
});

/** Deeper, more saturated paint with a real clearcoat: dark base, tight clearcoat highlights. */
const deepen = (color: number, k = 0.5, out = new THREE.Color()) => {
  const c = out.setHex(color);
  const hsl = { h: 0, s: 0, l: 0 };
  c.getHSL(hsl);
  return c.setHSL(hsl.h, Math.min(1, hsl.s * 1.15), hsl.l * k);
};

export const paintMaterial = (color: number) =>
  ownEnv(new THREE.MeshPhysicalMaterial({ color: deepen(color), metalness: 0.6, roughness: 0.32, clearcoat: 0.8, clearcoatRoughness: 0.04 }), 0.45);

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
  const tail = new THREE.MeshStandardMaterial({ color: 0x300204, emissive: 0xe00808, emissiveIntensity: 0.9, roughness: 0.25 });
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
    [s.length / 2 + profile(0).shear(s.length / 2, s.plateY[0]) + 0.018, s.plateY[0], 0],
    [-s.length / 2 + profile(0).shear(-s.length / 2, s.plateY[1]) - 0.018, s.plateY[1], Math.PI],
  ]) {
    const p = new THREE.Mesh(new THREE.PlaneGeometry(0.52, 0.12), plateMat);
    p.position.set(0, y, z);
    p.rotation.y = ry;
    body.add(p);
  }
  // Reversing lamps: two small white squares low on the tail.
  for (const sx of [-1, 1]) {
    const r = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.05, 0.02), reverse);
    r.position.set(sx * 0.42, s.reverseY, -s.length / 2 + profile(0).shear(-s.length / 2, s.reverseY) - 0.014);
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
  const paint = ownEnv(new THREE.MeshPhysicalMaterial({ color: 0xffffff, metalness: 0.6, roughness: 0.32, clearcoat: 0.8, clearcoatRoughness: 0.04 }), 0.45);
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
        if (kind === 'paint') inst.setColorAt(i, deepen(s.color, 0.78, color));
      });
      group.add(inst);
    }
  }
  return group;
};
