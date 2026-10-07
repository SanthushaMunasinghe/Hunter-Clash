import {
  BLUE, RED, LANE_LEN, CARDS, DECK, HAND_SIZE, START_MEAT, UNITS, HUNTER, WALL, CASTLE, CENTER_ZONE,
} from './config.js';
import { shuffle, gap, dist } from './utils.js';

const SNAP = 86; // how close a lane card must be dropped to a slot to snap onto it

export function dealTeam() {
  let deck;
  // Opening hand always has something for the lanes.
  do deck = shuffle([...DECK]);
  while (!deck.slice(0, HAND_SIZE).some(id => CARDS[id].zone === 'lane'));
  return { meat: START_MEAT, hand: deck.splice(0, HAND_SIZE), deck };
}

// Free lane slots `team` may deploy onto: from their castle up to their forward-most checkpoint.
export function deploySlots(m, team, li) {
  const lane = m.lanes[li];
  const owned = lane.cps.filter(c => c.owner === team).map(c => c.slot);
  const foes = [...lane.squads, ...lane.towers].filter(e => e.team !== team).map(e => e.slot);
  let lo, hi;
  if (team === BLUE) {
    lo = 1;
    hi = Math.min(Math.max(1, ...owned), Math.min(LANE_LEN, ...foes) - 1);
  } else {
    hi = LANE_LEN - 1;
    lo = Math.max(Math.min(LANE_LEN - 1, ...owned), Math.max(0, ...foes) + 1);
  }
  const out = [];
  for (let s = lo; s <= hi; s++) {
    if (!lane.squads.some(q => q.slot === s)) out.push(s);
  }
  return out;
}

// Captured checkpoints without a tower on them yet.
export function towerSpots(m, team) {
  const out = [];
  m.lanes.forEach((lane, li) => {
    for (const cp of lane.cps) {
      if (cp.owner !== team) continue;
      if (lane.towers.some(t => t.slot === cp.slot)) continue;
      if (lane.squads.some(q => q.slot === cp.slot && q.team !== team)) continue;
      out.push({ lane: li, slot: cp.slot });
    }
  });
  return out;
}

// Y of the boundary of `team`'s centre deploy zone. Blue may place below it, red above it.
export function centerLine(m, team) {
  const { FT, FB } = m.board, fh = FB - FT;
  if (team === BLUE) {
    let y = FB - fh * CENTER_ZONE.depth;
    for (const h of m.hunters) if (h.team === BLUE) y = Math.min(y, h.y - 6);
    return Math.max(y, FT + fh * CENTER_ZONE.limit);
  }
  let y = FT + fh * CENTER_ZONE.depth;
  for (const h of m.hunters) if (h.team === RED) y = Math.max(y, h.y + 6);
  return Math.min(y, FB - fh * CENTER_ZONE.limit);
}

export const hunterShape = (x, y) => ({ x, y, h: 0, r: HUNTER.r });
export const wallShape = (x, y) => ({ x, y, h: WALL.w / 2 - WALL.r, r: WALL.r });
export const castleShape = c => ({ x: c.x, y: c.y, h: CASTLE.halfLen, r: CASTLE.r });

// Whether a centre-field structure fits at (x, y), ignoring zone lines. `skip` is an
// entity to leave out of the overlap test (a hunter checking its own next step).
export function centerFits(m, kind, x, y, skip = null) {
  const b = m.board;
  const me = kind === 'wall' ? wallShape(x, y) : hunterShape(x, y);
  if (b.fieldG(x - me.h, y, me.r + 8) >= 1 || b.fieldG(x + me.h, y, me.r + 8) >= 1) return false;
  for (const c of b.castles) {
    if (gap(me, castleShape(c)) < 14) return false;
    if (kind === 'wall' && dist(x, y, c.launch.x, c.launch.y) < 26) return false;
  }
  for (const h of m.hunters) if (h !== skip && gap(me, hunterShape(h.x, h.y)) < 6) return false;
  for (const w of m.walls) if (gap(me, wallShape(w.x, w.y)) < 6) return false;
  return true;
}

export function centerValid(m, team, kind, x, y) {
  const line = centerLine(m, team);
  if (team === BLUE ? y < line : y > line) return false;
  return centerFits(m, kind, x, y);
}

// Why a card can't be played right now: 'meat', 'spot' or null if it can.
export function cardBlocker(m, team, id) {
  const card = CARDS[id];
  if (m.teams[team].meat < card.cost) return 'meat';
  if (card.zone === 'lane' && !deploySlots(m, team, 0).length && !deploySlots(m, team, 1).length) return 'spot';
  if (card.zone === 'checkpoint' && !towerSpots(m, team).length) return 'spot';
  return null;
}

export const canPlayAny = (m, team) => m.teams[team].hand.some(id => !cardBlocker(m, team, id));

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

// Pays for hand[idx] and puts it on the board. Returns the new entity, or null if illegal.
export function playCard(m, team, idx, target) {
  const T = m.teams[team], id = T.hand[idx], card = CARDS[id];
  if (!card || T.meat < card.cost) return null;
  let ent;
  if (card.zone === 'lane') {
    if (!deploySlots(m, team, target.lane).includes(target.slot)) return null;
    const u = UNITS[id], dir = team === BLUE ? 1 : -1;
    ent = {
      id: m.nextId++, team, kind: id, lane: target.lane, slot: target.slot,
      hp: u.hp, maxHp: u.hp, atk: u.atk, range: u.range,
      vis: target.slot - dir * 0.6, walking: false, lunge: 0, lx: 0, ly: 0, flash: 0,
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
    if (id === 'hunter') {
      ent = {
        id: m.nextId++, team, x: target.x, y: target.y, vx: target.x, vy: target.y,
        hp: HUNTER.hp, maxHp: HUNTER.hp, flash: 0, born: 0,
      };
      m.hunters.push(ent);
    } else {
      ent = { id: m.nextId++, team, x: target.x, y: target.y, hp: WALL.hp, maxHp: WALL.hp, flash: 0, born: 0 };
      m.walls.push(ent);
    }
  }
  T.meat -= card.cost;
  T.deck.push(id);
  T.hand[idx] = T.deck.shift();
  return ent;
}
