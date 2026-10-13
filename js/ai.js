import { BLUE, LANE_LEN, CARDS, UNITS, TURN_LIMIT, REFRESH_COST } from './config.js';
import { scout, simulateVolley, volleyDamage } from './arrow.js';
import { cardBlocker, cardCost, cardUnits, damageGain, basePoint } from './cards.js';
import { towerSpots, frontier, homeSlot, rowsOf, placement, placeUnits, newUnit, laneGuard, laneFight } from './rules.js';
import { rand, pick, lerp, clamp } from './utils.js';

// The computer player. Written for either team so matches can be simulated AI vs AI.

const MIN_ELEV = 0.16;

// Try a spread of angles and keep the one whose volley brings in the most, then wobble
// it by the level's error. Better levels lead moving animals.
// delay: seconds until the shot is loosed. A level that leads its shots allows for it.
export function chooseAim(m, team, lvl, delay = 0) {
  const lo = team === BLUE ? -Math.PI + MIN_ELEV : MIN_ELEV;
  const hi = team === BLUE ? -MIN_ELEV : Math.PI - MIN_ELEV;
  const foeHp = m.castles[1 - team].hp;
  // A chip off the castle is worth a little: it is a point off them if the match goes to time.
  const castleWorth = 2;
  // What a shot at `ang` should bring in: meat most of all, so the richest hit wins,
  // which is quick prey whenever it can be had.
  const field = scout(m, team, { lead: lvl.lead, foresee: lvl.foresee, delay });
  const worth = ang => {
    const r = simulateVolley(m, team, ang, field);
    return r.meat + r.castle * castleWorth + (r.castle >= foeHp ? 1000 : 0);
  };
  let best = null;
  for (let i = 0; i < lvl.aimSamples; i++) {
    const ang = lerp(lo, hi, (i + Math.random()) / lvl.aimSamples), value = worth(ang), score = value + rand(2);
    if (!best || score > best.score) best = { ang, value, score };
  }
  let ang = best.ang;
  if (lvl.steady) {
    // A marksman does not settle for a shot that only just clips its target. It feels
    // out how far the aim could drift either way and still do as well, and shoots down
    // the middle of that.
    const step = (hi - lo) / lvl.aimSamples / 6, drift = sign => {
      let n = 0;
      while (n < 8 && worth(ang + sign * (n + 1) * step) >= best.value) n++;
      return n;
    };
    ang += (drift(1) - drift(-1)) * step / 2;
  }
  return clamp(ang + rand(-lvl.aimError, lvl.aimError), lo, hi);
}

// What a healthy unit is worth on the road when weighing up a position.
const WORTH = { melee: 7, archer: 5, giant: 20 };

