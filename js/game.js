import {
  BLUE, RED, LANE_LEN, CHECKPOINTS, MARCH, CASTLE, ARROW, HUNTER, CARDS, LEVELS, SUDDEN_DEATH,
} from './config.js';
import { makeBoard } from './board.js';
import { initAnimals, updateAnimals, respawnAnimals } from './animals.js';
import { collectObstacles, stepArrow, previewPath } from './arrow.js';
import { dealTeam, playCard, canPlayAny, centerFits, wallShape, castleShape } from './cards.js';
import { chooseAim, chooseCard } from './ai.js';
import { dist, clamp, lerp, rand, gap, easeOut } from './utils.js';

const TEAM_TEXT = ['#bfe0ff', '#ffc4c4'];
const TEAM_RING = ['#6db6ff', '#ff7b7b'];

export function createMatch(levelIdx, H) {
  const first = CHECKPOINTS[0], last = CHECKPOINTS[CHECKPOINTS.length - 1];
  const m = {
    board: makeBoard(H), levelIdx, turn: 1, turnTeam: BLUE, phase: 'menu', over: null, time: 0,
    castles: [BLUE, RED].map(team => ({ team, hp: CASTLE.hp, maxHp: CASTLE.hp, flash: 0 })),
    teams: [dealTeam(), dealTeam()],
    animals: [], hunters: [], walls: [],
    // Each side starts holding the checkpoint nearest its own castle.
    lanes: [0, 1].map(() => ({
      squads: [], towers: [],
      cps: CHECKPOINTS.map(slot => ({ slot, owner: slot === first ? BLUE : slot === last ? RED : -1, pop: 0 })),
    })),
    arrow: null, aim: null, nextId: 1, timers: [], undo: [], wait: {},
  };
  initAnimals(m);
  return m;
}

// The parts of a match that playing a card can change. Undo restores exactly these.
const snapshot = m => JSON.parse(JSON.stringify({
  teams: m.teams, hunters: m.hunters, walls: m.walls, lanes: m.lanes, nextId: m.nextId,
}));

export class Game {
  constructor(fx, sfx) {
    this.fx = fx;
    this.sfx = sfx;
    this.match = null;
    this.paused = false;
    this.onEvent = () => {};
  }

  emit(type, data) {
    this.onEvent(type, data);
  }

  // A board with wandering animals to sit behind the menu.
  demo(levelIdx, H) {
    this.fx.clear();
    this.match = createMatch(levelIdx, H);
  }

  start(levelIdx, H) {
    this.fx.clear();
    const m = this.match = createMatch(levelIdx, H);
    m.phase = 'intro';
    this.run(m).catch(err => console.error(err));
    return m;
  }

  // Timers belong to their match, so abandoning a match silently drops its pending flow.
  sleep(m, sec) {
    return new Promise(res => m.timers.push({ t: sec, res }));
  }

  // ---------------------------------------------------------------- turn flow

  async run(m) {
    await this.sleep(m, 0.5);
    while (!m.over) {
      await this.turn(m, m.turnTeam);
      if (m.over) break;
      if (m.turnTeam === RED) {
        m.turn++;
        respawnAnimals(m);
        if (m.turn === SUDDEN_DEATH.turn) {
          this.emit('banner', 'SUDDEN DEATH');
          this.emit('toast', `Castles now take x${SUDDEN_DEATH.mult} damage`);
          await this.sleep(m, 1.3);
        }
      }
      m.turnTeam = 1 - m.turnTeam;
    }
  }

  async turn(m, team) {
    const mine = team === BLUE;

    // Hunt: one bouncing arrow.
    m.phase = 'aim';
    m.aim = null;
    this.emit('turn', team);
    this.sfx.play('turn');
    let angle;
    if (mine) {
      angle = await new Promise(res => { m.wait.fire = res; });
      m.wait.fire = null;
    } else {
      await this.sleep(m, 0.7);
      angle = chooseAim(m, LEVELS[m.levelIdx]);
      await this.aiAim(m, angle);
    }
    m.aim = null;
    m.phase = 'fly';
    await this.fire(m, team, angle);
    if (m.over) return;
    await this.sleep(m, 0.25);

    // Units on the board attack or step forward.
    m.phase = 'act';
    await this.unitsAct(m, team);
    if (m.over) return;

    // Attack: spend meat on cards.
    m.phase = 'cards';
    m.undo = [];
    this.emit('cards', team);
    if (mine) {
      if (canPlayAny(m, BLUE)) {
        await new Promise(res => { m.wait.end = res; });
        m.wait.end = null;
      } else {
        this.emit('toast', 'Not enough meat for a card');
        await this.sleep(m, 1.2);
      }
    } else {
      await this.aiCards(m);
    }
    m.undo = [];
    m.phase = 'wait';
    await this.sleep(m, 0.3);
  }

