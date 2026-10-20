import { expect, test } from 'vitest';
import { Battle } from '../src/engine/battle';
import { createAi } from '../src/engine/ai';
import { CHARACTERS } from '../src/data/characters';
import { STAGES } from '../src/data/stages';

// 拳皇 97 有连段伤害衰减（補正），这里**没有**——查过之后决定不加：
// 十二人全名册实测（132 对局 1600+ 段连段，占的是**挨打那一方自己**的血）
//   中位 10%　99%位 33%　最大 49%
// 也就是说寻常交手一次掉一成血，极限那一套（靠大招打出来的）不到五成，
// 与 KOF97 带大招的极限连段是一个量级。没有失控，加衰减会是给不存在的问题造解法。
//
// 但这条平衡是**从一堆数值里涌现**出来的，改任何一个招式伤害都可能悄悄破坏它，
// 而且不会有任何报错。所以把它钉在这里。
//
// 采样此前写死在 `si < 4 / a < 4 / b < 4`——那是名册还只有四个人时的边界。
// 名册涨到十二人之后这道门只看得见前四个，后八个（猪八戒 1.35 倍的投、刑天的霸体、
// 后羿的蓄力远射）想怎么超都不会报红。现在按名册长度走，加人自动进采样。
// 各人打出过的最狠一套：刑天 49 哪吒 47 二郎神 46 牛魔王 43 后羿 40 雷震子 40
// 红孩儿 37 铁扇 37 猪八戒 35 孙悟空 30 钟馗 27 白骨精 20。
// 顶到天花板的正是**刑天**——名册第 11 位，旧采样根本看不见他。

type Sample = {
  /** 每段连续受控（hitstun/倒地）里累计吃到的伤害，除以**挨打者自己**的血上限 */
  combos: number[];
  meterDmg: number;
  total: number;
};

let cached: Sample | null = null;

/**
 * 跑一批真实对局。两项性质（连段上限、气槽经济）量的是同一批对局，
 * 所以只跑一趟——此前是各跑各的，同样的仗打了三遍。
 */
function sample(): Sample {
  if (cached) return cached;
  const combos: number[] = [];
  let meterDmg = 0, total = 0;
  for (let a = 0; a < CHARACTERS.length; a++) for (let b = 0; b < CHARACTERS.length; b++) {
    if (a === b) continue;
    // 关卡（= AI 档位）跟着配对轮转，十二档都摊得到，不会全压在同一个难度上
    const si = (a + b) % STAGES.length;
    const bt = new Battle(structuredClone(CHARACTERS[a]), structuredClone(CHARACTERS[b]));
    const a1 = createAi(STAGES[si].ai, si * 101 + a * 13 + 1);
    const a2 = createAi(STAGES[si].ai, si * 57 + b * 7 + 3);
    const acc = [0, 0];
    for (let f = 0; f < 60 * 120 && bt.winner === null; f++) {
      const m1 = bt.p1.move, m2 = bt.p2.move;
      bt.tick(a1(bt, 0), a2(bt, 1));
      for (const [i, fg] of [bt.p1, bt.p2].entries()) {
        const locked = fg.state === 'hitstun' || fg.state === 'down';
        // 比的是挨打者自己的血：名册血量 190~215，拿全场最低的那个数当分母
        // 会把打在厚皮身上的连段算得比实际更狠
        if (!locked && acc[i] > 0) { combos.push(acc[i] / (i === 0 ? CHARACTERS[a] : CHARACTERS[b]).hp); acc[i] = 0; }
      }
      for (const e of bt.events) {
        if (e.type !== 'hit' || e.blocked) continue;
        acc[e.attacker === 0 ? 1 : 0] += e.damage;
        total += e.damage;
        const mv = e.attacker === 0 ? m1 : m2;
        if (mv && mv.meterCost > 0) meterDmg += e.damage;
      }
    }
    // 收尾必须补一次：flush 的条件是"挨打者脱离硬直"，而**打死人的那一套**
    // 挨打者再也不会脱离硬直，循环也在 winner 出现时就停了——于是全场最狠的连段
    // 恰恰是唯一量不到的那一类。旧版少了这一步，红检因此漏判（把猪八戒 n3 从 15
    // 抬到 150、一下打掉七成半血，三条断言全绿）。
    for (const [i, hp] of [CHARACTERS[a].hp, CHARACTERS[b].hp].entries()) {
      if (acc[i] > 0) combos.push(acc[i] / hp);
    }
  }
  combos.sort((x, y) => x - y);
  cached = { combos, meterDmg, total };
  return cached;
}

const at = (d: number[], q: number) => d[Math.floor(d.length * q)];

test('一套连段拿不走半条血——没有伤害衰减，靠数值本身守住', () => {
  const { combos } = sample();
  expect(combos.length, '用例没成立：一段连段都没量到').toBeGreaterThan(800);
  const worst = combos[combos.length - 1];
  const show = `　99%位 ${Math.round(at(combos, 0.99) * 100)}%　中位 ${Math.round(at(combos, 0.5) * 100)}%`;
  // 0.55：实测 0.49，留出余量但挡住"一套带走半条血还有余"
  expect(worst, `一套连段能拿走 ${Math.round(worst * 100)}% 的血${show}`).toBeLessThan(0.55);
});

test('寻常交手不该一下掉一大截——中位数要低', () => {
  const { combos } = sample();
  // 实测中位 10%。0.18 这条线挡住"随手一套就两成血"——
  // 那会让对局变成三四次交手就结束，读招和压制都来不及发生
  expect(at(combos, 0.5), `寻常一套连段就掉 ${Math.round(at(combos, 0.5) * 100)}% 的血，对局会短得来不及博弈`)
    .toBeLessThan(0.18);
});

// 气槽经济：这个游戏靠什么决胜？吃气的招（奥义 50 / 超必杀 100 / 爆气）
// 若占了大半伤害，对局就从"对拳"变成"攒气"——那是另一个游戏。
// 这条同样是涌现出来的：改气槽增益 METER_ATK/METER_VIC、或改大招伤害都会动它。
test('吃气的招不该主导伤害——胜负靠对拳，不是靠攒气', () => {
  const { meterDmg, total } = sample();
  expect(total, '用例没成立：一点伤害都没量到').toBeGreaterThan(1000);
  const share = meterDmg / total;
  // 门槛按红检定：把两档大招伤害各翻三倍后是 26%，所以 0.30（第一版）挡不住那种量级。
  // 收到 0.20：离实测仍有明显余量，而三倍改动会被挡下。
  expect(share, `吃气的招占了 ${Math.round(100 * share)}% 的伤害，对局重心从对拳挪到了攒气`)
    .toBeLessThan(0.20);
}, 900_000);
