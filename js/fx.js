import { rand, TAU } from './utils.js';

// Purely visual effects. Nothing here feeds back into game rules.
export class Fx {
  constructor() {
    this.clear();
  }

  clear() {
    this.parts = [];
    this.texts = [];
    this.shots = [];
    this.rings = [];
    this.shake = 0;
  }

  text(x, y, str, color = '#fff', meat = false, size = 16) {
    const tx = { x, y, str, color, meat, size, t: 0, life: 0.95 };
    this.texts.push(tx);
    return tx;
  }

  puff(x, y, color, n = 8, speed = 70) {
    for (let i = 0; i < n; i++) {
      const a = rand(TAU), v = rand(speed * 0.4, speed);
      this.parts.push({
        x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 20,
        r: rand(2, 4.5), color, t: 0, life: rand(0.3, 0.6),
      });
    }
  }

  shot(x0, y0, x1, y1, { dur = 0.2, arc = 14, color = '#6b4423' } = {}) {
    this.shots.push({ x0, y0, x1, y1, dur, arc, color, t: 0 });
  }

  ring(x, y, color, r0 = 10, r1 = 40, life = 0.45) {
    this.rings.push({ x, y, color, r0, r1, t: 0, life });
  }

  update(dt) {
    for (const list of [this.parts, this.texts, this.shots, this.rings]) {
      for (let i = list.length - 1; i >= 0; i--) {
        const e = list[i];
        e.t += dt;
        if (e.t >= (e.life ?? e.dur)) list.splice(i, 1);
      }
    }
    for (const p of this.parts) {
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vy += 160 * dt;
    }
    this.shake = Math.max(0, this.shake - dt * 22);
  }
}