  async aiAim(m, angle) {
    const from = angle + (Math.random() < 0.5 ? -1 : 1) * rand(0.3, 0.6);
    const t0 = m.time, dur = 0.85;
    m.aim = { team: RED, angle: from, pull: 0 };
    while (m.time - t0 < dur) {
      const k = easeOut((m.time - t0) / dur);
      m.aim.angle = lerp(from, angle, k);
      m.aim.pull = 60 * k;
      await this.sleep(m, 0);
    }
    m.aim.angle = angle;
    await this.sleep(m, 0.25);
  }

  async aiCards(m) {
    const lvl = LEVELS[m.levelIdx];
    m.teams[RED].meat += lvl.bonusMeat;
    await this.sleep(m, 0.5);
    for (let i = 0; i < lvl.maxCards && !m.over; i++) {
      const act = chooseCard(m, lvl);
      if (!act) break;
      const name = CARDS[m.teams[RED].hand[act.idx]].name;
      if (!this.play(m, RED, act.idx, act.target)) break;
      this.emit('toast', `Enemy played ${name}`);
      await this.sleep(m, 0.75);
    }
  }

  // ---------------------------------------------------------------- player actions

  playerFire(angle) {
    const m = this.match;
    if (!m || m.phase !== 'aim' || m.turnTeam !== BLUE || !m.wait.fire) return;
    m.wait.fire(angle);
  }

  playerPlay(idx, target) {
    const m = this.match;
    if (!m || m.phase !== 'cards' || m.turnTeam !== BLUE) return false;
    const snap = snapshot(m);
    if (!this.play(m, BLUE, idx, target)) return false;
    m.undo.push(snap);
    return true;
  }

  playerUndo() {
    const m = this.match;
    if (!m || m.phase !== 'cards' || m.turnTeam !== BLUE || !m.undo.length) return;
    Object.assign(m, m.undo.pop());
    this.sfx.play('click');
  }

  playerEndTurn() {
    const m = this.match;
    if (!m || m.phase !== 'cards' || m.turnTeam !== BLUE || !m.wait.end) return;
    this.sfx.play('click');
    m.wait.end();
  }

  // Shared by the player and the AI. Lane squads take one free step as they land.
  play(m, team, idx, target) {
    const id = m.teams[team].hand[idx];
    const ent = playCard(m, team, idx, target);
    if (!ent) return false;
    this.sfx.play('place');
    let p;
    if (CARDS[id].zone === 'lane') {
      this.captureAt(m, ent.lane, ent);
      this.march(m, ent.lane, ent);
      p = m.board.lanePoint(ent.lane, ent.slot);
    } else if (CARDS[id].zone === 'checkpoint') {
      p = m.board.lanePoint(ent.lane, ent.slot);
    } else {
      p = ent;
    }
    this.fx.ring(p.x, p.y, TEAM_RING[team], 8, 44, 0.4);
    return true;
  }

  // ---------------------------------------------------------------- hunting

  fire(m, team, angle) {
    const L = m.board.castles[team].launch;
    m.arrow = {
      team, x: L.x, y: L.y, dx: Math.cos(angle), dy: Math.sin(angle),
      bouncesLeft: ARROW.bounces, done: false, life: 0, fade: 0, trail: [],
    };
    this.sfx.play('shoot');
    return new Promise(res => { m.wait.arrow = res; });
  }

