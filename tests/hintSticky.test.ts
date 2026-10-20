import { expect, test } from 'vitest';
import { Battle } from '../src/engine/battle';
import { createAi } from '../src/engine/ai';
import { CHARACTERS } from '../src/data/characters';
import { STAGES } from '../src/data/stages';
import { hintFor, nextHint, hintRank, HINT_MIN_HOLD } from '../src/ui/TouchLayer';

// 提示条原本是在**频闪**而不是教学。实测 16 分钟对局：
//   站防 / 蹲防 那两条出现 305 / 265 段，平均每段 5 帧和 4 帧（0.08 秒）
//   「被逼到版边」出现 233 段，平均 10 帧
//   「格挡中按 拳 = 防御取消」只出现 8 段、每段 5 帧——一个 50 气的系统几乎不可见
// 出现几百次、每次不到 0.1 秒，没有任何一次读得完。

test('提示站住之后不会被同级的顶掉', () => {
  let s = { text: '', left: 0 };
  s = nextHint(s, '站防 · 挡跳跃攻击，挡不住下段');
  const first = s.text;
  // 同级的另一条立刻想插进来
  for (let i = 0; i < 5; i++) s = nextHint(s, '蹲防 · 挡下段，挡不住跳跃攻击');
  expect(s.text, '同级提示 5 帧内就把上一条顶掉了——这正是频闪').toBe(first);
});

test('更要紧的提示可以立刻插进来', () => {
  let s = { text: '', left: 0 };
  s = nextHint(s, '站防 · 挡跳跃攻击，挡不住下段');
  expect(hintRank('快按 拳 或 防 —— 受身起身'), '受身没有更高的优先级').toBeGreaterThan(hintRank(s.text));
  s = nextHint(s, '快按 拳 或 防 —— 受身起身');
  expect(s.text, '倒地窗口是限时的，等不起——它必须能立刻插进来').toContain('受身');
});

test('站够时间之后可以换', () => {
  let s = { text: '', left: 0 };
  s = nextHint(s, 'A');
  for (let i = 0; i < HINT_MIN_HOLD + 2; i++) s = nextHint(s, 'A');
  s = nextHint(s, 'B');
  expect(s.text, '站够了还换不掉，提示条会卡死在一条上').toBe('B');
});

test('真实对局里每段提示都够读——不再是几帧一闪', () => {
  let cur = { text: '', left: 0 };
  const runLen: number[] = [];
  let len = 0, prev = '';
  for (let si = 0; si < 4; si++) for (let seed = 0; seed < 4; seed++) {
    const st = STAGES[si];
    const b = new Battle(structuredClone(CHARACTERS[seed % 4]),
      structuredClone(CHARACTERS.find(c => c.id === st.bossId)!));
    const a1 = createAi(STAGES[1].ai, seed * 13 + 1), a2 = createAi(st.ai, seed * 7 + 3);
    for (let f = 0; f < 60 * 90 && b.winner === null && !b.timeUp; f++) {
      b.tick(a1(b, 0), a2(b, 1));
      cur = nextHint(cur, hintFor(b.p1, b.frame));
      if (cur.text === prev) len++;
      else {
        // 两类段不算"频闪"，都是设计要的：
        //   ① 被更要紧的提示合法抢占的
        //   ② 窗口内那条「快按…受身」——它是 14 帧受身窗口的**实时提示**，
        //      时长由 TECH_WINDOW 定，窗口一过就换成教学版；实测 31 段平均 15 帧、
        //      全都短于 20，拿最短停留去要求它是要求错了对象
        const intentional = hintRank(cur.text) > hintRank(prev) || prev.startsWith('快按');
        if (prev && !intentional) runLen.push(len);
        prev = cur.text; len = 1;
      }
    }
  }
  runLen.push(len);
  const short = runLen.filter(x => x < 20).length;
  const avg = runLen.reduce((a, x) => a + x, 0) / runLen.length;
  // 故障时站防/蹲防那两条平均 4-5 帧。这里要求平均够读，且几乎没有"一闪而过"的段
  expect(avg, `平均每段只有 ${avg.toFixed(0)} 帧，读不完`).toBeGreaterThan(HINT_MIN_HOLD * 0.8);
  // 故障时（没有最短停留）站防/蹲防那两条平均 4-5 帧、出现 305/265 段。
  // 排除掉上面两类"故意的短段"之后，剩下的应当几乎没有一闪而过的
  expect(short / runLen.length, `${Math.round(100 * short / runLen.length)}% 的段不足 20 帧，仍在频闪`)
    .toBeLessThan(0.1);
}, 600_000);

test('倒地那一组内部要能互相替换——最短停留不能把「快按」按着继续骗人', () => {
  let s = { text: '', left: 0 };
  s = nextHint(s, '快按 拳 或 防 —— 受身起身');
  // 才过 5 帧（远不到最短停留），窗口已经关了，提示该改口
  for (let i = 0; i < 5; i++) s = nextHint(s, '刚才那一下可以受身：倒地的那一瞬新按一次 拳 或 防');
  expect(s.text, '窗口过了还在显示「快按」——最短停留把上一轮修掉的毛病又装回来了')
    .toContain('刚才那一下');
});

// 加最短停留时踩到的坑：它把一条提示整个压没了。
// 「防御取消」的触发窗口只有 6 帧格挡硬直，而那时正显示着同级的站防/蹲防还没站完，
// 于是 hintFor 想显示 40 帧、实际显示 0 帧。限时窗口的提示必须能插队。
test('限时窗口的提示不会被最短停留压掉', () => {
  let cur = { text: '', left: 0 };
  let want = 0, shown = 0;
  for (let si = 0; si < 4; si++) for (let seed = 0; seed < 4; seed++) {
    const st = STAGES[si];
    const b = new Battle(structuredClone(CHARACTERS[seed % 4]),
      structuredClone(CHARACTERS.find(c => c.id === st.bossId)!));
    const a1 = createAi(STAGES[1].ai, seed * 13 + 1), a2 = createAi(st.ai, seed * 7 + 3);
    for (let f = 0; f < 60 * 120 && b.winner === null && !b.timeUp; f++) {
      b.tick(a1(b, 0), a2(b, 1));
      const w = hintFor(b.p1, b.frame);
      cur = nextHint(cur, w);
      if (w.includes('防御取消')) want++;
      if (cur.text.includes('防御取消')) shown++;
    }
  }
  expect(want, '用例没成立：整趟对局一次都没进入防御取消的窗口').toBeGreaterThan(10);
  // 显示帧数会**多于**想显示的帧数：窗口过了还要站满最短停留，让人读完——这正是要的
  expect(shown, `想显示 ${want} 帧，实际显示 ${shown} 帧——被最短停留压掉了`).toBeGreaterThan(want);
}, 600_000);
