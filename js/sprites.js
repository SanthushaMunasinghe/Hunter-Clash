import { BLUE, CASTLE } from './config.js';
import { TAU, easeOutBack } from './utils.js';

// All art is drawn procedurally so the game ships with no image assets.

export const TEAM_COL = [
  { main: '#2f8df2', dark: '#1a5cb4', light: '#8fcbff' },
  { main: '#ee4848', dark: '#b02a2a', light: '#ff9c9c' },
];
export const INK = '#1f2433';

// weight flips to bold if the web font fails to load (see main.js).
export const font = {
  family: '"Lilita One", "Arial Rounded MT Bold", "Trebuchet MS", system-ui, sans-serif',
  weight: '400',
};
export const fontStr = px => `${font.weight} ${px}px ${font.family}`;

const STONE = '#ece5d2', STONE_SHADE = '#d0c7ae', STONE_LINE = '#8f8670';
const SOFT_LINE = 'rgba(40,30,30,0.5)';

// ------------------------------------------------------------------ primitives

// Safari before 16 has no roundRect.
if (!CanvasRenderingContext2D.prototype.roundRect) {
  CanvasRenderingContext2D.prototype.roundRect = function (x, y, w, h, r = 0) {
    const [tl, tr = tl, br = tl, bl = tr] = [].concat(r);
    const lim = Math.min(w, h) / 2, c = v => Math.max(0, Math.min(v, lim));
    this.moveTo(x + c(tl), y);
    this.arcTo(x + w, y, x + w, y + h, c(tr));
    this.arcTo(x + w, y + h, x, y + h, c(br));
    this.arcTo(x, y + h, x, y, c(bl));
    this.arcTo(x, y, x + w, y, c(tl));
    this.closePath();
  };
}

export function circle(ctx, x, y, r) {
  ctx.beginPath();
  ctx.arc(x, y, r, 0, TAU);
}

export function ellipse(ctx, x, y, rx, ry) {
  ctx.beginPath();
  ctx.ellipse(x, y, rx, ry, 0, 0, TAU);
}

export function rr(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
}

// pts is a flat [x0, y0, x1, y1, ...] list.
export function poly(ctx, pts) {
  ctx.beginPath();
  ctx.moveTo(pts[0], pts[1]);
  for (let i = 2; i < pts.length; i += 2) ctx.lineTo(pts[i], pts[i + 1]);
  ctx.closePath();
}

export function shadow(ctx, x, y, rx, ry = rx * 0.4, alpha = 0.22) {
  ctx.fillStyle = `rgba(20,50,20,${alpha})`;
  ellipse(ctx, x, y, rx, ry);
  ctx.fill();
}

export function label(ctx, txt, x, y, size = 16, fill = '#fff', align = 'center') {
  ctx.font = fontStr(size);
  ctx.textAlign = align;
  ctx.textBaseline = 'middle';
  ctx.lineJoin = 'round';
  ctx.lineWidth = Math.max(3, size * 0.3);
  ctx.strokeStyle = INK;
  ctx.strokeText(txt, x, y);
  ctx.fillStyle = fill;
  ctx.fillText(txt, x, y);
}

export function meatIcon(ctx, x, y, s = 1) {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(s, s);
  ctx.rotate(-0.7);
  ctx.lineWidth = 2.2;
  ctx.strokeStyle = INK;
  ctx.lineJoin = 'round';
  ctx.beginPath();
  ctx.rect(-12, -2, 9, 4);
  ctx.moveTo(-9.5, -2.6); ctx.arc(-12, -2.6, 2.5, 0, TAU);
  ctx.moveTo(-9.5, 2.6); ctx.arc(-12, 2.6, 2.5, 0, TAU);
  ctx.stroke();
  ctx.fillStyle = '#fff5e4';
  ctx.fill();
  ellipse(ctx, 2, 0, 7.5, 6);
  ctx.stroke();
  ctx.fillStyle = '#f0627a';
  ctx.fill();
  ctx.fillStyle = '#ff9fae';
  ellipse(ctx, 3.5, -2, 3, 1.8);
  ctx.fill();
  ctx.restore();
}

export function hpBar(ctx, x, y, w, frac, team) {
  ctx.fillStyle = INK;
  rr(ctx, x - w / 2 - 1.5, y - 1.5, w + 3, 7, 3.5);
  ctx.fill();
  ctx.fillStyle = TEAM_COL[team].main;
  rr(ctx, x - w / 2, y, Math.max(2, w * Math.max(0, frac)), 4, 2);
  ctx.fill();
}

function block(ctx, x, y, w, h, rad, fill, shade, line = SOFT_LINE) {
  ctx.fillStyle = fill;
  rr(ctx, x, y, w, h, rad);
  ctx.fill();
  if (shade) {
    ctx.save();
    rr(ctx, x, y, w, h, rad);
    ctx.clip();
    ctx.fillStyle = shade;
    ctx.fillRect(x, y + h * 0.66, w, h);
    ctx.restore();
  }
  ctx.strokeStyle = line;
  ctx.lineWidth = 1.4;
  rr(ctx, x, y, w, h, rad);
  ctx.stroke();
}

