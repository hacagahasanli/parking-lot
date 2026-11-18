/** Small geometry and texture helpers shared by the lot's scenery. */
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

export const merge = (list: THREE.BufferGeometry[]) => mergeGeometries(list.map((g) => (g.index ? g.toNonIndexed() : g)))!;

/** A flat rectangle lying on the ground, `h` turning it about the vertical axis. */
export const flat = (w: number, d: number, x: number, z: number, h = 0, y = 0.01) => {
  const g = new THREE.PlaneGeometry(w, d);
  g.rotateX(-Math.PI / 2);
  g.rotateY(h);
  g.translate(x, y, z);
  return g;
};

/** A box standing on `y`, centred on x and z. */
export const block = (w: number, h: number, d: number, x: number, y: number, z: number, ry = 0) => {
  const g = new THREE.BoxGeometry(w, h, d);
  if (ry) g.rotateY(ry);
  g.translate(x, y + h / 2, z);
  return g;
};

/** Scales a geometry's UVs, so a repeating texture tiles per metre instead of stretching over the shape. */
export const scaleUV = (g: THREE.BufferGeometry, su: number, sv: number) => {
  const uv = g.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * su, uv.getY(i) * sv);
  return g;
};

export const canvasTexture = (w: number, h: number, draw: (g: CanvasRenderingContext2D) => void, repeat = 1) => {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  draw(c.getContext('2d')!);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(repeat, repeat);
  t.anisotropy = 8;
  return t;
};
