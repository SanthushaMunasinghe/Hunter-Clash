import { BLUE, RED, LANE_LEN, CARDS, HUNTER } from './config.js';
import { simulateShot } from './arrow.js';
import { deploySlots, towerSpots, centerLine, centerValid } from './cards.js';
import { rand, pick, lerp, dist } from './utils.js';

const MIN_ELEV = 0.16;

// Red fires down the screen. Try a spread of angles and keep the most rewarding one.
export function chooseAim(m, lvl) {
  const castleHp = m.castles[BLUE].hp;
  let best = null;
  for (let i = 0; i < lvl.aimSamples; i++) {
    const ang = lerp(MIN_ELEV, Math.PI - MIN_ELEV, (i + Math.random()) / lvl.aimSamples);
    const r = simulateShot(m, RED, ang);
    let score = r.meat + r.castle * 2.5 + r.hunter * 1.5 + r.wall * 0.3 + rand(2);
    if (r.castle >= castleHp) score += 1000;
    if (!best || score > best.score) best = { ang, score };
  }
  const ang = best.ang + rand(-lvl.aimError, lvl.aimError);
  return Math.min(Math.PI - MIN_ELEV, Math.max(MIN_ELEV, ang));
}

function hunterSpot(m) {
  const b = m.board, line = centerLine(m, RED);
  let best = null;
  for (let i = 0; i < 30; i++) {
    const x = b.cx + rand(-b.a + 30, b.a - 30), y = rand(b.FT + 40, line);
    if (!centerValid(m, RED, 'hunter', x, y)) continue;
    let score = (y - b.FT) * 0.05;
    for (const a of m.animals) {
      if (a.y > y - 24 && dist(x, y, a.x, a.y) < HUNTER.range) score += 1;
    }
    if (!best || score > best.score) best = { x, y, score };
  }
  return best;
}

function wallSpot(m) {
  const b = m.board;
  for (let i = 0; i < 30; i++) {
    const x = b.cx + rand(-80, 80), y = b.FT + rand(60, 110);
    if (centerValid(m, RED, 'wall', x, y)) return { x, y };
  }
  return null;
}

// Picks one affordable card and where to put it, or null to stop spending.
export function chooseCard(m, lvl) {
  const T = m.teams[RED];
  const animals = m.animals.length;
  const myHunters = m.hunters.filter(h => h.team === RED).length;
  const myWalls = m.walls.filter(w => w.team === RED).length;
  const blueHunters = m.hunters.filter(h => h.team === BLUE).length;

  const lanes = m.lanes.map(L => {
    let threat = 0, own = 0, blueFront = 0;
    for (const s of L.squads) {
      if (s.team === BLUE) {
        threat += s.hp * (0.6 + s.slot / LANE_LEN);
        blueFront = Math.max(blueFront, s.slot);
      } else own += s.hp;
    }
    for (const t of L.towers) if (t.team === BLUE) threat += 15;
    return { threat, own, blueFront };
  });

  const opts = [];
  T.hand.forEach((id, idx) => {
    const card = CARDS[id];
    if (T.meat < card.cost) return;

    if (card.zone === 'lane') {
      for (const li of [0, 1]) {
        const slots = deploySlots(m, RED, li);
        if (!slots.length) continue;
        const info = lanes[li], L = m.lanes[li];
        const front = Math.min(...slots); // red advances toward slot 0
        let slot = front;
        let score = 40 + info.threat * 0.9 - info.own * 0.45 + rand(12);
        if (id === 'archer') {
          // Archers want a melee squad just ahead of them.
          const covered = slots.filter(s =>
            L.squads.some(q => q.team === RED && q.kind === 'melee' && q.slot < s && s - q.slot <= 2));
          if (covered.length) {
            slot = Math.min(...covered);
            score += 14;
          } else {
            slot = slots.includes(front + 1) ? front + 1 : front;
            score -= 12;
          }
        }
        if (info.blueFront >= LANE_LEN - 3) score += 30; // castle under pressure
        opts.push({ idx, target: { lane: li, slot }, score });
      }
    } else if (id === 'hunter') {
      if (myHunters >= 3 || animals < 3) return;
      const p = hunterSpot(m);
      if (p) opts.push({ idx, target: p, score: 62 + animals * 2 - myHunters * 22 + rand(10) });
    } else if (id === 'wall') {
      if (myWalls >= 2) return;
      const p = wallSpot(m);
      if (p) opts.push({ idx, target: p, score: 18 + blueHunters * 16 + (animals < 7 ? 22 : 0) + rand(10) });
    } else if (id === 'tower') {
      const spots = towerSpots(m, RED);
      if (!spots.length) return;
      spots.sort((p, q) => lanes[q.lane].threat - lanes[p.lane].threat || p.slot - q.slot);
      opts.push({ idx, target: spots[0], score: 36 + lanes[spots[0].lane].threat * 0.5 + rand(10) });
    }
  });

  if (!opts.length) return null;
  if (Math.random() > lvl.smart) return Math.random() < 0.3 ? null : pick(opts);
  opts.sort((p, q) => q.score - p.score);
  return opts[0];
}
