export const TAU = Math.PI * 2;

export const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export const dist = (x1, y1, x2, y2) => Math.hypot(x2 - x1, y2 - y1);
export const rand = (a = 1, b) => (b === undefined ? Math.random() * a : a + Math.random() * (b - a));
export const pick = arr => arr[Math.floor(Math.random() * arr.length)];
export const easeOut = t => 1 - (1 - t) * (1 - t);
export const easeOutBack = t => {
  const c = 1.70158, u = t - 1;
  return 1 + (c + 1) * u * u * u + c * u * u;
};

export function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

// Seeded RNG so background decoration stays put when it is rebuilt.
export function seeded(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Everything solid in the centre field is a horizontal capsule {x, y, h, r}:
// h is the half length of its spine, r its radius. Circles have h = 0.
export const gap = (p, q) =>
  Math.hypot(Math.max(0, Math.abs(p.x - q.x) - p.h - q.h), p.y - q.y) - p.r - q.r;

export const store = {
  get(key, fallback = null) {
    try { return localStorage.getItem(key) ?? fallback; } catch { return fallback; }
  },
  set(key, value) {
    try { localStorage.setItem(key, value); } catch { /* private mode */ }
  },
};
