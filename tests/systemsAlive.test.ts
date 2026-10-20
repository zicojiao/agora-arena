import { expect, test } from 'vitest';
import { Battle } from '../src/engine/battle';
import { createAi } from '../src/engine/ai';
import { CHARACTERS } from '../src/data/characters';
import { STAGES } from '../src/data/stages';

/**
 * 每个 KOF 系统在真实对局里**到底出不出现**。
 *
 * 这个项目最反复栽的一类 bug 不是"算错了"，是**"建好了，玩家永远撞不见"**——
 * 一整套东西（数据、状态、动作、台词、UI）都在，只有没人会去做，于是它在代码里存在、
 * 在游戏里不存在，而且**不会报任何错**。已经发生过至少四次：
 *   挑衅 0.00 次/回合、机动三件套（跑/回避/后跃）0%、防御取消/MAX蓄气/吹飞攻击 0.00 次/局。
 * 每一次都是隔了很久才偶然发现的。这条测试就是给这一整类 bug 装的闸。
 *
 * 它**不守"多少算好玩"**——那是调校，会随平衡改动漂移。它只守"不是零"：
 * 一个系统从 0.5 掉到 0.3 是调校，掉到 0 是它死了。
 *
 * 当前实测（48 回合 = 4 关档 × 12 角色，种子固定所以逐次可复现，平均 1726 帧/回合≈29 秒）：
 *   run 17.98  chargeStart 7.75  lowAttack 4.75  roll 4.71  throw 3.38  backstep 2.50
 *   jumpAttack 1.42  super 1.42（sp50 1.08 / sp100 0.33）  armorMove 1.40  tech 1.10
 *   maxMode 0.69  guardCancel 0.58  blowbackCD 0.58  throwEscape 0.42  taunt 0.15
 * 最稀的是挑衅（0.15/回合 = 48 回合里 7 次），门槛因此按它定，见 MIN。
 */

/** 48 回合里至少要出现这么多次。按最稀的那个系统（挑衅 7 次）留余量定，
 * 红检：把某个系统从 AI 的权重表里摘掉，它掉到 0，这条就红。 */
const MIN = 3;

function census() {
  const n = new Map<string, number>();
  const bump = (k: string) => n.set(k, (n.get(k) ?? 0) + 1);
  let rounds = 0;
  for (let si = 0; si < STAGES.length; si++) {
    for (let a = 0; a < CHARACTERS.length; a++) {
      const bt = new Battle(
        structuredClone(CHARACTERS[a]),
        structuredClone(CHARACTERS[(a + 5) % CHARACTERS.length]),
      );
      const ai1 = createAi(STAGES[si].ai, a * 17 + si * 3 + 1);
      const ai2 = createAi(STAGES[si].ai, a * 29 + si * 7 + 2);
      rounds++;
      for (let f = 0; f < 60 * 90 && bt.winner === null; f++) {
        bt.events.length = 0;
        bt.tick(ai1(bt, 0), ai2(bt, 1));
        for (const e of bt.events) bump(e.type);
        for (const fg of [bt.p1, bt.p2]) {
          if (fg.stateFrame !== 0) continue;
          if (fg.state === 'roll') bump('roll');            // 紧急回避
          if (fg.state === 'run') bump('run');              // 跑
          if (fg.state === 'backstep') bump('backstep');    // 后跃
          if (fg.move?.id.endsWith('_taunt')) bump('taunt');
          if (fg.move?.id.endsWith('_cd')) bump('blowbackCD');
          if (fg.move?.slot === 'jA') bump('jumpAttack');   // 跳跃攻击（中段）
          if (fg.move?.guard === 'low') bump('lowAttack');  // 下段
          if (fg.move?.armor) bump('armorMove');            // 霸体招
          if (fg.move?.meterCost === 50) bump('sp50');
          if (fg.move?.meterCost === 100) bump('sp100');
        }
      }
    }
  }
  return { n, rounds };
}

// 事件流里出现的（引擎自己 push 的）+ 状态/招式上看得出来的，合起来就是这十几件事。
// 加了新系统就往这张表里加一行——不加的话它照样会死，而且照样没人发现。
const SYSTEMS = [
  'hit', 'ko', 'moveStart',                       // 地基：打得到、打得死
  'throw', 'throwEscape',                         // 投技与解脱
  'tech',                                         // 受身
  'guardCancel',                                  // 防御取消
  'maxMode',                                      // 爆气
  'super', 'sp50', 'sp100',                       // 超必杀两档
  'roll', 'run', 'backstep',                      // 机动三件套
  'taunt', 'blowbackCD',                          // 挑衅、吹飞
  'jumpAttack', 'lowAttack',                      // 上下段
  'armorMove',                                    // 霸体
];

let cached: ReturnType<typeof census> | null = null;
const data = () => (cached ??= census());

test('每个 KOF 系统在对局里都真的会发生——没有"建好了但玩家撞不见"的', () => {
  const { n, rounds } = data();
  const dead = SYSTEMS.filter(k => (n.get(k) ?? 0) < MIN);
  const table = SYSTEMS.map(k => `${k} ${((n.get(k) ?? 0) / rounds).toFixed(2)}`).join('  ');
  expect(dead, `这些系统在 ${rounds} 回合里几乎/完全没出现过：${dead.join('、')}\n全表(次/回合)：${table}`)
    .toEqual([]);
});

test('这张表把系统都列全了——新加的系统不进表就等于没守', () => {
  // 引擎自己 push 的事件类型一个都不能漏。漏掉的那个正是最容易悄悄死掉的那个。
  const emitted = new Set<string>();
  const { n } = data();
  for (const k of n.keys()) emitted.add(k);
  // 只查"引擎发过、而表里没有"的方向：表里有而这一轮没发生的，上一条已经会红
  const missing = [...emitted].filter(k => !SYSTEMS.includes(k));
  expect(missing, `引擎发出了这些事件，但 SYSTEMS 表里没有，它们死了也不会有人发现：${missing.join('、')}`)
    .toEqual([]);
});
