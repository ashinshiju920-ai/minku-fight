"use strict";

/* ==========================================================================
   MINKU-FIGHT — Audio Engine: Procedural Sound Synthesizer & Dynamic Music
   ========================================================================== */

let actx = null;
let muted = false;
let masterVolume = 0.85;
let noiseB = null;
let bus = null;
let music = { on: false, next: 0, step: 0, drone: null, intensity: 1 };

/* Mobile Tactile Haptic Vibration */
function haptic(type) {
  if (!navigator.vibrate) return;
  try {
    if (type === 'light') navigator.vibrate(10);
    else if (type === 'medium') navigator.vibrate(25);
    else if (type === 'heavy') navigator.vibrate([40, 30, 40]);
    else if (type === 'ko') navigator.vibrate([80, 50, 120]);
    else if (typeof type === 'number') navigator.vibrate(type);
    else if (Array.isArray(type)) navigator.vibrate(type);
  } catch (e) {}
}
window.haptic = haptic;

function audioInit() {
  if (actx) {
    if (actx.state === 'suspended') actx.resume();
    return;
  }
  try {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) return;
    actx = new AudioContextClass();

    // 1-second white noise buffer for procedural percussion and impacts
    noiseB = actx.createBuffer(1, actx.sampleRate, actx.sampleRate);
    const d = noiseB.getChannelData(0);
    for (let i = 0; i < d.length; i++) {
      d[i] = Math.random() * 2 - 1;
    }

    bus = actx.createGain();
    bus.gain.value = masterVolume;

    // Master compressor to prevent clipping on multiple simultaneous hits
    const comp = actx.createDynamicsCompressor();
    comp.threshold.value = -18;
    comp.knee.value = 22;
    comp.ratio.value = 8;
    comp.attack.value = 0.003;
    comp.release.value = 0.18;

    bus.connect(comp);
    comp.connect(actx.destination);
  } catch (e) {
    console.warn("Web Audio API error:", e);
    actx = null;
    bus = null;
  }
}

// Auto-unlock AudioContext on first user gesture for mobile iOS Safari & Chrome
(function() {
  const unlockEvents = ['pointerdown', 'touchstart', 'keydown', 'click'];
  function unlock() {
    audioInit();
    if (actx && actx.state === 'suspended') {
      actx.resume().catch(() => {});
    }
    unlockEvents.forEach(evt => window.removeEventListener(evt, unlock, { capture: true }));
  }
  unlockEvents.forEach(evt => window.addEventListener(evt, unlock, { capture: true, passive: true }));
})();

function envG(g, t, a, peak, dur) {
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(peak, t + a);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
}

function noiseS(t, dur, f, q, peak, type) {
  if (!actx || !noiseB) return;
  const src = actx.createBufferSource();
  src.buffer = noiseB;
  const fl = actx.createBiquadFilter();
  fl.type = type || 'bandpass';
  fl.frequency.value = f;
  fl.Q.value = q;
  const g = actx.createGain();
  envG(g, t, 0.004, peak, dur);
  src.connect(fl);
  fl.connect(g);
  g.connect(bus || actx.destination);
  src.start(t);
  src.stop(t + dur + 0.05);
}

function toneS(t, f0, f1, dur, peak, type) {
  if (!actx) return;
  const o = actx.createOscillator();
  o.type = type || 'sine';
  o.frequency.setValueAtTime(f0, t);
  o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
  const g = actx.createGain();
  envG(g, t, 0.005, peak, dur);
  o.connect(g);
  g.connect(bus || actx.destination);
  o.start(t);
  o.stop(t + dur + 0.05);
}

