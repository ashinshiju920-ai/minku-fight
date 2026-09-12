"use strict";

/* ==========================================================================
   MINKU-FIGHT — Fighter State Machine, Physics, Unique Specials & AI
   ========================================================================== */

function makeFighter(ci, slot, customName) {
  const ch = CHARS[ci] || CHARS[0];
  return {
    slot: slot,
    ci: ci,
    ch: ch,
    name: saneName(customName) || ch.name,
    x: slot === 0 ? 600 : 1120,
    y: 0,
    vx: 0,
    vy: 0,
    dir: slot === 0 ? 1 : -1,
    pose: clonePose(STANCE),
    state: 'stand',
    stateT: 0,
    animT: 0,
    rate: ch.spd,
    hp: 100,
    dispHp: 100,
    meter: 0,
    flash: 0,
    stunT: 0,
    invuln: 0,
    airAtk: false,
    landT: 0,
    walkPhase: 0,
    atk: null,
    atkHits: [],
    chainHit: false,
    castDone: false,
    comboN: 0,
    comboT: 0,
    spin: 0,
    spinV: 0,
    koFlag: false,
    grabber: null,
    grabDone: false,
    hasArmor: false,
    trailPts: [],
    ghosts: [],
    ghostT: 0,
    blinkT: rnd(2, 5),
    blink: 0,
    fxTrail: false,
    fxGhost: false,
    sk: null,
    ai: null,
    ctrl: {},
    prev: {},
    introTarget: 0,
    blockLow: false,
    opp: null,
    buf: null,
    tapT: { le: -1, ri: -1 },
    dashT: 0,
    dashDir: 1
  };
}

function grounded(f) {
  return f.y <= 0.001 && f.vy <= 0;
}

function startMove(f, key) {
  const m = MOVES[key];
  if (!m) return;
  f.state = 'atk';
  f.atk = m;
  f.atkHits = m.hits.map(() => false);
  f.chainHit = false;
  f.castDone = false;
  f.grabDone = false;
  f.animT = 0;
  f.buf = null;

  // Gaizer's armored rush
  f.hasArmor = (key === 'rush' && f.ch.rush && f.ch.rush.armorFrames);

  if (m.cost && !(window.game && window.game.training && window.game.training.infMeter)) {
    f.meter = Math.max(0, f.meter - m.cost);
  }

  if (key === 'super') {
    f.pose = clonePose(FLARE);
    if (window.game) {
      window.game.hitstop = Math.max(window.game.hitstop, 0.45);
      window.game.flash = 0.85;
      window.game.superFreeze = { f: f, t: 0.45 };
      if (typeof shake === 'function') shake(0.75);
      else if (window.shake) window.shake(0.75);
      else if (window.game.cam) window.game.cam.tr = Math.min(1, (window.game.cam.tr || 0) + 0.75);
    }
    fx('su', f.x, GY - 110, 2.0, f.ci);
    sfx('riser');
    sfx('hitH');
  }

  const KICKMV = (key === 'lowk' || key === 'highk' || key === 'sweep' || key === 'airk');
  const SPECMV = (key === 'cast' || key === 'rush' || key === 'super');
  fx('sw', f.x, GY - 80, SPECMV ? 2.2 : (KICKMV ? 1.6 : 1.0));

  // Character specific audio cue
  if (key === 'cast') {
    if (f.ch.id === 'volt') sfx('electric');
    else if (f.ch.id === 'nimbus') sfx('wind');
    else if (f.ch.id === 'gaizer') sfx('magma');
    else sfx('fire');
  }
}

function spawnProj(f) {
  if (!window.game || !f.sk) return;
  const ch = f.ch, s = f.sk;
  const mx = (s.haF[0] + s.haB[0]) / 2, my = (s.haF[1] + s.haB[1]) / 2;

  window.game.projectiles.push({
    x: mx + f.dir * 16,
    y: my,
    vx: f.dir * ch.proj.speed,
    r: ch.proj.r,
    dmg: ch.proj.dmg,
    aura: ch.aura,
    glow: ch.glow,
    ci: f.ci,
    type: ch.proj.type,
    owner: f.slot,
    dead: false,
    trail: 0,
    life: 0
  });

  fx('pr', mx, my, 1, f.ci);
}

