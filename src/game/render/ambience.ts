/**
 * Life and colour around the lot: traffic on the street, a bus and its stop, waving flags and
 * banners, birds, flower beds, a fountain, a lawn sprinkler, a cart collector pushing a trolley
 * train. Everything is instanced or merged, and moves only through transforms and a few vertex
 * updates, so it costs a handful of draw calls.
 */
import * as THREE from 'three';

import { rng } from '../sim/lot';

import { block, canvasTexture, merge } from './geo';

import type { Lot } from '../sim/lot';

export interface Ambience {
  group: THREE.Group;
  update: (t: number, dt: number) => void;
}

const std = (color: number, extra: THREE.MeshStandardMaterialParameters = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.6, ...extra });

/** A cloth that waves: a subdivided plane whose vertices ripple away from the pole. */
const flag = (w: number, h: number, color: number | THREE.Texture) => {
  const geo = new THREE.PlaneGeometry(w, h, 12, 4);
  geo.translate(w / 2, 0, 0);
  const base = geo.attributes.position.array.slice() as Float32Array;
  const mat = typeof color === 'number' ? std(color, { side: THREE.DoubleSide }) : new THREE.MeshStandardMaterial({ map: color, side: THREE.DoubleSide, roughness: 0.7 });
  const mesh = new THREE.Mesh(geo, mat);
  const wave = (t: number, phase: number) => {
    const p = geo.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const x = base[i * 3];
      const k = x / w;
      p.setZ(i, Math.sin(t * 4 + x * 2.2 + phase) * 0.22 * k * (w > 2 ? 1.4 : 1));
      p.setY(i, base[i * 3 + 1] - Math.sin(t * 3 + phase) * 0.05 * k);
    }
    p.needsUpdate = true;
  };
  return { mesh, wave };
};

const stripesTex = (a: string, b: string) =>
  canvasTexture(64, 32, (g) => {
    for (let i = 0; i < 4; i++) {
      g.fillStyle = i % 2 ? b : a;
      g.fillRect(i * 16, 0, 16, 32);
    }
  });

/** Boxy road vehicles for the street (a car and a van shape) in a few colours. */
const traffic = (bounds: Lot['bounds']) => {
  const group = new THREE.Group();
  const bodyGeo = merge([block(1.8, 0.7, 4.3, 0, 0.35, 0), block(1.6, 0.6, 2.3, 0, 1.0, -0.2)]);
  const vanGeo = merge([block(2.0, 2.0, 5.2, 0, 0.4, 0)]);
  const glass = merge([block(1.62, 0.45, 2.1, 0, 1.05, -0.2)]);
  const cars: { mesh: THREE.InstancedMesh; n: number; z: number; speed: number; offs: number[] }[] = [];
  const colors = [0xd8472b, 0x2b6fd8, 0xf2c230, 0x2f9d6a, 0xeeeeea, 0x8a4fd0, 0x20232a];
  const mk = (geo: THREE.BufferGeometry, n: number, z: number, speed: number) => {
    const mesh = new THREE.InstancedMesh(geo, std(0xffffff, { roughness: 0.4, metalness: 0.2 }), n);
    mesh.castShadow = true;
    const c = new THREE.Color();
    for (let i = 0; i < n; i++) mesh.setColorAt(i, c.setHex(colors[(i * 3 + n) % colors.length]));
    group.add(mesh);
    cars.push({ mesh, n, z, speed, offs: Array.from({ length: n }, (_, i) => (i / n) * 360 + (i % 2) * 17) });
  };
  const roadZ = bounds.z0 - 9;
  mk(bodyGeo, 6, roadZ - 1.6, 9);
  mk(bodyGeo, 5, roadZ + 1.6, -8);
  mk(vanGeo, 2, roadZ - 1.6, 7);
  const glassMesh = new THREE.InstancedMesh(glass, std(0x1b2832, { roughness: 0.1 }), 11);
  group.add(glassMesh);
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const up = new THREE.Vector3(0, 1, 0);
  const update = (t: number) => {
    let gi = 0;
    for (const c of cars) {
      for (let i = 0; i < c.n; i++) {
        const x = ((((c.offs[i] + t * c.speed + 180) % 360) + 360) % 360) - 180;
        q.setFromAxisAngle(up, c.speed > 0 ? Math.PI / 2 : -Math.PI / 2);
        m.compose(new THREE.Vector3(x, 0.12, c.z), q, new THREE.Vector3(1, 1, 1));
        c.mesh.setMatrixAt(i, m);
        if (c.n === 6 || c.n === 5) glassMesh.setMatrixAt(gi++, m);
      }
      c.mesh.instanceMatrix.needsUpdate = true;
    }
    glassMesh.count = gi;
    glassMesh.instanceMatrix.needsUpdate = true;
  };
  return { group, update };
};

