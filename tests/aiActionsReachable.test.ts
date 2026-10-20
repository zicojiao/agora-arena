import { expect, test } from 'vitest';
import { AI_ACTIONS } from '../src/engine/ai';
import type { AiAction } from '../src/engine/ai';
import { RUN_AI, STAGES } from '../src/data/stages';

/**
 * AI_ACTIONS 里的每一项，都必须在**某张权重表的某个距离档**上有大于 0 的权重。
 *
 * 权重全是 0 的动作，pick() 永远抽不到它——它在类型里、在 switch 里、在文档里都存在，
 * 唯独在对局里不存在，而且不会报任何错。**"机动三件套（跑/回避/后跃）实测 0%"就是这么来的**：
 * 动作名早就写在 AI_ACTIONS 里，只是没有任何一张表给过它权重。
 * 挑衅、防御取消、MAX蓄气、吹飞攻击也各栽过一次。
 *
 * systemsAlive 那条是从**结果**那头查（跑 48 回合看它出不出现），要花几百毫秒模拟；
 * 这条是从**源头**查（表里给没给它机会），是纯数据检查，而且定位更准：
 * 它能直接说出"哪个动作、在哪张表上，一次机会都没有"。两条查的是同一件事的两端。
 */

const BANDS = ['near', 'mid', 'far'] as const;

/** 每个动作在所有关卡表里拿到过的最高权重 */
function bestWeight(): Map<AiAction, number> {
  const best = new Map<AiAction, number>(AI_ACTIONS.map(a => [a, 0]));
  for (const p of [...RUN_AI, ...STAGES.map(s => s.ai)]) {
    for (const band of BANDS) {
      for (const [k, v] of Object.entries(p[band]) as [AiAction, number][]) {
        if ((v ?? 0) > (best.get(k) ?? 0)) best.set(k, v ?? 0);
      }
    }
  }
  return best;
}

test('每个 AI 动作都至少在一张表上拿得到权重——否则它永远抽不到', () => {
  const best = bestWeight();
  const dead = AI_ACTIONS.filter(a => (best.get(a) ?? 0) <= 0);
  expect(dead, `这些动作在所有关卡表的所有距离档上权重都是 0，pick() 永远抽不到它们：${dead.join('、')}`)
    .toEqual([]);
});

test('权重表里没有 AI_ACTIONS 之外的键——拼错一个字母就是个永远不会执行的动作', () => {
  // ai.ts 的 switch 没有 default：抽中一个不认识的动作，输入原样返回 NULL_INPUT，
  // AI 站着发呆一整个决策窗，而 aiBias 的键是 Record<string, number>，TypeScript 拦不住拼错。
  const bad: string[] = [];
  for (const [i, p] of [...RUN_AI, ...STAGES.map(s => s.ai)].entries()) {
    for (const band of BANDS) {
      for (const k of Object.keys(p[band])) {
        if (!(AI_ACTIONS as readonly string[]).includes(k)) bad.push(`表${i}.${band}.${k}`);
      }
    }
  }
  expect(bad, `权重表里有 AI_ACTIONS 里没有的动作名（多半是拼错）：${bad.join('、')}`).toEqual([]);
});
