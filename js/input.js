import { W, BLUE, CARDS } from './config.js';
import { clamp } from './utils.js';
import { cardBlocker, cardCost, dropOptions, dropTarget } from './cards.js';

const MIN_ELEV = 0.16;   // shallowest allowed shot, in radians off horizontal
const AIM_TURN = 0.007;  // radians the aim swings for each px of sideways drag
const AIM_SLOP = 8;      // sideways px before a press counts as a drag
const AIM_HOLD = 0.2;    // seconds a press must last to shoot without having been dragged
const AIM_PULL = 60;     // how far back the bow looks drawn while aiming
const AIM_STRIP = 12;    // aiming drags start below the castle: this far above the panel line or lower
const TOUCH_LIFT = 44;   // dragged pieces sit above the finger so it doesn't hide them

// The aim for a drag that has gone dx px sideways from where it started. A drag begins
// aimed straight up the field and swings the opposite way to the finger, like a slingshot.
export const dragAngle = dx => clamp(-Math.PI / 2 - dx * AIM_TURN, -Math.PI + MIN_ELEV, -MIN_ELEV);

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
    this.aimMoved = false;

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

  // Keep receiving this pointer's moves even when it leaves the element.
  capture(el, e) {
    try { el.setPointerCapture(e.pointerId); } catch { /* pointer already gone */ }
  }

  // ---------------------------------------------------------------- aiming

  canAim() {
    const m = this.game.match;
    return m && m.phase === 'aim' && m.turnTeam === BLUE && !this.game.paused;
  }

  // Only the strip behind the player's castle starts an aim. The shot begins pointing
  // straight ahead.
  aimDown(e) {
    this.sfx.unlock();
    if (!this.canAim() || this.aimPtr !== null) return;
    const m = this.game.match, p = this.toVirtual(e);
    if (p.y < m.board.B - AIM_STRIP) return;
    this.aimPtr = e.pointerId;
    this.aimStart = { x: p.x, at: performance.now() };
    this.aimMoved = false;
    m.aim = { team: BLUE, angle: dragAngle(0), pull: AIM_PULL, paths: null };
    this.capture(this.canvas, e);
  }

  // Sliding left or right swings the aim; up and down does nothing.
  aimMove(e) {
    if (e.pointerId !== this.aimPtr) return;
    const m = this.game.match;
    if (!this.canAim() || !m.aim) return;
    const dx = this.toVirtual(e).x - this.aimStart.x;
    if (Math.abs(dx) > AIM_SLOP) this.aimMoved = true;
    m.aim.angle = dragAngle(dx);
  }

  aimUp(e, fire) {
    if (e.pointerId !== this.aimPtr) return;
    this.aimPtr = null;
    const m = this.game.match;
    if (!m || !this.canAim()) return;
    const aim = m.aim;
    m.aim = null;
    // A quick tap that never moved is a stray touch, not a shot straight ahead.
    const held = (performance.now() - this.aimStart.at) / 1000;
    if (fire && aim && (this.aimMoved || held >= AIM_HOLD)) this.game.playerFire(aim.angle);
  }

  // ---------------------------------------------------------------- cards

  cardDown(e, el, idx) {
    this.sfx.unlock();
    const m = this.game.match;
    if (!m || this.drag || this.game.paused) return;
    if (m.phase !== 'cards' || m.turnTeam !== BLUE) {
      if (m.turnTeam === BLUE && m.phase === 'aim') this.ui.toast('Hunt first');
      return;
    }
    const id = m.teams[BLUE].hand[idx];
    if (!id) return; // nothing dealt yet
    const blocker = cardBlocker(m, BLUE, id);
    if (blocker) {
      const short = cardCost(m.teams[BLUE], id) - m.teams[BLUE].meat;
      this.ui.toast(blocker === 'meat' ? `Need ${short} more meat`
        : id === 'tower' ? 'Hold a checkpoint first' : 'Both roads are blocked');
      this.sfx.play('error');
      return;
    }
    this.drag = {
      idx, id, ptr: e.pointerId, lift: e.pointerType === 'mouse' ? 0 : TOUCH_LIFT,
      options: dropOptions(m, BLUE, id), target: null, onBoard: false, x: 0, y: 0,
    };
    this.capture(el, e);
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
    // The DOM ghost follows the finger until the canvas has a real preview under it to
    // show. Troops land away from the finger, at the back of their column, so it stays.
    this.ui.moveGhost(d.x, d.y, !d.onBoard || !d.target.valid || CARDS[d.id].zone === 'lane');
  }

  cardUp(e, el, drop) {
    const d = this.drag;
    if (!d || e.pointerId !== d.ptr) return;
    this.drag = null;
    this.ui.setDragging(-1);
    if (!drop || !d.onBoard || !d.target) return;
    if (d.target.valid) this.game.playerPlay(d.idx, d.target);
    else {
      if (CARDS[d.id].zone === 'lane') this.ui.toast('That road is blocked');
      this.sfx.play('error');
    }
  }
}
