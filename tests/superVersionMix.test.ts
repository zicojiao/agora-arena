import { expect, test } from 'vitest';
import { Battle } from '../src/engine/battle';
import { createAi } from '../src/engine/ai';
import { CHARACTERS } from '../src/data/characters';
import { STAGES } from '../src/data/stages';

/**
 * 大招有长短两版：打得死人时播十秒的完整演出，打不死时播三秒的短版
 *（见 Move.brief 与 battle 的 stagedMove）。选哪一版**只由一个条件决定**：
 *   `if (foe.hp <= m.damage) return m;   // 这一击能终结 → 完整演出`
 *
 * 十二个人 × 两档 = 24 套完整演出，每套约六百帧编排（起势/蓄力/突进/连打/终结/收势），
 * 是这个项目里最费工的一块内容。而那个条件写反、写错、或者哪天被"优化"掉，
 * 后果是**静默的**：对局照常进行、伤害照常结算，只是那 24 套东西再也不出现，
 * 玩家永远只看得到三秒的短版。superConnect 那一组守的是"两版都打得满段"，
 * 守不到"完整版还出不出现"。
 *
 * 实测（264 回合，两个 AI 档 × 132 组配对）：
 *   奥义 300 次发动，其中完整版 67 次（22%）
 *   超必杀 58 次发动，其中完整版 44 次（76%——它本来就是留着终结用的）
 *   完整版合计 111 次，约每 2.4 回合看见一次
 */

function stagingStats() {
  let rounds = 0;
  const fired = { 50: 0, 100: 0 };
  const full = { 50: 0, 100: 0 };
  let briefWhenLethal = 0, fullWhenNotLethal = 0;
  for (const si of [0, 3]) for (let a = 0; a < CHARACTERS.length; a++) for (let b = 0; b < CHARACTERS.length; b++) {
    if (a === b) continue;
    const bt = new Battle(structuredClone(CHARACTERS[a]), structuredClone(CHARACTERS[b]));
    const a1 = createAi(STAGES[si].ai, a * 13 + b * 7 + 1);
    const a2 = createAi(STAGES[si].ai, a * 31 + b * 5 + 3);
    rounds++;
    for (let f = 0; f < 60 * 120 && bt.winner === null; f++) {
      const hpBefore = [bt.p1.hp, bt.p2.hp];
      bt.tick(a1(bt, 0), a2(bt, 1));
      for (const e of bt.events) {
        if (e.type !== 'super') continue;
        const me = e.who === 0 ? bt.p1 : bt.p2;
        if (!me.move) continue;
        fired[e.tier]++;
        const isFull = !me.move.isBrief;
        if (isFull) full[e.tier]++;
        // 选版依据的是**发动那一刻**对手的血量与这一招的伤害
        const foeHp = hpBefore[e.who === 0 ? 1 : 0];
        const lethal = foeHp <= me.move.damage;
        if (lethal && !isFull) briefWhenLethal++;
        if (!lethal && isFull) fullWhenNotLethal++;
      }
    }
  }
  return { rounds, fired, full, briefWhenLethal, fullWhenNotLethal };
}

let cached: ReturnType<typeof stagingStats> | null = null;
const s = () => (cached ??= stagingStats());

test('十秒的完整演出真的会出现——24 套编排不能只活在数据里', () => {
  const { rounds, full } = s();
  const total = full[50] + full[100];
  // 实测 111 次 / 264 回合（约每 2.4 回合一次）。线放在"每十回合至少一次"：
  // 离实测有四倍余量，而"完整版从此不再出现"这种改动会被直接拦下
  expect(total, `264 回合里完整版大招只出现 ${total} 次——那 24 套六百帧的编排等于白做`)
    .toBeGreaterThan(rounds / 10);
  expect(full[100], '超必杀（100 气）的完整版一次都没出现').toBeGreaterThan(0);
  expect(full[50], '奥义（50 气）的完整版一次都没出现').toBeGreaterThan(0);
});

test('短版也得留着——不是每一发都播十秒', () => {
  const { fired, full } = s();
  const brief = (fired[50] - full[50]) + (fired[100] - full[100]);
  // 反向同样要守：若哪天条件变成"永远播完整版"，一场架会被过场淹掉
  //（气槽满 50 约五秒战斗一次，每次十秒演出＝过场比打斗还长）
  expect(brief, '短版一次都没出现——每一发大招都播十秒，过场会比打斗还长')
    .toBeGreaterThan(0);
});

test('选版的依据就是"这一击能不能终结"，没有别的', () => {
  const { briefWhenLethal, fullWhenNotLethal } = s();
  expect(briefWhenLethal, `有 ${briefWhenLethal} 次能终结却播了短版`).toBe(0);
  expect(fullWhenNotLethal, `有 ${fullWhenNotLethal} 次打不死却播了完整版`).toBe(0);
});
