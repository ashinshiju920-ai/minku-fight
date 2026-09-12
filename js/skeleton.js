"use strict";

/* ==========================================================================
   MINKU-FIGHT — Skeleton Kinematics & Stick Figure Renderer
   ========================================================================== */

function skelFor(pose, x, pelY, dir) {
  const p = pose, d = dir;
  const pel = [x, pelY];
  const nk = [x + d * Math.sin(p.lean) * TORSO, pelY - Math.cos(p.lean) * TORSO];
  const hd = [nk[0] + d * Math.sin(p.lean + p.head) * (HEADOFF + 3), nk[1] - Math.cos(p.lean + p.head) * (HEADOFF + 3)];
  const shF = [nk[0] + d * 4, nk[1] + 3];
  const shB = [nk[0] - d * 4, nk[1] + 3];

  function limb(o, a1, a2, l1, l2) {
    const j1 = [o[0] + d * Math.sin(a1) * l1, o[1] + Math.cos(a1) * l1];
    const j2 = [j1[0] + d * Math.sin(a2) * l2, j1[1] + Math.cos(a2) * l2];
    return [j1, j2];
  }

  const armF = limb(shF, p.aF[0], p.aF[1], UARM, FARM);
  const elF = armF[0], haF = armF[1];

  const armB = limb(shB, p.aB[0], p.aB[1], UARM, FARM);
  const elB = armB[0], haB = armB[1];

  const legF = limb([x + d * 3, pelY], p.lF[0], p.lF[1], THIGH, SHIN);
  const knF = legF[0], akF = legF[1];

  const legB = limb([x - d * 3, pelY], p.lB[0], p.lB[1], THIGH, SHIN);
  const knB = legB[0], akB = legB[1];

  const toF = [akF[0] + d * Math.sin(p.fF) * FOOT, akF[1] + Math.cos(p.fF) * FOOT];
  const toB = [akB[0] + d * Math.sin(p.fB) * FOOT, akB[1] + Math.cos(p.fB) * FOOT];

  const s = {
    pel: pel, nk: nk, hd: hd,
    shF: shF, shB: shB,
    elF: elF, haF: haF,
    elB: elB, haB: haB,
    knF: knF, akF: akF, toF: toF,
    knB: knB, akB: akB, toB: toB
  };

  if (p.rot) {
    const c = Math.cos(p.rot), sn = Math.sin(p.rot);
    for (const k in s) {
      const px = s[k][0] - x, py = s[k][1] - pelY;
      s[k] = [x + px * c - py * sn, pelY + px * sn + py * c];
    }
  }
  return s;
}

function segCirc(ax, ay, bx, by, cx, cy, r) {
  const dx = bx - ax, dy = by - ay, l2 = dx * dx + dy * dy;
  const t = l2 ? clamp(((cx - ax) * dx + (cy - ay) * dy) / l2, 0, 1) : 0;
  const px = ax + t * dx, py = ay + t * dy;
  return ((px - cx) * (px - cx) + (py - cy) * (py - cy) <= r * r) ? { x: px, y: py } : null;
}

