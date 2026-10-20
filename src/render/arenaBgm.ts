import { audioCtx, isMuted, existingAudioCtx } from './sfx';

/**
 * Agora Arena soundtrack: an electronic fight track synthesized live with Web Audio (no audio files).
 *
 * Fight mode is a minor-key four-on-the-floor loop — kick on every beat, clap on 2 and 4, off-beat hats,
 * a pumping saw bass that ducks under the kick, chord stabs and a delayed lead riff — over the classic
 * i–VI–VII–V fight progression (Em–C–D–B). Each round is faster; the final round adds a lead doubling and
 * busier hats. Menu mode is a half-time version without the lead.
 *
 * Patterns are pure functions (tested in tests/arenaBgm.test.ts); only the scheduler touches Web Audio.
 * Scheduling runs on AudioContext time, not logic frames: audio is a wall-clock domain.
 */

export const STEPS_PER_BAR = 16;
export const BARS = 4;
export const LOOP_STEPS = STEPS_PER_BAR * BARS;

export type BgmMode = 'fight' | 'menu';

const FIGHT_BPM = [140, 146, 152];
export const MENU_BPM = 118;

export function arenaBpm(mode: BgmMode, tier: number): number {
  if (mode === 'menu') return MENU_BPM;
  return FIGHT_BPM[Math.min(Math.max(tier, 0), FIGHT_BPM.length - 1)];
}

export const midiFreq = (m: number) => 440 * Math.pow(2, (m - 69) / 12);

/** E natural minor plus D# (the leading tone of the B major V chord). */
export const SCALE_PCS = [4, 6, 7, 9, 11, 0, 2, 3];

/** Per bar: bass root (MIDI) and stab chord (MIDI). Em – C – D – B. */
export const PROGRESSION = [
  { root: 40, chord: [64, 67, 71] },
  { root: 36, chord: [60, 64, 67] },
  { root: 38, chord: [62, 66, 69] },
  { root: 35, chord: [59, 63, 66] },
];

/** Lead riff: [step in bar, MIDI note, length in steps]. */
export const RIFF: [number, number, number][][] = [
  [[0, 76, 2], [3, 71, 1], [4, 76, 2], [6, 79, 2], [8, 78, 2], [10, 76, 2], [12, 74, 2], [14, 71, 2]],
  [[0, 72, 3], [3, 76, 1], [4, 79, 2], [6, 76, 2], [8, 72, 2], [10, 74, 2], [12, 76, 4]],
  [[0, 74, 2], [2, 78, 2], [4, 81, 3], [7, 78, 1], [8, 74, 2], [10, 78, 2], [12, 81, 2], [14, 83, 2]],
  [[0, 83, 4], [4, 81, 2], [6, 78, 2], [8, 75, 4], [12, 78, 2], [14, 71, 2]],
];

export interface StepEvents {
  kick: boolean;
  clap: boolean;
  hat: 'closed' | 'open' | null;
  /** Snare roll in the last half bar of a phrase. */
  roll: boolean;
  bass: number | null;
  stab: number[] | null;
  lead: { note: number; len: number }[];
}

/**
 * What plays on a given 16th step. `loop` counts completed 4-bar loops: loop 0 is the intro (drums + bass),
 * the lead enters from loop 1. `tier` is the round (0-based); tier 2 is the final round.
 */
export function eventsAt(mode: BgmMode, step: number, loop: number, tier: number): StepEvents {
  const s = step % STEPS_PER_BAR;
  const bar = Math.floor(step / STEPS_PER_BAR) % BARS;
  const chord = PROGRESSION[bar];
  const lastBar = bar === BARS - 1;
  const ev: StepEvents = { kick: false, clap: false, hat: null, roll: false, bass: null, stab: null, lead: [] };

  if (mode === 'menu') {
    ev.kick = s === 0 || s === 10;
    ev.clap = s === 8;
    ev.hat = s % 4 === 2 ? 'closed' : null;
    // Arpeggiated chord tones on every other 16th, an octave up.
    if (s % 2 === 0) ev.bass = chord.chord[(s / 2) % 3] - 12;
    ev.stab = s === 0 ? chord.chord : null;
    return ev;
  }

  const fill = lastBar && loop >= 1 && s >= 12;
  ev.kick = s % 4 === 0;
  ev.clap = s === 4 || s === 12;
  ev.roll = fill;
  ev.hat = s % 4 === 2 ? 'open' : (s % 2 === 1 && tier >= 2) || s % 4 === 0 ? 'closed' : null;
  // Rolling bass on the three 16ths after each kick, jumping an octave on the "and".
  if (s % 4 !== 0) ev.bass = chord.root + (s % 4 === 2 ? 12 : 0);
  ev.stab = s % 4 === 2 && s !== 14 ? chord.chord : null;
  if (loop >= 1) {
    for (const [at, note, len] of RIFF[bar]) {
      if (at !== s) continue;
      ev.lead.push({ note, len });
      if (tier >= 2) ev.lead.push({ note: note + 12, len });
    }
  }
  return ev;
}

