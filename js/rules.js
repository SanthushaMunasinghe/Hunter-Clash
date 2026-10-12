import { BLUE, RED, LANE_LEN, CHECKPOINTS, CASTLE, UNITS, ROW, MARCH } from './config.js';

// Who may stand and move where, and how a lane fights. Pure functions over match state.
//
// A lane holds one column of troops per team and any guard towers:
//   { cols: [{ front, units }, { front, units }], towers }
// units are in the order they were sent, oldest first. They stand in rows one slot
// apart, the first row on slot `front` and the rest stacked behind it toward home.
// How they are shared out among those rows is worked out from the list every time.

// ------------------------------------------------------------------ lanes

export const dirOf = team => (team === BLUE ? 1 : -1);
export const homeSlot = team => (team === BLUE ? 0 : LANE_LEN);

export const newLane = () => ({ cols: [{ front: 0, units: [] }, { front: 0, units: [] }], towers: [] });
export const towerAt = (lane, slot) => lane.towers.find(t => t.slot === slot);

// Forms units up into rows. A row is ROW spaces of one class: warriors and giants share
// rows, archers keep to their own. Taking the units in the order they were sent, each
// joins the first row of its class that has room for it, or starts a new row at the
// back. So a row is filled before another of its class begins, and melee sent after
// archers still go forward to fill the gaps in a melee row ahead of them.
// Melee always hold the front: if the first row would be archers, the first melee row
// stands in front of it instead.
function pack(units) {
  const rows = [];
  for (const u of units) {
    const cls = u.kind === 'archer' ? 'archer' : 'melee', size = UNITS[u.kind].size;
    let row = rows.find(r => r.cls === cls && r.used + size <= ROW);
    if (!row) rows.push(row = { cls, used: 0, units: [] });
    row.units.push(u);
    row.used += size;
  }
  const lead = rows.findIndex(r => r.cls === 'melee');
  if (lead > 0) rows.unshift(...rows.splice(lead, 1));
  return rows;
}

// A team's column as rows, front row first: { cls, used, units, slot }. Worked out afresh
// from the units each time, so the column closes up by itself as units fall.
export function rowsOf(lane, team) {
  const col = lane.cols[team], dir = dirOf(team);
  return pack(col.units).map((row, i) => ({ ...row, slot: col.front - dir * i }));
}

// Where each unit of a row stands across the road, in spaces from the middle of it:
// giants in the centre, everyone else shared out to either side of them.
export function rowSpots(row) {
  const giants = row.units.filter(u => u.kind === 'giant'), rest = row.units.filter(u => u.kind !== 'giant');
  const half = Math.floor(rest.length / 2), spots = new Map();
  let x = -row.used / 2;
  for (const u of [...rest.slice(0, half), ...giants, ...rest.slice(half)]) {
    const w = UNITS[u.kind].size;
    spots.set(u, x + w / 2);
    x += w;
  }
  return spots;
}

// How far a row of that class can hit, in slots.
const reachOf = cls => (cls === 'archer' ? UNITS.archer.range : UNITS.melee.range);

