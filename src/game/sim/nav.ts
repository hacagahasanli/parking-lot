/**
 * The aisle graph: the lot's drivable roads as nodes (junctions and aisle ends) and directed edges
 * (one per direction of travel along each stretch of aisle). A one-way aisle only has the edge that
 * goes with its flow, so any route the graph gives respects the traffic rules. Two-way aisles have
 * an edge each way, drawn in the right-hand lane.
 *
 * Bots use it to cruise (a search is a list of sweeps along aisles) and to drive to a bay they have
 * seen (shortest path to the bay's docking point on an edge). It knows nothing about any particular
 * layout: `buildLot()` hands it the nodes and aisles.
 */
import type { Aisle, Vec } from './lot';
import type { Car, Input } from './types';

export interface GNode {
  id: number;
  name: string;
  x: number;
  z: number;
}

export interface GEdge {
  id: number;
  aisle: number;
  from: number;
  to: number;
  /** +1 along the aisle's node order, -1 against it (two-way aisles only). */
  dir: 1 | -1;
  len: number;
  /** Start and end of the lane this edge is driven in (the right-hand lane when the aisle is two-way). */
  a: Vec;
  b: Vec;
  /** Unit vector from a to b. */
  ux: number;
  uz: number;
  /** Edges that bots never use (the entry lanes, the exit lane, the dead-end pocket). */
  avoid: boolean;
}

export interface Graph {
  nodes: GNode[];
  edges: GEdge[];
  /** Outgoing edge ids per node. */
  out: number[][];
}

/** How far a two-way lane sits to the right of the aisle's centre line. */
export const laneOffset = (a: Aisle) => (a.oneWay ? 0 : Math.min(2, a.width / 4));

export const buildGraph = (nodes: GNode[], aisles: Aisle[]): Graph => {
  const edges: GEdge[] = [];
  const out: number[][] = nodes.map(() => []);
  for (const aisle of aisles) {
    const L = laneOffset(aisle);
    for (let i = 0; i < aisle.nodes.length - 1; i++) {
      for (const dir of aisle.oneWay ? ([1] as const) : ([1, -1] as const)) {
        const from = nodes[aisle.nodes[dir > 0 ? i : i + 1]];
        const to = nodes[aisle.nodes[dir > 0 ? i + 1 : i]];
        const len = Math.hypot(to.x - from.x, to.z - from.z);
        const ux = (to.x - from.x) / len;
        const uz = (to.z - from.z) / len;
        // Right of travel is (-uz, ux) in this game's axes (a car heading north has its right side at -x).
        const a = { x: from.x - uz * L, z: from.z + ux * L };
        const b = { x: to.x - uz * L, z: to.z + ux * L };
        const id = edges.length;
        edges.push({ id, aisle: aisle.id, from: from.id, to: to.id, dir, len, a, b, ux, uz, avoid: aisle.avoid });
        out[from.id].push(id);
      }
    }
  }
  return { nodes, edges, out };
};

/** Is `b` the same road as `a`, driven back the way it came (a U-turn at a junction)? */
const reverses = (a: GEdge, b: GEdge) => b.from === a.to && b.to === a.from;

/**
 * Shortest path (Dijkstra over edges, so a U-turn at a junction can be forbidden: a car cannot
 * turn round in the width of a road). Starts at node `s` having just arrived by edge `prev`
 * (-1 for none) and ends at node `t`, or, given `goalEdge`, at the start of that edge (which it
 * must be able to turn onto). Returns the edge ids in between; null when there is no way.
 */
