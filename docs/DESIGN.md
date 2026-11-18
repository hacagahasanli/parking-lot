# Parking Lot: design

A Merge Conflict game. **A four-car race to the one free bay in a full supermarket car park
(rounds of under a minute or so).** First to park, straight and still, wins.

Everything here is original: names, art, sounds, rules. Racing and parking games are a common
genre; nothing specific to any one of them is copied. Numbers below come from
`src/game/sim/constants.ts` and `src/game/sim/lot.ts`.

## The flow

```
Home (four bots race behind the title) ──▶ /play
        │
        ▼
Countdown 3 s: cars on the apron, handbrake held, steering and revving allowed
        │  GO
        ▼
Race: one bay is empty. Drive there, crash into whoever is in the way, park.
        │  first car parked and still (or 240 s pass)
        ▼
Result: winner and your place ──▶ next round (new free bay)
```

## Rules

| Rule | Value | Source |
| --- | --- | --- |
| Cars | 4 (you plus 3 bots offline) | `RoundOptions.bots` in `step.ts` |
| Countdown | 3 s | `RACE.countdown` |
| Free bay | 1 per round, picked from the bays that hold a parked car; that car is removed | `createRound`, `Lot.candidates` |
| Round limit | 240 s, then no winner | `RACE.maxTime` |
| Parked: position | all 4 corners of the car inside the bay rectangle plus 0.22 m of slack | `PARK.slack` |
| Parked: angle | within 22° of the bay's angle, nose in or reversed in | `PARK.maxAngle`, `aligned()` |
| Parked: stillness | speed under 0.45 m/s (and spin under 0.2 rad/s) for 0.9 s | `PARK.maxSpeed`, `PARK.hold` |
| Win | first car to complete the hold; the round ends at once | `parking()` in `step.ts` |

Details that matter in play:

- While position and angle are right but the car still moves, the hold timer drains at half speed
  instead of resetting; if position or angle breaks, it resets to zero.
- Standings: the winner first, everyone else by straight-line distance to the free bay.
- Candidate bays exclude the ones on the apron next to the start (the race must mean a drive)
  and the first bays at the upstream end of a row (no room to swing in at that angle).
- Crashing is part of the game, not a penalty. A bump over 1.2 m/s counts and makes a sound;
  hitting a parked car over 3 m/s sets off its alarm for 9 s.
- Before GO the cars hold the handbrake for you; after a car parks it is locked in place.

## The lot

A supermarket car park, late autumn afternoon. The store is to the north, the entrance road to the south.

```
        STORE (north)
  ───────────────────────────  fire lane (aisle, one-way west)
   // // // // // // // //     angled bays (60°)
  ═══ island: trees, lamps ═══
   // // // // // // // //
  ───────────────────────────  aisle (one-way east)
   .. rows 2 and 3, same idea, flow alternates ..
  ───────────────────────────  apron: 14 m wide, two-way
   [car] [car] [car] [car]     start line, all facing north
```

- Size: 88 x 71 m drivable area (x from -44 to 44, z from -42 to the store kerb at about 29).
- **Bays**: 2.7 x 5.4 m, angled 60° to the aisle. Three double rows; the two half rows of each
  double row share a planted island between them. More than 100 bays in total.
- **One-way aisles**: 8 m wide, flow alternates east, west, east, so the lot is a snake. Angled bays
  only work one way round, so the free bay is easiest to enter from its upstream side.
  End aisles at x = ±38.5 join the rows.
- **Islands**: 1.8 m wide strips with lamp posts every 16.5 m and round planted ends with a tree.
  The collider is narrower than the kerb, so a car parked deep in a bay may overhang it, as in life.
- **Apron**: the wide two-way strip at the entrance where the cars line up side by side, facing north.
- **Bay contents**: most hold a parked car (three body styles, twelve paints); about 4 % hold a
  trolley corral and 3 % are coned off. Neither can be the target.
- The same seed gives the same lot in every browser (`rng` in `lot.ts`), which online play will need.

## How the car feels

Tuned to feel like a real compact sedan in a car park, not a kart (`DRIVE` in `constants.ts`).

- 4.68 x 1.82 m, 1350 kg, automatic gearbox: S at a standstill selects reverse, W selects drive.
- Top speed 19 m/s (about 68 km/h); reverse is capped at 6.2 m/s. About 50 km/h in 3 to 6 s.
- The wheel takes about half a second from centre to full lock, returns by itself when released,
  and locks less the faster you go (0.6 rad at walking pace, 0.16 rad at 20 m/s).
- Grip is limited: ask for a corner sharper than the tyres allow and the front washes out
  (understeer) instead of the car turning.
- Handbrake (Space): the rear lets go, the car rotates more than the wheels ask for and slides.
  It also slows the car (4.5 m/s²). Good for tight swings into a bay; bad at speed.
- Crashes have weight: cars shove each other, spin when hit off-centre, and bounce a little
  (restitution 0.25). Parked cars, kerbs and posts do not move.
- Camera: chase by default, `C` for high and top-down. Screen shake on your own crashes.

## Bots

Three bots, each with its own cruise speed (8.2 to 11.2 m/s) and a small personal wobble so they
do not drive on rails (`src/game/sim/bot.ts`).

1. Plan a route through the aisles that respects the one-way flow and ends on the bay's centre line.
2. Follow it, slowing for bends and for the stop.
3. In the last stretch, line up on the bay's axis and stop.
4. If someone is already in the bay, wait upstream and lean on the horn instead of ramming.
5. If stuck, back out with the wheel turned the other way; if crooked, overshot or in the way, drive
   out into the aisle and line up again.

Bots do not deliberately attack you. They are meant to be beatable by someone who drives well.

## Ideas for later

Not built. The owner's list, with what each would touch.

- **Bombs / throwables**: throw something to stop a rival. Needs projectiles and an explosion
  impulse in `step.ts`, and pick-ups on the lot.
- **Sliding / oil**: oil patches that cut grip (`DRIVE.grip`) for cars on them.
- **Blur / smoke power-up**: a cloud that hides the free bay or the screen from rivals.
- **Multi-storey car park inside a building**: ramps, pillars, tight turns, several floors. The
  sim is 2D, so floors would be separate lots joined by ramp zones.
- **More maps**: an underground garage, a rooftop, a festival field. A map is a `buildLot()`
  variant; the rules stay the same.
- **Online play**: the sim is pure functions over plain objects with a fixed 60 Hz step, so a host
  can run it and send inputs. Next on the list; there is no networking code today.
