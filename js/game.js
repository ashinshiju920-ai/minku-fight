"use strict";

/* ==========================================================================
   MINKU-FIGHT — Main Game Loop, Combat Engine, Camera, Stage, & HUD
   ========================================================================== */

let game = null;
let parts = [];
let anns = [];
const ZEROS = { le: 0, ri: 0, up: 0, dn: 0, p: 0, k: 0, bl: 0, s1: 0, s2: 0, su: 0, gr: 0 };

/* ============ Keyboard & Touch Input Maps ============ */
const keysP1 = {};
const keysP2 = {};

// P1 Keyboard Map (WASD + J/K/L/U/I/O/H)
const KMAP_P1 = {
  KeyA: 'le', KeyD: 'ri', KeyW: 'up', Space: 'up', KeyS: 'dn',
  KeyJ: 'p', KeyK: 'k', KeyL: 'bl', KeyU: 's1', KeyI: 's2', KeyO: 'su', KeyH: 'gr'
};

// P2 Keyboard Map for Local 2P (Arrows + Numpad or Comma/Period/Slash/etc.)
const KMAP_P2 = {
  ArrowLeft: 'le', ArrowRight: 'ri', ArrowUp: 'up', ArrowDown: 'dn',
  Numpad1: 'p', Numpad2: 'k', Numpad3: 'bl', Numpad4: 's1', Numpad5: 's2', Numpad6: 'su', Numpad0: 'gr',
  Comma: 'p', Period: 'k', Slash: 'bl', Semicolon: 's1', Quote: 's2', BracketLeft: 'su', KeyP: 'gr'
};

// Single player fallback mapping (supports both WASD and Arrows interchangeably in 1P mode)
const KMAP_SOLO = {
  KeyA: 'le', ArrowLeft: 'le', KeyD: 'ri', ArrowRight: 'ri', KeyW: 'up', ArrowUp: 'up', Space: 'up',
  KeyS: 'dn', ArrowDown: 'dn', KeyJ: 'p', KeyK: 'k', KeyL: 'bl', KeyU: 's1', KeyI: 's2', KeyO: 'su', KeyH: 'gr',
  KeyZ: 'p', KeyX: 'k', KeyC: 'bl', KeyV: 's1', KeyB: 's2', KeyN: 'su', KeyG: 'gr'
};

addEventListener('keydown', e => {
  if (document.activeElement && document.activeElement.tagName === 'INPUT') return;
  audioInit();

  if (game && game.mode === 'local2p') {
    if (KMAP_P1[e.code]) { keysP1[KMAP_P1[e.code]] = true; e.preventDefault(); }
    if (KMAP_P2[e.code]) { keysP2[KMAP_P2[e.code]] = true; e.preventDefault(); }
  } else {
    if (KMAP_SOLO[e.code]) { keysP1[KMAP_SOLO[e.code]] = true; e.preventDefault(); }
  }

  if (e.code === 'KeyM') setMute(!muted);
  if (e.code === 'Escape') onEsc();
});

addEventListener('keyup', e => {
  if (game && game.mode === 'local2p') {
    if (KMAP_P1[e.code]) { keysP1[KMAP_P1[e.code]] = false; e.preventDefault(); }
    if (KMAP_P2[e.code]) { keysP2[KMAP_P2[e.code]] = false; e.preventDefault(); }
  } else {
    if (KMAP_SOLO[e.code]) { keysP1[KMAP_SOLO[e.code]] = false; e.preventDefault(); }
  }
});

addEventListener('blur', () => {
  for (const k in keysP1) keysP1[k] = false;
  for (const k in keysP2) keysP2[k] = false;
});

addEventListener('pointerdown', () => {
  audioInit();
  if (actx && actx.state === 'suspended') actx.resume();
}, { passive: true });

// Gamepad API Polling
function pollGamepad(playerIndex) {
  const gp = navigator.getGamepads ? navigator.getGamepads()[playerIndex] : null;
  if (!gp || !gp.connected) return ZEROS;

  const c = { le: 0, ri: 0, up: 0, dn: 0, p: 0, k: 0, bl: 0, s1: 0, s2: 0, su: 0, gr: 0 };
  const ax = gp.axes[0] || 0, ay = gp.axes[1] || 0;

  // D-Pad or Left Stick
  if (ax < -0.35 || gp.buttons[14]?.pressed) c.le = 1;
  if (ax >  0.35 || gp.buttons[15]?.pressed) c.ri = 1;
  if (ay < -0.45 || gp.buttons[12]?.pressed) c.up = 1;
  if (ay >  0.45 || gp.buttons[13]?.pressed) c.dn = 1;

  // Face Buttons: A/Cross = Punch, B/Circle = Kick, X/Square = Shot, Y/Triangle = Rush
  if (gp.buttons[0]?.pressed) c.p = 1;
  if (gp.buttons[1]?.pressed) c.k = 1;
  if (gp.buttons[2]?.pressed) c.s1 = 1;
  if (gp.buttons[3]?.pressed) c.s2 = 1;

  // Shoulder buttons / Triggers: RB/RT = Block, LB = Grab, LT = Super
  if (gp.buttons[5]?.pressed || gp.buttons[7]?.pressed) c.bl = 1;
  if (gp.buttons[4]?.pressed) c.gr = 1;
  if (gp.buttons[6]?.pressed || (gp.buttons[4]?.pressed && gp.buttons[5]?.pressed)) c.su = 1;

  return c;
}

// Touch controls setup
const touch = { le: 0, ri: 0, up: 0, dn: 0, p: 0, k: 0, bl: 0, s1: 0, s2: 0, su: 0, gr: 0 };
const isTouch = ('ontouchstart' in window) || matchMedia('(pointer:coarse)').matches || (navigator.maxTouchPoints > 0);

(function() {
  const joy = document.getElementById('joy'), knob = document.getElementById('joyKnob');
  const joyZone = document.getElementById('joyZone');
  if (!joy || !knob) return;
  let jid = null;
  let lastTapDir = 0, lastTapTime = 0;

  function handleJoyCoord(clientX, clientY) {
    const r = joy.getBoundingClientRect();
    const cx = r.left + r.width / 2;
    const cy = r.top + r.height / 2;
    const maxR = r.width * 0.38;

    let dx = (clientX - cx) / maxR;
    let dy = (clientY - cy) / maxR;
    const m = Math.hypot(dx, dy);
    if (m > 1) { dx /= m; dy /= m; }

    knob.style.transform = `translate(${dx * maxR}px, ${dy * maxR}px)`;

    const prevLe = touch.le, prevRi = touch.ri;
    touch.le = dx < -0.32 ? 1 : 0;
    touch.ri = dx >  0.32 ? 1 : 0;
    touch.dn = dy >  0.42 ? 1 : 0;

    // Double-tap dash detection on joystick flick
    const now = performance.now();
    if (touch.ri && !prevRi) {
      if (lastTapDir === 1 && now - lastTapTime < 280) {
        touch._dash = 1;
        if (window.haptic) window.haptic('medium');
      }
      lastTapDir = 1;
      lastTapTime = now;
    } else if (touch.le && !prevLe) {
      if (lastTapDir === -1 && now - lastTapTime < 280) {
        touch._dash = -1;
        if (window.haptic) window.haptic('medium');
      }
      lastTapDir = -1;
      lastTapTime = now;
    }

    const was = touch.up;
    touch.up = dy < -0.52 ? 1 : 0;
    if (touch.up && !was) {
      touch._jmp = 1;
      if (window.haptic) window.haptic('light');
    }
  }

  function startJoy(e) {
    if (e.preventDefault) e.preventDefault();
    jid = e.pointerId !== undefined ? e.pointerId : (e.changedTouches ? e.changedTouches[0].identifier : 'touch');
    if (e.pointerId && targetEl.setPointerCapture) {
      try { targetEl.setPointerCapture(jid); } catch (err) {}
    }
    const pt = e.touches ? e.touches[0] : e;
    handleJoyCoord(pt.clientX, pt.clientY);
  }

  const targetEl = joyZone || joy;
  targetEl.addEventListener('pointerdown', startJoy);
  targetEl.addEventListener('pointermove', e => {
    if (e.pointerId === jid) handleJoyCoord(e.clientX, e.clientY);
  });

  function endJoy(e) {
    const id = e.pointerId !== undefined ? e.pointerId : (e.changedTouches ? e.changedTouches[0].identifier : null);
    if (id === null || id === jid || e.type === 'pointercancel' || e.type === 'lostpointercapture') {
      jid = null;
      knob.style.transform = 'translate(0px, 0px)';
      touch.le = touch.ri = touch.up = touch.dn = 0;
    }
  }

  targetEl.addEventListener('pointerup', endJoy);
  targetEl.addEventListener('pointercancel', endJoy);
  targetEl.addEventListener('lostpointercapture', endJoy);

  // Native touch listeners with passive: false to prevent Chrome swipe gestures
  targetEl.addEventListener('touchstart', e => {
    e.preventDefault();
    const t = e.changedTouches[0];
    jid = t.identifier;
    handleJoyCoord(t.clientX, t.clientY);
  }, { passive: false });

  targetEl.addEventListener('touchmove', e => {
    e.preventDefault();
    for (let i = 0; i < e.changedTouches.length; i++) {
      if (e.changedTouches[i].identifier === jid) {
        handleJoyCoord(e.changedTouches[i].clientX, e.changedTouches[i].clientY);
        break;
      }
    }
  }, { passive: false });

  targetEl.addEventListener('touchend', endJoy, { passive: false });
  targetEl.addEventListener('touchcancel', endJoy, { passive: false });

  // Multi-touch arcade buttons with haptics & touch-slide support
  const btns = document.querySelectorAll('.tbtn');
  for (let i = 0; i < btns.length; i++) {
    const b = btns[i], k = b.getAttribute('data-k');

    function btnDown(e) {
      if (e.preventDefault) e.preventDefault();
      touch[k] = 1;
      b.classList.add('dn');
      if (window.haptic) {
        window.haptic(k === 'su' ? 'heavy' : (k === 's1' || k === 's2' ? 'medium' : 'light'));
      }
      if (k !== 'bl') {
        touch._edg = touch._edg || {};
        touch._edg[k] = 1;
      }
    }

    function btnUp(e) {
      if (e.preventDefault) e.preventDefault();
      touch[k] = 0;
      b.classList.remove('dn');
    }

    b.addEventListener('pointerdown', e => {
      e.preventDefault();
      try { b.setPointerCapture(e.pointerId); } catch (err) {}
      btnDown(e);
    });
    b.addEventListener('pointerup', btnUp);
    b.addEventListener('pointercancel', btnUp);
    b.addEventListener('lostpointercapture', btnUp);

    b.addEventListener('touchstart', e => {
      e.preventDefault();
      btnDown(e);
    }, { passive: false });
    b.addEventListener('touchend', btnUp, { passive: false });
    b.addEventListener('touchcancel', btnUp, { passive: false });
    b.addEventListener('contextmenu', e => e.preventDefault());
  }
})();

function localCtrl(playerSlot) {
  const c = { le: 0, ri: 0, up: 0, dn: 0, p: 0, k: 0, bl: 0, s1: 0, s2: 0, su: 0, gr: 0 };
  const isGuestDevice = (game && game.mode === 'guest') || (net && net.role === 'guest');
  const srcKeys = (playerSlot === 1 && game && game.mode === 'local2p') ? keysP2 : keysP1;

  for (const k in srcKeys) {
    if (srcKeys[k] && k in c) c[k] = 1;
  }

  // Check Gamepad: Gamepad 0 for P1 or for Guest on their own device
  const gpSlot = (playerSlot === 1 && isGuestDevice) ? 0 : (playerSlot || 0);
  const gp = pollGamepad(gpSlot);
  for (const k in gp) {
    if (gp[k]) c[k] = 1;
  }

  // Touch controls apply to P1, or to Guest on their own device
  if (playerSlot === 0 || (playerSlot === 1 && isGuestDevice)) {
    for (const k in touch) {
      if (k[0] !== '_' && touch[k] && k in c) c[k] = 1;
    }
    if (touch._edg) {
      for (const k in touch._edg) {
        if (touch._edg[k] && k in c) c[k] = 1;
      }
      touch._edg = {};
    }
    if (touch._jmp) {
      c.up = 1;
      touch._jmp = 0;
    }
    if (touch._dash) {
      const fighter = game ? game.fighters[playerSlot] : null;
      if (fighter && grounded(fighter) && fighter.state === 'stand') {
        fighter.dashT = 0.22;
        fighter.vx = touch._dash * 580;
        fighter.state = 'dash';
        fighter.fxGhost = true;
      }
      touch._dash = 0;
    }
  }

  return c;
}