function stone(ctx, x, y, w, h, rad = 3) {
  block(ctx, x, y, w, h, rad, STONE, STONE_SHADE, STONE_LINE);
}

function bricks(ctx, x, y, w, h, rows) {
  const rh = h / rows;
  ctx.strokeStyle = 'rgba(120,108,85,0.35)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let i = 1; i < rows; i++) {
    ctx.moveTo(x + 2, y + i * rh);
    ctx.lineTo(x + w - 2, y + i * rh);
  }
  for (let i = 0; i < rows; i++) {
    for (let k = i % 2 ? 0.25 : 0.5; k < 1; k += 0.5) {
      ctx.moveTo(x + w * k, y + i * rh + 1);
      ctx.lineTo(x + w * k, y + (i + 1) * rh - 1);
    }
  }
  ctx.stroke();
}

function flag(ctx, x, y, h, team, t, size = 1) {
  const c = TEAM_COL[team], wave = Math.sin(t * 5 + x) * 1.5 * size;
  ctx.strokeStyle = '#6f4a28';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.lineTo(x, y - h);
  ctx.stroke();
  ctx.fillStyle = c.main;
  poly(ctx, [x, y - h, x + 12 * size, y - h + 4 * size + wave, x, y - h + 9 * size]);
  ctx.fill();
  ctx.strokeStyle = c.dark;
  ctx.lineWidth = 1;
  ctx.stroke();
}

// Flash white when hit: a soft blob over the sprite's footprint.
function hitFlash(ctx, x, y, rx, ry, amount) {
  if (amount <= 0) return;
  ctx.fillStyle = `rgba(255,255,255,${Math.min(0.75, amount * 4)})`;
  ellipse(ctx, x, y, rx, ry);
  ctx.fill();
}

// ------------------------------------------------------------------ animals

function legs(ctx, r, col) {
  ctx.fillStyle = col;
  rr(ctx, -0.62 * r, 0.42 * r, 0.36 * r, 0.52 * r, 0.1 * r);
  ctx.fill();
  rr(ctx, 0.26 * r, 0.42 * r, 0.36 * r, 0.52 * r, 0.1 * r);
  ctx.fill();
}

function eyes(ctx, r, y, dx = 0.26) {
  ctx.fillStyle = '#1d1a22';
  circle(ctx, -dx * r, y * r, 0.09 * r + 0.7);
  ctx.fill();
  circle(ctx, dx * r, y * r, 0.09 * r + 0.7);
  ctx.fill();
}