function fUpdate(f, o, dt, ctrl) {
  f.prev = Object.assign({}, f.ctrl);
  f.ctrl = ctrl;
  const edge = k => !!ctrl[k] && !f.prev[k];
  const ch = f.ch;

  f.stateT += dt;
  f.flash = Math.max(0, f.flash - dt * 6);
  f.invuln = Math.max(0, f.invuln - dt);
  f.comboT = Math.max(0, f.comboT - dt);
  if (f.comboT === 0) f.comboN = 0;
  f.landT = Math.max(0, f.landT - dt);

  f.blinkT -= dt;
  if (f.blinkT < 0) {
    f.blink = 0.13;
    f.blinkT = rnd(2.4, 5.5);
  }
  f.blink = Math.max(0, f.blink - dt);

  if (f.dashT > 0) {
    f.dashT -= dt;
    if (f.state !== 'stand') f.dashT = 0;
  }

  // Turn to face opponent when in idle states
  if (f.state === 'stand' || f.state === 'crouch' || f.state === 'block') {
    const d = Math.sign(o.x - f.x);
    if (d) f.dir = d;
  }

  // Double-tap dash detection
  f.tapT.le += dt;
  f.tapT.ri += dt;
  if (edge('le')) {
    if (f.state === 'stand' && f.tapT.le >= 0 && f.tapT.le < 0.22) {
      f.dashT = 0.17;
      f.dashDir = -1;
      fx('du', f.x, GY, 0.9);
      fx('sw', f.x, GY - 70, 1.1);
    }
    f.tapT.le = 0;
  }
  if (edge('ri')) {
    if (f.state === 'stand' && f.tapT.ri >= 0 && f.tapT.ri < 0.22) {
      f.dashT = 0.17;
      f.dashDir = 1;
      fx('du', f.x, GY, 0.9);
      fx('sw', f.x, GY - 70, 1.1);
    }
    f.tapT.ri = 0;
  }

  // 180ms input buffer
  if (f.state !== 'stand' && f.state !== 'crouch' && f.state !== 'block') {
    if (edge('p')) f.buf = { k: 'p', t: 0 };
    else if (edge('k')) f.buf = { k: 'k', t: 0 };
    else if (edge('s1')) f.buf = { k: 's1', t: 0 };
    else if (edge('s2')) f.buf = { k: 's2', t: 0 };
    else if (edge('su')) f.buf = { k: 'su', t: 0 };
    else if (edge('gr')) f.buf = { k: 'gr', t: 0 };
  }
  if (f.buf) {
    f.buf.t += dt;
    if (f.buf.t > 0.18) f.buf = null;
  }

  const be = k => edge(k) || (!!f.buf && f.buf.k === k);

  switch (f.state) {
    case 'intro': {
      const dx = f.introTarget - f.x;
      if (Math.abs(dx) > 6) {
        f.vx = Math.sign(dx) * 260;
        f.walkPhase += f.vx * f.dir * dt / 33;
      } else {
        f.vx = 0;
        f.state = 'stand';
      }
      break;
    }
    case 'stand': {
      if (f.dashT > 0) {
        f.vx = f.dashDir * 490 * ch.spd;
        f.walkPhase += f.vx * f.dir * dt / 33;
        break;
      }

      let mv = 0;
      if (ctrl.le && !ctrl.ri) mv = -1;
      else if (ctrl.ri && !ctrl.le) mv = 1;
      f.vx = mv * ((mv === f.dir) ? 240 * ch.spd : 180 * ch.spd);
      if (Math.abs(f.vx) > 4) f.walkPhase += f.vx * f.dir * dt / 33;

      if (edge('up') && grounded(f)) {
        f.state = 'jump';
        f.vy = -800 * Math.sqrt(ch.jmp);
        f.y = Math.max(f.y, 0.1);
        fx('du', f.x, GY, 1);
        fx('sw', f.x, GY - 70, 1);
        break;
      }

      const infMeter = !!(window.game && window.game.training && window.game.training.infMeter);

      if (ctrl.dn && be('p')) { startMove(f, 'upper'); break; }
      if (ctrl.dn && be('k')) { startMove(f, 'sweep'); break; }
      if (ctrl.dn) { f.state = 'crouch'; f.vx = 0; break; }
      if (ctrl.bl) { f.state = 'block'; f.vx = 0; break; }
      if (be('p')) { startMove(f, 'jab'); break; }
      if (be('k')) { startMove(f, 'lowk'); break; }
      if (be('s1') && (f.meter >= 30 || infMeter)) { startMove(f, 'cast'); break; }
      if (be('s2') && (f.meter >= 30 || infMeter)) { startMove(f, 'rush'); break; }
      if (be('su') && (f.meter >= 100 || infMeter)) { startMove(f, 'super'); break; }
      if (be('gr')) { startMove(f, 'grab'); break; }
      break;
    }
    case 'crouch': {
      f.vx = 0;
      if (be('p')) { startMove(f, 'upper'); break; }
      if (be('k')) { startMove(f, 'sweep'); break; }
      if (ctrl.bl) { f.state = 'block'; f.blockLow = true; break; }
      if (!ctrl.dn) { f.state = 'stand'; break; }
      break;
    }
    case 'block': {
      f.vx *= Math.pow(0.02, dt);
      if (f.stunT > 0) {
        f.stunT -= dt;
        break;
      }
      if (!ctrl.bl) {
        f.state = ctrl.dn ? 'crouch' : 'stand';
        break;
      }
      f.blockLow = !!ctrl.dn;
      break;
    }
    case 'jump': {
      if (edge('p') && !f.airAtk) {
        f.airAtk = true;
        startMove(f, 'airp');
        break;
      }
      if (edge('k') && !f.airAtk) {
        f.airAtk = true;
        startMove(f, 'airk');
        break;
      }
      if (f.y <= 0 && f.vy <= 0) {
        f.state = 'stand';
        f.landT = 0.13;
        f.airAtk = false;
        fx('la', f.x, GY, 1);
      }
      break;
    }
    case 'atk': {
      const m = f.atk;
      f.animT += dt * f.rate;
      const t = f.animT;

      if (m.script) {
        m.script(f, dt, t);
      } else if (!m.air) {
        f.vx *= Math.pow(0.002, dt);
      }

      if (m.script && (t > 1.35 || (m === MOVES.rush && t > 0.40))) {
        f.vx *= Math.pow(0.002, dt);
      }

      if (m.cast && !f.castDone && t >= m.cast) {
        f.castDone = true;
        spawnProj(f);
      }

      // Combo chain cancels (e.g. Jab -> Cross, Low Kick -> High Kick)
      if (m.hits.length && m.hits[0].chain && f.chainHit && (edge('p') || edge('k')) && t < 0.40) {
        startMove(f, m.hits[0].chain);
        break;
      }

      if (m.air && f.y <= 0 && f.vy <= 0) {
        f.state = 'stand';
        f.atk = null;
        f.airAtk = false;
        f.landT = 0.13;
        fx('la', f.x, GY, 1);
        break;
      }

      if (t >= m.dur) {
        f.state = 'stand';
        f.atk = null;
        f.vx = 0;
        f.hasArmor = false;
      }
      break;
    }
    case 'grab': {
      f.vx = 0;
      f.animT = Math.min(f.stateT, MOVES.grab.dur - 0.01);
      if (f.stateT >= MOVES.grab.dur) {
        f.state = 'stand';
        f.grabDone = false;
      }
      break;
    }
    case 'grabbed': {
      const a = f.grabber;
      if (!a || a.state !== 'grab') {
        f.state = 'stand';
        f.grabber = null;
        break;
      }
      f.x = a.x + a.dir * 34;
      f.y = 0;
      f.vx = 0;
      f.vy = 0;
      f.dir = -a.dir;
      if (a.grabDone) {
        f.state = 'stand';
        f.grabber = null;
      }
      break;
    }
    case 'hitHead': case 'hitBody': case 'hitLow': case 'hitHeavy': {
      f.stunT -= dt;
      f.vx *= Math.pow(0.25, dt);
      if (f.stunT <= 0) f.state = grounded(f) ? 'stand' : 'jump';
      break;
    }
    case 'launched': case 'thrown': {
      f.spin += f.spinV * dt;
      f.spinV *= Math.pow(0.45, dt);
      f.vx *= Math.pow(0.55, dt);
      if (f.y <= 0 && f.vy <= 0) {
        f.y = 0;
        f.vy = 0;
        f.state = 'knockdown';
        f.stateT = 0;
        fx('la', f.x, GY, 1.5);
        shake(0.5);
      }
      break;
    }
    case 'knockdown': {
      f.vx *= Math.pow(0.01, dt);
      if (f.koFlag) break;
      if (f.stateT > 1.05) {
        f.state = 'getup';
        f.stateT = 0;
        f.invuln = 0.55;
        f.animT = 0;
      }
      break;
    }
    case 'getup': {
      f.animT += dt;
      if (f.stateT > 0.5) {
        f.state = 'stand';
        f.spin = 0;
      }
      break;
    }
    case 'win': case 'ko': break;
  }

  // Vertical physics
  if (f.state === 'jump' || (f.atk && f.atk.air) || f.state === 'launched' || f.state === 'thrown') {
    f.vy += GRAV * dt;
    f.y += f.vy * dt;
    if (f.y > 620 && f.vy < 0) f.vy = 0; // Ceiling cap
    if ((f.state === 'jump' || (f.atk && f.atk.air)) && f.y > 0) {
      f.vx += (ctrl.ri - ctrl.le) * 170 * dt;
      f.vx = clamp(f.vx, -300, 300);
    }
    if (f.y < 0) {
      if ((f.state === 'launched' || f.state === 'thrown') && f.vy > 620) {
        f.y = 0.12;
        f.vy = -f.vy * 0.36;
        fx('du', f.x, GY, 1.3);
        shake(0.3);
      } else {
        f.y = 0;
        f.vy = 0;
      }
    }
  } else if (f.y > 0) {
    f.y = 0;
    f.vy = 0;
  }

  // Horizontal motion & Wall Bounce
  f.x += f.vx * dt;
  if (f.x < WALL_L) {
    f.x = WALL_L;
    if (Math.abs(f.vx) > 430 && (f.state === 'launched' || f.state === 'thrown')) {
      f.vx = -f.vx * 0.48; // Wall bounce!
      fx('wb', WALL_L, GY - 90, 1.3);
      shake(0.55);
      sfx('thud');
    } else {
      f.vx = Math.max(0, f.vx);
    }
  }
  if (f.x > WALL_R) {
    f.x = WALL_R;
    if (Math.abs(f.vx) > 430 && (f.state === 'launched' || f.state === 'thrown')) {
      f.vx = -f.vx * 0.48; // Wall bounce!
      fx('wb', WALL_R, GY - 90, 1.3);
      shake(0.55);
      sfx('thud');
    } else {
      f.vx = Math.min(0, f.vx);
    }
  }

  f.meter = clamp(f.meter, 0, 100);
  f.dispHp += (f.hp - f.dispHp) * Math.min(1, dt * 3.2);

  // Pose evaluation
  let tp;
  try {
    tp = targetPose(f);
  } catch (e) {
    tp = STANCE;
  }
  const kk = 1 - Math.exp(-34 * dt);
  f.pose = lerpPose(f.pose, tp, kk);
  f.sk = skelFor(f.pose, f.x, GY - f.y - f.pose.hy, f.dir);

  // Trails & Afterimage Ghosting
  f.fxTrail = false;
  f.fxGhost = false;
  if (f.dashT > 0) f.fxGhost = true;

  if (f.state === 'atk' && f.atk) {
    const m = f.atk;
    for (let i = 0; i < m.hits.length; i++) {
      const w = m.hits[i];
      if (!f.atkHits[i] && f.animT >= w.t0 && f.animT <= w.t1) f.fxTrail = true;
    }
    if ((m === MOVES.rush && f.animT > 0.15 && f.animT < 0.45) ||
        (m === MOVES.super && f.animT > 0.40 && f.animT < 1.45)) {
      f.fxGhost = true;
    }
  }

  if (f.fxTrail && f.sk && f.atk) {
    for (let i = 0; i < f.atk.hits.length; i++) {
      const w = f.atk.hits[i];
      if (f.sk[w.limb] && f.animT >= w.t0 && f.animT <= w.t1) {
        f.trailPts.push({ x: f.sk[w.limb][0], y: f.sk[w.limb][1], t: 0 });
        break;
      }
    }
  }

  for (let i = 0; i < f.trailPts.length; i++) f.trailPts[i].t += dt;
  f.trailPts = f.trailPts.filter(p => p.t < 0.12);

  if (f.fxGhost) {
    f.ghostT -= dt;
    if (f.ghostT <= 0) {
      f.ghostT = 0.045;
      f.ghosts.push({ pose: clonePose(f.pose), x: f.x, y: f.y, dir: f.dir, t: 0 });
    }
  }
  for (let i = 0; i < f.ghosts.length; i++) f.ghosts[i].t += dt;
  f.ghosts = f.ghosts.filter(g => g.t < 0.26);
}

