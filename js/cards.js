import { CARDS, CARD_ORDER, CARD_REST, HAND_SIZE, START_MEAT, UNITS, HTOWER, HUNTER } from './config.js';
import { dist } from './utils.js';
import { deploySlots, towerSpots, centerLine, centerValid, dirOf } from './rules.js';

const SNAP = 64; // how close a lane card must be dropped to a slot to snap onto it

export function newTeam() {
  return { meat: START_MEAT, hand: new Array(HAND_SIZE).fill(null), rested: null };
}

// A fresh hand of four different cards. One type sits out each turn (never the same one
// twice running), and the very first hand always has both troop cards.
export function dealHand(T) {
  const first = T.rested === null;
  const pool = CARD_ORDER.filter(id => id !== T.rested && !(first && CARDS[id].zone === 'lane'));
  let roll = Math.random() * pool.reduce((sum, id) => sum + CARD_REST[id], 0);
  let out = pool[pool.length - 1];
  for (const id of pool) {
    roll -= CARD_REST[id];
    if (roll <= 0) { out = id; break; }
  }
  T.rested = out;
  T.hand = CARD_ORDER.filter(id => id !== out);
}

// Why a card can't be played right now: 'meat', 'spot' or null if it can.
export function cardBlocker(m, team, id) {
  const card = CARDS[id];
  if (m.teams[team].meat < card.cost) return 'meat';
  if (card.zone === 'lane' && !deploySlots(m, team, 0).length && !deploySlots(m, team, 1).length) return 'spot';
  if (card.zone === 'checkpoint' && !towerSpots(m, team).length) return 'spot';
  return null;
}

export const canPlayAny = (m, team) => m.teams[team].hand.some(id => id && !cardBlocker(m, team, id));

// Where a card may go, for highlighting while it is being dragged.
export function dropOptions(m, team, id) {
  const zone = CARDS[id].zone;
  if (zone === 'center') return { line: centerLine(m, team) };
  const spots = zone === 'lane'
    ? [0, 1].flatMap(li => deploySlots(m, team, li).map(slot => ({ lane: li, slot })))
    : towerSpots(m, team);
  return { spots: spots.map(s => ({ ...s, ...m.board.lanePoint(s.lane, s.slot) })) };
}

// Resolves a drop at (x, y) to a concrete target for playCard.
export function dropTarget(m, team, id, x, y, options) {
  if (CARDS[id].zone === 'center') {
    return { valid: centerValid(m, team, id, x, y), x, y };
  }
  let best = null, bd = SNAP;
  for (const s of options.spots) {
    const d = dist(x, y, s.x, s.y);
    if (d < bd) { bd = d; best = s; }
  }
  return best ? { valid: true, ...best } : { valid: false, x, y };
}

// Pays for hand[idx] and puts it on the board. The hand slot stays empty until the next
// deal. Returns the new entity, or null if the play is illegal.
export function playCard(m, team, idx, target) {
  const T = m.teams[team], id = T.hand[idx], card = CARDS[id];
  if (!card || T.meat < card.cost) return null;
  let ent;
  if (card.zone === 'lane') {
    if (!deploySlots(m, team, target.lane).includes(target.slot)) return null;
    const u = UNITS[id];
    ent = {
      id: m.nextId++, team, kind: id, lane: target.lane, slot: target.slot,
      hp: u.hp, maxHp: u.hp, atk: u.atk, siege: u.siege, range: u.range, speed: u.speed,
      vis: target.slot - dirOf(team) * 0.8, walking: false, lunge: 0, lx: 0, ly: 0, flash: 0,
    };
    m.lanes[target.lane].squads.push(ent);
  } else if (card.zone === 'checkpoint') {
    if (!towerSpots(m, team).some(s => s.lane === target.lane && s.slot === target.slot)) return null;
    const u = UNITS.tower;
    ent = {
      id: m.nextId++, team, lane: target.lane, slot: target.slot,
      hp: u.hp, maxHp: u.hp, atk: u.atk, range: u.range, flash: 0, born: 0,
    };
    m.lanes[target.lane].towers.push(ent);
  } else {
    if (!centerValid(m, team, id, target.x, target.y)) return null;
    const hp = id === 'htower' ? HTOWER.hp : HUNTER.hp;
    ent = {
      id: m.nextId++, team, x: target.x, y: target.y, vx: target.x, vy: target.y,
      hp, maxHp: hp, flash: 0, born: 0,
    };
    (id === 'htower' ? m.htowers : m.hunters).push(ent);
  }
  T.meat -= card.cost;
  T.hand[idx] = null;
  return ent;
}
