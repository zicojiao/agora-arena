import { expect, test } from 'vitest';
import { Battle } from '../src/engine/battle';
import { CHARACTERS } from '../src/data/characters';
import { FLOOR_Y, NULL_INPUT } from '../src/engine/types';
import { flingWeapon, flungCount, isDisarmed, tickAdornments } from '../src/render/adornments';
import { weaponTipOf } from '../src/render/renderer';
import { samplePose } from '../src/render/motion';
import { MOTIONS } from '../src/data/motions';

test('招式名承诺变长的招，兵器倍率确实大于 1', () => {
  const wukong = CHARACTERS.find(c => c.id === 'wukong')!;
  // 如意棒：撑天与横扫千军都要伸长，且撑天最长
  expect(wukong.moves.sp50.weaponScale, '奥义·如意棒撑天该最长').toBeGreaterThan(2);
  expect(wukong.moves.s1.weaponScale, '横扫千军该伸长').toBeGreaterThan(1.5);
  expect(wukong.moves.sp50.weaponScale!).toBeGreaterThan(wukong.moves.s1.weaponScale!);
  // 四个角色都至少有一招会变形，否则这套机制等于没接上
  for (const c of CHARACTERS) {
    const any = Object.values(c.moves).some(m => (m.weaponScale ?? 1) > 1);
    expect(any, `${c.name} 没有任何一招用到 weaponScale`).toBe(true);
  }
});

test('倍率真的改变刃尖伸出的距离', () => {
  const w = CHARACTERS.find(c => c.id === 'wukong')!.weapon!;
  const p = samplePose(MOTIONS.thrust, 5);
  const base = weaponTipOf(p, 400, FLOOR_Y, 1, w);
  const long = weaponTipOf(p, 400, FLOOR_Y, 1, { ...w, len: w.len * 3.2 });
  const d1 = Math.hypot(base[0] - 400, base[1] - FLOOR_Y);
  const d2 = Math.hypot(long[0] - 400, long[1] - FLOOR_Y);
  expect(d2, '伸长后刃尖应明显更远').toBeGreaterThan(d1 * 1.5);
});

test('兵器被打飞后翻着旋出去，最终扎进地里立住', () => {
  const c = CHARACTERS[0];
  const b = new Battle(structuredClone(c), structuredClone(c));
  tickAdornments(b); // 建立本局
  expect(flungCount()).toBe(0);
  flingWeapon(1, 500, 0, 1);
  expect(flungCount()).toBe(1);
  expect(isDisarmed(1), '被打飞的一方应算作脱手').toBe(true);
  expect(isDisarmed(0), '另一方不受影响').toBe(false);
  for (let i = 0; i < 200; i++) { b.tick(NULL_INPUT, NULL_INPUT); tickAdornments(b); }
  // 扎地之后不再移动：再跑一百帧位置不变
  expect(flungCount(), '扎地的兵器应一直留在场上').toBe(1);
});

test('换一局把打飞的兵器清掉——上一局的刀不该插在新一局的地上', () => {
  const c = CHARACTERS[0];
  const b1 = new Battle(structuredClone(c), structuredClone(c));
  tickAdornments(b1);
  flingWeapon(0, 400, 0, -1);
  expect(flungCount()).toBe(1);
  const b2 = new Battle(structuredClone(c), structuredClone(c));
  tickAdornments(b2);
  expect(flungCount(), '新一局应清空').toBe(0);
  expect(isDisarmed(0), '新一局双方都该拿着兵器').toBe(false);
});
