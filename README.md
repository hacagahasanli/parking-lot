<div align="center">

# Parking Lot

### Four company cars. One free space. No insurance.

*Touch nothing. Park first.*

A game by **[Nalbaki Games](https://nalbakigames.com)**.

### [▶ Play](https://parkinglot.nalbakigames.com) · [Studio](https://nalbakigames.com) · [Floor 42](https://floor42.nalbakigames.com) · [Last Commit Standing](https://lastcommit.nalbakigames.com)

</div>

A careful-driving race in the browser, set in a supermarket car park at the end of a long day. Four cars
line up at the entrance. The lot is full except for one bay, and everyone wants it. First car
parked and still wins. Touching another car, a post or a shopper puts you out of the round, and parking crooked does not count.

Play it at [parkinglot.nalbakigames.com](https://parkinglot.nalbakigames.com).
Today you play offline, you against 3 bots. Online play is next.

## How a round goes

1. **Countdown**: three beeps, handbrakes held, engines revving.
2. **Race**: one bay in the lot is empty. An arrow at the screen edge points to it when it is off screen.
3. **Park**: get all four corners of your car inside the bay, within 22° of its angle (nose in or
   reversed in), and stop for 0.9 s. The HUD shows how far through the 0.9 s you are.
4. **Win**: the first car parked wins. Everyone else is ranked by how close they got.
   Hit a parked car hard enough and its alarm goes off for 9 s. Everyone hears it.

## Controls

Every key can be changed in **Settings › Controls** (click a key, press the new one; a key another action uses is swapped).
These are the defaults.

| Key | Gamepad | Does |
| --- | --- | --- |
| W / Up | RT | Gas (manual: in R, drives backwards) |
| S / Down | LT | Brake; automatic: once stopped, reverse |
| A D / Left Right | Left stick | Steer |
| Space | A | Handbrake (slides the tail) |
| E / Q | RB / LB | Manual gearbox: shift up / down |
| H | X | Horn |
| C | Y | Switch camera: parking view (default) or chase |
| P (Esc on our site) | Start | Pause: Resume · Settings · Quit to menu |

**Transmission** (Settings › Controls): *Automatic* (default) or *Manual*. Manual gives you R, N and 1–4: each gear pulls
hardest mid-band and hits the rev limiter at its top (the shift light flashes just before), too high a gear lugs and pulls
weakly, R only engages with the car stopped, and the brake only brakes. 4th tops out at the same speed as the automatic,
so a good shifter is quicker off the line, never faster flat out. The HUD shows the gear, a rev bar and the shift light;
phones get + / − buttons beside the pedals. Bots always drive the automatic.

On phones: ◀ ▶ steer, GAS / BRAKE / HAND on the right (size, opacity and a left-handed swap in Settings › Controls).

The portal build opens on a **main menu** over the live lot (Play, Stage select, Settings, How to play, Credits). Settings
has five tabs (Controls, Camera, Graphics, Audio, Accessibility), saves at once and applies live.

## Run it

```bash
npm install
npm run dev        # http://localhost:3200
npm run test:run   # simulation tests: lot, driving, crashes, parking rules, bots
npm run type-check
```

Open `http://localhost:3200/play` to drive; the home page shows four bots racing.

Support: Parking Lot is free. If you enjoyed it, you can [☕ support the studio](https://nalbakigames.com/support).

Design: [docs/DESIGN.md](docs/DESIGN.md). How the code works: [docs/TECHNICAL.md](docs/TECHNICAL.md).
Assets: [ASSETS.md](ASSETS.md).
Studio repo: [github.com/hacagahasanli/nalbaki-games](https://github.com/hacagahasanli/nalbaki-games).
