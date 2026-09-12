"use strict";

/* ==========================================================================
   MINKU-FIGHT — Constants, Character Specs, & Animation Tracks
   ========================================================================== */

const TAU = Math.PI * 2, PI = Math.PI;
const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
const lerp = (a, b, k) => a + (b - a) * k;
const lerpA = (a, b, k) => {
  let d = (b - a) % TAU;
  if (d > PI) d -= TAU;
  if (d < -PI) d += TAU;
  return a + d * k;
};
const rnd = (a, b) => a + Math.random() * (b - a);

const EASE = {
  linear: k => k,
  io: k => k * k * (3 - 2 * k),
  snap: k => 1 - Math.pow(1 - k, 4),
  outBack: k => {
    const c1 = 1.70158, c3 = c1 + 1;
    return 1 + c3 * Math.pow(k - 1, 3) + c1 * Math.pow(k - 1, 2);
  }
};

function mixHex(h1, h2, k) {
  const p = h => [
    parseInt(h.slice(1, 3), 16) || 0,
    parseInt(h.slice(3, 5), 16) || 0,
    parseInt(h.slice(5, 7), 16) || 0
  ];
  const a = p(h1), b = p(h2);
  return 'rgb(' + ((a[0] + (b[0] - a[0]) * k) | 0) + ',' +
                 ((a[1] + (b[1] - a[1]) * k) | 0) + ',' +
                 ((a[2] + (b[2] - a[2]) * k) | 0) + ')';
}

function saneName(n) {
  return (n || '').toString().toUpperCase().replace(/[^A-Z0-9 _.\-]/g, '').trim().slice(0, 12);
}

// Stage & Physics Dimensions
const W = 1280, H = 720;
const GY = 612;                // Ground Y coordinate
const WORLD_W = 1720;          // Total arena width
const WALL_L = 70;             // Left arena boundary
const WALL_R = WORLD_W - 70;   // Right arena boundary
const GRAV = 2250;             // Downward gravity (px/s^2)
const ROUND_TIME = 99;         // Seconds per round

// Bone dimensions (stick figure forward kinematics)
const TORSO = 54, UARM = 28, FARM = 26;
const THIGH = 44, SHIN = 42, HEADR = 13.5, HEADOFF = 15, FOOT = 11;

// Colors
const PAPER = '#f2ead8';
const INKC = '#141110';