const bus = (x: number, z: number) => {
  const g = new THREE.Group();
  const body = new THREE.Mesh(block(2.5, 2.7, 11, 0, 0.45, 0), std(0xd8472b, { roughness: 0.4 }));
  body.castShadow = true;
  const band = new THREE.Mesh(block(2.52, 0.9, 10.2, 0, 1.5, 0), std(0x1b2832, { roughness: 0.1 }));
  const stripe = new THREE.Mesh(block(2.52, 0.25, 11.02, 0, 0.9, 0), std(0xf4f0e0));
  const wheels: THREE.BufferGeometry[] = [];
  for (const wz of [-3.6, 3.4]) for (const s of [-1, 1]) {
    const w = new THREE.CylinderGeometry(0.55, 0.55, 0.3, 14);
    w.rotateZ(Math.PI / 2);
    w.translate(s * 1.2, 0.55, wz);
    wheels.push(w);
  }
  g.add(body, band, stripe, new THREE.Mesh(merge(wheels), std(0x16171a)));
  g.position.set(x, 0, z);
  g.rotation.y = Math.PI / 2;
  return g;
};

const busStop = (x: number, z: number) => {
  const g = new THREE.Group();
  const roof = new THREE.Mesh(block(4.2, 0.12, 1.6, x, 2.5, z), std(0x2f6fd0));
  roof.castShadow = true;
  const posts = merge([block(0.08, 2.5, 0.08, x - 2, 0, z - 0.7), block(0.08, 2.5, 0.08, x + 2, 0, z - 0.7), block(4.0, 1.4, 0.04, x, 0.8, z - 0.75), block(3.6, 0.08, 0.5, x, 0.5, z - 0.4)]);
  g.add(roof, new THREE.Mesh(posts, std(0x6e757d, { metalness: 0.6 })));
  const sign = new THREE.Mesh(new THREE.CircleGeometry(0.4, 20), new THREE.MeshStandardMaterial({ color: 0xf2c230, emissive: 0x6a4a00, side: THREE.DoubleSide }));
  sign.position.set(x + 2.6, 2.6, z);
  g.add(sign, new THREE.Mesh(block(0.06, 2.6, 0.06, x + 2.6, 0, z), std(0x6e757d)));
  return g;
};

/** Beds of bright flowers on the planters and by the shops: instanced blobs in a few colours. */
const flowers = (lot: Lot) => {
  const r = rng(91);
  const spots: { x: number; z: number; c: number }[] = [];
  const cols = [0xe8344f, 0xf2a62b, 0xf7e04a, 0xd25ad0, 0xffffff, 0xff7a3d];
  for (const isl of lot.islands) {
    if (isl.kind !== 'planter') continue;
    const mz = (isl.z0 + isl.z1) / 2;
    for (let x = isl.x0 + 1; x < isl.x1 - 1; x += 0.5) if (r() < 0.8) spots.push({ x, z: mz + (r() - 0.5) * 1.0, c: cols[Math.floor(r() * cols.length)] });
  }
  for (const shop of lot.shops) {
    for (let x = shop.x0 + 4; x < shop.x1 - 4; x += 0.6) {
      if (Math.abs(x - shop.doorX) < 8 || r() < 0.4) continue;
      spots.push({ x, z: shop.z0 - 1.1, c: cols[Math.floor(r() * cols.length)] });
    }
  }
  const mesh = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(0.27, 0), std(0xffffff, { roughness: 0.8 }), spots.length);
  const m = new THREE.Matrix4();
  const c = new THREE.Color();
  spots.forEach((p, i) => {
    m.makeTranslation(p.x, 0.3 + r() * 0.12, p.z);
    mesh.setMatrixAt(i, m);
    mesh.setColorAt(i, c.setHex(p.c));
  });
  // Planter boxes in front of the shops, painted.
  const boxes: THREE.Mesh[] = lot.shops.map((s) => new THREE.Mesh(block(s.x1 - s.x0 - 6, 0.3, 0.7, (s.x0 + s.x1) / 2, 0.15, s.z0 - 1.1), std(0x7a3b22)));
  return { mesh, boxes };
};

