import { expect, test } from 'vitest';
import { CHARACTERS } from '../src/data/characters';
import { MOTIONS } from '../src/data/motions';
import { samplePose } from '../src/render/motion';
import { autoWeaponScale, weaponTipOf } from '../src/render/renderer';
import { FLOOR_Y } from '../src/engine/types';
import type { CharacterDef, Move } from '../src/engine/types';
import rendererSrc from '../src/render/renderer.ts?raw';

/**
 * 「武器还没接触对方，就显示被打了」——玩家反馈，量下来是真的：
 * 判定框前沿普遍比刃尖远，n3 一档多出 40~60px（接近一个身位宽）。
 *
 * 修的是**视觉**不是判定：判定框调过平衡、有守门钉着；weaponScale 这个字段
 * 本来就是为"招式名承诺变长的招"准备的，这里把它的缺省值改成"够到判定前沿所需的倍率"。
 * 所以这一组守的是**画出来的刃尖要够得到判定框前沿**，而不是反过来去改判定。
 */

/** 这一招在判定帧里，刃尖能伸到的最远处（相对脚底中心，面朝右） */
function tipReach(c: CharacterDef, m: Move, scale: number): number {
  const motion = MOTIONS[m.motionId] ?? MOTIONS.thrust;
  const total = m.startup + m.active + m.recovery;
  let best = -1e9;
  for (let f = m.startup; f <= m.startup + m.active; f++) {
    const p = samplePose(motion, (f / total) * motion.frames);
    best = Math.max(best, weaponTipOf(p, 0, FLOOR_Y, 1, { ...c.weapon!, len: c.weapon!.len * scale })[0]);
  }
  return best;
}

test('普通技：画出来的刃尖够得到判定框前沿——不再"打空了却算中"', () => {
  const bad: string[] = [];
  const capped: string[] = [];
  for (const c of CHARACTERS) {
    for (const slot of ['n1', 'n2', 'n3'] as const) {
      const m = c.moves[slot];
      if (m.projectile) continue;             // 投射物的判定属于飞出去那颗
      const front = m.hitbox.x + m.hitbox.w;
      const sc = autoWeaponScale(c, m);
      const gap = front - tipReach(c, m, sc);
      // 够到了就行；**或者**倍率已经顶到上限——那说明"再拉就不像挥兵器了"，
      // 是有意认下的差额，不是漏掉的。不为了让这条变绿去抬上限（那是把尺子改宽）。
      if (gap > 12 && sc < 2.0) bad.push(`${c.name} ${slot} 判定比刃尖远 ${Math.round(gap)}px（倍率才 ${sc.toFixed(2)}，还没顶到上限）`);
      if (gap > 12) capped.push(`${c.name} ${slot} 差 ${Math.round(gap)}px`);
    }
  }
  expect(bad, `这些普通技仍然"还没碰到就算中"：\n${bad.join('\n')}`).toEqual([]);
});

test('倍率只给普通技，且不会把兵器拉成面条', () => {
  for (const c of CHARACTERS) {
    for (const [slot, m] of Object.entries(c.moves)) {
      const s = autoWeaponScale(c, m);
      expect(s, `${c.name} ${slot} 的兵器倍率 ${s} 太夸张`).toBeLessThanOrEqual(3.2);
      // 必杀/超必杀不参与自动拉长：它们的射程是特效撑的，按同样算法要 2~6 倍，
      // 那会让 78px 的混铁棍变成 468px（半个场子长）
      if (slot.startsWith('s') && m.weaponScale === undefined) {
        expect(s, `${c.name} ${slot} 被自动拉长了——必杀/超必杀不该走这条`).toBe(1);
      }
    }
  }
});

test('手写的倍率优先——自动值不许覆盖数据里明写的', () => {
  const wukong = CHARACTERS.find(c => c.id === 'wukong')!;
  expect(wukong.moves.sp50.weaponScale, '如意棒撑天本来就手写了倍率').toBeGreaterThan(2);
  expect(autoWeaponScale(wukong, wukong.moves.sp50)).toBe(wukong.moves.sp50.weaponScale);
});

// 上面三条测的都是 autoWeaponScale 这个**函数**算得对，它们证明不了渲染时**用了**它——
// 把 drawFighter 里那行改回 `mv?.weaponScale ?? 1`，上面三条一条都不会红（红检验过）。
// 这正是本会话记过的那一类：算了，但没接上。所以补这一条，钉**关系**不钉字面量：
// 取出渲染里给 wScale 赋值的那一行，看它是不是由 autoWeaponScale 组成。
test('渲染真的用了这个倍率——不是算完摆在那儿', () => {
  const line = rendererSrc.split(String.fromCharCode(10)).find(l => /const wScale\s*=/.test(l));
  expect(line, 'renderer 里找不到 wScale 那一行——这条断言的锚点过时了').toBeTruthy();
  expect(line!, '渲染没走 autoWeaponScale，兵器还是按原倍率画的（判定又跑到刃尖前面去了）')
    .toContain('autoWeaponScale');
});