// 4 Distinct Characters with Custom Attributes & Special Move Kits
const CHARS = [
  {
    id: 'kage',
    name: 'KAGE',
    title: 'THE SHADOW',
    ink: '#251b1d',
    aura: '#ff5233',
    glow: 'rgba(255, 82, 51, 0.4)',
    pow: 1.00,
    spd: 1.05,
    jmp: 1.00,
    armor: 1.0,
    desc: 'Balanced ninja with blistering rush cancels and dark flame embers.',
    proj: { type: 'fire', speed: 680, r: 13, dmg: 7.0, cost: 30 },
    rush: { type: 'shadow', speed: 620, dmg: 12, cost: 30 },
    super: { type: 'flame_fury', hits: 7, dmg: 28, cost: 100 },
    sp: ['EMBER SHOT', 'SHADOW RUSH', 'FIST OF ASHES']
  },
  {
    id: 'volt',
    name: 'VOLT',
    title: 'LIVE WIRE',
    ink: '#161d24',
    aura: '#38b6ff',
    glow: 'rgba(56, 182, 255, 0.45)',
    pow: 0.90,
    spd: 1.20,
    jmp: 1.08,
    armor: 0.92,
    desc: 'Speed demon wielding crackling lightning bolts and electric tele-rushes.',
    proj: { type: 'lightning', speed: 860, r: 11, dmg: 6.2, cost: 30 },
    rush: { type: 'thunder_dash', speed: 760, dmg: 10, cost: 30 },
    super: { type: 'thunder_storm', hits: 8, dmg: 26, cost: 100 },
    sp: ['VOLT BOLT', 'BOLT RUSH', 'THOUSAND VOLTS']
  },
  {
    id: 'nimbus',
    name: 'NIMBUS',
    title: 'STORM DANCER',
    ink: '#1f1927',
    aura: '#b06cff',
    glow: 'rgba(176, 108, 255, 0.45)',
    pow: 0.94,
    spd: 1.08,
    jmp: 1.26,
    armor: 0.95,
    desc: 'Air juggler with razor wind discs and a rising vortex super.',
    proj: { type: 'wind_blade', speed: 580, r: 15, dmg: 7.8, cost: 30 },
    rush: { type: 'gale_drill', speed: 640, dmg: 11, cost: 30 },
    super: { type: 'tempest_vortex', hits: 9, dmg: 27, cost: 100 },
    sp: ['STORM ORB', 'WIND RUSH', 'TEMPEST FURY']
  },
  {
    id: 'gaizer',
    name: 'GAIZER',
    title: 'IRON TEMPEST',
    ink: '#241f12',
    aura: '#ffb32e',
    glow: 'rgba(255, 179, 46, 0.45)',
    pow: 1.30,
    spd: 0.84,
    jmp: 0.90,
    armor: 1.15,
    desc: 'Unstoppable heavyweight with armor frames, magma rocks, and earth quakes.',
    proj: { type: 'magma_rock', speed: 450, r: 19, dmg: 10.5, cost: 30 },
    rush: { type: 'iron_bash', speed: 500, dmg: 15, cost: 30, armorFrames: true },
    super: { type: 'earth_eruption', hits: 6, dmg: 32, cost: 100 },
    sp: ['MAGMA BALL', 'IRON RUSH', 'GAIZER SLAM']
  }
];

/* ==========================================================================
   Keyframe Poses (0=down, +PI/2=forward, PI=up; hy=pelvis height above feet)
   ========================================================================== */
const STANCE = { hy: 74, lean: .14, head: .03, aF: [2.35, 1.15], aB: [2.5, 1.3], lF: [.75, -.05], lB: [-.6, -.6], fF: 1.5, fB: .35, rot: 0 };
const P = o => Object.assign({}, STANCE, o);

const CROUCH  = P({ hy: 40, lean: .42, head: .2, aF: [2.3, 2.1], aB: [2.45, 2.25], lF: [1.05, -1.13], lB: [.55, -1.5], fB: .4 });
const BLOCK   = P({ hy: 66, lean: .1, head: .15, aF: [2.32, 2.2], aB: [2.5, 2.32], lF: [.8, -.2], lB: [-.55, -.6] });
const BLOCKC  = P({ hy: 40, lean: .42, head: .2, aF: [2.3, 2.15], aB: [2.45, 2.3], lF: [1.05, -1.13], lB: [.55, -1.5], fB: .4 });
const JUMPPO  = P({ hy: 62, lean: .12, aF: [2.5, 1.5], aB: [2.7, 1.6], lF: [.85, -.35], lB: [.6, -.6], fF: .35, fB: .4 });
const FALLPO  = P({ hy: 64, lean: .1, aF: [2.4, 1.9], aB: [2.6, 2.0], lF: [.5, .05], lB: [-.25, -.6], fF: .6, fB: .5 });
const LAUNCH  = P({ hy: 55, lean: .15, head: -.2, aF: [-.9, -1.4], aB: [2.7, 3.1], lF: [.9, 1.2], lB: [-.5, -.9], fF: 1.0, fB: -.5 });
const LYING   = P({ hy: 13, lean: .06, head: .2, aF: [-.4, -.7], aB: [2.55, 2.85], lF: [.35, .55], lB: [.75, 1.0], fF: .4, fB: .5 });
const GRABBED = P({ hy: 68, lean: -.35, head: -.1, aF: [1.2, 1.0], aB: [1.3, 1.1], lF: [.7, -.3], lB: [-.5, -.7] });
const TOSS    = P({ hy: 76, lean: -.2, aF: [2.6, 2.9], aB: [2.5, 2.8], lF: [.7, -.1], lB: [-.5, -.6] });
const FLARE   = P({ hy: 70, lean: -.12, head: -.25, aF: [2.6, 3.05], aB: [-1.25, -1.55], lF: [.5, .05], lB: [-.55, -.6], fF: 1.2, fB: -.2 });
const FLUR_A  = P({ hy: 70, lean: .4, head: .1, aB: [1.6, 1.62], aF: [2.4, 1.15] });
const FLUR_B  = P({ hy: 70, lean: .4, head: .1, aF: [1.58, 1.6], aB: [2.5, 1.25] });
const UPRISE  = P({ hy: 86, lean: -.18, head: -.15, aB: [2.35, 2.5], aF: [.6, .2], lF: [.6, -.1], lB: [-.3, -.4], fB: -.2 });
const SLAM    = P({ hy: 36, lean: .65, head: .3, aF: [1.8, 1.8], aB: [1.7, 1.7], lF: [1.1, -1.2], lB: [.6, -1.4] });