export const pathFrom = (g: Graph, s: number, prev: number, t: number, goalEdge = -1, allowAvoid = false, cost?: (e: GEdge) => number): number[] | null => {
  if (goalEdge < 0 && s === t) return [];
  const dist = g.edges.map(() => Infinity);
  const via = g.edges.map(() => -1);
  const done = g.edges.map(() => false);
  const prevE = prev >= 0 ? g.edges[prev] : null;
  if (goalEdge >= 0 && g.out[s].includes(goalEdge) && !(prevE && reverses(prevE, g.edges[goalEdge]))) return [];
  for (const id of g.out[s]) {
    const e = g.edges[id];
    if ((e.avoid && !allowAvoid) || (prevE && reverses(prevE, e))) continue;
    dist[id] = cost ? cost(e) : e.len;
  }
  for (;;) {
    let u = -1;
    for (let i = 0; i < dist.length; i++) if (!done[i] && dist[i] < Infinity && (u < 0 || dist[i] < dist[u])) u = i;
    if (u < 0) return null;
    const eu = g.edges[u];
    const reached = goalEdge >= 0 ? false : eu.to === t;
    if (reached) {
      const path: number[] = [];
      for (let id = u; id >= 0; id = via[id]) path.unshift(id);
      return path;
    }
    done[u] = true;
    for (const id of g.out[eu.to]) {
      const e = g.edges[id];
      if (done[id] || reverses(eu, e)) continue;
      if (id === goalEdge) {
        const path: number[] = [];
        for (let k = u; k >= 0; k = via[k]) path.unshift(k);
        return path;
      }
      if (e.avoid && !allowAvoid) continue;
      const d = dist[u] + (cost ? cost(e) : e.len);
      if (d < dist[id]) {
        dist[id] = d;
        via[id] = u;
      }
    }
  }
};

/** Shortest path from node `s` to node `t` as a list of edge ids; null when there is none. */
export const shortestPath = (g: Graph, s: number, t: number, allowAvoid = false): number[] | null => pathFrom(g, s, -1, t, -1, allowAvoid);

/** Every edge reachable from node `s` without using avoided edges or turning round at a junction. */
export const reachableFrom = (g: Graph, s: number): Set<number> => {
  const seen = new Set<number>();
  const queue: number[] = [];
  for (const id of g.out[s]) if (!g.edges[id].avoid) (seen.add(id), queue.push(id));
  while (queue.length) {
    const a = g.edges[queue.pop()!];
    for (const id of g.out[a.to]) {
      const e = g.edges[id];
      if (e.avoid || seen.has(id) || reverses(a, e)) continue;
      seen.add(id);
      queue.push(id);
    }
  }
  return seen;
};

/** Where on the graph a point is: the edge whose lane it is nearest to (and heading along, if given), and how far along (metres). */
export const locate = (g: Graph, x: number, z: number, h?: number, allowAvoid = true) => {
  let best: { edge: number; s: number; off: number } | null = null;
  let bestScore = Infinity;
  const fx = h === undefined ? 0 : Math.sin(h);
  const fz = h === undefined ? 0 : Math.cos(h);
  for (const e of g.edges) {
    if (e.avoid && !allowAvoid) continue;
    const dx = x - e.a.x;
    const dz = z - e.a.z;
    const s = dx * e.ux + dz * e.uz;
    const off = Math.abs(dx * e.uz - dz * e.ux);
    const past = s < 0 ? -s : s > e.len ? s - e.len : 0;
    let score = off + past * 1.5;
    if (h !== undefined && fx * e.ux + fz * e.uz < 0) score += 7;
    if (score < bestScore) {
      bestScore = score;
      best = { edge: e.id, s: Math.max(0, Math.min(e.len, s)), off };
    }
  }
  return best!;
};

/** The lane points of a chain of edges, start to end. */
export const lanePoints = (g: Graph, edges: number[]): Vec[] => {
  const pts: Vec[] = [];
  for (const id of edges) pts.push(g.edges[id].a, g.edges[id].b);
  return pts;
};