function sfx(n, v) {
  if (!actx || muted) return;
  v = (v === undefined) ? 1 : v;
  const t = actx.currentTime;
  try {
    switch (n) {
      case 'ui':
        toneS(t, 440, 320, .07, .15, 'square');
        break;
      case 'ok':
        toneS(t, 320, 560, .10, .20, 'square');
        toneS(t + .06, 560, 780, .10, .16, 'square');
        break;
      case 'cancel':
        toneS(t, 420, 220, .12, .18, 'triangle');
        break;
      case 'swoosh': {
        const f = 950 / Math.max(1, v);
        noiseS(t, .07 + .05 * (v - 1), f, 1.1, .18 + .08 * (v - 1));
        if (v > 1.3) toneS(t, 180, 80, .12, .08, 'sawtooth');
        if (v > 2.0) toneS(t, 90, 320, .22, .12, 'sawtooth');
        break;
      }
      case 'hitL': {
        haptic('light');
        const p = rnd(.92, 1.12);
        noiseS(t, .05, 1400 * p, 1.4, .32);
        toneS(t, 190 * p, 90 * p, .08, .46);
        toneS(t, 280 * p, 140 * p, .03, .12, 'square');
        break;
      }
      case 'hitC': {
        haptic('medium');
        const p = rnd(.95, 1.1);
        noiseS(t, .045, 2700 * p, 1.6, .38);
        noiseS(t, .06, 1100 * p, 1.2, .24);
        toneS(t, 160 * p, 70 * p, .08, .44);
        break;
      }
      case 'hitH': {
        haptic('heavy');
        const p = rnd(.86, 1.08);
        noiseS(t, .12, 640 * p, 1.0, .48);
        toneS(t, 130 * p, 40 * p, .18, .75);
        toneS(t, 60 * p, 30 * p, .28, .55);
        noiseS(t + .008, .03, 2600, 1.4, .25, 'highpass');
        break;
      }
      case 'block': {
        haptic('light');
        noiseS(t, .04, 2400, 2.0, .18);
        toneS(t, 640, 480, .06, .12, 'square');
        toneS(t, 190, 90, .05, .20);
        break;
      }
      case 'thud':
        haptic('medium');
        toneS(t, 95, 36, .18, .55);
        noiseS(t, .05, 320, 1.0, .16);
        break;
      case 'whoosh':
        noiseS(t, .28, 480, 1.0, .22);
        toneS(t, 320, 140, .22, .09, 'sawtooth');
        break;
      case 'projhit':
        haptic('medium');
        noiseS(t, .12, 900, 1.0, .35);
        toneS(t, 160, 60, .14, .42);
        break;
      case 'riser':
        toneS(t, 90, 760, .45, .25, 'sawtooth');
        noiseS(t + .35, .15, 1500, 1.0, .30);
        break;
      case 'ko': {
        haptic('ko');
        toneS(t, 180, 24, .90, .90);
        noiseS(t, .55, 420, .6, .55, 'lowpass');
        noiseS(t, .12, 2600, .8, .35);
        toneS(t + .28, 75, 30, .50, .60);
        break;
      }
      case 'grab':
        haptic('medium');
        noiseS(t, .06, 600, 2.0, .20);
        break;
      case 'tos':
        haptic('medium');
        noiseS(t, .16, 400, 1.0, .30);
        toneS(t, 210, 90, .18, .30);
        break;
      case 'tick':
        toneS(t, 960, 720, .04, .14, 'square');
        break;
      case 'electric':
        haptic('medium');
        noiseS(t, .12, 3400, 2.5, .32, 'highpass');
        toneS(t, 550, 120, .14, .25, 'sawtooth');
        break;
      case 'wind':
        haptic('medium');
        noiseS(t, .24, 750, 1.8, .28, 'bandpass');
        toneS(t, 420, 280, .22, .18, 'sine');
        break;
      case 'fire':
        haptic('medium');
        noiseS(t, .22, 540, 1.2, .32, 'bandpass');
        toneS(t, 140, 60, .18, .32, 'triangle');
        break;
      case 'magma':
        haptic('medium');
        toneS(t, 80, 28, .28, .60, 'sawtooth');
        noiseS(t, .25, 260, .8, .40, 'lowpass');
        break;
    }
  } catch (e) {}
}

function say(txt) {
  if (muted || !window.speechSynthesis) return;
  try {
    const u = new SpeechSynthesisUtterance(txt);
    u.rate = 0.85;
    u.pitch = 0.35;
    u.volume = 0.95;
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(u);
  } catch (e) {}
}

function musicTick() {
  if (!actx || muted || !music.on || !window.game || window.game.phase !== 'fight') {
    if (music.drone) {
      try {
        music.drone.o1.stop();
        music.drone.o2.stop();
      } catch (e) {}
      music.drone = null;
    }
    return;
  }
  try {
    // Ambient sub bass drone
    if (!music.drone) {
      const g = actx.createGain();
      g.gain.value = 0.045 * (music.intensity || 1);
      const fl = actx.createBiquadFilter();
      fl.type = 'lowpass';
      fl.frequency.value = 220;
      const o1 = actx.createOscillator(), o2 = actx.createOscillator();
      o1.type = 'sawtooth';
      o2.type = 'sawtooth';
      o1.frequency.value = 55;
      o2.frequency.value = 55.7;
      o1.connect(fl);
      o2.connect(fl);
      fl.connect(g);
      g.connect(bus || actx.destination);
      o1.start();
      o2.start();
      music.drone = { o1: o1, o2: o2, gain: g };
    }

    const bpm = 104 * (music.intensity > 1.2 ? 1.08 : 1);
    const spb = 60 / bpm / 2; // sixteenth note division

    if (music.next < actx.currentTime) music.next = actx.currentTime + 0.05;

    while (music.next < actx.currentTime + 0.35) {
      const s = music.step;
      const t = music.next;

      // Heavy Taiko Kick Drum (beats 0, 4, 8, 12, with offbeat syncopation)
      if (s % 8 === 0 || s === 6 || s === 10) {
        toneS(t, 100, 38, .22, .32);
      }
      // Martial Arts Clack / Snare
      if (s === 4 || s === 12) {
        noiseS(t, .09, 1900, .8, .15, 'highpass');
        toneS(t, 250, 160, .07, .12, 'triangle');
      }
      // Hi-hat tick
      if (s % 2 === 0) {
        noiseS(t, .03, 6200, 1.2, .05, 'highpass');
      }
      // Tension synth bass note
      if (s === 0 || s === 7 || s === 14) {
        const bassFreq = (s === 0 ? 55 : (s === 7 ? 65.4 : 49));
        toneS(t, bassFreq, bassFreq, .15, .08, 'sawtooth');
      }

      music.step = (music.step + 1) % 16;
      music.next += spb;
    }
  } catch (e) {}
}

function setMute(m) {
  muted = m;
  const ico = document.getElementById('sndIco');
  if (ico) ico.style.opacity = m ? 0.35 : 1;
}
