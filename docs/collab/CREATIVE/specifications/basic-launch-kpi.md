# Basic Launch KPI plan: Parking Lot on CrazyGames

Owner: Creative Director. Date: 2026-11-22. Status: ready for engineering.

Targets for Full Launch: average playtime 10+ min, D1 retention 10-15 %, conversion (opened, then played 1+ min) 80 %+,
thumbnail CTR in the top 20 % of Driving/Parking.

## What I saw (headless play of dist/portal, 1280x720 and 844x390 touch)

Verified in the build:

- **Cold start to first input: about 14 s and 4 inputs.** Loader (about 3 s, good) > menu > PLAY > Game modes > Campaign >
  map > PLAY > intro card and lead-in > GO. "PLAY · LEVEL 1" on the menu does not start level 1. It opens two more screens.
- **Level 1 punishes the first mistake hard.** In 12 scripted attempts at level 1, 9 ended "YOU HIT A PARKED CAR /
  DISQUALIFIED / TOO HARD" before 17 s on the clock. The contacts were at 6 to 16 km/h while turning in. A solo level fails at
  a closing speed of 0.8 m/s (2.9 km/h, `GRAZE_SPEED`). A new player turning into a 90-degree bay with a keyboard will
  touch a car, and level 1 ends at once.
- **The fail copy reads as a verdict on the game.** The banner says "TOO HARD" in pink on a pink band, and the line
  "DISQUALIFIED" overlaps it (see FEEDBACK F-001). The result title is "Too hard a hit". A new player reads "too hard" and
  closes the tab.
- **The bay is easy to overshoot.** At full throttle (32 km/h) "FOUND IT!" fires when the car is already level with the
  bay, and the toast sits over the bay.
- **Phone HUD overlap (844x390):** the objective pill covers the clock, and the restart button covers the speed readout
  (FEEDBACK F-002).
- **What is good, keep it:** the loader with its painted lot, the menu over the live lot, the warm palette and dense
  colourful rows, the "GET ALL OF IT INSIDE / Precision" coaching panel, star bars that drain, the map with chapters,
  progress saved through the SDK data module.
- **Nothing brings a player back tomorrow.** There is no daily content, no streak and no "come back" moment. Progress is
  saved, but a player who left after a fail has no reason to return.
- **The rivals are missing from the default path.** The cover, the tagline ("Four company cars. One free space.") and the
  Race mode all sell the race for one bay. PLAY leads into eight solo levels with no rivals.

Cover (`docs/portal/covers/A-three-quarter-*`): the scene is busy and has no single focal point. The free bay is a thin
green outline, half hidden by a sign post and a tree. The red car next to it is not clearly "ours" or "racing". The title
is set in a blocky face that is not the in-game logo (P badge plus italic PARKING LOT with chevrons), so the cover and the
game look like two different products. At small card size (see `docs/portal/covers-small-card-check.png`), a viewer sees
"cars in a car park" and no goal.

Preview video (`parking-lot-landscape.mp4`, 14 s): GO, then 13 s of driving straight up an aisle at 20 km/h. There is no
rival, no near miss, no bay and no park. The key-hint bar and the minimap fill the lower frame. The hook never appears.

From general knowledge of the category (not verified against live CrazyGames data): the top parking and driving games on
the portal start play in one click. Their thumbnails show one big hero car and one obvious goal in strong colour, and their
early levels forgive mistakes, so the first minute ends in a success. We will not copy any of their art or modes. We take
the principles: one click to play, a win in the first minute, one focal point on the thumbnail.

## The changes, ranked

The top 3 together fit in 1-2 days.

### 1. One tap to drive (Conversion) — Effort S — do first

Impact (estimate): the largest single lever on conversion. It removes about 8 s and 3 inputs before the first GO, and every
extra screen loses players.

Spec:
- **First session** (no campaign record saved): main menu PLAY starts level 1 directly. Skip Game modes and the map. The
  label stays `PLAY` with the small `LEVEL 1` beside it, as now.
- **Returning player:** PLAY starts the next level they have not finished (the lowest-numbered open level with 0 stars, or
  else the next locked-but-open level). The label is `PLAY` plus `LEVEL n`, which is the same component.
- Add one menu item under PLAY: `MODES`. It opens the current Game modes screen (Campaign map, Race, Endless). Order:
  PLAY, MODES, SETTINGS, HOW TO PLAY, CREDITS. Keyboard: Enter on PLAY goes straight in.
