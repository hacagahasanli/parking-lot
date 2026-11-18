# Assets

There are no third-party assets. No packs, no downloaded models, textures or sound files; `public/`
holds no game assets.

Everything is built in code in this repo:

| What | Where |
| --- | --- |
| The cars: sedan, crossover, hatchback (side profile extruded, glasshouse, wheels, lamps, plates) | `src/game/render/car.ts` |
| The car park: asphalt, painted bays and arrows, islands, kerbs, lamp posts, hedges | `src/game/render/world.ts` |
| The store and its neon sign, the trees and shrubs, the sky | `src/game/render/world.ts`, `Sky` from three.js examples |
| Trolley corrals, cones, tyre marks, smoke, sparks | `src/game/render/world.ts`, `src/game/render/game.ts` |
| Every sound: engines, tyre squeal, crashes, horns, car alarms, countdown beeps, car park hum | `src/game/sfx.ts`, synthesised with the Web Audio API |
| HUD, icon, manifest | `src/components`, `src/app` |

Libraries (not assets): three.js (MIT), Next.js, React, Tailwind CSS. The names on the scoreboard
(You, Staging, Hotfix, Legacy) and every rule are original.
