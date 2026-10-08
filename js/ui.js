import { BLUE, RED, CARDS, LEVELS, HAND_SIZE, TURN_LIMIT } from './config.js';
import { cardBlocker, cardCost } from './cards.js';
import { cardIcon, meatIconURL, arrowIconURL, damageIconURL, starIconURL } from './sprites.js';

const $ = id => document.getElementById(id);

const ICON_SOUND_ON = '<svg viewBox="0 0 24 24"><path d="M4 9v6h4l5 4V5L8 9H4z" fill="currentColor"/><path d="M16 8.5a5 5 0 0 1 0 7M18.5 6a8.5 8.5 0 0 1 0 12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>';
const ICON_SOUND_OFF = '<svg viewBox="0 0 24 24"><path d="M4 9v6h4l5 4V5L8 9H4z" fill="currentColor"/><path d="M16.5 9.5l5 5m0-5l-5 5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>';

// HUD, card panel and overlays. All DOM; the board itself is canvas.
export class UI {
  // app: { level, startMatch(level) } supplied by main.js
  constructor(game, sfx, app) {
    this.game = game;
    this.sfx = sfx;
    this.app = app;
    this.cache = {};
    this.dragIdx = -1;
    this.toastTimer = 0;
    this.nextLevel = 0;

    const meat = meatIconURL();
    this.icons = {};
    for (const id in CARDS) this.icons[id] = cardIcon(id);
    const icons = { 'meat-ic': meat, 'arrow-ic': arrowIconURL(), 'dmg-ic': damageIconURL(), 'pts-ic': starIconURL() };
    for (const cls in icons) document.querySelectorAll('img.' + cls).forEach(img => { img.src = icons[cls]; });

    this.cardEls = [];
    for (let i = 0; i < HAND_SIZE; i++) {
      const el = document.createElement('div');
      el.className = 'card locked';
      el.innerHTML = '<div class="name"></div><img class="art" alt="" draggable="false">'
        + `<div class="cost"><img alt="" draggable="false" src="${meat}"><b></b></div>`;
      $('cards').appendChild(el);
      this.cardEls.push(el);
    }

    const tap = (el, fn) => el.addEventListener('click', () => {
      sfx.unlock();
      sfx.play('click');
      fn();
    });

    this.levelEls = LEVELS.map((lvl, i) => {
      const el = document.createElement('button');
      el.className = 'lvl';
      el.innerHTML = `<b>${lvl.name}</b><i>${'●'.repeat(i + 1)}${'○'.repeat(LEVELS.length - 1 - i)}</i>`;
      tap(el, () => this.pickLevel(i));
      $('levels').appendChild(el);
      return el;
    });

    tap($('btn-end'), () => game.playerEndTurn());
    tap($('btn-help'), () => this.show('help'));
    tap($('btn-help-close'), () => this.hide('help'));
    tap($('btn-menu-help'), () => this.show('help'));
    tap($('btn-restart'), () => this.showMenu(true));
    tap($('btn-sound'), () => this.setSoundIcon(sfx.toggle()));
    tap($('btn-play'), () => { this.hide('menu'); app.startMatch(app.level); });
    tap($('btn-resume'), () => this.hide('menu'));
    tap($('btn-again'), () => { this.hide('result'); app.startMatch(this.nextLevel); });
    tap($('btn-change'), () => { this.hide('result'); this.showMenu(false); });
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

  pickLevel(i) {
    this.app.level = i;
    this.levelEls.forEach((el, k) => el.classList.toggle('on', k === i));
    $('level-blurb').textContent = LEVELS[i].blurb;
  }

  // inMatch: opened from the HUD mid-game, so offer Resume alongside Restart.
  showMenu(inMatch) {
    this.pickLevel(this.app.level);
    $('btn-play').textContent = inMatch ? 'RESTART MATCH' : 'PLAY';
    $('btn-resume').style.display = inMatch ? '' : 'none';
    this.show('menu');
  }

  showResult(winner) {
    const won = winner === BLUE, m = this.game.match, last = m.levelIdx >= LEVELS.length - 1;
    const name = LEVELS[m.levelIdx].name;
    this.nextLevel = won && !last ? m.levelIdx + 1 : m.levelIdx;
    $('result').classList.toggle('lost', !won);
    $('result-title').textContent = won ? 'VICTORY!' : 'DEFEAT';
    const mine = this.game.points(m, BLUE), theirs = this.game.points(m, RED);
    $('result-sub').textContent = m.over.how === 'time'
      ? `Time is up. You scored ${mine} points to ${name}'s ${theirs} (castle health plus damage dealt).`
      : won ? `You beat ${name} in ${m.turn} turns.` : `${name} took your castle on turn ${m.turn}.`;
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
    this.put('enemy', LEVELS[m.levelIdx].name, v => { $('enemy-name').textContent = v + ' AI'; });
    this.put('turn', m.turn, v => {
      $('turn-num').textContent = v > TURN_LIMIT ? 'TIEBREAK' : `TURN ${v}/${TURN_LIMIT}`;
      $('turn').classList.toggle('sudden', v > TURN_LIMIT - 5);
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
    // Quiver and hunting damage, for both sides.
    for (const [team, tag] of [[BLUE, 'blue'], [RED, 'red']]) {
      this.put('arrows' + team, m.teams[team].arrows, v => { $('arrows-' + tag).textContent = v; });
      this.put('dmg' + team, m.teams[team].damage, v => { $('dmg-' + tag).textContent = v; });
      // Points: castle health plus damage dealt. They decide a match that reaches the turn limit.
      this.put('pts' + team, this.game.points(m, team), v => { $('pts-' + tag).textContent = v; });
    }

    let hint = '';
    if (!live || m.phase === 'over') hint = '';
    else if (!mine) hint = 'ENEMY TURN';
    else if (m.phase === 'aim') hint = 'DRAG TO AIM<br>RELEASE TO SHOOT';
    else if (m.phase === 'fly') hint = 'ARROWS AWAY';
    else if (m.phase === 'act') hint = 'UNITS ADVANCE';
    else if (m.phase === 'cards') hint = 'DRAG A CARD<br>ONTO THE BOARD';
    this.put('hint', hint, v => { $('hint').innerHTML = v; });

    const cardsOn = mine && m.phase === 'cards';
    this.put('end', cardsOn, v => { $('btn-end').disabled = !v; });
    // While the player aims, the panel slides away to leave the strip under the castle
    // free for dragging.
    this.put('away', live && mine && m.phase === 'aim', v => { $('panel').classList.toggle('away', v); });

    m.teams[BLUE].hand.forEach((id, i) => {
      const el = this.cardEls[i];
      // A played card leaves its slot empty until the next turn's deal.
      this.put('card' + i, id, () => {
        if (!id) return;
        el.querySelector('.name').textContent = CARDS[id].name;
        el.querySelector('.art').src = this.icons[id];
        el.animate([{ transform: 'scale(0.75)' }, { transform: 'scale(1)' }], { duration: 200, easing: 'ease-out' });
      });
      if (id) this.put('cost' + i, cardCost(m.teams[BLUE], id), v => { el.querySelector('.cost b').textContent = v; });
      let cls = 'card';
      if (!id) cls += ' empty';
      else {
        const blocker = cardBlocker(m, BLUE, id);
        cls += ' ' + id;
        if (blocker === 'meat') cls += ' poor';
        if (!cardsOn) cls += ' locked';
        else if (blocker) cls += ' off';
        if (this.dragIdx === i) cls += ' dragging';
      }
      this.put('cls' + i, cls, v => { el.className = v; });
    });
  }
}