function drawFigure(c, sk, ch, f, opts) {
  opts = opts || {};
  const ghost = opts.ghost, ga = opts.ga || 1;
  const ink = ghost ? ch.aura : ch.ink;
  const back = ghost ? ch.aura : mixHex(ch.ink, '#171310', 0.5);

  function strokes(color, width, front) {
    c.strokeStyle = color;
    c.lineWidth = width;
    c.lineCap = 'round';
    c.lineJoin = 'round';
    c.beginPath();
    if (!front) {
      c.moveTo(sk.shB[0], sk.shB[1]);
      c.lineTo(sk.elB[0], sk.elB[1]);
      c.lineTo(sk.haB[0], sk.haB[1]);

      c.moveTo(sk.pel[0], sk.pel[1]);
      c.lineTo(sk.knB[0], sk.knB[1]);
      c.lineTo(sk.akB[0], sk.akB[1]);
      c.lineTo(sk.toB[0], sk.toB[1]);
    } else {
      c.moveTo(sk.pel[0], sk.pel[1]);
      c.lineTo(sk.nk[0], sk.nk[1]);

      c.moveTo(sk.pel[0], sk.pel[1]);
      c.lineTo(sk.knF[0], sk.knF[1]);
      c.lineTo(sk.akF[0], sk.akF[1]);
      c.lineTo(sk.toF[0], sk.toF[1]);

      c.moveTo(sk.nk[0], sk.nk[1]);
      c.lineTo(sk.elF[0], sk.elF[1]);
      c.lineTo(sk.haF[0], sk.haF[1]);
    }
    c.stroke();
  }

  c.globalAlpha = ga;

  // Outer paper border for contrast against backdrops
  if (!ghost) {
    strokes(PAPER, 11.5, false);
    strokes(PAPER, 11.5, true);
    c.fillStyle = PAPER;
    c.beginPath();
    c.arc(sk.hd[0], sk.hd[1], HEADR + 2.5, 0, TAU);
    c.fill();
  }

  // Back limbs
  strokes(back, 5.5, false);
  strokes(ink, 7.5, false);

  // Head
  c.fillStyle = ghost ? back : ink;
  c.beginPath();
  c.arc(sk.hd[0], sk.hd[1], HEADR, 0, TAU);
  c.fill();

  // Head aura bandana / headband accent
  if (!ghost) {
    c.strokeStyle = ch.aura;
    c.lineWidth = 5;
    c.beginPath();
    c.arc(sk.hd[0], sk.hd[1], HEADR - 2, PI + .5, TAU - .4);
    c.stroke();

    const d = Math.sign(sk.nk[0] - sk.pel[0]) || (f ? f.dir : 1);
    const ex = sk.hd[0] + d * 6, ey = sk.hd[1] - 1.5;

    // Eyes
    if (f && (f.state === 'ko' || f.state === 'knockdown')) {
      c.strokeStyle = PAPER;
      c.lineWidth = 2.4;
      c.beginPath();
      c.moveTo(ex - 3, ey - 3); c.lineTo(ex + 3, ey + 3);
      c.moveTo(ex + 3, ey - 3); c.lineTo(ex - 3, ey + 3);
      c.stroke();
    } else if (f && f.state === 'atk' && f.atk) {
      c.strokeStyle = PAPER;
      c.lineWidth = 2.6;
      c.beginPath();
      c.moveTo(ex - 4, ey); c.lineTo(ex + 4, ey);
      c.stroke();
    } else if (f && f.blink > 0) {
      c.strokeStyle = PAPER;
      c.lineWidth = 2;
      c.beginPath();
      c.moveTo(ex - 3, ey); c.lineTo(ex + 3, ey);
      c.stroke();
    } else {
      c.fillStyle = PAPER;
      c.beginPath();
      c.arc(ex, ey, 3.6, 0, TAU);
      c.fill();

      c.fillStyle = INKC;
      c.beginPath();
      c.arc(ex + d * 1.2, ey, 1.7, 0, TAU);
      c.fill();
    }
  }

  // Front limbs & torso
  strokes(ink, 8, true);

  // Hand fist nodes
  c.fillStyle = ink;
  c.beginPath(); c.arc(sk.haF[0], sk.haF[1], 5.2, 0, TAU); c.fill();
  c.beginPath(); c.arc(sk.haB[0], sk.haB[1], 5.2, 0, TAU); c.fill();

  if (!ghost) {
    c.strokeStyle = ch.aura;
    c.lineWidth = 3.4;
    c.beginPath(); c.arc(sk.haF[0], sk.haF[1], 5.2, 0, TAU); c.stroke();
  }

  c.globalAlpha = 1;

  // Damage white-flash
  if (!ghost && f && f.flash > 0) {
    c.globalAlpha = f.flash * 0.9;
    strokes(PAPER, 7.5, false);
    strokes(PAPER, 8.5, true);
    c.fillStyle = PAPER;
    c.beginPath();
    c.arc(sk.hd[0], sk.hd[1], HEADR, 0, TAU);
    c.fill();
    c.globalAlpha = 1;
  }
}

function drawFighterFull(c, f) {
  const ch = f.ch;
  if (!f.sk) {
    f.sk = skelFor(f.pose, f.x, GY - f.y - f.pose.hy, f.dir);
  }
  const sk = f.sk;

  // Super Ready pulsing aura
  if (f.meter >= 99.5) {
    const pulse = 0.12 + 0.06 * Math.sin(performance.now() / 150);
    c.globalAlpha = pulse;
    c.fillStyle = ch.aura;
    c.beginPath();
    c.arc(f.x, GY - f.y - f.pose.hy - 30, 94, 0, TAU);
    c.fill();
    c.globalAlpha = 1;
  }

  // Ground dynamic shadow
  const shr = clamp(1 - f.y / 460, 0.25, 1);
  c.fillStyle = 'rgba(0, 0, 0, ' + (0.32 * shr) + ')';
  c.beginPath();
  c.ellipse(f.x, GY + 8, 40 * shr + 8, 7 * shr, 0, 0, TAU);
  c.fill();

  drawFigure(c, sk, ch, f);
}

function drawExtras(c, f) {
  // Ghost afterimages
  for (let i = 0; i < f.ghosts.length; i++) {
    const gg = f.ghosts[i];
    const sk2 = skelFor(gg.pose, gg.x, GY - gg.y - gg.pose.hy, gg.dir);
    c.globalAlpha = (1 - gg.t / 0.26) * 0.38;
    drawFigure(c, sk2, f.ch, null, { ghost: true });
  }
  c.globalAlpha = 1;

  // Attack motion streaks
  if (f.trailPts.length > 1) {
    c.strokeStyle = f.ch.aura;
    c.lineCap = 'round';
    for (let i = 1; i < f.trailPts.length; i++) {
      const a = 1 - f.trailPts[i].t / 0.12;
      c.globalAlpha = a * 0.65;
      c.lineWidth = 7 * a + 1;
      c.beginPath();
      c.moveTo(f.trailPts[i - 1].x, f.trailPts[i - 1].y);
      c.lineTo(f.trailPts[i].x, f.trailPts[i].y);
      c.stroke();
    }
    c.globalAlpha = 1;
  }
}
