import { expect, test } from 'vitest';
import { skillSlotFor, buttonView, shortName } from '../src/ui/TouchLayer';
import { CHARACTERS } from '../src/data/characters';

// 七颗键并成五颗：三颗技能键合成一颗，按下的那一刻由摇杆方向决定放哪一招。
// 这是格斗游戏本来的语法（方向+按键），也是把最挤的一对键（技三/大招，间隙 4.1px）
// 拆开的办法——那一对按错的代价最重：想放技三，出了大招，50-100 气当场蒸发。

test('摇杆方向决定放哪一招', () => {
  const none = { left: false, right: false, crouch: false };
  expect(skillSlotFor(none), '中立不是技一').toBe('s1');
  expect(skillSlotFor({ ...none, right: true }), '推方向不是技二').toBe('s2');
  expect(skillSlotFor({ ...none, left: true }), '推另一个方向也该是技二').toBe('s2');
  expect(skillSlotFor({ ...none, crouch: true }), '推下不是技三').toBe('s3');
  // 下 压过 横：斜下推的时候给一个确定的答案，不是看哪个判定先跑
  expect(skillSlotFor({ left: true, right: false, crouch: true }), '斜下推没有确定答案').toBe('s3');
});

test('不看朝向——同一个手势在翻面前后放同一招', () => {
  // 前后由面朝决定，而面朝会在对手跳过头顶时翻转。若按前/后分招，
  // 同一个手势在翻转前后出不同的招，那是最难受的一类不确定
  const push = { left: false, right: true, crouch: false };
  const pull = { left: true, right: false, crouch: false };
  expect(skillSlotFor(push)).toBe(skillSlotFor(pull));
});

test('键面写的是这一按真的会出的那一招', () => {
  const me = { def: CHARACTERS[0], meter: 0, cooldowns: {} as Record<string, number> };
  const btn = { key: 'skill1' as const, slot: null, fallback: '技能' };
  for (const [dir, slot] of [
    [{ left: false, right: false, crouch: false }, 's1'],
    [{ left: false, right: true, crouch: false }, 's2'],
    [{ left: false, right: false, crouch: true }, 's3'],
  ] as const) {
    const view = buttonView(btn, me, skillSlotFor(dir));
    expect(view.label, `${slot} 的键面写的不是它自己`).toBe(shortName(CHARACTERS[0].moves[slot].name));
  }
  // 没传方向时回落到「技能」两个字，不会显示成空白
  expect(buttonView(btn, me).label).toBe('技能');
});

test('冷却也跟着切——键面上是哪一招，转的就是哪一招的冷却', () => {
  const c = CHARACTERS[0];
  const me = { def: c, meter: 0, cooldowns: { [c.moves.s3.id]: c.moves.s3.cooldown } };
  const btn = { key: 'skill1' as const, slot: null, fallback: '技能' };
  expect(buttonView(btn, me, 's3').cooling, '技三正在冷却，键面却是就绪的').toBeGreaterThan(0);
  expect(buttonView(btn, me, 's1').cooling, '技一没冷却却显示在转').toBe(0);
});
