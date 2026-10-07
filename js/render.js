import { W, BLUE, ROAD, CARDS, HUNTER, ARROW } from './config.js';
import * as S from './sprites.js';
import { seeded, rand, lerp, easeOut, TAU } from './utils.js';

const NOCK = 14;

function trace(g, pts) {
  g.beginPath();
  pts.forEach((p, i) => (i ? g.lineTo(p.x, p.y) : g.moveTo(p.x, p.y)));
  g.closePath();
}

function pine(g, x, y, s) {
  S.shadow(g, x, y + 2 * s, 11 * s, 4 * s, 0.25);
  g.fillStyle = '#7a5230';
  g.fillRect(x - 2 * s, y - 5 * s, 4 * s, 8 * s);
  const cols = ['#2c7838', '#35893e', '#41a046'];
  for (let i = 0; i < 3; i++) {
    const w = (15 - i * 3.5) * s, by = y - 4 * s - i * 9 * s;
    g.fillStyle = cols[i];
    S.poly(g, [x - w, by, x + w, by, x, by - 17 * s]);
    g.fill();
    g.fillStyle = 'rgba(255,255,255,0.08)';
    S.poly(g, [x - w, by, x, by, x, by - 17 * s]);
    g.fill();
  }
}

function rock(g, x, y, s) {
  S.shadow(g, x, y + 1, 15 * s, 5 * s, 0.25);
  g.fillStyle = '#878d93';
  S.poly(g, [x - 14 * s, y, x - 9 * s, y - 13 * s, x + 3 * s, y - 18 * s, x + 14 * s, y - 7 * s, x + 12 * s, y]);
  g.fill();
  g.fillStyle = '#a9afb5';
  S.poly(g, [x - 9 * s, y - 13 * s, x + 3 * s, y - 18 * s, x + 2 * s, y - 6 * s, x - 7 * s, y - 4 * s]);
  g.fill();
}

function bush(g, x, y, s) {
  S.shadow(g, x, y + 4 * s, 10 * s, 3.5 * s, 0.18);
  g.fillStyle = '#5fae3a';
  S.circle(g, x - 5 * s, y, 6 * s);
  g.fill();
  S.circle(g, x + 5 * s, y, 6 * s);
  g.fill();
  g.fillStyle = '#74c446';
  S.circle(g, x, y - 3 * s, 6.5 * s);
  g.fill();
}

