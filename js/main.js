// Virtual portrait canvas: fixed width, height follows the screen's aspect ratio.
const W = 540;
const MIN_H = 960;
const MAX_H = 1200;

const stage = document.getElementById('stage');
const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');

function fit() {
  const vw = window.innerWidth, vh = window.innerHeight;
  const H = Math.max(MIN_H, Math.min(MAX_H, Math.round(W * vh / vw)));
  const scale = Math.min(vw / W, vh / H);
  const dpr = Math.min(window.devicePixelRatio || 1, 3);
  stage.style.width = W + 'px';
  stage.style.height = H + 'px';
  stage.style.transform = `translate(-50%, -50%) scale(${scale})`;
  canvas.width = Math.round(W * scale * dpr);
  canvas.height = Math.round(H * scale * dpr);

  ctx.setTransform(scale * dpr, 0, 0, scale * dpr, 0, 0);
  ctx.fillStyle = '#6db53a';
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = '#fff';
  ctx.font = '900 44px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('HUNTER CLASH', W / 2, H / 2);
}

window.addEventListener('resize', fit);
fit();
