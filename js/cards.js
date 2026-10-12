import { CARDS, CARD_ORDER, HAND_SIZE, DEAL, START_MEAT, UNITS, ARROW, UPGRADE, MUSTER } from './config.js';
import { dist, clamp, lerp } from './utils.js';
import { towerSpots, dirOf, homeSlot, placement, placeUnits, newUnit, checkpointsHeld } from './rules.js';

const SNAP = 64;       // how close a tower must be dropped to a checkpoint to snap onto it
const BASE_SNAP = 95;  // how close an upgrade must be dropped to your own castle

// arrows: how many are loosed each hunt. damage: what each does to an animal.
export function newTeam() {
  return {
    meat: START_MEAT, hand: new Array(HAND_SIZE).fill(null),
    arrows: 1, damage: ARROW.damage, bought: { arrow: 0, damage: 0 },
    shots: 0, hunted: 0, // arrows loosed and meat they brought in, over the whole match
  };
}

// The odds of each card being dealt to `team` right now. See DEAL in config.js.
// A card on 0 is not dealt at all.
export function dealWeights(m, team) {
  const T = m.teams[team];
  const under = clamp((m.turn - DEAL.ramp[0]) / (DEAL.ramp[1] - DEAL.ramp[0]), 0, 1);
  return {
    melee: DEAL.melee,
    archer: DEAL.archer,
    arrow: T.arrows < UPGRADE.maxArrows ? DEAL.arrow : 0,
    damage: DEAL.damage,
    giant: lerp(DEAL.giant[0], DEAL.giant[1], under),
    tower: m.lanes.some(lane => checkpointsHeld([lane], team) >= DEAL.towerNeeds) ? DEAL.tower : 0,
  };
}

// Takes one card out of `pool`, picked by weight.
function draw(pool, weights) {
  let roll = Math.random() * pool.reduce((sum, id) => sum + weights[id], 0), k = 0;
  while (k < pool.length - 1 && (roll -= weights[pool[k]]) > 0) k++;
  return pool.splice(k, 1)[0];
}

// Deals a fresh hand: HAND_SIZE different cards drawn by weight. A hand always has
// warriors or archers in it, so there is never a turn with no basic troops to send.
export function dealHand(m, team) {
  const weights = dealWeights(m, team);
  let hand;
  do {
    const pool = CARD_ORDER.filter(id => weights[id] > 0);
    hand = [];
    while (hand.length < HAND_SIZE) hand.push(draw(pool, weights));
  } while (!hand.includes('melee') && !hand.includes('archer'));
  m.teams[team].hand = CARD_ORDER.filter(id => hand.includes(id));
}

// Puts a new card in hand[idx] in place of the one just played, drawn by weight from the
// cards not in the hand. The hand stays HAND_SIZE different cards, and the one that was
// played only comes straight back when there is nothing else left to deal.
function refill(m, team, idx) {
  const hand = m.teams[team].hand, weights = dealWeights(m, team);
  const pool = CARD_ORDER.filter(id => weights[id] > 0 && !hand.includes(id));
  hand[idx] = draw(pool, weights) ?? (weights[hand[idx]] > 0 ? hand[idx] : null);
}

// How far a team's troop cards have grown: the last line of MUSTER its volley has reached.
export function muster(T) {
  const power = (T.arrows * T.damage) / ARROW.damage;
  return MUSTER.reduce((best, tier) => (power >= tier.power ? tier : best));
}

// How many units a troop card sends for this team; 0 for any other card.
export function cardUnits(T, id) {
  return CARDS[id].zone !== 'lane' ? 0 : id === 'giant' ? muster(T).giants : muster(T).units;
}

// Some upgrades get dearer each time they are bought, and troop cards cost more as they
// grow to send more units.
export function cardCost(T, id) {
  const card = CARDS[id];
  if (card.zone === 'lane') return card.cost * muster(T).price;
  return card.cost + (card.step || 0) * (T.bought[id] || 0);
}

