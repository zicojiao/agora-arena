import { expect, test } from 'vitest';
import { Battle } from '../src/engine/battle';
import { createAi } from '../src/engine/ai';
import { CHARACTERS } from '../src/data/characters';
import { NULL_INPUT } from '../src/engine/types';
import { STAGES } from '../src/data/stages';

// 上下段（拳皇的立ち/しゃがみガード）：站防挡不住下段，蹲防挡不住中段。
// 没有这一对，"按住防御"就能挡一切，防守是个不需要读招的按键。

test('下段（n2 扫堂）站防挡不住，蹲防挡得住', () => {
  for (const c of CHARACTERS) {
    expect(c.moves.n2.guard, `${c.name} 的 n2 应当是下段`).toBe('low');
    const res: Record<string, boolean> = {};
    for (const low of [false, true]) {
      const b = new Battle(structuredClone(c), structuredClone(c));
      b.p2.x = b.p1.x + 60;
      let blocked: boolean | null = null;
      for (let f = 0; f < 30 && blocked === null; f++) {
        // p1 直接出 n2；p2 全程按着防，low 决定站防还是蹲防
        b.tick({ ...NULL_INPUT, attack: f === 0 && false, skill1: false },
               { ...NULL_INPUT, block: true, crouch: low });
        if (f === 0) { b.p1.move = c.moves.n2; b.p1.state = 'attack'; b.p1.stateFrame = 0; }
        const h = b.events.find(e => e.type === 'hit');
        if (h && h.type === 'hit') blocked = h.blocked;
      }
      expect(blocked, `${c.name} n2 没打中，用例没成立`).not.toBeNull();
      res[low ? 'crouch' : 'stand'] = blocked!;
    }
    expect(res.stand, `${c.name} 的下段被站防挡住了`).toBe(false);
    expect(res.crouch, `${c.name} 的下段蹲防没挡住`).toBe(true);
  }
});

test('中段（跳跃攻击）蹲防挡不住，站防挡得住', () => {
  for (const c of CHARACTERS) {
    expect(c.moves.jA.guard, `${c.name} 的跳跃攻击应当是中段`).toBe('overhead');
    const res: Record<string, boolean> = {};
    for (const low of [false, true]) {
      const b = new Battle(structuredClone(c), structuredClone(c));
      b.p2.x = b.p1.x + 60;
      let blocked: boolean | null = null;
      for (let f = 0; f < 30 && blocked === null; f++) {
        b.tick({ ...NULL_INPUT }, { ...NULL_INPUT, block: true, crouch: low });
        if (f === 0) { b.p1.move = c.moves.jA; b.p1.state = 'attack'; b.p1.stateFrame = 0; }
        const h = b.events.find(e => e.type === 'hit');
        if (h && h.type === 'hit') blocked = h.blocked;
      }
      expect(blocked, `${c.name} 跳跃攻击没打中，用例没成立`).not.toBeNull();
      res[low ? 'crouch' : 'stand'] = blocked!;
    }
    expect(res.crouch, `${c.name} 的中段被蹲防挡住了`).toBe(false);
    expect(res.stand, `${c.name} 的中段站防没挡住`).toBe(true);
  }
});

test('一直站着防 会比 会切上下段 挨得多——上下段对人类玩家是真的有回报', () => {
  // 三种防守策略打同一套 AI 攻势，看挨多少伤害
  function taken(strategy: 'stand' | 'crouch' | 'react'): number {
    let dmg = 0;
    for (let seed = 0; seed < 12; seed++) {
      const b = new Battle(structuredClone(CHARACTERS[seed % 4]), structuredClone(CHARACTERS[(seed + 1) % 4]));
      const foe = createAi(STAGES[2].ai, seed * 7 + 3);
      const hp0 = b.p1.hp;
      for (let f = 0; f < 60 * 40 && b.winner === null; f++) {
        // react：对手在空中就站防，否则蹲防——这是"防对了"的上限
        const crouch = strategy === 'crouch' || (strategy === 'react' && b.p2.y <= 0);
        b.tick({ ...NULL_INPUT, block: true, crouch }, foe(b, 1));
      }
      dmg += hp0 - b.p1.hp;
    }
    return dmg;
  }
  const stand = taken('stand'), react = taken('react');
  // 站着不动挨的伤害必须明显高于会切段的——否则上下段等于没加
  expect(react, `一直站防挨 ${stand}，会切上下段挨 ${react}：切段没有回报`).toBeLessThan(stand * 0.9);
});
