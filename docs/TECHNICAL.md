# Parking Lot: technical guide

Reader: a developer who knows web development (Next.js, React, TypeScript) but has not built a
game. Goal: after reading this you can find any rule in the code, change a number safely, and know
the names of the techniques so you can look them up.

`file:line` points at the lines at the time of writing. For what the game is meant to be, read
`docs/DESIGN.md`. Status: offline, you against 3 bots. There is no networking code.

## 1. Run it

```bash
npm install
npm run dev          # http://localhost:3200
npm run test:run     # vitest, src/game/sim/sim.test.ts (about 45 s: 48 of the tests play whole bot rounds)
npm run type-check   # tsc --noEmit
```

Open `http://localhost:3200/play`. `npm run test:run` is green (86 tests). In development the page also
exposes `window.__game` (the running `Game`), which the Playwright scripts use to place the camera
and read `renderer.info`.

## 2. Architecture in one picture

```text
src/
  app/                  Next.js App Router: pages only
    page.tsx            home page (Home.tsx)
    play/page.tsx       renders <Race/>
  components/           React UI around the canvas (Home.tsx, Race.tsx)
  game/
    sim/                THE RULES. Pure TypeScript: no DOM, no three.js
      constants.ts      every number: car, driving, impacts, parking, countdown
      lot.ts            buildLot(): the layout (bays by type, aisles, islands, gates, props, signs),
                        approach paths per bay, candidates; the grid constants in LAYOUT
      nav.ts            the aisle graph: nodes, directed edges, Dijkstra, routes, route following
      types.ts          Car, GameState, Input, GameEvent, World
      step.ts           step(): one tick. drive(), crashes, parking rule
      collide.ts        SAT box and circle collision
      bot.ts            planSweeps(), sweepRoute(), spotRoute(), botInput(): bot drivers
      sim.test.ts       tests
    render/             WHAT YOU SEE. three.js
      game.ts           the loop, inputs, camera, HUD data, effects
      car.ts            car models, instanced parked cars
      world.ts          the scene: ground, roads, paint, islands, lawns, hedges, trees, lamps, shops
      scenery.ts        gates (animated arms), carport, EV chargers, truck, yard props, signs, bay paint, zebra and bumps
      geo.ts            small geometry and canvas-texture helpers
    sfx.ts              Web Audio synthesis
```

The rule that shapes everything: **`sim/` knows nothing about the screen.** It takes inputs and
advances plain objects. `render/` reads those objects and draws them. That is why the rules are
testable in Node without a browser, and why online play later can run `sim/` on a host.
`buildLot()` feeds both sides, so the painted bays and the physics bays cannot disagree.

Data flow each frame: keyboard or touch gives an `Input`; bots give an `Input` via `botInput`;
`step(state, world, inputs)` updates `state`; `game.ts` draws `state` and plays sounds for
`state.events`.

## 3. Fixed timestep and interpolation

Problem: if physics advances by "time since last frame", a 144 Hz monitor and a slow phone get
different results, and big frame gaps make cars tunnel through walls.

Solution, named **fixed timestep with an accumulator** ("Fix Your Timestep", Glenn Fiedler):

- `DT = 1/60` in `src/game/sim/constants.ts`.
- `frame()` in `src/game/render/game.ts:541` adds the real elapsed time (capped at 0.1 s) to
  `acc`, then runs `tick()` once per whole `DT` it can take out. Leftover time stays in `acc`.
- Drawing happens once per screen frame in `draw()` (`game.ts:606`). The leftover is a fraction
  `alpha = acc / DT` between the previous step and the current one. The car is drawn at
  `previous + (current - previous) * alpha`, and the heading with `lerpAngle` (which takes the
  short way round the circle). This is **interpolation**; it shows motion at the screen's rate
  while the rules run at 60 Hz.
- `tick()` (`game.ts:567`) saves `prev` first, so there are always two states to blend.

Result: the same inputs give the same round on any device. That determinism is also what a
networked game needs.

## 4. Car physics: the bicycle model

`drive()` in `src/game/sim/step.ts:97` is a simplified car, not a full tyre simulation.