// How good the lanes look for `team` once this turn's fight and `rounds` more rounds
// have played out with no new cards: castle damage traded (sooner counts more), plus
// troops and ground left.
function lookAhead(m, lanes, team, rounds) {
  const foe = 1 - team;
  let score = 0, dealt = 0, taken = 0;
  const fight = (side, r) => {
    for (const lane of lanes) {
      for (const act of laneFight(lane, side)) {
        for (const h of act.hits || []) {
          if (h.kind !== 'castle') continue;
          if (side === team) dealt += h.dmg; else taken += h.dmg;
          score += (side === team ? 1 : -1) * h.dmg * 1.5 * Math.pow(0.9, r);
        }
      }
    }
  };
  fight(team, 0); // the end of this turn
  for (let r = 0; r < rounds; r++) {
    for (const side of [foe, team]) {
      for (const lane of lanes) laneGuard(lane, side);
      fight(side, r);
    }
  }
  if (dealt >= m.castles[foe].hp) score += 400;
  if (taken >= m.castles[team].hp) score -= 400;
  for (const lane of lanes) {
    for (const side of [team, foe]) {
      for (const u of lane.cols[side].units) score += (side === team ? 1 : -1) * (u.hp / u.maxHp) * WORTH[u.kind];
    }
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
    if (!id || cardBlocker(m, team, id, idx)) return;
    if (CARDS[id].zone === 'lane') {
      for (const li of [0, 1]) {
        const lanes = copy();
        if (!placeUnits(lanes[li], team, id, cardUnits(T, id, idx), kind => newUnit(-1, team, kind))) continue;
        // Dearer troops have to earn their extra cost.
        const score = 30 + lookAhead(m, lanes, team, lvl.lookahead) - base - (cardCost(T, id, idx) - cardCost(T, 'melee', idx)) + rand(2);
        opts.push({ idx, target: { lane: li }, score });
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

// Whether to pay for a fresh hand before playing anything. A hand is kept from turn to
// turn now, so it can come to hold no troops at all; when that happens and there is meat
// for the refresh and a troop card after it, a new hand is worth the price, since a
// fresh one always has warriors or archers in it.
export function wantsRefresh(m, team) {
  const T = m.teams[team];
  return !T.hand.some(id => id && CARDS[id].zone === 'lane') && T.meat >= REFRESH_COST + cardCost(T, 'melee');
}

// Picks one playable card and where to put it, or null to stop spending.
export function chooseCard(m, team, lvl) {
  const T = m.teams[team], foe = 1 - team, home = homeSlot(team);
  const toHome = slot => Math.abs(slot - home);

  const lanes = m.lanes.map(L => {
    const mine = L.cols[team].units, theirs = L.cols[foe].units, hp = list => list.reduce((n, u) => n + u.hp, 0);
    const info = { threat: hp(theirs), own: hp(mine), archers: theirs.filter(u => u.kind === 'archer').length };
    // front: whether our front row is one that can take a charge, so archers have cover.
    info.front = mine.length > 0 && rowsOf(L, team)[0].cls === 'melee';
    info.foeTower = L.towers.some(t => t.team !== team);
    // urgency: how close their front row is to our gate, 0..1
    info.urgency = theirs.length ? 1 - toHome(L.cols[foe].front) / LANE_LEN : 0;
    info.reach = frontier(L, team);
    return info;
  });
  const danger = Math.max(lanes[0].urgency, lanes[1].urgency);

  const careful = Math.random() < lvl.smart, deep = careful && lvl.lookahead > 0;
  const opts = deep ? deepLaneOptions(m, team, lvl) : [];

  // Upgrades are judged by what they should earn back over the turns still to come,
  // against what they cost, and are a luxury while the gate is under threat.
  const horizon = Math.max(0, Math.min(TURN_LIMIT, 17) - m.turn);
  // A hunt is taken to bring in meat in proportion to the damage of the volley.
  const volley = volleyDamage(T), perHunt = T.hunts ? T.hunted / T.hunts : volley * 0.9;
  const upgradeScore = id => {
    const better = volleyDamage({ arrows: T.arrows + (id === 'arrow'), damage: T.damage + (id === 'damage' ? damageGain(T) : 0) });
    // A bounce gives an arrow a second full hit when it finds another animal to land it
    // on, which gets less likely with every bounce it already has.
    const gain = id === 'bounce' ? perHunt * 0.45 * Math.pow(0.6, T.bounces) : perHunt * (better - volley) / volley;
    return 28 + 12 * (gain * horizon) / cardCost(T, id) + (lvl.eco ?? 0) - danger * 50 + rand(6);
  };

  let saveFor = 0; // score of an upgrade worth holding meat back for
  T.hand.forEach((id, idx) => {
    if (!id) return;
    const zone = CARDS[id].zone;
    if (zone === 'base') {
      const score = upgradeScore(id), short = cardCost(T, id) - T.meat;
      if (short <= 0) opts.push({ idx, target: basePoint(m, team), score });
      else if (short <= CARDS.melee.cost + 5 && danger < 0.35) saveFor = Math.max(saveFor, score - 8);
      return;
    }
    if (cardBlocker(m, team, id, idx)) return;
    if (deep) return; // lane plays were already scored by the look-ahead

    if (zone === 'lane') {
      for (const li of [0, 1]) {
        if (!placement(m.lanes[li], team, id, cardUnits(T, id, idx))) continue;
        const info = lanes[li];
        let score = 40 + rand(10);
        if (info.threat) score += Math.max(0, info.threat - info.own) * 0.5 + info.urgency * 30;
        else score += 12; // open road to the castle
        if (toHome(info.reach) >= LANE_LEN - 5) score += 10; // keep a siege fed
        // Pick the right tool: giants for towers, archers only behind a front-liner.
        if (id === 'archer') score -= info.front ? 0 : 12;
        if (id === 'giant') score += info.foeTower ? 22 : -10;
        if (id === 'melee') score += info.archers * 2;
        opts.push({ idx, target: { lane: li }, score });
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
  // A careless pick: any card it can play, on either road.
  if (!careful) return pick(opts);
  opts.sort((p, q) => q.score - p.score);
  // The best players keep their meat rather than spend it on a play that isn't worth much.
  return opts[0].score >= (lvl.minScore ?? 0) ? opts[0] : null;
}
