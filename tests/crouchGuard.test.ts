import { expect, test } from 'vitest';
import { Battle } from '../src/engine/battle';
import { CHARACTERS } from '../src/data/characters';
import { CROUCH_HEIGHT, NULL_INPUT } from '../src/engine/types';

// 蹲防的受击框。原来只认 'crouch' 状态：单纯蹲下矮一截，蹲着防却仍是站立高度——
// 于是"蹲下"能整个躲开的招（哪吒 n1、二郎神 s1，判定框都在 68 以上），
// "蹲着防"反而躲不过，只能挡下来吃削减伤害。蹲防本来就该矮一截。

/** 让 p1 出某一招打向 p2，p2 按指定姿势应对，返回这一下是躲开 / 挡下 / 挨打 */
function outcome(atk: typeof CHARACTERS[number], slot: 'n1' | 'n2', p2: 'stand' | 'crouchBlock' | 'standBlock') {
  const b = new Battle(structuredClone(atk), structuredClone(atk));
  b.p2.x = b.p1.x + 60;
  const inp = p2 === 'stand' ? { ...NULL_INPUT }
    : { ...NULL_INPUT, block: true, crouch: p2 === 'crouchBlock' };
  for (let f = 0; f < 30; f++) {
    b.tick({ ...NULL_INPUT }, inp);
    if (f === 0) { b.p1.move = atk.moves[slot]; b.p1.state = 'attack'; b.p1.stateFrame = 0; }
    const h = b.events.find(e => e.type === 'hit');
    if (h && h.type === 'hit') return h.blocked ? '挡下' : '挨打';
  }
  return '躲开';
}

test('蹲防和蹲下一样矮——高过蹲防头顶的招整个躲开，不是挡下', () => {
  const nezha = CHARACTERS.find(c => c.id === 'nezha')!;
  // 哪吒 n1 的判定框在 70-100，整个高过蹲下的受击框（68）
  expect(nezha.moves.n1.hitbox.y, '用例前提：n1 的框要高过蹲防头顶').toBeGreaterThanOrEqual(CROUCH_HEIGHT);
  expect(outcome(nezha, 'n1', 'crouchBlock'), '蹲防没能从 n1 底下躲过去').toBe('躲开');
  expect(outcome(nezha, 'n1', 'standBlock'), '站防该挡下 n1').toBe('挡下');
});

test('贴地的下段照样打得到蹲防——矮不等于无敌', () => {
  for (const c of CHARACTERS) {
    // n2 是下段扫堂，判定框贴着地面
    expect(c.moves.n2.hitbox.y, `${c.name} 的 n2 该贴着地面`).toBeLessThan(CROUCH_HEIGHT);
    expect(outcome(c, 'n2', 'crouchBlock'), `${c.name} 的下段被蹲防躲开了`).toBe('挡下');
    expect(outcome(c, 'n2', 'standBlock'), `${c.name} 的下段被站防挡住了`).toBe('挨打');
  }
});