1. **Axes.** Heading `h` points the car along `(sin h, cos h)`. The velocity is split into `vF`
   (along the nose) and `vS` (sideways). Almost everything is easier in those two numbers.
2. **Steering wheel.** The wheel angle moves toward the wanted angle at `steerRate`, and home faster
   (`steerReturn`) when released. `steerLimit()` (`step.ts:89`) shrinks the maximum angle with speed,
   because nobody can full-lock at 60 km/h.
3. **Engine and brakes.** Acceleration fades to zero as speed nears `topSpeed`. Brake and rolling
   resistance only slow the car; they never push it backwards. A small automatic-gearbox rule picks
   reverse when stopped and S is held.
4. **Bicycle model for turning.** Imagine the car as two wheels, front and rear, joined by the
   wheelbase. If the front wheel is turned by angle `δ`, the car's turn rate is
   `ω = -v · tan(δ) / wheelbase`. That is the line `wantW = (-vF * Math.tan(c.steer)) / CAR.wheelbase`.
   The minus sign comes from the sign convention (positive spin turns left).
5. **Grip limit.** Sideways acceleration is `v · ω`. If it exceeds `maxLateral`, `ω` is reduced
   until it does not. The car then turns less than the wheels ask: **understeer**.
6. **Yaw follows the wheels.** The body's spin `w` eases toward `wantW` with an exponential
   smoothing `1 - exp(-follow · dt)`, so the car has weight and does not snap round.
7. **Sideways slide.** `vS` is pulled toward zero by `grip` each step. That is the tyres biting.
8. **Handbrake.** It lowers `grip` (3.2 instead of 13), lowers `yawFollow`, multiplies the wanted
   spin by `handbrakeYaw`, and raises the allowed lateral acceleration. The tail comes round and
   the car keeps sliding sideways for a while: a **drift**. `slip` is the sideways speed and feeds
   the tyre squeal and skid marks.
9. **Integrate.** Velocity becomes `fx·vF + sx·vS`; position and heading advance by `· dt`
   (**semi-implicit Euler**: velocity first, then position).

To change the feel, edit `DRIVE` in `constants.ts`. `sim.test.ts` pins the broad behaviour (time to
50 km/h, top speed, steering rate and return), so a bad tweak can fail a test.

## 5. Collisions: SAT boxes and impulses

Cars are oriented boxes (`Box`: centre, half sizes, heading). Static things (parked cars, kerbs,
the store) are boxes or `Circle`s (lamp posts, planted row ends). `src/game/sim/collide.ts`.

- **Broad phase.** `nearShape()` (`collide.ts:139`) rejects pairs whose bounding circles do not
  touch. Cheap, and it removes almost all pairs.
- **Narrow phase: SAT** (Separating Axis Theorem), `boxBox()` at `collide.ts:61`. Two convex shapes
  do not overlap if you can find a line on which their shadows (projections) do not overlap. For
  two boxes, the lines to test are the four edge directions. If every projection overlaps, they
  collide, and the axis with the *smallest* overlap is the push-out direction (the **minimum
  translation vector**); the overlap is the **penetration depth**.
- **Contact point.** The corners of each box that sit inside the other, averaged.
- **Box vs circle** (`boxCircle`, `collide.ts:107`): find the closest point on the box to the circle
  centre by clamping into the box's own axes; compare the distance to the radius.
- **Response**: `resolve()` (`step.ts:181`) is an **impulse-based** solver. In order:
  1. Positional correction: push the bodies apart by the depth (all on the car if the other is static,
     half each between two cars).
  2. Work out the relative velocity at the contact point, including spin: `v + ω × r`.
  3. If they are moving apart (`vn >= 0`) stop here.
  4. Compute impulse `j = -(1 + restitution) · vn / denom`, where `denom` adds the inverse masses and
     the inverse inertias scaled by the lever arm. Apply `j` along the normal to velocity and **spin**
     (`w -= j · lever · invInertia`). A hit away from the centre of mass gives the car a twist; a
     hit through the centre does not.
  5. **Coulomb friction** along the surface, clamped to `friction · j`.
  6. If the closing speed is above `IMPACT.bump`, emit a `bump` event (and an `alarm` event if it hit
     a parked car above `IMPACT.alarm`). A 0.3 s cooldown stops one crash from firing ten sounds.