/* ============ Game Creation & Lifecycle ============ */
function createGame(o) {
  parts = [];
  anns = [];
  groundPat = null;

  game = {
    mode: o.mode,
    online: (o.mode === 'host' || o.mode === 'guest'),
    authority: o.mode !== 'guest',
    attract: o.mode === 'attract',
    training: o.mode === 'dojo' ? { dummyMode: 'stand', infMeter: true } : null,
    chars: o.chars,
    names: o.names || null,
    fighters: [
      makeFighter(o.chars[0], 0, o.names ? o.names[0] : null),
      makeFighter(o.chars[1], 1, o.names ? o.names[1] : null)
    ],
    projectiles: [],
    evq: [],
    wins: [0, 0],
    round: 1,
    roundTitle: '',
    timer: ROUND_TIME,
    phase: o.mode === 'attract' ? 'fight' : 'intro',
    phT: 0,
    ph2: 0,
    hitstop: 0,
    slowF: 1,
    slowT: 0,
    flash: 0,
    paused: false,
    cam: makeCam(),
    snapBuf: [],
    snapAcc: 0,
    pingAcc: 0,
    koFocus: null,
    cpuDiff: (o.diff === undefined ? 1 : o.diff)
  };

  game.fighters[0].opp = game.fighters[1];
  game.fighters[1].opp = game.fighters[0];

  if (o.mode === 'attract') {
    for (let i = 0; i < 2; i++) {
      game.fighters[i].ai = { t: rnd(.2, .5), plan: 'approach', blockT: 0, pressQ: [], jmp: false, holdDn: 0 };
    }
    game.fighters[0].x = rnd(500, 650);
    game.fighters[1].x = rnd(1070, 1220);
  } else {
    for (let i = 0; i < 2; i++) {
      const f = game.fighters[i];
      f.state = 'intro';
      f.introTarget = i === 0 ? 600 : 1120;
      f.x = i === 0 ? 320 : 1400;
    }
    if (o.mode === 'cpu') {
      game.fighters[1].ai = { t: 0.4, plan: 'approach', blockT: 0, pressQ: [], jmp: false, holdDn: 0 };
    } else if (o.mode === 'dojo') {
      game.fighters[1].ai = { t: 0.5, plan: '', blockT: 0, pressQ: [], jmp: false, holdDn: 0 };
    }
  }

  for (let i = 0; i < 2; i++) {
    const f = game.fighters[i];
    f.sk = skelFor(f.pose, f.x, GY - f.y - f.pose.hy, f.dir);
  }

  music.on = !game.attract;
  music.intensity = 1.0;
  window.game = game;
  return game;
}

function gameStep(dt) {
  const g = game;
  if (!g || g.paused) return;
  g.phT += dt;
  const fight = (g.phase === 'fight');

  for (let i = 0; i < 2; i++) {
    const f = g.fighters[i];
    let c = ZEROS;

    if (g.attract) {
      c = aiCtrl(f, f.opp, dt, 1);
    } else if (g.mode === 'cpu' && f.slot === 1) {
      c = aiCtrl(f, f.opp, dt, g.cpuDiff);
    } else if (g.mode === 'dojo' && f.slot === 1) {
      c = dojoDummyCtrl(f, f.opp, dt);
    } else if (fight && f.slot === 0 && g.mode !== 'guest') {
      c = localCtrl(0);
    } else if (fight && f.slot === 1 && g.mode === 'local2p') {
      c = localCtrl(1);
    } else if (g.mode === 'host' && f.slot === 1 && net) {
      c = (net.ctrl || ZEROS);
    }

    if (!fight && g.phase !== 'intro') c = ZEROS;
    fUpdate(f, f.opp, dt, c);
  }

  // Fighter-to-fighter body push
  const a = g.fighters[0], b = g.fighters[1];
  if (a.state !== 'knockdown' && a.state !== 'getup' && a.state !== 'grabbed' &&
      b.state !== 'knockdown' && b.state !== 'getup' && b.state !== 'grabbed') {
    const dx = b.x - a.x, min = 46;
    if (Math.abs(dx) < min) {
      const push = (min - Math.abs(dx)) / 2 * Math.sign(dx || 1);
      a.x = clamp(a.x - push, WALL_L, WALL_R);
      b.x = clamp(b.x + push, WALL_L, WALL_R);
    }
  }

  // Command grab resolution
  for (let i = 0; i < 2; i++) {
    const f = g.fighters[i];
    if (f.state === 'grab') {
      const v = f.opp;
      if (f.stateT > 0.34 && !f.grabDone) {
        f.grabDone = true;
        f.pose = clonePose(TOSS);
        v.grabber = null;
        v.state = 'thrown';
        v.stateT = 0;
        v.y = Math.max(v.y, 0.1);
        v.vx = f.dir * 490;
        v.vy = -580;
        v.spinV = -f.dir * 7;
        v.spin = 0;
        v.hp = Math.max(0, v.hp - 9 * f.ch.pow);
        f.meter = clamp(f.meter + 6, 0, 100);
        fx('tos', f.x, GY - 110, 1.2, f.slot);
        shake(0.4);
        g.hitstop = Math.max(g.hitstop, 0.07);
        if (v.hp <= 0 && !g.training) beginKO(g, f, v);
      }
      if (f.stateT >= MOVES.grab.dur) {
        f.state = 'stand';
        f.grabDone = false;
      }
    }
  }

  if (fight) scanCombat(g);

  // Update projectiles
  for (let i = 0; i < g.projectiles.length; i++) {
    const pr = g.projectiles[i];
    pr.x += pr.vx * dt;
    pr.trail += dt;
    pr.life += dt;

    if (pr.trail > 0.02) {
      pr.trail = 0;
      parts.push({
        k: 'ember',
        x: pr.x,
        y: pr.y + rnd(-3, 3),
        sp: rnd(6, 22),
        life: 0.35,
        t: 0,
        col: pr.aura
      });
    }

    // Specific projectile shapes & trail dynamics
    if (pr.type === 'magma_rock') {
      pr.y += Math.sin(pr.life * 14) * 2;
    }
  }
  g.projectiles = g.projectiles.filter(p => !p.dead && p.x > -100 && p.x < WORLD_W + 100);

  updateParts(dt);
  g.flash = Math.max(0, g.flash - dt * 2.2);

  // Round phase transitions
  switch (g.phase) {
    case 'intro':
      if (g.phT > 1 && g.roundTitle === '') {
        g.roundTitle = 'VS';
        announce(g.fighters[0].name + '  VS  ' + g.fighters[1].name, 0);
      }
      if (g.phT > 2.2) {
        g.phase = 'round';
        g.phT = 0;
        g.roundTitle = '';
      }
      break;
    case 'round':
      if (g.phT < 0.05 && g.roundTitle === '') {
        g.roundTitle = (g.wins[0] === 1 && g.wins[1] === 1) ? 'FINAL ROUND' : ('ROUND ' + g.round);
        if (g.round === 3) music.intensity = 1.35;
        announce(g.roundTitle, 0);
        sfx('tick');
      }
      if (g.phT > 0.95 && g.roundTitle !== 'FIGHT') {
        g.roundTitle = 'FIGHT';
        announce('FIGHT!', 1);
        for (let i = 0; i < 2; i++) {
          if (g.fighters[i].state === 'intro') g.fighters[i].state = 'stand';
        }
      }
      if (g.phT > 1.55) {
        g.phase = 'fight';
        g.phT = 0;
      }
      break;
    case 'fight':
      if (!g.attract && !g.training) {
        const tPrev = Math.ceil(g.timer);
        g.timer -= dt;
        if (g.timer > 0 && g.timer <= 10.5 && Math.ceil(g.timer) !== tPrev) sfx('tick');
        if (g.timer <= 0) timeUp(g);
      } else if (g.attract) {
        if (g.fighters[0].hp <= 0 || g.fighters[1].hp <= 0) {
          g.ph2 += dt;
          if (g.ph2 > 1.6) resetAttract(g);
        }
      }
      break;
    case 'ko':
      if (g.phT > 1.15) {
        g.phase = 'end';
        g.phT = 0;
        endRound(g);
      }
      break;
    case 'end':
      if (g.phT > 1.9) {
        if (g.wins[0] >= 2 || g.wins[1] >= 2 || (g.training && g.wins[0] >= 1)) {
          g.phase = 'match';
          showEnd(g, !!g.training);
        } else {
          resetRound(g);
        }
      }
      break;
  }
}

function dojoDummyCtrl(dummy, opp, dt) {
  const c = { le: 0, ri: 0, up: 0, dn: 0, p: 0, k: 0, bl: 0, s1: 0, s2: 0, su: 0, gr: 0 };
  const mode = (game && game.training) ? game.training.dummyMode : 'stand';

  switch (mode) {
    case 'stand': break;
    case 'crouch': c.dn = 1; break;
    case 'guard_all': c.bl = 1; break;
    case 'guard_hit':
      if (dummy.comboN > 0 || dummy.stunT > 0) c.bl = 1;
      break;
    case 'jump':
      if (grounded(dummy)) c.up = 1;
      break;
    case 'cpu':
      return aiCtrl(dummy, opp, dt, 1);
  }
  return c;
}

function resetRound(g) {
  g.round++;
  g.phase = 'intro';
  g.phT = 0;
  g.roundTitle = '';
  g.timer = ROUND_TIME;
  g.projectiles = [];
  g.koFocus = null;

  for (let i = 0; i < 2; i++) {
    const f = g.fighters[i], keep = f.meter * 0.5;
    Object.assign(f, {
      x: i === 0 ? 320 : 1400, y: 0, vx: 0, vy: 0, dir: i === 0 ? 1 : -1,
      state: 'intro', stateT: 0, introTarget: i === 0 ? 600 : 1120,
      hp: 100, dispHp: 100, meter: keep, atk: null, comboN: 0,
      spin: 0, spinV: 0, koFlag: false, invuln: 0, stunT: 0, airAtk: false,
      grabber: null, flash: 0, grabDone: false,
      pose: clonePose(STANCE), trailPts: [], ghosts: [], buf: null, dashT: 0
    });
  }
}

function resetAttract(g) {
  for (let i = 0; i < 2; i++) {
    const f = g.fighters[i];
    Object.assign(f, {
      x: i === 0 ? rnd(500, 600) : rnd(1120, 1220), y: 0, vx: 0, vy: 0, dir: i === 0 ? 1 : -1,
      state: 'stand', hp: 100, dispHp: 100, meter: 0, atk: null, comboN: 0,
      spin: 0, koFlag: false, pose: clonePose(STANCE), buf: null, dashT: 0
    });
  }
  g.projectiles = [];
  g.ph2 = 0;
}

function beginKO(g, att, vic) {
  if (g.phase !== 'fight' && !g.attract) return;
  const away = Math.sign(vic.x - att.x) || att.dir;
  vic.koFlag = true;
  vic.state = 'launched';
  vic.stateT = 0;
  vic.y = Math.max(vic.y, 0.1);
  vic.vy = -800;
  vic.vx = away * 520;
  vic.spinV = -away * 9;

  if (g.attract) {
    g.ph2 = 0;
    return;
  }

  g.phase = 'ko';
  g.phT = 0;
  g.slowF = 0.22;
  g.slowT = 1.15;
  g.koFocus = vic;
  fx('ko', vic.x, GY - 100, 1.8, vic.ci);
  announce('K.O.', 2);
  shake(1.0);
}

function endRound(g) {
  const fa = g.fighters[0], fb = g.fighters[1];
  let w = null;
  if (fa.hp <= 0 && fb.hp <= 0) w = null;
  else if (fa.hp <= 0) w = fb;
  else if (fb.hp <= 0) w = fa;
  else w = (fa.hp > fb.hp) ? fa : fb;

  if (!w) {
    announce('DRAW', 0);
    return;
  }

  g.wins[w.slot]++;
  w.state = 'win';
  w.stateT = 0;
  w.vx = 0;
  fx('win', w.x, GY - 130, 1.4, w.slot);

  const perfect = w.hp >= 99.5;
  announce(perfect ? 'PERFECT' : (w.name + ' WINS'), 0, perfect ? (w.name + ' WINS') : '');
  if (typeof showRoundWin === 'function') showRoundWin(w, g);
}

