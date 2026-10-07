import { BLUE, RED, CARDS, LEVELS, ARROW, HAND_SIZE, SUDDEN_DEATH } from './config.js';
import { cardBlocker } from './cards.js';
import { cardIcon, meatIconURL } from './sprites.js';

const $ = id => document.getElementById(id);

const ICON_SOUND_ON = '<svg viewBox="0 0 24 24"><path d="M4 9v6h4l5 4V5L8 9H4z" fill="currentColor"/><path d="M16 8.5a5 5 0 0 1 0 7M18.5 6a8.5 8.5 0 0 1 0 12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>';
const ICON_SOUND_OFF = '<svg viewBox="0 0 24 24"><path d="M4 9v6h4l5 4V5L8 9H4z" fill="currentColor"/><path d="M16.5 9.5l5 5m0-5l-5 5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>';

// HUD, card panel and overlays. All DOM; the board itself is canvas.
export class UI {
  // app: { level, startMatch(level), resume() } supplied by main.js
  constructor(game, sfx, app) {
    this.game = game;
    this.sfx = sfx;
    this.app = app;
    this.cache = {};
    this.dragIdx = -1;
    this.toastTimer = 0;

    const meat = meatIconURL();
    this.icons = {};
    for (const id in CARDS) this.icons[id] = cardIcon(id);
    document.querySelectorAll('img.meat-ic').forEach(img => { img.src = meat; });

    this.cardEls = [];
    for (let i = 0; i < HAND_SIZE; i++) {
      const el = document.createElement('div');
      el.className = 'card locked';
      el.innerHTML = '<div class="name"></div><img class="art" alt="" draggable="false">'
        + `<div class="cost"><img alt="" draggable="false" src="${meat}"><b></b></div>`;
      $('cards').appendChild(el);
      this.cardEls.push(el);
    }

    const tap = (id, fn) => $(id).addEventListener('click', () => {
      sfx.unlock();
      sfx.play('click');
      fn();
    });
    tap('btn-end', () => game.playerEndTurn());
    tap('btn-undo', () => game.playerUndo());
    tap('btn-help', () => this.show('help'));
    tap('btn-help-close', () => this.hide('help'));
    tap('btn-menu-help', () => this.show('help'));
    tap('btn-restart', () => this.showMenu(true));
    tap('btn-sound', () => this.setSoundIcon(sfx.toggle()));
    tap('btn-play', () => { this.hide('menu'); app.startMatch(app.level); });
    tap('btn-resume', () => { this.hide('menu'); });
    tap('btn-noob', () => { this.hide('menu'); this.hide('result'); app.startMatch(0); });
    tap('btn-again', () => { this.hide('result'); app.startMatch(this.nextLevel); });
    this.setSoundIcon(sfx.muted);

    game.onEvent = (type, data) => this.onEvent(type, data);
  }

  setSoundIcon(muted) {
    $('btn-sound').innerHTML = muted ? ICON_SOUND_OFF : ICON_SOUND_ON;
  }

  // ---------------------------------------------------------------- overlays

  show(id) {
    $(id).classList.add('show');
    this.syncPause();
  }

  hide(id) {
    $(id).classList.remove('show');
    this.syncPause();
  }

  // The match holds still while any sheet is open.
  syncPause() {
    this.game.paused = !!document.querySelector('.overlay.show');
  }

  showMenu(inMatch) {
    const lvl = LEVELS[this.app.level];
    $('menu-opponent').textContent = lvl.name;
    $('btn-play').textContent = inMatch ? 'RESTART MATCH' : 'PLAY';
    $('btn-resume').style.display = inMatch ? '' : 'none';
    $('btn-noob').style.display = this.app.level > 0 ? '' : 'none';
    this.show('menu');
  }

  showResult(winner) {
    const won = winner === BLUE, m = this.game.match, last = this.app.level >= LEVELS.length - 1;
    this.nextLevel = won && !last ? this.app.level + 1 : this.app.level;
    $('result').classList.toggle('lost', !won);
    $('result-title').textContent = won ? 'VICTORY!' : 'DEFEAT';
    $('result-sub').textContent = won
      ? `You beat ${LEVELS[m.levelIdx].name} in ${m.turn} turns.`
      : `${LEVELS[m.levelIdx].name} took your castle on turn ${m.turn}.`;
    $('btn-again').textContent = !won ? 'TRY AGAIN' : last ? 'PLAY AGAIN' : `NEXT: ${LEVELS[this.nextLevel].name}`;
    this.sfx.play(won ? 'win' : 'lose');
    this.show('result');
  }

  // ---------------------------------------------------------------- feedback