- `crashes()` (`step.ts:260`) runs two passes over all collisions, so a car pushed into a wall by
  another car gets corrected.

Terms to look up: **rigid body**, **moment of inertia**, **restitution**, **impulse**, **coefficient
of friction**.

## 6. The parking rule

`parking()` (`step.ts:301`) runs after the crashes every step:

1. Get the car's four corners (`corners()` in `collide.ts`); count those inside the bay rectangle
   grown by `PARK.slack` (`insideBox`). `inBay` is that count over 4.
2. `aligned()` compares heading and bay heading, and accepts both the nose-in and the
   reversed-in orientation (`d` or `π - d` under 22°).
3. If `inBay === 1`, aligned, and slow, a `park` timer climbs to 1 over `PARK.hold` seconds.
   Right place but still moving: it drains at half rate. Wrong place: it resets.
4. At 1 the car is marked parked, the round is `done`, and a `parked` event is emitted.

Every threshold is in `PARK` in `constants.ts`.

## 7. Bots: the aisle graph, pure pursuit and Stanley

`src/game/sim/bot.ts` and `nav.ts`. A bot gets only the state and returns an `Input`, exactly like a player.

### The aisle graph (`nav.ts`)

The old bots had the snake of three aisles written into the code, so they could only drive one layout. Now
`buildLot()` describes the roads as data and `nav.ts` turns that into a graph (a *directed graph*, the same
structure as a road network in a satnav):

- A **node** is a junction or the end of an aisle (`M_C` is where the main road meets the avenue, `CW_A`
  where the west service road meets aisle WA, and so on): 24 of them. Nodes sit on the centre lines.
- An **aisle** is a chain of nodes with a width and a flag `oneWay`. A one-way aisle lists its nodes in the
  direction of flow, so it only gets edges that go that way. A two-way aisle gets an edge each way.
- An **edge** (`GEdge`) is one direction of travel along one stretch of aisle. Its endpoints (`a`, `b`) are
  the *lane* the car drives in: the centre line for a one-way aisle, shifted to the right of the direction of
  travel (2 m on an 8 m aisle) for a two-way one, so cars going opposite ways pass each other.

**Shortest path.** `pathFrom()` is Dijkstra's algorithm run over *edges* rather than nodes. That small change
lets it forbid a U-turn at a junction (the next edge may not be the reverse of the one you arrived by):
on a node graph a car that reached the end of a road could turn round on the spot, which no car can.
It skips edges flagged `avoid` (the entry and exit lanes, the dead-end pocket) so bots do not wander in.
The graph is small, so a plain O(E²) selection loop is plenty (the test run builds hundreds of routes).

**Where a car is.** `locate()` snaps a position to the nearest lane (penalising lanes pointing the wrong way
by 7 m), so a bot that has been shoved sideways still knows which edge to continue on.

**Routes.** `routeToDock`, `routeToSweep` and `routeToNode` build a list of points: the rest of the car's own
lane, the lanes of the shortest path, then the target. `roundCorners()` cleans that list: it removes repeated
points, points in the middle of a straight run, and *spikes* (a point where the route goes up to the centre
line of a junction and straight back, which lane offsets cause), then replaces each corner with a short
curve (a quadratic Bezier through the corner point). A pure pursuit follower gets a path a car can really drive.

### Searching: sweeps

A **sweep** is one pass along an aisle in one direction (`Sweep`). `planSweeps()` orders them for one driver:
the first is chosen by seat (EA, WA, AVE or EB), then greedily the nearest unvisited one by path length,
plus a bias of up to 40 m taken from a hash of seed and seat, in two passes (every aisle once; then
the two-way ones back the other way). When a bot reaches the end of its route and has not spotted the bay it
asks for the next sweep (`sweepRoute`). The route ends are therefore always on a legal lane.

