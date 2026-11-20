// All sounds are synthesized — no audio files to download.
let ctx = null;
let master = null;
let enabled = true;
let amb = null;

export function unlockAudio() {
  if (!ctx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = enabled ? 1 : 0;
    master.connect(ctx.destination);
  }
  // iOS can also be 'interrupted'; resuming is async, so callers can wait for it
  if (ctx.state !== 'running') return ctx.resume().catch(() => {});
  return Promise.resolve();
}
export function setSound(v) {
  enabled = v;
  if (master) master.gain.setTargetAtTime(v ? 1 : 0, ctx.currentTime, 0.05);
}
export const soundOn = () => enabled;
// no humming in a background tab
document.addEventListener('visibilitychange', () => {
  if (!ctx) return;
  if (document.hidden) ctx.suspend().catch(() => {});
  else if (enabled) ctx.resume().catch(() => {});
});
const ready = () => ctx && enabled && ctx.state === 'running';

function noiseBuffer(seconds, color = 'white') {
  const len = Math.floor(ctx.sampleRate * seconds);
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const d = buf.getChannelData(0);
  let last = 0;
  for (let i = 0; i < len; i++) {
    const w = Math.random() * 2 - 1;
    last = color === 'brown' ? (last + 0.02 * w) / 1.02 : w;
    d[i] = color === 'brown' ? last * 3.5 : w;
  }
  return buf;
}

/** «пи-пи» */
export function chirp(volume = 0.12) {
  if (!ready()) return;
  const t0 = ctx.currentTime + 0.01;
  for (let k = 0; k < 2; k++) {
    const t = t0 + k * (0.15 + Math.random() * 0.03);
    const o = ctx.createOscillator();
    const gn = ctx.createGain();
    o.type = 'sine';
    const p = 1 + (Math.random() - 0.5) * 0.08;
    o.frequency.setValueAtTime(2700 * p, t);
    o.frequency.exponentialRampToValueAtTime(4200 * p, t + 0.045);
    o.frequency.exponentialRampToValueAtTime(3100 * p, t + 0.1);
    gn.gain.setValueAtTime(0.0001, t);
    gn.gain.exponentialRampToValueAtTime(volume, t + 0.012);
    gn.gain.exponentialRampToValueAtTime(0.0001, t + 0.12);
    o.connect(gn).connect(master);
    o.start(t);
    o.stop(t + 0.14);
  }
}

/** shell crack: a dry tick plus a tiny hollow knock of the beak */
export function crackSound(volume = 0.05) {
  if (!ready()) return;
  const t = ctx.currentTime + 0.005;
  const ticks = 1 + Math.floor(Math.random() * 3);
  for (let k = 0; k < ticks; k++) {
    const at = t + k * (0.012 + Math.random() * 0.02);
    const src = ctx.createBufferSource();
    src.buffer = noiseBuffer(0.03);
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 2500 + Math.random() * 2500;
    bp.Q.value = 1.2;
    const gn = ctx.createGain();
    gn.gain.setValueAtTime(volume * (0.6 + Math.random() * 0.6), at);
    gn.gain.exponentialRampToValueAtTime(0.0001, at + 0.03);
    src.connect(bp).connect(gn).connect(master);
    src.start(at);
  }
  const o = ctx.createOscillator();
  const g2 = ctx.createGain();
  o.type = 'triangle';
  o.frequency.setValueAtTime(900 + Math.random() * 200, t);
  o.frequency.exponentialRampToValueAtTime(380, t + 0.04);
  g2.gain.setValueAtTime(volume * 0.5, t);
  g2.gain.exponentialRampToValueAtTime(0.0001, t + 0.05);
  o.connect(g2).connect(master);
  o.start(t);
  o.stop(t + 0.06);
}

/* ---------- generative music for film mode: warm pads + a soft music-box melody ---------- */
let music = null;
const NOTE = (n) => 440 * Math.pow(2, (n - 69) / 12);
// gentle, hopeful progression (MIDI notes): Cmaj9 – Am9 – Fmaj7 – Gadd9
const CHORDS = [[48, 55, 64, 71, 74], [45, 52, 60, 67, 71], [41, 48, 57, 64, 69], [43, 50, 59, 62, 69]];
const MELODY = [72, 74, 76, 79, 81, 84, 79, 76]; // C major pentatonic