export const buildAmbience = (lot: Lot): Ambience => {
  const group = new THREE.Group();
  const { bounds } = lot;
  const roadZ = bounds.z0 - 9;

  const tr = traffic(bounds);
  group.add(tr.group);
  // The bus waits at its stop on the near side of the street, west of the entry.
  group.add(bus(-34, roadZ - 3.6));
  group.add(busStop(-26, bounds.z0 - 3.4));

  const fl = flowers(lot);
  group.add(fl.mesh, ...fl.boxes);

  // Flags and banners: tall flag poles at the entry and by each shop, bunting-like banners on lamp posts.
  const waves: ((t: number) => void)[] = [];
  const poleMat = std(0xdadde2, { metalness: 0.6 });
  const poles: THREE.BufferGeometry[] = [];
  const addFlag = (x: number, z: number, h: number, w: number, color: number | THREE.Texture, ph: number) => {
    poles.push(block(0.1, h, 0.1, x, 0, z));
    const f = flag(w, w * 0.6, color);
    f.mesh.position.set(x + 0.05, h - w * 0.3 - 0.1, z);
    f.mesh.castShadow = true;
    group.add(f.mesh);
    waves.push((t) => f.wave(t, ph));
  };
  const store = lot.shops[0];
  const tri = stripesTex('#e8344f', '#f4f0e0');
  const blue = stripesTex('#2b6fd8', '#f2c230');
  addFlag(-8, bounds.z0 - 1.6, 9, 2.4, tri, 0);
  addFlag(8, bounds.z0 - 1.6, 9, 2.4, blue, 1.3);
  addFlag(store.x0 + 6, bounds.z1 + 3.2, 11, 3, 0x1f9d55, 2);
  addFlag(store.x1 - 6, bounds.z1 + 3.2, 11, 3, 0xf2c230, 0.7);
  addFlag(lot.shops[1].doorX, bounds.z1 + 3.2, 8, 2.2, 0xd8472b, 3.1);
  for (const l of lot.lamps.filter((_, i) => i % 3 === 0)) {
    const f = flag(0.5, 1.3, [0xe8344f, 0x2b6fd8, 0xf2a62b][Math.abs(Math.floor(l.x)) % 3]);
    f.mesh.rotation.z = Math.PI / 2;
    f.mesh.position.set(l.x + 0.1, 6.6, l.z + 0.1);
    group.add(f.mesh);
    waves.push((t) => f.wave(t, l.x));
  }
  group.add(new THREE.Mesh(merge(poles), poleMat));

  // Coloured kerb paint: red and white at the entry island and the gate kerbs, yellow on the exit.
  const paint: THREE.Mesh[] = [];
  for (let z = bounds.z0 + 1; z < -34.5; z += 1.6) {
    const col = Math.floor((z - bounds.z0) / 1.6) % 2 ? 0xf4f0e0 : 0xd8242b;
    for (const x of [-5.5, 5.5]) paint.push(new THREE.Mesh(block(0.82, 0.02, 1.6, x, 0.15, z + 0.8), std(col)));
  }
  group.add(...paint);

  // A fountain on the pavement by COMMIT COFFEE: basin and jets of droplets.
  const fx = 22.5;
  const fz = bounds.z1 + 3.2;
  const basin = new THREE.Mesh(new THREE.CylinderGeometry(1.8, 1.9, 0.5, 24), std(0xcfc9bd));
  basin.position.set(fx, 0.25, fz);
  const water = new THREE.Mesh(new THREE.CircleGeometry(1.6, 24), new THREE.MeshStandardMaterial({ color: 0x4aa8d8, roughness: 0.05, metalness: 0.3 }));
  water.rotation.x = -Math.PI / 2;
  water.position.set(fx, 0.46, fz);
  group.add(basin, water);
  const drops = 60;
  const dropGeo = new THREE.BufferGeometry();
  dropGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(drops * 3), 3));
  const dropPts = new THREE.Points(dropGeo, new THREE.PointsMaterial({ color: 0xcfeeff, size: 0.09, transparent: true, opacity: 0.85 }));
  group.add(dropPts);
  // A lawn sprinkler: a rotating arc of droplets on the south-west lawn.
  const sprinkler = { x: -30, z: bounds.z0 + 8 };
  const sprGeo = new THREE.BufferGeometry();
  sprGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(40 * 3), 3));
  const spr = new THREE.Points(sprGeo, new THREE.PointsMaterial({ color: 0xdff4ff, size: 0.08, transparent: true, opacity: 0.8 }));
  group.add(spr);

  // A cart collector pushing a train of trolleys along the pavement in front of the main store.
  const collector = new THREE.Group();
  const person = new THREE.Mesh(merge([block(0.45, 0.8, 0.28, 0, 0.8, 0), block(0.3, 0.3, 0.3, 0, 1.6, 0), block(0.4, 0.8, 0.25, 0, 0, 0)]), std(0xf2a62b));
  collector.add(person);
  const vest = new THREE.Mesh(block(0.5, 0.55, 0.32, 0, 0.95, 0), std(0xc8f038, { emissive: 0x405000 }));
  collector.add(vest);
  const train = new THREE.Mesh(merge(Array.from({ length: 8 }, (_, i) => merge([block(0.55, 0.5, 0.9, 0, 0.5, 1.1 + i * 0.55), block(0.55, 0.04, 0.9, 0, 0.3, 1.1 + i * 0.55)]))), std(0xb8bdc4, { metalness: 0.85, roughness: 0.35 }));
  collector.add(train);
  group.add(collector);

  // Birds: small V shapes circling over the lot, a few lifting off from the lawns now and then.
  const birdGeo = new THREE.BufferGeometry();
  birdGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array([0, 0, 0.2, -0.45, 0, -0.1, 0, 0, 0.2, 0.45, 0, -0.1]), 3));
  birdGeo.setIndex([0, 1, 1, 0, 2, 3, 3, 2]);
  const birdMat = new THREE.MeshBasicMaterial({ color: 0x1b1d22, side: THREE.DoubleSide });
  const nBirds = 14;
  const birds = new THREE.InstancedMesh(
    new THREE.BufferGeometry().setAttribute('position', new THREE.BufferAttribute(new Float32Array([-0.5, 0, -0.1, 0, 0, 0.18, 0, 0, -0.05, 0, 0, 0.18, 0.5, 0, -0.1, 0, 0, -0.05]), 3)),
    birdMat,
    nBirds,
  );
  void birdGeo;
  group.add(birds);
  const r = rng(5);
  const flock = Array.from({ length: nBirds }, (_, i) => ({ cx: -50 + r() * 100, cz: -30 + r() * 80, rad: 10 + r() * 22, sp: 0.15 + r() * 0.2, ph: r() * 6, h: 14 + r() * 14, take: i < 5 ? r() * 20 : -1 }));
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();

  // Windows of the shops glow warm.
  for (const s of lot.shops) {
    const glow = new THREE.Mesh(new THREE.PlaneGeometry((s.x1 - s.x0) * 0.6, 2.8), new THREE.MeshStandardMaterial({ color: 0x000000, emissive: 0xffd9a0, emissiveIntensity: 0.55, transparent: true, opacity: 0.55 }));
    glow.position.set((s.x0 + s.x1) / 2, 2.0, s.z0 - 0.26);
    glow.rotation.y = Math.PI;
    group.add(glow);
  }

  const update = (t: number) => {
    tr.update(t);
    waves.forEach((w) => w(t));
    // Fountain jets.
    const dp = dropGeo.attributes.position;
    for (let i = 0; i < drops; i++) {
      const jet = i % 5;
      const a = (jet / 5) * Math.PI * 2;
      const u = ((t * 0.9 + i * 0.137) % 1 + 1) % 1;
      const reach = 0.5 + (jet % 2) * 0.5;
      dp.setXYZ(i, fx + Math.cos(a) * u * reach, 0.5 + (4 * u * (1 - u)) * (1.3 + (jet % 2) * 0.6), fz + Math.sin(a) * u * reach);
    }
    dp.needsUpdate = true;
    const sp = sprGeo.attributes.position;
    const ang = t * 0.9;
    for (let i = 0; i < 40; i++) {
      const u = ((t * 1.6 + i / 40) % 1 + 1) % 1;
      const a = ang + Math.floor(i / 8) * 0.12;
      const d = u * 5;
      sp.setXYZ(i, sprinkler.x + Math.sin(a) * d, 0.2 + 4 * u * (1 - u) * 1.4, sprinkler.z + Math.cos(a) * d);
    }
    sp.needsUpdate = true;
    // Collector: back and forth along the pavement, trolleys ahead of him.
    const span = 40;
    const p = (t * 0.9) % (span * 2);
    const x = p < span ? store.x0 + 6 + p : store.x0 + 6 + (span * 2 - p);
    const dir = p < span ? 1 : -1;
    collector.position.set(x, 0.15, bounds.z1 + 4.4);
    collector.rotation.y = dir > 0 ? Math.PI / 2 : -Math.PI / 2;
    // Birds.
    flock.forEach((b, i) => {
      const a = t * b.sp + b.ph;
      const lift = b.take >= 0 ? Math.min(1, Math.max(0, (t % 40) - b.take) / 6) : 1;
      const y = b.take >= 0 ? 0.4 + (b.h - 0.4) * lift : b.h + Math.sin(t + i) * 1.2;
      const px = b.cx + Math.cos(a) * b.rad;
      const pz = b.cz + Math.sin(a) * b.rad;
      q.setFromEuler(new THREE.Euler(0, -a - Math.PI / 2, Math.sin(t * 9 + i) * 0.5 * lift));
      m.compose(new THREE.Vector3(px, lift > 0 ? y : -5, pz), q, new THREE.Vector3(1, 1, 1));
      birds.setMatrixAt(i, m);
    });
    birds.instanceMatrix.needsUpdate = true;
  };
  return { group, update };
};