function timeUp(g) {
  const fa = g.fighters[0], fb = g.fighters[1];
  announce('TIME UP', 0);
  if (fa.hp === fb.hp) {
    g.phase = 'end';
    g.phT = 0;
    endRound(g);
    return;
  }
  const w = (fa.hp > fb.hp) ? fa : fb;
  g.phase = 'end';
  g.phT = 0;
  g.wins[w.slot]++;
  w.state = 'win';
  w.stateT = 0;
  w.vx = 0;
  fx('win', w.x, GY - 130, 1.4, w.slot);
  announce(w.name + ' WINS', 0);
  if (typeof showRoundWin === 'function') showRoundWin(w, g);
}

/* ============ Combat & Collision Detection ============ */
function canBeHit(f) {
  return f.invuln <= 0 && f.state !== 'knockdown' && f.state !== 'getup' &&
         f.state !== 'grab' && f.state !== 'grabbed' && f.state !== 'ko';
}

function hurtTest(f, tip, r) {
  const s = f.sk;
  if (!s) return null;
  const d = Math.hypot(tip[0] - s.hd[0], tip[1] - s.hd[1]);
  if (d <= r + 16) return { x: (tip[0] + s.hd[0]) / 2, y: (tip[1] + s.hd[1]) / 2, part: 'head', mult: 1.15 };

  const c1 = segCirc(s.nk[0], s.nk[1], s.pel[0], s.pel[1], tip[0], tip[1], r + 13);
  if (c1) return { x: (tip[0] + c1.x) / 2, y: (tip[1] + c1.y) / 2, part: 'body', mult: 1.00 };

  const mx = (s.akF[0] + s.akB[0]) / 2, my = (s.akF[1] + s.akB[1]) / 2;
  const c2 = segCirc(s.pel[0], s.pel[1], mx, my, tip[0], tip[1], r + 12);
  if (c2) return { x: (tip[0] + c2.x) / 2, y: (tip[1] + c2.y) / 2, part: 'legs', mult: 0.90 };

  return null;
}

function scanCombat(g) {
  tryHit(g, g.fighters[0], g.fighters[1]);
  tryHit(g, g.fighters[1], g.fighters[0]);

  // Projectile collisions
  for (let i = 0; i < g.projectiles.length; i++) {
    const pr = g.projectiles[i];
    if (pr.dead) continue;

    for (let v = 0; v < 2; v++) {
      const vic = g.fighters[v];
      if (vic.slot === pr.owner || !canBeHit(vic) || !vic.sk) continue;

      const hit = hurtTest(vic, [pr.x, pr.y], pr.r + 2);
      if (hit) {
        pr.dead = true;
        const att = g.fighters[pr.owner];
        const away = Math.sign(pr.x - vic.x) || att.dir;

        if (vic.state === 'block' && Math.sign(pr.x - vic.x) === vic.dir) {
          blocked(g, att, vic, pr.dmg, hit, away);
        } else {
          resolveHit(g, att, vic, { dmg: pr.dmg, kb: 300, stun: .40, stop: .06, react: 'body', launch: 0, knockdown: false }, hit, away);
        }
        fx('ph', pr.x, pr.y, 1.2, pr.ci);
      }
    }

    // Projectile clash (two projectiles cancel each other out)
    for (let j = 0; j < g.projectiles.length; j++) {
      const o2 = g.projectiles[j];
      if (o2 !== pr && !o2.dead && !pr.dead && o2.owner !== pr.owner &&
          Math.hypot(o2.x - pr.x, o2.y - pr.y) < pr.r + o2.r) {
        pr.dead = true;
        o2.dead = true;
        fx('hs', (pr.x + o2.x) / 2, (pr.y + o2.y) / 2, 1.2, 1);
      }
    }
  }
}

function tryHit(g, att, vic) {
  if (att.state !== 'atk' || !att.atk) return;
  const m = att.atk, t = att.animT;

  if (m.grabWin) {
    if (t >= m.grabWin[0] && t <= m.grabWin[1] && !att.atkHits[0]) {
      if (Math.abs(vic.x - att.x) < 64 && grounded(vic) &&
          (vic.state === 'stand' || vic.state === 'crouch' || vic.state === 'block')) {
        att.atkHits[0] = true;
        att.state = 'grab';
        att.stateT = 0;
        att.grabDone = false;
        att.atk = null;
        vic.state = 'grabbed';
        vic.grabber = att;
        vic.stateT = 0;
        fx('gr', att.x, GY - 90, 1.1, att.ci);
      }
    }
    return;
  }

  for (let i = 0; i < m.hits.length; i++) {
    const w = m.hits[i];
    if (att.atkHits[i] || t < w.t0 || t > w.t1) continue;
    if (!att.sk) break;

    const tip = att.sk[w.limb];
    if (!tip) continue;

    const hit = hurtTest(vic, tip, w.r);
    if (!hit) continue;

    att.atkHits[i] = true;
    const away = Math.sign(vic.x - att.x) || att.dir;

    // Blocking mechanics: High/Low defense
    // Low sweeps bypass high standing block; crouching block defends sweeps!
    const isLowAttack = (w.react === 'low' || w.knockdown);
    const blockedProperly = (vic.state === 'block') &&
                           (Math.sign(att.x - vic.x) === vic.dir) &&
                           (!isLowAttack || vic.blockLow);

    if (blockedProperly) {
      blocked(g, att, vic, w.dmg, hit, away);
      att.chainHit = true;
    } else {
      resolveHit(g, att, vic, w, hit, away);
      att.chainHit = true;
    }
  }
}

function blocked(g, att, vic, dmg, hit, away) {
  const chip = Math.max(0.8, dmg * 0.12);
  vic.hp = Math.max(0, vic.hp - chip);
  vic.stunT = 0.20;
  vic.state = 'block';
  vic.vx = away * 230;
  att.vx = -away * 90;
  vic.meter = clamp(vic.meter + 2, 0, 100);
  att.meter = clamp(att.meter + 1, 0, 100);

  g.hitstop = Math.max(g.hitstop, 0.04);
  shake(0.15);
  fx('bs', hit.x, hit.y, 1.0);
  if (vic.hp <= 0 && !g.training) beginKO(g, att, vic);
}

function resolveHit(g, att, vic, w, hit, away) {
  // Check armored rush frames
  if (vic.hasArmor) {
    vic.hasArmor = false;
    vic.hp = Math.max(0, vic.hp - w.dmg * 0.5);
    fx('bs', hit.x, hit.y, 1.2);
    sfx('block');
    return;
  }

  // Damage scaling on long combos
  const scale = Math.max(0.40, Math.pow(0.85, att.comboN));
  const dmg = w.dmg * (att.ch ? att.ch.pow : 1) * scale * hit.mult;
  vic.hp = Math.max(0, vic.hp - dmg);
  att.comboN++;
  att.comboMax = Math.max(att.comboMax || 0, att.comboN);
  att.comboT = 1.45;
  att.meter = clamp(att.meter + 6, 0, 100);
  vic.meter = clamp(vic.meter + 3.5, 0, 100);

  const heavy = w.stop >= 0.08;
  g.hitstop = Math.max(g.hitstop, w.stop);
  shake(heavy ? 0.65 : 0.28);
  fx((hit.part === 'head' && !heavy) ? 'hc' : 'hs', hit.x, hit.y, heavy ? 1.5 : 1.0, att.slot || 0);

  const airborne = !grounded(vic) || vic.state === 'launched' || vic.state === 'thrown';

  if (w.launch || airborne) {
    vic.state = 'launched';
    vic.stateT = 0;
    vic.y = Math.max(vic.y, 0.1);
    vic.vy = w.launch || -430;
    vic.vx = away * Math.max(w.kb * 0.9, 190);
    vic.spinV = -away * 8;
    vic.spin = 0;
  } else if (w.knockdown) {
    vic.state = 'launched';
    vic.stateT = 0;
    vic.y = Math.max(vic.y, 0.1);
    vic.vy = -160;
    vic.vx = away * 260;
    vic.spinV = -away * 5;
    vic.spin = 0;
  } else {
    vic.state = 'hit' + (hit.part === 'head' ? 'Head' : (hit.part === 'legs' ? 'Low' : (w.react === 'heavy' ? 'Heavy' : 'Body')));
    vic.stunT = w.stun;
    vic.stateT = 0;
    vic.vx = away * w.kb;
  }

  vic.flash = 1;
  if (vic.hp <= 0 && !g.training) beginKO(g, att, vic);
}

/* ============ Visual FX & Particles ============ */
function shake(a) {
  if (game && game.cam) game.cam.tr = Math.min(1, (game.cam.tr || 0) + (a || 0.4));
}
window.shake = shake;
window.camShake = function(cam, amp, dur) {
  shake(amp ? Math.min(1, amp * 0.05) : 0.75);
};

function fx(k, x, y, s, c) {
  s = (s === undefined) ? 1 : s;
  c = c || 0;
  applyFx(k, x, y, s, c);
  if (game && game.authority && game.online && game.evq) {
    game.evq.push([k, x, y, s, c]);
  }
}

function applyFx(k, x, y, s, c) {
  switch (k) {
    case 'hs':
      burst(x, y, s * 0.9 + 0.4, c);
      sfx(s > 1.2 ? 'hitH' : 'hitL');
      break;
    case 'hc':
      burst(x, y, s * 0.7 + 0.3, c);
      parts.push({ k: 'ring', x: x, y: y, r: 5, vr: 430 * s, life: 0.15, t: 0, col: '#ffffff' });
      sfx('hitC');
      break;
    case 'win':
      burst(x, y, s, c);
      for (let i = 0; i < 18; i++) {
        parts.push({
          k: 'ember',
          x: x + rnd(-70, 70),
          y: y + rnd(-30, 10),
          sp: rnd(60, 170),
          life: rnd(0.7, 1.3),
          t: 0,
          col: CHARS[c] ? CHARS[c].aura : '#ffd24d'
        });
      }
      sfx('ok');
      break;
    case 'bs':
      parts.push({ k: 'ring', x: x, y: y, r: 6, vr: 260 * s, life: 0.22, t: 0, col: '#9fd4ff' });
      for (let i = 0; i < 5; i++) {
        parts.push({ k: 'streak', x: x, y: y, a: rnd(0, TAU), sp: rnd(180, 340) * s, life: 0.16, t: 0, col: '#bfe2ff', w: 2 });
      }
      sfx('block');
      break;
    case 'du':
      for (let i = 0; i < 6; i++) {
        parts.push({ k: 'dust', x: x + rnd(-14, 14), y: y + rnd(-4, 2), vx: rnd(-50, 50), vy: rnd(-70, -20), r: rnd(4, 9), life: 0.5, t: 0 });
      }
      break;
    case 'la':
      for (let i = 0; i < 10; i++) {
        parts.push({ k: 'dust', x: x + rnd(-26, 26), y: y - 2, vx: rnd(-90, 90), vy: rnd(-60, -10), r: rnd(5, 11), life: 0.55, t: 0 });
      }
      if (s > 1.2) sfx('thud');
      break;
    case 'wb':
      burst(x, y, s, 0);
      sfx('hitH');
      break;
    case 'ko':
      burst(x, y, 2.6, 1);
      parts.push({ k: 'ring', x: x, y: y, r: 10, vr: 900, life: 0.5, t: 0, col: PAPER });
      for (let i = 0; i < 14; i++) {
        parts.push({ k: 'streak', x: x, y: y, a: rnd(0, TAU), sp: rnd(300, 700), life: 0.3, t: 0, col: '#ffd24d', w: 3 });
      }
      if (game) game.flash = 0.85;
      sfx('ko');
      break;
    case 'su':
      if (game) game.flash = 0.70;
      parts.push({ k: 'ring', x: x, y: y, r: 12, vr: 1400, life: 0.4, t: 0, col: '#ffffff' });
      for (let i = 0; i < 10; i++) {
        parts.push({ k: 'streak', x: x, y: y, a: rnd(0, TAU), sp: rnd(250, 600), life: 0.3, t: 0, col: '#ffffff', w: 3 });
      }
      sfx('riser');
      break;
    case 'pr':
      sfx('whoosh');
      break;
    case 'ph':
      burst(x, y, s, 0);
      sfx('projhit');
      break;
    case 'gr':
      sfx('grab');
      break;
    case 'tos':
      sfx('tos');
      burst(x, y, 0.8, 0);
      break;
    case 'sw':
      sfx('swoosh', clamp(s, 1, 2.5));
      break;
    case 'an':
      announce(x, y, s || '');
      break;
  }
}

