import { expect, test } from 'vitest';
import { Battle } from '../src/engine/battle';
import { createAi } from '../src/engine/ai';
import { CHARACTERS } from '../src/data/characters';
import { STAGES } from '../src/data/stages';
import { NULL_INPUT, type Dir, type InputFrame } from '../src/engine/types';

// 跳跃攻击是这个游戏里**唯一的中段**（jA 标了 guard: 'overhead'，蹲防挡不住）。
// 没有对空的时候它是无解的：一个调好时机的小跳跳入（第 6 帧出 jA、落地接普攻）
// 实测四关全线 100% / 100% / 88% / 79%——一次通关的概率 70%，一个键打穿整个游戏。
//
// 成因不是"AI 反应不够快"，而是它**只读出招、不读起跳**：跳跃途中对手的状态是
// 'jump' 不是 'attack'，等 jA 出手（起手 5 帧）反应层才醒，来不及。
// 而且読み的 key 当时是按状态拼的，对手从 'jump' 变 'attack' 那一刻 key 变了、
// 読み被低的 react 重掷一次丢掉——正好丢在最该生效的瞬间（挡下率 21%）。
//
// 断言挂在**一次通关的概率**（四关胜率之积）上，不是逐关阈值：
// 逐关阈值要为每一关挑一个数，而玩家关心的本来就是"这一招能不能带我打穿"。
// 跳入是最强的单一工具没问题（它该是），不能是通关解。

/** 小跳跳入机器人：走到 150 内 → 小跳 → 第 atk 帧出手 → 落地接一记普攻 */
function jumpIn(atk: number) {   // eslint-disable-line @typescript-eslint/no-unused-vars
  let airborne = false;
  return (b: Battle, w: 0 | 1): InputFrame => {
    const me = w === 0 ? b.p1 : b.p2, foe = w === 0 ? b.p2 : b.p1;
    const to = (foe.x >= me.x ? 1 : -1) as Dir;
    const i: InputFrame = { ...NULL_INPUT };
    if (me.state === 'jump') {
      airborne = true; i.move = to;
      if (me.stateFrame === atk) i.attack = true;   // 不按 jumpHeld = 小跳
      return i;
    }
    if (airborne) { airborne = false; i.attack = true; return i; }
    if (Math.abs(foe.x - me.x) > 150) { i.move = to; return i; }
    i.jump = true; i.move = to; return i;
  };
}

/** 某一种出手时机在某一关的胜率 */
function winRate(si: number, atk: number, N: number): number {
  const st = STAGES[si];
  let win = 0, n = 0;
  for (let s = 0; s < N; s++) for (const swap of [false, true]) {
    const pi = s % 4, ei = (s + 1 + si) % 4;
    const [A, B] = swap ? [ei, pi] : [pi, ei];
    const b = new Battle(structuredClone(CHARACTERS[A]), structuredClone(CHARACTERS[B]));
    const ai = createAi(st.ai, s * 13 + 1), bot = jumpIn(atk);
    for (let f = 0; f < 60 * 180 && b.winner === null; f++) {
      const me = (swap ? 1 : 0) as 0 | 1;
      const mine = bot(b, me);
      b.tick(me === 0 ? mine : ai(b, 0), me === 0 ? ai(b, 1) : mine);
    }
    n++; if (b.winner === (swap ? 1 : 0)) win++;
  }
  return win / n;
}

/**
 * 出手时机要扫，不能钉死一个。
 *
 * 这是踩过的坑：早先的版本钉在第 6 帧，而那正好是**弱的**那一档。
 * 实测同一个跳入，出手帧不同差得很远（每格 24 场）：
 *   第4帧  33/46/13/46 → 通关 1%      第8帧  46/50/50/38 → 通关 4%
 *   第6帧  33/46/33/42 → 通关 2%      第12帧 71/75/79/67 → 通关 28%
 * 小跳滞空 25 帧，出手越晚，判定框越是停在弧线最低点上——砸得更深、对手反应时间更短。
 * 钉死一个时机的守门量的是"我碰巧写的那个用法"，玩家会找到最好的那个。
 */
const TIMINGS = [6, 10, 12];

test('单靠跳入打不穿整条阶梯', () => {
  const N = 10;                                   // 20 场/关 × 3 种时机
  const rates = STAGES.map((_, si) => Math.max(...TIMINGS.map(t => winRate(si, t, N))));
  const clear = rates.reduce((a, r) => a * r, 1);
  const show = STAGES.map((s, i) => `${s.name} ${Math.round(rates[i] * 100)}%`).join('  ')
    + `　→ 一次通关概率 ${Math.round(clear * 100)}%`;
  // 0.45：故障时（没有对空）是 70%，现在按最强时机量是 28%，两边都留着余量。
  // 这里取的是三种时机里最强的那一个，所以门槛比按单一时机量时该放宽一点
  expect(clear, `跳入一个套路就能打穿全场　${show}`).toBeLessThan(0.45);
}, 600_000);

// 上面那条守的是**性质**（跳入打不穿阶梯），这一条守**机制**：AI 到底挡不挡得下来。
//
// 这条测试自己也被红检修过两次，过程值得记：
//   · 第一版把「对空响应分支」摘掉，它照样过——因为摘掉之后 reading 仍为真，
//     代码落到下一条通用的「读到出招就防」分支上，而跳跃攻击期间 foe.move 是有值的。
//     对空那一支的独立贡献其实很小，真正起作用的是**読み的 key 把滞空算进去**这一改。
//   · 第二版用第 6 帧出手量，摘掉滞空读取后它**还是**过——因为第 6 帧是弱时机，
//     AI 反应得再晚也挡得住。换成第 12 帧（最强时机）才量得到差别。
// 教训：守机制的测试要打在**最能暴露那个机制的用法**上，不是随手挑一个用法。
test('AI 会挡下跳跃攻击——对空这一层本身要在', () => {
  let hit = 0, blocked = 0;
  for (let s = 0; s < 12; s++) for (const swap of [false, true]) {
    const pi = s % 4, ei = (s + 1) % 4;
    const [A, B] = swap ? [ei, pi] : [pi, ei];
    const b = new Battle(structuredClone(CHARACTERS[A]), structuredClone(CHARACTERS[B]));
    const ai = createAi(STAGES[0].ai, s * 13 + 1), bot = jumpIn(12);   // 最强时机，见上面注释
    const me = (swap ? 1 : 0) as 0 | 1;
    for (let f = 0; f < 60 * 120 && b.winner === null; f++) {
      const M = me === 0 ? b.p1 : b.p2;
      const inAir = M.state === 'attack' && M.move?.slot === 'jA';
      const mine = bot(b, me);
      b.tick(me === 0 ? mine : ai(b, 0), me === 0 ? ai(b, 1) : mine);
      for (const e of b.events) {
        if (e.type === 'hit' && e.attacker === me && inAir) { if (e.blocked) blocked++; else hit++; }
      }
    }
  }
  const rate = blocked / Math.max(1, hit + blocked);
  expect(hit + blocked, '用例没成立：整趟一次跳跃攻击都没打到人').toBeGreaterThan(50);
  expect(rate, `跳跃攻击的挡下率只有 ${Math.round(rate * 100)}%（命中 ${hit} 被挡 ${blocked}），对空没起作用`)
    .toBeGreaterThan(0.40);
}, 300_000);
