import { expect, test } from 'vitest';
import { Battle } from '../src/engine/battle';
import { CHARACTERS } from '../src/data/characters';
import { BRIEF_FRAMES, SUPER_FRAMES } from '../src/data/superPhases';
import { NULL_INPUT } from '../src/engine/types';

// 十秒演出只在这一击能 KO 时播，否则换三秒短版（GG 一击必杀 / MK Fatality 的做法）。
// 本作气槽填满 50 约需 5 秒战斗——每次都放十秒的话，过场时间会超过实际战斗时间。

const run = (cid: string, slot: 'sp50' | 'sp100', victimHp: number, frames: number) => {
  const c = CHARACTERS.find(x => x.id === cid)!;
  const b = new Battle(structuredClone(c), structuredClone(CHARACTERS[0]));
  b.p1.x = 380; b.p2.x = 560;
  b.p1.meter = slot === 'sp100' ? 100 : 50;
  b.p2.hp = victimHp;
  b.tick({ ...NULL_INPUT, super: true }, NULL_INPUT);
  const played = b.p1.move!;
  for (let i = 0; i < frames; i++) b.tick(NULL_INPUT, NULL_INPUT);
  return { b, played };
};

// 名册涨到十二人之后这里还只列着最早那四个：另外八个的长短两版**一次都没验过**，
// 而每加一个角色就多两套 brief 数据。改成按名册走，加人自动进来。
test.each(CHARACTERS.map(c => c.id))('%s：打不死人时放三秒短版，能终结时放十秒完整版', cid => {
  for (const slot of ['sp50', 'sp100'] as const) {
    const dmg = CHARACTERS.find(x => x.id === cid)!.moves[slot].damage;

    const brief = run(cid, slot, dmg + 1, 0).played; // 血量比总伤害多 1 → 打不死
    expect(brief.isBrief, `${cid} ${slot} 打不死时应换短版`).toBe(true);
    expect(brief.startup + brief.active + brief.recovery).toBe(BRIEF_FRAMES);

    const grand = run(cid, slot, dmg, 0).played;     // 血量正好等于总伤害 → 能终结
    expect(grand.isBrief, `${cid} ${slot} 能终结时应放完整版`).toBeFalsy();
    expect(grand.startup + grand.active + grand.recovery).toBe(SUPER_FRAMES);
  }
});

// 残血触发是这条机制真正吃紧的场景：50 段连打把 52 点伤害摊开，对手只剩 6 点血时
// 第 6 段就打空了——若当场判胜负，battle.tick 立刻早退，剩下 44 段连打、挑空、空中追击、
// 落地砸、终结爆发全部放不出来，玩家看到的"十秒演出"实际只有一秒半。
test('残血时被终结：演出期间不当场判胜负，连打继续跑', () => {
  const { b } = run('nezha', 'sp100', 6, 260);
  expect(b.p2.hp, '这时候对手血应该已经空了').toBe(0);
  expect(b.winner, '演出还没走完就不该宣布胜负').toBeNull();
  expect(b.p1.hitCount, '连打必须继续推进，不能停在打空血那一段').toBeGreaterThan(15);
});

test('残血时被终结：演出走完那一刻才宣布 KO，且连打全部打完', () => {
  const m = CHARACTERS[0].moves.sp100;
  // 预算要把顿帧算进来：50 段连打里 49 段各顿 2 帧、最后一段顿 12，实际墙钟约 710 帧。
  // 按 600 帧给预算的话演出根本没走完，测试会误报"一直欠着 KO"
  const { b } = run('nezha', 'sp100', 6, SUPER_FRAMES + 200);
  expect(b.winner, '演出结束后必须宣布胜负，不能一直欠着').toBe(0);
  expect(b.p1.hitCount, '完整版的每一段都该落地').toBe(m.multiHit!.hits);
});

test('短版打不死人，所以照旧当场结算（不欠 KO）', () => {
  const c = CHARACTERS[0];
  const { b } = run('nezha', 'sp100', c.moves.sp100.damage + 1, BRIEF_FRAMES + 40);
  expect(b.p2.hp, '短版打完对手应该还剩血').toBeGreaterThan(0);
  expect(b.winner).toBeNull();
});
