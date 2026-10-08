import { ANIMALS, HERD, HERD_START, CASTLE } from './config.js';
import { rand, dist, clamp, gap, TAU } from './utils.js';

const LAUNCH_CLEAR = 42; // animals keep out of the mouth of each castle

// left: meat still on the animal. It drains as hunting damage lands and is what the
// number over its head shows.
function makeAnimal(m, type, x, y, spawn = 1) {
  const d = ANIMALS[type];
  return {
    id: m.nextId++, type, x, y, r: d.r, hp: d.hp, maxHp: d.hp, meat: d.meat, left: d.meat,
    speed: d.speed, fast: !!d.fast,
    heading: rand(TAU), wanderT: rand(0.5, 2), moving: Math.random() < 0.7,
    face: Math.random() < 0.5 ? -1 : 1, kx: 0, ky: 0, flash: 0, spawn,
  };
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
    const x = b.cx + rand(-b.a, b.a), y = rand(b.cy + r + 4, b.FB);
    const mx = 2 * b.cx - x, my = 2 * b.cy - y;
    const pad = tries < 200 ? 16 : 4;
    if (dist(x, y, mx, my) < 2 * r + pad) continue;
    if (!spotFree(m, x, y, r, pad) || !spotFree(m, mx, my, r, pad)) continue;
    m.animals.push(makeAnimal(m, type, x, y, spawn), makeAnimal(m, type, mx, my, spawn));
    return true;
  }
  return false;
}

function spawnOne(m, type) {
  const b = m.board, r = ANIMALS[type].r;
  for (let tries = 0; tries < 200; tries++) {
    const x = b.cx + rand(-b.a, b.a), y = rand(b.FT, b.FB);
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

function pushOut(a, px, py, minDist) {
  const dx = a.x - px, dy = a.y - py, d = Math.hypot(dx, dy);
  if (d >= minDist) return;
  if (d < 0.01) { a.y += minDist; return; }
  a.x = px + (dx / d) * minDist;
  a.y = py + (dy / d) * minDist;
}

// Current wander velocity, without knock-back. The AI uses it to lead its shots.
export function animalVelocity(a) {
  return a.moving ? { x: Math.cos(a.heading) * a.speed, y: Math.sin(a.heading) * a.speed } : { x: 0, y: 0 };
}

export function updateAnimals(m, dt) {
  const b = m.board, list = m.animals;

  for (const a of list) {
    a.flash = Math.max(0, a.flash - dt);
    a.spawn = Math.min(1, a.spawn + dt * 2.5);
    a.wanderT -= dt;
    if (a.wanderT <= 0) {
      // Fast animals dart about in short straight runs; slow ones amble and graze.
      a.wanderT = a.fast ? rand(0.9, 2.2) : rand(1.5, 4);
      a.moving = Math.random() < (a.fast ? 0.85 : 0.72);
      a.heading += a.fast ? rand(-2, 2) : rand(-1.3, 1.3);
    }

    // Turn back before reaching the edge.
    if (b.fieldG(a.x, a.y, a.r + 10 + a.speed * 0.3) > 0.9) {
      const N = b.fieldN(a.x, a.y, a.r + 10);
      a.heading = Math.atan2(-N.y, -N.x) + rand(-0.7, 0.7);
      a.moving = true;
    }

    const v = animalVelocity(a), vx = v.x + a.kx, vy = v.y + a.ky;
    a.x += vx * dt;
    a.y += vy * dt;
    const damp = Math.pow(0.01, dt);
    a.kx *= damp;
    a.ky *= damp;
    if (Math.abs(vx) > 2) a.face = vx < 0 ? -1 : 1;
  }

  // Keep animals apart from each other...
  for (let i = 0; i < list.length; i++) {
    for (let j = i + 1; j < list.length; j++) {
      const p = list[i], q = list[j];
      const dx = q.x - p.x, dy = q.y - p.y, d = Math.hypot(dx, dy), min = p.r + q.r + 4;
      if (d >= min || d < 0.01) continue;
      const push = (min - d) / 2, ux = dx / d, uy = dy / d;
      p.x -= ux * push; p.y -= uy * push;
      q.x += ux * push; q.y += uy * push;
    }
  }

  // ...and out of the castles and off the field edge.
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
