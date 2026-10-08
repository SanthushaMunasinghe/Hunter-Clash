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

// guard: what the castle's own archers do to a squad at the gate, by squad kind.
export const CASTLE = {
  hp: 100, halfLen: 26, r: 26, scale: 0.85,
  guardSlots: 4, guard: { melee: 20, archer: 20, giant: 30 },
};

// An arrow bounces off the field edge up to `bounces` times and is spent on the first
// animal it hits. damage is the starting hunting damage; castleDamage never grows.
export const ARROW = { speed: 800, radius: 6, step: 3, bounces: 5, damage: 10, castleDamage: 5, volleyGap: 0.16 };

// Lane troops. speed: slots covered in one step. dmg: damage per strike by target kind.
// The counters: archers shred giants, giants flatten guard towers and shrug off warriors,
// warriors cut down archers. Everything kills archers once it reaches them.
export const UNITS = {
  melee: { hp: 36, range: 1, speed: 5, dmg: { melee: 24, archer: 24, giant: 20, tower: 15, castle: 25 } },
  archer: { hp: 16, range: 4, speed: 5, dmg: { melee: 12, archer: 12, giant: 30, tower: 8, castle: 10 } },
  giant: { hp: 60, range: 1, speed: 4, dmg: { melee: 12, archer: 16, giant: 16, tower: 30, castle: 30 } },
  tower: { hp: 30, range: 2, dmg: { melee: 4, archer: 4, giant: 4 } },
};

// Prey. hp is how much hunting damage it soaks up; meat is what it pays out in total,
// shared across hits in proportion to damage. Fast animals die to any hit and pay well
// but have to be led; slow ones are easy targets that pay a little per hit.
// from: the turn it first appears. Richer prey arrives every 5 turns.
export const ANIMALS = {
  sheep: { hp: 30, meat: 75, r: 15, speed: 14, from: 1 },
  rabbit: { hp: 10, meat: 40, r: 12, speed: 46, fast: true, from: 1 },
  cow: { hp: 40, meat: 120, r: 17, speed: 13, from: 6 },
  bull: { hp: 50, meat: 180, r: 19, speed: 12, from: 11 },
  deer: { hp: 10, meat: 65, r: 14, speed: 56, fast: true, from: 11 },
  bear: { hp: 70, meat: 295, r: 23, speed: 10, from: 16 },
  dino: { hp: 100, meat: 500, r: 27, speed: 8, from: 21 },
  stag: { hp: 10, meat: 100, r: 15, speed: 64, fast: true, from: 21 },
};
// Opening herd, as point-mirrored pairs.
export const HERD_START = ['sheep', 'sheep', 'rabbit'];
// The herd refills toward `size`: each kill comes back `delay` rounds later, at most
// `perTurn` at a time. Below `min` the wait is skipped. New kinds of prey may push the
// herd up to `max` when they first arrive.
export const HERD = { size: 6, min: 4, max: 8, delay: 2, perTurn: 2 };

// zone: where a card is dropped. step: how much dearer an upgrade gets each time it is bought.
export const CARDS = {
  melee: { name: 'Warriors', cost: 40, zone: 'lane' },
  archer: { name: 'Archers', cost: 40, zone: 'lane' },
  giant: { name: 'Giant', cost: 55, zone: 'lane' },
  tower: { name: 'Tower', cost: 30, zone: 'checkpoint' },
  arrow: { name: '+1 Arrow', cost: 80, step: 40, zone: 'base' },
  damage: { name: '+Damage', cost: 60, step: 30, zone: 'base' },
};
// The hand, in screen order. Every card comes back each turn and can be played once.
export const CARD_ORDER = ['melee', 'archer', 'giant', 'tower', 'arrow', 'damage'];
export const HAND_SIZE = CARD_ORDER.length;
export const START_MEAT = 30;
export const UPGRADE = { damage: 5 }; // hunting damage added per +Damage card

// A match never runs long: once this many turns are up, the healthier castle wins.
// Level castles go to whoever holds more checkpoints, then more meat; if even that is
// level, play goes on a round at a time.
export const TURN_LIMIT = 25;

// Opponents differ only in how well they play; every stat and price is identical.
// aimSamples: angles tried per shot. aimError: random wobble in radians.
// lead: whether it aims where a moving animal will be rather than where it is.
// smart: chance each card decision is a considered one rather than a random one.
// lookahead: rounds of lane fighting it plays out in its head before placing troops.
// maxCards / skip: how many cards it bothers to play, and how often it forgets to.
// minScore: plays it rates below this are skipped and the meat kept. eco: extra
// appetite for upgrades.
export const LEVELS = [
  { name: 'NOOB', blurb: 'Still learning which end of the arrow is sharp.', aimSamples: 2, aimError: 0.2, lead: false, smart: 0.15, lookahead: 0, maxCards: 1, skip: 0.35 },
  { name: 'RECRUIT', blurb: 'Knows the rules, makes plenty of mistakes.', aimSamples: 4, aimError: 0.12, lead: false, smart: 0.3, lookahead: 0, maxCards: 1, skip: 0.2 },
  { name: 'VETERAN', blurb: 'A fair fight. Think before you spend.', aimSamples: 12, aimError: 0.05, lead: false, smart: 0.75, lookahead: 0, maxCards: 3, skip: 0 },
  { name: 'ACE', blurb: 'Sharp aim and well-timed pushes.', aimSamples: 30, aimError: 0.02, lead: true, smart: 0.9, lookahead: 2, maxCards: 3, skip: 0, minScore: 40, eco: 10 },
  { name: 'LEGEND', blurb: 'Rarely misses. Punishes every gap.', aimSamples: 64, aimError: 0, lead: true, smart: 1, lookahead: 3, maxCards: 4, skip: 0, minScore: 45, eco: 25 },
];
