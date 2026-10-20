import { expect, test } from 'vitest';
import { AI_ACTIONS } from '../src/engine/ai';
import aiSrc from '../src/engine/ai.ts?raw';

/**
 * AI 能抽到的每个动作，都得**真的被实现**。
 *
 * 这条守的是上一轮那个坑的另一半：aiBias 拼错动作名会让 AI 呆立一个决策窗，
 * 已经由校验器拦住了；但**代码这边**同样能制造它——往 AI_ACTIONS 里加一个动作、
 * 忘了写对应的分支，后果一模一样：pick() 抽中它，没有分支接手，
 * 输入原样是 NULL_INPUT，AI 站着发呆 26~30 帧，每次抽到都发一次呆。
 *
 * TypeScript 帮不上忙：那个 switch **没有 default**，也没有穷尽性检查
 *（加了 default 反而会把"漏写分支"这件事变成合法的静默兜底）。
 *
 * 动作分两处派发：能一帧发完的走 switch 的 case，
 * 需要连续几帧输入形态的（双击跑、后跳、回避、蓄气、吹飞）走 switch 之前的早返回。
 * 两种都算实现了。
 */

/** 'idle' 是**故意**不派发的：它的语义就是这一窗什么都不做 */
const INTENTIONALLY_UNHANDLED = new Set(['idle']);

test('AI_ACTIONS 里的每个动作都有分支接手——漏一个就是每次抽到都发呆半秒', () => {
  const missing = AI_ACTIONS.filter(a => {
    if (INTENTIONALLY_UNHANDLED.has(a)) return false;
    return !new RegExp(`case '${a}':|current === '${a}'`).test(aiSrc);
  });
  expect(missing, `这些动作能被抽中却没有任何分支接手：${missing.join(' ')}`
    + '——AI 抽到它们会呆立一个决策窗，而且不报任何错').toEqual([]);
});

test('故意不派发的那一个仍然是 idle，别让这份豁免悄悄长大', () => {
  // 豁免名单是这条断言唯一的漏洞：往里塞名字就能让上面那条闭嘴。
  // 钉死它，加豁免时必须改这里、也就必须解释为什么
  expect([...INTENTIONALLY_UNHANDLED]).toEqual(['idle']);
  expect(AI_ACTIONS, 'idle 不在动作表里了，这份豁免也该跟着删')
    .toContain('idle');
});

test('动作表本身没有重复项', () => {
  expect(new Set(AI_ACTIONS).size, `AI_ACTIONS 里有重复：${AI_ACTIONS.join(' ')}`)
    .toBe(AI_ACTIONS.length);
});
