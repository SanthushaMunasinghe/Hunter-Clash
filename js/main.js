import { W, MIN_H, MAX_H, LEVELS } from './config.js';
import { clamp, store } from './utils.js';
import { Game } from './game.js';
import { Renderer } from './render.js';
import { UI } from './ui.js';
import { Input } from './input.js';
import { Fx } from './fx.js';
import { Sfx } from './audio.js';
import { font } from './sprites.js';

const stage = document.getElementById('stage');
const canvas = document.getElementById('game');

const fx = new Fx();
const sfx = new Sfx();
const game = new Game(fx, sfx);
const renderer = new Renderer(canvas, fx);

const app = {
  H: MIN_H,
  level: clamp(parseInt(store.get('hc_level', '0'), 10) || 0, 0, LEVELS.length - 1),
  startMatch(level) {
    app.level = level;
    store.set('hc_level', String(level));
    game.start(level, app.H);
  },
};

const ui = new UI(game, sfx, app);
const input = new Input(stage, canvas, game, ui, sfx);

// Fit the fixed-width virtual canvas to the screen. Taller phones get a taller board.
function fit() {
  const vw = window.innerWidth, vh = window.innerHeight;
  if (!vw || !vh) return;
  app.H = clamp(Math.round((W * vh) / vw), MIN_H, MAX_H);
  const scale = Math.min(vw / W, vh / app.H);
  const dpr = Math.min(window.devicePixelRatio || 1, 3);
  stage.style.width = W + 'px';
  stage.style.height = app.H + 'px';
  stage.style.transform = `translate(-50%, -50%) scale(${scale})`;
  canvas.width = Math.round(W * scale * dpr);
  canvas.height = Math.round(app.H * scale * dpr);
  renderer.setScale(scale * dpr);
  game.resize(app.H);
}

window.addEventListener('resize', fit);
window.addEventListener('orientationchange', fit);
fit();

// Fall back to a bold system face if the web font can't be fetched.
if (document.fonts && document.fonts.load) {
  document.fonts.load('16px "Lilita One"').then(
    faces => { if (!faces.length) useFallbackFont(); },
    useFallbackFont,
  );
}
function useFallbackFont() {
  font.weight = '800';
  document.documentElement.classList.add('no-webfont');
}

game.demo(app.level, app.H);
ui.showMenu(false);

let last = performance.now();
function frame(now) {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  game.update(dt);
  ui.sync(game.match);
  renderer.draw(game, input, now / 1000);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

// Handle for poking at the game from the browser console.
window.__hc = { game, app, ui, input };