// Forward-most slot a team holds in a lane: its front row or guard tower, else its home slot.
export function frontier(lane, team) {
  const col = lane.cols[team];
  let f = col.units.length ? col.front : homeSlot(team);
  for (const t of lane.towers) {
    if (t.team === team) f = team === BLUE ? Math.max(f, t.slot) : Math.min(f, t.slot);
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

// How many checkpoints a team holds across `lanes`.
export function checkpointsHeld(lanes, team) {
  let n = 0;
  for (const lane of lanes) for (const slot of CHECKPOINTS) if (cpOwner(lane, slot) === team) n++;
  return n;
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

// The nearest enemy thing ahead of `slot`, as { type, dist, ref }: the enemy's front row,
// a guard tower, or the castle behind the enemy's home slot. A row shields whatever it
// is standing on.
function aheadOf(lane, team, slot) {
  const dir = dirOf(team), foe = lane.cols[1 - team];
  let best = { type: 'castle', dist: dir * (homeSlot(1 - team) - slot) };
  for (const t of lane.towers) {
    const d = dir * (t.slot - slot);
    if (t.team !== team && d > 0 && d < best.dist) best = { type: 'tower', dist: d, ref: t };
  }
  if (foe.units.length) {
    const d = dir * (foe.front - slot);
    if (d > 0 && d <= best.dist) best = { type: 'row', dist: d };
  }
  return best;
}

// How far a column fronted on `front` can walk, up to `max` slots. It cannot pass the
// enemy's column, a guard tower or the enemy gate, and with `reach` it halts as soon as
// one of them is that close.
function room(lane, team, front, max, reach = 1) {
  return Math.max(0, Math.min(max, aheadOf(lane, team, front).dist - reach));
}

// ------------------------------------------------------------------ placing troops

// Where a team's first row forms up in an empty lane: on the forward-most checkpoint it
// holds (through a guard tower), failing that the first checkpoint out of its gate, or
// as near to that as the enemy allows.
function musterSlot(lane, team) {
  const home = homeSlot(team), dir = dirOf(team), f = frontier(lane, team);
  let goal = team === BLUE ? CHECKPOINTS[0] : CHECKPOINTS[CHECKPOINTS.length - 1];
  for (const c of CHECKPOINTS) if (dir * (c - goal) > 0 && dir * (f - c) >= 0) goal = c;
  return home + dir * room(lane, team, home, dir * (goal - home));
}

// Where a team's column would stand with `count` more units of `kind` added to it: { front,
// slot } with `slot` the forward-most row the newcomers fall into, or null if there is
// no room for them. New units never move the front line unless the column already reaches
// back to the home slot; then the whole column is pushed forward to make room, which
// the enemy can block.
export function placement(lane, team, kind, count) {
  const col = lane.cols[team], dir = dirOf(team), home = homeSlot(team);
  const fresh = Array.from({ length: count }, () => ({ kind }));
  const rows = pack([...col.units, ...fresh]);
  let front = col.units.length ? col.front : musterSlot(lane, team);
  const push = rows.length - (dir * (front - home) + 1);
  if (push > 0) {
    if (room(lane, team, front, push) < push) return null;
    front += dir * push;
  }
  return { front, slot: front - dir * rows.findIndex(row => row.units.some(u => fresh.includes(u))) };
}

// Plays a troop card: adds `count` units of `kind` to the team's column. make(kind)
// builds one unit. Returns the new units, or null if the lane has no room for them.
export function placeUnits(lane, team, kind, count, make) {
  const spot = placement(lane, team, kind, count);
  if (!spot) return null;
  const col = lane.cols[team], fresh = [];
  for (let i = 0; i < count; i++) fresh.push(make(kind));
  col.front = spot.front;
  col.units.push(...fresh);
  return fresh;
}

// A bare unit, with nothing but what the rules need.
export const newUnit = (id, team, kind) => ({ id, team, kind, hp: UNITS[kind].hp, maxHp: UNITS[kind].hp });

// ------------------------------------------------------------------ fighting

// Lands a volley of blows on the enemy's front row as it stands. Each blow goes to the
// first unit in line that the blows before it have not already finished, so none is
// wasted on a dead man, but a volley never reaches past the front row: blows left over
// once it has fallen are lost. The dead are removed and the column closes up.
// blows: [{ by, dmg }] with dmg a table by unit kind. Returns the hits that landed.
function hitRow(lane, foe, blows) {
  const col = lane.cols[foe], row = pack(col.units)[0], hits = [];
  for (const b of blows) {
    const u = row.units.find(q => q.hp > 0);
    if (!u) break;
    u.hp -= b.dmg[u.kind];
    hits.push({ by: b.by, kind: 'unit', target: u.id, dmg: b.dmg[u.kind] });
  }
  col.units = col.units.filter(u => u.hp > 0);
  return hits;
}

// One row's blows against the nearest enemy thing within its reach.
function strike(lane, team, row) {
  const tgt = aheadOf(lane, team, row.slot), hits = [];
  if (tgt.dist > reachOf(row.cls)) return hits;
  const blows = row.units.map(u => ({ by: u.id, dmg: UNITS[u.kind].dmg }));
  if (tgt.type === 'row') return hitRow(lane, 1 - team, blows);
  for (const b of blows) {
    if (tgt.type === 'castle') hits.push({ by: b.by, kind: 'castle', dmg: b.dmg.castle });
    else if (tgt.ref.hp > 0) {
      tgt.ref.hp -= b.dmg.tower;
      hits.push({ by: b.by, kind: 'tower', target: tgt.ref.id, dmg: b.dmg.tower });
    }
  }
  lane.towers = lane.towers.filter(t => t.hp > 0);
  return hits;
}

// A team's defences on `lane`, fired once its side has hunted: the castle's arrows, then
// one from each guard tower, at the enemy's front row if it has come close enough.
// Mutates the lane and returns what happened, in order:
//   { type: 'guard', hits }      the castle shoots
//   { type: 'tower', by, hits }  a guard tower shoots
// with hits as [{ kind: 'unit', target, dmg }].
export function laneGuard(lane, team) {
  const acts = [], foe = lane.cols[1 - team];
  const near = (slot, range) => foe.units.length && Math.abs(foe.front - slot) <= range;
  if (near(homeSlot(team), CASTLE.guardSlots)) {
    const blows = Array.from({ length: CASTLE.arrows }, () => ({ dmg: CASTLE.arrow }));
    acts.push({ type: 'guard', hits: hitRow(lane, 1 - team, blows) });
  }
  for (const tw of lane.towers) {
    if (tw.team !== team || !near(tw.slot, UNITS.tower.range)) continue;
    acts.push({ type: 'tower', by: tw.id, hits: hitRow(lane, 1 - team, [{ dmg: UNITS.tower.dmg }]) });
  }
  return acts;
}

// A team's troops on `lane` at the end of its turn. The front row strikes whatever it
// can reach, then each row of archers behind it that is in range shoots as well. After
// that the column marches: up to MARCH slots, halting when its front row has something
// to hit. Mutates the lane and returns what happened, in order. The game runs this on a
// copy and replays the result with animation; the AI runs it on copies to look ahead.
// Units and towers are referred to by id so a plan can be replayed.
//   { type: 'volley', hits }  one row strikes; hits as [{ by, kind, target, dmg }] with
//                             kind 'unit', 'tower' or 'castle'
//   { type: 'move', to }      the column's front row walks to slot `to`
export function laneFight(lane, team) {
  const acts = [], col = lane.cols[team], rows = rowsOf(lane, team);
  rows.forEach((row, i) => {
    if (i && row.cls !== 'archer') return;
    const hits = strike(lane, team, row);
    if (hits.length) acts.push({ type: 'volley', hits });
  });
  if (rows.length) {
    const step = room(lane, team, col.front, MARCH, reachOf(rows[0].cls));
    if (step) {
      col.front += dirOf(team) * step;
      acts.push({ type: 'move', to: col.front });
    }
  }
  return acts;
}