/** Cuts the sharp corners of a route into short arcs (a quadratic curve through three points). */
export const roundCorners = (input: Vec[], r = 5.5): Vec[] => {
  // Joined lanes repeat a point (the end of one edge is the start of the next): drop the repeats first.
  const dedup = input.filter((p, i) => i === 0 || Math.hypot(p.x - input[i - 1].x, p.z - input[i - 1].z) > 0.01);
  // ...and the points in the middle of a straight run, so a corner has room to be rounded.
  // Lane points at a junction can make a spike (up to the centre line and back): cut those out first.
  const unspiked = [...dedup];
  for (let again = true; again; ) {
    again = false;
    for (let i = 1; i < unspiked.length - 1; i++) {
      const a = unspiked[i - 1];
      const p = unspiked[i];
      const b = unspiked[i + 1];
      const dot = (p.x - a.x) * (b.x - p.x) + (p.z - a.z) * (b.z - p.z);
      if (dot < -0.3 * Math.hypot(p.x - a.x, p.z - a.z) * Math.hypot(b.x - p.x, b.z - p.z)) {
        unspiked.splice(i, 1);
        again = true;
        break;
      }
    }
  }
  const pts = unspiked.filter((p, i) => {
    const dedup = unspiked;
    if (i === 0 || i === dedup.length - 1) return true;
    const a = dedup[i - 1];
    const b = dedup[i + 1];
    const cross = (p.x - a.x) * (b.z - p.z) - (p.z - a.z) * (b.x - p.x);
    const dot = (p.x - a.x) * (b.x - p.x) + (p.z - a.z) * (b.z - p.z);
    return Math.abs(cross) > 0.05 * Math.hypot(p.x - a.x, p.z - a.z) * Math.hypot(b.x - p.x, b.z - p.z) || dot < 0;
  });
  if (pts.length < 3) return pts;
  const out: Vec[] = [pts[0]];
  for (let i = 1; i < pts.length - 1; i++) {
    const p = pts[i - 1];
    const v = pts[i];
    const n = pts[i + 1];
    const l1 = Math.hypot(v.x - p.x, v.z - p.z);
    const l2 = Math.hypot(n.x - v.x, n.z - v.z);
    if (l1 < 0.01 || l2 < 0.01) continue;
    const u1 = { x: (v.x - p.x) / l1, z: (v.z - p.z) / l1 };
    const u2 = { x: (n.x - v.x) / l2, z: (n.z - v.z) / l2 };
    const turn = Math.acos(Math.max(-1, Math.min(1, u1.x * u2.x + u1.z * u2.z)));
    if (turn < 0.3) {
      out.push(v);
      continue;
    }
    const k1 = Math.min(r, l1 * 0.45);
    const k2 = Math.min(r, l2 * 0.45);
    const a = { x: v.x - u1.x * k1, z: v.z - u1.z * k1 };
    const b = { x: v.x + u2.x * k2, z: v.z + u2.z * k2 };
    for (const t of [0, 0.25, 0.5, 0.75, 1]) {
      const w0 = (1 - t) * (1 - t);
      const w1 = 2 * t * (1 - t);
      const w2 = t * t;
      out.push({ x: w0 * a.x + w1 * v.x + w2 * b.x, z: w0 * a.z + w1 * v.z + w2 * b.z });
    }
  }
  out.push(pts[pts.length - 1]);
  return out;
};

/** The unrounded way from a car to a point on an edge (`s` metres along it): the rest of its own lane, the shortest path, then the target lane. */
const rawToEdge = (g: Graph, car: { x: number; z: number; h: number }, edge: number, s: number): Vec[] | null => {
  const here = locate(g, car.x, car.z, car.h, false);
  const e = g.edges[here.edge];
  const target = g.edges[edge];
  const start: Vec = { x: car.x + Math.sin(car.h) * 3, z: car.z + Math.cos(car.h) * 3 };
  const at = (e2: GEdge, along: number): Vec => ({ x: e2.a.x + e2.ux * along, z: e2.a.z + e2.uz * along });
  // Already on the target lane with the point ahead: just drive on.
  if (here.edge === edge && s > here.s + 3) return [start, at(e, s)];
  const path = pathFrom(g, e.to, e.id, -1, edge);
  if (!path) return null;
  const pts: Vec[] = [start, e.b];
  for (const id of path) pts.push(g.edges[id].a, g.edges[id].b);
  pts.push(target.a, at(target, s));
  return pts;
};

/** The way from a car to a docking point on an edge, corners rounded. Null when the point cannot be reached. */
export const routeToDock = (g: Graph, car: { x: number; z: number; h: number }, edge: number, s: number): Vec[] | null => {
  const raw = rawToEdge(g, car, edge, s);
  return raw && roundCorners(raw);
};

