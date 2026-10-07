import { BLUE, LANE_LEN, CARDS, UNITS, HTOWER } from './config.js';
import { simulateShot } from './arrow.js';
import { cardBlocker } from './cards.js';
import {
  deploySlots, towerSpots, centerLine, centerValid, frontier, homeSlot, advance, laneStep,
} from './rules.js';
import { rand, pick, lerp, dist, clamp } from './utils.js';

// The computer player. Written for either team so matches can be simulated AI vs AI.

const MIN_ELEV = 0.16;

// Try a spread of angles and keep the most rewarding one, then wobble it by the level's error.
export function chooseAim(m, team, lvl) {
  const lo = team === BLUE ? -Math.PI + MIN_ELEV : MIN_ELEV;
  const hi = team === BLUE ? -MIN_ELEV : Math.PI - MIN_ELEV;
  const foeHp = m.castles[1 - team].hp;
  let best = null;
  for (let i = 0; i < lvl.aimSamples; i++) {
    const ang = lerp(lo, hi, (i + Math.random()) / lvl.aimSamples);
    const r = simulateShot(m, team, ang);
    let score = r.meat + r.castle * 2 + r.htower * 0.8 + rand(2);
    if (r.castle >= foeHp) score += 1000;
    if (!best || score > best.score) best = { ang, score };
  }
  return clamp(best.ang + rand(-lvl.aimError, lvl.aimError), lo, hi);
}

// Best place in the build zone for a hunter tower: wherever the most animals are in reach.
function htowerSpot(m, team) {
  const b = m.board, line = centerLine(m, team);
  const y0 = team === BLUE ? line : b.FT + 30, y1 = team === BLUE ? b.FB - 30 : line;
  let best = null;
  for (let i = 0; i < 40; i++) {
    const x = b.cx + rand(-b.a + 28, b.a - 28), y = rand(y0, y1);
    if (!centerValid(m, team, x, y)) continue;
    let n = 0;
    for (const a of m.animals) if (dist(x, y, a.x, a.y) - a.r < HTOWER.range) n++;
    for (const t of m.htowers) if (t.team === team && dist(x, y, t.x, t.y) < HTOWER.range) n -= 0.7;
    if (!best || n + rand(0.3) > best.score) best = { x, y, score: n + rand(0.3), n };
  }
  return best;
}

// Smartest free slot for a troop card, judged by where the squad stands after its free
// step. Squads strike as they arrive, so the aim is to land just outside the enemy's
// reach and get the charge in first. Archers also want warriors in front of them.
function bestSlot(m, team, li, kind, slots) {
  const lane = m.lanes[li], home = homeSlot(team), u = UNITS[kind];
  const toHome = slot => Math.abs(slot - home);
  let best = null;
  for (const slot of slots) {
    const land = advance(lane, { team, kind, slot, range: u.range, speed: u.speed });
    let foe = null, d = Infinity;
    for (const f of lane.squads) {
      const ahead = toHome(f.slot) - toHome(land);
      if (f.team !== team && ahead > 0 && ahead < d) { d = ahead; foe = f; }
    }
    const shielded = lane.squads.some(q =>
      q.team === team && q.kind === 'melee' && toHome(q.slot) > toHome(land) && toHome(q.slot) - toHome(land) <= 3);
    let score = toHome(land) * 0.5;
    if (foe && !shielded) score += d <= foe.speed + foe.range ? (kind === 'melee' ? -6 : -12) : 6;
    if (kind === 'archer' && shielded) score += 10;
    if (!best || score > best.score) best = { slot, score };
  }
  return best;
}

// How good the lanes look for `team` once `rounds` more rounds have played out with no
// new cards: castle damage traded (sooner counts more), plus troops and ground left.
function lookAhead(m, lanes, team, rounds) {
  const foe = 1 - team;
  let score = 0, dealt = 0, taken = 0;
  for (let r = 0; r < rounds; r++) {
    for (const side of [foe, team]) {
      for (const lane of lanes) {
        for (const act of laneStep(lane, side)) {
          if (act.type !== 'attack' || act.kind !== 'castle') continue;
          if (side === team) dealt += act.dmg; else taken += act.dmg;
          score += (side === team ? 1 : -1) * act.dmg * 1.5 * Math.pow(0.9, r);
        }
      }
    }
  }
  if (dealt >= m.castles[foe].hp) score += 400;
  if (taken >= m.castles[team].hp) score -= 400;
  for (const lane of lanes) {
    for (const q of lane.squads) score += (q.team === team ? 1 : -1) * (q.hp / q.maxHp) * 20;
    for (const t of lane.towers) score += (t.team === team ? 1 : -1) * (t.hp / t.maxHp) * 8;
    score += 0.4 * (Math.abs(frontier(lane, team) - homeSlot(team)) - Math.abs(frontier(lane, foe) - homeSlot(foe)));
  }
  return score;
}