function targetPose(f) {
  switch (f.state) {
    case 'intro': return Math.abs(f.vx) > 6 ? walkPose(f) : idlePose(f);
    case 'stand': {
      if (!grounded(f)) return airPose(f);
      if (f.landT > 0) {
        const p = clonePose(STANCE);
        p.hy -= 14 * (f.landT / 0.13);
        return p;
      }
      return Math.abs(f.vx) > 6 ? walkPose(f) : idlePose(f);
    }
    case 'crouch': return CROUCH;
    case 'block': return f.blockLow ? BLOCKC : BLOCK;
    case 'jump': return airPose(f);
    case 'atk': return evalTrack(f.atk.t, f.animT);
    case 'grab': return evalTrack(MOVES.grab.t, f.animT);
    case 'grabbed': return GRABBED;
    case 'hitHead': return evalTrack(TR.hitHead, f.stateT);
    case 'hitBody': return evalTrack(TR.hitBody, f.stateT);
    case 'hitLow': return evalTrack(TR.hitLow, f.stateT);
    case 'hitHeavy': return evalTrack(TR.hitHeavy, f.stateT);
    case 'launched': case 'thrown': {
      const p = clonePose(LAUNCH);
      p.rot = f.spin;
      return p;
    }
    case 'knockdown': case 'ko': {
      const p = clonePose(LYING);
      p.rot = lerpA(f.spin, -f.dir * PI / 2, Math.min(1, f.stateT * 3.5));
      return p;
    }
    case 'getup': return evalTrack(TR.getup, f.animT);
    case 'win': return evalTrack(TR.win, f.stateT);
  }
  return STANCE;
}

