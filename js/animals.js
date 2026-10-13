import { ANIMALS, HERD, HERD_START, CASTLE } from './config.js';
import { rand, dist, clamp, gap, TAU } from './utils.js';

const LAUNCH_CLEAR = 42; // animals keep out of the mouth of each castle
// How many seconds an animal holds its line before picking a new one of its own accord.
// Anything it runs into before then turns it sooner.
const RUN = { slow: [8, 14], fast: [10, 16] };

// A new line to run along. Quick prey mostly runs across the field, which is the long
// way through the strip it keeps to; everything else sets off in any direction.
const freshHeading = fast => (fast ? (Math.random() < 0.5 ? 0 : Math.PI) + rand(-0.5, 0.5) : rand(TAU));

// Bounces an animal's line off a surface whose normal (nx, ny) points back at the animal,
// if it is heading into it. wobble: radians of scatter, so slow animals do not retrace
// their steps; quick prey ricochets true, which is what makes it readable.
function ricochet(a, nx, ny, wobble = 0) {
  const dx = Math.cos(a.heading), dy = Math.sin(a.heading), dot = dx * nx + dy * ny;
  if (dot >= 0) return;
  a.heading = Math.atan2(dy - 2 * dot * ny, dx - 2 * dot * nx) + rand(-wobble, wobble);
}

// left: meat still on the animal, which is also its health. It drains as arrows land,
// is what the number over its head shows, and the animal dies when it runs out.
// side: which half of the field a slow animal first appeared in (+1 blue's, -1 red's),
// so newcomers can be shared out; quick prey has no side.
// heading: the line it is running along. wanderT: seconds until it next picks a new one
// of its own accord.
function makeAnimal(m, type, x, y, spawn = 1) {
  const d = ANIMALS[type], fast = !!d.fast;
  return {
    id: m.nextId++, type, x, y, r: d.r, left: d.meat,
    speed: d.speed, fast, side: fast ? 0 : y > m.board.cy ? 1 : -1,
    heading: freshHeading(fast), wanderT: rand(...(fast ? RUN.fast : RUN.slow)), moving: true,
    face: Math.random() < 0.5 ? -1 : 1, kx: 0, ky: 0, flash: 0, spawn,
  };
}

// A random y inside the band a kind appears in, on the given side of the field (+1 toward blue).
function bandY(m, type, side) {
  const [lo, hi] = ANIMALS[type].band;
  return m.board.cy + side * rand(Math.max(lo, 0.04), hi) * m.board.b;
}

function spotFree(m, x, y, r, pad) {
  const b = m.board, me = { x, y, h: 0, r };
  if (b.fieldG(x, y, r + 8) >= 1) return false;
  for (const c of b.castles) {
    if (dist(x, y, c.launch.x, c.launch.y) < r + LAUNCH_CLEAR + 10) return false;
    if (gap(me, { x: c.x, y: c.y, h: CASTLE.halfLen, r: CASTLE.r }) < 8) return false;
  }
  for (const a of m.animals) if (dist(x, y, a.x, a.y) < r + a.r + pad) return false;
  return true;
}

// A point-mirrored pair, so neither side gets the better half of the field.
function spawnPair(m, type, spawn) {
  const b = m.board, r = ANIMALS[type].r;
  for (let tries = 0; tries < 300; tries++) {
    const x = b.cx + rand(-b.a, b.a), y = bandY(m, type, 1);
    const mx = 2 * b.cx - x, my = 2 * b.cy - y;
    const pad = tries < 200 ? 16 : 4;
    if (dist(x, y, mx, my) < 2 * r + pad) continue;
    if (!spotFree(m, x, y, r, pad) || !spotFree(m, mx, my, r, pad)) continue;
    m.animals.push(makeAnimal(m, type, x, y, spawn), makeAnimal(m, type, mx, my, spawn));
    return true;
  }
  return false;
}

