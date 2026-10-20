import { expect, test } from 'vitest';
import { Battle, TAUNT_SAFE } from '../src/engine/battle';
import { createAi } from '../src/engine/ai';
import { CHARACTERS } from '../src/data/characters';
import { STAGES } from '../src/data/stages';

/**
 * 挑衅此前实测**每回合 0.00 次**：整套东西都在（十二个人各一句台词、削对手 10 气、
 * 冷却、动作），只有 AI 从来不做，于是玩家在对局里永远撞不见它——
 * 和「机动三件套」当初那次是同一种死法（见 AiAction 的注释）。
 *
 * 分档与其他熟练度一致：前两关不会，后两关会。
 */

function taunts(si: number): { rate: number; unsafe: number; rounds: number } {
  let t = 0, unsafe = 0, rounds = 0;
  for (let a = 0; a < CHARACTERS.length; a++) for (let b = 0; b < CHARACTERS.length; b++) {
    if (a === b) continue;
    const bt = new Battle(structuredClone(CHARACTERS[a]), structuredClone(CHARACTERS[b]));
    const a1 = createAi(STAGES[si].ai, a * 13 + b * 7 + 1);
    const a2 = createAi(STAGES[si].ai, a * 31 + b * 5 + 3);
    rounds++;
    for (let f = 0; f < 60 * 120 && bt.winner === null; f++) {
      bt.tick(a1(bt, 0), a2(bt, 1));
      for (const [i, fg] of [bt.p1, bt.p2].entries()) {
        if (!fg.move?.id.includes('_taunt') || fg.stateFrame !== 0) continue;
        t++;
        // 挑衅只该发生在隔着大半个场子的时候（权重只写在 far 档）
        const foe = i === 0 ? bt.p2 : bt.p1;
        if (Math.abs(foe.x - fg.x) <= TAUNT_SAFE) unsafe++;
      }
    }
  }
  return { rate: t / rounds, unsafe, rounds };
}

test('后两关会挑衅，前两关不会——和其他熟练度一样分档', () => {
  const early = [taunts(0).rate, taunts(1).rate];
  const late = [taunts(2).rate, taunts(3).rate];
  for (const [i, r] of early.entries()) {
    expect(r, `关${i + 1} 挑衅了 ${r.toFixed(2)} 次/回合——教学关不该嘲讽玩家`).toBe(0);
  }
  for (const [i, r] of late.entries()) {
    // 实测 0.29 / 0.30，约等于每场三局能见到一次。这条守的是"别又回到 0.00"：
    // 一个玩家在对局里撞不见的系统，对他就等于不存在
    expect(r, `关${i + 3} 只挑衅了 ${r.toFixed(2)} 次/回合，玩家基本撞不见`).toBeGreaterThan(0.1);
    // 上限同样要守：挑衅 47 帧站着不动，满场嘲讽的 BOSS 是在送
    expect(r, `关${i + 3} 每回合挑衅 ${r.toFixed(2)} 次，太频繁了`).toBeLessThan(1.5);
  }
});

// 挑衅要 47 帧站着不动，而倒地只有 52 帧、可受身的话对手还能提前爬起来。
// 试过给近身档加权重（把人打倒了站旁边嘲讽，拳皇最经典的画面），两条实测都不答应：
//   ① 不问"来得及吗"就抽，一套连段当场从 49% 血涨到 **70%**——对手爬起来时
//      AI 正卡在 34 帧收招里挨打
//   ② 补上"对手确实起不来"的闸门之后仍然会废掉版边压制：挑衅不算逃跑类，
//      压制砍逃跑权重反而抬高它的份额，压制效果从「开 2.6%/关 3.8%」塌到「开 2.8%/关 3.0%」
// 所以权重只留在 far 档。这条断言守的就是这个边界。
test('挑衅只发生在够不着的距离上——它不该变成送人头的按键', () => {
  for (const si of [2, 3]) {
    const { unsafe, rate, rounds } = taunts(si);
    expect(unsafe, `关${si + 1} 有 ${unsafe} 次挑衅发在对手够得着的距离内`
      + `（共 ${(rate * rounds).toFixed(0)} 次）`).toBe(0);
  }
});
