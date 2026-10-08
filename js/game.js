import {
  BLUE, RED, CHECKPOINTS, CASTLE, ARROW, CARDS, UPGRADE, LEVELS, TURN_LIMIT,
} from './config.js';
import { makeBoard } from './board.js';
import { initAnimals, updateAnimals, respawnAnimals, queueRespawn } from './animals.js';
import { collectObstacles, stepArrow, previewPath } from './arrow.js';
import { newTeam, dealHand, playCard, canPlayAny, basePoint } from './cards.js';
import { chooseAim, chooseCard } from './ai.js';
import { advance, strikeAct, laneStep, cpOwner } from './rules.js';
import { dist, clamp, lerp, rand, easeOut } from './utils.js';

const TEAM_TEXT = ['#bfe0ff', '#ffc4c4'];
const TEAM_RING = ['#6db6ff', '#ff7b7b'];
const WALK_SPEED = 12; // slots per second, for the walk animation only

export function createMatch(levelIdx, H) {
  const m = {
    board: makeBoard(H), levelIdx, turn: 1, turnTeam: BLUE, phase: 'menu', over: null, time: 0,
    castles: [BLUE, RED].map(team => ({ team, hp: CASTLE.hp, maxHp: CASTLE.hp, flash: 0 })),
    teams: [newTeam(), newTeam()],
    animals: [],
    arrived: {},  // kinds of prey that have appeared so far
    newcomers: [], // newly unlocked prey still waiting for room on the field
    respawns: [], // turn numbers at which killed animals are due back
    tick: 0,      // turns started so far, two per round
    lanes: [0, 1].map(() => ({ squads: [], towers: [] })),
    arrows: [],   // arrows in flight
    volley: null, // the hunt in progress: who is shooting, where, and how many are left
    aim: null, nextId: 1, timers: [], wait: {},
    tutorial: levelIdx === 0, // show the drag demo until the first shot of a Noob match
  };
  initAnimals(m);
  return m;
}

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
        // Round over. Past the turn limit, whoever is ahead takes the match.
        const lead = m.turn >= TURN_LIMIT ? this.standing(m) : 0;
        if (lead) {
          this.finish(m, lead > 0 ? BLUE : RED, 'time');
          break;
        }
        m.turn++;
        const left = TURN_LIMIT - m.turn;
        if (left === 4 || left === 0 || left < 0) {
          this.emit('banner', left > 0 ? `${left + 1} TURNS LEFT` : left === 0 ? 'FINAL TURN' : 'TIEBREAK');
          this.emit('toast', 'When time is up, the healthier castle wins');
          await this.sleep(m, 1.3);
        }
      }
      m.turnTeam = 1 - m.turnTeam;
    }
  }

  async turn(m, team) {
    const mine = team === BLUE;

    // Start of turn: animals killed a while ago return and the hand is dealt again.
    m.tick++;
    const fresh = respawnAnimals(m);
    if (fresh.length) this.emit('toast', 'New prey: ' + fresh.map(k => k[0].toUpperCase() + k.slice(1)).join(' and '));
    dealHand(m.teams[team]);

    // Hunt: one volley, every arrow the team owns down the same line.
    m.phase = 'aim';
    m.aim = null;
    this.emit('turn', team);
    this.sfx.play('turn');
    let angle;
    if (mine) {
      angle = await new Promise(res => { m.wait.fire = res; });
      m.wait.fire = null;
      m.tutorial = false;
    } else {
      await this.sleep(m, 0.5);
      angle = chooseAim(m, RED, LEVELS[m.levelIdx]);
      await this.aiAim(m, angle);
    }
    m.aim = null;
    m.phase = 'fly';
    await this.fire(m, team, angle);
    if (m.over) return;
    await this.sleep(m, 0.2);

    // Units on the board attack or step forward.
    m.phase = 'act';
    await this.unitsAct(m, team);
    if (m.over) return;

    // Attack: spend meat on cards.
    m.phase = 'cards';
    if (mine) {
      if (canPlayAny(m, BLUE)) {
        await new Promise(res => { m.wait.end = res; });
        m.wait.end = null;
      } else {
        this.emit('toast', 'Not enough meat for a card');
        await this.sleep(m, 1.1);
      }
    } else {
      await this.aiCards(m);
    }
    m.phase = 'wait';
    await this.sleep(m, 0.25);
  }

  async aiAim(m, angle) {
    const from = angle + (Math.random() < 0.5 ? -1 : 1) * rand(0.3, 0.6);
    const t0 = m.time, dur = 0.7;
    m.aim = { team: RED, angle: from, pull: 0 };
    while (m.time - t0 < dur) {
      const k = easeOut((m.time - t0) / dur);
      m.aim.angle = lerp(from, angle, k);
      m.aim.pull = 60 * k;
      await this.sleep(m, 0);
    }
    m.aim.angle = angle;
    await this.sleep(m, 0.2);
  }

  async aiCards(m) {
    const lvl = LEVELS[m.levelIdx];
    await this.sleep(m, 0.4);
    if (Math.random() < lvl.skip) return;
    for (let i = 0; i < lvl.maxCards && !m.over; i++) {
      const act = chooseCard(m, RED, lvl);
      if (!act) break;
      const name = CARDS[m.teams[RED].hand[act.idx]].name;
      if (!this.play(m, RED, act.idx, act.target)) break;
      this.emit('toast', `Enemy played ${name}`);
      await this.sleep(m, 0.55);
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
    return this.play(m, BLUE, idx, target);
  }

  playerEndTurn() {
    const m = this.match;
    if (!m || m.phase !== 'cards' || m.turnTeam !== BLUE || !m.wait.end) return;
    this.sfx.play('click');
    m.wait.end();
  }

  // Shared by the player and the AI. Troops take one free step as they land and strike
  // if that brings something into range; upgrades go straight onto the castle.
  play(m, team, idx, target) {
    const id = m.teams[team].hand[idx];
    const ent = playCard(m, team, idx, target);
    if (!ent) return false;
    this.sfx.play('place');
    let p;
    if (ent.upgrade) {
      p = basePoint(m, team);
      this.fx.text(p.x, p.y - 30, id === 'arrow' ? '+1 ARROW' : `+${UPGRADE.damage} DAMAGE`, '#ffcf3f', false, 17);
      this.sfx.play('capture');
    } else if (CARDS[id].zone === 'lane') {
      const lane = m.lanes[ent.lane], from = ent.slot;
      ent.slot = advance(lane, ent);
      p = m.board.lanePoint(ent.lane, ent.slot);
      // Landing in reach of something earns a blow, once the squad has walked up to it.
      if (strikeAct(lane, ent)) {
        this.sleep(m, (Math.abs(ent.slot - from) + 0.8) / WALK_SPEED + 0.1).then(() => {
          const act = !m.over && lane.squads.includes(ent) ? strikeAct(lane, ent) : null;
          if (act) this.squadAttack(m, ent.lane, ent, act);
        });
      }
    } else {
      p = m.board.lanePoint(ent.lane, ent.slot);
    }
    this.fx.ring(p.x, p.y, TEAM_RING[team], 8, 44, 0.4);
    return true;
  }

  // ---------------------------------------------------------------- hunting

  // Looses the team's whole quiver down one line, an arrow every ARROW.volleyGap seconds.
  // Resolves once the last one has landed.
  fire(m, team, angle) {
    m.volley = { team, angle, left: m.teams[team].arrows, wait: 0, struck: false };
    return new Promise(res => { m.wait.arrow = res; });
  }

  updateArrows(m, dt) {
    const v = m.volley;
    if (!v) return;
    v.wait -= dt;
    if (v.left > 0 && v.wait <= 0) {
      const L = m.board.castles[v.team].launch;
      m.arrows.push({
        team: v.team, x: L.x, y: L.y, dx: Math.cos(v.angle), dy: Math.sin(v.angle),
        bouncesLeft: ARROW.bounces, done: false, life: 0, fade: 0, trail: [],
      });
      v.left--;
      v.wait = ARROW.volleyGap;
      m.teams[v.team].shots++;
      this.sfx.play('shoot');
    }

    const obs = collectObstacles(m, v.team);
    for (let i = m.arrows.length - 1; i >= 0; i--) {
      const ar = m.arrows[i];
      if (ar.done) {
        ar.fade -= dt;
        if (ar.fade <= 0) m.arrows.splice(i, 1);
        continue;
      }
      stepArrow(ar, obs, m.board, ARROW.speed * dt, o => this.arrowHit(m, ar, o));
      ar.life += dt;
      if (ar.life > 10) ar.done = true;
      ar.trail.push({ x: ar.x, y: ar.y });
      if (ar.trail.length > 12) ar.trail.shift();
      if (ar.done) {
        ar.fade = 0.25;
        this.fx.puff(ar.x, ar.y, '#ffffff', 6, 70);
      }
    }

    if (v.left === 0 && !m.arrows.length) {
      m.volley = null;
      const done = m.wait.arrow;
      m.wait.arrow = null;
      if (done) done();
    }
  }

  // An arrow is spent on the first animal it meets (or on the enemy castle) and bounces
  // off everything else.
  arrowHit(m, ar, o) {
    if (o.kind === 'animal') {
      o.ref.kx += ar.dx * 70;
      o.ref.ky += ar.dy * 70;
      this.hurtAnimal(m, o.ref, m.teams[ar.team].damage, ar.team);
      if (o.ref.hp <= 0) o.dead = true;
      return 'stop';
    }
    if (o.kind === 'castle') {
      if (m.volley && !m.volley.struck) this.hurtCastle(m, 1 - ar.team, ARROW.castleDamage);
      if (m.volley) m.volley.struck = true;
      return 'stop';
    }
    this.sfx.play('bounce');
    this.fx.puff(ar.x, ar.y, '#f4e2b0', 4, 45);
  }

  // ---------------------------------------------------------------- damage

  // Hunting damage turns the animal's meat into the hunter's, share for share. The last
  // hit takes whatever is left, so rounding never loses any.
  hurtAnimal(m, a, dmg, team) {
    const dealt = Math.min(a.hp, dmg);
    if (dealt <= 0) return 0;
    a.hp -= dealt;
    const gain = a.hp <= 0 ? a.left : Math.min(a.left, Math.round((a.meat * dealt) / a.maxHp));
    a.left -= gain;
    a.flash = 0.18;
    m.teams[team].meat += gain;
    m.teams[team].hunted += gain;
    this.fx.text(a.x, a.y - a.r - 26, '+' + gain, team === BLUE ? '#ffffff' : '#ffc4c4', true, gain >= 40 ? 20 : 16);
    this.fx.puff(a.x, a.y, '#ff8fa0', 5, 60);
    if (a.hp <= 0) {
      m.animals.splice(m.animals.indexOf(a), 1);
      queueRespawn(m);
      this.fx.puff(a.x, a.y, '#ffffff', 12, 95);
      this.sfx.play('die');
    } else {
      this.sfx.play('hit');
    }
    return gain;
  }

  hurtCastle(m, team, dmg) {
    if (m.over) return;
    const c = m.castles[team], p = m.board.castles[team];
    c.hp = Math.max(0, c.hp - dmg);
    c.flash = 0.25;
    this.fx.shake = Math.max(this.fx.shake, 5);
    this.fx.text(p.x + rand(-24, 24), p.drawY - 70, '-' + dmg, '#ffd24a', false, 20);
    this.fx.puff(p.x + rand(-30, 30), p.drawY - 20, '#e9e2cf', 8, 80);
    this.sfx.play('castle');
    if (c.hp > 0) return;
    this.fx.shake = 12;
    for (let i = 0; i < 5; i++) this.fx.puff(p.x + rand(-45, 45), p.drawY + rand(-60, 10), '#e9e2cf', 10, 130);
    this.finish(m, 1 - team, 'castle');
  }

  // Who is ahead when time runs out: > 0 blue, < 0 red, 0 dead level.
  // Castle health decides, then checkpoints held, then meat in the bank.
  standing(m) {
    const cps = team => m.lanes.reduce((n, lane) => n + CHECKPOINTS.filter(c => cpOwner(lane, c) === team).length, 0);
    return m.castles[BLUE].hp - m.castles[RED].hp
      || cps(BLUE) - cps(RED)
      || m.teams[BLUE].meat - m.teams[RED].meat;
  }

  // how: 'castle' (destroyed) or 'time' (turn limit).
  finish(m, winner, how) {
    m.over = { winner, how };
    m.phase = 'over';
    m.aim = null;
    this.sleep(m, how === 'castle' ? 1.4 : 0.6).then(() => this.emit('over', winner));
  }

  hurtSquad(m, li, s, dmg) {
    const p = m.board.lanePoint(li, s.slot);
    s.hp -= dmg;
    s.flash = 0.2;
    this.fx.text(p.x, p.y - 22, '-' + dmg, TEAM_TEXT[s.team], false, 13);
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
    const list = m.lanes[li].towers;
    list.splice(list.indexOf(tw), 1);
    this.fx.puff(p.x, p.y - 20, '#e9e2cf', 14, 100);
    this.sfx.play('thud');
  }

  // ---------------------------------------------------------------- unit actions

  async unitsAct(m, team) {
    await Promise.all([this.laneAct(m, team, 0), this.laneAct(m, team, 1)]);
    await this.sleep(m, 0.2);
  }

  // Sword swing or arrow volley for an 'attack' action from a lane plan, plus its damage.
  squadAttack(m, li, s, act) {
    const b = m.board, lane = m.lanes[li], from = b.lanePoint(li, s.slot);
    let to;
    if (act.kind === 'castle') {
      const c = b.castles[1 - s.team];
      to = { x: c.x + (li === 0 ? -34 : 34), y: c.drawY - 8 };
    } else {
      to = b.lanePoint(li, act.slot);
    }
    if (s.kind !== 'archer') {
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
    if (act.kind === 'castle') {
      this.hurtCastle(m, 1 - s.team, act.dmg);
    } else if (act.kind === 'squad') {
      const tgt = lane.squads.find(q => q.id === act.target);
      if (tgt) this.hurtSquad(m, li, tgt, act.dmg);
    } else {
      const tgt = lane.towers.find(t => t.id === act.target);
      if (tgt) this.hurtTower(m, li, tgt, act.dmg);
    }
  }

  // The rules work the whole lane step out on a copy; this plays it back on the real
  // lane one action at a time so it can be watched.
  async laneAct(m, team, li) {
    const lane = m.lanes[li], b = m.board;
    const plan = laneStep(JSON.parse(JSON.stringify(lane)), team);
    const squad = id => lane.squads.find(q => q.id === id);

    for (const act of plan) {
      if (m.over) return;
      if (act.type === 'guard' || act.type === 'tower') {
        const tgt = squad(act.target);
        if (!tgt) continue;
        const to = b.lanePoint(li, tgt.slot);
        let from;
        if (act.type === 'guard') {
          const c = b.castles[team];
          from = { x: c.x + (li === 0 ? -30 : 30), y: c.drawY - 40 };
        } else {
          const tw = lane.towers.find(t => t.id === act.by);
          if (!tw) continue;
          const p = b.lanePoint(li, tw.slot);
          from = { x: p.x, y: p.y - 44 };
        }
        this.fx.shot(from.x, from.y, to.x, to.y - 6, { arc: 20 });
        this.sfx.play('bow');
        this.hurtSquad(m, li, tgt, act.dmg);
        await this.sleep(m, 0.12);
        continue;
      }

      const s = squad(act.by);
      if (!s) continue;
      const walked = Math.abs(act.to - s.slot);
      s.slot = act.to;
      if (act.type === 'move') {
        await this.sleep(m, 0.04);
        continue;
      }
      if (walked) await this.sleep(m, walked / WALK_SPEED + 0.05);
      if (m.over) return;
      this.squadAttack(m, li, s, act);
      await this.sleep(m, 0.14);
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
    this.updateArrows(m, dt);

    for (const lane of m.lanes) {
      for (const s of lane.squads) {
        const d = s.slot - s.vis;
        s.walking = Math.abs(d) > 0.01;
        s.vis += clamp(d, -WALK_SPEED * dt, WALK_SPEED * dt);
        s.lunge = Math.max(0, s.lunge - dt);
        s.flash = Math.max(0, s.flash - dt);
      }
      for (const t of lane.towers) {
        t.flash = Math.max(0, t.flash - dt);
        t.born = Math.min(1, t.born + dt * 4);
      }
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
    for (const a of m.animals) a.y = mapY(a.y);
    for (const ar of m.arrows) {
      ar.y = mapY(ar.y);
      ar.trail = [];
    }
    m.board = nb;
  }
}
