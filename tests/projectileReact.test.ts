import { expect, test } from 'vitest';
import { Battle } from '../src/engine/battle';
import { createAi } from '../src/engine/ai';
import { CHARACTERS } from '../src/data/characters';
import { STAGES } from '../src/data/stages';
import { NULL_INPUT, type Dir, type InputFrame } from '../src/engine/types';

// 反应层要读三类东西：对手在出招、对手在空中、**有道具正朝我飞过来**。
// 第三类是后补的：道具一扔出去，对手立刻进收招，`foe.state === 'attack'` 就不成立了——
// 那一刻起 AI 眼里什么威胁都没有。实测那一版：道具在空中飞的约 3000 帧里
// AI 在防的只占 6%，而且**四关一模一样**（不随难度变），道具挡下率只有 7~22%。
//
// 后果不是"AI 略吃亏"：一个会补刀、会对空、会拉开的远程流，一次通关概率是 43%，
// 而同期那把中庸尺子只有 6%。补上之后远程流降到 27%，尺子几乎没动（6%→10%）——
// 代价精确落在利用盲区的那条路上。

/**
 * 二郎神站远处放光束，返回**干净打中的比例**（打实的次数 / 放出去的道具数）。
 *
 * 口径换过两次，两次都是因为量错了东西：
 *   · 「道具在飞的帧里 AI 在防的比例」——道具要飞约 500px，而反应范围只有最后 180px，
 *     前面那段全进分母，量出来被稀释到 10~21%（故障时 6~14%），看着像没改动多少。
 *   · 「挡下率」——AI 后来多了第三条出路（大跳跨过去），跳掉的那些道具既不算命中
 *     也不算挡下，从分子分母里一起消失，量出来反而下降。
 * 真正关心的是**道具有没有打实**，挡下/滚穿/跳过都算处理掉了，这个口径对三条出路一视同仁。
 */
function cleanHitRate(si: number, seeds: number): number {
  let fired = 0, clean = 0;
  const er = CHARACTERS.find(c => c.id === 'erlang')!;
  for (let s = 0; s < seeds; s++) {
    const b = new Battle(structuredClone(er), structuredClone(CHARACTERS[s % 4]));
    const ai = createAi(STAGES[si].ai, s * 13 + 1);
    let live = 0;
    for (let f = 0; f < 60 * 100 && b.winner === null; f++) {
      const to = (b.p2.x >= b.p1.x ? 1 : -1) as Dir;
      const d = Math.abs(b.p1.x - b.p2.x);
      const i: InputFrame = { ...NULL_INPUT };
      if (d < 110) { i.attack = true; i.move = -to as Dir; }
      else if (!(b.p1.cooldowns[er.moves.s1.id] > 0) && d < 520) i.skill1 = true;
      else if (d < 300) i.move = -to as Dir;
      else i.block = true;
      b.tick(i, ai(b, 1));
      const now = b.projectiles.filter(p => p.owner === 0).length;
      if (now > live) fired += now - live;
      live = now;
      for (const e of b.events) {
        if (e.type === 'hit' && e.attacker === 0 && !e.blocked && b.p1.state !== 'attack') clean++;
      }
    }
  }
  return fired ? clean / fired : 1;
}

test('飞来的道具 AI 有办法处理——挡下、滚穿、或者大跳跨过去', () => {
  const per = STAGES.map((_, i) => cleanHitRate(i, 24));
  const show = STAGES.map((s, i) => `${s.name} ${Math.round(per[i] * 100)}%`).join('  ');
  // 阈值按**红检实测**定，不是估的：
  //   三条出路都在：18 / 17 / 21 / 16%
  //   把「有道具飞来」那一整支摘掉：28 / 30 / 35 / 30%
  // 0.25 落在两者之间。（第一版凭感觉写了 0.6，而故障状态也才 0.35，红检根本不报——
  // 阈值不实测就是在写一条永远绿的断言。）
  for (let i = 0; i < per.length; i++) {
    expect(per[i], `第 ${i + 1} 关对飞来的道具几乎没有办法，干净挨打率　${show}`).toBeLessThan(0.25);
  }
}, 600_000);

// 翻滚/大跳穿越道具**只在有空间时才用**。贴脸时滚过去正好撞进对方的近身攻击里。
//
// 实测（远程流 bot，每关 60 场）：三条出路全开时它一次通关 31%、只留挡下 23%，
// 大跳单独 +5 点、翻滚 +3 点；而中庸尺子在三种配置下成绩完全一样（都是 6%）——
// 代价只落在"被远程压着"这一种处境。加了距离门限之后远程流 27%、尺子 8%，两头都改善。
//
// **这里没有对应的断言**，如实说明原因：写过一条"贴脸时滚/跳的帧占比 < 5%"，
// 但它数的是**所有**翻滚，而权重表里本来就有 roll、紧急回避也会产生翻滚——
// 隔离不出"道具触发的那一次"。实际量出来有门限 15.8%、无门限 11.1%，方向都是反的。
// 一条隔离不了机制的断言不如没有（见 docs/engine-notes.zh-CN.md「红检失灵的六种形态」④）。
// 守着这件事的是上面那条"干净挨打率"，以及 zonerCheese 那条通关概率上限。
