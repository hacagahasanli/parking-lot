/**
 * The lot drawn flat from above, for the campaign's map screen: the same layers as the minimap (tarmac, roads at their real
 * width, bay lines, islands, the carport, shop fronts, a deck's walls and columns), drawn into any rectangle of a canvas, north
 * up or turned a quarter for a tall screen. Pure 2D canvas: no three.js, so the map costs nothing on the GPU.
 */
import { LEVEL_COLOR } from '../sim/levels';

import type { Lot } from '../sim/lot';

export interface MapRect {
  x0: number;
  x1: number;
  z0: number;
  z1: number;
}

/** Where a panel draws on the canvas (pixels). */
export interface Screen {
  x: number;
  y: number;
  w: number;
  h: number;
}

/**
 * Metres to pixels for a view drawn into a screen rectangle. North at the top with x flipped (as the minimap: it matches the
 * view from the entrance), or turned a quarter clockwise (`turn`) so a wide lot fills a tall phone.
 */
export const mapProjection = (view: MapRect, s: Screen, turn: boolean, pad = 8) => {
  const vw = view.x1 - view.x0;
  const vd = view.z1 - view.z0;
  const sc = turn ? Math.min((s.w - pad * 2) / vd, (s.h - pad * 2) / vw) : Math.min((s.w - pad * 2) / vw, (s.h - pad * 2) / vd);
  const cx = (view.x0 + view.x1) / 2;
  const cz = (view.z0 + view.z1) / 2;
  const ox = s.x + s.w / 2;
  const oy = s.y + s.h / 2;
  const at = (x: number, z: number) => (turn ? { x: ox + (z - cz) * sc, y: oy - (x - cx) * sc } : { x: ox - (x - cx) * sc, y: oy - (z - cz) * sc });
  // The same as a canvas transform (px = a x + c z + e, py = b x + d z + f), so shapes can be drawn in metres.
  const matrix: [number, number, number, number, number, number] = turn ? [0, -sc, sc, 0, ox - cz * sc, oy + cx * sc] : [-sc, 0, 0, -sc, ox + cx * sc, oy + cz * sc];
  return { sc, at, matrix };
};

const hex = (c: number) => '#' + c.toString(16).padStart(6, '0');

/** Draws one deck (0 also draws the open lot) of `view` into the screen rectangle `s`. */
export const drawLotMap = (g: CanvasRenderingContext2D, lot: Lot, view: MapRect, s: Screen, turn: boolean, deck: number, opts: { lot?: boolean; pad?: number } = {}) => {
  const { sc, matrix } = mapProjection(view, s, turn, opts.pad);
  const showLot = deck === 0 && opts.lot !== false;
  g.save();
  g.beginPath();
  g.rect(s.x, s.y, s.w, s.h);
  g.clip();
  g.setTransform(...matrix);
  const px = 1 / sc;
  const rect = (x0: number, x1: number, z0: number, z1: number) => g.fillRect(x0, z0, x1 - x0, z1 - z0);
  const b = lot.bounds;
  if (showLot) {
    g.fillStyle = '#2f6b33';
    rect(view.x0 - 40, view.x1 + 40, view.z0 - 40, view.z1 + 40);
    g.fillStyle = '#343844';
    rect(b.x0, b.x1, b.z0, b.z1);
  }
  const gar = lot.garage;
  const lvl = gar.levels.find((l) => l.lvl === deck);
  if (lvl) {
    g.fillStyle = deck === 0 ? '#424654' : '#363c4e';
    for (const f of lvl.floors) rect(f.x0, f.x1, f.z0, f.z1);
  }
  g.lineCap = 'butt';
  for (const a of lot.aisles) {
    const levels = a.nodes.map((n) => lot.graph.nodes[n].lvl);
    const here = a.garage ? levels.includes(deck) : showLot;
    if (!here) continue;
    g.strokeStyle = a.kind === 'ramp' ? hex(LEVEL_COLOR[deck]) : a.kind === 'aisle' ? '#626a7a' : '#808a9c';
    g.globalAlpha = a.kind === 'ramp' ? 0.8 : 1;
    g.lineWidth = a.width;
    g.beginPath();
    a.nodes.forEach((id, i) => {
      const n = lot.graph.nodes[id];
      if (i === 0) g.moveTo(n.x, n.z);
      else g.lineTo(n.x, n.z);
    });
    g.stroke();
    g.globalAlpha = 1;
  }
  g.strokeStyle = 'rgba(255,255,255,0.45)';
  g.lineWidth = Math.max(0.12, px);
  g.beginPath();
  for (const st of lot.stripes) {
    if ((st.lvl ?? 0) !== deck || (!showLot && !st.lvl && deck === 0 && !(st.a.x > gar.x0))) continue;
    g.moveTo(st.a.x, st.a.z);
    g.lineTo(st.b.x, st.b.z);
  }
  g.stroke();
  if (showLot) {
    for (const isl of lot.islands) {
      g.fillStyle = isl.kind === 'lawn' || isl.kind === 'planter' || isl.kind === 'hedge' ? '#3f9a40' : isl.kind === 'chargers' ? '#28c878' : '#beb8aa';
      rect(isl.x0, isl.x1, isl.z0, isl.z1);
    }
    for (const c of lot.canopies) {
      g.fillStyle = 'rgba(70,110,230,0.55)';
      rect(c.x0, c.x1, c.z0, c.z1);
    }
    for (const shop of lot.shops) {
      g.fillStyle = shop === lot.shops[0] ? '#eeb862' : '#de643e';
      rect(shop.x0, shop.x1, b.z1, b.z1 + 5);
    }
    g.fillStyle = '#ffd23f';
    for (const gate of lot.gates) rect(Math.min(gate.px, gate.tx), Math.max(gate.px, gate.tx), gate.z - 0.4, gate.z + 0.4);
  }
  if (lvl) {
    g.fillStyle = 'rgba(200,204,214,0.95)';
    for (const w of lvl.walls) rect(w.x0, w.x1, w.z0, w.z1);
    for (const c of lvl.columns) rect(c.x - 0.45, c.x + 0.45, c.z - 0.45, c.z + 0.45);
  }
  g.restore();
};