/* Animation Tracks */
const TR = {
  jab: [
    [0, STANCE],
    [.05, P({ lean: .3, aF: [1.62, 1.6], aB: [2.55, 1.35], lF: [.85, -.15] }), 'snap'],
    [.10, P({ lean: .3, aF: [1.62, 1.6], aB: [2.55, 1.35], lF: [.85, -.15] })],
    [.32, STANCE]
  ],
  cross: [
    [0, STANCE],
    [.10, P({ lean: .02, hy: 72, aB: [2.7, 1.5] })],
    [.20, P({ lean: .44, hy: 70, aB: [1.52, 1.55], aF: [2.6, 1.5], lF: [.95, -.2], lB: [-.7, -.75] }), 'snap'],
    [.27, P({ lean: .44, hy: 70, aB: [1.52, 1.55], aF: [2.6, 1.5], lF: [.95, -.2], lB: [-.7, -.75] })],
    [.52, STANCE]
  ],
  upper: [
    [0, STANCE],
    [.12, P({ hy: 46, lean: .5, head: .25, aB: [.9, .2], aF: [2.2, 1.0], lF: [1.0, -1.0], lB: [.5, -1.4] })],
    [.22, P({ hy: 88, lean: -.2, head: -.15, aB: [2.35, 2.5], aF: [.6, .2], lF: [.6, -.1], lB: [-.3, -.4], fB: -.2 }), 'snap'],
    [.32, P({ hy: 88, lean: -.2, head: -.15, aB: [2.35, 2.5], aF: [.6, .2], lF: [.6, -.1], lB: [-.3, -.4], fB: -.2 })],
    [.64, STANCE]
  ],
  lowk: [
    [0, STANCE],
    [.07, P({ hy: 72, lean: -.05, lF: [1.15, .1], fF: 1.3 })],
    [.13, P({ lean: -.18, lF: [.8, 1.05], fF: 1.1, aF: [2.4, 1.2], aB: [2.6, 1.35] }), 'snap'],
    [.18, P({ lean: -.18, lF: [.8, 1.05], fF: 1.1 })],
    [.40, STANCE]
  ],
  highk: [
    [0, STANCE],
    [.10, P({ hy: 72, lean: .15, lB: [1.2, .2], fB: 1.2 })],
    [.20, P({ lean: -.4, lB: [1.9, 1.95], lF: [.05, -.1], fB: 1.9, aF: [-1.0, -1.2], aB: [2.3, 2.1] }), 'snap'],
    [.27, P({ lean: -.4, lB: [1.9, 1.95], lF: [.05, -.1], fB: 1.9 })],
    [.58, STANCE]
  ],
  sweep: [
    [0, STANCE],
    [.10, P({ hy: 34, lean: .5, head: .3, lF: [1.1, .3], lB: [.95, -1.5], aB: [-.4, -.6], aF: [2.2, 1.0] })],
    [.22, P({ hy: 26, lean: .55, lF: [1.1, 1.6], fF: 1.55, lB: [.95, -1.55] }), 'snap'],
    [.32, P({ hy: 26, lean: .55, lF: [1.1, 1.6], fF: 1.55, lB: [.95, -1.55] })],
    [.45, CROUCH],
    [.62, STANCE]
  ],
  airp: [
    [0, JUMPPO],
    [.06, P({ hy: 58, lean: .35, aB: [1.35, 1.4], aF: [2.5, 1.2], lF: [.85, -.35], lB: [.6, -.6], fF: .4, fB: .4 }), 'snap'],
    [4.0, P({ hy: 58, lean: .35, aB: [1.35, 1.4], aF: [2.5, 1.2], lF: [.85, -.35], lB: [.6, -.6], fF: .4, fB: .4 })]
  ],
  airk: [
    [0, JUMPPO],
    [.07, P({ hy: 58, lean: -.25, lF: [1.35, 1.5], fF: 1.5, lB: [.55, 1.25], aF: [-.8, -1.0], aB: [2.2, 2.5] }), 'snap'],
    [4.0, P({ hy: 58, lean: -.25, lF: [1.35, 1.5], fF: 1.5, lB: [.55, 1.25], aF: [-.8, -1.0], aB: [2.2, 2.5] })]
  ],
  cast: [
    [0, STANCE],
    [.06, P({ hy: 64, lean: .1, aF: [.85, .35], aB: [.9, .4] })],
    [.16, P({ hy: 70, lean: .35, aF: [1.5, 1.55], aB: [1.42, 1.45], lF: [.85, -.25], lB: [-.8, -.85] }), 'snap'],
    [.24, P({ hy: 70, lean: .35, aF: [1.5, 1.55], aB: [1.42, 1.45], lF: [.85, -.25], lB: [-.8, -.85] })],
    [.46, STANCE]
  ],
  rush: [
    [0, STANCE],
    [.10, P({ hy: 58, lean: .25, aB: [-.6, -1.0], aF: [2.3, 1.2] })],
    [.16, P({ hy: 56, lean: 1.0, head: .25, aB: [1.55, 1.6], aF: [.7, .2], lF: [.95, -.9], lB: [-1.15, -1.2], fB: -1.3 }), 'snap'],
    [.40, P({ hy: 56, lean: 1.0, head: .25, aB: [1.55, 1.6], aF: [.7, .2], lF: [.95, -.9], lB: [-1.15, -1.2], fB: -1.3 })],
    [.50, P({ hy: 66, lean: .5 })],
    [.66, STANCE]
  ],
  super: [
    [0, FLARE],
    [.45, FLUR_A],
    [.53, FLUR_B],
    [.61, FLUR_A],
    [.69, FLUR_B],
    [.77, FLUR_A],
    [.85, FLUR_B],
    [.93, FLUR_A],
    [1.01, FLUR_B],
    [1.09, FLUR_A],
    [1.17, FLUR_B],
    [1.25, UPRISE, 'snap'],
    [1.37, UPRISE],
    [1.95, STANCE]
  ],
  grab: [
    [0, STANCE],
    [.08, P({ lean: .4, hy: 70, aF: [1.5, 1.5], aB: [1.42, 1.45], lF: [.95, -.2] }), 'snap'],
    [.18, P({ lean: .4, hy: 70, aF: [1.5, 1.5], aB: [1.42, 1.45], lF: [.95, -.2] })],
    [.32, P({ lean: .2, aF: [2.3, 1.2], aB: [2.4, 1.3] })],
    [.62, STANCE]
  ],
  hitHead: [
    [0, STANCE],
    [.09, P({ lean: -.42, head: -.55, hy: 70, aF: [1.6, 1.3], aB: [2.2, 1.7], lF: [.8, -.1], lB: [-.75, -.8] }), 'snap'],
    [.45, P({ lean: -.42, head: -.55, hy: 70, aF: [1.6, 1.3], aB: [2.2, 1.7], lF: [.8, -.1], lB: [-.75, -.8] })]
  ],
  hitBody: [
    [0, STANCE],
    [.09, P({ lean: .55, head: .35, hy: 66, aF: [1.15, .75], aB: [1.3, .85], lF: [.9, -.35], lB: [-.55, -.7] }), 'snap'],
    [.45, P({ lean: .55, head: .35, hy: 66, aF: [1.15, .75], aB: [1.3, .85], lF: [.9, -.35], lB: [-.55, -.7] })]
  ],
  hitLow: [
    [0, STANCE],
    [.09, P({ hy: 64, lean: .15, lF: [.25, -1.1], lB: [-.4, -.55], aF: [1.9, 1.6], aB: [2.4, 2.0] }), 'snap'],
    [.45, P({ hy: 64, lean: .15, lF: [.25, -1.1], lB: [-.4, -.55], aF: [1.9, 1.6], aB: [2.4, 2.0] })]
  ],
  hitHeavy: [
    [0, STANCE],
    [.09, P({ lean: -.6, head: -.7, hy: 68, aF: [1.2, 1.0], aB: [2.9, 2.6], lF: [.85, -.1], lB: [-.8, -.85] }), 'snap'],
    [.55, P({ lean: -.6, head: -.7, hy: 68, aF: [1.2, 1.0], aB: [2.9, 2.6], lF: [.85, -.1], lB: [-.8, -.85] })]
  ],
  getup: [
    [0, LYING],
    [.22, P({ hy: 36, lean: .5, aF: [1.6, 1.2], aB: [1.8, 1.4], lF: [1.05, -1.1], lB: [.55, -1.5] })],
    [.50, STANCE]
  ],
  win: [
    [0, STANCE],
    [.20, P({ aF: [2.7, 2.95], head: -.18, lean: -.06 }), 'snap'],
    [1.20, P({ aF: [2.7, 2.95], head: -.18, lean: -.06 })]
  ]
};

