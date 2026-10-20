import { expect, test } from 'vitest';
import { mirrorLook, mirrorPalette, shiftHue } from '../src/render/palette';
import { CHARACTERS } from '../src/data/characters';
import { buildRun, FINAL_BOSS } from '../src/data/stages';

/**
 * 镜像战。选牛魔王时最后一关正是他本人——buildRun 的候选池是
 * `id !== playerId && id !== FINAL_BOSS`，而末关固定就是 FINAL_BOSS，
 * 所以"玩家 = BOSS"这一种情形滤不掉。陪练场同样能选到同一个人。
 *
 * 两边配色一模一样时，紧急回避一穿过去（它的设计就是从对手身体里穿到背后）
 * 就分不清谁是谁了。街机的老办法是换色——转色相，不动明度与饱和度：
 * 轮廓、材质、明暗全保持原样，认得出还是同一个人，也分得出不是同一个。
 */

/** 两个颜色差得够不够远（按 RGB 通道差之和） */
function dist(a: string, b: string): number {
  const p = (h: string) => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16));
  const [x, y] = [p(a), p(b)];
  return x.reduce((s, v, i) => s + Math.abs(v - y[i]), 0);
}

test('选最终 BOSS 本人时，末关真的会打到自己——这一种情形滤不掉', () => {
  const run = buildRun(FINAL_BOSS, 12345, CHARACTERS);
  expect(run[run.length - 1].bossId, '末关不是最终 BOSS').toBe(FINAL_BOSS);
  // 前几关不会再出现他（候选池已排除），所以整趟只有末关是镜像
  const mirrors = run.filter(s => s.bossId === FINAL_BOSS).length;
  expect(mirrors, `一趟里出现了 ${mirrors} 次最终 BOSS`).toBe(1);
});

test('换色之后两边看得出区别', () => {
  for (const c of CHARACTERS) {
    const m = mirrorPalette(c.palette);
    expect(dist(c.palette.main, m.main), `${c.name} 换色后主色几乎没变（${c.palette.main} → ${m.main}）`)
      .toBeGreaterThan(60);
    expect(/^#[0-9a-f]{6}$/i.test(m.main), `${c.name} 换色产出的不是 6 位色值：${m.main}`).toBe(true);
    expect(/^#[0-9a-f]{6}$/i.test(m.accent), `${c.name} 换色产出的不是 6 位色值：${m.accent}`).toBe(true);
  }
});

test('只换色相，不改明暗——形还是那个形', () => {
  // 灰色没有色相，转多少都还是它自己：这条同时验证了"不动明度"
  expect(shiftHue('#808080', 150)).toBe('#808080');
  // 转一圈回到原处（允许 ±1 的取整误差）
  const back = shiftHue(shiftHue('#c9862b', 180), 180);
  expect(dist(back, '#c9862b'), `转两次 180° 没回到原色：${back}`).toBeLessThan(6);
});

// 只换 palette 是不够的：飘带、余烬、气环、扬尘、兵器、大招背光各有各的颜色，
// 不一起换的话两个牛魔王仍然只有身体是两个色，身上飘的、手里拿的、
// 放大招时背后烧的全都一模一样——最显眼的几处反而没换。
test('身上带颜色的每一处都换掉了，不只是身体', () => {
  for (const c of CHARACTERS) {
    const before = structuredClone(c);
    const after = mirrorLook(structuredClone(c));
    const pairs: [string, string, string][] = [
      ['主色', before.palette.main, after.palette.main],
      ['点缀色', before.palette.accent, after.palette.accent],
    ];
    if (before.weapon) {
      pairs.push(['兵器杆', before.weapon.shaft, after.weapon!.shaft]);
      pairs.push(['兵器刃', before.weapon.edge, after.weapon!.edge]);
    }
    if (before.superGlow) {
      pairs.push(['背光内', before.superGlow[0], after.superGlow![0]]);
      pairs.push(['背光外', before.superGlow[1], after.superGlow![1]]);
    }
    const ba = before.adorn, aa = after.adorn;
    if (ba?.ember) pairs.push(['余烬', ba.ember.color, aa!.ember!.color]);
    if (ba?.aura !== undefined) pairs.push(['气环', ba.aura, aa!.aura!]);
    if (ba?.dust !== undefined) pairs.push(['扬尘', ba.dust, aa!.dust!]);
    for (const [i, s0] of (ba?.sashes ?? []).entries()) {
      pairs.push([`飘带${i}`, s0.color, aa!.sashes![i].color]);
      if (s0.tip !== undefined) pairs.push([`飘带${i}梢`, s0.tip, aa!.sashes![i].tip!]);
    }
    for (const [what, a, b] of pairs) {
      expect(a === b, `${c.name} 的${what}镜像后没变（${a}）——这一处两边还是撞色`).toBe(false);
    }
  }
});
