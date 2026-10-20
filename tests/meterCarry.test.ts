import { expect, test } from 'vitest';
import { playMatch } from './helpers';
import { Battle, carryOverMeter, ROUND_TIME } from '../src/engine/battle';
import { createAi } from '../src/engine/ai';
import { CHARACTERS } from '../src/data/characters';
import { STAGES } from '../src/data/stages';
import { roundOutcome } from './helpers';
import { hintFor, hintRank } from '../src/ui/TouchLayer';
import { DESPERATE_HP } from '../src/engine/types';

// 气槽此前每回合清零。实测后果：一局峰值平均只有 79，达到 100 的次数 0.31 次/回合，
// 超必杀因此 0.25 次/回合才出现一次——而到了 100 的那 15 次里 12 次真的放了，
// 说明不是"舍不得放"，是根本攒不到。经济本身就紧（每回合约生成 110-140 气，
// 而 50 档的奥义与爆气合计要花掉一百多），再加清零，攒气这条路被锁死两重。

test('保留是全额的，且钳在 0~100', () => {
  expect(carryOverMeter(0)).toBe(0);
  expect(carryOverMeter(79), '没有全额带过去').toBe(79);
  expect(carryOverMeter(100)).toBe(100);
  expect(carryOverMeter(140), '超过上限没有钳住').toBe(100);
  expect(carryOverMeter(-5), '负数没有钳住').toBe(0);
});

test('打完三局两胜之后，气槽确实能攒到 100', () => {
  // 按 App 的做法跑一场三局两胜：每回合新建 Battle，但把气带过去
  let reached = 0, plays = 0;
  for (let si = 0; si < 4; si++) for (let seed = 0; seed < 6; seed++) {
    let wins: [number, number] = [0, 0];
    let carry: [number, number] = [0, 0];
    const a1 = createAi(STAGES[1].ai, seed * 13 + 1), a2 = createAi(STAGES[si].ai, seed * 7 + 3);
    for (let guard = 0; guard < 5; guard++) {
      const b = new Battle(structuredClone(CHARACTERS[seed % 4]),
        structuredClone(CHARACTERS.find(c => c.id === STAGES[si].bossId)!));
      b.p1.meter = carryOverMeter(carry[0]);
      b.p2.meter = carryOverMeter(carry[1]);
      let hit100 = b.p1.meter >= 100 || b.p2.meter >= 100;
      for (let f = 0; f < ROUND_TIME && b.winner === null && !b.timeUp && !b.doubleKo; f++) {
        b.tick(a1(b, 0), a2(b, 1));
        if (b.p1.meter >= 100 || b.p2.meter >= 100) hit100 = true;
      }
      if (hit100) reached++;
      plays++;
      carry = [b.p1.meter, b.p2.meter];
      const r = roundOutcome(wins, b.winner, 2);
      if (r.done) break;
      wins = r.wins;
    }
  }
  const rate = reached / plays;
  // 清零时是 0.31 次/回合（约 16% 的回合里有人到过 100）。带过去之后应当明显更高
  expect(rate, `只有 ${Math.round(100 * rate)}% 的回合里有人攒到 100 气，超必杀仍然见不到`)
    .toBeGreaterThan(0.30);
}, 900_000);

// 气带过来了，但玩家看不出那是**上一回合攒的**——第二回合一开场就有大半管气，
// 很容易以为是白送的。提示条那条通道现成，而回合开头那段没有别的提示在抢。
test('回合开场会说明气是带过来的，且只在真的带了气时说', () => {
  const b = new Battle(structuredClone(CHARACTERS[0]), structuredClone(CHARACTERS[1]));
  b.p1.meter = 70;
  const opening = hintFor(b.p1, 30);
  expect(opening, `带了 70 气开场却没说明：「${opening}」`).toContain('带过来');
  expect(opening, '没把具体气量说出来，玩家对不上血条旁边那根槽').toContain('70');

  b.p1.meter = 0;
  expect(hintFor(b.p1, 30), '一点气都没带却还在说带过来了').not.toContain('带过来');

  b.p1.meter = 70;
  expect(hintFor(b.p1, 600), '开场那一段早过了还在说——它该让位给别的提示').not.toContain('带过来');
});

