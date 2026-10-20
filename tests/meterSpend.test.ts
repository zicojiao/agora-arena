import { expect, test } from 'vitest';
import { Battle, ROUND_TIME } from '../src/engine/battle';
import { createAi } from '../src/engine/ai';
import { CHARACTERS } from '../src/data/characters';
import { STAGES, BOSS_HP_SCALE, BOSS_DMG_SCALE } from '../src/data/stages';
import { NULL_INPUT } from '../src/engine/types';

// 第一关的权重表里本来没有 super，加上"能一击致命或自己残血才放"的门槛，
// 新手在教学关每回合只见到 0.08 次大招——游戏的招牌演出在教学关几乎不出现。
// 补进权重表之后是 0.47 次。
//
// 同一轮还试过在可用条件上加"气满了就放"，A/B 之后删了：带不带它数字一模一样，
// 因为满槽的大招本来就走连段分支（命中后取消进大招）那条路，绕过了可用条件。

/** 一个只会向前连打的新手，在这一关每回合能见到几次大招 */
function supersSeen(si: number, N = 32): number {
  const st = STAGES[si];
  let sup = 0;
  for (let seed = 0; seed < N; seed++) {
    const me = structuredClone(CHARACTERS[seed % CHARACTERS.length]);
    const boss = structuredClone(CHARACTERS.find(c => c.id === st.bossId)!);
    boss.hp = Math.round(boss.hp * BOSS_HP_SCALE[si]);
    for (const mv of Object.values(boss.moves)) mv.damage = Math.round(mv.damage * BOSS_DMG_SCALE[si]);
    const b = new Battle(me, boss);
    const ai = createAi(st.ai, seed * 7 + 3);
    for (let f = 0; f < ROUND_TIME && b.winner === null && !b.timeUp; f++) {
      b.tick({ ...NULL_INPUT, attack: true, move: 1 }, ai(b, 1));
      for (const e of b.events) if (e.type === 'super' && e.who === 1) sup++;
    }
  }
  return sup / N;
}

test('每一关都让新手见得到大招——包括教学关', () => {
  const seen = [0, 1, 2, 3].map(si => supersSeen(si));
  const report = seen.map((v, i) => `关${i + 1} ${v.toFixed(2)}`).join('  ');
  for (const [i, v] of seen.entries()) {
    // 阈值 0.3：实测权重表里没有 super 时是 0.19、有时是 0.47，要卡在两者之间才分得开。
    // 第一版写 0.15，比"完全不加"的 0.19 还低——红检时把 super 从表里删掉它照样绿，
    // 等于什么都没守。
    expect(v, `${report}——关${i + 1} 几乎见不到大招，招牌演出白做了`).toBeGreaterThan(0.3);
  }
});

test('气满了不该一直攒着——满槽是纯浪费（走的是连段取消那条路）', () => {
  const c = CHARACTERS[0];
  const b = new Battle(structuredClone(c), structuredClone(c));
  const ai = createAi(STAGES[0].ai, 7);
  b.p2.meter = 100;
  let fired = -1;
  for (let f = 0; f < 60 * 12 && b.winner === null; f++) {
    b.p2.meter = Math.max(b.p2.meter, 100);   // 一直保持满槽，排除"攒不够"这个解释
    b.tick({ ...NULL_INPUT }, ai(b, 1));
    if (b.events.some(e => e.type === 'super' && e.who === 1)) { fired = f; break; }
  }
  expect(fired, '满槽十二秒都没放出来，气就砸在手里了').toBeGreaterThanOrEqual(0);
});

test('气不满、对手也不残血时仍然存着——不能变成见气就放', () => {
  const c = CHARACTERS[0];
  const b = new Battle(structuredClone(c), structuredClone(c));
  const ai = createAi(STAGES[0].ai, 7);
  let fired = 0;
  for (let f = 0; f < 60 * 10 && b.winner === null; f++) {
    b.p2.meter = 60;                 // 够 50 但不满
    b.p1.hp = b.p1.def.hp;           // 对手满血：一击致命那条路走不通
    b.p2.hp = b.p2.def.hp;           // 自己满血：背水那条路也走不通
    b.tick({ ...NULL_INPUT }, ai(b, 1));
    fired += b.events.filter(e => e.type === 'super' && e.who === 1).length;
  }
  expect(fired, `半槽、双方满血时放了 ${fired} 次大招——气该存着等机会`).toBe(0);
});