/** The way from a car to the start of a chain of edges and along all of them (a sweep of an aisle). */
export const routeToSweep = (g: Graph, car: { x: number; z: number; h: number }, edges: number[]): Vec[] | null => {
  const raw = rawToEdge(g, car, edges[0], 0);
  if (!raw) return null;
  for (let i = 0; i < edges.length; i++) {
    if (i > 0) raw.push(g.edges[edges[i]].a);
    raw.push(g.edges[edges[i]].b);
  }
  return roundCorners(raw);
};

/** Length of a polyline. */
export const routeLength = (pts: Vec[]) => {
  let d = 0;
  for (let i = 0; i < pts.length - 1; i++) d += Math.hypot(pts[i + 1].x - pts[i].x, pts[i + 1].z - pts[i].z);
  return d;
};

/** Route from a car to a node (the exit, say), rounded. */
export const routeToNode = (g: Graph, car: { x: number; z: number; h: number }, node: number): Vec[] | null => {
  const here = locate(g, car.x, car.z, car.h);
  const e = g.edges[here.edge];
  const path = pathFrom(g, e.to, e.id, node, -1, true);
  if (!path) return null;
  const fx = Math.sin(car.h);
  const fz = Math.cos(car.h);
  const pts: Vec[] = [{ x: car.x + fx * 3, z: car.z + fz * 3 }, e.b];
  for (const id of path) pts.push(g.edges[id].a, g.edges[id].b);
  return roundCorners(pts);
};

const wrap = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));

/**
 * A plain route follower (pure pursuit: steer for a point a few metres ahead on the route) for the
 * cars that are not bots, such as the one pulling out of its bay. `st.seg` is the segment it is on.
 */
export const followRoute = (car: Car, route: Vec[], st: { seg: number }, speed: number, wheelLimit: number): Input => {
  const fx = Math.sin(car.h);
  const fz = Math.cos(car.h);
  while (st.seg < route.length - 2) {
    const a = route[st.seg];
    const b = route[st.seg + 1];
    const dx = b.x - a.x;
    const dz = b.z - a.z;
    const t = ((car.x - a.x) * dx + (car.z - a.z) * dz) / (dx * dx + dz * dz || 1);
    if (t < 0.999) break;
    st.seg++;
  }
  const a = route[st.seg];
  const b = route[st.seg + 1] ?? a;
  const dx0 = b.x - a.x;
  const dz0 = b.z - a.z;
  const t0 = Math.max(0, Math.min(1, ((car.x - a.x) * dx0 + (car.z - a.z) * dz0) / (dx0 * dx0 + dz0 * dz0 || 1)));
  let px = a.x + dx0 * t0;
  let pz = a.z + dz0 * t0;
  let left = 4.5;
  let i = st.seg;
  while (i < route.length - 1) {
    const n = route[i + 1];
    const d = Math.hypot(n.x - px, n.z - pz);
    if (d >= left) {
      px += ((n.x - px) * left) / d;
      pz += ((n.z - pz) * left) / d;
      left = 0;
      break;
    }
    left -= d;
    px = n.x;
    pz = n.z;
    i++;
  }
  const gx = px - car.x;
  const gz = pz - car.z;
  const ahead = gx * fx + gz * fz;
  const side = gx * fz - gz * fx;
  const curvature = (2 * side) / Math.max(1, gx * gx + gz * gz);
  let wheel = -Math.atan(curvature * 2.62);
  if (ahead < 0) wheel = side > 0 ? -wheelLimit : wheelLimit;
  const v = car.vx * fx + car.vz * fz;
  return {
    throttle: v < speed ? Math.min(1, (speed - v) * 0.5 + 0.2) : 0,
    brake: v > speed + 1 ? 0.3 : 0,
    steer: Math.max(-1, Math.min(1, wheel / wheelLimit)),
    handbrake: false,
    horn: false,
  };
};

/** Has a car reached the end of a route? */
export const routeDone = (car: { x: number; z: number }, route: Vec[], within = 3) => {
  const end = route[route.length - 1];
  return Math.hypot(end.x - car.x, end.z - car.z) < within;
};

export { wrap as wrapAngle };