// ── Synthesis ───────────────────────────────────────────────────────
const LOOKAHEAD = 0.2;
const TICK_MS = 60;

let timer: ReturnType<typeof setInterval> | null = null;
let mode: BgmMode = 'fight';
let tier = 0;
let step = 0;
let loop = 0;
let nextTime = 0;
let duck = 1;
let out: GainNode | null = null;
let delaySend: GainNode | null = null;
let delayNode: DelayNode | null = null;
let noise: AudioBuffer | null = null;

function graph(a: AudioContext) {
  if (out) return out;
  const comp = a.createDynamicsCompressor();
  comp.threshold.value = -16;
  comp.ratio.value = 4;
  comp.attack.value = 0.004;
  comp.release.value = 0.12;
  comp.connect(a.destination);
  out = a.createGain();
  out.gain.value = 0;
  out.connect(comp);
  // Dotted-eighth echo on the lead.
  const delay = a.createDelay(1);
  const fb = a.createGain();
  const wet = a.createGain();
  fb.gain.value = 0.32;
  wet.gain.value = 0.28;
  delay.connect(fb).connect(delay);
  delay.connect(wet).connect(out);
  delaySend = a.createGain();
  delaySend.connect(delay);
  delayNode = delay;
  const len = a.sampleRate;
  noise = a.createBuffer(1, len, a.sampleRate);
  const data = noise.getChannelData(0);
  // Fixed-seed LCG: the same noise every session (no Math.random in sound either).
  let seed = 12345;
  for (let i = 0; i < len; i++) { seed = (seed * 1664525 + 1013904223) >>> 0; data[i] = seed / 2 ** 31 - 1; }
  return out;
}

function env(g: GainNode, at: number, peak: number, attack: number, decay: number) {
  g.gain.setValueAtTime(0.0001, at);
  g.gain.exponentialRampToValueAtTime(peak, at + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, at + attack + decay);
}

function kick(a: AudioContext, at: number) {
  const o = a.createOscillator(), g = a.createGain();
  o.type = 'sine';
  o.frequency.setValueAtTime(160, at);
  o.frequency.exponentialRampToValueAtTime(45, at + 0.11);
  env(g, at, 0.85, 0.002, 0.28);
  o.connect(g).connect(out!);
  o.start(at); o.stop(at + 0.4);
}

function noiseHit(a: AudioContext, at: number, type: BiquadFilterType, f: number, peak: number, decay: number, q = 0.8) {
  const src = a.createBufferSource(), flt = a.createBiquadFilter(), g = a.createGain();
  src.buffer = noise;
  flt.type = type; flt.frequency.value = f; flt.Q.value = q;
  env(g, at, peak, 0.001, decay);
  src.connect(flt).connect(g).connect(out!);
  src.start(at, (at * 7.31) % 0.5); src.stop(at + decay + 0.05);
}

function clap(a: AudioContext, at: number, peak = 0.42) {
  noiseHit(a, at, 'bandpass', 1500, peak, 0.16, 1.2);
  const o = a.createOscillator(), g = a.createGain();
  o.type = 'triangle'; o.frequency.setValueAtTime(220, at); o.frequency.exponentialRampToValueAtTime(140, at + 0.08);
  env(g, at, peak * 0.4, 0.001, 0.09);
  o.connect(g).connect(out!); o.start(at); o.stop(at + 0.12);
}

function bass(a: AudioContext, at: number, note: number, dur: number, peak: number) {
  const o = a.createOscillator(), o2 = a.createOscillator(), flt = a.createBiquadFilter(), g = a.createGain();
  o.type = 'sawtooth'; o2.type = 'square';
  o.frequency.value = midiFreq(note); o2.frequency.value = midiFreq(note - 12);
  flt.type = 'lowpass'; flt.Q.value = 7;
  flt.frequency.setValueAtTime(2200, at);
  flt.frequency.exponentialRampToValueAtTime(380, at + dur);
  // Held, not plucked: the bass has to fill the gap between kicks to pump.
  g.gain.setValueAtTime(0.0001, at);
  g.gain.exponentialRampToValueAtTime(peak, at + 0.005);
  g.gain.setValueAtTime(peak, at + dur * 0.7);
  g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
  o.connect(flt); o2.connect(flt); flt.connect(g).connect(out!);
  o.start(at); o2.start(at); o.stop(at + dur + 0.05); o2.stop(at + dur + 0.05);
}

