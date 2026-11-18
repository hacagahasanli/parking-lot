# Parking Lot: design

A Merge Conflict game. **A four-car race to the one free bay in a full supermarket car park
(rounds of a minute or two).** Nobody is told where the bay is: you find it by driving the aisles and
looking, at the same time as the bots do. First to park, straight and still, wins. Hit a shopper
and you are out.

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
Race: one bay is empty and unmarked. Search, spot it, shove for it, park. Watch the shoppers.
        │  first car parked and still (or 240 s pass, or you hit a pedestrian: out for you)
        ▼
Result: winner and your place; the free bay is revealed ──▶ next round (new free bay)
```

## Rules

| Rule | Value | Source |
| --- | --- | --- |
| Cars | 4 (you plus 3 bots offline) | `RoundOptions.bots` in `step.ts` |
| Countdown | 3 s | `RACE.countdown` |
| Free bay | 1 per round, random among the reachable bays (more than 60), never within 26 m of the start; that car is removed; **not marked in any way** | `createRound`, `Lot.candidates` |
| Second free bay | one parked car pulls out at 12 to 28 s; once it has driven clear, the bay it left is free too and counts for the win | `Leaver` in `step.ts` |
| Pedestrians | 16 shoppers; contact with a car moving over 1 m/s disqualifies that driver for the round | `PED`, `ped.ts` |
| Round limit | 240 s, then no winner | `RACE.maxTime` |
| Parked: position | all 4 corners of the car inside the bay rectangle plus 0.22 m of slack | `PARK.slack` |
| Parked: angle | within 22° of the bay's angle, nose in or reversed in | `PARK.maxAngle`, `aligned()` |
| Parked: stillness | speed under 0.45 m/s (and spin under 0.2 rad/s) for 0.9 s | `PARK.maxSpeed`, `PARK.hold` |
| Win | first car to complete the hold (in either free bay); the round ends at once | `parking()` in `step.ts` |
| Disqualified | a car (you or a bot) that hits a pedestrian at over 1 m/s stops where it is with its hazards on and cannot win; the race goes on for the others. If it was you, you get the result card with the reason; if every car is out, the round ends | `stepPeds()` in `ped.ts` |

Details that matter in play:

- While position and angle are right but the car still moves, the hold timer drains at half speed
  instead of resetting; if position or angle breaks, it resets to zero.
- Standings during the round never say how close anyone is: they list seats and bumps (parked cars
  first, disqualified cars marked OUT). Final places after the round: the winner, then by distance
  to the free bay, with disqualified cars last.
- Nothing shows the bay while the round is on: no beam, no floating P, no green outline or fill, no
  off-screen arrow, no minimap dot, no distance numbers, no "you are close" meter until some of your
  car is inside the lines. After the round it is revealed for a few seconds (outline, beam, P, minimap dot).
- Candidate bays exclude the ones facing the apron next to the start, anything within 26 m of the
  start (it must not be in sight at GO), and the first bays at the upstream end of a row (no room
  to swing in at that angle).
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
- **Bays**: 2.85 x 5.5 m, angled 60° to the aisle. Three double rows; the two half rows of each
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

- 4.45 x 1.78 m (wheelbase 2.62 m), 1350 kg, automatic gearbox: S at a standstill selects reverse, W selects drive.
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

Three bots, each with its own cruise speed (8.2 to 11.2 m/s), a small personal wobble so they do
not drive on rails, and a temper (`aggr`, 0 to 1) that decides how hard they shove, tailgate and
honk (`src/game/sim/bot.ts`).

**They search too.** A bot does not know where the bay is (`brain.target` is -1 until it sees it).

1. Search: drive the one-way aisles end to end (the snake). Each seat has its own order of aisles
   (1-2-3, 3-2-1, 2-3-1, 1-3-2), moving between aisles up the end columns or round the apron, so
   the bots are never all in the same place.
2. Spot: a bot sees a free bay when it is within 14 m, inside a 150° view cone ahead and in the same
   aisle (or across to the next one, within 7 m), for about a third of a second. It then plans the
   way to it; if it has already passed the turn-in point it finishes the aisle and comes round.
3. Go: follow the route through the aisles with the one-way flow, slowing for bends and the stop;
   in the last stretch line up on the bay's axis with Stanley steering and stop.
4. Contest: when someone is closer to the bay and right in front, the bot keeps pushing in and
   leans on the horn (shoving is part of the game). If it is still beaten after a short fight
   (2 to 4.2 s, different for each) it backs off, regroups at its own distance out and comes again.
5. Traffic: they tailgate (the keen ones stay on the bumper), honk at the car ahead, and when held
   up by a stopped car they back off and look for a way round. If stuck, back out with the wheel
   turned the other way; if crooked or overshot, drive out into the aisle and line up again.
6. Shoppers: a bot slows and stops for anyone on foot in its path, beside it or behind it (it never
   reverses or pulls away over someone). Bots do not hit pedestrians in the test seeds.

They do not attack you deliberately, but they will not wait for you either.

## Pedestrians

16 shoppers (`src/game/sim/ped.ts`), in the sim so a host and a guest see the same people.

- Each walks a fixed loop at about 1.3 m/s (a little different for each): out of the store door and
  across the fire lane to a car, across an aisle to the car on the other side and back, or along the
  fronts of the parked cars, lingering at the ends (loading the boot). About half push a trolley.
  They start spread along their loops, so the lot is already busy at GO.
- They watch for cars. One coming at them makes them stop; one that is close, or that they have
  seen (in front of them, or honking: the horn warns everyone) makes them step out of its path.
  They never walk into a moving car, so a hit is always the driver's fault. One who has their back
  to a fast car does not see it: that is how people get hit.
- A hit at over 1 m/s: the driver is disqualified (above), the shopper sits down, stays a moment,
  gets up and shakes a fist (no gore), with a shout and a long horn. A brush under 1 m/s does nothing.
- Drawn as low-poly people with swinging limbs and varied clothes, with trolleys and shadows, as a
  few instanced meshes (`render/peds.ts`).

## The car that pulls out

One parked car (never the target) starts to reverse out of its bay between 12 and 28 s, tooting its
horn, and drives off along the aisle. Once it is clear, its bay is a second free bay: anyone can win
in it, and bots can spot it like the first. It is a moving body while it leaves, so it shoves and
gets shoved, and shoppers keep clear of it.

## Radio

Short chatter lines from the bots (`src/game/sim/radio.ts`), shown as bubbles under the standings.
Triggered by: spotting the bay, getting bumped (over 3 m/s), being honked at (or a taunt when they
honk at you), backing out of a jam (another bot comments), hitting a shopper, a car pulling out,
and the end of the round (winner and a loser). Rate limits keep it readable: at least 1.7 s between
lines, 6 s before the same bot speaks again, at most three lines shown, each gone after 6.5 s. The
lines are original office jokes ("Revert! Revert!", "That one's mine, I saw it in code review.").
Real voice chat is for online play and is not built.

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