// A single replacement. Slow prey goes to whichever base currently has less of it.
function spawnOne(m, type) {
  const b = m.board, r = ANIMALS[type].r;
  let lean = 0;
  for (const a of m.animals) lean += a.side;
  const side = ANIMALS[type].fast || lean === 0 ? (Math.random() < 0.5 ? 1 : -1) : -Math.sign(lean);
  for (let tries = 0; tries < 200; tries++) {
    const x = b.cx + rand(-b.a, b.a), y = bandY(m, type, side);
    if (!spotFree(m, x, y, r, tries < 120 ? 16 : 4)) continue;
    m.animals.push(makeAnimal(m, type, x, y, 0));
    return true;
  }
  return false;
}

export function initAnimals(m) {
  for (const k in ANIMALS) if (ANIMALS[k].from <= 1) m.arrived[k] = true;
  for (const type of HERD_START) spawnPair(m, type, 1);
}

// Replacement prey: anything that has arrived so far, leaning toward the newer, richer kinds.
function randomType(m) {
  const pool = Object.keys(ANIMALS).filter(k => m.arrived[k]);
  const weight = k => 1 + ANIMALS[k].from / 6;
  let roll = rand(pool.reduce((sum, k) => sum + weight(k), 0));
  for (const k of pool) {
    roll -= weight(k);
    if (roll <= 0) return k;
  }
  return pool[0];
}

// A kill queues one replacement, due HERD.delay rounds later. m.tick counts turns (two
// per round); the half-round of slack is random so neither side always shoots first.
export function queueRespawn(m) {
  m.respawns.push(m.tick + HERD.delay * 2 - (Math.random() < 0.5 ? 1 : 0));
}

// Called at the start of every turn. New kinds of prey walk on, two of each, from the
// turn they unlock (the two sides take it in turns to get first shot at them), and
// animals killed a while ago are replaced, a few at a time, up to the herd size.
// Returns the kinds that arrived this turn.
export function respawnAnimals(m) {
  const fresh = [];
  for (const k in ANIMALS) {
    const from = ANIMALS[k].from, first = Math.floor(from / 5) % 2;
    if (m.arrived[k] || m.turn < from || (m.turn === from && first === 1 && m.turnTeam !== first)) continue;
    m.arrived[k] = true;
    m.newcomers.push(k, k);
    fresh.push(k);
  }
  // Newcomers are let in ahead of ordinary replacements, even into a full herd.
  while (m.newcomers.length && m.animals.length < HERD.max) {
    if (!spawnOne(m, m.newcomers.shift())) break;
  }

  m.respawns.sort((p, q) => p - q);
  let spawned = 0;
  while (m.respawns.length && m.animals.length < HERD.size) {
    const due = m.respawns[0] <= m.tick && spawned < HERD.perTurn;
    if (!due && m.animals.length >= HERD.min) break;
    m.respawns.shift();
    if (spawnOne(m, m.newcomers.shift() || randomType(m))) spawned++;
  }
  // With a full herd, replacements that came due are simply not needed.
  while (m.respawns.length && m.respawns[0] <= m.tick && m.animals.length >= HERD.size) m.respawns.shift();
  for (let i = 0; i < 6 && m.animals.length < HERD.min; i++) spawnOne(m, randomType(m));
  return fresh;
}

// Keeps an animal at least minDist from a point, and turns it away if it was walking in.
function pushOut(a, px, py, minDist) {
  const dx = a.x - px, dy = a.y - py, d = Math.hypot(dx, dy);
  if (d >= minDist) return;
  if (d < 0.01) { a.y += minDist; return; }
  a.x = px + (dx / d) * minDist;
  a.y = py + (dy / d) * minDist;
  ricochet(a, dx / d, dy / d, a.fast ? 0 : 0.4);
}

// Current wander velocity, without knock-back. The AI uses it to lead its shots.
export function animalVelocity(a) {
  return { x: Math.cos(a.heading) * a.speed, y: Math.sin(a.heading) * a.speed };
}

