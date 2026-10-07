import { ARROW, HTOWER, CASTLE } from './config.js';
import { clamp } from './utils.js';

const EDGE = { kind: 'edge' };

// Everything `team`'s arrow can hit, as capsules. A team's own hunter towers are left
// out so they never block their own shot.
export function collectObstacles(m, team) {
  const obs = [];
  for (const a of m.animals) obs.push({ kind: 'animal', ref: a, x: a.x, y: a.y, h: 0, r: a.r });
  for (const t of m.htowers) {
    if (t.team !== team) obs.push({ kind: 'htower', ref: t, x: t.x, y: t.y, h: 0, r: HTOWER.r });
  }
  for (const c of m.board.castles) {
    obs.push({
      kind: c.team === team ? 'home' : 'castle', ref: m.castles[c.team],
      x: c.x, y: c.y, h: CASTLE.halfLen, r: CASTLE.r,
    });
  }
  return obs;
}

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

// Advances the arrow `distance` px in small sub-steps, bouncing off obstacles and the
// field edge. onHit(obstacle, arrow) applies the effect and may return 'stop'.
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

// Dry run of a shot against a frozen copy of the field. Used by the AI to score
// angles and, with maxContacts, to draw the aim preview.
export function simulateShot(m, team, angle, maxContacts = Infinity, points = null) {
  const obs = collectObstacles(m, team).map(o => ({ ...o, hp: o.ref.hp }));
  const L = m.board.castles[team].launch;
  const ar = {
    x: L.x, y: L.y, dx: Math.cos(angle), dy: Math.sin(angle),
    bouncesLeft: Math.min(ARROW.bounces, maxContacts - 1), done: false,
  };
  const res = { meat: 0, castle: 0, htower: 0 };
  const onHit = o => {
    if (points) points.push({ x: ar.x, y: ar.y, kind: o.kind });
    if (o.kind === 'animal') {
      const d = Math.min(o.hp, ARROW.damage);
      o.hp -= d;
      res.meat += d;
      if (o.hp <= 0) o.dead = true;
    } else if (o.kind === 'htower') {
      const d = Math.min(o.hp, ARROW.damage);
      o.hp -= d;
      res.htower += d;
      if (o.hp <= 0) o.dead = true;
    } else if (o.kind === 'castle') {
      res.castle += ARROW.castleDamage;
      return 'stop';
    }
  };
  for (let i = 0; i < 400 && !ar.done; i++) stepArrow(ar, obs, m.board, 24, onHit);
  return res;
}

// Launch point, first contact and second contact of a shot.
export function previewPath(m, team, angle) {
  const L = m.board.castles[team].launch;
  const points = [{ x: L.x, y: L.y, kind: 'start' }];
  simulateShot(m, team, angle, 2, points);
  return points;
}
