import { describe, expect, it } from 'vitest';
import { GOAT_ROSTER } from '../src/data/goats';
import { attackAction, attackKind, spriteAction, CROUCH_SY, LOW_HIT_TOP } from '../src/render/spriteAction';
import type { Fighter, Move } from '../src/engine/types';

type F = Parameters<typeof spriteAction>[0];
const fighter = (over: Partial<F> = {}): F => ({
  state: 'idle', stateFrame: 0, stun: 0, move: null, airborne: false,
  vx: 0, vy: 0, y: 0, facing: 1, lowGuard: false, victory: 0, ...over,
} as F);
const activeFrame = (m: Move) => m.startup + 1;

describe('full-body sprite actions follow what each move does, not its name', () => {
  for (const goat of GOAT_ROSTER) {
    const moves = goat.moves;

    it(`${goat.name}: moves that only reach the legs draw a low kick, not a head-height one`, () => {
      expect(attackKind(moves.n2, false)).toBe('low');
      for (const m of Object.values(moves)) {
        if (m.meterCost > 0 || m.slot === 'jA') continue;
        if (m.hitbox.y + m.hitbox.h > LOW_HIT_TOP && m.guard !== 'low') continue;
        const a = attackAction(m, activeFrame(m), false);
        expect(a.pose, m.name).toBe('poseKick');
        expect(a.rot, m.name).toBeGreaterThan(0);
        expect(a.sy, m.name).toBeLessThan(1);
        expect(a.pivot, m.name).toBe('feet');
      }
    });

    it(`${goat.name}: air attacks dive toward the floor`, () => {
      const a = attackAction(moves.jA, activeFrame(moves.jA), true);
      expect(attackKind(moves.jA, true)).toBe('air');
      expect(a.rot).toBeGreaterThan(0.5);
    });

    it(`${goat.name}: launchers kick upward`, () => {
      expect(attackKind(moves.n3, false)).toBe('rise');
      expect(attackAction(moves.n3, activeFrame(moves.n3), false).rot).toBeLessThan(0);
    });

    it(`${goat.name}: supers keep the painted super pose through every phase`, () => {
      for (const m of [moves.sp50, moves.sp100]) {
        for (const frame of [0, m.startup + 1, m.startup + m.active + 1]) {
          expect(attackAction(m, frame, false).pose).toBe('poseSuper');
        }
      }
    });
  }

  it('attacks wind up, lunge while the hitbox is live, and settle back by the end of recovery', () => {
    const m = GOAT_ROSTER[0].moves.n1;
    const windup = attackAction(m, m.startup - 1, false);
    const hit = attackAction(m, m.startup + m.active - 1, false);
    const end = attackAction(m, m.startup + m.active + m.recovery, false);
    expect(windup.dx).toBeLessThan(0);
    expect(hit.pose).toBe('posePunch');
    expect(hit.dx).toBeGreaterThan(0);
    expect(end.pose).toBe('poseIdle');
    expect(end.dx).toBeCloseTo(0);
    expect(end.rot).toBeCloseTo(0);
  });

  it('crouching and low guard are drawn crouched to match the shrunken hurtbox', () => {
    expect(spriteAction(fighter({ state: 'crouch' })).sy).toBe(CROUCH_SY);
    expect(spriteAction(fighter({ state: 'block', lowGuard: true })).sy).toBe(CROUCH_SY);
    expect(spriteAction(fighter({ state: 'block' })).sy).toBe(1);
  });

  it('being hit recoils backward instead of showing a guard', () => {
    const a = spriteAction(fighter({ state: 'hitstun', stateFrame: 8 }));
    expect(a.pose).not.toBe('poseBlock');
    expect(a.rot).toBeLessThan(0);
    expect(a.dx).toBeLessThan(0);
  });

  it('knockdowns fall flat, stay on the floor, and get back up before the stun ends', () => {
    const lying = spriteAction(fighter({ state: 'down', stateFrame: 30, stun: 30 }));
    expect(lying.rot).toBeLessThan(-1.3);
    expect(lying.dy).toBeLessThan(0);
    const up = spriteAction(fighter({ state: 'down', stateFrame: 60, stun: 0 }));
    expect(up.rot).toBeCloseTo(0);
  });

  it('walking backward retreats in guard rather than sprinting backward', () => {
    expect(spriteAction(fighter({ state: 'walk', vx: -3, facing: 1 })).pose).toBe('poseBlock');
    expect(spriteAction(fighter({ state: 'walk', vx: 3, facing: -1 })).pose).toBe('poseBlock');
    expect(spriteAction(fighter({ state: 'walk', vx: 3, facing: 1 })).pose).toBe('poseRun');
  });

  it('the winner strikes the super pose', () => {
    expect(spriteAction(fighter({ victory: 10 } as Partial<Fighter>)).pose).toBe('poseSuper');
  });
});
