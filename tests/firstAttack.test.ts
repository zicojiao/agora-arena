import { expect, test } from 'vitest';
import { BannerSystem } from '../src/render/banner';
import { Battle } from '../src/engine/battle';
import { createAi } from '../src/engine/ai';
import { CHARACTERS } from '../src/data/characters';
import { STAGES } from '../src/data/stages';

// 「先制」不是装饰。实测 317 个回合：先手命中方最终获胜 61.2%，比五五开高出 4.0 个标准误
//（逐关 64/59/70/53，最终关最弱，BOSS 翻盘余地最大）。所以这条提示报的是真信息。
// 这个项目的规矩是不加只为热闹的东西，所以这条相关性先量了再加。

test('一个回合只报一次先制——重复调用不能把计时重置', () => {
  const b = new BannerSystem();
  expect(b.activeCount()).toBe(0);
  b.showFirstAttack(0);
  expect(b.activeCount(), '第一次没报出来').toBe(1);
  // 先制只有一个槽位，重复触发只是覆盖——所以不能靠 activeCount 去查"报了几次"
  //（第一版就是这么写的，把重复触发的守卫整个删掉它照样绿）。
  // 能分辨的是**计时有没有被重置**：走完大半条命再触发一次，若被重置就还活着。
  for (let i = 0; i < 40; i++) b.tick();
  b.showFirstAttack(1);
  for (let i = 0; i < 15; i++) b.tick();
  expect(b.activeCount(), '第二次调用把先制横幅的计时重置了——它该一个回合只认第一下').toBe(0);
});

test('横幅会自己过期，不会一直挂着', () => {
  const b = new BannerSystem();
  b.showFirstAttack(0);
  for (let i = 0; i < 200; i++) b.tick();
  expect(b.activeCount(), '先制横幅到期没有熄灭').toBe(0);
});

test('新的一局是新的 BannerSystem——先制标记随之复位', () => {
  // BannerSystem 与 Battle 生命周期一一对应（见 GameCanvas 里那条注释），
  // 所以"按回合复位"不是靠代码里某个 reset，而是靠这个对应关系。这条把它钉住。
  const a = new BannerSystem();
  a.showFirstAttack(0);
  for (let i = 0; i < 200; i++) a.tick();
  const next = new BannerSystem();
  next.showFirstAttack(1);
  expect(next.activeCount(), '新一局报不出先制了').toBe(1);
});

test('真实对局里先制确实与胜负相关——这条提示不是装饰', () => {
  // 样本量按算术定，不是随手填的：真值约 61%，要和五五开分开就得让标准误小到分得开。
  // 4 关 × 24 种子 × 两侧 = 192 个回合，标准误 √(0.25/192) ≈ 3.5 点，阈值放在 53%
  // 时误报概率约 1%。第一版只跑了 38 个回合（标准误 8.1 点）量到 53%，当场就红了——
  // 那不是游戏变了，是在噪声底下断言（见 docs/engine-notes.zh-CN.md「当前实测状态（基线快照）」
  // 那节末尾那句"下结论前先看样本量"：同一个胜率 24 场量到 96%、80 场量到 86%）。
  let firstWins = 0, n = 0;
  for (let si = 0; si < 4; si++) for (let s = 0; s < 24; s++) for (const swap of [false, true]) {
    const a = swap ? (s + 1 + si) % 4 : s % 4, bi = swap ? s % 4 : (s + 1 + si) % 4;
    const bt = new Battle(structuredClone(CHARACTERS[a]), structuredClone(CHARACTERS[bi]));
    const a1 = createAi(STAGES[si].ai, s * 13 + 1), a2 = createAi(STAGES[si].ai, s * 7 + 3);
    let first: 0 | 1 | null = null;
    for (let f = 0; f < 60 * 120 && bt.winner === null; f++) {
      bt.tick(a1(bt, 0), a2(bt, 1));
      if (first === null) for (const e of bt.events) {
        if ((e.type === 'hit' && !e.blocked)) { first = e.attacker; break; }
        if (e.type === 'throw') { first = e.attacker; break; }
      }
    }
    if (bt.winner === null || first === null) continue;
    n++; if (bt.winner === first) firstWins++;
  }
  expect(n, '用例没成立：分出胜负的回合太少，样本撑不起这条断言').toBeGreaterThan(150);
  expect(firstWins / n, `先制方胜率只有 ${Math.round(100 * firstWins / n)}%（${firstWins}/${n}），与胜负无关的话这条提示就是装饰`)
    .toBeGreaterThan(0.53);
}, 600_000);
