import { expect, test } from 'vitest';
import { CHARACTERS } from '../src/data/characters';
import { drawWings, wingSpread } from '../src/render/adornments';

// 雷震子整个人就是"翅膀"这件事：胜负台词、两段结局、两招招名（振翅挑／风雷双翅）都在说它。
// 而此前画面上是**两条同挂一个肩点的 154px 飘带**，数据里的注释还写着"要读成一对翅膀"——
// 同锚同长的两条带子只会叠成一条，梢部又收成针尖，读出来是一根鞭子。
// 注释说它是翅膀不能让它变成翅膀；这一组守的是"真的有一层翅膀，而且它随离地而动"。

const leizhen = CHARACTERS.find(c => c.id === 'leizhen')!;

test('雷震子有一对真的翅膀，不是拿飘带假装的', () => {
  expect(leizhen.adorn?.wings, '雷震子没有翅膀层').toBeDefined();
  // 飘带不该再兼职当翅膀：留着的那条得明显短，否则又回到"两条长带子叠成一条"
  for (const s of leizhen.adorn?.sashes ?? []) {
    expect(s.segs * s.segLen, `雷震子还留着一条 ${s.segs * s.segLen}px 的长飘带，会和翅膀抢轮廓`)
      .toBeLessThan(100);
  }
});

test('翅膀是他一个人的——别人身上不该冒出来', () => {
  const winged = CHARACTERS.filter(c => c.adorn?.wings).map(c => c.name);
  expect(winged, '有翅膀的不止雷震子一个').toEqual([leizhen.name]);
});

// 「他的主战场在空中」是这个角色的定位（全场最重的跳跃攻击）。
// 翅膀若在地上和空中一个样，那句定位在画面上就不存在。
test('离地就张开，落地收半——不是一张贴在背上的图', () => {
  const ground = wingSpread(0, 0);
  const peak = wingSpread(110, 0);        // 跳跃顶点约 110px
  expect(peak, '空中没有比地面张得更开').toBeGreaterThan(ground + 0.3);
  // 地面也不能完全收拢：收成 0 他就和别人一个轮廓了
  expect(ground, '站在地上翅膀完全收没了').toBeGreaterThan(0.3);
  expect(peak, '张开度超出 1，翼面会翻出去').toBeLessThanOrEqual(1);
  // 单调：越高越开，中间不能有回缩
  for (let y = 0; y < 60; y += 5) {
    expect(wingSpread(y + 5, 0)).toBeGreaterThanOrEqual(wingSpread(y, 0) - 1e-9);
  }
});

test('站着不动也在动——呼吸摆动不为零，但也不喧宾夺主', () => {
  const vals = Array.from({ length: 240 }, (_, f) => wingSpread(0, f));
  const span = Math.max(...vals) - Math.min(...vals);
  expect(span, '站着时翅膀完全静止').toBeGreaterThan(0.03);
  expect(span, '站着时翅膀摆动太大，会盖过"离地才张开"那一层').toBeLessThan(0.2);
});

// ── 张开度真的接到画法上了吗 ────────────────────────────────────────
// 上面那条只证明 wingSpread(y) 这个**数**随高度变大。它证明不了画出来的翅膀跟着变——
// 把 drawWings 里的角度写成常数，上面全部照样绿，而画面上翅膀从头到尾一个样。
// 这正是这个项目反复栽的那类"两处规则各写一份/算了但没接上"。所以这里比**画出来的东西**。
function wingTrace(y: number): string {
  const log: string[] = [];
  const ctx = new Proxy({} as Record<string, unknown>, {
    get(_t, k: string) {
      if (k === 'ellipse') return (...a: number[]) => log.push(a.map(v => v.toFixed(2)).join(','));
      if (['beginPath', 'fill', 'stroke', 'save', 'restore'].includes(k)) return () => {};
      return undefined;
    },
    set() { return true; },
  }) as unknown as CanvasRenderingContext2D;
  drawWings(ctx, leizhen.adorn!.wings!, 0, -118, 1, y, 0);
  return log.join('|');
}

test('画出来的翅膀真的跟着高度张开——不是算了个数没接上', () => {
  const ground = wingTrace(0), air = wingTrace(110);
  expect(ground.length, '地面上一根羽毛都没画').toBeGreaterThan(0);
  expect(air, '空中和地面画出来一模一样：张开度算了，但没接到画法上').not.toBe(ground);
  // 不只是"不一样"，要**更展开**：取最上面那根羽毛的中心高度（y 最小者），空中该更高
  const topY = (t: string) => Math.min(...t.split('|').map(seg => Number(seg.split(',')[1])));
  expect(topY(air), '空中翅膀没有比地面扬得更高').toBeLessThan(topY(ground) - 4);
});
