import { expect, test } from 'vitest';
import { Battle } from '../src/engine/battle';
import { aiSeed, createAi } from '../src/engine/ai';
import { CHARACTERS } from '../src/data/characters';
import { STAGES } from '../src/data/stages';
import { NULL_INPUT } from '../src/engine/types';

/**
 * BOSS 的开局不该每次都一样。
 *
 * 此前 AI 的种子是 `关卡序号 * 100 + 7`——**只看关卡**，全游戏一共六条随机流。
 * 平时看不出来，一重打就全暴露：末关单关胜率 18%，平均要打五六次，
 * 每次重打都是 Fight 重新挂载 → 新的 createAi → 流从第 0 位重来，
 * 于是同样的时机上前、同样那一发必杀、同样的防御节奏，一遍一遍。
 *
 * 这里量的不是"种子不同"（那是同义反复），是**打出来的动作序列不同**：
 * 种子只有经过权重表量化成动作之后，差异才真的到得了玩家眼前。
 * 相邻种子在 mulberry32 里数值上当然不一样，但两次抽样完全可能落进同一个权重桶，
 * 玩家看到的还是同一段开局。
 */

/** 让 AI 独自打一段（玩家不动），记录它每一帧的动作意图。 */
function opening(stageIdx: number, attempt: number, frames: number): string[] {
  const me = structuredClone(CHARACTERS[0]);
  const boss = structuredClone(CHARACTERS[3]);
  const b = new Battle(me, boss);
  const ai = createAi(STAGES[stageIdx].ai, aiSeed(stageIdx, attempt));
  const seq: string[] = [];
  for (let f = 0; f < frames && b.winner === null; f++) {
    const i = ai(b, 1);
    // 记录"这一帧 AI 按了什么"，而不是记录随机数：玩家能看见的只有按键的后果
    seq.push([i.move, i.jump ? 'J' : '', i.jumpHeld ? 'h' : '', i.attack ? 'A' : '',
      i.skill1 ? '1' : '', i.skill2 ? '2' : '', i.skill3 ? '3' : '',
      i.super ? 'U' : '', i.block ? 'B' : '', i.roll ? 'R' : ''].join(''));
    b.tick(NULL_INPUT, i);
  }
  return seq;
}

/** 两段序列第一次分岔在第几帧；始终一样就返回 Infinity。 */
function divergeAt(a: string[], b: string[]): number {
  for (let i = 0; i < Math.min(a.length, b.length); i++) if (a[i] !== b[i]) return i;
  return a.length === b.length ? Infinity : Math.min(a.length, b.length);
}

const FRAMES = 600;   // 十秒——玩家重打时"这一段我见过"的判断就发生在这个窗口里

test('同一关重打，BOSS 的开局不一样——而且很早就不一样', () => {
  for (let s = 0; s < STAGES.length; s++) {
    const first = opening(s, 0, FRAMES);
    for (const attempt of [1, 2, 3]) {
      const d = divergeAt(first, opening(s, attempt, FRAMES));
      expect(d, `第 ${s + 1} 关重打第 ${attempt} 次，十秒内和第一次一模一样`).toBeLessThan(FRAMES);
      // 十秒内分岔还不够：要在玩家还没打断节奏之前就分岔。两秒是"上前——试探——第一发"
      // 这一轮的长度（AI 每 26 帧换一次决策，两秒约四次决策）。
      expect(d, `第 ${s + 1} 关重打第 ${attempt} 次，前两秒和第一次逐帧相同`).toBeLessThan(120);
    }
  }
});

test('同一次进入还是可复现的——变的是"这一场"，不是每一帧都掷骰子', () => {
  for (let s = 0; s < STAGES.length; s++) {
    expect(opening(s, 2, 180), `第 ${s + 1} 关同种子两次跑出不同结果`).toEqual(opening(s, 2, 180));
  }
});

// 范围要够大：末关 18% 的胜率意味着重打次数能攒得很高，而最省事的线性式
//（stage * 100 + attempt）在关卡间距 100 处就开始混叠——"关0 的第 100 次"
// 和"关1 的第 0 次"是同一条流。只量到 40 次的话两种写法都是绿的，这条线就白画了。
test('种子本身不撞车：任何一关的任何两次重打都是不同的流', () => {
  const seen = new Map<number, string>();
  for (let s = 0; s < 12; s++) {
    for (let a = 0; a < 300; a++) {
      const v = aiSeed(s, a);
      expect(seen.has(v), `关${s}·第${a}次 的种子和 ${seen.get(v)} 撞了`).toBe(false);
      seen.set(v, `关${s}·第${a}次`);
    }
  }
});
