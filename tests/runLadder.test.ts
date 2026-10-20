import { expect, test } from 'vitest';
import { buildRun, FINAL_BOSS, HOME, RUN_AI, RUN_HP_SCALE } from '../src/data/stages';
import { CHARACTERS } from '../src/data/characters';

// 十二个人配四关太薄：一趟只见到三分之一的名册，而且每趟都是同一批。
// 六关 + 前五关随机抽，是"再来一趟"的理由；最后一关固定，是"通关"仍然是同一件事的前提。

test('六关，最后一关固定，前五关不打自己', () => {
  for (const me of CHARACTERS) {
    for (const seed of [1, 7, 12345]) {
      const run = buildRun(me.id, seed, CHARACTERS);
      expect(run.length, '不是六关').toBe(6);
      expect(run[5].bossId, '最后一关不是固定 BOSS').toBe(FINAL_BOSS);
      const mid = run.slice(0, 5).map(s => s.bossId);
      expect(mid.includes(me.id), `${me.name} 的这一趟里要打自己`).toBe(false);
    }
  }
});

test('一趟里不会连着打同一个人两次', () => {
  for (const seed of [0, 3, 99, 2024]) {
    const ids = buildRun('nezha', seed, CHARACTERS).slice(0, 5).map(s => s.bossId);
    expect(new Set(ids).size, `前五关重复了：${ids.join('、')}`).toBe(ids.length);
  }
});

test('同种子必得同一批对手——刷新页面不该换人', () => {
  const a = buildRun('wukong', 42, CHARACTERS).map(s => s.bossId);
  const b = buildRun('wukong', 42, CHARACTERS).map(s => s.bossId);
  expect(a).toEqual(b);
});

test('换种子真的会换人——不是名义上的随机', () => {
  const seen = new Set<string>();
  for (let seed = 0; seed < 40; seed++) {
    seen.add(buildRun('nezha', seed, CHARACTERS).slice(0, 5).map(s => s.bossId).join(','));
  }
  // 40 个种子至少要给出 20 种不同的组合，否则"随机"只是换了个名字
  expect(seen.size, `40 个种子只抽出 ${seen.size} 种组合`).toBeGreaterThan(20);
});

test('难度逐关不降——react 的次序不变量', () => {
  expect(RUN_AI.length).toBe(6);
  for (let i = 1; i < RUN_AI.length; i++) {
    expect(RUN_AI[i].react ?? 0, `第 ${i + 1} 关的 react 低于上一关——那会在某个套路上开一个洞`)
      .toBeGreaterThanOrEqual(RUN_AI[i - 1].react ?? 0);
  }
  expect(RUN_HP_SCALE.length, '血量倍率的档数与关数对不上').toBe(6);
  // 只有最后一关加血（见 BOSS_HP_SCALE 那段实测：前面加血只让玩家输得更早）
  expect(RUN_HP_SCALE.slice(0, 5).every(v => v === 1), '中间关卡也加了血').toBe(true);
});

test('抽到谁就打到谁家去', () => {
  const run = buildRun('nezha', 5, CHARACTERS);
  for (const st of run) {
    expect(st.name, `${st.bossId} 的关卡名不是他的主场`).toBe(HOME[st.bossId].name);
    expect(st.bg, `${st.bossId} 的背景不是他的主场`).toBe(HOME[st.bossId].bg);
  }
});