// Why a card can't be played right now: 'meat', 'spot' or null if it can.
export function cardBlocker(m, team, id) {
  const zone = CARDS[id].zone;
  if (m.teams[team].meat < cardCost(m.teams[team], id)) return 'meat';
  if (zone === 'lane' && !m.lanes.some(lane => placement(lane, team, id, cardUnits(m.teams[team], id)))) return 'spot';
  if (zone === 'checkpoint' && !towerSpots(m, team).length) return 'spot';
  return null;
}

// The point on a team's castle that upgrade cards are dropped onto.
export function basePoint(m, team) {
  const c = m.board.castles[team];
  return { x: c.x, y: c.drawY - 28 };
}

// Where a card may go, for highlighting while it is being dragged. A troop card only
// picks a road: its units step out of the home platform and walk up to their place in the
// column, so each road is given as the stretch from that platform to where they end up.
export function dropOptions(m, team, id) {
  const zone = CARDS[id].zone;
  if (zone === 'base') return { base: basePoint(m, team) };
  if (zone === 'lane') {
    return {
      lanes: m.lanes.map((lane, li) => {
        const spot = placement(lane, team, id, cardUnits(m.teams[team], id));
        return spot && { lane: li, from: homeSlot(team), slot: spot.slot, ...m.board.lanePoint(li, spot.slot) };
      }),
    };
  }
  return { spots: towerSpots(m, team).map(s => ({ ...s, ...m.board.lanePoint(s.lane, s.slot) })) };
}

// Resolves a drop at (x, y) to a concrete target for playCard. Troops go to whichever
// road is on that side of the board.
export function dropTarget(m, team, id, x, y, options) {
  const zone = CARDS[id].zone;
  if (zone === 'base') {
    return { valid: dist(x, y, options.base.x, options.base.y) < BASE_SNAP, ...options.base };
  }
  if (zone === 'lane') {
    const li = x < m.board.cx ? 0 : 1, spot = options.lanes[li];
    return spot ? { valid: true, ...spot } : { valid: false, lane: li, x, y };
  }
  let best = null, bd = SNAP;
  for (const s of options.spots) {
    const d = dist(x, y, s.x, s.y);
    if (d < bd) { bd = d; best = s; }
  }
  return best ? { valid: true, ...best } : { valid: false, x, y };
}

// Pays for hand[idx] and applies it, then refills the slot with a new card.
// Returns { units, lane } for troops, the new tower, { upgrade: id } for an upgrade, or
// null if illegal.
export function playCard(m, team, idx, target) {
  const T = m.teams[team], id = T.hand[idx], card = CARDS[id];
  if (!card) return null;
  const cost = cardCost(T, id);
  if (T.meat < cost) return null;
  let ent;
  if (card.zone === 'lane') {
    // New units appear on the home platform and walk up to their place in the column.
    const home = homeSlot(team) - dirOf(team) * 0.6;
    const units = placeUnits(m.lanes[target.lane], team, id, cardUnits(T, id), kind => ({
      ...newUnit(m.nextId++, team, kind),
      vis: home, lat: 0, walking: false, lunge: 0, lx: 0, ly: 0, flash: 0,
    }));
    if (!units) return null;
    ent = { units, lane: target.lane };
  } else if (card.zone === 'checkpoint') {
    if (!towerSpots(m, team).some(s => s.lane === target.lane && s.slot === target.slot)) return null;
    const u = UNITS.tower;
    ent = {
      id: m.nextId++, team, lane: target.lane, slot: target.slot,
      hp: u.hp, maxHp: u.hp, range: u.range, flash: 0, born: 0,
    };
    m.lanes[target.lane].towers.push(ent);
  } else {
    if (id === 'arrow') T.arrows++;
    else T.damage += UPGRADE.damage;
    T.bought[id]++;
    ent = { upgrade: id };
  }
  T.meat -= cost;
  refill(m, team, idx);
  return ent;
}
