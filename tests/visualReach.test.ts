import { expect, test } from 'vitest';
import { CHARACTERS } from '../src/data/characters';
import { visualReachGap } from '../src/render/renderer';
import { FxSystem } from '../src/render/fx';
import { Battle } from '../src/engine/battle';
import { NULL_INPUT } from '../src/engine/types';
import canvasSrc from '../src/ui/GameCanvas.tsx?raw';

/**
 * 玩家定的规矩：**被打了，视觉上必须有东西够到——兵器，或者特效**。
 *
 * 兵器那一半由 autoWeaponScale 管（见 weaponReach.test），只管普通技。
 * 必杀/超必杀的射程本该由特效撑，实测撑不住：算上特效之后 sp100 仍普遍差 80~124px
 * （牛魔王 判定360/兵器120/特效251），必杀差 21~86px——差出来的那一段
 * 就是"什么都没碰到却算中"的地方。所以在判定生效那一帧于判定框前沿补一发。
 */

test('每一招的判定前沿都有东西够到——兵器、原特效、或补位的那一发', () => {
  const uncovered: string[] = [];
  for (const c of CHARACTERS) {
    for (const [slot, m] of Object.entries(c.moves)) {
      // gap>0 的招会在判定帧补一发；gap==0 说明本来就够得到。两者都算覆盖，
      // 这里查的是"补位机制认不认得出它"——所以只要 gap 是个有限的非负数即可
      const g = visualReachGap(c, m);
      if (!(g >= 0) || !Number.isFinite(g)) uncovered.push(`${c.name} ${slot}`);
    }
  }
  expect(uncovered, `这些招的视觉缺口算不出来：${uncovered.join('、')}`).toEqual([]);
  // 而且**确实存在**需要补位的招——若全是 0，说明这套机制没接上任何东西（死代码）
  const need = CHARACTERS.flatMap(c => Object.values(c.moves).map(m => visualReachGap(c, m))).filter(g => g > 0);
  expect(need.length, '没有任何一招需要补位——要么判定框都改小了，要么这条算错了').toBeGreaterThan(10);
});

test('补位那一发真的会生成粒子，而且只在判定生效那一帧', () => {
  const niumo = CHARACTERS.find(c => c.id === 'niumo')!;
  const mv = niumo.moves.sp100;
  const gap = visualReachGap(niumo, mv);
  expect(gap, '牛魔王 sp100 本该是缺口最大的那一档').toBeGreaterThan(50);

  const bt = new Battle(structuredClone(niumo), structuredClone(CHARACTERS[0]));
  bt.p1.meter = 100;
  bt.tick({ ...NULL_INPUT, super: true }, NULL_INPUT);
  expect(bt.p1.move?.slot, '没能发出 sp100').toBe('sp100');

  const fx = new FxSystem();
  const alive = () => (fx as unknown as { pool: { alive: boolean }[] }).pool.filter(p => p.alive).length;
  // 判定生效之前：补位不该出现
  bt.p1.stateFrame = bt.p1.move!.startup - 1;
  fx.syncMoveFx(bt.p1, gap);
  const before = alive();
  // 判定生效那一帧：必须多出粒子
  bt.p1.stateFrame = bt.p1.move!.startup;
  fx.syncMoveFx(bt.p1, gap);
  expect(alive(), '判定生效那一帧没有补位特效——"什么都没碰到却算中"还在').toBeGreaterThan(before);
});

test('接线：GameCanvas 把缺口传给了 fx，不是算完摆着', () => {
  // 钉关系不钉字面量：取出那一行，看它由哪几件事组成
  const line = canvasSrc.split(String.fromCharCode(10)).find(l => /fx\.syncMoveFx\(/.test(l));
  expect(line, 'GameCanvas 里找不到 syncMoveFx 调用——锚点过时了').toBeTruthy();
  expect(line!, 'syncMoveFx 没收到缺口，补位机制等于没接上').toContain('visualReachGap');
});
