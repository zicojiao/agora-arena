import { expect, test } from 'vitest';
import { playMatch } from './helpers';
import { ROUND_TIME } from '../src/engine/battle';
import { createAi } from '../src/engine/ai';
import { CHARACTERS } from '../src/data/characters';
import { buildRun, RUN_DMG_SCALE, RUN_HP_SCALE } from '../src/data/stages';

// 六关阶梯的形状。四关时代那条断言量的是四个固定对手，而现在前五关是**抽**出来的——
// 同一级的难度是一个分布，不是一个数。所以这里按"每一级独立、样本相同"量：
// 条件概率（打到了才算）会把后面几关的样本饿死，实测关5 只剩 11 场、标准误 11 点。
const PROXY = {
  name: 'proxy', decideEvery: 26, react: 0.3,
  near: { attack: 5, block: 2, retreat: 4, skill2: 1, backstep: 2 },
  mid: { approach: 3, skill1: 4, skill3: 1, jump: 1, dash: 2, retreat: 2 },
  far: { approach: 2, skill1: 4, dash: 3, charge: 2 },
} as never;

test('六关是一条匀速下坡，末关不是断崖', () => {
  // 12 角色 × 15 种子 = 每关 180 场。**这个数是被这条断言自己的噪声逼上来的**：
  // 断言比的是相邻两关的**差**，60 场时单关 SE≈6.5、两关之差 SE≈8.7 点——
  // 拿 8.7 点的噪声去守 25 点的线，同一份代码能一趟读出 14 点、下一趟读出 27 点
  // （实测就是这样：SEEDS=5 报「关1→关2 差 27 点」，SEEDS=15 同代码是 14 点）。
  // 180 场把差的 SE 压到 5 点，线才守得住。这条断言此前反复误报，根子在这里。
  const SEEDS = 15;
  const win = [0, 0, 0, 0, 0, 0], tries = [0, 0, 0, 0, 0, 0];
  for (let ci = 0; ci < CHARACTERS.length; ci++) {
    for (let seed = 0; seed < SEEDS; seed++) {
      const me = CHARACTERS[ci];
      const run = buildRun(me.id, seed * 977 + ci, CHARACTERS);
      for (let si = 0; si < run.length; si++) {
        tries[si]++;
        const won = playMatch({
          me,
          boss: CHARACTERS.find(c => c.id === run[si].bossId)!,
          hpScale: RUN_HP_SCALE[si], dmgScale: RUN_DMG_SCALE[si],
          myAi: createAi(PROXY, seed * 13 + si * 7 + 1),
          bossAi: createAi(run[si].ai, seed * 31 + si * 5 + 3),
          roundTime: ROUND_TIME,
        });
        if (won) win[si]++;
      }
    }
  }
  const rate = win.map((w, i) => w / tries[i]);
  const report = rate.map((r, i) => `关${i + 1} ${Math.round(r * 100)}%`).join('  ');

  // ① 首关要能上手，末关要打得赢（曾经掉到 0%）
  expect(rate[0], `第一关就劝退　${report}`).toBeGreaterThan(0.6);
  expect(rate[5], `最终关成了劝退墙　${report}`).toBeGreaterThan(0.1);
  // ② 整体是下坡：首末必须拉开
  expect(rate[0] - rate[5], `首关到末关没拉开差距　${report}`).toBeGreaterThan(0.3);
  // ③ 没有断崖，也不许倒挂太多。**不要求严格单调**——60 场时 SE≈6.5 点，
  //    要求相邻两级严格有序等于让断言去分辨比噪声还小的差别（这个项目为此报过三次假红）
  for (let i = 1; i < rate.length; i++) {
    expect(rate[i - 1] - rate[i], `关${i}→关${i + 1} 是一堵墙　${report}`).toBeLessThanOrEqual(0.25);
    expect(rate[i] - rate[i - 1], `关${i + 1} 明显比关${i} 还容易　${report}`).toBeLessThanOrEqual(0.10);
  }
}, 900_000);
