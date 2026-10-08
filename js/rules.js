import { BLUE, RED, LANE_LEN, CHECKPOINTS, CASTLE, UNITS } from './config.js';

// Who may stand and move where, and how a lane fights. Pure functions over match state.

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

// Marching order in a column: giants lead, warriors follow, archers bring up the rear.
const RANK = { archer: 0, melee: 1, giant: 2 };

// Moves a squad one step: up to `speed` slots forward, stopping the moment an enemy comes
// into range. A squad that outranks the friend ahead of it swaps places with them, so
// giants and warriors work their way to the front and push the others back a slot each.
// That costs a slot of movement like any other; nobody gets extra steps for it.
// Mutates the lane and returns the friendly squads that were pushed back.
export function advance(lane, s) {
  const dir = dirOf(s.team), gate = homeSlot(1 - s.team), pushed = [];
  for (let used = 0; used < s.speed; used++) {
    if (laneTarget(lane, s.team, s.slot, s.range)) break;
    const next = s.slot + dir;
    if (next === gate) break;
    const tw = towerAt(lane, next);
    if (tw && tw.team !== s.team) break;
    const other = squadAt(lane, next);
    if (other) {
      if (other.team !== s.team || RANK[other.kind] >= RANK[s.kind]) break;
      other.slot = s.slot;
      if (!pushed.includes(other)) pushed.push(other);
    }
    s.slot = next;
  }
  return pushed;
}

// The blow a squad would land from where it stands, as an 'attack' action, or null if
// nothing is in range. How hard it lands depends on who is hitting whom.
export function strikeAct(lane, sq) {
  const tgt = laneTarget(lane, sq.team, sq.slot, sq.range);
  if (!tgt) return null;
  const table = UNITS[sq.kind].dmg;
  if (tgt.type === 'castle') return { type: 'attack', by: sq.id, to: sq.slot, kind: 'castle', dmg: table.castle };
  const dmg = tgt.type === 'tower' ? table.tower : table[tgt.ref.kind];
  return { type: 'attack', by: sq.id, to: sq.slot, kind: tgt.type, target: tgt.ref.id, slot: tgt.ref.slot, dmg };
}

// Applies an 'attack' action's damage to the lane it was worked out on.
function land(lane, act) {
  if (act.kind === 'castle') return;
  const list = act.kind === 'squad' ? lane.squads : lane.towers;
  const e = list.find(o => o.id === act.target);
  if (!e) return;
  e.hp -= act.dmg;
  if (e.hp <= 0) list.splice(list.indexOf(e), 1);
}

// A squad that has just been dropped on the lane takes its free step and, if that brings
// something into range, strikes it. Mutates the lane; returns the blow, if any.
export function dropStep(lane, sq) {
  advance(lane, sq);
  const act = strikeAct(lane, sq);
  if (act) land(lane, act);
  return act;
}

// Plays out one team's whole step on `lane`, mutating it, and returns what happened in
// order. The game runs this on a copy and replays the result with animation; the AI runs
// it on copies to look ahead. Entities are referred to by id so a plan can be replayed.
//   { type: 'guard', target, dmg }                      castle guards shoot a squad
//   { type: 'tower', by, target, dmg }                  guard tower shoots a squad
//   { type: 'move', by, to }                            squad walks
//   { type: 'attack', by, to, kind, target, slot, dmg } squad walks to `to` (if it is not
//                                                       there already), then strikes;
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
    const dmg = CASTLE.guard[raider.kind];
    acts.push({ type: 'guard', target: raider.id, dmg });
    hurt(lane.squads, raider, dmg);
  }

  for (const tw of lane.towers.filter(t => t.team === team)) {
    const foe = nearest(tw.slot, tw.range);
    if (!foe) continue;
    const dmg = UNITS.tower.dmg[foe.kind];
    acts.push({ type: 'tower', by: tw.id, target: foe.id, dmg });
    hurt(lane.squads, foe, dmg);
  }

  const front = (p, q) => dir * (q.slot - p.slot);
  const squads = lane.squads.filter(q => q.team === team);

  // First every squad with something in reach strikes where it stands, front to back.
  for (const sq of squads.slice().sort(front)) {
    const act = strikeAct(lane, sq);
    if (!act) continue;
    acts.push(act);
    land(lane, act);
  }

  // Then the column moves. Giants go first, then warriors, then archers, so each rank
  // swaps its way past the ones that belong behind it and the rest close up after.
  // A squad whose step ends with an enemy in reach strikes again.
  for (const sq of squads.slice().sort((p, q) => RANK[q.kind] - RANK[p.kind] || front(p, q))) {
    if (!lane.squads.includes(sq)) continue;
    const from = sq.slot;
    for (const o of advance(lane, sq)) acts.push({ type: 'move', by: o.id, to: o.slot });
    if (sq.slot === from) continue;
    const act = strikeAct(lane, sq);
    if (act) {
      acts.push(act);
      land(lane, act);
    } else {
      acts.push({ type: 'move', by: sq.id, to: sq.slot });
    }
  }
  return acts;
}
