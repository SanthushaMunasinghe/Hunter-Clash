// Virtual portrait canvas. Width is fixed; height follows the screen's aspect ratio.
export const W = 540;
export const MIN_H = 960;
export const MAX_H = 1200;
export const HUD_H = 76;
export const PANEL_H = 176;

export const BLUE = 0;
export const RED = 1;

// Centre field is a superellipse; the road loop hugs its outside.
export const FIELD = { halfW: 186, exp: 3.4, topPad: 100, bottomPad: 88 };
export const ROAD = { width: 58, offset: 32 };

// Each lane is a row of slots. Slot 0 is blue's home slot and slot LANE_LEN is red's:
// only the owner may stand there, so a team can always deploy at its own gate.
// Checkpoints sit every 5th slot, leaving 4 open slots between neighbours.
export const LANE_LEN = 24;
export const CHECKPOINTS = [2, 7, 12, 17, 22];
export const HOME_INSET = 76; // px along the road from a castle to its home slot

// guard*: the castle's own archers, which finish off whatever reaches the gate.
export const CASTLE = {
  hp: 100, halfLen: 26, r: 26, scale: 0.85,
  guardDmg: 20, guardSlots: 4,
  guardCenterDmg: 10, guardCenterRange: 150,
};

export const ARROW = { speed: 800, radius: 6, step: 3, bounces: 5, damage: 10, castleDamage: 5 };

// speed: slots covered in one step. siege: damage per hit on a castle.
// Warriors plus one archer volley kill a fresh warrior squad in a single turn.
export const UNITS = {
  melee: { hp: 36, atk: 24, siege: 25, range: 1, speed: 5 },
  archer: { hp: 16, atk: 12, siege: 10, range: 4, speed: 5 },
  tower: { hp: 30, atk: 4, range: 2 },
};

// Hunter towers stay put and shoot whatever wanders close. Good hunters, poor fighters.
export const HTOWER = { hp: 40, r: 16, range: 95, atkAnimal: 25, atkUnit: 10, atkCastle: 2 };

export const ANIMALS = {
  sheep: { hp: 10, r: 14, speed: 11, weight: 5 },
  cow: { hp: 20, r: 17, speed: 9, weight: 4 },
  bull: { hp: 40, r: 19, speed: 8, weight: 3 },
  bear: { hp: 80, r: 23, speed: 6, weight: 2 },
  dino: { hp: 160, r: 27, speed: 4, weight: 1 },
};
// The herd only ever refills what was killed: each kill comes back `delay` rounds later,
// at most `perTurn` at a time. Below MIN_ANIMALS the wait is skipped.
export const MIN_ANIMALS = 4;
export const RESPAWN = { delay: 3, perTurn: 2 };

export const CARDS = {
  melee: { name: 'Warriors', cost: 40, zone: 'lane' },
  archer: { name: 'Archers', cost: 40, zone: 'lane' },
  htower: { name: 'Hunter Tower', cost: 50, zone: 'center' },
  tower: { name: 'Guard Tower', cost: 30, zone: 'checkpoint' },
};
// The hand, in screen order. Every card comes back each turn and can be played once.
export const CARD_ORDER = ['melee', 'archer', 'htower', 'tower'];
export const HAND_SIZE = CARD_ORDER.length;
export const START_MEAT = 20;

// Centre build zone: a strip `depth` of the field deep by your base to start with. It
// grows level with the furthest checkpoint you hold on either road, and stays as far out
// as your furthest hunter tower. Never closer than `limit` to the enemy end.
export const CENTER_ZONE = { depth: 0.18, limit: 0.15 };

// A match never runs long: once this many turns are up, the healthier castle wins.
// Level castles go to whoever holds more checkpoints, then more meat; if even that is
// level, play goes on a round at a time.
export const TURN_LIMIT = 25;

// Opponents differ only in how well they play; every stat and price is identical.
// aimSamples: angles tried per shot. aimError: random wobble in radians.
// smart: chance each card decision is a considered one rather than a random one.
// lookahead: rounds of lane fighting it plays out in its head before placing troops.
// maxCards / skip: how many cards it bothers to play, and how often it forgets to.
export const LEVELS = [
  { name: 'NOOB', blurb: 'Still learning which end of the arrow is sharp.', aimSamples: 2, aimError: 0.22, smart: 0.15, lookahead: 0, maxCards: 1, skip: 0.35 },
  { name: 'RECRUIT', blurb: 'Knows the rules, makes plenty of mistakes.', aimSamples: 3, aimError: 0.14, smart: 0.3, lookahead: 0, maxCards: 1, skip: 0.2 },
  { name: 'VETERAN', blurb: 'A fair fight. Think before you spend.', aimSamples: 10, aimError: 0.07, smart: 0.6, lookahead: 0, maxCards: 2, skip: 0 },
  { name: 'ACE', blurb: 'Sharp aim and well-timed pushes.', aimSamples: 30, aimError: 0.02, smart: 0.9, lookahead: 2, maxCards: 3, skip: 0 },
  { name: 'LEGEND', blurb: 'Rarely misses. Punishes every gap.', aimSamples: 64, aimError: 0, smart: 1, lookahead: 4, maxCards: 4, skip: 0 },
];
