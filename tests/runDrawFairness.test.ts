import { expect, test } from 'vitest';
import { buildRun, FINAL_BOSS } from '../src/data/stages';
import { CHARACTERS } from '../src/data/characters';

/**
 * 一趟阶梯从十二人里抽五个（末关固定是 FINAL_BOSS，玩家自己也不进池），
 * 也就是十个候选抽五个。**抽得均不均**决定了这个游戏的重玩价值：
 * 有人系统性地很少出现，等于给他做的招式、台词、主场背景，多数玩家一辈子撞不见。
 *
 * 既有的 runLadder 那一组守的是"六关、末关固定、不打自己、不连着重复、
 * 同种子同结果、换种子换人"——都是**单趟**的性质，没有一条看得见分布。
 * 洗牌写歪一个字（Fisher-Yates 的 `rnd()*(i+1)` 写成 `rnd()*i` 是最经典的那一种）
 * 照样满足上面每一条，只是从此某几个人再也抽不到靠后的位置。
 *
 * 实测（4000 趟 × 5 格 = 20000 次抽取，十个候选，期望 2000 次/人）：
 * 实际 1964~2061，落在 ±2σ（σ≈32）之内。
 */

const ME = 'nezha';
const RUNS = 4000;

function draw() {
  const perChar = new Map<string, number>();
  const perSlot = new Map<string, number[]>();
  for (let s = 1; s <= RUNS; s++) {
    const run = buildRun(ME, (s * 2654435761) % 0xffffffff, CHARACTERS);
    run.slice(0, run.length - 1).forEach((st, i) => {
      perChar.set(st.bossId, (perChar.get(st.bossId) ?? 0) + 1);
      if (!perSlot.has(st.bossId)) perSlot.set(st.bossId, [0, 0, 0, 0, 0]);
      perSlot.get(st.bossId)![i]++;
    });
  }
  return { perChar, perSlot };
}

let cached: ReturnType<typeof draw> | null = null;
const d = () => (cached ??= draw());

test('十个候选都抽得到——没有谁是永远见不着的', () => {
  const { perChar } = d();
  const pool = CHARACTERS.map(c => c.id).filter(id => id !== ME && id !== FINAL_BOSS);
  for (const id of pool) {
    expect(perChar.get(id) ?? 0, `${id} 在 ${RUNS} 趟里一次都没被抽到`).toBeGreaterThan(0);
  }
  expect(perChar.size, '抽到的人数与候选池对不上').toBe(pool.length);
});

test('抽得均匀——没有人系统性地更少出现', () => {
  const { perChar } = d();
  const counts = [...perChar.values()];
  const exp = (RUNS * 5) / counts.length;
  const worst = counts.reduce((w, v) => Math.abs(v - exp) > Math.abs(w - exp) ? v : w, exp);
  const off = Math.abs(worst - exp) / exp;
  // 阈值按红检定，不是按余量猜：干净时最大偏差 3%（σ≈1.6%，即约 2σ），
  // 把 Fisher-Yates 写成 `rnd()*i` 之后是 **13%**。线放 8%——夹在两者中间。
  //（第一版凭感觉写了 15%，而那个经典写歪只到 13%，正好从线下钻过去：
  //  又一条"看着有余量、实际拦不住"的断言。）
  expect(off, `有人比期望少/多出 ${Math.round(off * 100)}%（期望 ${exp}，最偏的是 ${worst}）`)
    .toBeLessThan(0.08);
});

test('每个人在五个位置上都出现过——不是只会排在开头或结尾', () => {
  const { perSlot } = d();
  for (const [id, slots] of perSlot) {
    for (const [i, n] of slots.entries()) {
      expect(n, `${id} 从来没有出现在第 ${i + 1} 关`).toBeGreaterThan(0);
    }
    // 只留"每一格都出现过"这一条。原本还写了"某一格不许占太大比例"，
    // 红检下来那条量不出东西：干净时最大占比本来就接近 1/5=20%，写歪之后也才 22%，
    // 两者分不开——拦不住那个经典写歪的阈值，就是一句摆设，删掉。
  }
});