export function startMusic() {
  if (!ready() || music) return;
  const out = ctx.createGain();
  out.gain.value = 0;
  out.gain.setTargetAtTime(0.9, ctx.currentTime, 1.2);
  // a little space: feedback delay
  const delay = ctx.createDelay(1);
  delay.delayTime.value = 0.42;
  const fb = ctx.createGain();
  fb.gain.value = 0.32;
  const wet = ctx.createGain();
  wet.gain.value = 0.35;
  delay.connect(fb).connect(delay);
  delay.connect(wet).connect(out);
  out.connect(master);
  const lp = ctx.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.value = 1400;
  lp.connect(out);
  lp.connect(delay);
  let step = 0;
  let timer = null;
  function chord() {
    const now = ctx.currentTime;
    const notes = CHORDS[step % CHORDS.length];
    for (const n of notes) {
      for (const det of [-4, 4]) {
        const o = ctx.createOscillator();
        o.type = 'triangle';
        o.frequency.value = NOTE(n);
        o.detune.value = det;
        const g = ctx.createGain();
        g.gain.setValueAtTime(0.0001, now);
        g.gain.exponentialRampToValueAtTime(0.012, now + 1.8);
        g.gain.exponentialRampToValueAtTime(0.0001, now + 6.6);
        o.connect(g).connect(lp);
        o.start(now);
        o.stop(now + 6.8);
      }
    }
    // a few music-box notes over the chord
    for (let k = 0; k < 4; k++) {
      if (Math.random() < 0.3) continue;
      const at = now + 0.6 + k * 1.2 + Math.random() * 0.2;
      const o = ctx.createOscillator();
      o.type = 'sine';
      o.frequency.value = NOTE(MELODY[Math.floor(Math.random() * MELODY.length)]);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, at);
      g.gain.exponentialRampToValueAtTime(0.03, at + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, at + 1.4);
      o.connect(g).connect(lp);
      o.start(at);
      o.stop(at + 1.5);
    }
    step++;
  }
  chord();
  timer = setInterval(chord, 4800);
  music = { out, stop: () => clearInterval(timer) };
}

export function stopMusic() {
  if (!music) return;
  const m = music;
  music = null;
  m.stop();
  m.out.gain.setTargetAtTime(0, ctx.currentTime, 0.6);
  setTimeout(() => m.out.disconnect(), 4000);
}

/**
 * Background ambience, 0..1 each: the warm hum of the incubator (fan + heater)
 * and the soft rumble of the processing hall.
 */
export function setAmbient(incubator = 0, hall = 0) {
  if (!ready()) return;
  if (!amb) {
    const hum = ctx.createBufferSource();
    hum.buffer = noiseBuffer(4, 'brown');
    hum.loop = true;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 320;
    const humGain = ctx.createGain();
    humGain.gain.value = 0;
    const motor = ctx.createOscillator();
    motor.type = 'sine';
    motor.frequency.value = 100;
    const motorGain = ctx.createGain();
    motorGain.gain.value = 0;
    hum.connect(lp).connect(humGain).connect(master);
    motor.connect(motorGain).connect(master);
    const hallSrc = ctx.createBufferSource();
    hallSrc.buffer = noiseBuffer(4, 'brown');
    hallSrc.loop = true;
    const hallBp = ctx.createBiquadFilter();
    hallBp.type = 'bandpass';
    hallBp.frequency.value = 600;
    hallBp.Q.value = 0.4;
    const hallGain = ctx.createGain();
    hallGain.gain.value = 0;
    hallSrc.connect(hallBp).connect(hallGain).connect(master);
    hum.start();
    motor.start();
    hallSrc.start();
    amb = { humGain, motorGain, hallGain, inc: -1, hall: -1 };
  }
  if (Math.abs(incubator - amb.inc) > 0.01) {
    amb.inc = incubator;
    amb.humGain.gain.setTargetAtTime(incubator * 0.05, ctx.currentTime, 0.3);
    amb.motorGain.gain.setTargetAtTime(incubator * 0.006, ctx.currentTime, 0.3);
  }
  if (Math.abs(hall - amb.hall) > 0.01) {
    amb.hall = hall;
    amb.hallGain.gain.setTargetAtTime(hall * 0.05, ctx.currentTime, 0.4);
  }
}