### Going to a bay

Every bay carries `approach[]` (see `Approach` in `lot.ts`): where on a lane (`edge`, `s` metres along it) its own
path starts (`dock`) and the points from there (`tail`), which always end with *square to the bay, mouth, stop*.
`spotRoute` costs each approach with `routeToDock` and takes the quickest. The tail comes from the type:

- Angled: a1 = 3.6 m out from the mouth along the bay axis, dock 8 m upstream of that. Only in the direction the bay is angled for.
- 90 degree: the car drives the far side of the aisle (0.72 of the aisle width from the mouth, at most 6.2 m) then
  turns through a quarter circle of radius R = 4.4 m onto the bay's axis. The circle is tangent to both lines, so
  with the approach line at distance `dm` from the mouth the turn ends `dm - R` before the mouth.
  (A car's tightest turn, wheelbase / tan(max steer) = 2.62 / tan(0.66), is 3.4 m; 4.4 leaves room for pure
  pursuit to lag.)
- Parallel and pocket bays: none.

The lot keeps an approach only if its dock edge is reachable from the entry lanes without a U-turn
(`reachableFrom`) and if a car box inflated by 0.22 m each side and 0.15 m each end, swept along the path every
0.7 m (`sweepClear`), touches no solid and no parked car, and if the bay itself holds a car with the
neighbours in place. `Lot.candidates` are the bays that keep at least one approach (plus the rules in DESIGN.md).
That one test replaces the old hand-written "not the first bays of a row" rule and works on any layout.

### Following a route

- **Pure pursuit** (`botInput`): pick a **look-ahead point** a few metres ahead on the path (further when faster),
  compute the circle arc that would take the car to it, and turn the wheel for that curvature:
  `curvature = 2 · lateral / distance²`, then `steer = -atan(curvature · wheelbase)`.
- **Stanley steering** for the last stretch, where precision matters: steer to remove the heading error, plus
  `atan(k · crossTrackError / (speed + softening))` to pull the front axle back onto the bay's centre line. It
  comes from the Stanford self-driving car "Stanley". Pure pursuit is smooth but cuts corners; Stanley sticks to a line.
- **Speed**: the lesser of the cruise speed, a **curve limit** and the speed from which the car can stop at the end
  at a fixed deceleration (`v = sqrt(2 · a · distance)`). The curve limit (`curveSpeed`) samples the route
  every 2 m ahead, takes the sharpest bend as a curvature κ (radians per metre) and allows `v = sqrt(3.4 / κ)`,
  at least 2.4 m/s: lateral acceleration `v² · κ` is held under what the tyres give.
- **Traffic**: `carAhead` looks for a car in the lane ahead, widening by 0.16 m per metre of distance (to catch
  one merging in) and ignoring cars coming the other way. A separate rule gives way to a moving car on the right that a
  straight-line prediction puts within 3.4 m of ours in the next 2.6 s (priority to the right); cars that are
  stopped or moving along our own line are not that rule's business.
- **The gate**: while `state.gate.open < 0.8`, a bot in the entry lanes limits its speed so it can stop 0.5 m
  short of the arm.
- **Recovery**: a small state machine (`brain.stuck`, `brain.reverse`, `brain.recover`) that backs
  out of jams and re-approaches a crooked or overshot bay.
- **Politeness**: if another car is already mostly in the bay, the bot holds upstream and honks.
  Ties go to the lower seat number so two half-in cars never wait on each other forever.

## 8. Rendering

### Cars

`src/game/render/car.ts` builds cars from geometry, no model files. The body is a **side profile**
(a list of `[z, y]` points) extruded across the width with rounded edges; the glass is a second
outline that leans inward toward the roof (**tumblehome**). `STYLES` holds three body styles.

### Instanced rendering of parked cars

About 240 parked cars would be more than 100 meshes and several hundred **draw calls**. A draw
call is one request from the CPU to the GPU; too many makes the frame slow. `buildParked()`
(`car.ts:465`) instead uses **`THREE.InstancedMesh`**: one geometry per material per body style,
drawn many times with a different transform each (`setMatrixAt`) and a different colour
(`setColorAt`, for the paint). Around 130 cars cost a handful of draw calls. Racers are separate
meshes, because their wheels spin and steer individually.