test('开场提示不会顶掉限时窗口的提示', () => {
  // 受身只有 14 帧，等不起。开场那条是普通情境提示，级别必须更低
  const b = new Battle(structuredClone(CHARACTERS[0]), structuredClone(CHARACTERS[1]));
  b.p1.meter = 70;
  const open = hintFor(b.p1, 30);
  expect(hintRank('快按 拳 或 防 —— 受身起身'), '开场提示的级别不该和限时窗口一样高')
    .toBeGreaterThan(hintRank(open));
});

// 气槽跨回合之后要防一件事：赢的一方如果系统性地带更多气进下一回合，
// 三局两胜就会滚雪球——输了第一回合会越打越难翻盘。
// 实测方向恰好相反：**回合输家带走 53.9 气，赢家只有 44.2**（差 -9.7）。
// 因为赢家在回合里把气花掉了（用奥义/爆气收尾），而输家挨打攒气、又没那么多机会花。
// 这正是 KOF97 的意图：挨打给气，是给翻盘用的。
//
// 这条平衡挂在 METER_ATK / METER_VIC 那两个系数上，改任一个都可能让它翻面。
test('回合赢家不会带着更多气进下一回合——三局两胜不该滚雪球', () => {
  let winCarry = 0, loseCarry = 0, n = 0;
  for (let si = 0; si < 4; si++) for (let seed = 0; seed < 12; seed++) {
    playMatch({
      me: CHARACTERS[seed % 4],
      boss: CHARACTERS.find(c => c.id === STAGES[si].bossId)!,
      hpScale: 1, dmgScale: 1,
      myAi: createAi(STAGES[1].ai, seed * 13 + 1),
      bossAi: createAi(STAGES[si].ai, seed * 7 + 3),
      roundTime: ROUND_TIME,
      onRound: b => {
        if (b.winner === null) return;
        winCarry += b.winner === 0 ? b.p1.meter : b.p2.meter;
        loseCarry += b.winner === 0 ? b.p2.meter : b.p1.meter;
        n++;
      },
    });
  }
  expect(n, '用例没成立：没有分出胜负的回合').toBeGreaterThan(60);
  const diff = (winCarry - loseCarry) / n;
  // 实测 -9.7（输家反而多）。线放在 +5：允许小幅噪声，挡住"赢家系统性地更富"
  expect(diff, `回合赢家平均多带 ${diff.toFixed(1)} 气进下一回合，三局两胜在滚雪球`)
    .toBeLessThan(5);
}, 900_000);

// 翻盘率：从残血（血量 <30%）打回来的比例。实测 37%——从最后三成血打回来超过三分之一，
// 这个数是健康的。它是一堆东西的合力（挨打给气、气跨回合、残血少逃、大招伤害），
// 任何一处改动都可能悄悄把它压没，而那时对局会变成"先掉到三成血就等于输了"。
//
// 顺带记两个量出来但**没有**转化成结果的东西，免得后人重复发现：
//   · 进入残血那一刻手里的气量与翻盘率无关（0~24 气 41% / 25~49 37% / 50~99 37% / 100 气 32%）
//   · 「残血凶暴」对胜负完全中性（开 136/367、关 137/372，都是 37%）
test('从残血打回来的比例不该塌掉', () => {
  let w = 0, n = 0;
  for (let si = 0; si < 4; si++) for (let seed = 0; seed < 12; seed++) {
    // 「进入过残血」要在回合进行中记，onRound 只在回合末尾触发——所以挂在 myAi 上，
    // 它每逻辑帧都会被调用一次
    let entered = [false, false];
    const inner = createAi(STAGES[1].ai, seed * 13 + 1);
    playMatch({
      me: CHARACTERS[seed % 4],
      boss: CHARACTERS.find(c => c.id === STAGES[si].bossId)!,
      hpScale: 1, dmgScale: 1,
      myAi: (b, who) => {
        for (const [i, fg] of [b.p1, b.p2].entries()) if (fg.hp / fg.def.hp < DESPERATE_HP) entered[i] = true;
        return inner(b, who);
      },
      bossAi: createAi(STAGES[si].ai, seed * 7 + 3),
      roundTime: ROUND_TIME,
      onRound: b => {
        if (b.winner !== null) for (const i of [0, 1] as const) if (entered[i]) { n++; if (b.winner === i) w++; }
        entered = [false, false];
      },
    });
  }
  expect(n, '用例没成立：没有进入残血的例子').toBeGreaterThan(100);
  const rate = w / n;
  // 实测 37%。线放在 22%：留出噪声余量，但挡住"掉到三成血基本就输定了"
  expect(rate, `从残血打回来的比例只有 ${Math.round(100 * rate)}%，残血等于判死刑`).toBeGreaterThan(0.22);
}, 900_000);

