/**
 * The radio: short, funny lines (from `flavour.ts`, in the round's flavour) the bots say over the round, a few per event kind. They are
 * triggered by what happened (spotted the bay, got bumped, got honked at, lost the spot, hit a
 * shopper) and rate-limited so it stays readable: one voice at a time, a pause between lines, and
 * a longer pause for the same driver.
 *
 * Part of the sim (no browser calls, seeded picks) so online play can show the same chatter.
 */
import { COPY } from './flavour';
import { levelName } from './levels';

import type { ChatLine, GameEvent, GameState } from './types';

type Kind = ChatLine['kind'];


/** Quiet time (race seconds) between any two lines, and before the same driver speaks again. */
const GAP = 1.7;
const GAP_SAME = 6;
const KEEP = 6;

const pick = (state: GameState, kind: Kind, who: number, about = ''): string => {
  const pool = COPY[state.flavour ?? 'studio'].radio[kind];
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
    } else if (e.type === 'crash') {
      // The one who is out says it of themselves (a bot), or another bot says it about them.
      if (state.cars[e.car]?.bot) say(state, e.car, 'crashSelf', '', true);
      else {
        const who = otherBot(state, e.car);
        if (who >= 0) say(state, who, 'crash', '', true);
      }
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
