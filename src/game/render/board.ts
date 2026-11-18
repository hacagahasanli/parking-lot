/**
 * LED boards: a dark panel of round amber dots, like the "FREE SPACES" signs over a car park
 * entrance. Text is drawn small on an offscreen canvas and re-drawn as dots on the board's texture,
 * so the lettering looks like a real dot-matrix display (and blinks, flickers and scrolls cheaply).
 */
import * as THREE from 'three';

export interface BoardRow {
  text: string;
  /** Dot colour, CSS. */
  color?: string;
  /** Row height in dot rows. */
  size?: number;
}

export interface Board {
  mesh: THREE.Mesh;
  /** Draws the rows (centred). Cheap to call every frame: nothing happens unless the content changed. */
  set: (rows: BoardRow[]) => void;
}

const COLS = 128;
const ROWS = 32;
const PITCH = 6;

/** A board `w` x `h` metres. Faces +z; rotate the mesh to face the traffic. */
export const makeBoard = (w: number, h: number): Board => {
  const canvas = document.createElement('canvas');
  canvas.width = COLS * PITCH;
  canvas.height = ROWS * PITCH;
  const g = canvas.getContext('2d')!;
  const small = document.createElement('canvas');
  small.width = COLS;
  small.height = ROWS;
  const sg = small.getContext('2d', { willReadFrequently: true })!;
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  const mat = new THREE.MeshStandardMaterial({ map: tex, emissiveMap: tex, emissive: 0xffffff, emissiveIntensity: 1.35, roughness: 0.6 });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat);
  let last = '';

  const set = (rows: BoardRow[]) => {
    const key = JSON.stringify(rows);
    if (key === last) return;
    last = key;
    g.fillStyle = '#07090c';
    g.fillRect(0, 0, canvas.width, canvas.height);
    // Unlit dots first: a faint grid, so the panel reads as LEDs even where nothing is lit.
    g.fillStyle = '#17120a';
    for (let y = 0; y < ROWS; y++) for (let x = 0; x < COLS; x++) (g.beginPath(), g.arc(x * PITCH + PITCH / 2, y * PITCH + PITCH / 2, PITCH * 0.33, 0, Math.PI * 2), g.fill());
    const total = rows.reduce((a, r) => a + (r.size ?? 14), 0);
    let top = Math.floor((ROWS - total) / 2);
    for (const row of rows) {
      const size = row.size ?? 14;
      sg.clearRect(0, 0, COLS, ROWS);
      sg.fillStyle = '#fff';
      sg.font = `bold ${size}px "Arial Narrow", Arial, sans-serif`;
      sg.textAlign = 'center';
      sg.textBaseline = 'middle';
      sg.fillText(row.text, COLS / 2, top + size / 2 + 0.5, COLS - 6);
      const data = sg.getImageData(0, 0, COLS, ROWS).data;
      g.fillStyle = row.color ?? '#ffb02e';
      for (let y = 0; y < ROWS; y++) {
        for (let x = 0; x < COLS; x++) {
          if (data[(y * COLS + x) * 4 + 3] > 110) (g.beginPath(), g.arc(x * PITCH + PITCH / 2, y * PITCH + PITCH / 2, PITCH * 0.4, 0, Math.PI * 2), g.fill());
        }
      }
      top += size;
    }
    tex.needsUpdate = true;
  };
  set([{ text: ' ' }]);
  return { mesh, set };
};
