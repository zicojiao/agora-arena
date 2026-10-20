import { expect, test } from 'vitest';
import { Battle } from '../src/engine/battle';
import { GOAT_ROSTER } from '../src/data/goats';
import { NULL_INPUT, CROUCH_HEIGHT } from '../src/engine/types';

function melee(b: Battle, height: number, crouch = false) {
  b.hitstop = 0;
  b.p1.x = 400; b.p2.x = 480;
  b.p1.state = 'attack'; b.p1.stateFrame = 0; b.p1.hitCount = 0;
  b.p1.move = { ...b.p1.def.moves.n1, startup: 0, active: 2, recovery: 1,
    damage: 1, hitstun: 20, knockdown: false, knockback: { x: 0, y: 0 },
    hitbox: { x: 30, y: height, w: 100, h: 20 } };
  b.tick(NULL_INPUT, { ...NULL_INPUT, crouch });
}

function crouchedVictim() {
  const b = new Battle(structuredClone(GOAT_ROSTER[0]), structuredClone(GOAT_ROSTER[1]), 400, 480);
  melee(b, 20, true);
  expect(b.p2.state).toBe('hitstun');
  expect(b.p2.hurtKind).toBe('crouch');
  expect(b.p2.hurtCount).toBe(1);
  return b;
}

for (const source of ['melee', 'projectile'] as const) {
  test(`${source}: crouched hurt pose evades high followups but remains vulnerable below its head`, () => {
    for (const height of [CROUCH_HEIGHT + 5, 40, 10]) {
      const b = crouchedVictim(), hp = b.p2.hp;
      if (source === 'melee') melee(b, height);
      else {
        b.hitstop = 0; b.p1.state = 'idle'; b.p1.move = null;
        b.projectiles.push({ owner: 0, x: b.p2.x, y: height, vx: 0, age: 0, life: 20,
          facing: 1, hit: false, def: { spawnFrame: 0, vx: 0, life: 20, damage: 1,
            hitstun: 20, knockback: { x: 0, y: 0 }, w: 30, h: 20, y: height, kind: 'beam', color: '#fff' } });
        b.tick(NULL_INPUT, NULL_INPUT);
      }
      expect(b.p2.hp).toBe(height > CROUCH_HEIGHT ? hp : hp - 1);
      expect(b.p2.hurtCount).toBe(height > CROUCH_HEIGHT ? 1 : 2);
    }
  });
}

test('standing recovery restores full-height collision and clears crouched reaction on the next hit', () => {
  const b = crouchedVictim();
  b.hitstop = 0; b.p1.state = 'idle'; b.p1.move = null;
  for (let i = 0; i < 30; i++) b.tick(NULL_INPUT, NULL_INPUT);
  expect(b.p2.state).toBe('idle');
  const hp = b.p2.hp;
  melee(b, 90);
  expect(b.p2.hp).toBe(hp - 1);
  expect(b.p2.hurtKind).toBe('high');
});
