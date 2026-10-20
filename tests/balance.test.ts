import { expect, test } from 'vitest';
import { Battle } from '../src/engine/battle';
import { createAi } from '../src/engine/ai';
import { CHARACTERS } from '../src/data/characters';
import { STAGES } from '../src/data/stages';

// 这三条守的是"改一个数值，整盘平衡静默塌掉"这一类故障——它不报错、不崩溃，
// 只是让某个角色变成唯一正解，或者让某一关变成劝退墙，而其它测试全都照样绿。
//
// 实测发现的两次真实回归：
//   · 二郎神同时付三份代价（血最低+速度低+起手最慢），同档 AI 下总胜率 37%
//   · 牛魔王血 240 叠最高伤害，总胜率 70%，最后一关玩家胜率被压到 21%
// 引擎是确定性的，同一份种子必然回放出同一个结果，所以这些数字可以直接断言。

/** i 与 j 同档 AI 对打，返回 i 的胜场数。
 * 每个种子**两边各打一遍**（i 当先手、i 当后手），否则先手优势会混进角色强弱里读不出来：
 * 第一版只按 i 当先手统计，四个角色的"总胜率"全都落在 60~67%（合计 250%），
 * 那不是角色问题，是测量方法把先手优势算成了角色实力。 */
function duel(i: number, j: number, seeds: number): number {
  let w = 0;
  for (let seed = 0; seed < seeds; seed++) {
    for (const swap of [false, true]) {
      const [a, b2] = swap ? [j, i] : [i, j];
      const b = new Battle(structuredClone(CHARACTERS[a]), structuredClone(CHARACTERS[b2]));
      const a1 = createAi(STAGES[2].ai, seed * 13 + 1), a2 = createAi(STAGES[2].ai, seed * 7 + 3);
      for (let f = 0; f < 60 * 120 && b.winner === null; f++) b.tick(a1(b, 0), a2(b, 1));
      if (b.winner === (swap ? 1 : 0)) w++;
    }
  }
  return w;
}

test('没有角色是唯一正解，也没有角色是废牌', () => {
  const N = 10, n = CHARACTERS.length;
  const rate = CHARACTERS.map((_, i) => {
    let w = 0;
    for (let j = 0; j < n; j++) if (i !== j) w += duel(i, j, N);
    return w / (N * 2 * (n - 1)); // 每个种子打两遍
  });
  const report = CHARACTERS.map((c, i) => `${c.name} ${Math.round(rate[i] * 100)}%`).join('  ');
  // 单个角色的总胜率落在 35%~65% 内。克制关系（某个对位 70%+）是格斗游戏想要的，
  // 但"打谁都赢"或"打谁都输"不是。
  for (let i = 0; i < n; i++) {
    expect(rate[i], `${CHARACTERS[i].name} 总胜率越界　${report}`).toBeGreaterThan(0.35);
    expect(rate[i], `${CHARACTERS[i].name} 总胜率越界　${report}`).toBeLessThan(0.65);
  }
  // 名册长到八人之后这是 8×8=56 组对位（每组 10 种子 ×2 先后手），默认 5 秒不够。
  // 给显式时限而不是缩样本：样本量是这条断言的命根子
}, 600_000);
