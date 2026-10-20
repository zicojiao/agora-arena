import { expect, test } from 'vitest';
import { Battle } from '../src/engine/battle';
import { createAi, type AiProfile } from '../src/engine/ai';
import { testChar } from './helpers';

const P: AiProfile = {
  name: 'test',
  decideEvery: 10,
  near: { attack: 5, block: 2, retreat: 1, super: 2 },
  mid: { approach: 4, skill1: 2, skill2: 2, jump: 1 },
  far: { approach: 6, skill3: 2, idle: 1 },
};

test('两个 AI 互打 1000 帧不崩、状态合法', () => {
  const b = new Battle(testChar(), testChar());
  const a1 = createAi(P, 1);
  const a2 = createAi(P, 2);
  const valid = ['idle', 'walk', 'jump', 'attack', 'hitstun', 'block', 'down'];
  for (let i = 0; i < 1000 && b.winner === null; i++) {
    b.tick(a1(b, 0), a2(b, 1));
    expect(valid).toContain(b.p1.state);
    expect(b.p1.hp).toBeGreaterThanOrEqual(0);
    expect(b.p1.hp).toBeLessThanOrEqual(100);
    expect(b.p2.hp).toBeGreaterThanOrEqual(0);
  }
});

test('同种子决定性', () => {
  const play = () => {
    const b = new Battle(testChar(), testChar());
    const a1 = createAi(P, 7);
    const a2 = createAi(P, 8);
    for (let i = 0; i < 600 && b.winner === null; i++) b.tick(a1(b, 0), a2(b, 1));
    return [b.p1.hp, b.p2.hp];
  };
  expect(play()).toEqual(play());
});

test('AI 会真的打到人（600 帧内有伤害产生）', () => {
  const b = new Battle(testChar(), testChar());
  const a1 = createAi(P, 3);
  const a2 = createAi(P, 4);
  for (let i = 0; i < 600 && b.winner === null; i++) b.tick(a1(b, 0), a2(b, 1));
  expect(b.p1.hp + b.p2.hp).toBeLessThan(200);
});
