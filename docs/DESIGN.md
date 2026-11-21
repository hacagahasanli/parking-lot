# Parking Lot: design

A Nalbaki Games game. **A four-car race to the one free bay on a full supermarket site: an open
lot and a four-storey car park (rounds of one to three minutes), played in six stages: you start in the
open lot, and each stage you win opens one more floor of the car park.** Nobody is told exactly where the bay
is: you find it by driving the aisles, the ramps and the decks and looking, at the same time as the bots
do. The only clue is the FREE SPACES board, and it gives away a little more every few seconds, to
everybody. First to park, straight and still, wins. Hit a shopper and you are out.

Everything here is original: names, art, sounds, rules. Racing and parking games are a common
genre; nothing specific to any one of them is copied. Numbers below come from
`src/game/sim/constants.ts` and `src/game/sim/lot.ts`.

## The flow

```
Home (four bots race behind the title) ──▶ /play, always at stage 1
        │
        ▼
Intro card + countdown 5 s: the stage's name ("P0 — Ground floor"), one sentence on what is new, six progress
        │  dots; a 2 s lead-in (the camera comes down onto your car; gas skips it, a retry starts after it), then start
        │  lights and a big 3-2-1-GO in the middle of the screen with pips (`Countdown.tsx`); four cars queued behind the closed entry barriers (the little
        │  FREE SPACES board is on the booth), handbrake held, steering and revving allowed
        │  GO: the barriers lift (0.9 s)
        ▼
Race: one bay is empty and unmarked, somewhere on the lot or on one of four decks. Search, read the board, spot it, wait your turn, park. Touch nothing: not a car, not a post, not a shopper.
        │  first car parked and still (or 240 s pass, or you hit a car, a post or a pedestrian: out for you)
        ▼
Result: winner and your place; the free bay is revealed
        │  you parked first: "Next stage →" (Enter) opens the following stage; Retry; Home
        │  you lost or were disqualified: Retry (Enter); Home
        ▼
next round (new free bay)
```

## Stages