export class Renderer {
  constructor(canvas, fx) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.fx = fx;
    this.scale = 1;
    this.bg = document.createElement('canvas');
    this.bgKey = '';
  }

  // scale = device pixels per virtual pixel.
  setScale(scale) {
    this.scale = scale;
  }

  // The board never changes during a match, so it is painted once to an offscreen canvas.
  buildBackground(b) {
    const s = this.scale, H = b.H, rnd = seeded(11);
    this.bg.width = Math.round(W * s);
    this.bg.height = Math.round(H * s);
    const g = this.bg.getContext('2d');
    g.setTransform(s, 0, 0, s, 0, 0);

    g.fillStyle = '#57a83a';
    g.fillRect(0, 0, W, H);
    for (let i = 0; i < 80; i++) {
      g.fillStyle = rnd() < 0.5 ? 'rgba(255,255,160,0.07)' : 'rgba(0,70,20,0.09)';
      S.ellipse(g, rnd() * W, rnd() * H, 20 + rnd() * 50, 12 + rnd() * 26);
      g.fill();
    }

    // Streams tucked into two opposite corners.
    for (const [wx, wy] of [[-6, b.FB - 60], [W + 6, b.FT + 60]]) {
      g.fillStyle = '#3fa9b8';
      S.ellipse(g, wx, wy, 44, 130);
      g.fill();
      g.fillStyle = '#58c3cf';
      S.ellipse(g, wx, wy, 32, 112);
      g.fill();
    }

    // Road loop.
    g.lineJoin = 'round';
    trace(g, b.roadPts);
    g.strokeStyle = '#4a973a';
    g.lineWidth = ROAD.width + 18;
    g.stroke();
    g.strokeStyle = '#b28348';
    g.lineWidth = ROAD.width + 6;
    g.stroke();
    g.strokeStyle = '#ecc986';
    g.lineWidth = ROAD.width;
    g.stroke();
    g.strokeStyle = 'rgba(255,236,186,0.5)';
    g.lineWidth = ROAD.width - 24;
    g.stroke();
    for (const p of b.roadPts) {
      for (let k = 0; k < 3; k++) {
        g.fillStyle = rnd() < 0.5 ? '#d6ad68' : '#f6dfaa';
        S.circle(g, p.x + (rnd() - 0.5) * (ROAD.width - 10), p.y + (rnd() - 0.5) * (ROAD.width - 10), 1 + rnd() * 1.6);
        g.fill();
      }
    }

    // Centre field.
    trace(g, b.fieldPts);
    g.fillStyle = '#93d454';
    g.fill();
    g.save();
    g.clip();
    for (let i = 0; i < 46; i++) {
      g.fillStyle = rnd() < 0.5 ? 'rgba(255,255,170,0.10)' : 'rgba(40,120,30,0.10)';
      S.ellipse(g, b.cx + (rnd() - 0.5) * b.a * 2, b.cy + (rnd() - 0.5) * b.b * 2, 16 + rnd() * 34, 9 + rnd() * 16);
      g.fill();
    }
    const scatter = (count, inset, fn) => {
      for (let i = 0, tries = 0; i < count && tries < count * 20; tries++) {
        const x = b.cx + (rnd() - 0.5) * b.a * 2, y = b.cy + (rnd() - 0.5) * b.b * 2;
        if (b.fieldG(x, y, inset) >= 1) continue;
        fn(x, y);
        i++;
      }
    };
    scatter(70, 10, (x, y) => {
      g.strokeStyle = 'rgba(60,140,40,0.55)';
      g.lineWidth = 1.5;
      g.beginPath();
      g.moveTo(x - 3, y); g.lineTo(x - 4, y - 5);
      g.moveTo(x, y); g.lineTo(x, y - 6);
      g.moveTo(x + 3, y); g.lineTo(x + 4, y - 5);
      g.stroke();
    });
    scatter(16, 18, (x, y) => bush(g, x, y, 0.9 + rnd() * 0.4));
    scatter(40, 10, (x, y) => {
      g.fillStyle = rnd() < 0.7 ? '#fffbe8' : '#ffe27a';
      for (let k = 0; k < 4; k++) {
        S.circle(g, x + Math.cos(k * TAU / 4) * 2.2, y + Math.sin(k * TAU / 4) * 2.2, 1.7);
        g.fill();
      }
      g.fillStyle = '#f2b93a';
      S.circle(g, x, y, 1.3);
      g.fill();
    });
    g.restore();
    trace(g, b.fieldPts);
    g.strokeStyle = '#a5773d';
    g.lineWidth = 3.5;
    g.stroke();
    trace(g, b.ring(-4));
    g.strokeStyle = 'rgba(255,255,255,0.2)';
    g.lineWidth = 1.5;
    g.stroke();

    // Fence around the outside of the road, open behind each castle.
    const fence = b.ring(ROAD.offset + ROAD.width / 2 + 6, 420);
    const posts = [];
    let acc = 0;
    for (let i = 0; i < fence.length; i++) {
      const p = fence[i], q = fence[(i + 1) % fence.length];
      acc += Math.hypot(q.x - p.x, q.y - p.y);
      if (acc < 24) continue;
      acc = 0;
      posts.push(Math.abs(q.x - b.cx) < 82 ? null : q);
    }
    g.lineCap = 'round';
    for (let i = 0; i < posts.length; i++) {
      const p = posts[i], q = posts[(i + 1) % posts.length];
      if (!p || !q) continue;
      for (const dy of [-9, -4]) {
        g.strokeStyle = dy === -9 ? '#b98652' : '#8c5f33';
        g.lineWidth = 2.6;
        g.beginPath();
        g.moveTo(p.x, p.y + dy);
        g.lineTo(q.x, q.y + dy);
        g.stroke();
      }
    }
    g.lineCap = 'butt';
    for (const p of posts) {
      if (!p) continue;
      g.fillStyle = '#7a4f26';
      S.rr(g, p.x - 2.5, p.y - 13, 5, 15, 1.5);
      g.fill();
      g.fillStyle = '#b98652';
      S.rr(g, p.x - 2.5, p.y - 13, 5, 4, 1.5);
      g.fill();
    }

    // Forest and rocks fill everything outside the fence.
    const outside = (x, y, margin) => b.fieldG(x, y, -(ROAD.offset + ROAD.width / 2 + margin)) >= 1;
    const deco = [];
    for (let gy = -10; gy < H + 30; gy += 26) {
      for (let gx = -10; gx < W + 20; gx += 26) {
        const x = gx + rnd() * 20, y = gy + rnd() * 20;
        if (!outside(x, y, 22) || rnd() < 0.2) continue;
        deco.push({ x, y, s: 0.9 + rnd() * 0.7, rock: rnd() < 0.12 });
      }
    }
    deco.sort((p, q) => p.y - q.y);
    for (const d of deco) (d.rock ? rock : pine)(g, d.x, d.y, d.s);
  }

  draw(game, input, t) {
    const ctx = this.ctx, m = game.match, s = this.scale;
    ctx.setTransform(s, 0, 0, s, 0, 0);
    if (!m) return;
    const b = m.board, key = b.H + ':' + s;
    if (this.bgKey !== key) {
      this.buildBackground(b);
      this.bgKey = key;
    }
    ctx.drawImage(this.bg, 0, 0, W, b.H);

    const sh = this.fx.shake;
    if (sh > 0.2) ctx.translate(rand(-sh, sh), rand(-sh, sh));

    const drag = input.drag;
    this.drawCheckpoints(ctx, m);
    if (drag) this.drawDropZones(ctx, m, drag, t);
    this.drawEntities(ctx, m, t);
    this.drawAim(ctx, m, t);
    this.drawArrow(ctx, m);
    this.drawFx(ctx);
    if (drag) this.drawDropGhost(ctx, m, drag, t);
  }

  drawCheckpoints(ctx, m) {
    m.lanes.forEach((lane, li) => {
      for (const cp of lane.cps) {
        const p = m.board.lanePoint(li, cp.slot);
        S.drawCheckpoint(ctx, p.x, p.y, cp.owner, cp.pop);
      }
    });
  }

  // Everything standing on the board, painted back to front.
  drawEntities(ctx, m, t) {
    const b = m.board, list = [];
    const add = (y, fn) => list.push({ y, fn });

    m.lanes.forEach((lane, li) => {
      const outward = li === 0 ? -1 : 1;
      for (const cp of lane.cps) {
        const p = b.lanePoint(li, cp.slot);
        add(p.y - 4, () => S.drawCheckpointFlag(ctx, p.x + outward * 19, p.y + 2, cp.owner, t));
      }
      for (const tw of lane.towers) {
        const p = b.lanePoint(li, tw.slot);
        add(p.y, () => S.drawTower(ctx, p.x, p.y, tw.team, tw.hp / tw.maxHp, tw.flash, tw.born, t));
      }
      for (const sq of lane.squads) {
        const p = b.lanePoint(li, sq.vis);
        // Step aside when sharing a checkpoint with a friendly tower.
        if (lane.towers.some(tw => tw.slot === sq.slot)) p.x -= outward * 15;
        const k = sq.lunge > 0 ? Math.sin((1 - sq.lunge / 0.22) * Math.PI) * 12 : 0;
        const count = Math.max(1, Math.ceil((sq.hp / sq.maxHp) * 3));
        add(p.y + 6, () => S.drawSquad(ctx, p.x + sq.lx * k, p.y + sq.ly * k, sq.team, sq.kind, count, sq.hp, sq.flash, t, sq.walking));
      }
    });
    for (const w of m.walls) add(w.y, () => S.drawWall(ctx, w.x, w.y, w.team, w.hp / w.maxHp, w.flash, w.born));
    for (const h of m.hunters) add(h.vy + 6, () => S.drawHunter(ctx, h.vx, h.vy, h.team, h.hp / h.maxHp, h.flash, h.born));
    for (const a of m.animals) add(a.y + a.r * 0.6, () => S.drawAnimal(ctx, a, t));
    for (const c of b.castles) {
      const st = m.castles[c.team];
      add(c.drawY + 20, () => S.drawCastle(ctx, c.team, c.x, c.drawY, st.hp, st.flash));
    }

    list.sort((p, q) => p.y - q.y);
    for (const e of list) e.fn();
  }

  drawAim(ctx, m, t) {
    const b = m.board;
    if (m.phase === 'aim' && m.turnTeam === BLUE && !m.aim) {
      // Idle hint: a faint guide sweeping across the field.
      const L = b.castles[BLUE].launch, ang = -Math.PI / 2 + Math.sin(t * 1.3) * 0.55;
      for (let i = 1; i <= 9; i++) {
        ctx.fillStyle = `rgba(255,255,255,${0.5 - i * 0.045})`;
        S.circle(ctx, L.x + Math.cos(ang) * i * 16, L.y + Math.sin(ang) * i * 16, 3);
        ctx.fill();
      }
      S.drawArrow(ctx, L.x + Math.cos(ang) * NOCK, L.y + Math.sin(ang) * NOCK, ang, BLUE);
      return;
    }
    const aim = m.aim;
    if (!aim || !aim.path) return;
    const pts = aim.path, L = pts[0], col = aim.team === BLUE ? '255,255,255' : '255,190,190';

    // Pulled-back string behind the launch point.
    const bx = L.x - Math.cos(aim.angle) * aim.pull * 0.6, by = L.y - Math.sin(aim.angle) * aim.pull * 0.6;
    ctx.strokeStyle = `rgba(${col},0.5)`;
    ctx.lineWidth = 5;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(L.x, L.y);
    ctx.lineTo(bx, by);
    ctx.stroke();
    ctx.lineCap = 'butt';

    const flow = (t * 46) % 15;
    const dots = (p, q, maxLen, a0, a1) => {
      const full = Math.hypot(q.x - p.x, q.y - p.y), len = Math.min(full, maxLen);
      for (let d = flow; d < len; d += 15) {
        const k = d / full;
        ctx.fillStyle = `rgba(${col},${lerp(a0, a1, d / len)})`;
        S.circle(ctx, lerp(p.x, q.x, k), lerp(p.y, q.y, k), 3.4);
        ctx.fill();
        ctx.strokeStyle = 'rgba(31,36,51,0.45)';
        ctx.lineWidth = 1;
        ctx.stroke();
      }
    };
    if (pts[1]) {
      dots(L, pts[1], Infinity, 0.95, 0.95);
      ctx.strokeStyle = `rgba(${col},0.95)`;
      ctx.lineWidth = 2.5;
      S.circle(ctx, pts[1].x, pts[1].y, ARROW.radius + 3);
      ctx.stroke();
    }
    if (pts[2]) dots(pts[1], pts[2], 130, 0.7, 0.05);
    S.drawArrow(ctx, L.x + Math.cos(aim.angle) * NOCK, L.y + Math.sin(aim.angle) * NOCK, aim.angle, aim.team);
  }

  drawArrow(ctx, m) {
    const ar = m.arrow;
    if (!ar) return;
    const c = S.TEAM_COL[ar.team], alpha = ar.done ? Math.max(0, ar.fade / 0.3) : 1;
    ctx.lineCap = 'round';
    for (let i = 1; i < ar.trail.length; i++) {
      const p = ar.trail[i - 1], q = ar.trail[i], k = i / ar.trail.length;
      ctx.strokeStyle = c.light;
      ctx.globalAlpha = k * 0.6 * alpha;
      ctx.lineWidth = 2 + k * 5;
      ctx.beginPath();
      ctx.moveTo(p.x, p.y);
      ctx.lineTo(q.x, q.y);
      ctx.stroke();
    }
    ctx.lineCap = 'butt';
    ctx.globalAlpha = alpha;
    S.drawArrow(ctx, ar.x, ar.y, Math.atan2(ar.dy, ar.dx), ar.team, 1.1);
    ctx.globalAlpha = 1;
  }

  drawFx(ctx) {
    const fx = this.fx;
    for (const r of fx.rings) {
      const k = r.t / r.life;
      ctx.globalAlpha = 1 - k;
      ctx.strokeStyle = r.color;
      ctx.lineWidth = 4 * (1 - k) + 1;
      S.circle(ctx, r.x, r.y, lerp(r.r0, r.r1, easeOut(k)));
      ctx.stroke();
    }
    for (const p of fx.parts) {
      const k = p.t / p.life;
      ctx.globalAlpha = 1 - k;
      ctx.fillStyle = p.color;
      S.circle(ctx, p.x, p.y, p.r * (1 - k * 0.5));
      ctx.fill();
    }
    ctx.globalAlpha = 1;
    for (const s of fx.shots) {
      const k = s.t / s.dur, e = 0.02;
      const at = u => ({ x: lerp(s.x0, s.x1, u), y: lerp(s.y0, s.y1, u) - Math.sin(u * Math.PI) * s.arc });
      const p = at(k), q = at(Math.min(1, k + e));
      S.drawArrow(ctx, p.x, p.y, Math.atan2(q.y - p.y, q.x - p.x), BLUE, 0.6);
    }
    for (const tx of fx.texts) {
      const k = tx.t / tx.life, y = tx.y - easeOut(k) * 26;
      ctx.globalAlpha = k < 0.7 ? 1 : 1 - (k - 0.7) / 0.3;
      if (tx.meat) {
        ctx.font = S.fontStr(tx.size);
        const w = ctx.measureText(tx.str).width;
        S.meatIcon(ctx, tx.x - w / 2 - 4, y, 0.75);
        S.label(ctx, tx.str, tx.x + 9, y, tx.size, tx.color);
      } else {
        S.label(ctx, tx.str, tx.x, y, tx.size, tx.color);
      }
    }
    ctx.globalAlpha = 1;
  }

  // Where the card being dragged is allowed to land.
  drawDropZones(ctx, m, d, t) {
    const b = m.board, pulse = 0.5 + 0.5 * Math.sin(t * 6);
    if (CARDS[d.id].zone === 'center') {
      const line = d.options.line;
      ctx.save();
      trace(ctx, b.fieldPts);
      ctx.clip();
      ctx.fillStyle = `rgba(47,141,242,${0.2 + pulse * 0.08})`;
      ctx.fillRect(0, line, W, b.FB - line + 10);
      ctx.setLineDash([10, 8]);
      ctx.lineDashOffset = -t * 30;
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(0, line);
      ctx.lineTo(W, line);
      ctx.stroke();
      ctx.restore();
      return;
    }
    for (const o of d.options.spots) {
      const on = d.target && d.target.valid && d.target.lane === o.lane && d.target.slot === o.slot;
      ctx.fillStyle = on ? 'rgba(70,170,255,0.85)' : `rgba(70,170,255,${0.45 + pulse * 0.2})`;
      S.ellipse(ctx, o.x, o.y, on ? 28 : 24, on ? 22 : 19);
      ctx.fill();
      ctx.setLineDash(on ? [] : [6, 5]);
      ctx.lineDashOffset = -t * 20;
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = on ? 3.5 : 2.5;
      ctx.stroke();
      ctx.setLineDash([]);
    }
  }

  // Preview of the piece itself under the finger.
  drawDropGhost(ctx, m, d, t) {
    const tg = d.target;
    if (!tg || !d.onBoard) return;
    const zone = CARDS[d.id].zone;
    if (zone === 'center') {
      ctx.globalAlpha = tg.valid ? 0.9 : 0.45;
      if (d.id === 'hunter') {
        if (tg.valid) {
          ctx.strokeStyle = 'rgba(255,255,255,0.5)';
          ctx.lineWidth = 2;
          ctx.setLineDash([6, 6]);
          S.circle(ctx, tg.x, tg.y, HUNTER.range);
          ctx.stroke();
          ctx.setLineDash([]);
        }
        S.drawHunter(ctx, tg.x, tg.y, BLUE, 1, 0, 1, false);
      } else {
        S.drawWall(ctx, tg.x, tg.y, BLUE, 1, 0);
      }
      ctx.globalAlpha = 1;
      if (!tg.valid) {
        ctx.strokeStyle = '#ff4d4d';
        ctx.lineWidth = 5;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(tg.x - 12, tg.y - 12); ctx.lineTo(tg.x + 12, tg.y + 12);
        ctx.moveTo(tg.x + 12, tg.y - 12); ctx.lineTo(tg.x - 12, tg.y + 12);
        ctx.stroke();
        ctx.lineCap = 'butt';
      }
    } else if (tg.valid) {
      ctx.globalAlpha = 0.85;
      if (zone === 'lane') S.drawSquad(ctx, tg.x, tg.y, BLUE, d.id, 3, null, 0, t, true);
      else S.drawTower(ctx, tg.x, tg.y, BLUE, 1, 0, 1, t, false);
      ctx.globalAlpha = 1;
    }
  }
}