  updateArrow(m, dt) {
    const ar = m.arrow;
    if (!ar) return;
    if (ar.done) {
      ar.fade -= dt;
      if (ar.fade <= 0) {
        m.arrow = null;
        const done = m.wait.arrow;
        m.wait.arrow = null;
        if (done) done();
      }
      return;
    }
    stepArrow(ar, collectObstacles(m, ar.team), m.board, ARROW.speed * dt, o => this.arrowHit(m, ar, o));
    ar.life += dt;
    if (ar.life > 14) ar.done = true;
    ar.trail.push({ x: ar.x, y: ar.y });
    if (ar.trail.length > 12) ar.trail.shift();
    if (ar.done) {
      ar.fade = 0.3;
      this.fx.puff(ar.x, ar.y, '#ffffff', 8, 80);
    }
  }

  arrowHit(m, ar, o) {
    switch (o.kind) {
      case 'animal':
        o.ref.kx += ar.dx * 70;
        o.ref.ky += ar.dy * 70;
        this.hurtAnimal(m, o.ref, ARROW.damage, ar.team);
        break;
      case 'hunter':
        this.hurtHunter(m, o.ref, ARROW.damage);
        break;
      case 'wall':
        this.hurtWall(m, o.ref, ARROW.damage);
        break;
      case 'castle':
        this.hurtCastle(m, 1 - ar.team, ARROW.damage);
        return 'stop';
      default:
        this.sfx.play('bounce');
        this.fx.puff(ar.x, ar.y, '#f4e2b0', 4, 45);
    }
    if (o.ref && o.ref.hp <= 0) o.dead = true;
  }

  // ---------------------------------------------------------------- damage

  hurtAnimal(m, a, dmg, team) {
    const dealt = Math.min(a.hp, dmg);
    if (dealt <= 0) return 0;
    a.hp -= dealt;
    a.flash = 0.18;
    m.teams[team].meat += dealt;
    this.fx.text(a.x, a.y - a.r - 26, '+' + dealt, team === BLUE ? '#ffffff' : '#ffc4c4', true);
    this.fx.puff(a.x, a.y, '#ff8fa0', 5, 60);
    if (a.hp <= 0) {
      m.animals.splice(m.animals.indexOf(a), 1);
      this.fx.puff(a.x, a.y, '#ffffff', 12, 95);
      this.sfx.play('die');
    } else {
      this.sfx.play('hit');
    }
    return dealt;
  }

  hurtCastle(m, team, dmg) {
    if (m.over) return;
    const c = m.castles[team], p = m.board.castles[team];
    if (m.turn >= SUDDEN_DEATH.turn) dmg *= SUDDEN_DEATH.mult;
    c.hp = Math.max(0, c.hp - dmg);
    c.flash = 0.25;
    this.fx.shake = Math.max(this.fx.shake, 5);
    this.fx.text(p.x + rand(-24, 24), p.drawY - 70, '-' + dmg, '#ffd24a', false, 20);
    this.fx.puff(p.x + rand(-30, 30), p.drawY - 20, '#e9e2cf', 8, 80);
    this.sfx.play('castle');
    if (c.hp > 0) return;
    m.over = { winner: 1 - team };
    m.phase = 'over';
    m.aim = null;
    this.fx.shake = 12;
    for (let i = 0; i < 5; i++) this.fx.puff(p.x + rand(-45, 45), p.drawY + rand(-60, 10), '#e9e2cf', 10, 130);
    this.sleep(m, 1.4).then(() => this.emit('over', m.over.winner));
  }

  hurtSquad(m, li, s, dmg) {
    const p = m.board.lanePoint(li, s.slot);
    s.hp -= dmg;
    s.flash = 0.2;
    this.fx.text(p.x, p.y - 30, '-' + dmg, TEAM_TEXT[s.team], false, 13);
    if (s.hp > 0) return;
    const list = m.lanes[li].squads;
    list.splice(list.indexOf(s), 1);
    this.fx.puff(p.x, p.y, '#ffffff', 10, 80);
  }

  hurtTower(m, li, tw, dmg) {
    const p = m.board.lanePoint(li, tw.slot);
    tw.hp -= dmg;
    tw.flash = 0.2;
    this.fx.text(p.x, p.y - 56, '-' + dmg, TEAM_TEXT[tw.team], false, 13);
    if (tw.hp > 0) return;
    const lane = m.lanes[li];
    lane.towers.splice(lane.towers.indexOf(tw), 1);
    const cp = lane.cps.find(c => c.slot === tw.slot);
    if (cp) cp.owner = -1;
    this.fx.puff(p.x, p.y - 20, '#e9e2cf', 14, 100);
    this.sfx.play('thud');
  }