function lerpPose(a, b, k) {
  const o = { hy: lerp(a.hy, b.hy, k) };
  o.lean = lerpA(a.lean, b.lean, k);
  o.head = lerpA(a.head, b.head, k);
  o.fF = lerpA(a.fF, b.fF, k);
  o.fB = lerpA(a.fB, b.fB, k);
  o.rot = lerpA(a.rot, b.rot, k);
  o.aF = [lerpA(a.aF[0], b.aF[0], k), lerpA(a.aF[1], b.aF[1], k)];
  o.aB = [lerpA(a.aB[0], b.aB[0], k), lerpA(a.aB[1], b.aB[1], k)];
  o.lF = [lerpA(a.lF[0], b.lF[0], k), lerpA(a.lF[1], b.lF[1], k)];
  o.lB = [lerpA(a.lB[0], b.lB[0], k), lerpA(a.lB[1], b.lB[1], k)];
  return o;
}

const clonePose = p => ({
  hy: p.hy, lean: p.lean, head: p.head,
  aF: [p.aF[0], p.aF[1]], aB: [p.aB[0], p.aB[1]],
  lF: [p.lF[0], p.lF[1]], lB: [p.lB[0], p.lB[1]],
  fF: p.fF, fB: p.fB, rot: p.rot
});

function evalTrack(tr, t) {
  if (t <= tr[0][0]) return tr[0][1];
  for (let i = 0; i < tr.length - 1; i++) {
    const t0 = tr[i][0], t1 = tr[i + 1][0];
    if (t < t1 || i === tr.length - 2) {
      const k = clamp((t - t0) / Math.max(.0001, t1 - t0), 0, 1);
      const easeFn = EASE[tr[i + 1][2] || 'io'] || EASE.io;
      return lerpPose(tr[i][1], tr[i + 1][1], easeFn(k));
    }
  }
  return tr[tr.length - 1][1];
}

