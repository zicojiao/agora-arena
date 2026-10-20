import { describe, expect, it } from 'vitest';
import { Battle } from '../src/engine/battle';
import { createAi } from '../src/engine/ai';
import { NULL_INPUT } from '../src/engine/types';
import { GOAT_ROSTER } from '../src/data/goats';
import { difficultyById } from '../src/game/setup';
import { gaugeReady, stepGauge } from '../src/game/fasth3';

const fresh = () => new Battle(structuredClone(GOAT_ROSTER[0]), structuredClone(GOAT_ROSTER[1]), 400, 470, false);

describe('simplified Arena combat', () => {
  it.each([
    { ...NULL_INPUT, super: true },
    { ...NULL_INPUT, blowback: true },
    { ...NULL_INPUT, super: true, block: true },
    { ...NULL_INPUT, attack: true, block: true },
  ])('blocks legacy moves for both sides, including combined and remote inputs: %j', input => {
    const b = fresh();
    for (let frame = 0; frame < 180; frame++) {
      // Even a stale round/peer carrying full meter cannot enable a hidden move.
      b.p1.meter = b.p2.meter = 100;
      b.tick(input, input);
      for (const f of [b.p1, b.p2]) {
        expect(f.move?.id.endsWith('_cd')).not.toBe(true);
        expect(f.move?.meterCost ?? 0).toBe(0);
        expect(f.meter).toBe(0);
        expect(f.maxMode).toBe(0);
        expect(f.charge).toBe(0);
      }
      expect(b.events.some(e => e.type === 'super' || e.type === 'maxMode')).toBe(false);
    }
    // J + L may still produce a normal jab after guarding; it must never become burst.
    if (!input.attack) {
      expect(b.p1.hp).toBe(b.p1.def.hp);
      expect(b.p2.hp).toBe(b.p2.def.hp);
    }
  });

  it('keeps normal combat, independent AI gauge charging and cinematic damage', () => {
    const b = fresh();
    let gauge = 0;
    for (let frame = 0; frame < 180; frame++) {
      const before = { p1Hp: b.p1.hp, p2Hp: b.p2.hp };
      b.tick({ ...NULL_INPUT, attack: frame % 20 === 0 }, NULL_INPUT);
      gauge = stepGauge(gauge, before, { p1Hp: b.p1.hp, p2Hp: b.p2.hp });
    }
    expect(b.p2.hp).toBeLessThan(b.p2.def.hp);
    expect(gauge).toBeGreaterThan(0);
    expect(b.p1.meter).toBe(0);
    expect(gaugeReady(stepGauge(99, { p1Hp: 200, p2Hp: 200 }, { p1Hp: 200, p2Hp: 100 }))).toBe(true);
    const hp = b.p2.hp;
    b.queueStrike(0, 25);
    b.tick(NULL_INPUT, NULL_INPUT);
    expect(b.p2.hp).toBe(hp - 25);
    expect(b.p2.state).toBe('down');
  });

  it.each(['rookie', 'pro', 'legend'] as const)('keeps %s CPU fighting without choosing hidden moves', difficulty => {
    const b = fresh();
    const cpu = createAi(difficultyById(difficulty).ai, 42);
    let attacks = 0;
    for (let frame = 0; frame < 1800 && b.winner === null; frame++) {
      const input = cpu(b, 1);
      expect(input.super).toBe(false);
      expect(input.blowback ?? false).toBe(false);
      if (input.attack || input.skill1 || input.skill2 || input.skill3) attacks++;
      b.tick(NULL_INPUT, input);
    }
    expect(attacks).toBeGreaterThan(0);
    expect(b.p1.hp).toBeLessThan(b.p1.def.hp);
  });

  it('keeps the old mechanics available to legacy engine callers', () => {
    const b = new Battle(structuredClone(GOAT_ROSTER[0]), structuredClone(GOAT_ROSTER[1]));
    b.p1.meter = 100;
    b.tick({ ...NULL_INPUT, super: true }, NULL_INPUT);
    expect(b.events.some(e => e.type === 'super')).toBe(true);
  });
});