// Every lane play in hand, scored by how much it improves the look-ahead.
function deepLaneOptions(m, team, lvl) {
  const T = m.teams[team], opts = [];
  const copy = () => JSON.parse(JSON.stringify(m.lanes));
  const base = lookAhead(m, copy(), team, lvl.lookahead);
  T.hand.forEach((id, idx) => {
    if (!id || cardBlocker(m, team, id)) return;
    if (CARDS[id].zone === 'lane') {
      const u = UNITS[id];
      for (const li of [0, 1]) {
        for (const slot of deploySlots(m, team, li)) {
          const lanes = copy();
          const sq = { id: -1, team, kind: id, slot, hp: u.hp, maxHp: u.hp, atk: u.atk, siege: u.siege, range: u.range, speed: u.speed };
          sq.slot = advance(lanes[li], sq);
          lanes[li].squads.push(sq);
          opts.push({ idx, target: { lane: li, slot }, score: 30 + lookAhead(m, lanes, team, lvl.lookahead) - base + rand(2) });
        }
      }
    } else if (CARDS[id].zone === 'checkpoint') {
      const u = UNITS.tower;
      for (const spot of towerSpots(m, team)) {
        const lanes = copy();
        lanes[spot.lane].towers.push({ id: -1, team, slot: spot.slot, hp: u.hp, maxHp: u.hp, atk: u.atk, range: u.range });
        opts.push({ idx, target: spot, score: 22 + lookAhead(m, lanes, team, lvl.lookahead) - base + rand(2) });
      }
    }
  });
  return opts;
}

// Picks one playable card and where to put it, or null to stop spending.
export function chooseCard(m, team, lvl) {
  const T = m.teams[team], home = homeSlot(team);
  const toHome = slot => Math.abs(slot - home);

  const lanes = m.lanes.map(L => {
    let threat = 0, own = 0, melee = 0, lead = null;
    for (const sq of L.squads) {
      if (sq.team === team) {
        own += sq.hp;
        if (sq.kind === 'melee') melee++;
      } else {
        threat += sq.hp;
        if (!lead || toHome(sq.slot) < toHome(lead.slot)) lead = sq;
      }
    }
    // urgency: how close their lead squad is to our gate, 0..1
    return { threat, own, melee, urgency: lead ? 1 - toHome(lead.slot) / LANE_LEN : 0, front: frontier(L, team) };
  });

  const careful = Math.random() < lvl.smart, deep = careful && lvl.lookahead > 0;
  const opts = deep ? deepLaneOptions(m, team, lvl) : [];
  T.hand.forEach((id, idx) => {
    if (!id || cardBlocker(m, team, id)) return;
    const zone = CARDS[id].zone;
    if (deep && zone !== 'center') return; // already scored by the look-ahead

    if (zone === 'lane') {
      for (const li of [0, 1]) {
        const slots = deploySlots(m, team, li);
        if (!slots.length) continue;
        const info = lanes[li], spot = bestSlot(m, team, li, id, slots);
        let score = 40 + spot.score * 0.5 + rand(10);
        if (info.threat) score += Math.max(0, info.threat - info.own) * 0.5 + info.urgency * 30;
        else score += 12; // open road to the castle
        if (toHome(info.front) >= LANE_LEN - 5) score += 10; // keep a siege fed
        if (id === 'archer' && !info.melee) score -= 12; // nobody to hide behind
        opts.push({ idx, target: { lane: li, slot: spot.slot }, score, slots });
      }
    } else if (id === 'htower') {
      const mine = m.htowers.filter(t => t.team === team).length;
      const p = htowerSpot(m, team);
      if (p && p.n >= 1 && mine < 3) opts.push({ idx, target: p, score: 34 + p.n * 12 - mine * 14 + (m.turn <= 4 ? 12 : 0) + rand(8) });
    } else {
      const spots = towerSpots(m, team);
      if (!spots.length) return;
      spots.sort((p, q) => lanes[q.lane].threat - lanes[p.lane].threat || toHome(q.slot) - toHome(p.slot));
      const s = spots[0];
      opts.push({ idx, target: s, score: 18 + lanes[s.lane].urgency * 20 + (toHome(s.slot) >= LANE_LEN / 2 ? 8 : 0) + rand(8) });
    }
  });

  if (!opts.length) return null;
  if (!careful) {
    // A careless pick: any card, and troops dropped on any free slot.
    const o = pick(opts);
    if (o.slots) o.target = { lane: o.target.lane, slot: pick(o.slots) };
    return o;
  }
  opts.sort((p, q) => q.score - p.score);
  return opts[0];
}
