/**
 * The words the game says, in two flavours:
 *  - 'studio': our own site, with the studio's office humour (drivers called Staging and Hotfix, radio lines about pull requests);
 *  - 'neutral': portal builds, for players who are not developers. Plain parking-lot humour, no code, git or office jokes.
 *
 * Pure data (no DOM): the sim picks radio lines and driver names from here, the renderer picks plates and shop signs.
 */
import type { ChatLine } from './types';

export type Flavour = 'studio' | 'neutral';

type Kind = ChatLine['kind'];

export interface FlavourCopy {
  /** Names of the three rival drivers (seats 1 to 3; seat 0 is always "You"). */
  rivals: [string, string, string];
  /** Number plates by seat (the 5th is the car that pulls out). */
  plates: string[];
  /** The two shop signs: the supermarket, then the café. */
  shops: [string, string];
  radio: Record<Kind, string[]>;
}

export const COPY: Record<Flavour, FlavourCopy> = {
  studio: {
    rivals: ['Staging', 'Hotfix', 'Legacy'],
    plates: ['MRG 042', 'STG 001', 'FIX 911', 'OLD 1999', 'PRK 007'],
    shops: ['MERGE MART', 'COMMIT COFFEE'],
    radio: {
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
      crash: ['Contact is out. Rules are rules.', 'Merge conflict! One car down.', "That's not in the changelog.", 'Rolled back. Please park carefully.', 'Ouch. That was a breaking change.'],
      crashSelf: ['My bad. Reverting myself.', 'I touched it. I am out.', 'Hotfix needed. On my own bumper.'],
      leave: ["Someone's pulling out. Hot desk!", 'A bay just opened up. Race condition!', 'That car is deploying out of its bay.'],
      leaveUp: ['A car is pulling out on {name}!', 'Brake lights on {name}: a bay is opening up.', '{name}: someone is leaving. Race condition on the ramp!', 'Engine just started up on {name}. Anyone close?'],
      recover: ['{name} is reversing into prod.', '{name} is rolling back the release.', '{name} just force-pushed in reverse.'],
    },
  },
  neutral: {
    rivals: ['Coupe', 'Courier', 'Minivan'],
    plates: ['PRK 042', 'CPE 001', 'VAN 911', 'MNV 199', 'BAY 007'],
    shops: ['SUNNY MARKET', 'CORNER CAFE'],
    radio: {
      spot: ["That one's mine!", 'Free space! Out of my way.', 'Found it. Indicator on.', 'Empty bay ahead. Mine.', 'There it is. Nobody move.'],
      bumped: ['Hey! Mind the paint!', 'Did you just touch my bumper?', 'Watch it!', "That's a brand new car!", 'My mirror!'],
      honked: ['Honk all you like, I was here first.', 'Patience, please.', "I'm going, I'm going!", 'Relax, there is room for everyone. Almost.'],
      honker: ['Move it, the shop closes at six.', 'Pick a lane!', "Green means go, you know."],
      lost: ['Typical. Round and round again.', 'I saw it first. I did!', "Fine. I'll park at the back.", 'Next time, that space is mine.'],
      win: ['Parked. Engine off.', 'Perfect fit.', 'And that is how you park.'],
      incident: ['Watch out for the shoppers!', 'Sorry, sorry! Watch your step!', 'Brakes! Brakes!', 'Everyone okay over there?'],
      crash: ['Contact is out. Rules are rules.', 'Ouch. One car down.', "That's going to cost someone.", 'Out! Please park carefully.', 'Crunch. That was a bump too many.'],
      crashSelf: ['My bad. I touched it.', 'I touched it. I am out.', 'Oops. That was my bumper.'],
      leave: ["Someone's pulling out!", 'A bay just opened up!', 'Brake lights! Somebody is leaving.'],
      leaveUp: ['A car is pulling out on {name}!', 'Brake lights on {name}: a bay is opening up.', '{name}: someone is leaving!', 'Engine just started up on {name}. Anyone close?'],
      recover: ['{name} is reversing. Careful!', '{name} is backing out again.', '{name} is having another go.'],
    },
  },
};

/** Words in the neutral copy that would betray a developer joke (a test keeps them out). */
export const OFFICE_WORDS = /\b(merge|merged|commit|git|deploy|deploying|pull request|code|review|sprint|backlog|ticket|release|rollback|rolled back|revert|rebas|build|bug|prod|production|hotfix|staging|legacy|changelog|unit test|stand-?up|lgtm|main|ship|shipped|shipping|push|force|critical path|race condition|hot desk|company|insurance)\b/i;
