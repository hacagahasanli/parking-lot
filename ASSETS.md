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

Libraries (not assets): three.js (MIT), Next.js, React, Tailwind CSS, Vite (MIT, the portal build). The names on the
scoreboard (You, Staging, Hotfix, Legacy on the site; Coupe, Courier, Minivan on portals) and every rule are original.

Fonts: Bungee (David Jonathan Ross) and Chakra Petch (Cadson Demak), both SIL Open Font License 1.1, from Google Fonts. The
site loads them through `next/font`; the portal build ships the Latin subsets in `portal/public/fonts/` (same files that
`next/font` downloads), which the OFL allows.

Portal covers (`docs/portal/covers/`) are renders of this game's own scene with the title set in Bungee.