- After a successful park, the result card's primary button is `Next level` (Enter). It starts level n+1 directly, not
  the map. `Map` stays as the secondary button.
- Level 1 only: skip the 2 s camera lead-in (start the 3-2-1 at once). The intro card stays visible through the countdown,
  as now.
- Acceptance: from page open, one Enter or tap after the menu appears gives a car under control in 5 s or less (3 s
  countdown plus the card fade). Measure it with the headless script.
- Must not change: the loader, the menu scene, the Game modes screen itself, and the level order.

### 2. Forgiving first chapter and honest fail copy (Conversion, Playtime) — Effort S

Impact (estimate): most first-time players finish level 1 instead of failing in 15 s. The first minute ends in "PARKED!"
and stars instead of a red card. This is the second lever on conversion and the first on playtime.

Spec (per-level `failSpeed`, already in `campaign.ts`):
- Levels 1-4: **no contact fails the level.** Every touch counts as a graze. It costs the clean star, plays the bump
  sound and sparks, and shows the toast `SCRAPE! −★` (gold text, existing toast style) for 1.2 s. Repeat touches within
  0.5 s count once (existing `grazeAt` logic).
- Levels 5-8: fail at a closing speed of 2.0 m/s (7 km/h). Below that, a touch is a graze.
- Level 9 onward and all races: unchanged (0.8 m/s solo, `CONTACT.minSpeed` in races). "Touch nothing" stays the rule
  of the race.
- Fail copy, solo levels: in-round banner line 1 `YOU HIT A PARKED CAR` (unchanged), line 2 `TOO FAST: <speed> KM/H`
  (white on the band, replacing "DISQUALIFIED" and "TOO HARD" in pink). Result card title `Bumped it`, and under the stars
  one line: `Under 3 km/h is a scrape. Ease in slowly.` (for levels 5-8 use `Under 7 km/h`). Remove the word "hard" from
  every fail string the player sees (`game.ts:1428`, `LevelUI.tsx:250`).
- Move the `FOUND IT!` toast from the screen centre to 28 % from the top, so it never sits over the bay.
- Acceptance: in level 1, driving into the side of a parked car at 10 km/h leaves you in the round with 2 stars still
  possible. A park after that gives the result card with 2 stars.
- Must not change: race rules, pedestrian rules (a shopper hit still fails everywhere), star rules for par and time.

### 3. New cover and a preview video that ends in the park (CTR) — Effort M (half a day, tooling exists)

Impact (estimate): CTR is mostly the thumbnail. Today it has no focal point, so this is the cheapest CTR gain available.

Cover spec (render with `scripts/portal-covers.mjs` and `Game.setShot()`, all three sizes 1920x1080, 800x1200, 800x800):
- Camera: high three-quarter, pitch about 55 degrees, looking down an aisle. Use the menu's look (`cold-6000` menu frame):
  dense, colourful rows read as "full lot" at any size.
- Focal point: **one empty bay** at about 52 % across and 58 % down (landscape). Its paint is the in-game reveal yellow
  `#FFD23F` at full strength, with the painted P and the beam on. It is the brightest thing in the frame.
- Hero: the player's red car, 1.0 m from the bay mouth and turned 35 degrees into it, with skid marks behind. It takes
  about 18 % of the frame width (landscape) or 30 % (portrait).
- Rivals: three cars (blue, teal, orange) aimed at the same bay from left, top and right, 6 to 10 m away. Each has the
  orange `!` over its roof (the in-game "spotted it" marker). The story: four cars, one space.
- Everything else stays in frame for density: parked cars in every other bay, no trees or sign posts between the camera
  and the bay. Move the shot or hide that prop.
- Title: the **in-game logo lockup** (P badge plus italic PARKING LOT with chevrons), top-left, logo height 24 % of the
  frame height in landscape, top-centre in portrait and square. No other text (CrazyGames rule).
- Vignette: darken the outer 20 % of the frame by about 25 %, so the centre pops.
- Acceptance: scale each cover to 240 px wide. At that size the yellow bay, the red car and the logo are each still
  identifiable. Make a new `covers-small-card-check.png` for review.

