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
Countdown 3 s: four cars queued behind the closed entry barriers, handbrake held, steering and revving allowed
        │  GO: the barriers lift (0.9 s)
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
| Free bay | 1 per round, random among the candidate bays (160 in the shipped lot): angled and 90 degree bays a bot can really drive into, never within 38 m of a start; that car is removed; **not marked in any way** | `createRound`, `Lot.candidates` |
| Second free bay | one parked car (an ordinary car in an angled bay) pulls out at 12 to 28 s and drives off to the exit gate; once it has driven clear, the bay it left is free too and counts for the win | `Leaver` in `step.ts` |
| Pedestrians | 22 shoppers; contact with a car moving over 1 m/s disqualifies that driver for the round | `PED`, `ped.ts` |
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
- Candidate bays are only those a bot can really park in: the bay has an approach path (see
  "Approaches" below) that is reachable through the aisle graph without turning round at a
  junction and that a car, with 0.2 m to spare each side, can drive without touching anything,
  including the neighbouring parked cars. That drops the first bays at the upstream end of an
  angled row (no room to swing in), bays squeezed by a tall van, and so on. Also excluded: anything
  within 38 m of a start, and the reserved (disabled, parent) bays.
- **Parallel bays and the dead-end pocket are never the free bay.** Bots cannot back into a parallel
  bay or turn round in a dead end yet, and a free bay nobody but you could take would make the
  round unfair. You can still park in a parallel bay (the rule accepts any alignment within 22 degrees,
  nose or tail first) and use the pocket; they are there to be driven past and to hide cars.
- Crashing is part of the game, not a penalty. A bump over 1.2 m/s counts and makes a sound;
  hitting a parked car over 3 m/s sets off its alarm for 9 s.
- Before GO the cars hold the handbrake for you; after a car parks it is locked in place.

## The lot

A big-box retail park, late autumn afternoon: two shops (MERGE MART, and the smaller COMMIT COFFEE) to
the north, the street to the south. You are not on the lot at GO: you are in the queue at the entry
gate.

```
 north (shops)                        z = +52 kerb
  F    fire lane, two-way ─────────────────────────────  disabled / parent bays, door crossings
  yard  | EC  two-way, 90 degree rows  ........  | CE   two-way, side road
 truck  | EB  two-way (under the carport)        |
 pallets| EA  two-way  EV row  carport           |
  WC → angled rows ← one-way aisles WA, WB, WC   | AVE  two-way avenue (x = 0)
  CW    one-way service road, parallel bays      |
  M     main road, two-way ──────────────────────────────  rows of 90 degree bays both sides
  pocket    ENTRY (two lanes, booth, barriers)       EXIT (one lane, barrier)
 south (street)                       z = -52
```

- **Size**: 132 x 104 m (x from -66 to 66, z from -52 to the store kerb at 52): 13,728 m2, about 2.2 times
  the old 88 x 72 m (6,336 m2). 248 bays (old: about 110), of them 72 angled, 168 at 90 degrees and
  8 parallel.
- **Entry gate** (z = -38): two lanes 3.8 m wide with a booth on the island between them, a ticket
  machine at each lane and a boom barrier per lane. The four cars wait behind the arms, two deep
  (front row 1.4 m from the arm), side by side across the two lanes. The arms are solid colliders while
  they are down and lift in 0.9 s from GO; they stop being solid once they are more than halfway up.
  Bots wait for them. Nothing may drive through a closed barrier; the countdown is honest.
- **Exit gate**: a one-lane road at the east end of the main road (x = 58, z = -46) with a barrier and a
  pay station. Its arm is solid for the racers (the lot is a closed loop, nobody leaves) and lifts for
  the car that pulls out and drives to it.
- **Roads and aisles** (the graph, `lot.aisles`): the main road M, the avenue (x = 0), the east side road
  CE and the fire lane F are two-way (right-hand lane, dashed centre line); the west service road CW and the
  aisles WA, WB, WC are **one-way** (WA and WC run towards the avenue, WB away from it, CW runs north);
  EA, EB, EC are two-way. Zebra crossings at both store doors and on the avenue (5 in all), speed bumps
  (8) on the roads, stop lines where the entry lanes meet the main road and where the one-way aisles meet
  the avenue.
- **Zones**:
  - West block: three double rows of **angled** bays (60 degrees, 2.85 x 5.5 m) with planted islands, as the old lot.
  - East block: **90 degree** bays (2.7 x 5.1 m), two-way aisles, back to back with hedges between rows
    (hedges hide the row behind them from drivers and are solid).
  - **Solar carport** (3.5 m high, V-shaped roof of panels on a post at every second bay) over the two middle
    rows: the posts are colliders and the roof casts shadow.
  - **EV row**: 11 green bays with a charger between every pair, along the carport.
  - **Store-door bays**: wide bays (3.7 and 3.2 m) painted blue (disabled) and teal (parent) next to the door
    of MERGE MART. They hold cars but are never the free bay.
  - **Parallel bays** (2.4 x 6.4 m): eight along the west edge of the service road.
  - **Dead-end pocket**: a stub off the main road at x = -42 with five 90 degree bays each side.
  - **Delivery yard** (north-west, by the store): a box truck, a van, pallets, roll cages, hatching.
  - A **single row** of 90 degree bays on each side of the entry road facing the main road.
