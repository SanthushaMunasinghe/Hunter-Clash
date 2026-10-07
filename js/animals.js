import { ANIMALS, MIN_ANIMALS, MAX_ANIMALS, HUNTER, HTOWER, CASTLE } from './config.js';
import { rand, dist, clamp, gap, TAU } from './utils.js';

const LAUNCH_CLEAR = 42; // animals keep out of the mouth of each castle

function makeAnimal(m, type, x, y, spawn = 1) {
  const d = ANIMALS[type];
  return {
    id: m.nextId++, type, x, y, r: d.r, hp: d.hp, maxHp: d.hp, speed: d.speed,
    heading: rand(TAU), wanderT: rand(0.5, 3), moving: Math.random() < 0.6,
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
  for (const h of m.hunters) if (dist(x, y, h.x, h.y) < r + HUNTER.r + 8) return false;
  for (const t of m.htowers) if (dist(x, y, t.x, t.y) < r + HTOWER.r + 8) return false;
  return true;
}

// Animals always arrive as a point-mirrored pair so neither side gets a better field.
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

export function initAnimals(m) {
  const b = m.board;
  m.animals.push(makeAnimal(m, 'dino', b.cx, b.cy));
  for (const type of ['bear', 'bull', 'cow', 'cow', 'sheep', 'sheep', 'sheep']) spawnPair(m, type, 1);
}

function randomType() {
  let total = 0;
  for (const k in ANIMALS) total += ANIMALS[k].weight;
  let roll = rand(total);
  for (const k in ANIMALS) {
    roll -= ANIMALS[k].weight;
    if (roll <= 0) return k;
  }
  return 'sheep';
}

// Animals only ever arrive at the start of a turn: one mirrored pair while there is
// room, and as many as it takes to keep at least MIN_ANIMALS on the field.
export function respawnAnimals(m) {
  if (m.animals.length <= MAX_ANIMALS - 2) spawnPair(m, randomType(), 0);
  for (let i = 0; i < 6 && m.animals.length < MIN_ANIMALS; i++) spawnPair(m, randomType(), 0);
}

function pushOut(a, px, py, minDist) {
  const dx = a.x - px, dy = a.y - py, d = Math.hypot(dx, dy);
  if (d >= minDist) return;
  if (d < 0.01) { a.y += minDist; return; }
  a.x = px + (dx / d) * minDist;
  a.y = py + (dy / d) * minDist;
}

export function updateAnimals(m, dt) {
  const b = m.board, list = m.animals;

  for (const a of list) {
    a.flash = Math.max(0, a.flash - dt);
    a.spawn = Math.min(1, a.spawn + dt * 2.5);
    a.wanderT -= dt;
    if (a.wanderT <= 0) {
      a.wanderT = rand(1.5, 4);
      a.moving = Math.random() < 0.72;
      a.heading += rand(-1.3, 1.3);
    }

    // Turn back before reaching the edge.
    if (b.fieldG(a.x, a.y, a.r + 10) > 0.9) {
      const N = b.fieldN(a.x, a.y, a.r + 10);
      a.heading = Math.atan2(-N.y, -N.x) + rand(-0.7, 0.7);
      a.moving = true;
    }

    let vx = a.kx, vy = a.ky;
    if (a.moving) {
      vx += Math.cos(a.heading) * a.speed;
      vy += Math.sin(a.heading) * a.speed;
    }
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

  // ...and out of anything solid.
  for (const a of list) {
    for (const h of m.hunters) pushOut(a, h.x, h.y, a.r + HUNTER.r + 3);
    for (const t of m.htowers) pushOut(a, t.x, t.y, a.r + HTOWER.r + 3);
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
