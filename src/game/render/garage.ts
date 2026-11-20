/**
 * The multi-storey car park: four decks of concrete (P-1 underground, P0 ground, P1, P2 the open
 * roof), their columns, walls and parapets, ceilings with strip lights, the painted level colours
 * and numbers, signs hung over the aisles, the three ramps, the height bar and the free-spaces
 * board at the entrance. Everything comes from `lot.garage`, the same description the rules use.
 *
 * One group per deck, each merged by material (a handful of draw calls), so the game can hide the
 * decks you cannot see and keep the frame rate.
 */
import * as THREE from 'three';

import { LEVELS, LEVEL_COLOR, LEVEL_H, SLAB, deckShown, deckUnder, levelName, levelY, rampY } from '../sim/levels';
import { COLUMN_HALF, rng } from '../sim/lot';

import { makeBoard } from './board';
import { block, canvasTexture, flat, merge, scaleUV } from './geo';

import type { Board, BoardRow } from './board';
import type { Garage, GarageLevel, Lot, Plaque, Rect } from '../sim/lot';
import type { Ramp } from '../sim/levels';

export interface GarageView {
  group: THREE.Group;
  /** One group per deck (the ramp that starts on a deck belongs to it). Parked cars are added here. */
  decks: Map<number, THREE.Group>;
  /** Shows the decks within one of `level` (null: you are outside, everything is shown). */
  showAround: (level: number | null, hideAbove?: boolean) => void;
  /** Is the floor under (x, y, z) drawn? Whatever stands on a hidden deck (shoppers, cars) is hidden with it. */
  floorShown: (x: number, y: number, z: number) => boolean;
  /** The board over the way in. */
  setBoard: (rows: BoardRow[]) => void;
  /** Material list, so the game can tune how much sky light the interior picks up. */
  materials: THREE.MeshStandardMaterial[];
}

const hex = (c: number) => '#' + c.toString(16).padStart(6, '0');

const concreteTex = (seed: number, base: [number, number, number], grain = 14, repeat = 1) =>
  canvasTexture(
    256,
    256,
    (g) => {
      const r = rng(seed);
      const img = g.createImageData(256, 256);
      for (let i = 0; i < 256 * 256; i++) {
        const n = (r() - 0.5) * grain + (r() < 0.015 ? -18 : 0);
        img.data[i * 4] = base[0] + n;
        img.data[i * 4 + 1] = base[1] + n;
        img.data[i * 4 + 2] = base[2] + n;
        img.data[i * 4 + 3] = 255;
      }
      g.putImageData(img, 0, 0);
      // Form-work joints and tie holes.
      g.strokeStyle = 'rgba(40,40,44,0.28)';
      g.lineWidth = 2;
      g.strokeRect(0, 0, 256, 256);
      g.fillStyle = 'rgba(40,40,44,0.35)';
      for (const x of [64, 192]) for (const y of [64, 192]) g.fillRect(x - 2, y - 2, 4, 4);
      // Oil stains on the floor texture only (the darker one).
      if (base[0] < 100) {
        g.globalAlpha = 0.16;
        g.fillStyle = '#141416';
        for (let i = 0; i < 4; i++) {
          g.beginPath();
          g.ellipse(r() * 256, r() * 256, 10 + r() * 24, 7 + r() * 14, r() * 3, 0, Math.PI * 2);
          g.fill();
        }
      }
    },
    repeat,
  );

