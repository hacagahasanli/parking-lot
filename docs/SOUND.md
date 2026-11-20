# Sound budget

All sound is synthesised in `src/game/sfx.ts` (no files). The limits live in `src/game/audioBudget.ts`, and
`src/game/audioBudget.test.ts` fails if a sound skips them. Keep this page, that table and the code in step.

## The graph

```
engines ─> engine trim (scene, duck) ─> Engine slider ─┐
world one-shots ─> world bus (menu: x0.35) ─┐          │
race cues + gearbox + menu ui ─> cue bus ────┼─> Effects slider ─┼─> master (Master slider, mutes) ─> compressor ─> limiter ─> out
bed + birds ─> ambience bus (ducked) ────────┘                   │
```

- Compressor: threshold -18 dB, ratio 5. Limiter after it: threshold -3 dB, ratio 20, 1 ms attack. The compressor is
  a safety net, not the plan: the levels below should already fit.
- Mutes (player, portal, ad) all zero the master. The sliders are the player's; never write to them from code.

## Target levels (default sliders, measured at the output)

| What | Loudest 50 ms | Notes |
| --- | --- | --- |
| Ambience bed | about -60 dBFS | two low-pass poles at 170 Hz, slow breathing. Never a hiss, never above -50 |
| Engines (your car, cruising) | -40 to -30 | the bed of the race |
| Gear shift | about -31 | one soft clack and a thunk |
| Refused shift (grind) | about -35 | short and dull |
| Countdown pip / GO | -26 / -23 | race only |
| Last-ten-seconds tick | -35 to -32 | race only |
| Small touch (bump, 2 m/s) | about -36 | |
| Crash (bump, 9 m/s) | about -26 | ducks the bed and the engines |
| Win jingle / FOUND IT | about -19 | the loudest things in the game, on purpose |
| Lose / rival sting | -22 / -25 | |
| Peak, anything | under -6 dBFS | nothing clips |

Rule of thumb: feedback for something the player did on purpose (shift, menu move) sits 5+ dB under the result of it
(crash, park, win). Mistakes are told once, softly.

## Which events have sound, and how often they may play

| Sound | Trigger | Cooldown | Voices | Where |
| --- | --- | --- | --- | --- |
| shift | your manual shift | 150 ms | 1 | race |
| grind | a refused shift | 700 ms | 1 | race |
| bump | any contact (bots too) | 70 ms | 3 | everywhere (menu: -9 dB) |
| alarm | a hard hit on a parked car | - | 1, 5 s long | race only |
| shout | a car touches a shopper | 1.2 s | 1 | everywhere |
| toot | a parked car pulls out | 1.5 s | 1 | everywhere |
| whoosh | near miss | 2 s | 1 | race |
| beep | countdown 3-2-1, GO | 300 ms | 1 | race only |
| tick | last 10 s of the clock | 400 ms | 1 | race |
| found / sting | bay found / a rival saw it | 1.5 s / 3 s | 1 | race |
| win / lose | round over (or you are out) | 1.5 s | 1 | race |
| ui / click | menu focus, pick, back | 45 ms | 2 | menus |
| engine | one per car, continuous | - | 4 | race only (none on the menu) |
| bed + birds | continuous / every 9-23 s | - | - | always, very low |

Behind the menu (and on the home page) the bots keep playing rounds; their countdown, jingles and alarms are silent and
their bumps and toots play 9 dB down. Paused: engines drop 12 dB.

## Adding a sound

1. Ask whether an existing sound or a visual already tells the player this. Most events do not need a sound.
2. Add a row to `BUDGET` in `audioBudget.ts` (cooldown, voices, length) and one here.
3. Gate it: the first line of the function is `if (!may('name')) return;` (world sounds) or `cue('name')` (race-only).
4. Route it to the right bus (`worldBus`, `cueBus`, `ambBus`; engines to `engineTrim`). Never straight to `master`.
5. Vary it (`vary()` on pitch/filter and gain) so ten in a row do not sound the same.
6. Measure it against the table above. Dev builds expose `window.__game.sfx.meter()` (plays and drops per sound,
   voices now, peak of the last ~40 ms).
7. A loop or bed needs a reason, a low-pass, a level at or under -55 dBFS, and must stop when its screen goes.
