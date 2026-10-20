import { expect, test } from 'vitest';
import { Battle } from '../src/engine/battle';
import { CHARACTERS } from '../src/data/characters';
import { NULL_INPUT } from '../src/engine/types';

// 大招声明了 multiHit.hits 段，实际能不能全打到？
//
// 这条属性此前**没有任何守门**：dash 的冲量、carry 的中段推力、判定框宽高
// 三者要配合着把对手一路带着走，任何一处手滑都会让后半段打空——
// 而打空不报错、不掉帧，只是那一击少掉一半伤害，测试全绿。
// 十二个人 × 两档 × 长短两版 = 48 组，全是手写数据，正是最需要回归的地方。
//
// 长短两版都要量：完整版（十秒）只在**这一击能 KO** 时播，
// 短版（三秒）是打不死时播的那一版，两版的 dash/carry/段数各不相同。

/** 让 c 对着一个站桩放某一档大招，返回 [打到的段数, 声明的段数] */
function connect(c: typeof CHARACTERS[number], slot: 'sp50' | 'sp100', full: boolean): [number, number] {
  const b = new Battle(structuredClone(c), structuredClone(CHARACTERS[1]));
  b.p1.x = 380; b.p2.x = 470;
  b.p1.meter = 100;
  // 完整版靠"这一击打得死"触发；短版靠"打不死"。血量是唯一的开关（见 Move.brief）
  const hp = full ? c.moves[slot].damage : 9999;
  b.p2.hp = hp; b.p2.def.hp = hp;
  b.tick({ ...NULL_INPUT, super: slot === 'sp100' }, { ...NULL_INPUT });
  if (slot === 'sp50') { b.p1.meter = 50; b.tick({ ...NULL_INPUT, super: true }, { ...NULL_INPUT }); }
  const m = b.p1.move;
  if (!m || m.slot !== slot) return [0, -1];
  const want = m.multiHit?.hits ?? 1;
  let got = 0;
  for (let f = 0; f < m.startup + m.active + m.recovery + 10; f++) {
    b.tick({ ...NULL_INPUT }, { ...NULL_INPUT });
    for (const ev of b.events) if (ev.type === 'hit' && ev.attacker === 0) got++;
  }
  return [got, want];
}

// 红检记一笔：**第一次破坏没红**。把 carry 从 1.3 调到 9（每段把人推 9px）照样满段——
// 因为刑天 sp100 的判定框宽 350，24 段推出去 216px 还在框里。
// 判定框缩到 90 再配 carry 4 才报「只打到 14/24 段」。
// 也就是说这条断言守的是**推力与判定框宽度的配合**，不是单独守其中一个；
// 框够宽时推力再大也不算病（那正是 KOF「逼到版边再轰」要的效果）。
test('每个人的两档大招，长短两版都打得满段', () => {
  const bad: string[] = [];
  for (const c of CHARACTERS) {
    for (const slot of ['sp50', 'sp100'] as const) {
      for (const full of [false, true]) {
        const [got, want] = connect(c, slot, full);
        const tag = `${c.name} ${slot} ${full ? '完整版' : '短版'}`;
        if (want < 0) { bad.push(`${tag} 压根没放出来`); continue; }
        if (got < want) bad.push(`${tag} 只打到 ${got}/${want} 段`);
      }
    }
  }
  expect(bad, `大招打空了：${bad.join('；')}`).toEqual([]);
});
