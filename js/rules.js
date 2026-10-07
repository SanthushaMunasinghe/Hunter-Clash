import { BLUE, RED, LANE_LEN, CHECKPOINTS, CASTLE, HTOWER, HUNTER, CENTER_ZONE } from './config.js';
import { gap } from './utils.js';

// Who may stand, move and build where. Pure functions over match state.

// ------------------------------------------------------------------ lanes

export const dirOf = team => (team === BLUE ? 1 : -1);
export const homeSlot = team => (team === BLUE ? 0 : LANE_LEN);

export const squadAt = (lane, slot) => lane.squads.find(s => s.slot === slot);
export const towerAt = (lane, slot) => lane.towers.find(t => t.slot === slot);

// Forward-most slot a team holds in a lane: its lead squad or guard tower, else its home slot.
export function frontier(lane, team) {
  let f = homeSlot(team);
  for (const list of [lane.squads, lane.towers]) {
    for (const e of list) {
      if (e.team === team) f = team === BLUE ? Math.max(f, e.slot) : Math.min(f, e.slot);
    }
  }
  return f;
}

// A checkpoint belongs to whoever's front line has reached it. Lose the units holding
// the line and the checkpoints go with them.
export function cpOwner(lane, slot) {
  if (slot <= frontier(lane, BLUE)) return BLUE;
  if (slot >= frontier(lane, RED)) return RED;
  return -1;
}

// Slot of the forward-most checkpoint a team holds, or its home slot if it holds none.
export function deployLimit(lane, team) {
  const f = frontier(lane, team);
  let lim = homeSlot(team);
  for (const c of CHECKPOINTS) {
    if (team === BLUE ? c <= f && c > lim : c >= f && c < lim) lim = c;
  }
  return lim;
}

// Free slots a team may drop a squad on: anywhere from its gate to its forward-most checkpoint.
export function deploySlots(m, team, li) {
  const lane = m.lanes[li], lim = deployLimit(lane, team), dir = dirOf(team), out = [];
  for (let s = homeSlot(team); team === BLUE ? s <= lim : s >= lim; s += dir) {
    if (!squadAt(lane, s)) out.push(s);
  }
  return out;
}

// Held checkpoints without a guard tower yet.
export function towerSpots(m, team) {
  const out = [];
  m.lanes.forEach((lane, li) => {
    for (const slot of CHECKPOINTS) {
      if (cpOwner(lane, slot) === team && !towerAt(lane, slot)) out.push({ lane: li, slot });
    }
  });
  return out;
}

// First enemy thing within `range` slots ahead of `slot`. The enemy's home slot doubles
// as the castle gate: if nobody is standing on it, the castle itself is the target.
export function laneTarget(lane, team, slot, range) {
  const dir = dirOf(team), gate = homeSlot(1 - team);
  for (let k = 1; k <= range; k++) {
    const s = slot + dir * k;
    if (s < 0 || s > LANE_LEN) break;
    const sq = squadAt(lane, s);
    if (sq && sq.team !== team) return { type: 'squad', ref: sq };
    const tw = towerAt(lane, s);
    if (tw && tw.team !== team) return { type: 'tower', ref: tw };
    if (s === gate) return { type: 'castle' };
  }
  return null;
}

// Where a squad ends up after one step: up to `speed` slots forward, stopping the moment
// an enemy comes into range. Archers therefore hold at arm's length, while melee squads
// walk past friendly archers to meet the enemy head on.
export function advance(lane, s) {
  const dir = dirOf(s.team), gate = homeSlot(1 - s.team);
  let pos = s.slot, used = 0;
  while (used < s.speed) {
    if (laneTarget(lane, s.team, pos, s.range)) break;
    let next = pos + dir, cost = 1;
    while (s.kind === 'melee' && next !== gate) {
      const o = squadAt(lane, next);
      if (!o || o.team !== s.team || o.kind !== 'archer') break;
      next += dir;
      cost++;
    }
    if (next === gate || used + cost > s.speed || squadAt(lane, next)) break;
    const tw = towerAt(lane, next);
    if (tw && tw.team !== s.team) break;
    pos = next;
    used += cost;
  }
  return pos;
}