function burst(x, y, s, ci) {
  const cols = ['#fff6e0', '#ffd24d', '#ff8a2a'];
  parts.push({
    k: 'burst', x: x, y: y, sc: 0.3, vs: 7 + s * 7, rot: rnd(0, TAU),
    life: 0.22 * Math.max(1, s), t: 0, col: cols, sp: 9 + Math.round(s * 3)
  });
  parts.push({ k: 'ring', x: x, y: y, r: 4, vr: 340 * s, life: 0.18, t: 0, col: cols[1] });
  const n = Math.round(6 + 6 * s);
  for (let i = 0; i < n; i++) {
    parts.push({
      k: 'streak', x: x, y: y, a: rnd(0, TAU), sp: rnd(220, 480) * s,
      life: 0.18, t: 0, col: i % 2 ? cols[1] : cols[0], w: 2.5
    });
  }
  for (let i = 0; i < Math.round(4 * s); i++) {
    parts.push({
      k: 'drop', x: x, y: y, vx: rnd(-260, 260), vy: rnd(-380, -60),
      r: rnd(2, 4.5), life: 0.5, t: 0, col: CHARS[ci] ? CHARS[ci].ink : '#1a1512'
    });
  }
}

function updateParts(dt) {
  for (let i = 0; i < parts.length; i++) {
    const p = parts[i];
    p.t += dt;
    if (p.k === 'streak') {
      p.x += Math.cos(p.a) * p.sp * dt;
      p.y += Math.sin(p.a) * p.sp * dt;
      p.sp *= Math.pow(0.02, dt);
    } else if (p.k === 'drop') {
      p.vy += 1400 * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      if (p.y > GY) {
        p.y = GY;
        p.vy *= -0.3;
        p.vx *= 0.5;
      }
    } else if (p.k === 'dust') {
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.r += 14 * dt;
    } else if (p.k === 'ring') {
      p.r += p.vr * dt;
    } else if (p.k === 'burst') {
      p.sc += p.vs * dt;
    } else if (p.k === 'ember') {
      p.y -= p.sp * dt;
    }
  }
  parts = parts.filter(p => p.t < p.life);
  if (parts.length > 450) parts.splice(0, parts.length - 450);
}

function drawParts(c) {
  for (let i = 0; i < parts.length; i++) {
    const p = parts[i], k = 1 - p.t / p.life;
    if (p.k === 'streak') {
      c.strokeStyle = p.col;
      c.globalAlpha = k;
      c.lineWidth = p.w || 2;
      c.beginPath();
      c.moveTo(p.x, p.y);
      c.lineTo(p.x - Math.cos(p.a) * p.sp * 0.05, p.y - Math.sin(p.a) * p.sp * 0.05);
      c.stroke();
    } else if (p.k === 'drop') {
      c.fillStyle = p.col;
      c.globalAlpha = k * 0.85;
      c.beginPath();
      c.arc(p.x, p.y, p.r, 0, TAU);
      c.fill();
    } else if (p.k === 'dust') {
      c.fillStyle = 'rgba(200, 180, 150, ' + (k * 0.28) + ')';
      c.beginPath();
      c.arc(p.x, p.y, p.r, 0, TAU);
      c.fill();
    } else if (p.k === 'ring') {
      c.strokeStyle = p.col;
      c.globalAlpha = k * 0.80;
      c.lineWidth = 3;
      c.beginPath();
      c.arc(p.x, p.y, p.r, 0, TAU);
      c.stroke();
    } else if (p.k === 'burst') {
      for (let L = 0; L < 2; L++) {
        c.fillStyle = p.col[L];
        c.globalAlpha = k * (L ? 0.85 : 1);
        const rr = L ? p.sc : p.sc * 0.62;
        c.beginPath();
        for (let j = 0; j < p.sp * 2; j++) {
          const a = p.rot + j * PI / p.sp, r = (j % 2 ? rr * 0.45 : rr);
          if (j) c.lineTo(p.x + Math.cos(a) * r, p.y + Math.sin(a) * r);
          else c.moveTo(p.x + Math.cos(a) * r, p.y + Math.sin(a) * r);
        }
        c.closePath();
        c.fill();
      }
    } else if (p.k === 'ember') {
      c.fillStyle = p.col;
      c.globalAlpha = k * 0.70;
      c.beginPath();
      c.arc(p.x, p.y, 2.2, 0, TAU);
      c.fill();
    }
  }
  c.globalAlpha = 1;
}

/* ============ Stage Parallax & Background ============ */
const L = {};
let groundPat = null;
const clouds = [], motes = [];
for (let i = 0; i < 5; i++) clouds.push({ x: rnd(0, W), y: rnd(60, 220), w: rnd(120, 260), s: rnd(4, 10) });
for (let i = 0; i < 26; i++) motes.push({ x: rnd(0, WORLD_W), y: rnd(200, GY), p: rnd(0, TAU), r: rnd(1, 2.4) });
const birds = { t: rnd(4, 9), x: -100, y: 120 };

function buildStage() {
  L.sky = document.createElement('canvas');
  L.sky.width = W;
  L.sky.height = H;
  const s = L.sky.getContext('2d');
  const g = s.createLinearGradient(0, 0, 0, GY);
  g.addColorStop(0, '#132733');
  g.addColorStop(0.45, '#2c3448');
  g.addColorStop(0.75, '#7a5a52');
  g.addColorStop(1, '#e0955a');
  s.fillStyle = g;
  s.fillRect(0, 0, W, GY);

  // Sunset Orb
  s.fillStyle = '#ffd9a0';
  s.beginPath(); s.arc(W * 0.72, GY - 118, 54, 0, TAU); s.fill();
  s.fillStyle = 'rgba(224, 149, 90, 0.35)';
  s.beginPath(); s.arc(W * 0.72, GY - 118, 86, 0, TAU); s.fill();

  // Distant stars
  for (let i = 0; i < 26; i++) {
    s.fillStyle = 'rgba(242, 234, 216, ' + rnd(0.06, 0.20) + ')';
    s.fillRect(rnd(0, W), rnd(0, GY * 0.5), 2, 2);
  }

  // Mountain Silhouette
  L.mt = document.createElement('canvas');
  L.mt.width = 1900;
  L.mt.height = 300;
  const m = L.mt.getContext('2d');
  m.fillStyle = '#232b38';
  m.beginPath();
  m.moveTo(0, 300);
  for (let x = 0; x <= 1900; x += 60) {
    m.lineTo(x, 170 + Math.sin(x * 0.004) * 46 + Math.sin(x * 0.013) * 22);
  }
  m.lineTo(1900, 300);
  m.closePath();
  m.fill();

  m.fillStyle = '#1b212c';
  m.beginPath();
  m.moveTo(0, 300);
  for (let x = 0; x <= 1900; x += 50) {
    m.lineTo(x, 215 + Math.sin(x * 0.006 + 2) * 36);
  }
  m.lineTo(1900, 300);
  m.closePath();
  m.fill();

  // Forest / Bamboo Silhouette
  L.tr = document.createElement('canvas');
  L.tr.width = 2100;
  L.tr.height = 260;
  const t = L.tr.getContext('2d');
  t.fillStyle = '#141b16';
  for (let i = 0; i < 38; i++) {
    const bx = i * 56 + rnd(-16, 16), h = rnd(90, 190);
    t.fillRect(bx - 3, 260 - h * 0.55, 6, h * 0.6);
    for (let f = 0; f < 6; f++) {
      t.save();
      t.translate(bx, 260 - h);
      t.rotate(rnd(-2.4, -0.7));
      const fl = rnd(34, 62);
      t.beginPath();
      t.ellipse(fl * 0.5, 0, fl * 0.55, 10, 0, 0, TAU);
      t.fill();
      t.restore();
    }
  }

  // Textured Calligraphy Arena Ground
  L.gr = document.createElement('canvas');
  L.gr.width = 256;
  L.gr.height = H - GY + 40;
  const gg = L.gr.getContext('2d');
  gg.fillStyle = '#262019';
  gg.fillRect(0, 0, 256, H - GY + 40);
  gg.strokeStyle = 'rgba(60, 50, 36, 0.8)';
  gg.lineWidth = 2;
  for (let i = 0; i < 22; i++) {
    const y = rnd(6, H - GY + 30);
    gg.beginPath();
    gg.moveTo(rnd(40), y);
    gg.lineTo(rnd(80, 240), y + rnd(-3, 3));
    gg.stroke();
  }
  gg.fillStyle = 'rgba(15, 12, 9, 0.5)';
  for (let i = 0; i < 30; i++) {
    gg.fillRect(rnd(0, 256), rnd(0, H - GY + 40), rnd(2, 7), 2);
  }
}

function drawStage(c, cam, time) {
  if (!L.sky) buildStage();
  c.drawImage(L.sky, 0, 0);

  // Clouds
  for (let i = 0; i < clouds.length; i++) {
    const cl = clouds[i];
    cl.x += cl.s * 0.016;
    if (cl.x > W + cl.w) cl.x = -cl.w;
    c.fillStyle = 'rgba(240, 230, 215, 0.10)';
    c.beginPath(); c.ellipse(cl.x, cl.y, cl.w * 0.5, 16, 0, 0, TAU); c.fill();
    c.beginPath(); c.ellipse(cl.x + cl.w * 0.2, cl.y - 9, cl.w * 0.3, 12, 0, 0, TAU); c.fill();
  }

  // Flying birds
  birds.t -= 0.016;
  if (birds.t < 0) {
    birds.t = rnd(6, 13);
    birds.x = -120;
    birds.y = rnd(70, 190);
  }
  if (birds.x < W + 140) {
    birds.x += 1.6;
    c.strokeStyle = 'rgba(20, 17, 16, 0.55)';
    c.lineWidth = 2;
    for (let i = 0; i < 4; i++) {
      const bx = birds.x - i * 22, by = birds.y + Math.sin(i) * 8, fw = Math.sin(time * 7 + i) * 5;
      c.beginPath();
      c.moveTo(bx - 7, by - 3 + fw);
      c.lineTo(bx, by);
      c.lineTo(bx + 7, by - 3 + fw);
      c.stroke();
    }
  }

  const z = cam.z;
  c.drawImage(L.mt, (-760 - cam.x * 0.22) * z + W / 2, GY - 274, 1900 * z, 300 * z);
  c.drawImage(L.tr, (-600 - cam.x * 0.50) * z + W / 2, GY - 221, 2100 * z, 260 * z);

  // Flickering Torches
  const torches = [130, WORLD_W - 130];
  for (let i = 0; i < 2; i++) {
    const tx = torches[i];
    const sx = (tx - cam.x) * z + W / 2, sy = (GY - cam.y) * z + H * 0.56;
    c.strokeStyle = '#1c1712';
    c.lineWidth = 7 * z;
    c.beginPath(); c.moveTo(sx, sy); c.lineTo(sx, sy - 96 * z); c.stroke();
    c.fillStyle = '#2b2118'; c.fillRect(sx - 10 * z, sy - 104 * z, 20 * z, 12 * z);
    const fw = Math.sin(time * 11 + tx) * 2;
    c.fillStyle = '#ff9a3d'; c.beginPath(); c.ellipse(sx + fw, sy - 116 * z, 7 * z, 14 * z, 0, 0, TAU); c.fill();
    c.fillStyle = '#ffd97a'; c.beginPath(); c.ellipse(sx + fw, sy - 112 * z, 4 * z, 8 * z, 0, 0, TAU); c.fill();
    if (Math.random() < 0.25) {
      parts.push({ k: 'ember', x: tx + rnd(-4, 4), y: GY - 116, sp: rnd(26, 60), life: 0.8, t: 0, col: '#ffb04d' });
    }
  }

  const gy = (GY - cam.y) * z + H * 0.56;
  const gx0 = Math.max(0, (0 - cam.x) * z + W / 2), gx1 = Math.min(W, (WORLD_W - cam.x) * z + W / 2);
  if (!groundPat) groundPat = c.createPattern(L.gr, 'repeat');
  c.save();
  c.fillStyle = groundPat;
  c.translate(Math.round(gx0), Math.round(gy));
  c.fillRect(0, 0, gx1 - gx0, H - gy + 40);
  c.restore();

  // Ground boundary markers
  c.fillStyle = 'rgba(242, 234, 216, 0.18)';
  const cx0 = (WALL_L - cam.x) * z + W / 2, cx1 = (WALL_R - cam.x) * z + W / 2;
  c.fillRect(cx0, gy + 2, cx1 - cx0, 3);
  c.fillRect(W / 2 - 1.5, gy + 8, 3, 26);

  // Floating dust motes
  for (let i = 0; i < motes.length; i++) {
    const mo = motes[i];
    c.fillStyle = 'rgba(255, 220, 170, ' + (0.12 + 0.1 * Math.sin(time * 1.4 + mo.p)) + ')';
    c.fillRect((mo.x - cam.x) * z + W / 2, mo.y + Math.sin(time + mo.p) * 6, mo.r, mo.r);
  }
}

