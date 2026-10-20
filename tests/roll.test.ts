import { expect, test } from 'vitest';
import { Battle } from '../src/engine/battle';
import { CHARACTERS } from '../src/data/characters';
import { ARENA_MIN, NULL_INPUT } from '../src/engine/types';
import { createHeld, toInputFrame } from '../src/ui/input';
import { press } from './helpers';

// 紧急回避（KOF 的緊急回避）。改之前它只是一次带风险的闪避：滚过去把对手一起推着走，
// 两人间距始终 40px，一步都没越过——那样它比后跳还不如，后跳至少拉得开距离。
// 能穿身才是它的意义：换边、从版边压制里脱出。

/** 向对手方向回避，跑满整个动作 */
function rollThrough(c: typeof CHARACTERS[number], x1: number, x2: number) {
  const b = new Battle(structuredClone(c), structuredClone(c), x1, x2);
  const dir = x2 >= x1 ? 1 : -1;
  // roll 是显式输入位（输入层由「防御+新按方向」合成）。只在第一帧给，
  // 正是玩家按一次方向的样子——给满 40 帧等于按住不放，那不该连滚
  for (let f = 0; f < 40; f++) b.tick({ ...NULL_INPUT, block: true, move: dir, roll: f === 0 }, { ...NULL_INPUT });
  return b;
}

test('回避能从对手身体里滚过去——换边，不是把人推着走', () => {
  for (const c of CHARACTERS) {
    const b = rollThrough(c, 300, 360);
    expect(b.p1.x, `${c.name} 回避之后仍在对手身前，没有穿过去`).toBeGreaterThan(b.p2.x);
    // 穿过去之后朝向要跟着翻，否则会背对着对手站着
    expect(b.p1.facing, `${c.name} 穿身之后没有转身`).toBe(-1);
  }
});

test('被逼到版边时，回避是唯一的出口', () => {
  const c = CHARACTERS[0];
  const b = rollThrough(c, ARENA_MIN, ARENA_MIN + 45);
  expect(b.p1.x, '贴着左墙向前回避没能滚到对手另一侧').toBeGreaterThan(b.p2.x);
});

test('回避的收尾没有无敌——它是赌时机，不是无风险按键', () => {
  const c = CHARACTERS[0];
  const b = new Battle(structuredClone(c), structuredClone(c));
  b.p2.x = b.p1.x + 60;
  b.tick({ ...NULL_INPUT, block: true, move: 1, roll: true }, { ...NULL_INPUT });
  const inv: boolean[] = [];
  for (let f = 0; f < 30; f++) { inv.push(b.p1.invuln > 0); b.tick({ ...NULL_INPUT }, { ...NULL_INPUT }); }
  expect(inv.some(v => v), '回避中段应当有无敌').toBe(true);
  expect(inv.at(-1), '回避收尾不该还有无敌，否则就是无风险按键').toBe(false);
});

// ── 输入契约 ──────────────────────────────────────────────────────
// 这一组守的是曾经**整个反过来**的那件事：
//   · 先按住防御、再推方向（真实按法，也正是最需要回避的处境）—— 什么都不发生
//   · 从 idle 按住「防御 + 后退」（最常见的防守握法）—— 连滚不止，一帧都挡不住
// 根因是回避没有自己的输入位，引擎直接判 `block && move !== 0`：条件每帧都成立，
// 而 idle/walk 之外（也就是"人已经在挡了"）根本没有这个分支。

test('按住防御再推方向——最需要回避的那一刻，回避要按得出来', () => {
  const c = CHARACTERS[0];
  const b = new Battle(structuredClone(c), structuredClone(c), 400, 500);
  for (let f = 0; f < 20; f++) b.tick(press({ block: true }), press());
  expect(b.p1.state, '先按防御应当先进入格挡').toBe('block');
  b.tick(press({ block: true, move: -1, roll: true }), press());
  expect(b.p1.state, '已经在格挡时推方向，回避按不出来——最需要它的处境恰好是这一个').toBe('roll');
});

test('按住「防御 + 后退」不该连滚——那是防守握法，不是回避指令', () => {
  const c = CHARACTERS[0];
  const b = new Battle(structuredClone(c), structuredClone(c), 400, 500);
  const held = createHeld(), prev = createHeld();
  held.block = true; held.left = true;         // 两个键一直按着不放
  let rolls = 0, blocked = 0, was = false;
  for (let f = 0; f < 120; f++) {
    b.tick(toInputFrame(held, prev), press({ attack: f % 12 === 0 }));
    if (b.p1.state === 'roll' && !was) rolls++;
    was = b.p1.state === 'roll';
    if (b.p1.state === 'block') blocked++;
  }
  // 方向是**新按下**的只有第一帧，所以最多滚一次，其余时间必须真的在挡
  expect(rolls, `按住防+后滚了 ${rolls} 次——按住不放不该反复触发回避`).toBeLessThanOrEqual(1);
  // 120 帧里那一次合法的回避要占掉约 30 帧（回避动作本身），剩下的必须都在挡。
  // 旧契约下这个数是 **0**：人从头滚到尾，防御键等于没按
  expect(blocked, `按住防+后只挡了 ${blocked} 帧，人一直在滚，等于没有防御`).toBeGreaterThan(80);
});

test('输入层：回避来自「防御 + 新按方向」，且只在按下那一帧', () => {
  const held = createHeld(), prev = createHeld();
  held.block = true;
  expect(toInputFrame(held, prev).roll, '只按防御不该有回避').toBe(false);
  held.right = true;
  expect(toInputFrame(held, prev).roll, '防御按着、新推方向应当合成回避').toBe(true);
  expect(toInputFrame(held, prev).roll, '方向按住不放，第二帧起不该再触发').toBe(false);
  // 没按防御时推方向就是走路，不该滑进回避
  const h2 = createHeld(), p2 = createHeld();
  h2.right = true;
  expect(toInputFrame(h2, p2).roll, '没按防御却合成了回避').toBe(false);
});
