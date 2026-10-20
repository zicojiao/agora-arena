import { expect, test } from 'vitest';
import { Battle } from '../src/engine/battle';
import { ARENA_MAX } from '../src/engine/types';
import { press, run, testChar } from './helpers';

test('走路按速度移动', () => {
  const b = new Battle(testChar(), testChar());
  const x0 = b.p1.x;
  b.tick(press({ move: 1 }), press());
  expect(b.p1.x).toBe(x0 + 4);
  expect(b.p1.state).toBe('walk');
});

test('自动面向对手', () => {
  const b = new Battle(testChar(), testChar(), 600, 300); // p1 在右侧
  b.tick(press(), press());
  expect(b.p1.facing).toBe(-1);
  expect(b.p2.facing).toBe(1);
});

test('换边时即使正在出招也会继续面对对手', () => {
  const b = new Battle(testChar(), testChar(), 600, 300);
  b.p1.state = 'attack';
  b.p1.move = b.p1.def.moves.n1;
  b.p1.facing = 1;
  b.tick(press(), press());
  expect(b.p1.facing).toBe(-1);
  expect(b.p2.facing).toBe(1);
});

test('跳跃起落回到地面', () => {
  const b = new Battle(testChar(), testChar());
  b.tick(press({ jump: true }), press());
  expect(b.p1.state).toBe('jump');
  expect(b.p1.y).toBeGreaterThan(0);
  run(b, 60);
  expect(b.p1.y).toBe(0);
  expect(b.p1.state).toBe('idle');
});

test('场地边界钳制', () => {
  const b = new Battle(testChar(), testChar());
  for (let i = 0; i < 300; i++) b.tick(press({ move: 1 }), press({ move: 1 }));
  expect(b.p1.x).toBeLessThanOrEqual(ARENA_MAX);
});

test('着地时不可完全重叠（推挤分离）', () => {
  const b = new Battle(testChar(), testChar(), 400, 420);
  run(b, 5);
  expect(Math.abs(b.p2.x - b.p1.x)).toBeGreaterThanOrEqual(40);
});

// Task 36：对手被打进 hitstun 后没法后退，出招者冲上去时 separate() 还按站立时的 40px
// 硬顶，冲进去的力道就只能变成把对手一起往前推。这里直接摆一个贴脸场景验证 separate()
// 本身的行为——不经过真正的攻击判定，纯测间距逻辑——把 p2.state 手动钉在 hitstun 是这个
// 项目里 fx.test.ts 已经用过的写法，不是绕过引擎
test('对手处于 hitstun 时推挤下限收紧：能压进 40px 以内，但仍不会完全重叠', () => {
  const b = new Battle(testChar(), testChar(), 400, 405); // 起始间距 5px，贴脸
  b.p2.state = 'hitstun';
  b.p2.stun = 50; // 撑住整个观测窗口，不会中途脱硬直被 40px 规则接管
  run(b, 5);
  const gap = Math.abs(b.p2.x - b.p1.x);
  expect(gap).toBeLessThan(40); // 明显低于双方站立时的 40px 下限——攻击方压得进去
  expect(gap).toBeGreaterThan(0); // 但不是完全重叠
});