const ANIMAL_ART = {
  sheep(ctx, r) {
    legs(ctx, r, '#4b4450');
    ctx.fillStyle = '#f8f5ee';
    ctx.strokeStyle = 'rgba(60,50,50,0.5)';
    ctx.lineWidth = 2.4;
    ctx.beginPath();
    for (let i = 0; i < 9; i++) {
      const a = (i / 9) * TAU, px = Math.cos(a) * r * 0.62, py = -0.2 * r + Math.sin(a) * r * 0.46;
      ctx.moveTo(px + r * 0.38, py);
      ctx.arc(px, py, r * 0.38, 0, TAU);
    }
    ctx.stroke();
    ctx.fill();
    ellipse(ctx, 0, -0.2 * r, r * 0.7, r * 0.55);
    ctx.fill();
    ctx.fillStyle = '#5b5361';
    ellipse(ctx, -0.56 * r, 0.12 * r, 0.2 * r, 0.11 * r);
    ctx.fill();
    ellipse(ctx, 0.56 * r, 0.12 * r, 0.2 * r, 0.11 * r);
    ctx.fill();
    block(ctx, -0.42 * r, -0.1 * r, 0.84 * r, 0.8 * r, 0.3 * r, '#5b5361', '#4a4350');
    ctx.fillStyle = '#fff';
    circle(ctx, -0.18 * r, 0.22 * r, 0.12 * r + 0.6);
    ctx.fill();
    circle(ctx, 0.18 * r, 0.22 * r, 0.12 * r + 0.6);
    ctx.fill();
    eyes(ctx, r, 0.24, 0.18);
    ctx.fillStyle = '#f8f5ee';
    circle(ctx, 0, -0.12 * r, 0.26 * r);
    ctx.fill();
  },

  cow(ctx, r) {
    legs(ctx, r, '#3c363d');
    block(ctx, -0.95 * r, -0.9 * r, 1.9 * r, 1.45 * r, 0.38 * r, '#f6f2ea', '#ddd6c8');
    ctx.save();
    rr(ctx, -0.95 * r, -0.9 * r, 1.9 * r, 1.45 * r, 0.38 * r);
    ctx.clip();
    ctx.fillStyle = '#4f4a55';
    ellipse(ctx, 0.55 * r, -0.78 * r, 0.52 * r, 0.36 * r);
    ctx.fill();
    ellipse(ctx, -0.9 * r, 0.05 * r, 0.3 * r, 0.34 * r);
    ctx.fill();
    ctx.restore();
    ctx.fillStyle = '#e9dcc0';
    poly(ctx, [-0.5 * r, -0.2 * r, -0.72 * r, -0.5 * r, -0.3 * r, -0.3 * r]);
    ctx.fill();
    poly(ctx, [0.5 * r, -0.2 * r, 0.72 * r, -0.5 * r, 0.3 * r, -0.3 * r]);
    ctx.fill();
    block(ctx, -0.5 * r, -0.32 * r, r, 0.95 * r, 0.26 * r, '#f6f2ea', null);
    block(ctx, -0.38 * r, 0.22 * r, 0.76 * r, 0.42 * r, 0.16 * r, '#f3a7b3', null);
    ctx.fillStyle = '#b86a78';
    circle(ctx, -0.15 * r, 0.43 * r, 0.06 * r + 0.4);
    ctx.fill();
    circle(ctx, 0.15 * r, 0.43 * r, 0.06 * r + 0.4);
    ctx.fill();
    eyes(ctx, r, 0, 0.26);
  },

  bull(ctx, r) {
    legs(ctx, r, '#5d3a1f');
    block(ctx, -0.98 * r, -0.92 * r, 1.96 * r, 1.48 * r, 0.36 * r, '#c98f58', '#a8733f');
    ctx.save();
    rr(ctx, -0.98 * r, -0.92 * r, 1.96 * r, 1.48 * r, 0.36 * r);
    ctx.clip();
    ctx.fillStyle = '#a8733f';
    ctx.fillRect(-r, -0.95 * r, 2 * r, 0.3 * r);
    ctx.restore();
    // horns
    ctx.strokeStyle = '#f6ecd6';
    ctx.lineWidth = 0.2 * r;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(-0.5 * r, -0.22 * r);
    ctx.quadraticCurveTo(-0.95 * r, -0.25 * r, -0.92 * r, -0.62 * r);
    ctx.moveTo(0.5 * r, -0.22 * r);
    ctx.quadraticCurveTo(0.95 * r, -0.25 * r, 0.92 * r, -0.62 * r);
    ctx.stroke();
    ctx.lineCap = 'butt';
    block(ctx, -0.54 * r, -0.36 * r, 1.08 * r, 0.98 * r, 0.24 * r, '#dba972', null);
    block(ctx, -0.4 * r, 0.2 * r, 0.8 * r, 0.42 * r, 0.14 * r, '#8a5a34', null);
    ctx.strokeStyle = '#f2c04a';
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.arc(0, 0.62 * r, 0.13 * r, 0.1, Math.PI - 0.1);
    ctx.stroke();
    eyes(ctx, r, -0.04, 0.28);
  },

  bear(ctx, r) {
    legs(ctx, r, '#4a2a17');
    block(ctx, -0.95 * r, -0.85 * r, 1.9 * r, 1.42 * r, 0.42 * r, '#7b4a2c', '#62391f');
    ctx.fillStyle = '#6a3d22';
    circle(ctx, -0.5 * r, -0.42 * r, 0.24 * r);
    ctx.fill();
    circle(ctx, 0.5 * r, -0.42 * r, 0.24 * r);
    ctx.fill();
    ctx.fillStyle = '#c99672';
    circle(ctx, -0.5 * r, -0.42 * r, 0.11 * r);
    ctx.fill();
    circle(ctx, 0.5 * r, -0.42 * r, 0.11 * r);
    ctx.fill();
    block(ctx, -0.6 * r, -0.4 * r, 1.2 * r, 1.05 * r, 0.34 * r, '#8e5a38', null);
    ctx.fillStyle = '#dcb690';
    ellipse(ctx, 0, 0.32 * r, 0.34 * r, 0.26 * r);
    ctx.fill();
    ctx.fillStyle = '#2a1a14';
    ellipse(ctx, 0, 0.22 * r, 0.14 * r, 0.09 * r);
    ctx.fill();
    eyes(ctx, r, -0.02, 0.28);
  },

  dino(ctx, r) {
    ctx.fillStyle = '#3f9a3f';
    poly(ctx, [0.55 * r, 0.05 * r, 1.3 * r, 0.5 * r, 0.5 * r, 0.55 * r]);
    ctx.fill();
    legs(ctx, r, '#2f7d33');
    ctx.fillStyle = '#2f7d33';
    for (let i = -1; i <= 1; i++) {
      poly(ctx, [i * 0.42 * r - 0.16 * r, -1.1 * r, i * 0.42 * r, -1.42 * r, i * 0.42 * r + 0.16 * r, -1.1 * r]);
      ctx.fill();
    }
    block(ctx, -0.85 * r, -0.72 * r, 1.7 * r, 1.32 * r, 0.4 * r, '#54b24e', '#429a40');
    ctx.fillStyle = '#c5e79a';
    rr(ctx, -0.42 * r, 0, 0.84 * r, 0.56 * r, 0.22 * r);
    ctx.fill();
    ctx.fillStyle = '#429a40';
    rr(ctx, -1.0 * r, -0.05 * r, 0.3 * r, 0.16 * r, 0.06 * r);
    ctx.fill();
    rr(ctx, 0.7 * r, -0.05 * r, 0.3 * r, 0.16 * r, 0.06 * r);
    ctx.fill();
    block(ctx, -0.64 * r, -1.16 * r, 1.28 * r, 0.98 * r, 0.3 * r, '#5cbc55', '#4aa648');
    ctx.fillStyle = '#5a1f2a';
    rr(ctx, -0.5 * r, -0.5 * r, r, 0.22 * r, 0.06 * r);
    ctx.fill();
    ctx.fillStyle = '#fff';
    for (let i = 0; i < 5; i++) {
      const tx = -0.46 * r + i * 0.2 * r;
      poly(ctx, [tx, -0.5 * r, tx + 0.14 * r, -0.5 * r, tx + 0.07 * r, -0.36 * r]);
      ctx.fill();
    }
    eyes(ctx, r, -0.84, 0.32);
  },

  rabbit(ctx, r) {
    legs(ctx, r, '#a98c6e');
    ctx.fillStyle = '#ffffff';
    circle(ctx, 0.75 * r, 0.3 * r, 0.24 * r);
    ctx.fill();
    block(ctx, -0.8 * r, -0.5 * r, 1.6 * r, 1.2 * r, 0.5 * r, '#efe2cf', '#d8c6ac');
    for (const sx of [-1, 1]) {
      block(ctx, sx * 0.4 * r - 0.17 * r, -1.8 * r, 0.34 * r, 1.05 * r, 0.17 * r, '#efe2cf', null);
      ctx.fillStyle = '#f3a7b3';
      rr(ctx, sx * 0.4 * r - 0.08 * r, -1.66 * r, 0.16 * r, 0.72 * r, 0.08 * r);
      ctx.fill();
    }
    block(ctx, -0.6 * r, -0.98 * r, 1.2 * r, 0.96 * r, 0.36 * r, '#f6ecdb', null);
    eyes(ctx, r, -0.55, 0.28);
    ctx.fillStyle = '#f08ea0';
    circle(ctx, 0, -0.32 * r, 0.1 * r + 0.5);
    ctx.fill();
  },

  deer(ctx, r) {
    deerArt(ctx, r, '#c98a52', '#a86d3b', '#dcae7c', '#f0e3c8', false);
  },

  stag(ctx, r) {
    deerArt(ctx, r, '#e3ab3c', '#bd8724', '#f2cc72', '#fff6d4', true);
  },
};