function idlePose(f) {
  const t = performance.now() / 1000, p = clonePose(STANCE);
  p.hy += Math.sin(t * 2.1 + f.slot) * 2.2;
  p.aF[1] += Math.sin(t * 2.1 + f.slot) * 0.05;
  p.aB[1] -= Math.sin(t * 2.1 + f.slot) * 0.05;
  p.head += Math.sin(t * 1.3) * 0.03;
  return p;
}

function walkPose(f) {
  const p = clonePose(STANCE), ph = f.walkPhase;
  const sw = Math.sin(ph), cw = Math.cos(ph);
  p.hy = 74 + Math.sin(2 * ph) * 2.2;
  p.lean = 0.16;
  p.lF = [0.55 + sw * 0.5, -0.05 + Math.max(0, cw) * 0.95];
  p.lB = [-0.45 - sw * 0.5, -0.55 + Math.max(0, -cw) * 0.95];
  p.aF = [2.35 + Math.sin(2 * ph) * 0.05, 1.15];
  p.aB = [2.50 - Math.sin(2 * ph) * 0.05, 1.30];
  return p;
}

function airPose(f) {
  return f.vy < 0 ? JUMPPO : FALLPO;
}

/* ==========================================================================
   AI Controller — Intelligent Fighting Game Decision Logic
   ========================================================================== */