// Plays out one team's whole step on `lane`, mutating it, and returns what happened in
// order. The game runs this on a copy and replays the result with animation; the AI runs
// it on copies to look ahead. Entities are referred to by id so a plan can be replayed.
//   { type: 'guard', target, dmg }                      castle guards shoot a squad
//   { type: 'tower', by, target, dmg }                  guard tower shoots a squad
//   { type: 'move', by, to }                            squad walks
//   { type: 'attack', by, to, kind, target, slot, dmg } squad walks to `to`, then strikes;
//                                                       kind is 'squad', 'tower' or 'castle'
export function laneStep(lane, team) {
  const acts = [], enemy = 1 - team, dir = dirOf(team);
  const hurt = (list, e, dmg) => {
    e.hp -= dmg;
    if (e.hp <= 0) list.splice(list.indexOf(e), 1);
  };
  const nearest = (slot, range) => {
    let best = null;
    for (const q of lane.squads) {
      const d = Math.abs(q.slot - slot);
      if (q.team === enemy && d <= range && (!best || d < Math.abs(best.slot - slot))) best = q;
    }
    return best;
  };

  const raider = nearest(homeSlot(team), CASTLE.guardSlots);
  if (raider) {
    acts.push({ type: 'guard', target: raider.id, dmg: CASTLE.guardDmg });
    hurt(lane.squads, raider, CASTLE.guardDmg);
  }

  for (const tw of lane.towers.filter(t => t.team === team)) {
    const foe = nearest(tw.slot, tw.range);
    if (!foe) continue;
    acts.push({ type: 'tower', by: tw.id, target: foe.id, dmg: tw.atk });
    hurt(lane.squads, foe, tw.atk);
  }

  // Front squads go first so the ones behind can close up or walk past. Each steps
  // forward until something is in reach, then strikes: a charge lands the same turn.
  const squads = lane.squads.filter(q => q.team === team).sort((p, q) => dir * (q.slot - p.slot));
  for (const sq of squads) {
    const to = advance(lane, sq), moved = to !== sq.slot;
    sq.slot = to;
    const tgt = laneTarget(lane, team, to, sq.range);
    if (!tgt) {
      if (moved) acts.push({ type: 'move', by: sq.id, to });
      continue;
    }
    if (tgt.type === 'castle') {
      acts.push({ type: 'attack', by: sq.id, to, kind: 'castle', dmg: sq.siege });
    } else {
      acts.push({ type: 'attack', by: sq.id, to, kind: tgt.type, target: tgt.ref.id, slot: tgt.ref.slot, dmg: sq.atk });
      hurt(tgt.type === 'squad' ? lane.squads : lane.towers, tgt.ref, sq.atk);
    }
  }
  return acts;
}

// ------------------------------------------------------------------ centre field

export const hunterShape = (x, y) => ({ x, y, h: 0, r: HUNTER.r });
export const htowerShape = (x, y) => ({ x, y, h: 0, r: HTOWER.r });
export const castleShape = c => ({ x: c.x, y: c.y, h: CASTLE.halfLen, r: CASTLE.r });

// How far up the field a team's hunters may ever walk or build.
export function centerLimit(m, team) {
  const { FT, FB } = m.board, fh = FB - FT;
  return team === BLUE ? FT + fh * CENTER_ZONE.limit : FB - fh * CENTER_ZONE.limit;
}

// Y of the edge of a team's build zone. Blue builds below it, red above it. It follows
// the team's forward-most hunter or hunter tower, and falls back when they die.
export function centerLine(m, team) {
  const { FT, FB } = m.board, fh = FB - FT, limit = centerLimit(m, team);
  if (team === BLUE) {
    let y = FB - fh * CENTER_ZONE.depth;
    for (const list of [m.hunters, m.htowers]) for (const e of list) if (e.team === BLUE) y = Math.min(y, e.y);
    return Math.max(y, limit);
  }
  let y = FT + fh * CENTER_ZONE.depth;
  for (const list of [m.hunters, m.htowers]) for (const e of list) if (e.team === RED) y = Math.max(y, e.y);
  return Math.min(y, limit);
}

// Whether a hunter or hunter tower physically fits at (x, y). `skip` is left out of the
// overlap test (a hunter checking its own next step).
export function centerFits(m, kind, x, y, skip = null) {
  const b = m.board, me = kind === 'htower' ? htowerShape(x, y) : hunterShape(x, y);
  if (b.fieldG(x, y, me.r + 8) >= 1) return false;
  for (const c of b.castles) if (gap(me, castleShape(c)) < 12) return false;
  for (const h of m.hunters) if (h !== skip && gap(me, hunterShape(h.x, h.y)) < 4) return false;
  for (const t of m.htowers) if (t !== skip && gap(me, htowerShape(t.x, t.y)) < 4) return false;
  return true;
}

export function centerValid(m, team, kind, x, y) {
  const line = centerLine(m, team);
  if (team === BLUE ? y < line - 0.5 : y > line + 0.5) return false;
  return centerFits(m, kind, x, y);
}