/* ============ Camera, Announcements & HUD ============ */
function makeCam() {
  return { x: WORLD_W / 2, y: GY - 170, z: 1, tr: 0, sx: 0, sy: 0 };
}

function camUpdate(cam, f1, f2, dt, focus) {
  let tx, ty, tz;
  if (focus) {
    tx = focus.x; ty = GY - 170; tz = 1.35;
  } else {
    const mid = (f1.x + f2.x) / 2, d = Math.abs(f1.x - f2.x);
    tx = mid;
    tz = clamp(W / (d + 430), 0.75, 1.20);
    ty = GY - 160 - Math.max(f1.y, f2.y) * 0.42;
  }
  const vw = W / (2 * cam.z);
  const lo = Math.min(vw + 40, WORLD_W / 2), hi = Math.max(WORLD_W - vw - 40, WORLD_W / 2);
  tx = clamp(tx, lo, hi);

  cam.x += (tx - cam.x) * Math.min(1, dt * 6);
  cam.y += (ty - cam.y) * Math.min(1, dt * 4);
  cam.z += (tz - cam.z) * Math.min(1, dt * 4);
  cam.tr = Math.max(0, cam.tr - dt * 2.2);

  const s = cam.tr * cam.tr * 16;
  cam.sx = rnd(-s, s);
  cam.sy = rnd(-s, s);
}

function announce(text, style, sub) {
  anns.push({ text: text, style: style || 0, sub: sub || '', t: 0 });
  say(text);
  if (game && game.authority && game.online && game.evq) {
    game.evq.push(['an', text, style || 0, sub || '', 0]);
  }
}

function drawAnns(c, rdt) {
  const keep = [];
  for (let i = 0; i < anns.length; i++) {
    const a = anns[i];
    a.t += rdt;
    if (a.t < 1.15) keep.push(a);
  }
  anns = keep;

  for (let i = 0; i < anns.length; i++) {
    const a = anns[i];
    const inK = clamp(a.t / 0.14, 0, 1), sc = EASE.snap(inK) * (1 + Math.max(0, 0.25 - a.t) * 0.6);
    const out = clamp((a.t - 0.90) / 0.24, 0, 1);

    c.save();
    c.translate(W / 2, H * 0.40);
    c.rotate(-0.03);
    c.scale(sc, sc);
    c.globalAlpha = 1 - out;

    // Comic action speedlines on FIGHT / KO
    if (a.style > 0 && a.t < 0.7) {
      c.save();
      c.strokeStyle = a.style === 1 ? 'rgba(224, 58, 36, 0.4)' : 'rgba(255, 180, 46, 0.4)';
      c.lineWidth = 3;
      for (let s = 0; s < 16; s++) {
        const ang = (s / 16) * TAU;
        c.beginPath();
        c.moveTo(Math.cos(ang) * 90, Math.sin(ang) * 90);
        c.lineTo(Math.cos(ang) * 380, Math.sin(ang) * 380);
        c.stroke();
      }
      c.restore();
    }

    c.font = '112px Bangers, cursive';
    c.textAlign = 'center';
    c.lineWidth = 14;
    c.strokeStyle = INKC;
    c.strokeText(a.text, 0, 0);

    c.lineWidth = 6;
    c.strokeStyle = a.style === 1 ? '#e03a24' : (a.style === 2 ? '#ffb42e' : 'rgba(242, 234, 216, 0.6)');
    c.strokeText(a.text, 0, 0);

    c.fillStyle = a.style === 1 ? '#ff6045' : (a.style === 2 ? '#ffcf4d' : PAPER);
    c.fillText(a.text, 0, 0);

    if (a.sub) {
      c.font = '34px Bangers, cursive';
      c.lineWidth = 8;
      c.strokeStyle = INKC;
      c.strokeText(a.sub, 0, 44);
      c.fillStyle = PAPER;
      c.fillText(a.sub, 0, 44);
    }

    c.fillStyle = a.style === 1 ? '#e03a24' : '#ffb42e';
    c.save();
    c.rotate(-0.05);
    const lineW = Math.min(320, 50 * a.text.length);
    c.fillRect(-lineW / 2, 16, lineW, 8);
    c.restore();

    c.restore();
  }
  c.globalAlpha = 1;
}

function drawMatchIntro(c, g, t) {
  if (t < 0 || t > 2.2) return;
  const f0 = g.fighters[0], f1 = g.fighters[1];
  if (!f0 || !f1) return;

  c.save();

  let slideIn = clamp(t / 0.35, 0, 1);
  slideIn = EASE.outBack(slideIn);

  let exit = 0;
  if (t > 1.8) {
    exit = clamp((t - 1.8) / 0.35, 0, 1);
    exit = exit * exit;
  }

  const p1Offset = -W * (1 - slideIn) - W * exit;
  const p2Offset = W * (1 - slideIn) + W * exit;

  c.fillStyle = 'rgba(11, 9, 8, ' + (0.75 * (1 - exit)).toFixed(3) + ')';
  c.fillRect(0, 0, W, H);

  // Player 1 Banner
  c.save();
  c.translate(p1Offset, 0);
  c.beginPath();
  c.moveTo(-50, 0);
  c.lineTo(W * 0.58, 0);
  c.lineTo(W * 0.42, H);
  c.lineTo(-50, H);
  c.closePath();
  c.fillStyle = 'rgba(20, 16, 14, 0.94)';
  c.fill();
  c.strokeStyle = f0.ch.aura;
  c.lineWidth = 5;
  c.stroke();

  c.beginPath();
  c.moveTo(W * 0.58 - 14, 0);
  c.lineTo(W * 0.42 - 14, H);
  c.strokeStyle = f0.ch.aura;
  c.lineWidth = 8;
  c.stroke();

  c.textAlign = 'left';
  c.font = '22px Bangers, cursive';
  c.fillStyle = 'var(--gold)';
  c.fillText('PLAYER 1 · ' + f0.ch.title, 60, H * 0.36);

  c.font = '96px Bangers, cursive';
  c.lineWidth = 14;
  c.strokeStyle = INKC;
  c.strokeText(f0.name, 60, H * 0.49);
  c.fillStyle = f0.ch.aura;
  c.fillText(f0.name, 60, H * 0.49);

  c.font = '700 17px Rajdhani, sans-serif';
  c.fillStyle = PAPER;
  c.fillText(f0.ch.desc, 60, H * 0.54);
  c.restore();

  // Player 2 Banner
  c.save();
  c.translate(p2Offset, 0);
  c.beginPath();
  c.moveTo(W * 0.58, 0);
  c.lineTo(W + 50, 0);
  c.lineTo(W + 50, H);
  c.lineTo(W * 0.42, H);
  c.closePath();
  c.fillStyle = 'rgba(16, 18, 22, 0.94)';
  c.fill();
  c.strokeStyle = f1.ch.aura;
  c.lineWidth = 5;
  c.stroke();

  c.textAlign = 'right';
  c.font = '22px Bangers, cursive';
  c.fillStyle = 'var(--gold)';
  const p2Tag = (g.mode === 'local2p') ? 'PLAYER 2 · ' : 'CHALLENGER · ';
  c.fillText(p2Tag + f1.ch.title, W - 60, H * 0.56);

  c.font = '96px Bangers, cursive';
  c.lineWidth = 14;
  c.strokeStyle = INKC;
  c.strokeText(f1.name, W - 60, H * 0.69);
  c.fillStyle = f1.ch.aura;
  c.fillText(f1.name, W - 60, H * 0.69);

  c.font = '700 17px Rajdhani, sans-serif';
  c.fillStyle = PAPER;
  c.fillText(f1.ch.desc, W - 60, H * 0.74);
  c.restore();

  // Center "VS" Emblem
  if (slideIn > 0.4 && exit < 0.9) {
    const vsT = clamp((t - 0.25) / 0.25, 0, 1);
    const vsScale = EASE.outBack(vsT) * (1 + 0.04 * Math.sin(t * 12));
    const vsAlpha = clamp(1 - exit * 1.5, 0, 1);

    c.save();
    c.translate(W / 2, H / 2);
    c.scale(vsScale, vsScale);
    c.globalAlpha = vsAlpha;

    c.beginPath();
    c.arc(0, 0, 68, 0, TAU);
    c.fillStyle = 'rgba(224, 58, 36, 0.92)';
    c.fill();
    c.strokeStyle = PAPER;
    c.lineWidth = 5;
    c.stroke();

    c.beginPath();
    c.arc(0, 0, 78, 0, TAU);
    c.strokeStyle = 'rgba(20, 17, 16, 0.6)';
    c.lineWidth = 4;
    c.stroke();

    c.font = '76px Bangers, cursive';
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.lineWidth = 10;
    c.strokeStyle = INKC;
    c.strokeText('VS', 0, 4);
    c.fillStyle = PAPER;
    c.fillText('VS', 0, 4);
    c.restore();
  }

  c.restore();
}

function drawSuperFreeze(c, g) {
  if (!g.superFreeze || g.superFreeze.t <= 0) return;
  const f = g.superFreeze.f;
  if (!f) return;
  const alpha = clamp(g.superFreeze.t / 0.45, 0, 1);

  c.save();
  const grad = c.createRadialGradient(W / 2, H / 2, 80, W / 2, H / 2, W * 0.7);
  grad.addColorStop(0, 'rgba(0, 0, 0, 0.15)');
  grad.addColorStop(1, 'rgba(10, 8, 7, ' + (0.85 * alpha).toFixed(3) + ')');
  c.fillStyle = grad;
  c.fillRect(0, 0, W, H);

  c.strokeStyle = f.ch.aura;
  c.lineWidth = 2;
  c.globalAlpha = 0.35 * alpha;
  for (let i = 0; i < 16; i++) {
    const ang = (i / 16) * TAU + (performance.now() / 300);
    c.beginPath();
    c.moveTo(W / 2 + Math.cos(ang) * (W * 0.25), H / 2 + Math.sin(ang) * (H * 0.25));
    c.lineTo(W / 2 + Math.cos(ang) * W, H / 2 + Math.sin(ang) * H);
    c.stroke();
  }

  c.globalAlpha = alpha;
  c.font = '64px Bangers, cursive';
  c.textAlign = 'center';
  c.lineWidth = 9;
  c.strokeStyle = INKC;
  const superName = f.ch.sp ? f.ch.sp[2] : 'SUPER ART';
  c.strokeText(f.name + ' · ' + superName, W / 2, 110);
  c.fillStyle = f.ch.aura;
  c.fillText(f.name + ' · ' + superName, W / 2, 110);
  c.restore();
}