- **Sightlines**: about one parked car in eight is an SUV and one in nine a van (2.1 m tall); with the hedges
  and the truck they hide bays from bots (a bot cannot see a bay through a van) and from you.
- **Bay contents**: most bays hold a parked car (three car styles, an SUV, a van; twelve paints); about
  3 % hold a trolley corral and 3 % are coned off. Neither can be the target.
- **Islands and lawns**: planted strips with trees and lamp posts, lawns round the south and the edges. Posts, lamps,
  kerbs, hedges and the booth are colliders; the collider of an angled island is narrower than the kerb so a
  car parked deep in a bay may overhang it, as in life.
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
not drive on rails, a temper (`aggr`, 0 to 1) that decides how hard they shove, tailgate and
honk, and a start delay after GO (0.15, 0.7, 1.9 and 2.6 s by seat: they leave the gate one pair at a
time instead of all meeting in the first junction) (`src/game/sim/bot.ts`, `nav.ts`).

**They search too.** A bot does not know where the bay is (`brain.target` is -1 until it sees it).

1. Search: drive *sweeps* of the aisle graph, one pass along an aisle in one direction. A driver starts at a
   different aisle for each seat, then always goes next to the nearest pass it has not driven
   (plus a personal bias), covering every aisle once (a two-way aisle in one direction) before it drives the
   two-way ones back the other way. Four bots, four different orders, so they spread out.
2. Spot: a bot sees a free bay when it is within 14 m, inside a 150 degree view cone ahead, in the same
   aisle (or within 7 m, a peek across), for about a third of a second, and **nothing tall is in the way**
   (a van, the truck or a hedge on the straight line from the car to the bay hides it). It then plans the way to the bay: the
   quickest of the bay's approaches through the graph, which honours the one-way flow and never turns
   round at a junction (a car cannot do a U-turn in the width of a road). If it has already passed
   the turn-in point it finishes the aisle and comes round.
3. Go: follow the route with the one-way flow; the speed is limited by the sharpest bend ahead (lateral grip
   3.4 m/s2) and by the stop. In the last stretch line up on the bay's axis with Stanley steering and stop.
4. Contest: when someone is closer to the bay and right in front, the bot keeps pushing in and
   leans on the horn (shoving is part of the game). If it is still beaten after a short fight
   (2 to 4.2 s, different for each) it backs off, regroups at its own distance out and comes again.
5. Traffic: they tailgate (the keen ones stay on the bumper), honk at the car ahead, and when held
   up by a stopped car they back off and look for a way round. **Priority to the right**: a bot gives way to a moving
   car on its right that will reach the same spot (junctions, the gate). If stuck, back out with the wheel
   turned the other way; if crooked or overshot, drive out into the aisle and line up again.
6. Shoppers: a bot slows and stops for anyone on foot in its path, beside it or behind it (it never
   reverses or pulls away over someone). Bots do not hit pedestrians in the test seeds.
7. The gate: a bot stops short of a barrier that is still down.

**Approaches.** Every bay has one or two *approaches*, computed when the lot is built, by type:

- Angled bay: one approach, in the direction it is angled for: the dock is 8 m upstream of the point 3.6 m in
  front of the mouth, then in along the bay's axis (as the old lot).
- 90 degree bay (two-way aisle): an approach each way along the aisle. Drive along the far side of the aisle, then a
  quarter circle of radius 4.4 m (the car's tightest turn is 3.4 m) onto the bay's axis, then in.
- Parallel bay and pocket bay: none. Bots skip them, and they are never the free bay.

The final line-up is the same Stanley controller for all of them.

They do not attack you deliberately, but they will not wait for you either. In the 24 test seeds a bot
parks within 123 s (median about 70 s, quickest 47 s).

## Pedestrians

22 shoppers (`src/game/sim/ped.ts`), in the sim so a host and a guest see the same people.

- Each walks a fixed loop at about 1.3 m/s (a little different for each), made from the layout: out of a
  shop door and over the zebra crossing to a car in the row by the door, back and forth over each zebra crossing, across an aisle to the car
  on the other side and back, or along the fronts of the parked cars, lingering at the ends (loading the
  boot). About half push a trolley.
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

One parked car (an ordinary car in an angled bay, never the target) starts to reverse out of its bay between 12 and 28 s,
tooting its horn, and drives off along the aisle graph to the exit gate (the barrier lifts for it) and is gone. Once it is
clear of its bay, that bay is a second free bay: anyone can win in it, and bots can spot it like the first. It is a
moving body while it leaves, so it shoves and gets shoved, and shoppers keep clear of it.

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
- **Back-in manoeuvres for bots**: reversing into parallel bays and out of the dead-end pocket, which would let them be the free bay.
- **Multi-storey car park inside a building**: ramps, pillars, tight turns, several floors. The
  sim is 2D, so floors would be separate lots joined by ramp zones.
- **More maps**: an underground garage, a rooftop, a festival field. A map is a `buildLot()`
  variant; the rules stay the same.
- **Online play**: the sim is pure functions over plain objects with a fixed 60 Hz step, so a host
  can run it and send inputs. Next on the list; there is no networking code today.
