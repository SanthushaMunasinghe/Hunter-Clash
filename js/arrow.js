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

// The meat an arrow of `damage` takes off an animal: its damage, or whatever is left.
// Quick prey gives up everything to any hit.
export const arrowTake = (a, damage) => (a.fast ? a.left : Math.min(a.left, damage));

// A team's volley as it leaves the bow: every arrow it owns at once, side by side across
// the aim line and fanned out very slightly, so the volley as a whole flies where it was
// aimed. Each shot is { x, y, angle, dx, dy }.
export function volleyShots(m, team, angle) {
  const L = m.board.castles[team].launch, n = m.teams[team].arrows;
  const squeeze = Math.min(1, (ARROW.abreast - 1) / Math.max(1, n - 1));
  const shots = [];
  for (let i = 0; i < n; i++) {
    const k = (i - (n - 1) / 2) * squeeze, a = angle + k * ARROW.fan;
    shots.push({
      x: L.x - Math.sin(angle) * k * ARROW.rank, y: L.y + Math.cos(angle) * k * ARROW.rank,
      angle: a, dx: Math.cos(a), dy: Math.sin(a),
    });
  }
  return shots;
}

// A frozen copy of the field for dry runs. With `lead`, animals carry their current
// velocity so the dry run can move them while the arrows are in the air.
function freeze(m, team, lead) {
  return collectObstacles(m, team).map(o => {
    const animal = o.kind === 'animal', v = lead && animal ? animalVelocity(o.ref) : { x: 0, y: 0 };
    return { ...o, x0: o.x, y0: o.y, vx: v.x, vy: v.y, left: animal ? o.ref.left : 0, fast: animal && o.ref.fast };
  });
}

// Dry run of a whole volley against frozen obstacles `obs`. The arrows fly together as
// they do for real, so an animal one of them kills is out of the way of the rest.
// maxContacts: how many contacts each arrow is followed for. paths: if given, one list
// per arrow that its contacts are added to.
function dryVolley(m, team, angle, obs, maxContacts, paths) {
  const damage = m.teams[team].damage, res = { meat: 0, castle: 0 };
  const arrows = volleyShots(m, team, angle).map(s => ({
    x: s.x, y: s.y, dx: s.dx, dy: s.dy,
    bouncesLeft: Math.min(ARROW.bounces, maxContacts - 1), done: false,
  }));
  const onHit = (o, ar) => {
    if (paths) paths[arrows.indexOf(ar)].push({ x: ar.x, y: ar.y, kind: o.kind, ref: o.ref, ox: o.x, oy: o.y, r: o.r });
    if (o.kind === 'animal') {
      const gain = arrowTake(o, damage);
      o.left -= gain;
      res.meat += gain;
      if (o.left <= 0) o.dead = true;
      return 'stop';
    }
    if (o.kind === 'castle') {
      res.castle += ARROW.castleDamage;
      return 'stop';
    }
  };
  const chunk = 24;
  for (let i = 0; i < 400 && arrows.some(ar => !ar.done); i++) {
    const t = (i * chunk) / ARROW.speed;
    for (const o of obs) {
      o.x = o.x0 + o.vx * t;
      o.y = o.y0 + o.vy * t;
    }
    for (const ar of arrows) if (!ar.done) stepArrow(ar, obs, m.board, chunk, onHit);
  }
  return res;
}

// What a volley fired at `angle` would bring in. Used by the AI to pick its shot.
export function simulateVolley(m, team, angle, lead = false) {
  return dryVolley(m, team, angle, freeze(m, team, lead), Infinity, null);
}

// Aim preview: for each arrow of the volley, its launch point and then up to two
// contacts against the field as it stands right now. Animals are not led, so fast ones
// still take judgement.
export function previewPaths(m, team, angle) {
  const paths = volleyShots(m, team, angle).map(s => [{ x: s.x, y: s.y, kind: 'start' }]);
  dryVolley(m, team, angle, freeze(m, team, false), 2, paths);
  return paths;
}