function drawHUD(c, g) {
  const fs = g.fighters;

  for (let s = 0; s < 2; s++) {
    const fi = fs[s], side = s;
    const bw = 500, bh = 24, y = 30, sg = side === 0 ? 1 : -1;
    const ax = side === 0 ? 38 : W - 38;

    function bar(w) {
      c.beginPath();
      c.moveTo(ax, y);
      c.lineTo(ax + sg * w, y);
      c.lineTo(ax + sg * (w - 16), y + bh);
      c.lineTo(ax - sg * 16, y + bh);
      c.closePath();
    }

    // Health bar container & display
    bar(bw + 8);
    c.fillStyle = '#0e0b09';
    c.fill();
    c.strokeStyle = PAPER;
    c.lineWidth = 3;
    c.stroke();

    bar(bw * clamp(fi.dispHp / 100, 0, 1));
    c.fillStyle = '#a33526';
    c.fill();

    bar(bw * clamp(fi.hp / 100, 0, 1));
    c.fillStyle = '#ffcf4d';
    c.fill();

    // Name & slot
    c.font = '26px Bangers, cursive';
    c.fillStyle = PAPER;
    c.textAlign = side === 0 ? 'left' : 'right';
    const tag = (g.mode === 'local2p') ? (side === 0 ? ' · P1 (WASD)' : ' · P2 (ARROWS)') : (side === 0 ? ' · P1' : ' · CPU');
    c.fillText(fi.name + tag, side === 0 ? ax + 8 : ax - 8, y + bh + 26);

    // Round win orbs
    for (let i = 0; i < 2; i++) {
      const ppx = ax + sg * (bw - 12 - i * 24);
      c.beginPath();
      c.arc(ppx, y + bh + 18, 8, 0, TAU);
      c.fillStyle = g.wins[side] > i ? fi.ch.aura : '#241f1a';
      c.fill();
      c.strokeStyle = PAPER;
      c.lineWidth = 2;
      c.stroke();
    }

    // Super Meter (4 segments)
    const my = H - 34, mw = 360, mx = side === 0 ? 38 : W - 38 - mw;
    for (let i = 0; i < 4; i++) {
      const seg = clamp(fi.meter / 25 - i, 0, 1);
      c.fillStyle = '#241f1a';
      c.fillRect(mx + i * (mw / 4 + 4), my, mw / 4, 12);
      if (seg > 0) {
        c.fillStyle = (fi.meter >= 99.5 && Math.sin(performance.now() / 130) > 0) ? '#ffffff' : fi.ch.aura;
        c.fillRect(mx + i * (mw / 4 + 4), my, (mw / 4) * seg, 12);
      }
      c.strokeStyle = 'rgba(242, 234, 216, 0.4)';
      c.lineWidth = 1.5;
      c.strokeRect(mx + i * (mw / 4 + 4), my, mw / 4, 12);
    }

    if (fi.meter >= 99.5) {
      c.font = '20px Bangers, cursive';
      c.fillStyle = fi.ch.aura;
      c.textAlign = side === 0 ? 'left' : 'right';
      c.fillText('SUPER READY', side === 0 ? mx : mx + mw, my - 6);
    }

    // Combo hit counter
    if (fi.comboN > 1 && fi.comboT > 0) {
      const pop = clamp((1.4 - fi.comboT) / 0.12, 0, 1);
      c.save();
      c.translate(side === 0 ? 120 : W - 120, 150);
      c.scale(0.7 + pop * 0.45, 0.7 + pop * 0.45);
      c.rotate(side === 0 ? -0.05 : 0.05);
      c.globalAlpha = clamp(fi.comboT * 3, 0, 1);
      c.font = '52px Bangers, cursive';
      c.textAlign = 'center';
      c.lineWidth = 9;
      c.strokeStyle = INKC;
      c.strokeText(fi.comboN + ' HITS', 0, 0);
      c.fillStyle = fi.ch.aura;
      c.fillText(fi.comboN + ' HITS', 0, 0);
      c.restore();
      c.globalAlpha = 1;
    }
  }

  // Timer
  const t = Math.max(0, Math.ceil(g.timer));
  c.save();
  c.translate(W / 2, 30);
  c.beginPath();
  c.moveTo(-46, 0); c.lineTo(46, 0); c.lineTo(34, 52); c.lineTo(-34, 52);
  c.closePath();
  c.fillStyle = '#0e0b09'; c.fill();
  c.strokeStyle = PAPER; c.lineWidth = 3; c.stroke();
  c.font = '46px Bangers, cursive';
  c.textAlign = 'center';
  c.fillStyle = t <= 10 ? '#e03a24' : PAPER;
  c.fillText(g.training ? '∞' : t, 0, 42);
  c.restore();

  // Round description banner
  c.font = '700 16px Rajdhani, sans-serif';
  c.fillStyle = 'rgba(242, 234, 216, 0.7)';
  c.textAlign = 'center';
  c.fillText(g.training ? 'TRAINING DOJO' : (g.roundTitle || ('ROUND ' + g.round)), W / 2, 92);

  // Network stats badge
  if (net && net.up) {
    c.textAlign = 'right';
    c.fillStyle = 'rgba(242, 234, 216, 0.65)';
    const pingStr = net.ping != null ? (net.ping + 'ms') : '--';
    c.fillText((net.mode === 'p2p' ? 'DIRECT P2P · ' : 'RELAY · ') + net.code + ' · ' + pingStr, W - 64, 24);
  }

  // Low HP danger vignette
  const mySide = (g.mode === 'guest') ? 1 : 0;
  const me = g.fighters[mySide];
  if (me && me.hp > 0 && me.hp < 25) {
    const a = 0.22 + 0.18 * Math.sin(performance.now() / 200);
    c.fillStyle = 'rgba(224, 58, 36, ' + a.toFixed(3) + ')';
    c.fillRect(0, 0, W, 5); c.fillRect(0, H - 5, W, 5);
    c.fillRect(0, 0, 5, H); c.fillRect(W - 5, 0, 5, H);
  }
}

/* ============ Viewport & Canvas Render Loop ============ */
const cv = document.getElementById('cv');
const RS = Math.min(2, Math.max(1, window.devicePixelRatio || 1));
cv.width = Math.round(W * RS);
cv.height = Math.round(H * RS);
const ctx = cv.getContext('2d', {
  alpha: false,
  desynchronized: true
});

function fit() {
  const vp = window.visualViewport;
  const ww = vp ? vp.width : window.innerWidth;
  const wh = vp ? vp.height : window.innerHeight;
  const s = Math.min(ww / W, wh / H);
  cv.style.width = Math.floor(W * s) + 'px';
  cv.style.height = Math.floor(H * s) + 'px';
}
if (window.visualViewport) {
  window.visualViewport.addEventListener('resize', fit);
  window.visualViewport.addEventListener('scroll', fit);
}
addEventListener('resize', fit);
addEventListener('orientationchange', () => {
  setTimeout(fit, 80);
  setTimeout(fit, 320);
});
fit();

if (document.fonts && document.fonts.load) document.fonts.load('80px Bangers');

function camApply(c, cam) {
  const z = cam.z;
  c.setTransform(RS * z, 0, 0, RS * z, W / 2 * RS - cam.x * z * RS + cam.sx * RS, H * 0.56 * RS - cam.y * z * RS + cam.sy * RS);
}

function render(rdt) {
  const g = game;
  ctx.setTransform(RS, 0, 0, RS, 0, 0);
  ctx.fillStyle = '#0b0908';
  ctx.fillRect(0, 0, W, H);
  if (!g) return;

  const time = performance.now() / 1000;
  if (g.mode === 'guest') {
    guestInterp();
    updateParts(rdt);
    g.flash = Math.max(0, g.flash - rdt * 2.2);
  }

  drawStage(ctx, g.cam, time);
  camApply(ctx, g.cam);

  // Render projectiles
  for (let i = 0; i < g.projectiles.length; i++) {
    const pr = g.projectiles[i];
    ctx.globalAlpha = 0.90;
    ctx.fillStyle = pr.aura;
    ctx.beginPath();
    ctx.arc(pr.x, pr.y, pr.r * 0.8, 0, TAU);
    ctx.fill();

    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(pr.x, pr.y, pr.r * 0.42, 0, TAU);
    ctx.fill();

    ctx.strokeStyle = pr.aura;
    ctx.lineWidth = 2.4;
    ctx.globalAlpha = 0.55;
    ctx.beginPath();
    ctx.arc(pr.x, pr.y, pr.r * 1.25 + Math.sin(time * 20) * 2, 0, TAU);
    ctx.stroke();
    ctx.globalAlpha = 1;
  }

  // Render fighters
  for (let i = 0; i < 2; i++) {
    const f = g.fighters[i];
    drawExtras(ctx, f);
    drawFighterFull(ctx, f);

    if (g.phase === 'intro' && g.phT < 1.6) {
      ctx.font = '700 15px Rajdhani, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillStyle = f.ch.aura;
      ctx.fillText(f.name, f.x, GY - f.y - f.pose.hy - 150);
    }
  }

  drawParts(ctx);

  // Reset transform to screen space for HUD & UI
  ctx.setTransform(RS, 0, 0, RS, 0, 0);

  if (!g.attract) {
    drawHUD(ctx, g);
    ctx.fillStyle = 'rgba(0, 0, 0, 0.28)';
    ctx.fillRect(0, 0, W, 26);
    ctx.fillRect(0, H - 26, W, 26);

    // Cinematic Match Intro
    if (g.phase === 'intro') {
      drawMatchIntro(ctx, g, g.phT);
    }
  } else {
    ctx.fillStyle = 'rgba(12, 10, 8, 0.35)';
    ctx.fillRect(0, 0, W, H);
  }

  // Super move freeze overlay
  if (g.superFreeze && g.superFreeze.t > 0) {
    drawSuperFreeze(ctx, g);
  }

  if (g.flash > 0) {
    ctx.fillStyle = 'rgba(255, 250, 240, ' + g.flash + ')';
    ctx.fillRect(0, 0, W, H);
  }

  drawAnns(ctx, rdt);
}

let last = performance.now();
let framesDrawn = 0;

function frame(now) {
  const rdt = Math.min(0.033, (now - last) / 1000);
  last = now;

  try {
    const g = game;
    if (g) {
      if (g.superFreeze && g.superFreeze.t > 0) {
        g.superFreeze.t -= rdt;
      }
      if (g.authority) {
        let eff = rdt;
        if (g.slowT > 0) {
          g.slowT -= rdt;
          eff *= g.slowF;
        }
        if (g.hitstop > 0) {
          g.hitstop -= rdt;
          eff = 0;
        }
        gameStep(eff);
        camUpdate(g.cam, g.fighters[0], g.fighters[1], rdt, (g.phase === 'ko') ? g.koFocus : null);

        if (g.online && net && net.up) {
          g.snapAcc += rdt;
          // Send snapshots at full 60 FPS (16.6ms) for buttery smooth local Wi-Fi duels
          while (g.snapAcc >= 0.0166) {
            g.snapAcc -= 0.0166;
            netSend(buildSnap());
            g.evq = [];
          }
          g.pingAcc += rdt;
          if (g.pingAcc > 1.0) {
            g.pingAcc = 0;
            netSend({ t: 'ping', ts: performance.now() });
          }
        } else {
          g.evq = [];
        }
      } else if (g.mode === 'guest') {
        if (net && net.up) guestSendInput();
        g.pingAcc += rdt;
        if (g.pingAcc > 1.0 && net) {
          g.pingAcc = 0;
          netSend({ t: 'ping', ts: performance.now() });
        }
        let kofoc = null;
        if (g.phase === 'ko') kofoc = (g.fighters[0].hp <= 0) ? g.fighters[0] : g.fighters[1];
        camUpdate(g.cam, g.fighters[0], g.fighters[1], rdt, kofoc);
      }

      if (net && net.up && g.online && net.lastMsg && performance.now() - net.lastMsg > 9500) {
        toast('OPPONENT DISCONNECTED');
        leaveToTitle();
      }
    }
  } catch (e) {
    console.error("Game loop error:", e);
  }

  try {
    render(rdt);
    framesDrawn++;
  } catch (e) {
    console.error("Render error:", e);
  }

  try {
    musicTick();
  } catch (e) {}

  requestAnimationFrame(frame);
}

/* ============ Menu Navigation & UI ============ */
function $(id) {
  return document.getElementById(id);
}

function showScreen(id) {
  const sc = document.querySelectorAll('.scr');
  for (let i = 0; i < sc.length; i++) {
    sc[i].hidden = (sc[i].id !== id);
  }
}

function toast(msg) {
  const t = document.createElement('div');
  t.className = 'toast';
  t.textContent = msg;
  const container = $('toasts');
  if (container) {
    container.appendChild(t);
    setTimeout(() => { if (t.parentNode) t.parentNode.removeChild(t); }, 2600);
  }
}

