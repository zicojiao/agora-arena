import { describe, expect, it } from 'vitest';
import { BARS, LOOP_STEPS, PROGRESSION, RIFF, SCALE_PCS, STEPS_PER_BAR, arenaBpm, eventsAt, midiFreq } from '../src/render/arenaBgm';

const steps = (fn: (s: number) => boolean) => Array.from({ length: STEPS_PER_BAR }, (_, s) => s).filter(fn);
const inKey = (m: number) => SCALE_PCS.includes(((m % 12) + 12) % 12);

describe('Agora Arena electronic fight track', () => {
  it('is fight tempo and speeds up every round', () => {
    expect(arenaBpm('fight', 0)).toBeGreaterThanOrEqual(138);
    expect(arenaBpm('fight', 1)).toBeGreaterThan(arenaBpm('fight', 0));
    expect(arenaBpm('fight', 2)).toBeGreaterThan(arenaBpm('fight', 1));
    expect(arenaBpm('fight', 9)).toBe(arenaBpm('fight', 2));
    expect(arenaBpm('menu', 0)).toBeLessThan(arenaBpm('fight', 0));
  });

  it('drives four on the floor with claps on 2 and 4', () => {
    expect(steps(s => eventsAt('fight', s, 1, 0).kick)).toEqual([0, 4, 8, 12]);
    expect(steps(s => eventsAt('fight', s, 1, 0).clap)).toEqual([4, 12]);
    expect(steps(s => eventsAt('fight', s, 1, 0).hat === 'open')).toEqual([2, 6, 10, 14]);
  });

  it('pumps the bass between kicks, never on them', () => {
    for (let s = 0; s < LOOP_STEPS; s++) {
      const ev = eventsAt('fight', s, 1, 0);
      expect(ev.kick && ev.bass !== null, `step ${s}`).toBe(false);
    }
    expect(steps(s => eventsAt('fight', s, 1, 0).bass !== null)).toHaveLength(12);
  });

  it('keeps every bass, stab and lead note in E minor (with the D# leading tone)', () => {
    for (let loop = 0; loop < 3; loop++) for (let s = 0; s < LOOP_STEPS; s++) for (const mode of ['fight', 'menu'] as const) {
      const ev = eventsAt(mode, s, loop, 2);
      if (ev.bass !== null) expect(inKey(ev.bass), `${mode} bass ${ev.bass}`).toBe(true);
      for (const n of ev.stab ?? []) expect(inKey(n), `${mode} stab ${n}`).toBe(true);
      for (const l of ev.lead) expect(inKey(l.note), `${mode} lead ${l.note}`).toBe(true);
    }
  });

  it('keeps the lead out of the intro loop, then plays the whole riff', () => {
    const leadNotes = (loop: number) => Array.from({ length: LOOP_STEPS }, (_, s) => eventsAt('fight', s, loop, 0).lead.length).reduce((a, b) => a + b, 0);
    expect(leadNotes(0)).toBe(0);
    expect(leadNotes(1)).toBe(RIFF.flat().length);
    expect(Array.from({ length: LOOP_STEPS }, (_, s) => eventsAt('fight', s, 1, 2).lead.length).reduce((a, b) => a + b, 0)).toBe(RIFF.flat().length * 2);
  });

  it('rolls into the next phrase on the last half bar', () => {
    const lastBar = (BARS - 1) * STEPS_PER_BAR;
    expect(steps(s => eventsAt('fight', lastBar + s, 1, 0).roll)).toEqual([12, 13, 14, 15]);
    expect(steps(s => eventsAt('fight', s, 1, 0).roll)).toEqual([]);
    expect(steps(s => eventsAt('fight', lastBar + s, 0, 0).roll)).toEqual([]);
  });

  it('sits the bass low and the lead above it', () => {
    for (const { root } of PROGRESSION) expect(midiFreq(root)).toBeLessThan(90);
    for (const n of RIFF.flat().map(([, note]) => note)) expect(midiFreq(n)).toBeGreaterThan(450);
  });
});
