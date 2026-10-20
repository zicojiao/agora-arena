import { expect, test } from 'vitest';
import { Battle } from '../src/engine/battle';
import { CHARACTERS } from '../src/data/characters';
import { NULL_INPUT, type Dir } from '../src/engine/types';
const press = (o: Partial<typeof NULL_INPUT> = {}) => ({ ...NULL_INPUT, ...o });

// KOF 系的三件核心机动。它们不是招式而是移动状态——「好玩」主要来自移动与防守的选择，
// 不是招式表更长。双击必须靠"刚推杆"这一瞬间识别（上一帧中立），否则一直按着方向
// 会被当成连续双击。

/** 双击某方向：推 → 松 → 再推。中间必须回中立，这正是双击的定义 */
const doubleTap = (b: Battle, dir: Dir, gap = 3) => {
  b.tick(press({ move: dir }), press());
  for (let i = 0; i < gap; i++) b.tick(press(), press());
  b.tick(press({ move: dir }), press());
};

test('双击前进起跑，跑速明显快过走——不是"走得快一点"', () => {
  const c = CHARACTERS[0];
  const walk = new Battle(structuredClone(c), structuredClone(c), 300, 900);
  const run = new Battle(structuredClone(c), structuredClone(c), 300, 900);
  for (let i = 0; i < 40; i++) walk.tick(press({ move: 1 }), press());
  doubleTap(run, 1);
  for (let i = 0; i < 36; i++) run.tick(press({ move: 1 }), press());
  expect(run.p1.state, '双击后应进入 run').toBe('run');
  const walked = walk.p1.x - 300, ran = run.p1.x - 300;
  expect(ran, `跑 ${ran.toFixed(0)}px 应明显多于走 ${walked.toFixed(0)}px`).toBeGreaterThan(walked * 1.5);
});

test('一直按住方向不会被当成双击——否则走路就会莫名其妙起跑', () => {
  const c = CHARACTERS[0];
  const b = new Battle(structuredClone(c), structuredClone(c), 300, 900);
  for (let i = 0; i < 60; i++) b.tick(press({ move: 1 }), press());
  expect(b.p1.state, '一直按住应该是走，不是跑').toBe('walk');
});

test('双击后退是小跳退，会离地、带起跳无敌，落地回到可控', () => {
  const c = CHARACTERS[0];
  const b = new Battle(structuredClone(c), structuredClone(c), 500, 900);
  doubleTap(b, -1);
  expect(b.p1.state).toBe('backstep');
  let peak = 0, invulnSeen = false;
  for (let i = 0; i < 40; i++) {
    b.tick(press(), press());
    peak = Math.max(peak, b.p1.y);
    if (b.p1.invuln > 0) invulnSeen = true;
  }
  expect(peak, '后跳要真的离地').toBeGreaterThan(5);
  expect(invulnSeen, '起跳几帧该有无敌，用来躲起身压制').toBe(true);
  expect(b.p1.x, '应该往后退了').toBeLessThan(500);
  expect(b.p1.state, '落地要回到可控状态').toBe('idle');
});

test('防御键 + 方向 = 紧急回避：中段无敌、收尾没有——不是无风险按键', () => {
  const c = CHARACTERS[0];
  const b = new Battle(structuredClone(c), structuredClone(c), 400, 900);
  b.tick(press({ block: true, move: 1, roll: true }), press());
  expect(b.p1.state).toBe('roll');
  const invulnByFrame: boolean[] = [];
  for (let i = 0; i < 32; i++) {
    b.tick(press(), press());
    invulnByFrame.push(b.p1.invuln > 0);
  }
  expect(invulnByFrame.slice(4, 18).every(Boolean), '中段必须全程无敌').toBe(true);
  expect(invulnByFrame.at(-1), '收尾不该还有无敌，否则回避变成零风险').toBe(false);
  expect(b.p1.x, '回避要真的位移出去').toBeGreaterThan(430);
  expect(b.p1.state).toBe('idle');
});

test('只按防御不带方向仍然是防御，不会变成回避', () => {
  const c = CHARACTERS[0];
  const b = new Battle(structuredClone(c), structuredClone(c), 400, 900);
  b.tick(press({ block: true }), press());
  expect(b.p1.state).toBe('block');
});

test('跑可以接跳与出招——跑起来接不上东西就没意义', () => {
  const c = CHARACTERS[0];
  const b1 = new Battle(structuredClone(c), structuredClone(c), 300, 900);
  doubleTap(b1, 1);
  b1.tick(press({ move: 1, jump: true }), press());
  expect(b1.p1.state, '跑中该能起跳').toBe('jump');

  const b2 = new Battle(structuredClone(c), structuredClone(c), 300, 900);
  doubleTap(b2, 1);
  b2.tick(press({ move: 1, skill1: true }), press());
  expect(b2.p1.state, '跑中该能出招').toBe('attack');
});
