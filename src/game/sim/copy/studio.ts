/** The studio's words (our own site): office and developer humour. Portal builds swap this module for `neutral.ts`. */
import type { FlavourCopy } from '../flavour';

export const STUDIO: FlavourCopy = {
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
};
