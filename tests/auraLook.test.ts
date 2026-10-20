import { expect, test } from 'vitest';
import { auraLook } from '../src/render/adornments';
import { Battle } from '../src/engine/battle';
import { CHARACTERS } from '../src/data/characters';
import { NULL_INPUT } from '../src/engine/types';

// 气环此前对两个**含义完全不同**的状态画同一个样子：
//   · 气满（meter >= 100）：手上攥着一发超必杀
//   · MAX 生效中（maxMode > 0）：伤害 ×1.25 的 300 帧正在流逝
// 玩家因此分不出对面是"憋着大招"还是"正在加成里"，也看不出 MAX 还剩多少。

test('气不够时不画气环', () => {
  expect(auraLook(0, 0)).toBeNull();
  expect(auraLook(99, 0), '99 气还开不了超必杀，不该亮').toBeNull();
});

test('气满与 MAX 是两个样子，不是同一个', () => {
  const ready = auraLook(100, 0)!;
  const max = auraLook(50, 300)!;
  expect(ready, '气满时不画气环').not.toBeNull();
  expect(max, 'MAX 生效中不画气环').not.toBeNull();
  expect(max.rings, `MAX 的环数(${max.rings})没比气满(${ready.rings})多，两个状态看着一样`)
    .toBeGreaterThan(ready.rings);
  expect(max.speed, `MAX 的转速(${max.speed})没比气满(${ready.speed})快`).toBeGreaterThan(ready.speed);
});

test('MAX 快耗尽时变淡——玩家要看得出它在走', () => {
  const fresh = auraLook(50, 300)!, dying = auraLook(50, 10)!;
  expect(dying.alpha, `MAX 剩 10 帧(${dying.alpha})和剩 300 帧(${fresh.alpha})一样亮，看不出在耗尽`)
    .toBeLessThan(fresh.alpha);
});

test('发动 MAX 那一刻气环不能熄灭——发动本身要扣 50 气', () => {
  // 这是踩过的坑：判据只写 meter >= 100 时，发动瞬间气掉到 50，光环立即消失，
  // 画面上等于"花了 50 气什么都没发生"。这里用真实引擎跑一遍，不靠手填数字。
  const c = structuredClone(CHARACTERS[0]);
  const b = new Battle(c, structuredClone(CHARACTERS[1]));
  b.p1.meter = 100;
  let entered = -1;
  for (let f = 0; f < 60 && entered < 0; f++) {
    b.tick({ ...NULL_INPUT, block: true, super: true }, { ...NULL_INPUT });
    if (b.p1.maxMode > 0) entered = f;
  }
  expect(entered, '用例没成立：按了「防+大招键」却没进 MAX').toBeGreaterThanOrEqual(0);
  expect(b.p1.meter, '用例没成立：进 MAX 没有扣掉 50 气').toBeLessThan(100);
  expect(auraLook(b.p1.meter, b.p1.maxMode), '刚进 MAX 气环就熄灭了').not.toBeNull();
});