// Each animal runs along a straight line until it meets something. Slow prey has the run
// of the whole field, and the field edge, a castle or another animal turns it, like a
// ball off a cushion. Quick prey keeps to the strip across the middle (its band) and
// only ever turns at the limits of that strip and the field edge: an animal in its way
// does not turn it, it pulls up and waits for the way to clear, then runs on along the
// same line. Left alone for long enough, an animal picks a new line for itself.
export function updateAnimals(m, dt) {
  const b = m.board, list = m.animals;

  for (const a of list) {
    a.flash = Math.max(0, a.flash - dt);
    a.spawn = Math.min(1, a.spawn + dt * 2.5);
    a.wanderT -= dt;
    if (a.wanderT <= 0) {
      a.wanderT = rand(...(a.fast ? RUN.fast : RUN.slow));
      a.heading = freshHeading(a.fast);
    }

    const v = animalVelocity(a), vx = v.x + a.kx, vy = v.y + a.ky;
    // Quick prey waits rather than run into a slower animal in front of it.
    a.moving = !a.fast || !list.some(q => !q.fast
      && dist(a.x + vx * dt, a.y + vy * dt, q.x, q.y) < a.r + q.r + 4 && (q.x - a.x) * vx + (q.y - a.y) * vy > 0);
    if (a.moving) {
      a.x += vx * dt;
      a.y += vy * dt;
    }
    const damp = Math.pow(0.01, dt);
    a.kx *= damp;
    a.ky *= damp;
    if (Math.abs(vx) > 2) a.face = vx < 0 ? -1 : 1;

    // The limits of quick prey's strip act as walls.
    if (a.fast) {
      const reach = ANIMALS[a.type].band[1] * b.b, off = a.y - b.cy;
      if (Math.abs(off) > reach) {
        a.y = b.cy + Math.sign(off) * reach;
        ricochet(a, 0, -Math.sign(off));
      }
    }
    // So does the edge of the field.
    if (b.fieldG(a.x, a.y, a.r + 6) >= 1) {
      const N = b.fieldN(a.x, a.y, a.r + 6);
      ricochet(a, -N.x, -N.y, a.fast ? 0 : 0.4);
    }
  }

  // Slow animals that run into each other bounce apart. One that walks into quick prey
  // does all the giving way itself, and two quick animals simply cross.
  for (let i = 0; i < list.length; i++) {
    for (let j = i + 1; j < list.length; j++) {
      const p = list[i], q = list[j];
      if (p.fast && q.fast) continue;
      const dx = q.x - p.x, dy = q.y - p.y, d = Math.hypot(dx, dy), min = p.r + q.r + 4;
      if (d >= min || d < 0.01) continue;
      const ux = dx / d, uy = dy / d, pGives = p.fast ? 0 : q.fast ? 1 : 0.5, over = min - d;
      p.x -= ux * over * pGives; p.y -= uy * over * pGives;
      q.x += ux * over * (1 - pGives); q.y += uy * over * (1 - pGives);
      if (!p.fast) ricochet(p, -ux, -uy, 0.4);
      if (!q.fast) ricochet(q, ux, uy, 0.4);
    }
  }

  // ...and are kept out of the castles and inside the field.
  for (const a of list) {
    for (const c of b.castles) {
      pushOut(a, clamp(a.x, c.x - CASTLE.halfLen, c.x + CASTLE.halfLen), c.y, a.r + CASTLE.r + 4);
      pushOut(a, c.launch.x, c.launch.y, a.r + LAUNCH_CLEAR);
    }
    for (let k = 0; k < 8 && b.fieldG(a.x, a.y, a.r + 3) >= 1; k++) {
      const N = b.fieldN(a.x, a.y, a.r + 3);
      a.x -= N.x * 2;
      a.y -= N.y * 2;
    }
  }
}
