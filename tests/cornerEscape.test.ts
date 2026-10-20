import { expect, test } from 'vitest';
import { Battle } from '../src/engine/battle';
import { createAi } from '../src/engine/ai';
import { CHARACTERS } from '../src/data/characters';
import { STAGES } from '../src/data/stages';
import { ARENA_MAX, ARENA_MIN, CORNERED } from '../src/engine/types';

/**
 * 被钉在墙角出不来，是格斗游戏里最难受的一种状态——所以「压制」要成立
 *（cornerPressure 那一组守的是这个），但「压到永远出不来」不能成立。
 * 后者此前**从没量过**：十二个人速度 3.8~5.9、跳跃高低不一、脱身手段各不相同，
 * 谁都可能是那个一进墙角就再也回不到场中间的人，而这不会有任何报错。
 *
 * 两边用**同一套 AI**（boss 档，会压制），所以角色之间的差别只来自角色数据本身。
 * 132 组配对 × 6 个种子，量每一段"连续贴在版边"的时长。
 *
 * 实测（两组互不相干的种子跑出同一结论）：
 *   中位 1.1~1.9s——十二个人都能常规脱身，没有谁被锁死
 *   九分位 后羿 10.7　铁扇 10.3　二郎神 9.8　…　雷震子 5.0
 * 尾巴上那两个恰好是**最依赖空间的两个**：后羿要拉开距离蓄力远射，铁扇靠推开控场，
 * 墙角把两个人的看家本事同时废掉。这不是病，正是拳皇里 zoner 怕版边的那条道理，
 * 所以不动数值，只把"没有人被锁死"钉住。
 *
 * 取样教训记一笔：第一版每组只跑 1 个种子（每人 n=12~74），读出「红孩儿九分位 15.4s」，
 * 看着像个大洞。加到 6 个种子（n=124~410）之后他是 6.7s，和大伙一样——
 * **那 15.4s 整个是噪声**。n 不到三位数时的九分位不能拿来下结论，这个坑在本项目里踩过不止一次。
 */

const SEEDS = 6;

function dwellByCharacter(): Map<string, number[]> {
  const dwell = new Map<string, number[]>(CHARACTERS.map(c => [c.name, [] as number[]]));
  const prof = STAGES[3].ai;                        // 会压制的那一档，两边同用
  for (let a = 0; a < CHARACTERS.length; a++) for (let b = 0; b < CHARACTERS.length; b++) {
    if (a === b) continue;
    for (let sd = 0; sd < SEEDS; sd++) {
      const bt = new Battle(structuredClone(CHARACTERS[a]), structuredClone(CHARACTERS[b]));
      const a1 = createAi(prof, a * 13 + b * 7 + 1 + sd * 977);
      const a2 = createAi(prof, a * 31 + b * 5 + 3 + sd * 613);
      const run = [0, 0];
      for (let f = 0; f < 60 * 120 && bt.winner === null; f++) {
        bt.tick(a1(bt, 0), a2(bt, 1));
        for (const [i, fg] of [bt.p1, bt.p2].entries()) {
          if (fg.x - ARENA_MIN < CORNERED || ARENA_MAX - fg.x < CORNERED) { run[i]++; continue; }
          if (run[i] > 0) {
            dwell.get((i === 0 ? CHARACTERS[a] : CHARACTERS[b]).name)!.push(run[i]);
            run[i] = 0;
          }
        }
      }
    }
  }
  for (const d of dwell.values()) d.sort((x, y) => x - y);
  return dwell;
}

// 132 组配对 × 6 个种子要跑几秒，而 vitest 默认只给 5 秒：单跑这个文件是 3.7s 过得去，
// 全量并行时被挤到 5.2s 就超时——一条**只在全量里红、单跑就绿**的测试比没有更糟。
// 三条都要写：谁先跑谁付这笔仿真开销（后面两条吃 cached）。
const HEAVY = 900_000;

let cached: Map<string, number[]> | null = null;
const dwells = () => (cached ??= dwellByCharacter());
const q = (d: number[], p: number) => d[Math.floor(d.length * p)] / 60;   // 帧 → 秒

test('十二个人都进得了墙角——不然这组断言什么也没量', () => {
  for (const [name, d] of dwells()) {
    expect(d.length, `${name} 一次都没被逼到版边，这一组对他没有意义`).toBeGreaterThan(100);
  }
}, HEAVY);

test('没有人被锁死在墙角——每个人的常规脱身都要快', () => {
  for (const [name, d] of dwells()) {
    // 实测 1.1~1.9s。2.5s 这条线挡住"常规就要卡两三秒"——那说明这个人缺脱身手段
    expect(q(d, 0.5), `${name} 有一半的时候要 ${q(d, 0.5).toFixed(1)}s 才出得了墙角`)
      .toBeLessThan(2.5);
  }
}, HEAVY);

test('最坏的那一成也得有个头——不能出现"进了角就没了"的角色', () => {
  const rows = [...dwells()].map(([name, d]) => ({ name, p90: q(d, 0.9) }))
    .sort((x, y) => y.p90 - x.p90);
  const show = rows.slice(0, 3).map(r => `${r.name} ${r.p90.toFixed(1)}s`).join('　');
  // 这条线是**按红检定的，不是按余量定的**：第一版写 18s（实测最坏 10.7s，看着有近两倍余量），
  // 可把后羿速度砍到 0.7 这种真·跛脚改动，量出来是 17.9s——差 0.1s 就漏过去了。
  // 换句话说"离实测远"不等于"拦得住破坏"，得拿真的破坏去顶一次才知道线该画在哪。
  // 收到 15s：实测 10.7s 仍有 1.4 倍余量，而那次跛脚改动会被拦下。
  expect(rows[0].p90, `${rows[0].name} 最坏的一成要 ${rows[0].p90.toFixed(1)}s 才脱得了身　前三：${show}`)
    .toBeLessThan(15);
}, HEAVY);
