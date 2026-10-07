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

// Each lane is a row of slots from the blue castle (0) to the red castle (LANE_LEN).
export const LANE_LEN = 10;
export const CHECKPOINTS = [1, 3, 5, 7, 9];
// One "step" for a squad is up to this many slots, i.e. checkpoint to checkpoint.
export const MARCH = 2;

// guard*: the castle's own archers. siege: bonus multiplier for lane troops hitting a castle.
export const CASTLE = {
  hp: 200, halfLen: 26, r: 26, scale: 0.85,
  guardDmg: 15, guardSlots: 2, guardRange: 200, siege: 1.5,
};

export const ARROW = { speed: 760, radius: 6, step: 3, bounces: 5, damage: 10 };

export const UNITS = {
  melee: { hp: 54, atk: 18, range: 1 },
  archer: { hp: 24, atk: 12, range: 3 },
  tower: { hp: 100, atk: 14, range: 2 },
};

export const HUNTER = {
  hp: 50, r: 16, range: 200, step: 64,
  atkAnimal: 30, atkUnit: 20, atkCastle: 12,
};

export const WALL = { hp: 40, w: 76, r: 9 };

export const ANIMALS = {
  sheep: { hp: 10, r: 14, speed: 11, weight: 5 },
  cow: { hp: 20, r: 17, speed: 9, weight: 4 },
  bull: { hp: 40, r: 19, speed: 8, weight: 3 },
  bear: { hp: 80, r: 23, speed: 6, weight: 2 },
  dino: { hp: 160, r: 27, speed: 4, weight: 1 },
};
export const MAX_ANIMALS = 15;

export const CARDS = {
  melee: { name: 'Warriors', cost: 30, zone: 'lane' },
  archer: { name: 'Archers', cost: 30, zone: 'lane' },
  hunter: { name: 'Hunter', cost: 50, zone: 'center' },
  wall: { name: 'Wall', cost: 20, zone: 'center' },
  tower: { name: 'Guard Tower', cost: 80, zone: 'checkpoint' },
};
export const DECK = ['melee', 'archer', 'hunter', 'wall', 'tower', 'melee', 'archer', 'hunter'];
export const HAND_SIZE = 4;
export const START_MEAT = 20;

// Centre deploy zone: starts `depth` of the field deep from your base and follows
// your forward-most hunter, but never closer than `limit` to the enemy end.
export const CENTER_ZONE = { depth: 0.3, limit: 0.22 };

// Long stalemates are broken by making castles fragile late in the match.
export const SUDDEN_DEATH = { turn: 12, mult: 2 };

// aimSamples: angles tried per shot. aimError: random wobble in radians.
// smart: chance each card decision is the best one rather than a random one.
export const LEVELS = [
  { name: 'NOOB AI', aimSamples: 6, aimError: 0.2, smart: 0.35, maxCards: 1, bonusMeat: 0 },
  { name: 'ROOKIE AI', aimSamples: 16, aimError: 0.09, smart: 0.7, maxCards: 2, bonusMeat: 0 },
  { name: 'HUNTER AI', aimSamples: 36, aimError: 0.03, smart: 0.9, maxCards: 3, bonusMeat: 5 },
  { name: 'WARLORD AI', aimSamples: 64, aimError: 0, smart: 1, maxCards: 4, bonusMeat: 10 },
];
