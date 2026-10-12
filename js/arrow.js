import { ARROW, CASTLE } from './config.js';
import { animalVelocity, updateAnimals } from './animals.js';
import { clamp } from './utils.js';

const EDGE = { kind: 'edge' };
const CHUNK = 24;     // px an arrow is moved per step of a dry run
const FORESIGHT = 70; // steps of a dry run that a forecast of the herd covers

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

// An arrow is spent on whatever onHit says 'stop' for, flies straight on through what it
// says 'pass' for, and bounces off everything else until it runs out of bounces.
// Returns true if it passed through.
function contact(ar, nx, ny, o, onHit) {
  const res = onHit(o, ar);
  if (res === 'pass') return true;
  if (res === 'stop' || ar.bouncesLeft <= 0) {
    ar.done = true;
    return false;
  }
  ar.bouncesLeft--;
  const dot = ar.dx * nx + ar.dy * ny;
  ar.dx -= 2 * dot * nx;
  ar.dy -= 2 * dot * ny;
  const l = Math.hypot(ar.dx, ar.dy) || 1;
  ar.dx /= l;
  ar.dy /= l;
  return false;
}

// Advances the arrow `distance` px in small sub-steps. onHit(obstacle, arrow) applies the
// effect and returns 'stop' if the arrow is spent on it, or 'pass' if it has killed the
// obstacle (and marked it dead) and carries on.
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
      if (!contact(ar, hx, hy, hit, onHit)) {
        ar.x += hx * (depth + 0.5);
        ar.y += hy * (depth + 0.5);
      }
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

// The meat an arrow with `damage` left in it takes off an animal: that damage, or
// whatever the animal has. Quick prey gives up everything to any hit.
const arrowTake = (a, damage) => (a.fast ? a.left : Math.min(a.left, damage));

// An arrow hits an animal: takes its meat and loses that much of its own power. If the
// animal is dead and the arrow has power to spare, it flies on through to the next.
// `a` needs { left, fast }. Returns { gain, pass }.
export function pierce(ar, a) {
  const gain = arrowTake(a, ar.power);
  a.left -= gain;
  ar.power -= gain;
  return { gain, pass: a.left <= 0 && ar.power > 0 };
}

// What each arrow of a team's volley can do, first arrow first: it carries the full
// hunting damage, and every additional arrow ARROW.extra of that. T: { arrows, damage }.
export const arrowPowers = T =>
  Array.from({ length: T.arrows }, (_, i) => (i ? Math.floor(T.damage * ARROW.extra) : T.damage));

// The damage of a team's whole volley.
export const volleyDamage = T => arrowPowers(T).reduce((sum, p) => sum + p, 0);

// A team's volley as it leaves the bow: every arrow it owns at once. The full arrow flies
// exactly where it was aimed; the additional ones go alongside it, to the right and left
// by turns, fanned out very slightly. Each shot is { x, y, angle, dx, dy, power, extra }.
export function volleyShots(m, team, angle) {
  const L = m.board.castles[team].launch, powers = arrowPowers(m.teams[team]);
  const squeeze = Math.min(1, (ARROW.abreast - 1) / Math.max(1, powers.length - 1));
  return powers.map((power, i) => {
    const k = (i % 2 ? 1 : -1) * Math.ceil(i / 2) * squeeze, a = angle + k * ARROW.fan;
    return {
      x: L.x - Math.sin(angle) * k * ARROW.rank, y: L.y + Math.cos(angle) * k * ARROW.rank,
      angle: a, dx: Math.cos(a), dy: Math.sin(a), power, extra: i > 0,
    };
  });
}

// A frozen copy of the field for dry runs. With `lead`, animals carry their current
// velocity so the dry run can move them while the arrows are in the air.
function freeze(m, team, lead) {
  return collectObstacles(m, team).map(o => {
    const animal = o.kind === 'animal', v = lead && animal ? animalVelocity(o.ref) : { x: 0, y: 0 };
    return { ...o, x0: o.x, y0: o.y, vx: v.x, vy: v.y, left: animal ? o.ref.left : 0, fast: animal && o.ref.fast };
  });
}