/** The tile atlas for hanging signs: 4 x 2 tiles of 256 x 128. */
const PLAQUE_TILES = ['up', 'down', 'exit', 'height', 'level-1', 'level0', 'level1', 'level2'] as const;
const plaqueAtlas = () =>
  canvasTexture(1024, 256, (g) => {
    const T = [256, 128] as const;
    PLAQUE_TILES.forEach((kind, i) => {
      const x = (i % 4) * T[0];
      const y = Math.floor(i / 4) * T[1];
      g.save();
      g.translate(x, y);
      const plate = (fill: string) => {
        g.fillStyle = '#e8eaec';
        g.fillRect(0, 0, T[0], T[1]);
        g.fillStyle = fill;
        g.beginPath();
        g.roundRect(6, 6, T[0] - 12, T[1] - 12, 14);
        g.fill();
      };
      const text = (t: string, size: number, color: string, cx = T[0] / 2, cy = T[1] / 2) => {
        g.fillStyle = color;
        g.font = `bold ${size}px "Arial Narrow", Arial, sans-serif`;
        g.textAlign = 'center';
        g.textBaseline = 'middle';
        g.fillText(t, cx, cy);
      };
      const arrow = (dir: 1 | -1, color: string) => {
        g.fillStyle = color;
        const cy = T[1] / 2;
        g.beginPath();
        g.moveTo(54, cy + dir * 26);
        g.lineTo(54 + 38, cy - dir * 18);
        g.lineTo(54 + 76, cy + dir * 26);
        g.lineTo(54 + 54, cy + dir * 26);
        g.lineTo(54 + 54, cy + dir * 48);
        g.lineTo(54 + 22, cy + dir * 48);
        g.lineTo(54 + 22, cy + dir * 26);
        g.closePath();
        g.fill();
      };
      if (kind === 'up') {
        plate('#1f5fb0');
        arrow(1, '#fff');
        text('UP', 70, '#fff', 168);
      } else if (kind === 'down') {
        plate('#1f5fb0');
        arrow(-1, '#fff');
        text('DOWN', 56, '#fff', 172);
      } else if (kind === 'exit') {
        plate('#1f9d55');
        text('EXIT', 80, '#fff');
      } else if (kind === 'height') {
        plate('#f2c230');
        text('MAX 2.1 m', 62, '#15161a');
      } else {
        const lvl = Number(kind.replace('level', ''));
        plate(hex(LEVEL_COLOR[lvl]));
        text(levelName(lvl), 96, lvl === 2 ? '#15161a' : '#fff');
      }
      g.restore();
    });
  });

/** A quad (two triangles) from four corners, counter-clockwise seen from where the normal points. */
const quad = (a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3, d: THREE.Vector3, uv: [number, number] = [1, 1]) => {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute([a, b, c, a, c, d].flatMap((v) => [v.x, v.y, v.z]), 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, uv[0], 0, uv[0], uv[1], 0, 0, uv[0], uv[1], 0, uv[1]], 2));
  g.computeVertexNormals();
  return g;
};

/** A painted arrow lying on the floor, pointing along (ux, uz). */
const arrowOn = (x: number, z: number, ux: number, uz: number, y: number) => {
  const shape = new THREE.Shape();
  shape.moveTo(-0.22, -1.6);
  shape.lineTo(0.22, -1.6);
  shape.lineTo(0.22, 0.4);
  shape.lineTo(0.6, 0.4);
  shape.lineTo(0, 1.5);
  shape.lineTo(-0.6, 0.4);
  shape.lineTo(-0.22, 0.4);
  shape.closePath();
  const g = new THREE.ShapeGeometry(shape);
  g.rotateX(-Math.PI / 2);
  // After that the arrow points to -z (heading pi); turn it to the lane's heading.
  g.rotateY(Math.atan2(ux, uz) - Math.PI);
  g.translate(x, y, z);
  return g;
};

/** A long thin box lying along a sloped line from (x0, y0) to (x1, y1) at depth z, `h` tall and `t` thick. */
const slopedBox = (x0: number, y0: number, x1: number, y1: number, z: number, h: number, t: number) => {
  const len = Math.hypot(x1 - x0, y1 - y0);
  const g = new THREE.BoxGeometry(len, h, t);
  g.rotateZ(Math.atan2(y1 - y0, x1 - x0));
  g.translate((x0 + x1) / 2, (y0 + y1) / 2 + h / 2, z);
  return g;
};