The lot (`world.ts`) does the same for trees and shrubs (`InstancedMesh` plus per-instance sway for
wind), and merges static geometry with `mergeGeometries`.

### Shadow box texel snapping

The sun is a directional light with a **shadow map**, a 2048 x 2048 depth image rendered from the
sun, covering a 68 m square (`game.ts:330` to `342`). It follows the car so the shadow stays sharp
around you. If the box moves by arbitrary amounts, a shadow edge falls on different texels each
frame and the edge **shimmers**. `game.ts:762` rounds the box centre to a whole number of texels:
`texel = 68 / 2048`, `fx = Math.round(x / texel) * texel`. The shadow image then moves in whole-pixel
steps and the edges stay still. Related: `shadow.bias` and `normalBias` fight **shadow acne**
(speckles on lit surfaces).

### Camera

Chase, high and top modes (`cycleCamera`, `game.ts`). The camera position eases toward a target with
`1 - exp(-k · dt)`-style smoothing, and shakes by a "trauma" value that rises on your crashes and
decays.

## 9. Sound: Web Audio synthesis

`src/game/sfx.ts`. No audio files. The **Web Audio API** is a graph: sources (oscillators, noise)
connect through filters and gains to the output.

- **Engine** (`sfx.ts:141`): two slightly detuned sawtooth oscillators plus a triangle one octave
  down, mixed, run through a **WaveShaper** (soft clipping gives the growl) and a **low-pass
  filter**. RPM sets the pitch: `f = rpm / 60 · 2` (a four-cylinder fires twice per revolution);
  load and RPM open the filter. All parameters change with `setTargetAtTime`, which glides instead
  of jumping and avoids clicks.
- **Tyre squeal**: white noise through a **band-pass filter**; the gain follows `slip`.
- **Crash** (`bump`, `sfx.ts:219`): a burst of noise, brighter for metal on metal, plus a low thump.
- **Alarm** (`sfx.ts:266`): a two-tone siren from an oscillator whose frequency sweeps.
- **Horn**: two square tones (415 and 523 Hz, a major third) through a low-pass filter.
- **3D position**: each sound passes through a **PannerNode** (`sfx.ts:74`), and `listener()` moves
  with the camera, so a horn on the left is heard on the left and far crashes are quiet.
- A **DynamicsCompressor** on the master bus stops four engines plus a crash from clipping.
- Browsers keep audio locked until a user gesture, so `unlock()` is called from input handlers.
- Volumes (master, engine, effects) are saved in `localStorage` under `parking-lot:volume`.

## 10. Where to change what

| I want to... | Edit |
| --- | --- |
| Make the car faster, grippier, drifty-er | `DRIVE` in `src/game/sim/constants.ts` |
| Make parking easier or stricter | `PARK` in `constants.ts` |
| Change crash bounce or alarm threshold | `IMPACT` in `constants.ts` |
| Change round length or countdown | `RACE` in `constants.ts` |
| Change the lot layout, bay sizes | `LAYOUT`, `BAY`, `PERP`, `PARALLEL` and the zone code in `buildLot()` in `lot.ts` |
| Add or change a road | the node list and `A(...)` aisle calls in `buildLot()`; the graph, routes and bots follow |
| Change how the gate behaves | `gates`, `GZ` in `lot.ts`; the lift in `step()`, the arms in `crashes()`, drawing in `scenery.ts` |
| Change what share of bays are corrals, cones, SUVs or vans | the `r < 0.035`, `r < 0.06` and `variant` lines in `buildLot()` |
| Make bots braver or smarter | `createBrain()` (cruise speed) and `botInput()` in `bot.ts` |
| Add a sound | `src/game/sfx.ts`, call it from the `tick()` event loop in `game.ts` |
| Add a car body style | `STYLES` in `car.ts` |

Run `npm run test:run` after any change in `src/game/sim/`.
