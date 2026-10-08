import { BLUE, LANE_LEN, CARDS, UNITS, TURN_LIMIT } from './config.js';
import { simulateVolley } from './arrow.js';
import { cardBlocker, cardCost, basePoint } from './cards.js';
import { deploySlots, towerSpots, frontier, homeSlot, advance, laneStep } from './rules.js';
import { rand, pick, lerp, clamp } from './utils.js';

// The computer player. Written for either team so matches can be simulated AI vs AI.

const MIN_ELEV = 0.16;

// Try a spread of angles and keep the one whose volley brings in the most, then wobble
// it by the level's error. Better levels lead moving animals.
export function chooseAim(m, team, lvl) {
  const lo = team === BLUE ? -Math.PI + MIN_ELEV : MIN_ELEV;
  const hi = team === BLUE ? -MIN_ELEV : Math.PI - MIN_ELEV;
  const foeHp = m.castles[1 - team].hp;
  let best = null;
  for (let i = 0; i < lvl.aimSamples; i++) {
    const ang = lerp(lo, hi, (i + Math.random()) / lvl.aimSamples);
    const r = simulateVolley(m, team, ang, lvl.lead);
    let score = r.meat + r.castle * 2 + rand(2);
    if (r.castle >= foeHp) score += 1000;
    if (!best || score > best.score) best = { ang, score };
  }
  return clamp(best.ang + rand(-lvl.aimError, lvl.aimError), lo, hi);
}

const newSquad = (team, kind, slot) => {
  const u = UNITS[kind];
  return { id: -1, team, kind, slot, hp: u.hp, maxHp: u.hp, range: u.range, speed: u.speed };
};