Preview video spec (landscape 1920x1080 and portrait, 15 s, 30 fps, no audio needed):
- Settings for the capture: on-screen key hints OFF (Accessibility), minimap hidden if a flag exists, parking-view camera.
  Use Race "First race" or an Endless stage 1 seed where a rival spots the bay. Speed up dull stretches 1.5x in the edit;
  never show a stop longer than 0.5 s.
- 0.0-1.5 s: start lights and `GO`, barriers lift, four cars launch.
- 1.5-7 s: down the aisles. Include one near miss (`CLOSE ONE!`) or `A RIVAL SPOTTED IT!` with the orange `!`.
- 7-11 s: the bay appears and lights yellow (`FOUND IT!`). The swing in, the precision bar filling.
- 11-13.5 s: `PARKED!` at 0.3x slow motion with the white flash. A rival arrives a moment late.
- 13.5-15 s: the result card with three stars landing.
- The video must end on the success. Cut the current 14 s straight-aisle take completely.

### 4. Daily Lot (D1 retention) — Effort M (2-3 days)

Impact (estimate): the only feature here aimed straight at D1. A dated puzzle that changes at midnight is the standard
reason to come back tomorrow, and it fits the game: "today's one free space".

Spec:
- One round a day, seeded from the UTC date (`yyyymmdd`) so everyone gets the same lot, bay and rivals. Use the Endless
  generator at stage 1 or 2 (alternate by day), 2 rivals at race pace 0.6.
- Main menu: a second-row item under PLAY: `DAILY LOT` with the day's state on the right: `New` / `★★☆ 0:41` / and the
  streak `3 days` beside the existing small gold P badge (no emoji).
- Result card in Daily: stars, your time, your best today, streak count, and the line `A new lot opens in 14 h 20 m`
  (live countdown to UTC midnight). Retries are unlimited. Best result kept.
- Streak: +1 for each calendar day with at least one park. A missed day resets it to 1 on the next play. Save it through the
  platform storage (SDK data), next to the campaign save.
- Acceptance: two browsers on the same UTC day get the same bay. On the next UTC day the item shows `New`.

### 5. Momentum on the result card (Playtime) — Effort S

Impact (estimate): keeps players in the loop between levels, where most sessions end.

Spec:
- After a park in the campaign: a 4 s ring on the `Next level` button fills, then the next level starts by itself. Any
  input other than Enter or tap on that button cancels the auto-advance (the card stays). Do not auto-advance after the
  last level of a chapter. Show the chapter-complete card instead.
- Under the buttons, one progress line when a chapter is close: `3 more ★ opens Busy Saturday` (from the chapter `gate`).
- Retry after a fail: no intro card and no lead-in. Straight to 3-2-1 (it already starts after the lead-in; drop the
  card too).

### 6. Bring the rivals into the first five minutes (Playtime) — Effort S

Impact (estimate): variety at minute 3-5, where a solo-only start gets repetitive, and it delivers what the cover promises.

Spec:
- After a park in campaign level 3, the result card shows a third button `Race a rival` (secondary style). It opens Race 1
  (First race, one slow rival). After Race 1, its `Next` returns to campaign level 4.
- On the map, show Race 1 as a node beside level 3 (the same data, no new level).
- Must not change: the races' unlock order and rules.

### 7. Phone HUD and banner fixes (Conversion on mobile) — Effort S

See FEEDBACK F-001 and F-002. The phone is a large share of portal traffic, and overlapping HUD text in the first 10 s
makes the game look broken.

### 8. Copy on the menu (CTR to play, small) — Effort S

The tagline under the logo, `Four company cars. One free space. Touch nothing.`, says "company", which means nothing on
the portal (the neutral build has no office theme). Replace it with `One free space. Four cars want it. Touch nothing.`
Keep the size, colour and position.

## Not recommended now

New power-ups (oil, smoke, throwables), online play, or new maps. None of them moves a Basic Launch KPI within days, and
power-ups would break "careful driving" as the identity.

## Limitations

- I played only through headless Chromium with scripted keys. Frame timing made replays diverge, and I never completed a
  park in level 1 myself. The 9-of-12 fail rate comes from a scripted, clumsy driver, not real players. I could not play
  past level 1 or reach minute 10.
- I had no CrazyGames analytics. Impact figures are directional estimates, not measured. Check each change against the
  developer dashboard after it ships (updates auto-approve during Basic Launch).
- The comparison with top CrazyGames parking games is general knowledge. I did not browse the portal in this session.
