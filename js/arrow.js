import { ARROW, CASTLE } from './config.js';
import { animalVelocity } from './animals.js';
import { clamp } from './utils.js';

const EDGE = { kind: 'edge' };

// Everything `team`'s arrows can hit, as capsules {x, y, h, r}.
export function collectObstacles(m, team) {
  const obs = [];
  for (const a of m.animals) obs.push({ kind: 'animal', ref: a, x: a.x, y: a.y, h: 0, r: a.r });
  for (const c of m.board.castles) {
    obs.push({
      kind: c.team === team ? 'home' : 'castle', ref: m.castles[c.team],
      x: c.x, y: c.y, h: CASTLE.halfLen, r: CASTLE.r,
    });
  }
  return obs;
}

// An arrow is spent on whatever onHit says 'stop' for, and bounces off everything else
// until it runs out of bounces.
function contact(ar, nx, ny, o, onHit) {
  const res = onHit(o, ar);
  if (res === 'stop' || ar.bouncesLeft <= 0) {
    ar.done = true;
    return;
  }
  ar.bouncesLeft--;
  const dot = ar.dx * nx + ar.dy * ny;
  ar.dx -= 2 * dot * nx;
  ar.dy -= 2 * dot * ny;
  const l = Math.hypot(ar.dx, ar.dy) || 1;
  ar.dx /= l;
  ar.dy /= l;
}

// Advances the arrow `distance` px in small sub-steps. onHit(obstacle, arrow) applies the
// effect and returns 'stop' if the arrow is spent on it.
export function stepArrow(ar, obs, board, distance, onHit) {
  const R0 = ARROW.radius;
  let left = distance;
  while (left > 0 && !ar.done) {
    const d = Math.min(ARROW.step, left);
    left -= d;
    ar.x += ar.dx * d;
    ar.y += ar.dy * d;

    let hit = null, hx = 0, hy = 0, depth = 0;
    for (const o of obs) {
      if (o.dead) continue;
      let ex = ar.x - clamp(ar.x, o.x - o.h, o.x + o.h), ey = ar.y - o.y;
      const dd = Math.hypot(ex, ey), R = o.r + R0;
      if (dd >= R) continue;
      if (dd > 1e-4) { ex /= dd; ey /= dd; } else { ex = -ar.dx; ey = -ar.dy; }
      if (ar.dx * ex + ar.dy * ey >= 0) continue; // already moving away
      if (R - dd > depth) { depth = R - dd; hit = o; hx = ex; hy = ey; }
    }
    if (hit) {
      contact(ar, hx, hy, hit, onHit);
      ar.x += hx * (depth + 0.5);
      ar.y += hy * (depth + 0.5);
      continue;
    }

    if (board.fieldG(ar.x, ar.y, R0) >= 1) {
      const N = board.fieldN(ar.x, ar.y, R0);
      if (ar.dx * N.x + ar.dy * N.y > 0) contact(ar, -N.x, -N.y, EDGE, onHit);
      for (let k = 0; k < 16 && board.fieldG(ar.x, ar.y, R0) >= 1; k++) {
        ar.x -= N.x;
        ar.y -= N.y;
      }
    }
  }
}

// A frozen copy of the field for dry runs. With `lead`, animals carry their current
// velocity so the dry run can move them while the arrow is in the air.
function freeze(m, team, lead) {
  return collectObstacles(m, team).map(o => {
    const v = lead && o.kind === 'animal' ? animalVelocity(o.ref) : { x: 0, y: 0 };
    return { ...o, x0: o.x, y0: o.y, vx: v.x, vy: v.y, hp: o.ref.hp };
  });
}

// Dry run of one arrow against frozen obstacles `obs`, launched `delay` seconds into the
// volley. Mutates obs (damage, deaths) so the next arrow of the volley sees the result.
function dryArrow(m, team, angle, obs, damage, delay, maxContacts, points) {
  const L = m.board.castles[team].launch;
  const ar = {
    x: L.x, y: L.y, dx: Math.cos(angle), dy: Math.sin(angle),
    bouncesLeft: Math.min(ARROW.bounces, maxContacts - 1), done: false,
  };
  const res = { meat: 0, castle: 0 };
  const onHit = o => {
    if (points) points.push({ x: ar.x, y: ar.y, kind: o.kind, ox: o.x, oy: o.y, r: o.r });
    if (o.kind === 'animal') {
      const dealt = Math.min(o.hp, damage);
      o.hp -= dealt;
      res.meat += o.ref.meat * dealt / o.ref.maxHp;
      if (o.hp <= 0) o.dead = true;
      return 'stop';
    }
    if (o.kind === 'castle') {
      res.castle += ARROW.castleDamage;
      return 'stop';
    }
  };
  const chunk = 24;
  for (let i = 0; i < 400 && !ar.done; i++) {
    const t = delay + (i * chunk) / ARROW.speed;
    for (const o of obs) {
      o.x = o.x0 + o.vx * t;
      o.y = o.y0 + o.vy * t;
    }
    stepArrow(ar, obs, m.board, chunk, onHit);
  }
  return res;
}

// What a whole volley fired at `angle` would bring in: every arrow the team has, one
// after another down the same line. Used by the AI to pick its shot.
export function simulateVolley(m, team, angle, lead = false) {
  const T = m.teams[team], obs = freeze(m, team, lead), total = { meat: 0, castle: 0 };
  for (let i = 0; i < T.arrows; i++) {
    const r = dryArrow(m, team, angle, obs, T.damage, i * ARROW.volleyGap, Infinity, null);
    total.meat += r.meat;
    total.castle += r.castle;
  }
  return total;
}

// Aim preview: launch point, then up to two contacts of a single arrow against the
// field as it stands right now. Animals are not led, so fast ones still take judgement.
export function previewPath(m, team, angle) {
  const L = m.board.castles[team].launch;
  const points = [{ x: L.x, y: L.y, kind: 'start' }];
  dryArrow(m, team, angle, freeze(m, team, false), m.teams[team].damage, 0, 2, points);
  return points;
}