  hurtHunter(m, h, dmg) {
    h.hp -= dmg;
    h.flash = 0.2;
    this.fx.text(h.x, h.y - 44, '-' + dmg, TEAM_TEXT[h.team], false, 13);
    this.sfx.play('thud');
    if (h.hp > 0) return;
    m.hunters.splice(m.hunters.indexOf(h), 1);
    this.fx.puff(h.x, h.y - 10, '#e9e2cf', 12, 90);
  }

  hurtWall(m, w, dmg) {
    w.hp -= dmg;
    w.flash = 0.2;
    this.fx.text(w.x, w.y - 24, '-' + dmg, TEAM_TEXT[w.team], false, 13);
    this.sfx.play('thud');
    if (w.hp > 0) return;
    m.walls.splice(m.walls.indexOf(w), 1);
    this.fx.puff(w.x, w.y, '#e9e2cf', 12, 90);
  }

  // ---------------------------------------------------------------- unit actions

  async unitsAct(m, team) {
    await Promise.all([this.laneAct(m, team, 0), this.laneAct(m, team, 1), this.centerAct(m, team)]);
    await this.sleep(m, 0.2);
  }

  canEnter(lane, slot, team) {
    if (slot < 1 || slot > LANE_LEN - 1) return false;
    if (lane.squads.some(q => q.slot === slot)) return false;
    return !lane.towers.some(t => t.slot === slot && t.team !== team);
  }

  // One step forward: up to MARCH slots, stopping early once an enemy comes into range.
  march(m, li, s) {
    const lane = m.lanes[li], dir = s.team === BLUE ? 1 : -1;
    let moved = 0;
    while (moved < MARCH && this.canEnter(lane, s.slot + dir, s.team)) {
      s.slot += dir;
      moved++;
      this.captureAt(m, li, s);
      if (this.laneTarget(lane, s.team, s.slot, s.range)) break;
    }
    return moved > 0;
  }

  captureAt(m, li, s) {
    const cp = m.lanes[li].cps.find(c => c.slot === s.slot);
    if (!cp || cp.owner === s.team) return;
    cp.owner = s.team;
    cp.pop = 0.5;
    const p = m.board.lanePoint(li, cp.slot);
    this.fx.ring(p.x, p.y, TEAM_RING[s.team], 12, 46, 0.5);
    this.fx.text(p.x, p.y - 34, 'CAPTURED', TEAM_TEXT[s.team], false, 12);
    this.sfx.play('capture');
  }

  // First enemy thing within `range` slots ahead of `slot`.
  laneTarget(lane, team, slot, range) {
    const dir = team === BLUE ? 1 : -1, goal = team === BLUE ? LANE_LEN : 0;
    for (let k = 1; k <= range; k++) {
      const s = slot + dir * k;
      if (s < 0 || s > LANE_LEN) break;
      const sq = lane.squads.find(o => o.slot === s && o.team !== team);
      if (sq) return { type: 'squad', ref: sq };
      const tw = lane.towers.find(o => o.slot === s && o.team !== team);
      if (tw) return { type: 'tower', ref: tw };
      if (s === goal) return { type: 'castle' };
    }
    return null;
  }

  squadAttack(m, li, s, tgt) {
    const b = m.board, from = b.lanePoint(li, s.slot);
    let to;
    if (tgt.type === 'castle') {
      const c = b.castles[1 - s.team];
      to = { x: c.x + (li === 0 ? -34 : 34), y: c.drawY - 8 };
    } else {
      to = b.lanePoint(li, tgt.ref.slot);
    }
    if (s.kind === 'melee') {
      const d = dist(from.x, from.y, to.x, to.y) || 1;
      s.lunge = 0.22;
      s.lx = (to.x - from.x) / d;
      s.ly = (to.y - from.y) / d;
      this.fx.puff(lerp(from.x, to.x, 0.7), lerp(from.y, to.y, 0.7), '#fff3c4', 5, 60);
      this.sfx.play('sword');
    } else {
      this.fx.shot(from.x, from.y - 8, to.x, to.y - 6, { arc: 18 });
      this.sfx.play('bow');
    }
    if (tgt.type === 'castle') this.hurtCastle(m, 1 - s.team, Math.round(s.atk * CASTLE.siege));
    else if (tgt.type === 'squad') this.hurtSquad(m, li, tgt.ref, s.atk);
    else this.hurtTower(m, li, tgt.ref, s.atk);
  }