// Smartest free slot for a troop card, judged by where the squad stands after its free
// step. Squads strike as they arrive, so the aim is to land just outside the enemy's
// reach and get the charge in first. Archers also want a front-liner ahead of them.
function bestSlot(m, team, li, kind, slots) {
  const lane = m.lanes[li], home = homeSlot(team);
  const toHome = slot => Math.abs(slot - home);
  let best = null;
  for (const slot of slots) {
    const land = advance(lane, newSquad(team, kind, slot));
    let foe = null, d = Infinity;
    for (const f of lane.squads) {
      const ahead = toHome(f.slot) - toHome(land);
      if (f.team !== team && ahead > 0 && ahead < d) { d = ahead; foe = f; }
    }
    const shielded = lane.squads.some(q =>
      q.team === team && q.kind !== 'archer' && toHome(q.slot) > toHome(land) && toHome(q.slot) - toHome(land) <= 3);
    let score = toHome(land) * 0.5;
    if (foe && !shielded) score += d <= foe.speed + foe.range ? (kind === 'archer' ? -12 : -6) : 6;
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
    for (const q of lane.squads) score += (q.team === team ? 1 : -1) * (q.hp / q.maxHp) * CARDS[q.kind].cost * 0.5;
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
      for (const li of [0, 1]) {
        for (const slot of deploySlots(m, team, li)) {
          const lanes = copy(), sq = newSquad(team, id, slot);
          sq.slot = advance(lanes[li], sq);
          lanes[li].squads.push(sq);
          // Dearer troops have to earn their extra cost.
          const score = 30 + lookAhead(m, lanes, team, lvl.lookahead) - base - (CARDS[id].cost - 40) * 0.5 + rand(2);
          opts.push({ idx, target: { lane: li, slot }, score });
        }
      }
    } else if (CARDS[id].zone === 'checkpoint') {
      const u = UNITS.tower;
      for (const spot of towerSpots(m, team)) {
        const lanes = copy();
        lanes[spot.lane].towers.push({ id: -1, team, slot: spot.slot, hp: u.hp, maxHp: u.hp, range: u.range });
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
    const info = { threat: 0, own: 0, front: 0, lead: null, foes: { melee: 0, archer: 0, giant: 0 }, foeTower: false };
    for (const sq of L.squads) {
      if (sq.team === team) {
        info.own += sq.hp;
        if (sq.kind !== 'archer') info.front++;
      } else {
        info.threat += sq.hp;
        info.foes[sq.kind]++;
        if (!info.lead || toHome(sq.slot) < toHome(info.lead.slot)) info.lead = sq;
      }
    }
    info.foeTower = L.towers.some(t => t.team !== team);
    // urgency: how close their lead squad is to our gate, 0..1
    info.urgency = info.lead ? 1 - toHome(info.lead.slot) / LANE_LEN : 0;
    info.reach = frontier(L, team);
    return info;
  });
  const danger = Math.max(lanes[0].urgency, lanes[1].urgency);

  const careful = Math.random() < lvl.smart, deep = careful && lvl.lookahead > 0;
  const opts = deep ? deepLaneOptions(m, team, lvl) : [];

  // Upgrades are judged by what they should earn back over the turns still to come,
  // against what they cost, and are a luxury while the gate is under threat.
  const horizon = Math.max(0, Math.min(TURN_LIMIT, 17) - m.turn);
  const perArrow = T.shots ? T.hunted / T.shots : 28;
  const upgradeScore = id => {
    const gain = id === 'arrow' ? perArrow * Math.pow(0.8, T.arrows - 1) : T.arrows * perArrow * 0.3;
    return 28 + 12 * (gain * horizon) / cardCost(T, id) + (lvl.eco ?? 0) - danger * 50 + rand(6);
  };

  let saveFor = 0; // score of an upgrade worth holding meat back for
  T.hand.forEach((id, idx) => {
    if (!id) return;
    const zone = CARDS[id].zone;
    if (zone === 'base') {
      const score = upgradeScore(id), short = cardCost(T, id) - T.meat;
      if (short <= 0) opts.push({ idx, target: basePoint(m, team), score });
      else if (short <= 45 && danger < 0.35) saveFor = Math.max(saveFor, score - 8);
      return;
    }
    if (cardBlocker(m, team, id)) return;
    if (deep) return; // lane plays were already scored by the look-ahead

    if (zone === 'lane') {
      for (const li of [0, 1]) {
        const slots = deploySlots(m, team, li);
        if (!slots.length) continue;
        const info = lanes[li], spot = bestSlot(m, team, li, id, slots);
        let score = 40 + spot.score * 0.5 + rand(10);
        if (info.threat) score += Math.max(0, info.threat - info.own) * 0.5 + info.urgency * 30;
        else score += 12; // open road to the castle
        if (toHome(info.reach) >= LANE_LEN - 5) score += 10; // keep a siege fed
        // Pick the right tool: archers for giants, giants for towers, warriors for archers.
        if (id === 'archer') score += info.foes.giant * 16 - (info.front ? 0 : 12);
        if (id === 'giant') score += (info.foeTower ? 18 : 0) - info.foes.archer * 14 - 6;
        if (id === 'melee') score += info.foes.archer * 6;
        opts.push({ idx, target: { lane: li, slot: spot.slot }, score, slots });
      }
    } else {
      const spots = towerSpots(m, team);
      if (!spots.length) return;
      spots.sort((p, q) => lanes[q.lane].threat - lanes[p.lane].threat || toHome(q.slot) - toHome(p.slot));
      const s = spots[0];
      opts.push({ idx, target: s, score: 18 + lanes[s.lane].urgency * 20 + (toHome(s.slot) >= LANE_LEN / 2 ? 8 : 0) + rand(8) });
    }
  });

  if (!opts.length) return null;
  // A considered player will sit on its meat when an upgrade just out of reach beats
  // anything it could buy right now.
  if (careful && opts.every(o => o.score < saveFor)) return null;
  if (!careful) {
    // A careless pick: any card, and troops dropped on any free slot.
    const o = pick(opts);
    if (o.slots) o.target = { lane: o.target.lane, slot: pick(o.slots) };
    return o;
  }
  opts.sort((p, q) => q.score - p.score);
  // The best players keep their meat rather than spend it on a play that isn't worth much.
  return opts[0].score >= (lvl.minScore ?? 0) ? opts[0] : null;
}