function aiCtrl(f, opp, dt, diff) {
  const A = f.ai;
  if (!A) return ZEROS;

  A.t -= dt;
  A.blockT -= dt;
  if (A.holdDn > 0) A.holdDn -= dt;

  const c = { le: 0, ri: 0, up: 0, dn: 0, p: 0, k: 0, bl: 0, s1: 0, s2: 0, su: 0, gr: 0 };
  const dx = opp.x - f.x, ad = Math.abs(dx);
  const toward = dx > 0 ? 'ri' : 'le', away = dx > 0 ? 'le' : 'ri';

  // Process queued button presses
  for (let i = 0; i < A.pressQ.length; i++) {
    const q = A.pressQ[i];
    q.d -= dt;
    if (q.d <= 0) {
      c[q.k] = 1;
      q.done = true;
    }
  }
  A.pressQ = A.pressQ.filter(q => !q.done);

  if (A.holdDn > 0) c.dn = 1;
  if (A.blockT > 0) { c.bl = 1; return c; }

  // Projectile anticipation & dodge
  let prNear = false;
  if (window.game) {
    for (let i = 0; i < window.game.projectiles.length; i++) {
      const p = window.game.projectiles[i];
      if (p.owner !== f.slot && Math.sign(p.vx) === Math.sign(f.x - p.x) && Math.abs(p.x - f.x) < 320) {
        prNear = true;
        break;
      }
    }
  }
  if (prNear && !A.jmp) {
    const r = Math.random();
    if (r < 0.45 + diff * 0.1) {
      A.jmp = true;
      c.up = 1;
      A.pressQ.push({ k: toward, d: 0 });
      A.pressQ.push({ k: 'k', d: 0.28 });
      return c;
    }
    if (r < 0.85) {
      c.bl = 1;
      return c;
    }
  }

  // Air combat
  if (f.y > 0) {
    A.jmp = false;
    if (f.vy < 50 && f.y > 40 && ad < 230 && Math.random() < 0.08 + diff * 0.04) {
      c.k = 1;
    }
    return c;
  }

  // Anti-air uppercut reaction when opponent is jumping in
  if (opp.y > 40 && ad < 180 && opp.vy > -250 && Math.random() < 0.06 + 0.08 * diff) {
    A.holdDn = 0.30;
    A.pressQ.push({ k: 'p', d: 0.05 });
    return c;
  }

  // Spacing on downed opponent
  if ((opp.state === 'knockdown' || opp.state === 'getup') && ad < 150) {
    c[away] = 1;
    return c;
  }

  // Tech grab if opponent is turtling in block
  if (opp.state === 'block' && ad < 110 && Math.random() < 0.06 + diff * 0.08) {
    A.pressQ.push({ k: 'gr', d: 0 });
    return c;
  }

  // Main tactical decision tree
  if (A.t <= 0) {
    A.t = 0.32 - 0.06 * diff + Math.random() * 0.20;

    // Super execution when meter is 100%
    if (f.meter >= 100 && ad < 350 && Math.random() < 0.30 + 0.15 * diff) {
      A.pressQ.push({ k: 'su', d: 0 });
      return c;
    }

    if (ad > 440) {
      const r = Math.random();
      if (r < 0.20 && f.meter >= 30) A.pressQ.push({ k: 's1', d: 0 });
      else if (r < 0.35 && f.meter >= 30) A.pressQ.push({ k: 's2', d: 0 });
      else if (r < 0.60) {
        A.pressQ.push({ k: 'up', d: 0 });
        A.pressQ.push({ k: toward, d: 0.05 });
        A.pressQ.push({ k: 'k', d: 0.30 });
        A.jmp = true;
      } else {
        A.plan = 'approach';
      }
    } else if (ad > 190) {
      const r = Math.random();
      if (r < 0.16 && f.meter >= 30) A.pressQ.push({ k: 's1', d: 0 });
      else if (r < 0.28 && f.meter >= 30) A.pressQ.push({ k: 's2', d: 0 });
      else if (r < 0.42) {
        A.pressQ.push({ k: 'up', d: 0 });
        A.pressQ.push({ k: toward, d: 0.05 });
        A.pressQ.push({ k: 'k', d: 0.30 });
        A.jmp = true;
      } else {
        A.plan = 'approach';
      }
    } else {
      // Close range combat
      const r = Math.random();
      if (r < 0.26) {
        // Jab
        A.pressQ.push({ k: 'p', d: 0 });
      } else if (r < 0.48) {
        // Jab -> Cross combo
        A.pressQ.push({ k: 'p', d: 0 });
        A.pressQ.push({ k: 'p', d: 0.22 });
      } else if (r < 0.64) {
        // Low kick
        A.pressQ.push({ k: 'k', d: 0 });
      } else if (r < 0.78) {
        // Low kick -> High kick combo
        A.pressQ.push({ k: 'k', d: 0 });
        A.pressQ.push({ k: 'k', d: 0.24 });
      } else if (r < 0.88) {
        // Sweep
        A.holdDn = 0.28;
        A.pressQ.push({ k: 'k', d: 0.06 });
      } else if (r < 0.94) {
        // Uppercut launcher
        A.holdDn = 0.28;
        A.pressQ.push({ k: 'p', d: 0.06 });
      } else {
        A.blockT = 0.20 + 0.10 * diff;
      }
    }
  }

  if (A.plan === 'approach' && ad > 115) {
    c[toward] = 1;
  } else if (A.plan === 'approach') {
    A.plan = '';
  }

  return c;
}
