import { expect, test } from 'vitest';
import { Battle } from '../src/engine/battle';
import { createAi, pinning } from '../src/engine/ai';
import { CHARACTERS } from '../src/data/characters';
import { STAGES } from '../src/data/stages';
import { ARENA_MAX, ARENA_MIN, CORNERED } from '../src/engine/types';

// 实测过一次"版边根本不重要"：双方在版边的时间占 21.8%，而在版边挨的伤害也占 21.1%
//（完全成比例）；按被逼到角落的时间分档的胜率是 48/53/54/45%，一条平线。
// 再追一层看到原因：**76% 的离开版边是"直接走出去"**（翻滚 6%、后跳 5%、跳走 7%），
// 中位停留 1.3 秒。引擎的角落没问题（挡下不产生间距），是没人把你钉在那里——
// AI 把人逼到墙角后照样按权重表抽 retreat/backstep，自己退开了。
//
// 压制是**熟练度**，按关卡的 react 分档：前两关不会，后两关会。

function corner(sis: number[]) {
  let walked = 0, exits = 0, dmgIn = 0, dmgOut = 0, cornerFrames = 0, frames = 0;
  for (const si of sis) for (let a = 0; a < 4; a++) for (let b = 0; b < 4; b++) {
    if (a === b) continue;
    const bt = new Battle(structuredClone(CHARACTERS[a]), structuredClone(CHARACTERS[b]));
    const a1 = createAi(STAGES[si].ai, si * 101 + a * 13 + 1);
    const a2 = createAi(STAGES[si].ai, si * 57 + b * 7 + 3);
    const run = [0, 0];
    for (let f = 0; f < 60 * 120 && bt.winner === null; f++) {
      bt.tick(a1(bt, 0), a2(bt, 1));
      for (const [i, fg] of [bt.p1, bt.p2].entries()) {
        frames++;
        const c = fg.x - ARENA_MIN < CORNERED || ARENA_MAX - fg.x < CORNERED;
        if (c) { run[i]++; cornerFrames++; }
        else if (run[i] > 0) {
          exits++;
          // 「跑出去」和「走出去」是同一件事：都是自己脱身，不是被压制住。
          // 分开算是历史遗留——写这条时 AI 的"跑"每次只有 4 帧、几乎不成立，
          // 所以从没进过这个口径（见 docs/engine-notes.zh-CN.md「已经试过并退回的方向」表里
          // 「让 AI 真的跑起来」那一行：97% 的 run 只有 4 帧，口径也是在那里改的）
          if (fg.state === 'walk' || fg.state === 'idle' || fg.state === 'run') walked++;
          run[i] = 0;
        }
      }
      for (const e of bt.events) if (e.type === 'hit' && !e.blocked) {
        const v = e.attacker === 0 ? bt.p2 : bt.p1;
        const c = v.x - ARENA_MIN < CORNERED || ARENA_MAX - v.x < CORNERED;
        if (c) dmgIn += e.damage; else dmgOut += e.damage;
      }
    }
  }
  return {
    walkOut: walked / exits,
    dmgShare: dmgIn / (dmgIn + dmgOut),
    timeShare: cornerFrames / frames,
    exits,
  };
}

test('后面的关卡会把人钉在墙角——不能再溜达出去', () => {
  const early = corner([0, 1]), late = corner([2, 3]);
  expect(early.exits, '用例没成立：前两关没进过版边').toBeGreaterThan(40);
  expect(late.exits, '用例没成立：后两关没进过版边').toBeGreaterThan(40);
  // 实测 47% vs 28%
  expect(late.walkOut, `后两关有 ${Math.round(100 * late.walkOut)}% 的人直接走出版边，和前两关的 ${Math.round(100 * early.walkOut)}% 一样——压制没起作用`)
    .toBeLessThan(early.walkOut - 0.08);
});

// 这里原来还有两条断言，删掉了，原因如实记下——它们是**跨关卡档的比较**，从一开始就混淆：
//   ①「后两关在版边的时间要多于前两关」②「被钉在角落的一方更容易输」
// 后两关的版边时间本来就比前两关低（13.5% vs 23.7%），那是关卡强度差异不是压制造成的；
// 把 PIN_FLEE 设成 1（关掉压制）再量，后两关是 13.2%——几乎不动，对照证明了这一点。
// 真正守着压制的是下面两条：直接测那个纯函数，以及"对手贴墙时 AI 的后退率"。

test('pinning() 只砍逃跑类权重，别的一律不动', () => {
  const w = { attack: 6, skill1: 3, retreat: 4, backstep: 2, block: 3, idle: 2, charge: 1, approach: 3 };
  const out = pinning(w);
  for (const k of ['retreat', 'backstep', 'block', 'idle', 'charge'] as const) {
    expect(out[k]!, `${k} 是逃跑类，权重没被砍（${w[k]} → ${out[k]}）`).toBeLessThan(w[k]);
  }
  for (const k of ['attack', 'skill1', 'approach'] as const) {
    expect(out[k]!, `${k} 不是逃跑类，权重却被动了（${w[k]} → ${out[k]}）`).toBe(w[k]);
  }
});

test('会压制的关卡里，对手贴墙时 AI 明显更少后退', () => {
  let fleeC = 0, nC = 0;
  // 名册长到十二人之后这里还写着 4：只有四个人进采样，样本量不到实际的四分之一。
  // 这条断言比的是"压制开/关"的差，而它对随机流极其敏感——四人采样下同一条机制
  // 连着量出 开1.8/关2.9、开3.1/关3.0、开2.8/关3.0、开3.8/关2.4，**符号都会翻**。
  // 那不是效果在变，是样本不够。全名册采样把对局数从 32 提到 264。
  for (const si of [2, 3]) for (let a = 0; a < CHARACTERS.length; a++) for (let b = 0; b < CHARACTERS.length; b++) {
    if (a === b) continue;
    const bt = new Battle(structuredClone(CHARACTERS[a]), structuredClone(CHARACTERS[b]));
    const a1 = createAi(STAGES[si].ai, si * 101 + a * 13 + 1);
    const a2 = createAi(STAGES[si].ai, si * 57 + b * 7 + 3);
    for (let f = 0; f < 60 * 120 && bt.winner === null; f++) {
      bt.tick(a1(bt, 0), a2(bt, 1));
      for (const [me, foe] of [[bt.p1, bt.p2], [bt.p2, bt.p1]] as const) {
        if (Math.abs(foe.x - me.x) >= 150) continue;
        if (!(foe.x - ARENA_MIN < CORNERED || ARENA_MAX - foe.x < CORNERED)) continue;
        nC++;
        if (me.state === 'backstep'
          || (me.state === 'walk' && Math.sign(me.vx) === -Math.sign(foe.x - me.x))) fleeC++;
      }
    }
  }
  expect(nC, '用例没成立：后两关里没有"对手贴墙且贴身"的帧').toBeGreaterThan(5000);
  const rate = fleeC / nC;
  // 同口径实测（加了"能直接从格挡出招"之后重量）：压制开 2.6%，关掉 3.2%。
  // 线放在 3.0%——余量不宽，但引擎是确定性的，同一份种子必然回放同一个结果。
  //（改动前那次是 3.0% vs 4.0%，线在 3.5%。格挡能直接出招之后被压的一方脱身更容易，
  //  两个数一起下移了，所以线也跟着重定——阈值要跟着实测走，不能沿用旧的。）
  expect(rate, `对手贴墙时 AI 仍有 ${(100 * rate).toFixed(1)}% 的时间在后退，压制没生效`)
    .toBeLessThan(0.030);
}, 900_000);
