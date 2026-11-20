/** Portal words: plain parking-lot humour, nothing about code, git or offices. */
import type { FlavourCopy } from '../flavour';

export const NEUTRAL: FlavourCopy = {
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
};

/** The portal build aliases `./studio` to this file, so the studio's jokes are not even in the bundle. */
export const STUDIO = NEUTRAL;