function destroyGameUI() {
  showScreen('');
  const rws = $('roundWinSplash');
  if (rws) rws.hidden = true;
  const tui = $('touchUI');
  if (tui) tui.classList.toggle('on', isTouch);
}

function leaveToTitle() {
  destroyGameUI();
  teardownNet();
  startAttract();
  showScreen('scrTitle');
  const tui = $('touchUI');
  if (tui) tui.classList.remove('on');
}

function startAttract() {
  createGame({ mode: 'attract', chars: [Math.random() * 4 | 0, Math.random() * 4 | 0] });
}

function onEsc() {
  const g = game;
  if (!g || g.attract) return;
  if (!$('scrEnd').hidden) return;

  if (g.mode === 'cpu' || g.mode === 'local2p' || g.mode === 'dojo') {
    g.paused = !g.paused;
    $('scrPause').hidden = !g.paused;
  } else if (g.online) {
    $('scrLeave').hidden = false;
  }
}

/* ============ Victory Presentation & Announcements ============ */
const winImg = new Image();
winImg.src = 'assets/victory.png';

let roundWinTimer = null;
function showRoundWin(w, g) {
  const splash = $('roundWinSplash');
  if (!splash || !w || !g) return;

  const titleEl = $('roundWinTitle');
  const subEl = $('roundWinSub');
  const imgEl = $('roundWinImg');

  if (titleEl) {
    titleEl.textContent = `${w.name} WINS ROUND ${g.round}!`;
    titleEl.style.color = w.ch.aura;
  }
  if (subEl) {
    const perfect = w.hp >= 99.5;
    subEl.textContent = perfect ? 'PERFECT VICTORY!' : `${w.ch.title} DOMINATES`;
  }
  if (imgEl) {
    imgEl.style.animation = 'none';
    void imgEl.offsetWidth;
    imgEl.style.animation = '';
  }

  splash.hidden = false;
  sfx('ok');
  if (window.haptic) window.haptic([80, 40, 140]);

  if (roundWinTimer) clearTimeout(roundWinTimer);
  roundWinTimer = setTimeout(() => {
    splash.hidden = true;
  }, 1800);
}
window.showRoundWin = showRoundWin;

function showEnd(g, isDojoFinish) {
  const splash = $('roundWinSplash');
  if (splash) splash.hidden = true;
  if (roundWinTimer) { clearTimeout(roundWinTimer); roundWinTimer = null; }

  const wSlot = (g.wins[0] >= g.wins[1]) ? 0 : 1;
  const winner = g.fighters[wSlot];

  const winHero = $('winHeroImg');
  if (winHero) {
    winHero.style.animation = 'none';
    void winHero.offsetWidth; // trigger reflow
    winHero.style.animation = '';
  }

  const auraBg = $('winAuraBg');
  if (auraBg && winner.ch) {
    auraBg.style.background = `radial-gradient(ellipse at center, ${winner.ch.aura}88 0%, rgba(255, 180, 46, 0.4) 42%, rgba(0, 0, 0, 0) 70%)`;
  }

  const endTitle = $('endTitle');
  if (endTitle) {
    if (isDojoFinish) {
      endTitle.textContent = winner.name + ' MASTERED THE DOJO!';
    } else {
      endTitle.textContent = winner.name + ' VICTORIOUS!';
    }
    endTitle.style.color = winner.ch.aura;
  }

  const endSub = $('endSub');
  if (endSub) {
    if (isDojoFinish) {
      endSub.textContent = 'TRAINING DOJO COMPLETED · TRUE MASTER';
    } else {
      endSub.textContent = g.fighters[0].name + ' ' + g.wins[0] + ' — ' + g.wins[1] + ' ' + g.fighters[1].name;
    }
  }

  const statsRow = $('endStats');
  if (statsRow) {
    const maxCombo = Math.max(winner.comboMax || winner.comboN || 0, 3);
    const roundStr = isDojoFinish ? 'DOJO SESSION' : `ROUNDS: ${g.wins[0] + g.wins[1]}`;
    statsRow.innerHTML = `
      <span class="stat-badge"><b>MODE:</b> ${g.mode.toUpperCase()}</span>
      <span class="stat-badge"><b>${roundStr}</b></span>
      <span class="stat-badge"><b>BEST COMBO:</b> ${maxCombo} HITS</span>
    `;
  }

  const old = $('guestWait');
  if (old && old.parentNode) old.parentNode.removeChild(old);

  const guest = (g.mode === 'guest');
  $('btnRematch').hidden = guest;
  $('btnToSelect').hidden = guest;
  $('btnToMenu').hidden = guest;

  if (guest) {
    const d = document.createElement('div');
    d.className = 'pulse';
    d.id = 'guestWait';
    d.style.cssText = 'font-family:Bangers;font-size:22px;letter-spacing:.1em;color:var(--gold);margin-top:6px';
    d.textContent = 'WAITING FOR HOST REMATCH…';
    $('endBtns').appendChild(d);
  }

  showScreen('scrEnd');
  const tui = $('touchUI');
  if (tui) tui.classList.remove('on');

  sfx('ok');
  if (window.haptic) window.haptic([100, 50, 150, 50, 300]);
  say(winner.name + ' wins the match! A true champion!');
}
window.showEnd = showEnd;

/* ============ Character Select Screen ============ */
let sel = { mode: 'cpu', my: 0, ready: false, rem: -1, remReady: false, diff: 1, name: '', remName: '' };

function myName() {
  return saneName(sel.name) || CHARS[sel.my].name;
}

function selSetup(mode) {
  sel = {
    mode: mode,
    my: sel.my || 0,
    ready: false,
    rem: (mode === 'local2p' ? 1 : -1),
    remReady: false,
    diff: sel.diff,
    name: sel.name || '',
    remName: ''
  };

  buildSelGrid();
  $('diffRow').style.display = (mode === 'cpu') ? 'flex' : 'none';
  $('btnReady').textContent = (mode === 'cpu' || mode === 'local2p' || mode === 'dojo') ? 'FIGHT!' : 'READY';
  $('btnReady').style.background = '';
  $('btnReady').style.color = '';
  $('btnSelBack').hidden = (mode === 'guest');
  $('selStatus').textContent = '';

  const ni = $('nameInput');
  if (ni) {
    ni.value = sel.name;
    ni.placeholder = CHARS[sel.my].name;
  }
  updateSelUI();

  // Continual selection broadcast while in online character select
  if (net && (mode === 'host' || mode === 'guest')) {
    if (net.selTimer) clearInterval(net.selTimer);
    const broadcastSel = () => {
      if (net && net.up && (!game || game.phase !== 'fight')) {
        netSend({ t: 'sel', i: sel.my, r: sel.ready, name: myName() });
      }
    };
    broadcastSel();
    net.selTimer = setInterval(broadcastSel, 350);
  }
}

function buildSelGrid() {
  const grid = $('selGrid');
  if (!grid) return;
  grid.innerHTML = '';

  for (let i = 0; i < CHARS.length; i++) {
    const ch = CHARS[i];
    const t = document.createElement('div');
    t.className = 'tile';

    const pc = document.createElement('canvas');
    pc.width = 142;
    pc.height = 148;
    t.appendChild(pc);

    const nm = document.createElement('div');
    nm.className = 'nm';
    nm.textContent = ch.name;
    nm.style.color = ch.aura;
    t.appendChild(nm);

    const tt = document.createElement('div');
    tt.className = 'tt';
    tt.textContent = ch.title;
    t.appendChild(tt);

    t.onclick = () => {
      sfx('ui');
      if (sel.mode === 'local2p') {
        // Toggle selection between P1 and P2
        if (sel.my !== i) {
          sel.my = i;
        } else {
          sel.rem = (sel.rem + 1) % CHARS.length;
        }
      } else {
        sel.my = i;
        if (sel.mode !== 'cpu' && sel.mode !== 'dojo') {
          sel.ready = false;
          netSend({ t: 'sel', i: i, ready: false, name: myName(), tok: net ? net.tok : null });
        }
      }
      updateSelUI();
    };

    grid.appendChild(t);

    // Draw preview stick figure in character select tile
    const c2 = pc.getContext('2d');
    c2.fillStyle = '#100d0b';
    c2.fillRect(0, 0, 142, 148);
    c2.fillStyle = ch.aura;
    c2.globalAlpha = 0.10;
    c2.beginPath();
    c2.arc(71, 78, 58, 0, TAU);
    c2.fill();
    c2.globalAlpha = 1;

    c2.save();
    c2.translate(0, 12);
    c2.scale(0.75, 0.75);
    const sk = skelFor(STANCE, 71, 95, 1);
    drawFigure(c2, sk, ch, null);
    c2.restore();
  }

  const difs = document.querySelectorAll('.dif');
  for (let i = 0; i < difs.length; i++) {
    difs[i].onclick = function() {
      sfx('ui');
      sel.diff = +this.getAttribute('data-d');
      updateSelUI();
    };
  }
}

function updateSelUI() {
  const tiles = document.querySelectorAll('.tile');
  for (let i = 0; i < tiles.length; i++) {
    const t = tiles[i];
    t.classList.toggle('sel0', i === sel.my);
    t.classList.toggle('sel1', i === sel.rem);
    t.classList.toggle('selB', (sel.mode === 'cpu' || sel.mode === 'dojo') && i === sel.my);

    const tgs = t.querySelectorAll('.tg');
    for (let j = 0; j < tgs.length; j++) t.removeChild(tgs[j]);

    if (i === sel.my) {
      const tg = document.createElement('div');
      tg.className = 'tg you';
      tg.textContent = (sel.mode === 'local2p') ? 'P1' : 'YOU';
      t.appendChild(tg);
    }
    if (i === sel.rem) {
      const tg = document.createElement('div');
      tg.className = 'tg foe';
      tg.textContent = (sel.mode === 'local2p') ? 'P2' : 'RIVAL';
      t.appendChild(tg);
    }
  }

  const difs = document.querySelectorAll('.dif');
  for (let i = 0; i < difs.length; i++) {
    difs[i].style.borderColor = (+difs[i].getAttribute('data-d') === sel.diff) ? 'var(--red)' : '';
  }

  const ni = $('nameInput');
  if (ni) ni.placeholder = CHARS[sel.my].name;

  const ch = CHARS[sel.my];
  const st = v => clamp((v - 0.8) / 0.55, 0, 1) * 100;
  const rival = saneName(sel.remName) || ((sel.rem >= 0) ? CHARS[sel.rem].name : '—');

  $('selInfo').innerHTML =
    '<div style="display:flex;gap:20px;align-items:center;justify-content:center">' +
    '<div style="font-family:Bangers;font-size:28px;color:' + ch.aura + ';transform:rotate(-2deg)">' + ch.name + '</div>' +
    '<div style="text-align:left;flex:1;max-width:220px">' +
    '<div class="stat"><b>PWR</b><div class="bar"><i style="width:' + st(ch.pow) + '%"></i></div></div>' +
    '<div class="stat"><b>SPD</b><div class="bar"><i style="width:' + clamp((ch.spd - 0.8) / 0.4, 0, 1) * 100 + '%"></i></div></div>' +
    '<div class="stat"><b>JMP</b><div class="bar"><i style="width:' + clamp((ch.jmp - 0.8) / 0.45, 0, 1) * 100 + '%"></i></div></div>' +
    '</div></div>' +
    '<div class="small" style="margin-top:8px">' + ch.sp[0] + ' · ' + ch.sp[1] + ' · <span style="color:' + ch.aura + '">' + ch.sp[2] + '</span></div>' +
    '<div class="small" style="margin-top:4px;opacity:0.85">' + ch.desc + '</div>' +
    (sel.mode !== 'cpu' && sel.mode !== 'dojo' ? '<div class="small" style="margin-top:6px;color:var(--blue)">VS ' + rival + '</div>' : '');

  if (sel.mode !== 'cpu' && sel.mode !== 'local2p' && sel.mode !== 'dojo') {
    $('btnReady').style.background = sel.ready ? 'var(--paper)' : '';
    $('btnReady').style.color = sel.ready ? 'var(--ink)' : '';
    $('selStatus').textContent = (sel.ready && sel.remReady) ? 'STARTING…' : (sel.remReady ? 'RIVAL IS READY' : (net && net.up ? 'CONNECTED' : ''));
  }
}