The whole site from the first minute was too much to take in, so a visit climbs (`src/game/sim/stages.ts`). A stage is the
same lot with some ways shut: the **car park's door** (stage 1) and the **foot of each ramp** are closed with a low red-and-white
barrier and cones, which are solid; the aisles behind a barrier are closed to every bot and every route; shoppers are only on
floors that are open; and the free bay is picked from the floor that has just opened. Floors opened before stay open (you drive
through them, they are where the board's flicker puts its decoy, and the car that pulls out may be parked on any open floor).

| Stage | Name | Open | The free bay is |
| --- | --- | --- | --- |
| 1 | The open lot | the open lot (car park door shut) | in the open lot |
| 2 | P0 — Ground floor | + P0 (both ramps shut) | on P0 |
| 3 | P1 — First floor | + P1 (the ramp up opens) | on P1 |
| 4 | P2 — The roof | + P2 | on P2 |
| 5 | P-1 — Underground | + P-1 (the ramp down opens) | on P-1 |
| 6 | The whole site | everything | anywhere (as rounds used to be) |

The order is the order of difficulty: the ground floor is the easy way in, the first floor and the open roof need the ramps (the roof
needs two), and the dark underground goes last because the light is the hardest to read and its ramp is the one that goes away
from the sky. Every stage starts at the entry gate, as before: stages 2 to 5 mean driving across the lot to the car park door first
(about ten seconds), which keeps one start line and one fair queue.

- **Progress** is in memory only (`Progress` in `stages.ts`, held by `Game`): a page load starts again at stage 1 with only stage 1
  unlocked. Parking first in a stage unlocks the next; replaying an earlier stage never locks anything again. Losing changes
  nothing (Retry). Stage chips (1 to 6: current, open, or locked) are on the result card and in the pause menu; a locked chip does
  nothing; picking an open one starts that stage.
- **Information**: the intro card before each countdown (stage number, name, what is new, dots for progress), a STAGE chip beside the
  clock in the HUD, your live place beside it (the place you would take by parking now; the standings list the parked cars in the
  order they parked, never who is nearest the bay: `liveStandings`), the three stars of a campaign level with bars that drain
  (limit, par, clean: `StarTrack`), and the "how to play" on the home page. In stages 2 to 5 the board already says IN THE GARAGE from the start (the card told you), and from 32 s flickers between the free
  bay's deck and one *open* deck (stage 2 has only one deck, so there is no flicker).
- **A bay the bots could never see** (a van beside it on a one-way aisle hides it from every point a car may look from) is never the free bay in a stage (`spottable`
  in `visibility.ts`): it is a bay for people.
- The home page and the tests that do not name a stage still play the whole site with the bay anywhere.

## Rules

| Rule | Value | Source |
| --- | --- | --- |
| Cars | 4 (you plus 3 bots offline) | `RoundOptions.bots` in `step.ts` |
| Countdown | 5 s in every round, solo levels too: a 2 s lead-in (skippable), then 3-2-1 (`RACE.count`); the level clock starts at GO | `RACE.countdown`, `skipIntro` |
| Free bay | 1 per round. First a zone (open lot 40 %, each of the four decks 15 %), then a candidate bay in it: angled and 90 degree bays a bot can really drive into (160 outdoors, 52 on the decks), never within 38 m of a start; that car is removed; **not marked in any way** | `pickTarget`, `Lot.candidates` |
| Levels | a car, shopper or bay is on one level (P-1, P0, P1, P2, or the open lot, which is P0); things on different levels never touch, even straight over each other; a ramp joins two levels and your height follows your position on it. To win, you must be on the free bay's level | `levels.ts`, `step.ts` |
| The board | "FREE SPACES: 1" from the start; from 12 s the part of the site (open lot or garage; from the start in stages 2 to 5); from 32 s, if the bay is in the garage and more than one deck is open, two decks flicker, one right and one a decoy (the first one flashed is no clue); when a car pulls out the count goes to 2. Shown on a small panel on the ticket booth, on the wall by the garage door and in the HUD, to the bots too | `hint.ts` |
| Second free bay | one parked car (an ordinary car, in the open lot or on a deck) pulls out at 12 to 28 s and drives off to the exit gate; once it has driven clear, the bay it left is free too and counts for the win. When it is on a deck the radio says which one | `Leaver` in `step.ts` |
| Pedestrians | 30 shoppers (22 outdoors, 8 on the decks); contact with a car on their level moving over 1 m/s disqualifies that driver for the round | `PED`, `ped.ts` |
| Round limit | 75 s in stages 1-2, 90 s in stage 3, 120 s in stage 4, 110 s in stages 5-6, then no winner | `ROUND_CAP` in `stages.ts` (`RACE.maxTime`, 120 s, without a stage) |
| Parked: position | all 4 corners of the car inside the bay rectangle plus 0.22 m of slack | `PARK.slack` |
| Parked: angle | within 22° of the bay's angle, nose in or reversed in | `PARK.maxAngle`, `aligned()` |
| Parked: stillness | speed under 0.45 m/s (and spin under 0.2 rad/s) for 0.9 s | `PARK.maxSpeed`, `PARK.hold` |
| Win | first car to complete the hold (in either free bay); the round ends at once | `parking()` in `step.ts` |
| Contact is out | any real contact between your car and another car (a racer, a parked car, the one pulling out, the van, the truck) or a hard fixed thing disqualifies the driver at fault. **Real** means a closing speed of 0.5 m/s or more at the contact point (a feather touch is nobody's fault). **At fault** means your own velocity at the contact drives into the other body at more than 0.25 m/s: the car that drives into the contact is out, both if both do, and a car that is hit while standing still is not at fault (so being rammed from behind never costs you the round). **Out**: posts, lamps, columns, cones, trolley corrals, ticket machines, the barrier arms and the stage barriers, the van and the truck. **Fine** (a scrape, a bump sound, nothing else): kerbs, planters and hedge strips, walls, ramp sides. Same flow as the pedestrian rule: the car stops where it is with its hazards on, the banner reads YOU HIT A CAR (and the name of the car), YOU HIT A PARKED CAR or YOU HIT A POST over DISQUALIFIED, the result card says what you hit, and the race goes on for the others | `CONTACT`, `resolve()` in `step.ts` |
| Disqualified | a car (you or a bot) that hits a pedestrian at over 1 m/s stops where it is with its hazards on and cannot win; the race goes on for the others. If it was you, you get the result card with the reason; if every car is out, the round ends | `stepPeds()` in `ped.ts` |

## Game modes

Play opens **Game modes** (`Modes.tsx`): three big tiles over the live lot, for keyboard (arrows, Enter, 1 to 3, Esc), mouse,
touch and gamepad, and a Back button.

- **Campaign**: thirty solo parking levels on the map (`CAMPAIGN` in `campaign.ts`), four chapters opened by stars. No rivals.
- **Race**: who parks first. Six races against one to three rivals (`RACES`), each opened by winning the one before; the
  same stars (park first, par, touch nothing). Winning race 1 opens Endless.
- **Endless**: the original race below, six stages, a random bay each round.

Races used to sit inside the campaign (levels 8, 16, 24, 26, 27 and 30). A version 1 save is migrated on load: every record is
kept, and every campaign level the old rules had open stays open (`unlocked`), though the campaign's star total no longer counts
race stars (`v1Open`, tested).

### Finding the bay: calm guidance

The bay is visible on the ground when you are near, not from far away (`guidance.ts`). No light column, no edge arrow, no minimap
ring. A solo level's outline fades in from 16 m and is full by 10 m, on the same deck only. If the bay is not found (you have been
within 13 m of it) by `hintDelay` (12 s in chapter 1, 15, 19, then 24 s in chapter 4; races 12 s rising 2 s a race; endless 12 s),
an arrow shows the way for 3 s and the outline pulses, then again every 10 s. **H** (rebindable; the horn moved to B) or the hint
button beside the star bars fires a pulse at once: in a level the first use costs one star (never the finishing star), shown as
−1★ beside the star bars and as a row on the result card. Endless has the automatic pulse only (its own ad hint stays).

### The campaign's curve

Level 1's bay is forty metres down the aisle you start in; level 2 is round a corner; then the far side of the lot, then
other decks. Coned-off bays look like spaces from a distance (decoys) from level 8 on; vans hide gaps, cones narrow aisles and
shoppers multiply. The tests check that decoys, obstacles and hint delays rise chapter by chapter, that level 1's bay is out of
sight from the start, and that a driver who knows the way parks every level inside its limit. A solo clock starts at GO, so every
solo par and limit is judged with 0.4 s on top (`GO_GRACE`).

Details that matter in play:

- While position and angle are right but the car still moves, the hold timer drains at half speed
  instead of resetting; if position or angle breaks, it resets to zero.
- Standings during the round never say how close anyone is: they list seats and bumps (parked cars
  first, disqualified cars marked OUT). Final places after the round: the winner, then by distance
  to the free bay, with disqualified cars last.
- Nothing shows the bay while the round is on: no beam, no floating P, no green outline or fill, no
  minimap ring, no distance numbers, no "you are close" meter until some of your car is inside the lines. Its yellow
  paint lights up only within about 15 m (`reveal.ts`). If you have not found it 12 s after GO, an arrow shows the way
  for 3 s (over the bay, or at the screen edge in its direction), and again every 10 s until you find it (`guidance.ts`).
  After the round it is revealed for a few seconds (outline, beam, P, minimap dot).
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
- Contact is out (see the rules table): the cars still have weight and bump, a bump over 1.2 m/s makes a sound and
  sparks, and hitting a parked car over 3 m/s sets off its alarm for 9 s, but the driver at fault is out of the round.
  Feather touches under 0.5 m/s and kerbs, planters and walls are free.
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
  car parked deep in a bay may overhang it, as in life. Signs, ticket machines, chargers, lamps, posts and columns stand on kerbs,
  islands and pavements beside the road, never in a lane or an aisle (a test checks every one against every aisle corridor).
- The car park (above) is east of the lot and joined to it; the open lot's own size and layout are as described here.
- **Look**: a late-afternoon golden light (neutral tone mapping, a warm low sun, a deep-blue sky), dark tarmac with white and
  yellow paint that stands out, saturated foliage and lawns, shop fronts in gold and brick red with colour bands, a car paint
  palette of eleven real colours (red, blue, orange, teal, yellow, purple, raspberry, navy, lime and only white, silver
  and black as neutrals), coloured buildings across the road, and a minimap in the same colours.
- The same seed gives the same lot in every browser (`rng` in `lot.ts`), which online play will need.

## The car park

A multi-storey car park joined to the east side of the open lot by a two-way road (`GATE`, from the side road CE at
the middle aisle, through a gap in the east wall). It makes the site 1.6 times as big and gives the round a second
and third dimension: where to look, and which way up.

```
 plan (north up, the open lot is to the left)             levels, west to east
                                                           P2  roof, open sky, parapet and rail
  west     rows of bays (8 per row)    cross     ramps       P1  open sides under the roof
  connector  N row | Z2 aisle | 2 rows | Z1 aisle | S row  connector  RAMP UP 2 (P1 to P2) above
  (W)                    one-way ring                      P0  ground floor, the way in
                                                           P-1 underground
```

- **Four decks, identical in plan**, 36 m deep: a one-way **ring** (anticlockwise, like a real car park) of two 8 m aisles
  (Z2 north, Z1 south), the west connector (W) and the cross connector (X), a single row of bays along each outer wall and a
  double row between the aisles: 32 bays a deck, 128 in all, plus the columns (every third bay, standing between bays).
  Three **two-way ramps** of 26 m (13.6 % grade): P0 down to P-1 along the south strip, P0 up to P1 and P1 up to P2 stacked
  along the north strip, and a connector plaza at the east end where a ramp meets a deck. Everything that is not the ring is
  two-way, so you meet oncoming cars on the ramps and in the plaza.
- **You come in on P0** (the road from the lot crosses the east pavement and goes through a gap in the wall; a small free-spaces
  board is on the wall beside it). Going up or down you take a ramp from the end of an aisle.
- **Look of each deck**: concrete floor, walls and ceiling (small flat strip lights flush with the ceiling, 3.1 m clear under a deck), a painted
  colour per level (P-1 blue, P0 orange, P1 green, P2 yellow) on a band along the walls, the columns, the ramp caps, the
  ramp ends and a big number on the floor of the west connector, and the way painted on the floor (UP before the cross connector, DOWN on it, EXIT before the way out, arrows on the one-way ring), small plates on the outer walls above the bays (the level; EXIT by the way out), and
  a steel crash rail on the parapets of the open decks.
- **Light**: outdoors it is the sun and sky. Inside, the sky light is turned down (more on P-1: 100 %, P0 75 %, P1 55 %,
  open roof 0 %) and a warm lamp follows your car (cold blue underground), so the decks read as lit by their own strip lamps.
- **Nothing in the way**: no sign, board or gantry hangs over or stands in an aisle, a ramp, the roof deck or the entry lanes; they came
  between the chase camera and the road. Wayfinding is paint on the floor, small plates on the walls and the HUD. (A test keeps every
  sign, post and pole out of every aisle corridor, and no overhead plate exists.)
- **Camera**: the chase camera stays under the ceiling (0.7 m below it, clear of the lights) and is pulled in towards the car if a column, wall or ramp side is
  between them; the high and overhead cameras hide the decks above you so you can see in.
- **Minimap**: one tab per open level (P-1 to P2; none while only the open lot is open), a dot on the tab you are on. It follows you, or the tab you pick until you
  change level yourself. The tab shows that level's aisles, bays, walls and columns, the shoppers on it, and the cars on it (and
  those on a ramp that touches it); never a car on another level and never the free bay until the round is over, when
  the map jumps to the level where it was. The HUD also shows your level beside the speed.