  onEvent(type, data) {
    if (type === 'turn') this.banner(data === BLUE ? 'YOUR TURN' : 'ENEMY TURN', data === BLUE ? 'blue' : 'red');
    else if (type === 'banner') this.banner(data, 'gold');
    else if (type === 'toast') this.toast(data);
    else if (type === 'over') this.showResult(data);
  }

  banner(text, cls) {
    const el = $('banner');
    el.textContent = text;
    el.className = '';
    void el.offsetWidth; // restart the animation
    el.className = 'show ' + cls;
  }

  toast(text) {
    const el = $('toast');
    el.textContent = text;
    el.classList.add('show');
    clearTimeout(this.toastTimer);
    this.toastTimer = setTimeout(() => el.classList.remove('show'), 1500);
  }

  setDragging(idx, id) {
    this.dragIdx = idx;
    const ghost = $('ghost');
    if (idx < 0) ghost.classList.remove('show');
    else ghost.src = this.icons[id];
  }

  moveGhost(x, y, visible) {
    const ghost = $('ghost');
    ghost.style.transform = `translate(${x - 40}px, ${y - 34}px)`;
    ghost.classList.toggle('show', visible);
  }

  // ---------------------------------------------------------------- per-frame sync

  put(key, value, apply) {
    if (this.cache[key] === value) return;
    this.cache[key] = value;
    apply(value);
  }

  sync(m) {
    if (!m) return;
    const mine = m.turnTeam === BLUE, live = m.phase !== 'menu' && m.phase !== 'intro';

    for (const [team, hpId, barId] of [[BLUE, 'hp-blue', 'bar-blue'], [RED, 'hp-red', 'bar-red']]) {
      this.put(hpId, m.castles[team].hp, v => {
        $(hpId).textContent = v;
        $(barId).style.width = (v / m.castles[team].maxHp) * 100 + '%';
      });
    }
    this.put('enemy', LEVELS[m.levelIdx].name, v => { $('enemy-name').textContent = v; });
    this.put('turn', m.turn, v => {
      $('turn-num').textContent = 'TURN ' + v;
      $('turn').classList.toggle('sudden', v >= SUDDEN_DEATH.turn);
    });
    this.put('who', live ? m.turnTeam : -1, v => {
      $('turn-who').textContent = v === BLUE ? 'YOUR MOVE' : v === RED ? 'ENEMY MOVE' : 'GET READY';
      $('turn').classList.toggle('enemy', v === RED);
    });
    this.put('meat', m.teams[BLUE].meat, v => {
      $('meat-num').textContent = v;
      $('meat').animate([{ transform: 'scale(1.18)' }, { transform: 'scale(1)' }], { duration: 180 });
    });
    this.put('emeat', m.teams[RED].meat, v => { $('emeat-num').textContent = v; });

    let hint = '';
    if (!live || m.phase === 'over') hint = '';
    else if (!mine) hint = 'ENEMY TURN';
    else if (m.phase === 'aim') hint = 'DRAG TO AIM<br>RELEASE TO SHOOT';
    else if (m.phase === 'fly' && m.arrow) {
      hint = 'BOUNCES<br>' + '●'.repeat(m.arrow.bouncesLeft) + '○'.repeat(ARROW.bounces - m.arrow.bouncesLeft);
    } else if (m.phase === 'act') hint = 'UNITS ADVANCE';
    else if (m.phase === 'cards') hint = 'DRAG A CARD<br>ONTO THE BOARD';
    this.put('hint', hint, v => { $('hint').innerHTML = v; });

    const cardsOn = mine && m.phase === 'cards';
    this.put('end', cardsOn, v => { $('btn-end').disabled = !v; });
    this.put('undo', cardsOn && m.undo.length > 0, v => { $('btn-undo').disabled = !v; });

    m.teams[BLUE].hand.forEach((id, i) => {
      const el = this.cardEls[i], card = CARDS[id];
      this.put('card' + i, id, () => {
        el.querySelector('.name').textContent = card.name;
        el.querySelector('.art').src = this.icons[id];
        el.querySelector('.cost b').textContent = card.cost;
        el.animate([{ transform: 'scale(0.75)' }, { transform: 'scale(1)' }], { duration: 200, easing: 'ease-out' });
      });
      const blocker = cardBlocker(m, BLUE, id);
      let cls = 'card ' + id;
      if (blocker === 'meat') cls += ' poor';
      if (!cardsOn) cls += ' locked';
      else if (blocker) cls += ' off';
      if (this.dragIdx === i) cls += ' dragging';
      this.put('cls' + i, cls, v => { el.className = v; });
    });
  }
}