// Deer and its golden big brother share a body.
function deerArt(ctx, r, body, shade, face, antler, big) {
  legs(ctx, r, '#6b4a2e');
  block(ctx, -0.85 * r, -0.62 * r, 1.7 * r, 1.25 * r, 0.4 * r, body, shade);
  ctx.fillStyle = 'rgba(255,255,255,0.8)';
  for (const [sx, sy] of [[-0.55, -0.35], [0.5, -0.4], [0.6, -0.05], [-0.62, 0]]) {
    circle(ctx, sx * r, sy * r, 0.09 * r);
    ctx.fill();
  }
  ctx.strokeStyle = antler;
  ctx.lineWidth = 0.15 * r;
  ctx.lineCap = 'round';
  ctx.beginPath();
  for (const sx of [-1, 1]) {
    ctx.moveTo(sx * 0.3 * r, -1.0 * r);
    ctx.lineTo(sx * 0.56 * r, (big ? -1.8 : -1.55) * r);
    ctx.moveTo(sx * 0.4 * r, -1.25 * r);
    ctx.lineTo(sx * 0.8 * r, -1.36 * r);
    if (big) {
      ctx.moveTo(sx * 0.5 * r, -1.55 * r);
      ctx.lineTo(sx * 0.9 * r, -1.72 * r);
    }
  }
  ctx.stroke();
  ctx.lineCap = 'butt';
  ctx.fillStyle = body;
  ellipse(ctx, -0.62 * r, -0.74 * r, 0.22 * r, 0.12 * r);
  ctx.fill();
  ellipse(ctx, 0.62 * r, -0.74 * r, 0.22 * r, 0.12 * r);
  ctx.fill();
  block(ctx, -0.48 * r, -1.06 * r, 0.96 * r, 1.0 * r, 0.3 * r, face, null);
  block(ctx, -0.28 * r, -0.42 * r, 0.56 * r, 0.34 * r, 0.14 * r, '#f6ead6', null);
  ctx.fillStyle = '#2a1a14';
  ellipse(ctx, 0, -0.34 * r, 0.12 * r, 0.08 * r);
  ctx.fill();
  eyes(ctx, r, -0.7, 0.24);
}