### The board and what keeps it exciting

"One space left" is a lot of site to search, so the board gives a little away, to everyone at once (`hint.ts`): the part of
the site at 12 s, two flickering decks (one a decoy) at 32 s, and the count going to 2 when a car pulls out (the radio says "A car
is pulling out on P1!"). The bots read it too: when it names the garage they move the passes in it to the front of
their search (each driver picks one of the two decks first, so they do not arrive in a convoy), and a hint for the open lot only
moves the drivers who were headed for the garage. The result is a race with a shape: a quiet first ten seconds, a scramble up
the ramps when the board flickers, and then two or three cars arriving at the same bay at once (and the contest rules from the open
lot decide it). A bay on the roof, one underground and one outdoors are not equally far from the gate, but each is equally likely
(`pickTarget`), the board tells everyone the same thing, and a deck that is a decoy costs the bots time as well.

## How the car feels

Tuned to feel like a real compact sedan in a car park, not a kart (`DRIVE` in `constants.ts`).

- 4.45 x 1.78 m (wheelbase 2.62 m), 1350 kg, automatic gearbox: S at a standstill selects reverse, W selects drive.
- A car park, not a race track: top speed 10.5 m/s (about 38 km/h), reverse capped at 4 m/s (14 km/h), acceleration 2.8 m/s2 at
  a standstill fading to nothing at the top (about 30 km/h in 5 to 6 s). It was 19 m/s and 5.2 m/s2 before contact became a disqualification.
- The wheel keeps its quick response (about a third of a second from centre to full lock), returns by itself when released,
  and locks less the faster you go (0.66 rad at walking pace, 0.3 rad at top speed; the fade is scaled to the new top speed).
- Grip is limited: ask for a corner sharper than the tyres allow and the front washes out
  (understeer) instead of the car turning.
- Handbrake (Space): the rear lets go, the car rotates more than the wheels ask for and slides.
  It also slows the car (3.5 m/s²). Tamer than before (less spin, more grip): good for tight swings into a bay.
- Crashes have weight: cars shove each other (for the one who was not at fault), spin when hit off-centre, and bounce a little
  (restitution 0.25). Parked cars, kerbs and posts do not move.
- Camera: chase by default, `C` for high and top-down. Screen shake on your own crashes.

## Bots

Three bots, each with its own cruise speed (5.4 to 7.4 m/s, about 20 to 27 km/h), a small personal wobble so they do
not drive on rails, and a start delay after GO (0.15, 0.7, 1.9 and 2.6 s by seat: they leave the gate one pair at a
time instead of all meeting in the first junction) (`src/game/sim/bot.ts`, `nav.ts`).

**They search too.** A bot does not know where the bay is (`brain.target` is -1 until it sees it). The aisles of the car park
(every deck's ring, the ramps and the way in) are part of the same graph, so a search is just more passes: each deck is
one lap of the ring, and a pass up or down a ramp is how a bot changes deck. A bot sees a bay only on its own level
(a bay straight overhead is behind a slab) and only cars on its own level are traffic to it.

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
4. Their turn: when someone is closer to the bay and right in front, the bot stops 4.5 m behind them and waits. No shoving.
   It parks the moment the bay is clear. (Slower final approach too: 3 m/s from 16 m out, 2 m/s for the line-up.)
5. Careful driving, because contact is out. A bot keeps a gap to the car ahead (2 m plus half a second of speed) and never goes faster
   than it could stop in the room left; it looks 2 s ahead at where every other car will be and gives way to anything that would
   reach it within 1.25 s (a car on its right always goes first, so does a car standing in the way); two standing cars in each other's
   way: the lower seat goes first so nobody waits for ever; it looks along the arc it is driving (forwards, and backwards when
   backing out) for a parked car, post or column and stops short of it (`roomAhead`); and it only backs out when nobody is
   behind it (and gives up the backing after 2 s if someone is). It still honks at a car that holds it up. A shopper close
   in front stops it; one a little further off lets it creep at 0.6 m/s (touching one under 1 m/s is harmless), and a long wait
   earns a toot on the horn, which makes shoppers step aside. Bots rarely get disqualified: see `Bots` in `sim.test.ts` (under 3 %
   of bot seats across 36 rounds; 1 in 288 in the last 72-round run).
6. Shoppers: a bot slows and stops for anyone on foot in its path, beside it or behind it (it never
   reverses or pulls away over someone). Bots do not hit pedestrians in the test seeds.
7. The gate: a bot stops short of a barrier that is still down.

**Approaches.** Every bay has one or two *approaches*, computed when the lot is built, by type:

- Angled bay: one approach, in the direction it is angled for: the dock is 8 m upstream of the point 3.6 m in
  front of the mouth, then in along the bay's axis (as the old lot).
- 90 degree bay (two-way aisle): an approach each way along the aisle. Drive along the far side of the aisle, then a
  quarter circle of radius 4.4 m (the car's tightest turn is 3.4 m) onto the bay's axis, then in. On a deck the aisles are the
  one-way ring, so a bay has one approach, the way the ring flows. A deck bay whose swing in would start inside the corner before
  it (the first dock is less than 3 m along its aisle) is a bay for the player, never the free bay.
- Parallel bay and pocket bay: none. Bots skip them, and they are never the free bay.

The final line-up is the same Stanley controller for all of them.

In the stages the same bots work with the closed parts closed (`stages.test.ts`: 12 seeds in each of the six stages, all parked within 170 s; the roof, with two ramps to climb, is the slowest at about two minutes). A bot backing out of a jam stops if anyone is within 3.6 m of the car.

They do not attack you deliberately, but they will not wait for you either. In the 24 test seeds a bot parks
within 149 s (median about 76 s, quickest 53 s; the open lot takes about a minute, a deck up to two and a half).

## Pedestrians

30 shoppers (22 outdoors and two on each deck, one crossing the aisle and one walking along a row; `src/game/sim/ped.ts`), in the sim so a host and a guest see the same people. A shopper is on a floor: a car on another level neither scares nor hits them.

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

One parked car (an ordinary car, never the target) starts to leave its bay between 12 and 28 s, tooting its horn, and drives
off along the aisle graph to the exit gate (the barrier lifts for it) and is gone. Outdoors it is an angled bay and the car reverses
straight out. On a deck it was parked nose-out and drives straight out, round the ring, down the ramps and out through the gate
(slowly: it takes a minute), and the radio says which deck ("A car is pulling out on P1!"); the board's count goes to 2.
It tends to be in the other part of the site from the free bay (outdoors 70 % of the time when the free bay is on a deck, on a deck 70 % when it is outdoors), so a second chance appears somewhere you were not looking. Once it is
clear of its bay, that bay is a second free bay: anyone can win in it, and bots can spot it like the first. It is a
moving body while it leaves, so it can be hit (and hit), but it waits for a clear road first: it only starts to pull out or back out when no racer is within 7.9 m in its way, and stops if one comes. Shoppers keep clear of it.

## Radio

Short chatter lines from the bots (`src/game/sim/radio.ts`), shown as bubbles under the standings.
Triggered by: spotting the bay, getting bumped (over 3 m/s), being honked at (or a taunt when they
honk at you), backing out of a jam (another bot comments), hitting a shopper, a car being put out for contact (the one who was out says "My bad", or another bot comments), a car pulling out (and which deck),
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
- **A ramp barrier or a car stopped on a ramp**: closing the way to a deck for a few seconds (a boom barrier like the gate's, or a hazard-lights van). Not built; the bots would need the gate rule generalised.
- **Horn echo underground**: a longer reverb tail on the horn and bumps when the listener is on P-1 (`sfx.ts`). Not built.
- **More maps**: a festival field, a harbour. A map is a `buildLot()` variant; the rules stay the same.
- **Online play**: the sim is pure functions over plain objects with a fixed 60 Hz step, so a host
  can run it and send inputs. Next on the list; there is no networking code today.
