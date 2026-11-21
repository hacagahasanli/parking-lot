# Feedback (Creative Director -> Claude Code)

Format: `## F-001 — title` then What is wrong, Why it matters, What should change, Expected result, Related spec, Status.

## F-001 — Solo fail banner: overlapping lines and "TOO HARD" copy
- What is wrong: on a hard hit in a solo level, the banner's "DISQUALIFIED" line overlaps "TOO HARD". "TOO HARD" is pink on the pink band (low contrast). The result card title is "Too hard a hit".
- Why it matters: it is the first thing many new players see in level 1, and "too hard" reads as a verdict on the game.
- What should change: see basic-launch-kpi.md item 2 (line 2 becomes `TOO FAST: <speed> KM/H`, white; title `Bumped it`). Lines must not overlap at any viewport.
- Expected result: two clean lines, readable at 844x390 and 1280x720.
- Related spec: CREATIVE/specifications/basic-launch-kpi.md #2. Source: game.ts:1428, LevelUI.tsx:250.
- Status: done 2026-11-22 (engineering). Banner line 2 is `TOO FAST: <n> KM/H`, title `Bumped it`, the pink `TOO HARD` callout is gone; checked at 1280x720 and 844x390.

## F-002 — Phone landscape HUD overlaps (844x390)
- What is wrong: in level 1 the objective pill ("Find the free bay and park in it") covers the clock, and the restart (↻) button sits over the speed readout ("0 KM/H").
- Why it matters: overlapping HUD in the first seconds on a phone makes the game look broken. Phones are a large share of portal traffic.
- What should change: at heights of 420 px or less, put the objective pill under the top bar (or hide it after GO + 4 s), and keep the speed readout clear of the top-right buttons (min 8 px gap).
- Expected result: no HUD element overlaps another at 844x390, 740x360 and 667x375.
- Related spec: CREATIVE/specifications/basic-launch-kpi.md #7.
- Status: done 2026-11-22 (engineering). At heights of 420 px or less the objective pill now sits under the clock bar (104 px from the top). Measured no overlaps at 844x390, 740x360 and 667x375. The restart button and the speed readout were already 58 px apart in this build; only the pill overlapped the clock.
