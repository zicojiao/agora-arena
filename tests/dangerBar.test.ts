import { expect, test } from 'vitest';
import { DESPERATE_HP } from '../src/engine/types';
import { isDesperate } from '../src/engine/ai';
import { CHARACTERS } from '../src/data/characters';
// 源码用 Vite 的 ?raw 拿，不引 node:fs——tsconfig 的 types 只有 vite/client，
// 为一条测试加 @types/node 不划算
import rendererSrc from '../src/render/renderer.ts?raw';

// 残血这条线有两个消费者：AI 靠它进入「凶暴」，血条靠它转朱砂色并开始搏动。
// 此前渲染层自己写死了一个 0.3——同一条规则写两份，调一处另一处不会跟着动。
// 这个项目在这类漂移上栽过三次（判定框高度、反击+MAX、投技伤害），每次都是靠抽取修掉的。

test('AI 的凶暴线就是血条的告急线，不是各写各的', () => {
  const c = structuredClone(CHARACTERS[0]);
  const f = { def: c, hp: Math.ceil(c.hp * DESPERATE_HP) - 1 } as Parameters<typeof isDesperate>[0];
  expect(isDesperate(f), '刚跨过 DESPERATE_HP 时 AI 却没进入凶暴').toBe(true);
  f.hp = Math.ceil(c.hp * DESPERATE_HP) + 1;
  expect(isDesperate(f), '还没到 DESPERATE_HP 时 AI 就凶暴了').toBe(false);
});

test('渲染层不再自己写死残血阈值', () => {
  const i = rendererSrc.indexOf('function healthBar');
  expect(i, '找不到 healthBar，这条测试的锚点失效了').toBeGreaterThan(0);
  const bar = rendererSrc.slice(i, i + 2000);
  expect(bar.includes('DESPERATE_HP'), '血条没有引用共用的 DESPERATE_HP').toBe(true);
  expect(/hpFrac\s*[<>]=?\s*0\.\d/.test(bar), '血条里还留着写死的血量阈值').toBe(false);
});
