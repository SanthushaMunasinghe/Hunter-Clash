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

// guard: what the castle's own archers do to a squad within guardSlots of the gate,
// by squad kind.
export const CASTLE = {
  hp: 100, halfLen: 26, r: 26, scale: 0.85,
  guardSlots: 2, guard: { melee: 20, archer: 20, giant: 20 },
};

// An arrow bounces off the field edge up to `bounces` times and is spent on the first
// animal it hits. damage is the starting hunting damage: the meat one arrow takes off an
// animal. castleDamage is the token chip an arrow takes off the enemy castle if it gets
// that far; it never grows.
// A volley leaves the bow all at once: arrows side by side, `rank` px apart across the
// aim line, each turned `fan` radians out from its neighbour. Past `abreast` arrows the
// rank closes up instead of growing any wider.
export const ARROW = {
  speed: 800, radius: 6, step: 3, bounces: 5, damage: 12, castleDamage: 1,
  rank: 12, fan: 0.01, abreast: 5,
};

// Lane troops. speed: slots covered in one step. range: how many slots ahead it can hit;
// nothing reaches further than 2. dmg: damage per strike by target kind.
// Archers die to a single blow from any squad. Warriors and giants are the same in a
// fight (two blows fell either), but a giant is slower and dearer: its one job is guard
// towers, which it breaks in 2 blows where warriors and archers together need 6.
export const UNITS = {
  melee: { hp: 36, range: 1, speed: 5, dmg: { melee: 24, archer: 24, giant: 24, tower: 10, castle: 25 } },
  archer: { hp: 16, range: 2, speed: 5, dmg: { melee: 12, archer: 16, giant: 12, tower: 10, castle: 10 } },
  giant: { hp: 36, range: 1, speed: 4, dmg: { melee: 24, archer: 24, giant: 24, tower: 30, castle: 25 } },
  tower: { hp: 60, range: 2, dmg: { melee: 4, archer: 4, giant: 4 } },
};

// Prey. meat is an animal's health and its bounty in one: the number over its head. An
// arrow takes its hunting damage off that number and the hunter banks exactly as much,
// so the animal is dead when it runs out. Quick prey (fast) is the exception: any hit
// takes the lot. It pays well in one go but has to be led; slow prey is an easy target
// that lasts several hits.
// from: the turn it first appears. Richer prey arrives every 5 turns.
// band: where it roams, as a fraction of the way from the middle of the field to a base.
// Cheap prey grazes near the castles; the quick kinds keep to the middle, far from both.
export const ANIMALS = {
  sheep: { meat: 48, r: 15, speed: 15, from: 1, band: [0.5, 0.86] },
  rabbit: { meat: 18, r: 12, speed: 46, fast: true, from: 1, band: [0, 0.26] },
  cow: { meat: 70, r: 17, speed: 14, from: 6, band: [0.42, 0.8] },
  bull: { meat: 96, r: 19, speed: 13, from: 11, band: [0.32, 0.72] },
  deer: { meat: 28, r: 14, speed: 56, fast: true, from: 11, band: [0, 0.26] },
  bear: { meat: 144, r: 23, speed: 12, from: 16, band: [0.22, 0.62] },
  dino: { meat: 220, r: 27, speed: 10, from: 21, band: [0.08, 0.5] },
  stag: { meat: 42, r: 15, speed: 64, fast: true, from: 21, band: [0, 0.26] },
};
// Opening herd, as point-mirrored pairs.
export const HERD_START = ['sheep', 'sheep', 'rabbit'];
// The herd refills toward `size`: each kill comes back `delay` rounds later, at most
// `perTurn` at a time. Below `min` the wait is skipped. New kinds of prey may push the
// herd up to `max` when they first arrive.
export const HERD = { size: 6, min: 4, max: 8, delay: 2, perTurn: 2 };

// zone: where a card is dropped. step: how much dearer an upgrade gets each time it is bought.
export const CARDS = {
  melee: { name: 'Warriors', cost: 20, zone: 'lane' },
  archer: { name: 'Archers', cost: 20, zone: 'lane' },
  giant: { name: 'Giant', cost: 28, zone: 'lane' },
  tower: { name: 'Tower', cost: 30, zone: 'checkpoint' },
  arrow: { name: '+1 Arrow', cost: 40, step: 30, zone: 'base' },
  damage: { name: '+Damage', cost: 25, step: 20, zone: 'base' },
};
// All the cards, in the order they are laid out when dealt.
export const CARD_ORDER = ['melee', 'archer', 'giant', 'tower', 'arrow', 'damage'];
// Each turn deals HAND_SIZE different cards at random. Playing one draws a new card into
// its place straight away, so the hand is always full.
export const HAND_SIZE = 4;
// How likely each card is to be dealt. Any card can turn up on any turn, but the odds
// follow the match: upgrades and basic troops early, giants and towers once it is under
// way, and upgrades fading the more of them you already own.
export const DEAL = {
  melee: 10,
  archer: 8,
  arrow: [9, 5, 1, 0.6],    // by arrows owned: 1, 2, 3, 4 or more
  damage: [8, 5, 2.5, 1],   // by +Damage cards bought: 0, 1, 2, 3 or more
  giant: [1, 6],            // on the first turns -> once the match is under way
  tower: [1, 5],
  ramp: [2, 6],             // giant and tower odds grow between these turns
  noCheckpoint: 0.4,        // towers are dealt less while you hold no checkpoint to put one on
};
export const START_MEAT = 15;
export const UPGRADE = { damage: 5 }; // hunting damage added per +Damage card

// A match never runs long. A castle that falls loses the match on the spot. If both are
// still standing once this many turns are up, it goes on points: what is left of your
// castle plus the checkpoints you hold at that moment. Level points go to the healthier
// castle, then to more meat; if even that is level, play goes on a round at a time.
export const TURN_LIMIT = 25;
// What each is worth at time-up. With a checkpoint on 10, holding all ten of them counts
// for as much as a castle at full health.
export const POINTS = { health: 1, checkpoint: 10 };

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
  { name: 'ACE', blurb: 'Sharp aim and well-timed pushes.', aimSamples: 30, aimError: 0.02, lead: true, smart: 0.9, lookahead: 2, maxCards: 3, skip: 0, minScore: 40, eco: 15 },
  { name: 'LEGEND', blurb: 'Rarely misses. Punishes every gap.', aimSamples: 64, aimError: 0, lead: true, smart: 1, lookahead: 3, maxCards: 4, skip: 0, minScore: 30, eco: 15 },
];
