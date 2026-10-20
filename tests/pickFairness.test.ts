import { expect, test } from 'vitest';
import { playMatch } from './helpers';
import { ROUND_TIME } from '../src/engine/battle';
import { createAi } from '../src/engine/ai';
import { CHARACTERS } from '../src/data/characters';
import { STAGES, BOSS_HP_SCALE, BOSS_DMG_SCALE } from '../src/data/stages';

// 「用谁闯关」和「谁打得过谁」是两件事：矩阵是角色互打，而闯关的四个对手是定死的，
// 匹配关系会被固定对手放大，四关一复利差距还要再放大一次。
//
// 实测过一次真实的偏差：第二关的 BOSS 是二郎神（攻程 260，全场最长），
// 各角色在这一关的通关率完全按攻程排序——二郎神镜像 63% / 牛魔王 54% / 孙悟空 29% / 哪吒 25%，
// 四关复利下来选二郎神比选哪吒容易十倍（13% vs 1%）。

// 两种打法的陪练。**用单一陪练量"选谁更难"是不成立的**：同一份代码，
// 退型陪练下关4 的极差是 30 点（哪吒 5% 孙悟空 18% 二郎神 25% 牛魔王 35%），
// 压上型是 18 点（10% / 28% / 15% / 23%）——连名次都换了：
// 退型下二郎神最好、压上型下他最差（远程角色被逼着近身当然差）。
// 玩家是会挑打法的，所以每个角色取**它在两种打法下的较好者**，这才是他实际会遇到的难度。
const PROXY = { name: 'proxy', decideEvery: 26, react: 0.3,
  near: { attack: 5, block: 2, retreat: 4, skill2: 1, backstep: 2 },
  mid: { approach: 3, skill1: 4, skill3: 1, jump: 1, dash: 2, retreat: 2 },
  far: { approach: 2, skill1: 4, dash: 3, charge: 2 } } as never;
const RUSH = { name: 'rush', decideEvery: 26, react: 0.3,
  near: { attack: 7, block: 2, retreat: 1, skill2: 1 },
  mid: { approach: 5, dash: 3, skill1: 2, jump: 1 },
  far: { approach: 4, dash: 4, charge: 1 } } as never;
const STYLES = [PROXY, RUSH];

/** 用固定水平的陪练操作某个角色打完一关（三局两胜） */
function clearStage(ci: number, si: number, seed: number, style: unknown = PROXY): boolean {
  const st = STAGES[si];
  return playMatch({
    me: CHARACTERS[ci],
    boss: CHARACTERS.find(c => c.id === st.bossId)!,
    hpScale: BOSS_HP_SCALE[si], dmgScale: BOSS_DMG_SCALE[si],
    myAi: createAi(style as never, seed * 13 + 1),
    bossAi: createAi(st.ai, seed * 7 + 3),
    roundTime: ROUND_TIME,
  });
}

// 这条要跑 4 关 × 4 角色 × 2 种打法 × 20 种子 × 最多三回合，比默认 5 秒长；
// 给显式时限而不是缩样本。
//
// 样本量翻倍（两种打法各 20 局）还顺带治了另一个毛病：**max−min 在 N=20 下方差太大**。
// 同一份代码在种子 0-19 / 100-119 / 500-519 三批下，关4 的极差分别是 50 / 40 / 35 点，
// 骑在 45 这条线上来回跨。一条会随种子选择翻面的断言，报的是抽样而不是代码。
//
// 量的过程中曾发现一个缺口：**哪吒在第四关的通关率只有 5%**（三批种子都是 5%），
// 而其余三人在 15%~45%。当时判断是「哪吒 × 牛魔王」这个固定对位在三局两胜下复利放大。
//
// **后来它自己好了，如实记下**：气槽跨回合保留、爆气真的顶开、哪吒 n3 12→14
// 这几项累积之后重量，哪吒在最终关是 **25%**，与孙悟空持平（25%），低于二郎神（35%）。
// 也顺便验过关卡编排：把四个人分别放在最终关，通关率极差是
// 哪吒 10 点 / 孙悟空 35 点 / 二郎神 20 点 / **牛魔王 20 点**——现在这个收尾是合适的，
// 不需要改顺序（哪吒当 BOSS 虽然极差最小，但四人通关率全压到 20~30%，那是另一种问题）。
test('没有哪一关会因为选错角色就变成两倍难度', () => {
  // N=20 时这条量不准：同一份代码在 N=20 与 N=60 下四关极差读出
  // **35/40/20/35** 与 **32/33/27/17**——关4 一格就差 18 点，而阈值只有 45 点。
  // 拿这种噪声去守 45 点的线，等于让平衡改动的成败随机。
  //（上一轮改 AI 中段判据时正是栽在这里：0.75 → 1 条失败、0.6 → 3 条失败，
  //  非单调，其实是在噪声里搜参数。）
  // 60 局/格 × 两种打法 = 每人每关 120 局，耗时从 6s 到 10s，换一条读得准的尺子。
  const N = 60;
  for (let si = 0; si < STAGES.length; si++) {
    // 每个角色在两种打法下各打 N 局，取较好的那一档
    const per = CHARACTERS.map((_, ci) => Math.max(...STYLES.map(style => {
      let w = 0;
      for (let seed = 0; seed < N; seed++) if (clearStage(ci, si, seed, style)) w++;
      return w / N;
    })));
    const report = CHARACTERS.map((c, i) => `${c.name} ${Math.round(per[i] * 100)}%`).join('  ');
    const hi = Math.max(...per), lo = Math.min(...per);
    expect(hi - lo, `关${si + 1} 各角色通关率差 ${Math.round((hi - lo) * 100)} 点　${report}`)
      .toBeLessThanOrEqual(0.45);
  }
// 240 秒不是"这条测试变慢了"，是它本来就贴着上限跑：N=60 × 12 角色 × 4 关的模拟，
// 实测 ~127 秒，而原来的上限是 120——多一个并行的测试文件抢 CPU 就会超时（就是这么发现的）。
// 不能靠砍 N 来提速：上面那段注释写着 N=20 时关4 的极差会读偏 18 点，样本量是这条断言的地基。
}, 240_000);

test('长手要配长收招——攻程最长的招不能同时收得最快', () => {
  // 一次真实的失衡就出在这条上：二郎神 s1 攻程 260（比哪吒的 186 长 40%），
  // 收招却只有 16 帧、和哪吒的 14 帧差不多，短手角色够不着又抓不到。
  const rows = CHARACTERS.flatMap(c => (['s1', 's2', 's3'] as const).map(k => ({
    who: `${c.name} ${k}`, reach: c.moves[k].hitbox.w, rec: c.moves[k].recovery,
  })));
  const longest = rows.reduce((a, b) => (b.reach > a.reach ? b : a));
  const fastest = rows.reduce((a, b) => (b.rec < a.rec ? b : a));
  expect(longest.who, `${longest.who} 攻程最长（${longest.reach}）却也是收招最快的`).not.toBe(fastest.who);
  // 攻程排前三的招，收招不能落在全场最快的三档里
  const byReach = [...rows].sort((a, b) => b.reach - a.reach).slice(0, 3);
  const fastRec = [...rows].sort((a, b) => a.rec - b.rec)[2].rec;
  for (const r of byReach) {
    expect(r.rec, `${r.who} 攻程 ${r.reach} 却只收招 ${r.rec} 帧——高回报没配上风险`)
      .toBeGreaterThan(fastRec);
  }
});