// 开场提示原本排在 hintFor 判断链的**最前面**，于是回合开头 150 帧里
// 倒地受身、防御取消这些**限时窗口**的提示全被它压住——那正是最不能等的两条。
test('开场提示不压限时窗口：回合刚开始就倒地，仍然教受身', () => {
  const b = new Battle(structuredClone(CHARACTERS[0]), structuredClone(CHARACTERS[1]));
  const f = b.p1;
  f.meter = 70;                      // 带了气，开场提示的条件成立
  f.state = 'down'; f.stateFrame = 3; f.techable = true;
  expect(hintFor(f, 20), '回合刚开始倒地，提示还在讲带过来的气').toContain('受身');

  f.state = 'block'; f.stun = 3;     // 格挡硬直，防御取消的窗口
  expect(hintFor(f, 20), '回合刚开始被压住，提示还在讲带过来的气').toContain('防御取消');

  f.state = 'idle'; f.stun = 0;      // 没有限时窗口时才轮到它
  expect(hintFor(f, 20), '没有别的事时该讲带过来的气').toContain('带过来');
});

// 共用的对局模型（tests/helpers.ts 的 playMatch）必须和 App 一样带气跨回合。
// 它此前没有任何测试守着：把带气那两行删掉，pickFairness 和上面这些照样全绿——
// 因为它们的断言都打在"结果"上（极差、翻盘率），而带不带气都能满足。
// 这一条直接打在模型本身：第二回合开局的气必须等于第一回合结束时的气。
test('playMatch 会把气带进下一回合——模型不能和真实游戏分家', () => {
  const seen: number[] = [];          // 每回合开局时 p1 的气
  const ends: number[] = [];          // 每回合结束时 p1 的气
  let lastBattle: Battle | null = null;
  const ai = createAi(STAGES[1].ai, 7);
  playMatch({
    me: CHARACTERS[0],
    boss: CHARACTERS.find(c => c.id === STAGES[3].bossId)!,
    hpScale: 1, dmgScale: 1,
    myAi: (b, w) => {
      if (b !== lastBattle) { lastBattle = b; seen.push(b.p1.meter); }
      return ai(b, w);
    },
    bossAi: createAi(STAGES[3].ai, 11),
    roundTime: ROUND_TIME,
    onRound: b => ends.push(b.p1.meter),
  });
  expect(seen.length, '用例没成立：整场只打了一个回合，看不到"带过去"').toBeGreaterThan(1);
  expect(seen[0], '第一回合不该带气').toBe(0);
  for (let i = 1; i < seen.length; i++) {
    expect(seen[i], `第 ${i + 1} 回合开局气是 ${seen[i]}，而上一回合结束时是 ${ends[i - 1]}——没带过去`)
      .toBe(carryOverMeter(ends[i - 1]));
  }
  // 前置条件要的是"带过去的气看得出来"，而不是某个具体数字。
  // 写死 >20 会跟着任何影响对局节奏的改动一起漂（回避收成显式输入之后这里读到 18，
  // 而真正被测的性质——气有没有带过去——一直是好的）。直接问那件事本身：
  expect(carryOverMeter(ends[0]),
    `用例没成立：第一回合结束时攒到 ${ends[0]} 气，折算过去是 0，带不带都看不出来`)
    .toBeGreaterThan(0);
});