// How far above its centre each kind's art reaches, in radii, for placing the label.
const ANIMAL_TOP = { dino: 1.5, rabbit: 1.85, deer: 1.6, stag: 1.85 };

export function drawAnimal(ctx, a, t) {
  const r = a.r;
  const bob = a.moving ? Math.abs(Math.sin(t * 7 + a.id)) * 2 : 0;
  const sc = a.spawn < 1 ? Math.max(0.01, easeOutBack(a.spawn)) : 1;
  ctx.save();
  ctx.translate(a.x, a.y);
  shadow(ctx, 0, r * 0.82, r * sc, r * 0.34 * sc);
  ctx.translate(0, -bob);
  ctx.scale(sc * a.face, sc * (1 - Math.min(0.12, a.flash)));
  ANIMAL_ART[a.type](ctx, r);
  hitFlash(ctx, 0, -0.1 * r, r, r, a.flash);
  ctx.restore();

  if (a.spawn < 1) return;
  const txt = String(a.left), size = 15;
  ctx.font = fontStr(size);
  const w = ctx.measureText(txt).width;
  const top = r * (ANIMAL_TOP[a.type] || 1);
  meatIcon(ctx, a.x - w / 2 - 5, a.y - top - 12, 0.72);
  label(ctx, txt, a.x + 8, a.y - top - 11, size, a.fast ? '#ffe27a' : '#fff');
}

// ------------------------------------------------------------------ buildings

export function drawCastle(ctx, team, x, y, hp, flash) {
  const c = TEAM_COL[team];
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(CASTLE.scale, CASTLE.scale);
  shadow(ctx, 0, 32, 72, 13, 0.25);

  // Side barrels, like the reference art.
  for (const sx of [-1, 1]) {
    block(ctx, sx * 56 - 9, -8, 18, 34, 5, '#9a6a3a', '#7a4f26', '#5a3a1c');
    ctx.fillStyle = '#f2b93a';
    ellipse(ctx, sx * 56, -8, 8.5, 4);
    ctx.fill();
    ctx.strokeStyle = '#5a3a1c';
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.moveTo(sx * 56 - 9, 8);
    ctx.lineTo(sx * 56 + 9, 8);
    ctx.stroke();
  }

  if (hp <= 0) {
    // Destroyed: just a broken stump of the curtain wall.
    stone(ctx, -50, 2, 100, 32, 4);
    bricks(ctx, -50, 2, 100, 32, 2);
    ctx.fillStyle = STONE_SHADE;
    ctx.strokeStyle = STONE_LINE;
    ctx.lineWidth = 1.4;
    for (const [bx, by, bw, bh] of [[-46, -10, 20, 14], [-12, -6, 16, 10], [18, -14, 24, 18], [-64, 22, 14, 10], [52, 20, 16, 12]]) {
      rr(ctx, bx, by, bw, bh, 3);
      ctx.fill();
      ctx.stroke();
    }
    ctx.fillStyle = 'rgba(40,36,48,0.28)';
    rr(ctx, -50, 2, 100, 32, 4);
    ctx.fill();
    ctx.restore();
    return;
  }

  // Keep and roof.
  stone(ctx, -30, -64, 60, 46, 3);
  bricks(ctx, -30, -64, 60, 46, 4);
  ctx.fillStyle = c.dark;
  rr(ctx, -35, -70, 70, 12, 3);
  ctx.fill();
  block(ctx, -31, -90, 62, 24, 5, c.main, c.dark, c.dark);
  ctx.fillStyle = c.light;
  rr(ctx, -25, -87, 50, 4, 2);
  ctx.fill();

  // Curtain wall, battlements and gate.
  stone(ctx, -50, -24, 100, 58, 4);
  bricks(ctx, -50, -24, 100, 58, 4);
  for (let i = 0; i < 5; i++) stone(ctx, -50 + i * 21.5, -36, 14, 15, 2);
  ctx.fillStyle = '#3a2f2a';
  rr(ctx, -14, 2, 28, 32, [14, 14, 0, 0]);
  ctx.fill();
  ctx.strokeStyle = '#6a5a4c';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  for (const gx of [-6, 0, 6]) {
    ctx.moveTo(gx, 6);
    ctx.lineTo(gx, 34);
  }
  ctx.stroke();
  ctx.fillStyle = c.main;
  poly(ctx, [-9, -18, 9, -18, 9, -6, 0, 0, -9, -6]);
  ctx.fill();
  ctx.strokeStyle = c.dark;
  ctx.lineWidth = 1.4;
  ctx.stroke();

  hitFlash(ctx, 0, -24, 62, 60, flash);
  ctx.restore();
  label(ctx, String(hp), x, y - 77 * CASTLE.scale, 20);
}