// Works out where the herd will be once a shot is loosed `delay` seconds from now and
// while it flies, by running copies of the animals on ahead: they hold their line,
// glance off the edge of the field and turn back at the limits of their range, just as
// the real ones will. Each animal obstacle gets a `track` of positions, one per step of
// the dry run. What cannot be foreseen is quick prey changing its mind: `sure` is how
// long after the shot its track can be trusted, and the dry run ignores it after that.
function foresee(m, obs, delay) {
  const animals = obs.filter(o => o.kind === 'animal'), dt = CHUNK / ARROW.speed;
  const ghost = { board: m.board, animals: animals.map(o => ({ ...o.ref })) };
  for (let t = delay; t > 1e-6; t -= dt) updateAnimals(ghost, Math.min(dt, t));
  animals.forEach((o, k) => {
    o.track = [];
    o.sure = o.fast ? o.ref.wanderT - delay : Infinity;
    ghost.animals[k].wanderT = Infinity; // past that point it is anyone's guess anyway
  });
  for (let i = 0; i < FORESIGHT; i++) {
    animals.forEach((o, k) => o.track.push({ x: ghost.animals[k].x, y: ghost.animals[k].y }));
    updateAnimals(ghost, dt);
  }
}

// Dry run of a whole volley against frozen obstacles `obs`. The arrows fly together as
// they do for real, so an animal one of them kills is out of the way of the rest.
// maxContacts: how many contacts each arrow is followed for, not counting animals it
// goes straight through. paths: if given, one list per arrow that its contacts are added
// to, those it passed through marked `pass`; an arrow that has passed through something
// is then only followed as far as its next contact. delay: seconds until the volley is
// loosed, for obstacles that are moving.
function dryVolley(m, team, angle, obs, maxContacts, paths, delay = 0) {
  const res = { meat: 0, castle: 0 };
  const arrows = volleyShots(m, team, angle).map(s => ({
    x: s.x, y: s.y, dx: s.dx, dy: s.dy, power: s.power,
    bouncesLeft: Math.min(ARROW.bounces, maxContacts - 1), done: false,
  }));
  const onHit = (o, ar) => {
    const point = { x: ar.x, y: ar.y, kind: o.kind, ref: o.ref, ox: o.x, oy: o.y, r: o.r };
    if (paths) paths[arrows.indexOf(ar)].push(point);
    if (o.kind === 'animal') {
      const hit = pierce(ar, o);
      res.meat += hit.gain;
      if (o.left <= 0) o.dead = o.killed = true;
      if (!hit.pass) return 'stop';
      point.pass = true;
      if (paths) ar.bouncesLeft = 0;
      return 'pass';
    }
    if (o.kind === 'castle') {
      res.castle += ARROW.castleDamage;
      return 'stop';
    }
  };
  for (let i = 0; i < 400 && arrows.some(ar => !ar.done); i++) {
    const flown = (i * CHUNK) / ARROW.speed;
    for (const o of obs) {
      if (o.track) {
        const p = o.track[Math.min(i, o.track.length - 1)];
        o.x = p.x;
        o.y = p.y;
        o.dead = o.killed || flown > o.sure;
      } else {
        o.x = o.x0 + o.vx * (delay + flown);
        o.y = o.y0 + o.vy * (delay + flown);
      }
    }
    for (const ar of arrows) if (!ar.done) stepArrow(ar, obs, m.board, CHUNK, onHit);
  }
  return res;
}

// The field as the AI reads it when planning a shot to be loosed `delay` seconds from
// now. Without `lead` it takes the animals to be standing still. With it they carry on
// in a straight line, and with `foresee` as well it works out where they will really
// have got to. Hand the result to simulateVolley for each angle being weighed up.
export function scout(m, team, { lead = false, foresee: far = false, delay = 0 } = {}) {
  const obs = freeze(m, team, lead);
  if (lead && far) foresee(m, obs, delay);
  return { obs, delay };
}

// What a volley fired at `angle` would bring in, on a field read by scout().
export function simulateVolley(m, team, angle, field) {
  for (const o of field.obs) {
    o.dead = o.killed = false;
    if (o.kind === 'animal') o.left = o.ref.left;
  }
  return dryVolley(m, team, angle, field.obs, Infinity, null, field.delay);
}

// Aim preview: for each arrow of the volley, its launch point and then up to two
// contacts against the field as it stands right now, plus any animals it would go
// straight through. Animals are not led, so fast ones still take judgement.
export function previewPaths(m, team, angle) {
  const paths = volleyShots(m, team, angle).map(s => [{ x: s.x, y: s.y, kind: 'start' }]);
  dryVolley(m, team, angle, freeze(m, team, false), 2, paths);
  return paths;
}
