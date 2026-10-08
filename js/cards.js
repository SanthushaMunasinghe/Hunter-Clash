import { CARDS, CARD_ORDER, HAND_SIZE, START_MEAT, UNITS, ARROW, UPGRADE, SHIELD_TURNS } from './config.js';
import { dist } from './utils.js';
import { deploySlots, towerSpots, dirOf } from './rules.js';

const SNAP = 64;       // how close a lane card must be dropped to a slot to snap onto it
const BASE_SNAP = 95;  // how close an upgrade must be dropped to your own castle

// arrows: how many are loosed each hunt. damage: what each does to an animal.
export function newTeam() {
  return {
    meat: START_MEAT, hand: new Array(HAND_SIZE).fill(null),
    arrows: 1, damage: ARROW.damage, bought: { arrow: 0, damage: 0 },
    shots: 0, hunted: 0, // arrows loosed and meat they brought in, over the whole match
    shield: 0,           // enemy hunts the castle is still shielded from
    dealt: 0,            // damage done to enemy troops, towers and castle; counts at time-up
    dealtCastle: 0,      // the part of that done to the castle
  };
}

// Every card comes back at the start of the turn. Playing one empties its slot until then.
export function dealHand(T) {
  T.hand = [...CARD_ORDER];
}

// Upgrades get dearer each time they are bought.
export function cardCost(T, id) {
  const card = CARDS[id];
  return card.cost + (card.step || 0) * (T.bought[id] || 0);
}

// Why a card can't be played right now: 'meat', 'spot' or null if it can.
export function cardBlocker(m, team, id) {
  const zone = CARDS[id].zone;
  if (m.teams[team].meat < cardCost(m.teams[team], id)) return 'meat';
  if (zone === 'lane' && !deploySlots(m, team, 0).length && !deploySlots(m, team, 1).length) return 'spot';
  if (zone === 'checkpoint' && !towerSpots(m, team).length) return 'spot';
  return null;
}

export const canPlayAny = (m, team) => m.teams[team].hand.some(id => id && !cardBlocker(m, team, id));

// The point on a team's castle that upgrade cards are dropped onto.
export function basePoint(m, team) {
  const c = m.board.castles[team];
  return { x: c.x, y: c.drawY - 28 };
}

// Where a card may go, for highlighting while it is being dragged.
export function dropOptions(m, team, id) {
  const zone = CARDS[id].zone;
  if (zone === 'base') return { base: basePoint(m, team) };
  const spots = zone === 'lane'
    ? [0, 1].flatMap(li => deploySlots(m, team, li).map(slot => ({ lane: li, slot })))
    : towerSpots(m, team);
  return { spots: spots.map(s => ({ ...s, ...m.board.lanePoint(s.lane, s.slot) })) };
}

// Resolves a drop at (x, y) to a concrete target for playCard.
export function dropTarget(m, team, id, x, y, options) {
  if (CARDS[id].zone === 'base') {
    return { valid: dist(x, y, options.base.x, options.base.y) < BASE_SNAP, ...options.base };
  }
  let best = null, bd = SNAP;
  for (const s of options.spots) {
    const d = dist(x, y, s.x, s.y);
    if (d < bd) { bd = d; best = s; }
  }
  return best ? { valid: true, ...best } : { valid: false, x, y };
}

// Pays for hand[idx] and applies it. The hand slot stays empty until the next deal.
// Returns the new squad or tower, { upgrade: id } for an upgrade, or null if illegal.
export function playCard(m, team, idx, target) {
  const T = m.teams[team], id = T.hand[idx], card = CARDS[id];
  if (!card) return null;
  const cost = cardCost(T, id);
  if (T.meat < cost) return null;
  let ent;
  if (card.zone === 'lane') {
    if (!deploySlots(m, team, target.lane).includes(target.slot)) return null;
    const u = UNITS[id];
    ent = {
      id: m.nextId++, team, kind: id, lane: target.lane, slot: target.slot,
      hp: u.hp, maxHp: u.hp, range: u.range, speed: u.speed,
      vis: target.slot - dirOf(team) * 0.8, walking: false, lunge: 0, lx: 0, ly: 0, flash: 0,
    };
    m.lanes[target.lane].squads.push(ent);
  } else if (card.zone === 'checkpoint') {
    if (!towerSpots(m, team).some(s => s.lane === target.lane && s.slot === target.slot)) return null;
    const u = UNITS.tower;
    ent = {
      id: m.nextId++, team, lane: target.lane, slot: target.slot,
      hp: u.hp, maxHp: u.hp, range: u.range, flash: 0, born: 0,
    };
    m.lanes[target.lane].towers.push(ent);
  } else {
    if (id === 'shield') T.shield = SHIELD_TURNS;
    else if (id === 'arrow') T.arrows++;
    else T.damage += UPGRADE.damage;
    if (id in T.bought) T.bought[id]++;
    ent = { upgrade: id };
  }
  T.meat -= cost;
  T.hand[idx] = null;
  return ent;
}