export function drawTower(ctx, x, y, team, hpFrac, flash, born = 1, t = 0, showHp = true) {
  const c = TEAM_COL[team], sc = born < 1 ? Math.max(0.01, easeOutBack(born)) : 1;
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(sc, sc);
  shadow(ctx, 0, 6, 19, 7);
  stone(ctx, -12, -34, 24, 40, 3);
  bricks(ctx, -12, -34, 24, 40, 4);
  ctx.fillStyle = '#3a2f2a';
  rr(ctx, -3.5, -22, 7, 10, [3.5, 3.5, 0, 0]);
  ctx.fill();
  stone(ctx, -16, -44, 32, 12, 2);
  for (const bx of [-16, -4, 8]) stone(ctx, bx, -50, 8, 8, 1.5);
  ctx.fillStyle = c.main;
  poly(ctx, [-13, -50, 13, -50, 0, -68]);
  ctx.fill();
  ctx.strokeStyle = c.dark;
  ctx.lineWidth = 1.4;
  ctx.stroke();
  ctx.fillStyle = c.light;
  poly(ctx, [-7, -53, 0, -65, -1, -53]);
  ctx.fill();
  flag(ctx, 0, -66, 12, team, t, 0.8);
  hitFlash(ctx, 0, -24, 18, 34, flash);
  ctx.restore();
  if (showHp && born >= 1) hpBar(ctx, x, y + 12, 28, hpFrac, team);
}

function hex(ctx, x, y, r) {
  ctx.beginPath();
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * TAU;
    ctx.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r);
  }
  ctx.closePath();
}

export function drawCheckpoint(ctx, x, y, owner, pop) {
  const k = 1 + Math.sin(Math.min(1, pop * 2) * Math.PI) * 0.25;
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(k, 0.74 * k);
  hex(ctx, 0, 5, 23);
  ctx.fillStyle = '#7a4f24';
  ctx.fill();
  hex(ctx, 0, 0, 23);
  ctx.fillStyle = '#dba866';
  ctx.fill();
  ctx.strokeStyle = '#8a5a2b';
  ctx.lineWidth = 2;
  ctx.stroke();
  hex(ctx, 0, 0, 12);
  ctx.fillStyle = owner < 0 ? '#a9763b' : TEAM_COL[owner].main;
  ctx.fill();
  ctx.strokeStyle = owner < 0 ? '#8a5a2b' : TEAM_COL[owner].dark;
  ctx.stroke();
  ctx.restore();
}

// The slot beside each castle where only its own team may deploy. (dx, dy) points up the lane.
export function drawHomePad(ctx, x, y, team, dx, dy) {
  const c = TEAM_COL[team];
  ctx.save();
  ctx.translate(x, y);
  ctx.fillStyle = c.dark;
  ellipse(ctx, 0, 3, 21, 15);
  ctx.fill();
  ctx.fillStyle = c.main;
  ellipse(ctx, 0, 0, 21, 15);
  ctx.fill();
  ctx.strokeStyle = c.light;
  ctx.lineWidth = 2;
  ellipse(ctx, 0, 0, 16, 11);
  ctx.stroke();
  ctx.rotate(Math.atan2(dy, dx));
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 3;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.beginPath();
  ctx.moveTo(-4, -6);
  ctx.lineTo(3, 0);
  ctx.lineTo(-4, 6);
  ctx.stroke();
  ctx.restore();
}

export function drawCheckpointFlag(ctx, x, y, owner, t) {
  if (owner >= 0) flag(ctx, x, y, 24, owner, t, 1);
}

// ------------------------------------------------------------------ units

function soldier(ctx, x, y, team, kind, bob) {
  const c = TEAM_COL[team];
  ctx.save();
  ctx.translate(x, y - bob);
  ctx.fillStyle = '#3b2f2f';
  ctx.fillRect(-4, 5, 3, 3.5);
  ctx.fillRect(1, 5, 3, 3.5);
  block(ctx, -5.5, -3, 11, 9.5, 3, c.main, c.dark, c.dark);
  ctx.fillStyle = '#ffd7a8';
  circle(ctx, 0, -7, 4.6);
  ctx.fill();
  ctx.strokeStyle = SOFT_LINE;
  ctx.lineWidth = 1;
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(0, -7.6, 4.9, Math.PI, TAU);
  ctx.closePath();
  if (kind === 'melee') {
    ctx.fillStyle = '#b9c0cc';
    ctx.fill();
    ctx.strokeStyle = '#e8edf2';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(7.5, -12);
    ctx.lineTo(7.5, 1);
    ctx.stroke();
    ctx.strokeStyle = '#8b5a2b';
    ctx.beginPath();
    ctx.moveTo(5, 1);
    ctx.lineTo(10, 1);
    ctx.stroke();
    ctx.fillStyle = c.light;
    circle(ctx, -6.5, 1.5, 3.6);
    ctx.fill();
    ctx.strokeStyle = c.dark;
    ctx.lineWidth = 1;
    ctx.stroke();
  } else {
    ctx.fillStyle = c.dark;
    ctx.fill();
    ctx.strokeStyle = '#8b5a2b';
    ctx.lineWidth = 1.8;
    ctx.beginPath();
    ctx.arc(4, -1, 7, -1.15, 1.15);
    ctx.stroke();
    ctx.strokeStyle = '#f3ead8';
    ctx.lineWidth = 0.8;
    ctx.beginPath();
    ctx.moveTo(4 + Math.cos(1.15) * 7, -1 - Math.sin(1.15) * 7);
    ctx.lineTo(4 + Math.cos(1.15) * 7, -1 + Math.sin(1.15) * 7);
    ctx.stroke();
  }
  ctx.restore();
}