function stab(a: AudioContext, at: number, notes: number[], dur: number, peak: number) {
  const flt = a.createBiquadFilter(), g = a.createGain();
  flt.type = 'lowpass'; flt.Q.value = 3;
  flt.frequency.setValueAtTime(3200, at);
  flt.frequency.exponentialRampToValueAtTime(700, at + dur);
  env(g, at, peak, 0.003, dur);
  flt.connect(g).connect(out!);
  for (const n of notes) for (const detune of [-9, 9]) {
    const o = a.createOscillator();
    o.type = 'sawtooth'; o.frequency.value = midiFreq(n); o.detune.value = detune;
    o.connect(flt); o.start(at); o.stop(at + dur + 0.05);
  }
}

function lead(a: AudioContext, at: number, note: number, dur: number) {
  const flt = a.createBiquadFilter(), g = a.createGain();
  flt.type = 'lowpass'; flt.frequency.value = 4200; flt.Q.value = 2;
  g.gain.setValueAtTime(0.0001, at);
  g.gain.exponentialRampToValueAtTime(0.085, at + 0.006);
  g.gain.exponentialRampToValueAtTime(0.05, at + 0.08);
  g.gain.setValueAtTime(0.05, at + dur * 0.85);
  g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
  flt.connect(g);
  g.connect(out!);
  g.connect(delaySend!);
  for (const detune of [-7, 7]) {
    const o = a.createOscillator();
    o.type = 'square'; o.frequency.value = midiFreq(note); o.detune.value = detune;
    o.connect(flt); o.start(at); o.stop(at + dur + 0.05);
  }
}

function schedule() {
  const a = audioCtx();
  if (!a || !out) return;
  const sixteenth = 60 / arenaBpm(mode, tier) / 4;
  delayNode?.delayTime.setTargetAtTime(sixteenth * 3, a.currentTime, 0.05);
  out.gain.setTargetAtTime(isMuted() ? 0 : 0.5 * duck, a.currentTime, 0.08);
  while (nextTime < a.currentTime + LOOKAHEAD) {
    // Keep advancing while muted so unmuting picks up on the beat.
    if (!isMuted() && duck > 0.01) {
      const ev = eventsAt(mode, step, loop, tier);
      if (ev.kick) kick(a, nextTime);
      if (ev.clap) clap(a, nextTime);
      if (ev.roll) clap(a, nextTime, 0.18 + (step % STEPS_PER_BAR - 12) * 0.06);
      if (ev.hat) noiseHit(a, nextTime, 'highpass', 8000, ev.hat === 'open' ? 0.12 : 0.07, ev.hat === 'open' ? 0.14 : 0.035);
      if (ev.bass !== null) bass(a, nextTime, ev.bass, sixteenth * 0.9, mode === 'menu' ? 0.12 : 0.32);
      if (ev.stab) stab(a, nextTime, ev.stab, mode === 'menu' ? sixteenth * 14 : sixteenth * 1.4, mode === 'menu' ? 0.03 : 0.045);
      for (const l of ev.lead) lead(a, nextTime, l.note, sixteenth * l.len * 0.95);
    }
    nextTime += sixteenth;
    step = (step + 1) % LOOP_STEPS;
    if (step === 0) loop++;
  }
}

/**
 * Start (or retarget) the soundtrack. Switching tier within the same mode keeps the groove going — only the
 * tempo changes — so round transitions do not restart the loop; switching mode starts from the intro.
 */
export function startArenaBgm(nextMode: BgmMode, nextTier = 0): void {
  const a = audioCtx();
  if (!a) return;
  graph(a);
  if (timer && nextMode === mode) { tier = nextTier; return; }
  stopArenaBgm();
  mode = nextMode;
  tier = nextTier;
  step = 0;
  loop = 0;
  nextTime = a.currentTime + 0.06;
  schedule();
  timer = setInterval(schedule, TICK_MS);
}

export function stopArenaBgm(): void {
  if (timer) { clearInterval(timer); timer = null; }
  const a = existingAudioCtx();
  if (a && out) out.gain.setTargetAtTime(0, a.currentTime, 0.05);
}

/** 1 = full, 0 = silent. Used to sit under the pause menu, the voice announcer and the FastH3 clip. */
export function setArenaDuck(level: number): void {
  duck = Math.max(0, Math.min(1, level));
  const a = existingAudioCtx();
  if (a && out) out.gain.setTargetAtTime(isMuted() ? 0 : 0.5 * duck, a.currentTime, 0.15);
}
