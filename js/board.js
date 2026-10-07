import { W, HUD_H, PANEL_H, FIELD, ROAD, LANE_LEN, BLUE, RED } from './config.js';
import { lerp, clamp } from './utils.js';

const sp = (v, e) => Math.sign(v) * Math.pow(Math.abs(v), e);

// Builds all board geometry for a virtual canvas of height H.
export function makeBoard(H) {
  const T = HUD_H, B = H - PANEL_H, cx = W / 2;
  const FT = T + FIELD.topPad, FB = B - FIELD.bottomPad;
  const cy = (FT + FB) / 2, a = FIELD.halfW, b = (FB - FT) / 2, n = FIELD.exp;

  // Point on the field edge at parameter th, pushed out along the normal by d.
  function edge(th, d = 0) {
    const x = a * sp(Math.cos(th), 2 / n), y = b * sp(Math.sin(th), 2 / n);
    const nx = sp(x / a, n - 1) / a, ny = sp(y / b, n - 1) / b;
    const l = Math.hypot(nx, ny) || 1;
    return { x: cx + x + (nx / l) * d, y: cy + y + (ny / l) * d };
  }

  function ring(d = 0, N = 180) {
    const pts = [];
    for (let i = 0; i < N; i++) pts.push(edge((i / N) * Math.PI * 2, d));
    return pts;
  }

  // < 1 inside the field shrunk by `inset`, >= 1 outside.
  function fieldG(x, y, inset = 0) {
    return Math.pow(Math.abs(x - cx) / (a - inset), n) + Math.pow(Math.abs(y - cy) / (b - inset), n);
  }

  // Outward normal of the field edge nearest to (x, y).
  function fieldN(x, y, inset = 0) {
    const ax = a - inset, by = b - inset;
    const nx = sp((x - cx) / ax, n - 1) / ax, ny = sp((y - cy) / by, n - 1) / by;
    const l = Math.hypot(nx, ny) || 1;
    return { x: nx / l, y: ny / l };
  }

  // Lane 0 runs up the left side, lane 1 up the right. Both go blue castle -> red castle.
  const lanes = [0, 1].map(li => {
    const M = 360, pts = [], cum = [0];
    for (let i = 0; i <= M; i++) {
      const u = i / M;
      pts.push(edge(li === 0 ? Math.PI / 2 + u * Math.PI : Math.PI / 2 - u * Math.PI, ROAD.offset));
      if (i) cum.push(cum[i - 1] + Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y));
    }
    return { pts, cum, len: cum[M] };
  });

  function laneAt(li, frac) {
    const L = lanes[li], d = clamp(frac, 0, 1) * L.len;
    let lo = 0, hi = L.cum.length - 1;
    while (hi - lo > 1) {
      const mid = (lo + hi) >> 1;
      if (L.cum[mid] <= d) lo = mid; else hi = mid;
    }
    const t = (d - L.cum[lo]) / (L.cum[hi] - L.cum[lo] || 1);
    return { x: lerp(L.pts[lo].x, L.pts[hi].x, t), y: lerp(L.pts[lo].y, L.pts[hi].y, t) };
  }

  // Slots 1..LANE_LEN-1 are squeezed inward a little so the end slots clear the castles.
  const inner = k => lerp(0.05, 0.95, k / LANE_LEN);
  function slotFrac(s) {
    if (s <= 0) return 0;
    if (s >= LANE_LEN) return 1;
    if (s < 1) return inner(1) * s;
    if (s > LANE_LEN - 1) return lerp(inner(LANE_LEN - 1), 1, s - (LANE_LEN - 1));
    return inner(s);
  }
  const lanePoint = (li, s) => laneAt(li, slotFrac(s));

  // x/y is the centre of the castle's collision capsule, drawY the sprite anchor,
  // launch the point arrows are fired from.
  const castles = [];
  castles[BLUE] = { team: BLUE, x: cx, y: FB + 4, drawY: FB + 48, launch: { x: cx, y: FB - 40 } };
  castles[RED] = { team: RED, x: cx, y: FT - 4, drawY: FT - 9, launch: { x: cx, y: FT + 40 } };

  return {
    H, T, B, cx, cy, a, b, n, FT, FB,
    edge, ring, fieldG, fieldN, lanePoint, castles,
    fieldPts: ring(0),
    roadPts: ring(ROAD.offset),
  };
}