function giant(ctx, team, bob) {
  const c = TEAM_COL[team];
  ctx.save();
  ctx.translate(0, -bob);
  ctx.fillStyle = '#3b2f2f';
  ctx.fillRect(-8, 9, 6, 5);
  ctx.fillRect(2, 9, 6, 5);
  block(ctx, -11, -8, 22, 19, 6, c.main, c.dark, c.dark);
  ctx.fillStyle = '#6f4a28';
  ctx.fillRect(-11, 3, 22, 3.5);
  ctx.fillStyle = '#ffd7a8';
  circle(ctx, -13, 0, 4);
  ctx.fill();
  circle(ctx, 13, 0, 4);
  ctx.fill();
  // club
  ctx.strokeStyle = '#7a4f26';
  ctx.lineWidth = 4;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(14, 1);
  ctx.lineTo(18, -15);
  ctx.stroke();
  ctx.lineCap = 'butt';
  ctx.fillStyle = '#9a6a3a';
  ellipse(ctx, 18.5, -18, 5, 7);
  ctx.fill();
  ctx.strokeStyle = '#5a3a1c';
  ctx.lineWidth = 1.2;
  ctx.stroke();
  // head and horned helmet
  ctx.fillStyle = '#ffd7a8';
  circle(ctx, 0, -14, 7.5);
  ctx.fill();
  ctx.strokeStyle = SOFT_LINE;
  ctx.lineWidth = 1;
  ctx.stroke();
  ctx.fillStyle = '#f6ecd6';
  poly(ctx, [-7, -17, -13, -25, -4, -20]);
  ctx.fill();
  poly(ctx, [7, -17, 13, -25, 4, -20]);
  ctx.fill();
  ctx.fillStyle = '#8a8f9a';
  ctx.beginPath();
  ctx.arc(0, -15, 7.9, Math.PI, TAU);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = '#1d1a22';
  circle(ctx, -2.7, -12.4, 1.1);
  ctx.fill();
  circle(ctx, 2.7, -12.4, 1.1);
  ctx.fill();
  ctx.restore();
}

// A rank of up to three soldiers standing across the road, or one giant; (nx, ny) is the
// unit vector across the lane. Pass hpFrac = null to leave the health bar off.
export function drawSquad(ctx, x, y, nx, ny, team, kind, count, hpFrac, flash, t, walking, scale = 1) {
  if (kind === 'giant') {
    shadow(ctx, x, y + 13 * scale, 16 * scale, 6 * scale, 0.22);
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(scale, scale);
    giant(ctx, team, walking ? Math.abs(Math.sin(t * 8)) * 2.5 : 0);
    ctx.restore();
    hitFlash(ctx, x, y - 6 * scale, 18 * scale, 22 * scale, flash);
    if (hpFrac !== null) hpBar(ctx, x, y + 17 * scale, 26, hpFrac, team);
    return;
  }
  const n = Math.max(1, Math.min(3, count));
  shadow(ctx, x, y + 9 * scale, (8 + n * 5) * scale, 5 * scale, 0.2);
  const spots = [];
  for (let i = 0; i < n; i++) {
    const o = (i - (n - 1) / 2) * 12.5 * scale;
    spots.push({ x: x + nx * o, y: y + ny * o, i });
  }
  spots.sort((p, q) => p.y - q.y);
  for (const p of spots) {
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.scale(scale, scale);
    soldier(ctx, 0, 0, team, kind, walking ? Math.abs(Math.sin(t * 12 + p.i * 1.7)) * 2.2 : 0);
    ctx.restore();
  }
  hitFlash(ctx, x, y - 2, 20 * scale, 14 * scale, flash);
  if (hpFrac !== null) hpBar(ctx, x, y + 12 * scale, 20, hpFrac, team);
}

