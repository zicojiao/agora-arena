import { expect, test } from 'vitest';
import { Battle, ROUND_TIME } from '../src/engine/battle';
import { createAi } from '../src/engine/ai';
import { CHARACTERS } from '../src/data/characters';
import { RUN_AI } from '../src/data/stages';
import { FINAL_BOSS } from '../src/data/stages';

/**
 * 自己打自己，能不能打完。
 *
 * 末关固定是 FINAL_BOSS，所以**选中他的玩家，最后一场必然是镜像战**——
 * 而整套模拟测试没有一条覆盖它：comboDamage / cornerEscape / cornerPressure /
 * guardCancelRoll / highLowMix / hitCounter / selectStats / aiTaunt 全都以
 * `if (a === b) continue;` 开头（它们是在抽对位，跳过同一个人是对的）。
 * 于是"同一个角色打同一个角色"这条路，在整个测试套件里一次都没跑过。
 *
 * 这条不测平衡（镜像战的平衡是同义反复），只测**跑得完**：
 * 双方共用同一份角色数据（各自 structuredClone），任何按 def 挂的缓存
 * （比如 cdMove 往 def 上挂的 `_cd`）、任何两边共用引用的地方，只会在这里露出来。
 */

test('十二个人都能跟自己打完一整场——镜像战是末关必然会出现的一场', () => {
  for (const c of CHARACTERS) {
    const bt = new Battle(structuredClone(c), structuredClone(c));
    const a1 = createAi(RUN_AI[3], 11), a2 = createAi(RUN_AI[3], 29);
    let f = 0;
    for (; f < ROUND_TIME + 600 && bt.winner === null; f++) bt.tick(a1(bt, 0), a2(bt, 1));
    // 打得完：要么分出胜负，要么读秒到点——卡住不动（双方都不掉血）才是问题
    const settled = bt.winner !== null || f >= ROUND_TIME;
    expect(settled, `${c.name} 的镜像战既没分出胜负也没走到读秒，卡在第 ${f} 帧`).toBe(true);
    expect(bt.p1.hp + bt.p2.hp, `${c.name} 的镜像战一滴血都没掉，多半是双方卡住了`)
      .toBeLessThan(c.hp * 2);
    // 两边的招式数据必须是**各自一份**：cdMove 会往 def 上挂 `_cd` 缓存，
    // 若两个 fighter 共用同一个 def 对象，一边的缓存会串到另一边
    expect(bt.p1.def, `${c.name} 镜像战两边共用了同一个 def 对象`).not.toBe(bt.p2.def);
  }
});

test('末关那场镜像战跑得完——它是每个选最终 BOSS 的玩家的收尾', () => {
  const boss = CHARACTERS.find(x => x.id === FINAL_BOSS)!;
  const bt = new Battle(structuredClone(boss), structuredClone(boss));
  const a1 = createAi(RUN_AI[5], 7), a2 = createAi(RUN_AI[5], 13);
  let f = 0;
  for (; f < ROUND_TIME + 600 && bt.winner === null; f++) bt.tick(a1(bt, 0), a2(bt, 1));
  expect(bt.winner !== null || f >= ROUND_TIME, `${boss.name} 的末关镜像战卡在第 ${f} 帧`).toBe(true);
});
