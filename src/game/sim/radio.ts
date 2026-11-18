/**
 * The radio: short, funny lines the bots say over the round, a few per event kind. They are
 * triggered by what happened (spotted the bay, got bumped, got honked at, lost the spot, hit a
 * shopper) and rate-limited so it stays readable: one voice at a time, a pause between lines, and
 * a longer pause for the same driver.
 *
 * Part of the sim (no browser calls, seeded picks) so online play can show the same chatter.
 */
import { levelName } from './levels';

import type { ChatLine, GameEvent, GameState } from './types';

type Kind = ChatLine['kind'];

const LINES: Record<Kind, string[]> = {
  spot: [
    "That one's mine, I saw it in code review.",
    'Found the bay. No merge conflicts.',
    'Spot spotted. Shipping it now.',
    'Empty bay ahead. Deploying.',
    'Bay located. Opening a pull request.',
  ],
  bumped: ['Who approved that pull request?', "That's a breaking change!", 'You just broke the build.', 'Revert! Revert!', "Careful, that's a production car."],
  honked: ['Honk all you like, I own this lane.', 'Your horn has no unit tests.', 'Tailgating is not a code review.', "I'm already on the critical path."],
  honker: ['Move it, stand-up starts in two minutes.', 'Merge or get out of the lane.', 'Rebasing right behind you.'],
  lost: ["Closing the ticket as won't fix.", 'That spot was in my sprint backlog.', "Fine. I'll park in the next release.", 'Spot taken. Moving it to the backlog.'],
  win: ['Merged to main.', 'Shipped. No rollback needed.', 'LGTM. Engine off.'],
  incident: ['Not in the sprint plan!', 'Shopper down. Filing the incident report.', 'Sorry, sorry! Watch your step!', 'Please log that as a minor bug.'],
  leave: ["Someone's pulling out. Hot desk!", 'A bay just opened up. Race condition!', 'That car is deploying out of its bay.'],
  leaveUp: ['A car is pulling out on {name}!', 'Brake lights on {name}: a bay is opening up.', '{name}: someone is leaving. Race condition on the ramp!', 'Engine just started up on {name}. Anyone close?'],
  recover: ['{name} is reversing into prod.', '{name} is rolling back the release.', '{name} just force-pushed in reverse.'],
};

/** Quiet time (race seconds) between any two lines, and before the same driver speaks again. */
const GAP = 1.7;
const GAP_SAME = 6;
const KEEP = 6;

const pick = (state: GameState, kind: Kind, who: number, about = ''): string => {
  const pool = LINES[kind];
  const n = state.chatN++;
  const last = [...state.chat].reverse().find((l) => l.kind === kind)?.text;
  let i = (state.seed + n * 7 + who * 3) % pool.length;
  let text = pool[i].replace('{name}', about);
  if (text === last) {
    i = (i + 1) % pool.length;
    text = pool[i].replace('{name}', about);
  }
  return text;
};

const say = (state: GameState, who: number, kind: Kind, about = '', force = false) => {
  const car = state.cars[who];
  if (!car?.bot) return;
  const now = state.t;
  if (!force && (now - state.chatAny < GAP || now - (state.chatLast[who] ?? -99) < GAP_SAME)) return;
  state.chatAny = now;
  state.chatLast[who] = now;
  state.chat.push({ id: state.chatN, t: now, who, name: car.name, color: car.color, text: pick(state, kind, who, about), kind });
  if (state.chat.length > KEEP) state.chat.splice(0, state.chat.length - KEEP);
};

/** The other bots (not `except`), in seat order, starting from a seeded place so it is not always the same one. */
const otherBot = (state: GameState, except: number) => {
  const bots = state.cars.filter((c) => c.bot && c.id !== except);
  return bots.length ? bots[(state.seed + state.chatN) % bots.length].id : -1;
};

/** Turns what happened this step into radio lines. Call once per step with the sim's events plus the bots' own. */
export const radio = (state: GameState, events: GameEvent[]) => {
  for (const e of events) {
    if (e.type === 'spot') say(state, e.car, 'spot');
    else if (e.type === 'bump' && e.speed > 3) {
      const hit = [e.car, e.other].filter((id) => id >= 0 && id < state.cars.length && state.cars[id].bot);
      if (hit.length) say(state, hit[(state.seed + state.chatN) % hit.length], 'bumped');
    } else if (e.type === 'honk') {
      const target = e.at;
      if (target >= 0 && target < state.cars.length && state.cars[target].bot) say(state, target, 'honked');
      else say(state, e.car, 'honker');
    } else if (e.type === 'recover') {
      const who = otherBot(state, e.car);
      if (who >= 0) say(state, who, 'recover', state.cars[e.car].name);
    } else if (e.type === 'incident') {
      const who = state.cars[e.car]?.bot ? e.car : otherBot(state, e.car);
      if (who >= 0) say(state, who, 'incident');
    } else if (e.type === 'leave') {
      const who = otherBot(state, -1);
      // Upstairs or underground the radio says which deck; outdoors it is the usual joke.
      if (who >= 0) say(state, who, e.garage ? 'leaveUp' : 'leave', e.garage ? levelName(e.lvl) : '');
    } else if (e.type === 'end') {
      if (e.winner !== null && state.cars[e.winner]?.bot) say(state, e.winner, 'win', '', true);
      const losers = state.cars.filter((c) => c.bot && c.id !== e.winner);
      if (losers.length) say(state, losers[(state.seed + state.chatN) % losers.length].id, 'lost', '', true);
    }
  }
};
