import { expect, test } from 'vitest';
import { Battle } from '../src/engine/battle';
import { createAi } from '../src/engine/ai';
import { CHARACTERS } from '../src/data/characters';
import { STAGES, BOSS_HP_SCALE, BOSS_DMG_SCALE } from '../src/data/stages';
import { NULL_INPUT } from '../src/engine/types';
import { STAGE_HOLD_END, STAGE_LIFE } from '../src/render/banner';

// 回合起始的「准备」锁。没有它的时候，开场横幅还完全立着，玩家就已经在挨打了——
// 第二、三回合尤其不该这样，玩家刚看完 KO 慢镜。

/** 跑一段开场，返回玩家挨的伤害与被打中的回合数 */
function opening(lockFrames: number, frames: number) {
  let dmg = 0, hitRounds = 0, n = 0;
  for (let si = 0; si < 4; si++) for (let seed = 0; seed < 12; seed++) {
    const st = STAGES[si];
    const me = structuredClone(CHARACTERS[seed % CHARACTERS.length]);
    const boss = structuredClone(CHARACTERS.find(c => c.id === st.bossId)!);
    boss.hp = Math.round(boss.hp * BOSS_HP_SCALE[si]);
    for (const mv of Object.values(boss.moves)) mv.damage = Math.round(mv.damage * BOSS_DMG_SCALE[si]);
    const b = new Battle(me, boss); n++;
    const a1 = createAi(STAGES[1].ai, seed * 13 + 1), a2 = createAi(st.ai, seed * 7 + 3);
    const hp0 = b.p1.hp;
    let hit = false;
    for (let f = 0; f < frames; f++) {
      // GameCanvas 的做法：锁定期间双方都喂 NULL_INPUT（物理与待机动作照常推进）
      if (f < lockFrames) b.tick(NULL_INPUT, NULL_INPUT);
      else b.tick(a1(b, 0), a2(b, 1));
      for (const e of b.events) if (e.type === 'hit' && e.attacker === 1) hit = true;
    }
    dmg += hp0 - b.p1.hp;
    if (hit) hitRounds++;
  }
  return { dmg: dmg / n, hitShare: hitRounds / n };
}

test('开场确实会被抢攻——这条是「准备」锁存在的前提', () => {
  const raw = opening(0, STAGE_LIFE);
  expect(raw.hitShare, `不加锁时开场没人挨打（${Math.round(raw.hitShare * 100)}%），那锁就是多余的`)
    .toBeGreaterThan(0.2);
});

test('准备期内谁也打不到谁', () => {
  const locked = opening(STAGE_HOLD_END, STAGE_HOLD_END);
  expect(locked.dmg, '准备期内还是掉血了').toBe(0);
  expect(locked.hitShare, '准备期内还是有命中').toBe(0);
});

test('锁到横幅开始淡出为止——不早不晚', () => {
  expect(STAGE_HOLD_END, '锁长度必须为正').toBeGreaterThan(0);
  // 横幅还完全立着时不该开打，但也不该锁到横幅都没了人还站着
  expect(STAGE_HOLD_END, '锁比横幅还长，横幅没了双方还站着不动').toBeLessThan(STAGE_LIFE);
  // 这个值是从横幅节奏推导的，不是另填的字面量——改横幅时长它要跟着变
  expect(STAGE_HOLD_END, '锁没有跟着横幅的淡出时机走').toBe(STAGE_LIFE - 25);
});