  async laneAct(m, team, li) {
    const lane = m.lanes[li], b = m.board, enemy = 1 - team;
    const dir = team === BLUE ? 1 : -1, home = team === BLUE ? 0 : LANE_LEN;
    const nearest = (slot, range) => lane.squads
      .filter(s => s.team === enemy && Math.abs(s.slot - slot) <= range)
      .sort((p, q) => Math.abs(p.slot - slot) - Math.abs(q.slot - slot))[0];

    // The castle's own guards shoot whoever is at the gates.
    const raider = nearest(home, CASTLE.guardSlots);
    if (raider) {
      const c = b.castles[team], to = b.lanePoint(li, raider.slot);
      this.fx.shot(c.x + (li === 0 ? -30 : 30), c.drawY - 40, to.x, to.y - 6, { arc: 22 });
      this.sfx.play('bow');
      this.hurtSquad(m, li, raider, CASTLE.guardDmg);
      await this.sleep(m, 0.14);
    }

    for (const tw of lane.towers.filter(t => t.team === team)) {
      const foe = nearest(tw.slot, tw.range);
      if (!foe || m.over) continue;
      const from = b.lanePoint(li, tw.slot), to = b.lanePoint(li, foe.slot);
      this.fx.shot(from.x, from.y - 44, to.x, to.y - 6, { arc: 20 });
      this.sfx.play('bow');
      this.hurtSquad(m, li, foe, tw.atk);
      await this.sleep(m, 0.14);
    }

    // Front squads go first so the ones behind can close up.
    const squads = lane.squads.filter(s => s.team === team).sort((p, q) => dir * (q.slot - p.slot));
    for (const s of squads) {
      if (s.hp <= 0 || m.over) continue;
      const tgt = this.laneTarget(lane, team, s.slot, s.range);
      if (tgt) {
        this.squadAttack(m, li, s, tgt);
        await this.sleep(m, 0.16);
      } else if (this.march(m, li, s)) {
        await this.sleep(m, 0.05);
      }
    }
  }

  async centerAct(m, team) {
    const b = m.board, enemy = 1 - team, dirY = team === BLUE ? -1 : 1;
    const home = b.castles[team], goal = b.castles[enemy];

    let intruder = null, id = CASTLE.guardRange;
    for (const h of m.hunters) {
      const d = dist(h.x, h.y, home.x, home.y);
      if (h.team === enemy && d < id) { id = d; intruder = h; }
    }
    if (intruder) {
      this.fx.shot(home.x, home.drawY - 40, intruder.x, intruder.y - 10, { arc: 22 });
      this.sfx.play('bow');
      this.hurtHunter(m, intruder, CASTLE.guardDmg);
      await this.sleep(m, 0.16);
    }

    const mine = m.hunters.filter(h => h.team === team).sort((p, q) => -dirY * (p.y - q.y));
    for (const h of mine) {
      if (h.hp <= 0 || m.over) continue;

      // Enemy hunters and walls come first, then the castle, then game.
      let foe = null, fd = HUNTER.range;
      for (const o of m.hunters) {
        const d = dist(h.x, h.y, o.x, o.y);
        if (o.team === enemy && d < fd) { fd = d; foe = { hunter: o }; }
      }
      for (const o of m.walls) {
        const d = gap({ x: h.x, y: h.y, h: 0, r: 0 }, wallShape(o.x, o.y));
        if (o.team === enemy && d < fd) { fd = d; foe = { wall: o }; }
      }

      if (foe) {
        const o = foe.hunter || foe.wall;
        this.hunterShot(h, o.x, o.y - 8);
        if (foe.hunter) this.hurtHunter(m, o, HUNTER.atkUnit);
        else this.hurtWall(m, o, HUNTER.atkUnit);
      } else if (gap({ x: h.x, y: h.y, h: 0, r: 0 }, castleShape(goal)) <= HUNTER.range) {
        this.hunterShot(h, goal.x, goal.drawY - 30);
        this.hurtCastle(m, enemy, HUNTER.atkCastle);
      } else {
        let prey = null, pd = Infinity;
        for (const a of m.animals) {
          if ((a.y - h.y) * dirY < -24) continue; // behind the hunter
          const d = dist(h.x, h.y, a.x, a.y);
          if (d < pd) { pd = d; prey = a; }
        }
        if (prey && pd <= HUNTER.range) {
          this.hunterShot(h, prey.x, prey.y);
          const { x, y } = prey;
          this.hurtAnimal(m, prey, HUNTER.atkAnimal, team);
          if (prey.hp <= 0) this.advanceHunter(m, h, x, y);
        } else if (prey) {
          this.advanceHunter(m, h, prey.x, prey.y);
        } else {
          this.advanceHunter(m, h, goal.x, goal.y);
        }
      }
      await this.sleep(m, 0.2);
    }
  }

