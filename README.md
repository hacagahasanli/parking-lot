<div align="center">

# Parking Lot

### Four company cars. One free space. No insurance.

*Ram first, file the incident report later.*

A game by **[Merge Conflict](https://merge-conflict-drab.vercel.app)**, the studio where coworkers settle their conflicts.

### [▶ Play (coming: parking-lot.vercel.app)](https://parking-lot.vercel.app) · [Studio](https://merge-conflict-drab.vercel.app) · [Floor 42](https://floor-42.vercel.app) · [Last Commit Standing](https://last-commit-standing.vercel.app)

</div>

A racing game in the browser, set in a supermarket car park at the end of a long day. Four cars
line up at the entrance. The lot is full except for one bay, and everyone wants it. First car
parked and still wins. Shunting a rival out of the way is allowed; parking crooked is not.

Status: the play link is **coming**; it will be deployed on Vercel at `parking-lot.vercel.app`.
Today you play offline, you against 3 bots. Online play is next.

## How a round goes

1. **Countdown**: three beeps, handbrakes held, engines revving.
2. **Race**: one bay in the lot is empty. An arrow at the screen edge points to it when it is off screen.
3. **Park**: get all four corners of your car inside the bay, within 22° of its angle (nose in or
   reversed in), and stop for 0.9 s. The HUD shows how far through the 0.9 s you are.
4. **Win**: the first car parked wins. Everyone else is ranked by how close they got.
   Hit a parked car hard enough and its alarm goes off for 9 s. Everyone hears it.

## Controls

| Key | Does |
| --- | --- |
| W / Up | Accelerate |
| S / Down | Brake; once stopped, reverse |
| A D / Left Right | Steer |
| Space | Handbrake (slides the tail) |
| H | Horn |
| C | Cycle camera: chase, high, top |
| Esc | Pause |

Touch controls are wired into the game loop (`setTouch` in `src/game/render/game.ts`).

## Run it

```bash
npm install
npm run dev        # http://localhost:3200
npm run test:run   # simulation tests: lot, driving, crashes, parking rules, bots
npm run type-check
```

Open `http://localhost:3200/play` to drive; the home page shows four bots racing.

Design: [docs/DESIGN.md](docs/DESIGN.md). How the code works: [docs/TECHNICAL.md](docs/TECHNICAL.md).
Assets: [ASSETS.md](ASSETS.md).
Studio repo: [github.com/hacagahasanli/merge-conflict](https://github.com/hacagahasanli/merge-conflict).