// Moves specifications
const Hh = o => Object.assign({ r: 16, dmg: 5, kb: 240, stun: .32, stop: .05, react: 'head' }, o);

const MOVES = {
  jab:   { t: TR.jab,   hits: [Hh({ t0: .045, t1: .10, limb: 'haF', dmg: 4.5, kb: 200, react: 'head', chain: 'cross' })], dur: .34 },
  cross: { t: TR.cross, hits: [Hh({ t0: .18,  t1: .27, limb: 'haB', dmg: 7.0, kb: 310, stun: .42, stop: .075, react: 'head' })], dur: .53 },
  upper: { t: TR.upper, hits: [Hh({ t0: .12,  t1: .24, limb: 'haB', dmg: 9.5, kb: 250, launch: -950, stun: .50, stop: .10, react: 'heavy' })], dur: .65 },
  lowk:  { t: TR.lowk,  hits: [Hh({ t0: .10,  t1: .18, limb: 'toF', dmg: 4.5, kb: 210, react: 'low', chain: 'highk' })], dur: .41 },
  highk: { t: TR.highk, hits: [Hh({ t0: .16,  t1: .27, limb: 'toB', dmg: 10.0, kb: 480, stun: .50, stop: .09, react: 'heavy' })], dur: .59 },
  sweep: { t: TR.sweep, hits: [Hh({ t0: .14,  t1: .30, limb: 'toF', dmg: 7.0, kb: 140, knockdown: true, stun: .50, stop: .08, react: 'low' })], dur: .63 },
  airp:  { t: TR.airp,  hits: [Hh({ t0: .05,  t1: 9.0, limb: 'haB', dmg: 5.5, kb: 240, react: 'head' })], dur: 9.0, air: true },
  airk:  { t: TR.airk,  hits: [Hh({ t0: .05,  t1: 9.0, limb: 'toF', dmg: 7.0, kb: 330, stun: .40, react: 'heavy' })], dur: 9.0, air: true },
  cast:  { t: TR.cast,  hits: [], dur: .47, cast: .16, cost: 30 },
  rush:  {
    t: TR.rush,
    hits: [Hh({ t0: .16, t1: .40, limb: 'haB', dmg: 11.5, kb: 520, stun: .55, stop: .10, react: 'heavy' })],
    dur: .67, cost: 30,
    script: function(f, dt, t) {
      if (t > .15 && t < .40) f.vx = f.dir * (f.ch.rush ? f.ch.rush.speed : 580);
    }
  },
  super: {
    t: TR.super,
    hits: [
      Hh({ t0: .45,  t1: .53,  limb: 'haB', dmg: 3.5, kb: 60,  stun: .34, stop: .03, react: 'body' }),
      Hh({ t0: .61,  t1: .69,  limb: 'haF', dmg: 3.5, kb: 60,  stun: .34, stop: .03, react: 'body' }),
      Hh({ t0: .77,  t1: .85,  limb: 'haB', dmg: 3.5, kb: 60,  stun: .34, stop: .03, react: 'body' }),
      Hh({ t0: .93,  t1: 1.01, limb: 'haF', dmg: 3.5, kb: 60,  stun: .34, stop: .03, react: 'body' }),
      Hh({ t0: 1.09, t1: 1.17, limb: 'haB', dmg: 3.5, kb: 60,  stun: .34, stop: .03, react: 'body' }),
      Hh({ t0: 1.22, t1: 1.35, limb: 'haB', dmg: 9.0, kb: 280, launch: -920, stun: .50, stop: .12, react: 'heavy' })
    ],
    dur: 2.0, cost: 100,
    script: function(f, dt, t) {
      if (t > .40 && t < 1.15 && Math.abs(f.opp.x - f.x) > 85) f.vx = f.dir * 280;
    }
  },
  grab: { t: TR.grab, hits: [], dur: .63, grabWin: [.06, .16] }
};