  hunterShot(h, x, y) {
    this.fx.shot(h.x, h.y - 26, x, y, { arc: 10, dur: 0.16 });
    this.sfx.play('bow');
  }

  // Step toward (tx, ty), fanning out to the sides if the direct path is blocked.
  advanceHunter(m, h, tx, ty) {
    const d = dist(h.x, h.y, tx, ty);
    if (d < 34) return;
    const base = Math.atan2(ty - h.y, tx - h.x);
    for (const step of [Math.min(HUNTER.step, d - 30), HUNTER.step / 2]) {
      for (const turn of [0, 0.5, -0.5, 1, -1]) {
        const x = h.x + Math.cos(base + turn) * step, y = h.y + Math.sin(base + turn) * step;
        if (!centerFits(m, 'hunter', x, y, h)) continue;
        h.x = x;
        h.y = y;
        return;
      }
    }
  }

  // ---------------------------------------------------------------- per-frame

  update(dt) {
    const m = this.match;
    // The menu backdrop keeps wandering even while the menu sheet "pauses" the game.
    if (!m || (this.paused && m.phase !== 'menu')) return;
    m.time += dt;

    for (let i = m.timers.length - 1; i >= 0; i--) {
      const tm = m.timers[i];
      tm.t -= dt;
      if (tm.t <= 0) {
        m.timers.splice(i, 1);
        tm.res();
      }
    }

    updateAnimals(m, dt);
    this.updateArrow(m, dt);

    for (const lane of m.lanes) {
      for (const s of lane.squads) {
        const d = s.slot - s.vis;
        s.walking = Math.abs(d) > 0.01;
        s.vis += clamp(d, -3.2 * dt, 3.2 * dt);
        s.lunge = Math.max(0, s.lunge - dt);
        s.flash = Math.max(0, s.flash - dt);
      }
      for (const t of lane.towers) {
        t.flash = Math.max(0, t.flash - dt);
        t.born = Math.min(1, t.born + dt * 4);
      }
      for (const c of lane.cps) c.pop = Math.max(0, c.pop - dt);
    }
    for (const h of m.hunters) {
      const k = Math.min(1, dt * 7);
      h.vx += (h.x - h.vx) * k;
      h.vy += (h.y - h.vy) * k;
      h.flash = Math.max(0, h.flash - dt);
      h.born = Math.min(1, h.born + dt * 4);
    }
    for (const w of m.walls) {
      w.flash = Math.max(0, w.flash - dt);
      w.born = Math.min(1, w.born + dt * 4);
    }
    for (const c of m.castles) c.flash = Math.max(0, c.flash - dt);

    if (m.aim) m.aim.path = previewPath(m, m.aim.team, m.aim.angle);
    this.fx.update(dt);
  }

  // Rebuilds geometry for a new canvas height, keeping every piece where it was
  // relative to the field.
  resize(H) {
    const m = this.match;
    if (!m || m.board.H === H) return;
    const old = m.board, nb = makeBoard(H);
    const mapY = y => nb.cy + (y - old.cy) * (nb.b / old.b);
    for (const e of [...m.animals, ...m.hunters, ...m.walls]) {
      e.y = mapY(e.y);
      if (e.vy !== undefined) e.vy = mapY(e.vy);
    }
    if (m.arrow) {
      m.arrow.y = mapY(m.arrow.y);
      m.arrow.trail = [];
    }
    for (const snap of m.undo) {
      for (const e of [...snap.hunters, ...snap.walls]) {
        e.y = mapY(e.y);
        if (e.vy !== undefined) e.vy = mapY(e.vy);
      }
    }
    m.board = nb;
  }
}