export const buildGarage = (lot: Lot): GarageView => {
  const gar: Garage = lot.garage;
  const group = new THREE.Group();
  const decks = new Map<number, THREE.Group>();
  const materials: THREE.MeshStandardMaterial[] = [];
  const std = (p: THREE.MeshStandardMaterialParameters) => {
    const m = new THREE.MeshStandardMaterial(p);
    materials.push(m);
    return m;
  };

  const floorTex = concreteTex(61, [74, 74, 78], 16, 1);
  const wallTex = concreteTex(62, [158, 155, 148], 12, 1);
  const ceilTex = concreteTex(63, [196, 194, 188], 8, 1);
  const rampTex = concreteTex(64, [54, 54, 58], 18, 1);
  const floorMat = std({ map: floorTex, roughness: 0.92 });
  const wallMat = std({ map: wallTex, roughness: 0.95 });
  const ceilMat = std({ map: ceilTex, roughness: 0.95 });
  const rampMat = std({ map: rampTex, roughness: 0.9 });
  const steelMat = std({ color: 0x8c929a, roughness: 0.4, metalness: 0.75 });
  const paintMat = std({ color: 0xffffff, roughness: 0.65, polygonOffset: true, polygonOffsetFactor: -2 });
  const yellowMat = std({ color: 0xf5c71a, roughness: 0.65, polygonOffset: true, polygonOffsetFactor: -2 });
  const lightMat = new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xfff4dc, emissiveIntensity: 0.9 });
  const levelMat = (lvl: number) => std({ color: LEVEL_COLOR[lvl], roughness: 0.7 });
  const bandMats = new Map<number, THREE.MeshStandardMaterial>(LEVELS.map((l) => [l, levelMat(l)]));
  const paintLevelMats = new Map<number, THREE.MeshStandardMaterial>(LEVELS.map((l) => [l, std({ color: LEVEL_COLOR[l], roughness: 0.65, polygonOffset: true, polygonOffsetFactor: -2 })]));
  const atlas = plaqueAtlas();
  const plaqueMat = new THREE.MeshStandardMaterial({ map: atlas, roughness: 0.5, emissive: 0xffffff, emissiveMap: atlas, emissiveIntensity: 0.35 });

  const add = (parent: THREE.Object3D, geos: THREE.BufferGeometry[], mat: THREE.Material, shadow: 'both' | 'receive' | 'none' = 'both') => {
    if (!geos.length) return;
    const m = new THREE.Mesh(merge(geos), mat);
    m.castShadow = shadow === 'both';
    m.receiveShadow = shadow !== 'none';
    parent.add(m);
  };

  const rampsFrom = (lvl: number) => gar.ramps.filter((r) => r.lo === lvl);

  for (const lv of gar.levels) {
    const Y = levelY(lv.lvl);
    const dk = new THREE.Group();
    decks.set(lv.lvl, dk);
    group.add(dk);
    const slab: THREE.BufferGeometry[] = [];
    const top: THREE.BufferGeometry[] = [];
    const under: THREE.BufferGeometry[] = [];
    for (const f of lv.floors) {
      const w = f.x1 - f.x0;
      const d = f.z1 - f.z0;
      const cx = (f.x0 + f.x1) / 2;
      const cz = (f.z0 + f.z1) / 2;
      slab.push(block(w, SLAB, d, cx, Y - SLAB, cz));
      top.push(scaleUV(flat(w, d, cx, cz, 0, Y + 0.004), w / 9, d / 9));
      const u = new THREE.PlaneGeometry(w, d);
      u.rotateX(Math.PI / 2); // faces down: the ceiling of the deck below
      u.translate(cx, Y - SLAB - 0.004, cz);
      under.push(scaleUV(u, w / 9, d / 9));
    }
    add(dk, slab, wallMat);
    add(dk, top, floorMat, 'receive');
    add(dk, under, ceilMat, 'receive');

    // Walls and parapets, with the deck's colour painted along them.
    const walls: THREE.BufferGeometry[] = [];
    const bands: THREE.BufferGeometry[] = [];
    const rails: THREE.BufferGeometry[] = [];
    for (const w of lv.walls) {
      const sx = w.x1 - w.x0;
      const sz = w.z1 - w.z0;
      const cx = (w.x0 + w.x1) / 2;
      const cz = (w.z0 + w.z1) / 2;
      walls.push(scaleUV(block(sx, w.h, sz, cx, Y, cz), Math.max(sx, sz) / 4, 1));
      const bh = w.h > 2 ? 0.5 : 0.35;
      bands.push(block(sx + 0.03, bh, sz + 0.03, cx, Y + (w.h > 2 ? 0.9 : 0.55), cz));
      if (w.h < 2) {
        // The crash barrier on a deck's edge: a rail above the parapet on posts.
        const along = sx >= sz ? 'x' : 'z';
        const len = along === 'x' ? sx : sz;
        const topY = Y + w.h;
        rails.push(along === 'x' ? block(len, 0.07, 0.07, cx, topY + 0.38, cz) : block(0.07, 0.07, len, cx, topY + 0.38, cz));
        rails.push(along === 'x' ? block(len, 0.07, 0.07, cx, topY + 0.12, cz) : block(0.07, 0.07, len, cx, topY + 0.12, cz));
        for (let t = 0.2; t < len; t += 2.6) rails.push(along === 'x' ? block(0.08, 0.5, 0.08, w.x0 + t, topY, cz) : block(0.08, 0.5, 0.08, cx, topY, w.z0 + t));
      }
    }
    add(dk, walls, wallMat);
    add(dk, bands, bandMats.get(lv.lvl)!, 'both');
    add(dk, rails, steelMat);

    // Columns on the bay rows, painted with the deck's colour at the foot, and the edge columns of the open decks.
    const cols: THREE.BufferGeometry[] = [];
    const colBand: THREE.BufferGeometry[] = [];
    const H = LEVEL_H - SLAB;
    for (const c of lv.columns) {
      cols.push(block(0.56, H, 0.56, c.x, Y, c.z));
      // The painted bands are the widest part: the sim's column collider is their square.
      const b = 2 * COLUMN_HALF;
      colBand.push(block(b, 1.1, b, c.x, Y + 0.25, c.z), block(b, 0.3, b, c.x, Y + 2.25, c.z));
    }
    if (lv.lvl >= 1 && lv.roofed) {
      // Open deck under a roof: a column every 8 m along the long edges holds the slab above.
      const south = gar.z0 + 0.2;
      const north = gar.z1 - 0.2;
      for (let x = gar.x0 + 8; x < 104; x += 8.1) for (const z of [south, north]) cols.push(block(0.5, H, 0.5, x, Y, z));
    }
    add(dk, cols, wallMat);
    add(dk, colBand, bandMats.get(lv.lvl)!);

    // Light strips under the ceiling along the aisles (where a ceiling exists), and the way in.
    const strips: THREE.BufferGeometry[] = [];
    if (lv.roofed) {
      for (const l of gar.lightLines.filter((l) => l.lvl === lv.lvl)) for (let x = l.x0 + 2; x < l.x1; x += 5.4) for (const dz of [-1.6, 1.6]) strips.push(block(0.8, 0.02, 0.07, x, Y + H - 0.025, l.z + dz));
      // Over the connectors too.
      for (const z of [-8, 0, 8]) strips.push(block(0.07, 0.02, 0.8, gar.x0 + 4.5, Y + H - 0.025, z + (gar.z0 + gar.z1) / 2 + 0.0));
    }
    if (strips.length) {
      const m = new THREE.Mesh(merge(strips), lightMat);
      dk.add(m);
    }

    // Paint: bay stripes, aisle centre lines, and the big deck number on the floor of the west connector.
    const lines: THREE.BufferGeometry[] = [];
    for (const s of lot.stripes) {
      if (s.lvl !== lv.lvl) continue;
      const len = Math.hypot(s.b.x - s.a.x, s.b.z - s.a.z);
      lines.push(flat(0.12, len, (s.a.x + s.b.x) / 2, (s.a.z + s.b.z) / 2, Math.atan2(s.b.x - s.a.x, s.b.z - s.a.z), Y + 0.012));
    }
    const dashes: THREE.BufferGeometry[] = [];
    const arrows: THREE.BufferGeometry[] = [];
    for (const e of lot.graph.edges) {
      const a = lot.aisles[e.aisle];
      if (!a.garage || a.kind === 'ramp' || e.dir !== 1) continue;
      if (Math.round(e.yA / LEVEL_H) !== lv.lvl || Math.round(e.yB / LEVEL_H) !== lv.lvl) continue;
      if (a.oneWay) {
        // The ring is one-way: arrows along the middle of the aisle.
        for (let t = 4; t < e.len - 3; t += 9) arrows.push(arrowOn(e.a.x + e.ux * t, e.a.z + e.uz * t, e.ux, e.uz, Y + 0.013));
        continue;
      }
      const cxs = e.a.x + e.uz * 2;
      const czs = e.a.z - e.ux * 2;
      for (let t = 1.5; t < e.len - 1.5; t += 5) dashes.push(flat(0.14, 2.6, cxs + e.ux * t, czs + e.uz * t, Math.atan2(e.ux, e.uz), Y + 0.012));
    }
    add(dk, lines, paintMat, 'receive');
    add(dk, dashes, yellowMat, 'receive');
    add(dk, arrows, paintMat, 'receive');
    const bigNumber = new THREE.Mesh(
      new THREE.PlaneGeometry(6.4, 3.2),
      new THREE.MeshStandardMaterial({
        map: canvasTexture(512, 256, (g) => {
          g.clearRect(0, 0, 512, 256);
          g.fillStyle = hex(LEVEL_COLOR[lv.lvl]);
          g.font = 'bold 220px "Arial Narrow", Arial, sans-serif';
          g.textAlign = 'center';
          g.textBaseline = 'middle';
          g.fillText(levelName(lv.lvl), 256, 138);
        }),
        transparent: true,
        roughness: 0.7,
        polygonOffset: true,
        polygonOffsetFactor: -3,
      }),
    );
    bigNumber.rotation.set(-Math.PI / 2, 0, -Math.PI / 2);
    bigNumber.position.set(gar.x0 + 4.5, Y + 0.014, (gar.z0 + gar.z1) / 2 - 0.5);
    bigNumber.receiveShadow = true;
    dk.add(bigNumber);

    // Ramps that start on this deck.
    for (const r of rampsFrom(lv.lvl)) addRamp(dk, r);
  }

  /** A sloped road: the surface, its underside, a parapet either side, and the dashed centre line. */
  function addRamp(parent: THREE.Object3D, r: Ramp) {
    const yA = rampY(r, r.x0);
    const yB = rampY(r, r.x1);
    const v = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
    const t = SLAB;
    const topSurface = quad(v(r.x0, yA + 0.004, r.z0), v(r.x0, yA + 0.004, r.z1), v(r.x1, yB + 0.004, r.z1), v(r.x1, yB + 0.004, r.z0), [r.z1 - r.z0, r.x1 - r.x0]);
    const m1 = new THREE.Mesh(scaleUV(topSurface, 0.12, 0.12), rampMat);
    m1.receiveShadow = true;
    parent.add(m1);
    const under = quad(v(r.x0, yA - t, r.z1), v(r.x0, yA - t, r.z0), v(r.x1, yB - t, r.z0), v(r.x1, yB - t, r.z1));
    const m2 = new THREE.Mesh(scaleUV(under, 0.1, 0.1), ceilMat);
    m2.receiveShadow = true;
    parent.add(m2);
    // Side walls of the ramp: the parapet (1.1 m) with the colour of the deck it climbs to.
    const parapets: THREE.BufferGeometry[] = [];
    const caps: THREE.BufferGeometry[] = [];
    for (const z of [r.z0 - 0.2, r.z1 + 0.2]) {
      parapets.push(slopedBox(r.x0, yA - t, r.x1, yB - t, z, 1.1 + t, 0.4));
      caps.push(slopedBox(r.x0, yA + 0.5, r.x1, yB + 0.5, z, 0.3, 0.43));
    }
    add(parent, parapets, wallMat);
    add(parent, caps, bandMats.get(r.hi)!);
    // Dashed centre line along the slope, and arrows on the lanes.
    const dashes: THREE.BufferGeometry[] = [];
    const zc = (r.z0 + r.z1) / 2;
    const len = r.x1 - r.x0;
    for (let s = 1; s < len - 3; s += 5) {
      const xa = r.x0 + s;
      const xb = r.x0 + s + 2.6;
      dashes.push(quad(v(xa, rampY(r, xa) + 0.02, zc - 0.07), v(xa, rampY(r, xa) + 0.02, zc + 0.07), v(xb, rampY(r, xb) + 0.02, zc + 0.07), v(xb, rampY(r, xb) + 0.02, zc - 0.07)));
    }
    add(parent, dashes, yellowMat, 'receive');
    // The end of each ramp is marked with a band of the colour of the deck it leads to.
    for (const [x, lvl] of [[r.rise > 0 ? r.x1 - 0.35 : r.x0 + 0.35, r.hi], [r.rise > 0 ? r.x0 + 0.35 : r.x1 - 0.35, r.lo]] as const) {
      const g = quad(v(x - 0.3, rampY(r, x - 0.3) + 0.018, r.z0), v(x - 0.3, rampY(r, x - 0.3) + 0.018, r.z1), v(x + 0.3, rampY(r, x + 0.3) + 0.018, r.z1), v(x + 0.3, rampY(r, x + 0.3) + 0.018, r.z0));
      const lm = new THREE.Mesh(g, paintLevelMats.get(lvl)!);
      lm.receiveShadow = true;
      parent.add(lm);
    }
  }

  // --- Wall plates: small, fixed to the outer walls above the bays (nothing hangs over an aisle) -----
  const tileOf = (p: Plaque) => PLAQUE_TILES.indexOf(p.kind === 'level' ? (`level${p.lvl}` as (typeof PLAQUE_TILES)[number]) : p.kind);
  for (const [lvl, dk] of decks) {
    const plates: THREE.BufferGeometry[] = [];
    for (const p of gar.plaques.filter((q) => q.lvl === lvl)) {
      const i = tileOf(p);
      const g = new THREE.PlaneGeometry(1.6, 0.8);
      const u0 = (i % 4) / 4;
      const v0 = 1 - (Math.floor(i / 4) + 1) / 2;
      const uv = g.attributes.uv;
      for (let k = 0; k < uv.count; k++) uv.setXY(k, u0 + uv.getX(k) / 4, v0 + uv.getY(k) / 2);
      g.rotateY(p.h);
      g.translate(p.x, p.y, p.z);
      plates.push(g);
    }
    if (plates.length) dk.add(new THREE.Mesh(merge(plates), plaqueMat));
  }

  // --- Painted wayfinding: UP, DOWN and EXIT on the floor, where a driver looks anyway -----------------
  const floorWords = new Map<string, THREE.MeshStandardMaterial>();
  const floorWord = (dk: THREE.Group, text: string, color: string, x: number, y: number, z: number, travel: number, w: number) => {
    let mat = floorWords.get(text + color);
    if (!mat) {
      mat = new THREE.MeshStandardMaterial({
        map: canvasTexture(512, 192, (g) => {
          g.clearRect(0, 0, 512, 192);
          g.fillStyle = color;
          g.font = 'bold 150px "Arial Narrow", Arial, sans-serif';
          g.textAlign = 'center';
          g.textBaseline = 'middle';
          g.fillText(text, 256, 100);
        }),
        transparent: true,
        roughness: 0.7,
        polygonOffset: true,
        polygonOffsetFactor: -3,
      });
      floorWords.set(text + color, mat);
    }
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, w * 0.375), mat);
    // Lying flat, the top of the lettering towards where the driver is heading (`travel`, a heading like a car's).
    m.rotation.order = 'YXZ';
    m.rotation.set(-Math.PI / 2, travel + Math.PI, 0);
    m.position.set(x, y, z);
    m.receiveShadow = true;
    dk.add(m);
  };
  for (const [lvl, dk] of decks) {
    const Y = levelY(lvl) + 0.016;
    const [z1, z2] = gar.aisleZ;
    const east = Math.PI / 2;
    // The way up: on the north aisle, just before the cross connector where the ramp carries straight on.
    if (lvl < 2) floorWord(dk, 'UP', '#f5c71a', gar.rows[1] - 1.5, Y, z2, east, 3.4);
    // The way down: on the cross connector heading south, before the turn onto the south aisle where the ramp starts.
    if (lvl > -1) floorWord(dk, 'DOWN', '#f5c71a', gar.rows[1] + 4, Y, (z1 + z2) / 2 + 2, Math.PI, 3.8);
    // The way out, on the ground floor: on the west connector, before the opening in the wall.
    if (lvl === 0) floorWord(dk, 'EXIT', '#43d17a', gar.x0 + 11, Y, z2 + 0.2, -east, 3.2);
  }

  // --- The board on the wall beside the way in --------------------------------------------------
  const board: Board = makeBoard(3.2, 0.8);
  board.mesh.position.set(gar.x0 - 0.02, 2.1, gar.entrance.z + 6.5);
  board.mesh.rotation.y = -Math.PI / 2;
  decks.get(0)!.add(board.mesh);

  // Hide decks you cannot see: from inside, only the deck you are on and the ones next to it are drawn.
  const showAround = (level: number | null, hideAbove = false) => {
    for (const [l, g] of decks) g.visible = deckShown(l, level, hideAbove);
  };

  /** Is the floor under (x, y, z) drawn: the ground outside the car park, or a deck that is not hidden? */
  const floorShown = (x: number, y: number, z: number) => {
    const d = deckUnder(gar, x, z, y);
    return d === null || decks.get(d)?.visible !== false;
  };

  return { group, decks, showAround, floorShown, setBoard: board.set, materials };
};

export type { GarageLevel, Rect };
