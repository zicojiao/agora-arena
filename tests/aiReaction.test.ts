import { expect, test } from 'vitest';
import { Battle } from '../src/engine/battle';
import { createAi } from '../src/engine/ai';
import { CHARACTERS } from '../src/data/characters';
import { STAGES, BOSS_HP_SCALE, BOSS_DMG_SCALE } from '../src/data/stages';
import { NULL_INPUT } from '../src/engine/types';

// AI 的反应层：对手每出一招掷一次骰子，读到了就在他的起手/判定帧里防、收招帧里抓。
// 加它之前 AI 完全不看对手，实测「纯连打、向前走、从不防御」胜率 96%、剩血 62%——
// 乱按比会玩更强，这是单机格斗最劝退的一种手感。

/** 一个只会向前连打、从不防御的玩家，逐关胜率 */
function mashWins(si: number, N = 24): number {
  const st = STAGES[si];
  let w = 0;
  for (let seed = 0; seed < N; seed++) {
    const me = structuredClone(CHARACTERS[seed % CHARACTERS.length]);
    const boss = structuredClone(CHARACTERS.find(c => c.id === st.bossId)!);
    boss.hp = Math.round(boss.hp * BOSS_HP_SCALE[si]);
    for (const m of Object.values(boss.moves)) m.damage = Math.round(m.damage * BOSS_DMG_SCALE[si]);
    const b = new Battle(me, boss);
    const ai = createAi(st.ai, seed * 7 + 3);
    for (let f = 0; f < 60 * 120 && b.winner === null; f++) {
      b.tick({ ...NULL_INPUT, attack: true, move: 1 }, ai(b, 1));
    }
    if (b.winner === 0) w++;
  }
  return w / N;
}

test('乱按不能通吃：第一关放得过去，后面得学着打', () => {
  const s1 = mashWins(0), s4 = mashWins(3);
  // 第一关就该让人乱按也过——那是教学关
  expect(s1, `第一关乱按都过不去（${Math.round(s1 * 100)}%），太劝退`).toBeGreaterThan(0.6);
  // 最终关不能靠乱按过
  expect(s4, `最终关乱按也能过 ${Math.round(s4 * 100)}%——AI 完全不看对手在干什么`).toBeLessThan(0.55);
  expect(s4, `乱按在最终关和第一关一样好使（${Math.round(s1 * 100)}% vs ${Math.round(s4 * 100)}%）`)
    .toBeLessThan(s1 - 0.2);
});

test('每一关都不是乱按的天堂——第一关之后没有哪一关能靠连打过', () => {
  // 第二关曾经是个洞（乱按 83%）。改近身表没用，把它的 react 从 0.25 提到 0.32 才降到 58%。
  // 阈值取 0.8 而不是贴着实测值：这种量的抽样噪声很大，同一组参数在 N=12/24/48 下
  // 分别量出 83%/67%/75%，卡太紧只会变成一条随样本翻脸的测试。
  const rates = [1, 2, 3].map(si => mashWins(si));
  const report = rates.map((r, i) => `关${i + 2} ${Math.round(r * 100)}%`).join('  ');
  for (const [i, r] of rates.entries()) {
    expect(r, `${report} —— 关${i + 2} 成了乱按的天堂`).toBeLessThan(0.8);
  }
});

test('跳跃攻击真的会出现——中段是上下段的一半，AI 不跳的话玩家只见得到下段', () => {
  let ja = 0, all = 0;
  for (let si = 2; si <= 3; si++) for (let seed = 0; seed < 8; seed++) {
    const st = STAGES[si];
    const me = structuredClone(CHARACTERS[seed % CHARACTERS.length]);
    const boss = structuredClone(CHARACTERS.find(c => c.id === st.bossId)!);
    const b = new Battle(me, boss);
    const a1 = createAi(STAGES[1].ai, seed * 13 + 1), a2 = createAi(st.ai, seed * 7 + 3);
    for (let f = 0; f < 60 * 90 && b.winner === null; f++) {
      b.tick(a1(b, 0), a2(b, 1));
      for (const e of b.events) if (e.type === 'hit') {
        all++;
        const atk = e.attacker === 0 ? b.p1 : b.p2;
        if (atk.move?.slot === 'jA') ja++;
      }
    }
  }
  expect(all, '一次都没打中，用例没成立').toBeGreaterThan(100);
  // 曾经恒为 0：AI 的 jump 动作只按跳，从不在空中按攻击，跳只是一次位移
  expect(ja, `跳跃攻击 ${ja}/${all} 次接触——AI 跳起来不打，中段永远不出现`).toBeGreaterThan(0);
});

test('反应层真的在拆招：react 越高，玩家的攻击被挡下的比例越高', () => {
  function blockedShare(react: number): number {
    let hits = 0, blocked = 0;
    for (let seed = 0; seed < 8; seed++) {
      const me = structuredClone(CHARACTERS[seed % CHARACTERS.length]);
      const boss = structuredClone(CHARACTERS.find(c => c.id === STAGES[2].bossId)!);
      const b = new Battle(me, boss);
      const ai = createAi({ ...STAGES[2].ai, react }, seed * 7 + 3);
      for (let f = 0; f < 60 * 60 && b.winner === null; f++) {
        b.tick({ ...NULL_INPUT, attack: true, move: 1 }, ai(b, 1));
        for (const e of b.events) if (e.type === 'hit' && e.attacker === 0) { hits++; if (e.blocked) blocked++; }
      }
    }
    return hits === 0 ? 0 : blocked / hits;
  }
  const off = blockedShare(0), on = blockedShare(0.7);
  expect(on, `react=0 时挡下 ${Math.round(off * 100)}%，react=0.7 时 ${Math.round(on * 100)}%——反应层没生效`)
    .toBeGreaterThan(off * 1.5);
});

// 「挡下之后会还手」没有单独的用例。写过一版，量的是"挡下后 24 帧内出招的比例"，
// 结果加不加这个功能都是 16%——它测的不是这件事。真正的判据在 balance.test.ts：
// 关掉挡后还手，最终关胜率从 25% 掉到 9%（AI 把帧全花在格挡上，一整局打不出伤害），
// 那条「最终关不能成为劝退墙」当场报红。与其再写一条测不准的，不如说明白谁在守。
