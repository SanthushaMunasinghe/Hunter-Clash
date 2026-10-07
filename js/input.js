import { W, BLUE, CARDS } from './config.js';
import { clamp } from './utils.js';
import { cardBlocker, dropOptions, dropTarget } from './cards.js';

const MIN_ELEV = 0.16;   // shallowest allowed shot, in radians off horizontal
const AIM_DEADZONE = 14; // drag distance before an aim registers
const TOUCH_LIFT = 44;   // dragged pieces sit above the finger so it doesn't hide them

export class Input {
  constructor(stage, canvas, game, ui, sfx) {
    this.stage = stage;
    this.canvas = canvas;
    this.game = game;
    this.ui = ui;
    this.sfx = sfx;
    this.drag = null; // card being dragged; the renderer reads this
    this.aimPtr = null;
    this.aimStart = null;
    this.aimMode = null;

    canvas.addEventListener('pointerdown', e => this.aimDown(e));
    canvas.addEventListener('pointermove', e => this.aimMove(e));
    canvas.addEventListener('pointerup', e => this.aimUp(e, true));
    canvas.addEventListener('pointercancel', e => this.aimUp(e, false));

    ui.cardEls.forEach((el, idx) => {
      el.addEventListener('pointerdown', e => this.cardDown(e, el, idx));
      el.addEventListener('pointermove', e => this.cardMove(e));
      el.addEventListener('pointerup', e => this.cardUp(e, el, true));
      el.addEventListener('pointercancel', e => this.cardUp(e, el, false));
    });

    window.addEventListener('contextmenu', e => e.preventDefault());
  }

  // Screen position -> virtual canvas coordinates.
  toVirtual(e) {
    const r = this.stage.getBoundingClientRect(), H = this.game.match.board.H;
    return { x: ((e.clientX - r.left) / r.width) * W, y: ((e.clientY - r.top) / r.height) * H };
  }

  // ---------------------------------------------------------------- aiming

  canAim() {
    const m = this.game.match;
    return m && m.phase === 'aim' && m.turnTeam === BLUE && !this.game.paused;
  }

  aimDown(e) {
    this.sfx.unlock();
    if (!this.canAim() || this.aimPtr !== null) return;
    this.aimPtr = e.pointerId;
    this.aimStart = this.toVirtual(e);
    this.aimMode = null;
    this.canvas.setPointerCapture(e.pointerId);
  }

  // Pull back like a slingshot, or push toward the target: whichever way the drag
  // starts, it stays in that mode until released.
  aimMove(e) {
    if (e.pointerId !== this.aimPtr) return;
    const m = this.game.match;
    if (!this.canAim()) return;
    const p = this.toVirtual(e);
    const dx = p.x - this.aimStart.x, dy = p.y - this.aimStart.y, len = Math.hypot(dx, dy);
    if (len < AIM_DEADZONE) {
      m.aim = null;
      this.aimMode = null;
      return;
    }
    if (!this.aimMode) this.aimMode = dy > 0 ? 'pull' : 'push';
    const sign = this.aimMode === 'pull' ? -1 : 1;
    const ax = dx * sign, ay = dy * sign;
    let angle;
    if (ay >= 0) angle = ax < 0 ? -Math.PI + MIN_ELEV : -MIN_ELEV;
    else angle = clamp(Math.atan2(ay, ax), -Math.PI + MIN_ELEV, -MIN_ELEV);
    m.aim = { team: BLUE, angle, pull: Math.min(len, 90), path: null };
  }

  aimUp(e, fire) {
    if (e.pointerId !== this.aimPtr) return;
    this.aimPtr = null;
    const m = this.game.match;
    if (!m || !this.canAim()) return;
    const aim = m.aim;
    m.aim = null;
    if (fire && aim) this.game.playerFire(aim.angle);
  }

  // ---------------------------------------------------------------- cards

  cardDown(e, el, idx) {
    this.sfx.unlock();
    const m = this.game.match;
    if (!m || this.drag || this.game.paused) return;
    if (m.phase !== 'cards' || m.turnTeam !== BLUE) {
      if (m.turnTeam === BLUE && m.phase === 'aim') this.ui.toast('Shoot your arrow first');
      return;
    }
    const id = m.teams[BLUE].hand[idx], blocker = cardBlocker(m, BLUE, id);
    if (blocker) {
      const short = CARDS[id].cost - m.teams[BLUE].meat;
      this.ui.toast(blocker === 'meat' ? `Need ${short} more meat`
        : id === 'tower' ? 'Capture a checkpoint first' : 'No free spot in your lanes');
      this.sfx.play('error');
      return;
    }
    this.drag = {
      idx, id, ptr: e.pointerId, lift: e.pointerType === 'mouse' ? 0 : TOUCH_LIFT,
      options: dropOptions(m, BLUE, id), target: null, onBoard: false, x: 0, y: 0,
    };
    el.setPointerCapture(e.pointerId);
    this.ui.setDragging(idx, id);
    this.sfx.play('click');
    this.cardMove(e);
  }

  cardMove(e) {
    const d = this.drag;
    if (!d || e.pointerId !== d.ptr) return;
    const m = this.game.match, p = this.toVirtual(e);
    d.x = p.x;
    d.y = p.y - d.lift;
    d.onBoard = p.y < m.board.B + 6;
    d.target = dropTarget(m, BLUE, d.id, d.x, d.y, d.options);
    // The DOM ghost follows the finger until the canvas has a real preview to show.
    const showGhost = !d.onBoard || (CARDS[d.id].zone !== 'center' && !d.target.valid);
    this.ui.moveGhost(d.x, d.y, showGhost);
  }

  cardUp(e, el, drop) {
    const d = this.drag;
    if (!d || e.pointerId !== d.ptr) return;
    this.drag = null;
    this.ui.setDragging(-1);
    if (!drop || !d.onBoard || !d.target) return;
    if (d.target.valid) this.game.playerPlay(d.idx, d.target);
    else this.sfx.play('error');
  }
}
