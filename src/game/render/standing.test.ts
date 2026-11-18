/**
 * Nothing is drawn standing on a deck that is not drawn. The car park hides the decks you cannot
 * see (from inside, the decks above you and the ones more than a floor away); the shoppers, the
 * racers and the props on those decks must go with them, or they hang in the sky.
 */
import * as THREE from 'three';

import { deckShown, deckUnder, LEVELS, levelY } from '../sim/levels';
import { buildLot } from '../sim/lot';
import { STAGES } from '../sim/stages';
import { createRound, step } from '../sim/step';
import { buildPeds } from './peds';

import type { Input } from '../sim/types';

const lot = buildLot();
const G = lot.garage;
const idle: Input = { throttle: 0, brake: 0, steer: 0, handbrake: false, horn: false };
const inRect = (x: number, z: number, r: { x0: number; x1: number; z0: number; z1: number }) => x >= r.x0 && x <= r.x1 && z >= r.z0 && z <= r.z1;

describe('where a body stands', () => {
  it('outside the car park it is the ground; inside, the deck of its floor, or the lower deck of the ramp it is on', () => {
    expect(deckUnder(G, G.x0 - 5, (G.z0 + G.z1) / 2, 0)).toBeNull();
    const [x0, x1] = G.rows;
    const z = G.aisleZ[0];
    for (const l of LEVELS) expect(deckUnder(G, (x0 + x1) / 2, z, levelY(l))).toBe(l);
    for (const r of G.ramps) expect(deckUnder(G, (r.x0 + r.x1) / 2, (r.z0 + r.z1) / 2, (levelY(r.lo) + levelY(r.hi)) / 2)).toBe(r.lo);
  });

  it('the decks shown from inside: your own and the ones next to it, none above you with a high camera, all of them from outside', () => {
    for (const l of LEVELS) expect(deckShown(l, null, true)).toBe(true);
    expect(LEVELS.filter((l) => deckShown(l, 0, false))).toEqual([-1, 0, 1]);
    expect(LEVELS.filter((l) => deckShown(l, 0, true))).toEqual([-1, 0]);
    expect(LEVELS.filter((l) => deckShown(l, 2, false))).toEqual([1, 2]);
  });
});

describe.each(STAGES.map((s) => s.n))('stage %i: the shoppers', (stage) => {
  const { state, world } = createRound(lot, { seed: 11 + stage, bots: [true, true, true, true], stage });
  const samples: { x: number; y: number; z: number }[][] = [];
  for (let i = 0; i < 60 * 40; i++) {
    step(state, world, state.cars.map(() => idle));
    if (i % 60 === 0) samples.push(state.peds.map((p) => ({ x: p.x, y: p.y, z: p.z })));
  }

  it('are only on the floors this stage opens (none in a shut car park)', () => {
    const open = STAGES[stage - 1].open;
    for (const p of state.peds) {
      const deck = deckUnder(G, p.x, p.z, p.y);
      if (deck !== null) expect(open.garage && open.levels.includes(deck), `ped ${p.id} on P${deck}`).toBe(true);
    }
  });

  it('stand on a floor at its height: the ground outside the car park, a deck floor inside it', () => {
    for (const peds of samples)
      for (const p of peds) {
        const deck = deckUnder(G, p.x, p.z, p.y);
        if (deck === null) {
          expect(p.y, `ped at ${p.x.toFixed(1)},${p.z.toFixed(1)}`).toBe(0);
          continue;
        }
        expect(p.y).toBeCloseTo(levelY(deck), 6);
        const level = G.levels.find((l) => l.lvl === deck)!;
        expect(level.floors.some((f) => inRect(p.x, p.z, f)), `ped on P${deck} at ${p.x.toFixed(1)},${p.z.toFixed(1)} has a floor under it`).toBe(true);
      }
  });

  it.each([
    [null, false],
    [-1, false],
    [0, true],
    [1, true],
    [2, false],
  ] as const)('are drawn only where their deck is drawn (view from P%s, high camera %s)', (level, hideAbove) => {
    const view = buildPeds(state.peds.length);
    view.update(state.peds, 1, (x, y, z) => {
      const d = deckUnder(G, x, z, y);
      return d === null || deckShown(d, level, hideAbove);
    });
    const torso = view.group.children[0] as THREE.InstancedMesh;
    const m = new THREE.Matrix4();
    const axis = new THREE.Vector3();
    const pos = new THREE.Vector3();
    let hidden = 0;
    state.peds.forEach((p, i) => {
      torso.getMatrixAt(i, m);
      // A hidden instance is scaled to nothing (its matrix has no x axis left).
      const drawn = axis.setFromMatrixColumn(m, 0).length() > 0;
      const d = deckUnder(G, p.x, p.z, p.y);
      const shown = d === null || deckShown(d, level, hideAbove);
      if (!shown) hidden++;
      expect(drawn, `ped ${p.id} on P${d}, view from P${level}`).toBe(shown);
      if (shown) expect(pos.setFromMatrixPosition(m).y).toBeGreaterThan(p.y);
    });
    // The view from P0 with the high camera hides P1 and P2: the shoppers up there (when those floors are open) go with them.
    if (level === 0 && hideAbove) expect(hidden > 0).toBe(state.peds.some((p) => p.y > 1));
  });
});