// Pointing hand for the aiming tutorial. (x, y) is the fingertip.
export function drawHand(ctx, x, y, pressed, alpha = 1) {
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.translate(x, y);
  if (pressed) {
    ctx.strokeStyle = 'rgba(255,255,255,0.9)';
    ctx.lineWidth = 3;
    circle(ctx, 0, 0, 14);
    ctx.stroke();
  }
  ctx.rotate(-0.3);
  const k = pressed ? 0.92 : 1;
  ctx.scale(k, k);
  ctx.beginPath();
  ctx.roundRect(-6, -2, 12, 30, 6);  // index finger
  ctx.roundRect(-9, 16, 27, 24, 9);  // palm
  ctx.roundRect(-17, 18, 12, 17, 6); // thumb
  ctx.strokeStyle = INK;
  ctx.lineWidth = 5;
  ctx.lineJoin = 'round';
  ctx.stroke();
  ctx.fillStyle = '#ffffff';
  ctx.fill();
  ctx.strokeStyle = 'rgba(31,36,51,0.3)';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(7, 19); ctx.lineTo(7, 27);
  ctx.moveTo(12.5, 20); ctx.lineTo(12.5, 27);
  ctx.stroke();
  ctx.restore();
}

export function drawArrow(ctx, x, y, angle, team, scale = 1) {
  const c = TEAM_COL[team];
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(angle);
  ctx.scale(scale, scale);
  ctx.strokeStyle = INK;
  ctx.lineWidth = 5;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(-15, 0);
  ctx.lineTo(8, 0);
  ctx.stroke();
  ctx.strokeStyle = '#b07a3f';
  ctx.lineWidth = 2.6;
  ctx.stroke();
  ctx.lineCap = 'butt';
  ctx.fillStyle = '#e8edf2';
  poly(ctx, [15, 0, 5, -5.5, 7, 0, 5, 5.5]);
  ctx.fill();
  ctx.strokeStyle = INK;
  ctx.lineWidth = 1.4;
  ctx.stroke();
  ctx.fillStyle = c.main;
  poly(ctx, [-9, 0, -13, -5, -20, -5, -16, 0, -20, 5, -13, 5]);
  ctx.fill();
  ctx.stroke();
  ctx.restore();
}

// ------------------------------------------------------------------ DOM icons

function iconURL(size, draw) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  draw(c.getContext('2d'));
  return c.toDataURL();
}

// Spiky burst that stands for hunting damage.
function burst(ctx, x, y, r) {
  ctx.beginPath();
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * TAU - Math.PI / 2, k = i % 2 ? 0.55 : 1;
    ctx.lineTo(x + Math.cos(a) * r * k, y + Math.sin(a) * r * k);
  }
  ctx.closePath();
  ctx.fillStyle = '#ff7a3d';
  ctx.fill();
  ctx.strokeStyle = INK;
  ctx.lineWidth = r * 0.12;
  ctx.lineJoin = 'round';
  ctx.stroke();
  ctx.fillStyle = '#ffe27a';
  circle(ctx, x, y, r * 0.36);
  ctx.fill();
}

export const meatIconURL = () => iconURL(72, g => meatIcon(g, 40, 36, 2.3));
export const arrowIconURL = () => iconURL(72, g => drawArrow(g, 36, 36, -Math.PI / 4, BLUE, 1.7));
export const damageIconURL = () => iconURL(72, g => burst(g, 36, 36, 30));

function star(ctx, x, y, r) {
  ctx.beginPath();
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * TAU - Math.PI / 2, k = i % 2 ? 0.45 : 1;
    ctx.lineTo(x + Math.cos(a) * r * k, y + Math.sin(a) * r * k);
  }
  ctx.closePath();
  ctx.fillStyle = '#ffcf3f';
  ctx.fill();
  ctx.strokeStyle = INK;
  ctx.lineWidth = r * 0.14;
  ctx.lineJoin = 'round';
  ctx.stroke();
}
export const starIconURL = () => iconURL(72, g => star(g, 36, 38, 30));

export function cardIcon(id) {
  const c = document.createElement('canvas');
  c.width = c.height = 160;
  const g = c.getContext('2d');
  g.scale(2, 2);
  if (id === 'melee' || id === 'archer') {
    drawSquad(g, 40, 46, 1, 0, BLUE, id, 3, null, 0, 0, false, 1.75);
  } else if (id === 'giant') {
    drawSquad(g, 36, 52, 1, 0, BLUE, id, 1, null, 0, 0, false, 1.9);
  } else if (id === 'tower') {
    g.translate(40, 68);
    g.scale(1.05, 1.05);
    drawTower(g, 0, 0, BLUE, 1, 0, 1, 0, false);
  } else if (id === 'arrow') {
    drawArrow(g, 26, 52, -Math.PI / 4, BLUE, 1.6);
    drawArrow(g, 46, 40, -Math.PI / 4, BLUE, 1.6);
  } else {
    burst(g, 40, 42, 30);
    drawArrow(g, 40, 44, -Math.PI / 4, BLUE, 1.2);
  }
  return c.toDataURL();
}