function selRemote(i, ready, name) {
  sel.rem = i;
  sel.remReady = !!ready;
  if (name !== undefined && name !== '') sel.remName = saneName(name);
  updateSelUI();
  if (net && net.role === 'host' && sel.ready && sel.remReady) hostLaunch();
}

let hostLaunchT = null;
function hostLaunch() {
  if (hostLaunchT) return;
  if (net && net.selTimer) {
    clearInterval(net.selTimer);
    net.selTimer = null;
  }
  $('selStatus').textContent = 'STARTING MATCH…';
  hostLaunchT = setTimeout(() => {
    hostLaunchT = null;
    const chars = [sel.my, (sel.rem >= 0) ? sel.rem : 0];
    const names = [myName(), saneName(sel.remName) || CHARS[chars[1]].name];
    // Send multiple start packets to guarantee delivery without drops
    netSend({ t: 'start', chars: chars, names: names });
    setTimeout(() => netSend({ t: 'start', chars: chars, names: names }), 80);
    setTimeout(() => netSend({ t: 'start', chars: chars, names: names }), 180);
    sfx('ok');
    destroyGameUI();
    createGame({ mode: 'host', chars: chars, names: names });
  }, 500);
}

/* ============ Button & UI Event Bindings ============ */
$('btnQuickMatch').onclick = () => {
  sfx('ui');
  showScreen('scrMatchmaking');
  $('matchmakingStatus').textContent = 'SEARCHING FOR OPPONENT…';
  quickMatch(
    status => {
      const ms = $('matchmakingStatus');
      if (ms) ms.textContent = status;
    },
    err => {
      toast(err);
      showScreen('scrTitle');
    }
  );
};

$('btnCancelMatchmaking').onclick = () => {
  sfx('ui');
  teardownNet();
  showScreen('scrTitle');
};
$('nameInput').addEventListener('input', function() {
  const v = this.value.replace(/[^A-Za-z0-9 _.\-]/g, '').slice(0, 12);
  if (v !== this.value) this.value = v;
  sel.name = saneName(this.value);
  if (sel.mode !== 'cpu' && sel.mode !== 'local2p' && sel.mode !== 'dojo' && net && net.up) {
    netSend({ t: 'sel', i: sel.my, ready: sel.ready, name: myName(), tok: net.tok });
  }
});
$('nameInput').addEventListener('keydown', e => e.stopPropagation());

$('btnCpu').onclick = () => {
  sfx('ui');
  showScreen('scrSelect');
  selSetup('cpu');
};

$('btnLocal2p').onclick = () => {
  sfx('ui');
  showScreen('scrSelect');
  selSetup('local2p');
};

$('btnDojo').onclick = () => {
  sfx('ui');
  showScreen('scrSelect');
  selSetup('dojo');
};

$('btnHost').onclick = () => {
  sfx('ui');
  showScreen('scrHost');
  $('hostCode').textContent = '····';
  $('hostStatus').textContent = 'CONNECTING…';
  const urlBox = $('hostWifiUrl');
  if (urlBox) urlBox.textContent = 'Generating Wi-Fi link…';

  hostRoom(
    code => {
      $('hostCode').textContent = code;
      $('hostStatus').textContent = 'WAITING FOR CHALLENGER…';

      function setupJoinLink(joinUrl) {
        if (urlBox) urlBox.textContent = joinUrl;
        if (window.renderQR) {
          window.renderQR(joinUrl, document.getElementById('hostQr'));
        }
        const copyBtn = $('btnCopyWifiLink');
        if (copyBtn) {
          copyBtn.onclick = () => {
            sfx('ok');
            if (navigator.clipboard) {
              navigator.clipboard.writeText(joinUrl).then(() => toast('LINK COPIED TO CLIPBOARD!'));
            } else {
              toast('OPEN: ' + joinUrl);
            }
          };
        }
      }

      // If running locally on Node server.js, fetch LAN IP for local Wi-Fi pairing
      if (window.isLocalHost && window.isLocalHost()) {
        fetch('/api/info')
          .then(r => r.json())
          .then(info => {
            const primaryIp = info.primaryIp || location.hostname;
            const port = info.port || location.port || 8080;
            const joinUrl = `${location.protocol}//${primaryIp}:${port}?join=${code}`;
            setupJoinLink(joinUrl);
          })
          .catch(() => {
            const fallbackUrl = `${location.origin}${location.pathname}?join=${code}`;
            setupJoinLink(fallbackUrl);
          });
      } else {
        // Cloudflare / Internet host - use direct public URL
        const cloudUrl = `${location.origin}${location.pathname}?join=${code}`;
        setupJoinLink(cloudUrl);
      }
    },
    err => {
      toast(err);
      showScreen('scrTitle');
    }
  );
};

$('btnJoin').onclick = () => {
  sfx('ui');
  showScreen('scrJoin');
  $('joinErr').textContent = '';
  $('joinInput').value = '';
  $('joinInput').focus();
};

$('btnHow').onclick = () => { sfx('ui'); showScreen('scrHow'); };
$('btnHowBack').onclick = () => { sfx('ui'); showScreen('scrTitle'); };
$('btnHostCancel').onclick = () => { sfx('ui'); teardownNet(); showScreen('scrTitle'); };

function joinGo() {
  const code = $('joinInput').value.trim().toUpperCase();
  if (code.length !== 4) {
    $('joinErr').textContent = 'Enter the full 4-letter code.';
    return;
  }
  $('joinErr').textContent = 'Connecting…';
  joinRoom(code, err => {
    $('joinErr').textContent = err;
  });
}

$('btnJoinGo').onclick = joinGo;
$('joinInput').addEventListener('keydown', e => {
  if (e.key === 'Enter') joinGo();
  e.stopPropagation();
});
$('joinInput').addEventListener('input', function() {
  this.value = this.value.toUpperCase().replace(/[^A-Z0-9]/g, '');
});

$('btnJoinCancel').onclick = () => { sfx('ui'); teardownNet(); showScreen('scrTitle'); };
$('btnResume').onclick = () => { if (game) game.paused = false; $('scrPause').hidden = true; };
$('btnQuit').onclick = () => {
  game = null;
  $('scrPause').hidden = true;
  startAttract();
  showScreen('scrTitle');
  const tui = $('touchUI');
  if (tui) tui.classList.remove('on');
};

$('btnLeaveYes').onclick = () => {
  if (net) netSend({ t: 'bye', tok: net.tok });
  $('scrLeave').hidden = true;
  leaveToTitle();
};
$('btnLeaveNo').onclick = () => { $('scrLeave').hidden = true; };
$('sndBtn').onclick = () => { audioInit(); setMute(!muted); };

$('btnRematch').onclick = () => {
  sfx('ok');
  const mode = game.mode, chars = game.chars, names = game.names, diff = game.cpuDiff;
  if (mode === 'host') netSend({ t: 'start', chars: chars, names: names });
  destroyGameUI();
  createGame({ mode: mode, chars: chars, names: names, diff: diff });
};

$('btnToSelect').onclick = () => {
  sfx('ui');
  const mode = game ? game.mode : 'cpu';
  if (mode === 'host') netSend({ t: 'endchoice', a: 'select' });
  destroyGameUI();
  showScreen('scrSelect');
  selSetup(mode);
  game = null;
  startAttract();
};

$('btnToMenu').onclick = () => {
  sfx('ui');
  if (game && game.mode === 'host') netSend({ t: 'endchoice', a: 'menu' });
  leaveToTitle();
};

$('btnReady').onclick = () => {
  sfx('ok');
  if (sel.mode === 'cpu') {
    destroyGameUI();
    createGame({ mode: 'cpu', chars: [sel.my, Math.random() * 4 | 0], diff: sel.diff, names: [myName(), ''] });
    return;
  }
  if (sel.mode === 'local2p') {
    destroyGameUI();
    createGame({ mode: 'local2p', chars: [sel.my, (sel.rem >= 0 ? sel.rem : 1)], names: [myName(), CHARS[sel.rem >= 0 ? sel.rem : 1].name] });
    return;
  }
  if (sel.mode === 'dojo') {
    destroyGameUI();
    createGame({ mode: 'dojo', chars: [sel.my, 0], names: [myName(), 'TRAINING DUMMY'] });
    return;
  }

  sel.ready = !sel.ready;
  netSend({ t: 'sel', i: sel.my, ready: sel.ready, name: myName(), tok: net ? net.tok : null });
  updateSelUI();
  if (net && net.role === 'host' && sel.ready && sel.remReady) hostLaunch();
};

$('btnSelBack').onclick = () => {
  sfx('ui');
  if (net && net.role === 'host') netSend({ t: 'bye' });
  teardownNet();
  showScreen('scrTitle');
  game = null;
  startAttract();
};

/* ============ Initialization ============ */
requestAnimationFrame(frame);

try {
  buildStage();
  startAttract();
} catch (e) {
  console.error('Stage build error:', e);
}

/* ============ Fullscreen, Screen Orientation & Wake Lock Setup ============ */
let wakeLock = null;
async function acquireWakeLock() {
  if ('wakeLock' in navigator && document.visibilityState === 'visible') {
    try {
      wakeLock = await navigator.wakeLock.request('screen');
      wakeLock.addEventListener('release', () => { wakeLock = null; });
    } catch (err) {}
  }
}

function setupFullscreen() {
  const fsBtn = $('fsBtn');
  const rotateFs = $('btnRotateFs');

  async function enterLandscapeFs() {
    sfx('ui');
    if (window.haptic) window.haptic('light');
    const docEl = document.documentElement;
    try {
      if (!document.fullscreenElement && !document.webkitFullscreenElement) {
        if (docEl.requestFullscreen) await docEl.requestFullscreen();
        else if (docEl.webkitRequestFullscreen) await docEl.webkitRequestFullscreen();
      }
      if (screen.orientation && screen.orientation.lock) {
        await screen.orientation.lock('landscape').catch(() => {});
      }
      acquireWakeLock();
    } catch (e) {}
    fit();
  }

  function toggleFs() {
    if (!document.fullscreenElement && !document.webkitFullscreenElement) {
      enterLandscapeFs();
    } else {
      sfx('ui');
      if (window.haptic) window.haptic('light');
      if (document.exitFullscreen) document.exitFullscreen().catch(() => {});
      else if (document.webkitExitFullscreen) document.webkitExitFullscreen().catch(() => {});
      if (screen.orientation && screen.orientation.unlock) {
        screen.orientation.unlock();
      }
    }
  }

  if (fsBtn) fsBtn.onclick = toggleFs;
  if (rotateFs) rotateFs.onclick = enterLandscapeFs;

  function updateFsIcon() {
    const isFs = !!(document.fullscreenElement || document.webkitFullscreenElement);
    const ico = $('fsIco');
    if (ico) {
      ico.setAttribute('d', isFs
        ? 'M5 16h3v3h2v-5H5v2zm3-8H5v2h5V5H8v3zm6 11h2v-3h3v-2h-5v5zm2-11V5h-2v5h5V8h-3z'
        : 'M7 14H5v5h5v-2H7v-3zm-2-4h2V7h3V5H5v5zm12 7h-3v2h5v-5h-2v3zM14 5v2h3v3h2V5h-5z');
    }
    fit();
  }

  document.addEventListener('fullscreenchange', updateFsIcon);
  document.addEventListener('webkitfullscreenchange', updateFsIcon);
}

// Keep mobile screen awake during active matches
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && game && !game.attract) {
    acquireWakeLock();
  }
});

// Mobile Chrome: Prevent long-press context menu and accidental swipe reloads
window.addEventListener('contextmenu', e => {
  if (e.target.tagName !== 'INPUT' && e.target.tagName !== 'TEXTAREA') {
    e.preventDefault();
  }
}, { passive: false });

window.addEventListener('touchmove', e => {
  const scrollable = e.target.closest('#howToBody, #hostWifiInfo, #scrEnd, #scrSelect');
  if (!scrollable) {
    e.preventDefault();
  }
}, { passive: false });

setupFullscreen();

showScreen('scrTitle');

try {
  const params = new URLSearchParams(location.search);
  const jCode = params.get('join');
  if (jCode && jCode.length >= 4) {
    const cleanCode = jCode.toUpperCase().slice(0, 4);
    $('joinInput').value = cleanCode;
    showScreen('scrJoin');
    setTimeout(() => {
      joinGo();
    }, 450);
  }
} catch (e) {}

window.__INK_OK = true;
