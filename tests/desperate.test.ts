import { expect, test } from 'vitest';
import { Battle, ROUND_TIME } from '../src/engine/battle';
import { createAi, isDesperate } from '../src/engine/ai';
import { CHARACTERS } from '../src/data/characters';
import { STAGES, BOSS_HP_SCALE, BOSS_DMG_SCALE } from '../src/data/stages';

// 背水：对手被打到残血会变凶，那是一场对局里最好看的一段。
// 加它之前 AI 的出招占帧在四个血量档上是 26/29/30/28%——一条平线，
// 打到最后一格血和第一格血是同一个人。

const PROXY = { name: 'proxy', decideEvery: 26, react: 0.3,
  near: { attack: 5, block: 2, retreat: 4, skill2: 1, backstep: 2 },
  mid: { approach: 3, skill1: 4, skill3: 1, jump: 1, dash: 2, retreat: 2 },
  far: { approach: 2, skill1: 4, dash: 3, charge: 2 } } as never;

/** 按 AI 自己的剩余血量分四档，统计它的出招帧占比与后撤帧占比 */
function byHpBand() {
  const atk = [0, 0, 0, 0], all = [0, 0, 0, 0], flee = [0, 0, 0, 0];
  for (let si = 0; si < 4; si++) for (let seed = 0; seed < 12; seed++) {
    const st = STAGES[si];
    const me = structuredClone(CHARACTERS[seed % CHARACTERS.length]);
    const boss = structuredClone(CHARACTERS.find(c => c.id === st.bossId)!);
    boss.hp = Math.round(boss.hp * BOSS_HP_SCALE[si]);
    for (const mv of Object.values(boss.moves)) mv.damage = Math.round(mv.damage * BOSS_DMG_SCALE[si]);
    const b = new Battle(me, boss);
    const a1 = createAi(PROXY, seed * 13 + 1), a2 = createAi(st.ai, seed * 7 + 3);
    const hp0 = b.p2.hp;
    for (let f = 0; f < ROUND_TIME && b.winner === null && !b.timeUp; f++) {
      const r = b.p2.hp / hp0;
      const i = r > 0.75 ? 0 : r > 0.5 ? 1 : r > 0.25 ? 2 : 3;
      b.tick(a1(b, 0), a2(b, 1));
      all[i]++;
      if (b.p2.state === 'attack') atk[i]++;
      if (b.p2.state === 'backstep'
        || (b.p2.state === 'walk' && Math.sign(b.p2.vx) === Math.sign(b.p2.x - b.p1.x))) flee[i]++;
    }
  }
  return { atk: atk.map((v, i) => v / all[i]), flee: flee.map((v, i) => v / all[i]) };
}

test('残血时明显更凶——出招变多、后撤变少', () => {
  const { atk, flee } = byHpBand();
  const pct = (a: number[]) => a.map(v => Math.round(v * 100) + '%').join(' / ');
  expect(atk[3], `出招占帧 ${pct(atk)}：最后一格血没有比满血时更凶`).toBeGreaterThan(atk[0] * 1.25);
  expect(flee[3], `后撤占帧 ${pct(flee)}：残血还在往后躲`).toBeLessThan(flee[0] * 0.6);
});

test('背水线是自己的血量比例，不是绝对值', () => {
  // 牛魔王 215 血、二郎神 195 血：同样剩 60 点，比例是 27.9% 和 30.8%，
  // 一个进背水一个不进——这正是"按比例不按绝对值"的分界。
  // （第一版我把断言写成两个都该进，跑出来才想清楚：血更厚的那位，同样的绝对残血更危险。）
  const niu = structuredClone(CHARACTERS.find(c => c.id === 'niumo')!);
  const er = structuredClone(CHARACTERS.find(c => c.id === 'erlang')!);
  const b = new Battle(niu, er);
  b.p1.hp = 60; b.p2.hp = 60;
  expect(niu.hp, '用例前提：牛魔王血更厚').toBeGreaterThan(er.hp);
  expect(isDesperate(b.p1), `牛魔王 60/${niu.hp} = ${(60 / niu.hp * 100).toFixed(1)}%，该进背水`).toBe(true);
  expect(isDesperate(b.p2), `二郎神 60/${er.hp} = ${(60 / er.hp * 100).toFixed(1)}%，还没到线`).toBe(false);
  b.p1.hp = Math.round(niu.hp * 0.5);
  expect(isDesperate(b.p1), '半血不该算背水').toBe(false);
});

test('平时把气存着，残血才放开——不然大招会在开局就撒完', () => {
  const c = CHARACTERS[0];
  const b = new Battle(structuredClone(c), structuredClone(c));
  b.p2.x = b.p1.x + 200;
  b.p1.meter = 100;
  // 满血、对手也满血：这一刻不该被判为"可以放大招"
  expect(isDesperate(b.p1), '满血被判成背水了').toBe(false);
  b.p1.hp = Math.round(c.hp * 0.2);
  expect(isDesperate(b.p1), '两成血没进背水').toBe(true);
});
