import { expect, test } from 'vitest';
import { BTN } from '../src/ui/TouchLayer';
import devSrc from '../docs/engine-notes.zh-CN.md?raw';

// 触屏按键的坐标全是写死的，而别处（静音键、浮层的让位宽度）要按这张表算——
// 这种耦合一改就散：簇长大了，那些数不会跟着动，也不会有任何报错。
// 所以包围盒一律现算，不往注释里抄：源码里抄过两版，两版的数和归属都是错的。

interface Btn { k: string; s: number; r: number; b: number }
// 直接用导出的 BTN，不再拿正则去刮 TouchLayer.tsx 的源码文本：正则漏掉一颗键
// （换个写法、多个字段、拆行都会漏）不会报错，只会让下面每一条断言都少算一颗，
// 而"少算"看起来和"全过"一模一样。
function buttons(): Btn[] {
  return BTN.map(b => ({ k: b.key, s: b.size, r: b.right, b: b.bottom }));
}

test('按键两两不重叠——重叠的触摸目标必然误触', () => {
  const bs = buttons();
  expect(bs.length, `只解析出 ${bs.length} 颗按键，正则的锚点可能过时了`).toBe(5);
  for (let i = 0; i < bs.length; i++) for (let j = i + 1; j < bs.length; j++) {
    const a = bs[i], c = bs[j];
    const dist = Math.hypot((a.r + a.s / 2) - (c.r + c.s / 2), (a.b + a.s / 2) - (c.b + c.s / 2));
    expect(dist, `${a.k} 和 ${c.k} 的圆形触摸区重叠了 ${((a.s + c.s) / 2 - dist).toFixed(0)}px`)
      .toBeGreaterThanOrEqual((a.s + c.s) / 2);
  }
});

// 「不重叠」远远不够：拇指的接触面直径通常 45-57px，两颗键**只隔 4px** 时误触是必然的。
// 七颗键那版实测最小间隙 4.1px（技三与大招之间），而按错的代价是最重的那种——
// 想放技三，按出大招，50-100 气当场蒸发。这条断言钉的是"不容易按错"，不是"没有重叠"。
test('键与键之间留得下一根拇指——间隙与键径都有下限', () => {
  const bs = buttons();
  let worst = { gap: Infinity, pair: '' };
  for (let i = 0; i < bs.length; i++) for (let j = i + 1; j < bs.length; j++) {
    const a = bs[i], c = bs[j];
    const gap = Math.hypot((a.r + a.s / 2) - (c.r + c.s / 2), (a.b + a.s / 2) - (c.b + c.s / 2))
      - (a.s + c.s) / 2;
    if (gap < worst.gap) worst = { gap, pair: `${a.k}/${c.k}` };
  }
  expect(worst.gap, `最挤的一对是 ${worst.pair}，只隔 ${worst.gap.toFixed(1)}px`).toBeGreaterThanOrEqual(10);
  const small = bs.filter(b => b.s < 56);
  expect(small.map(b => `${b.k}(${b.s}px)`), '有键小于 56px——拇指按不准').toEqual([]);
});

// 拇指从屏幕右下角（横屏时右手拇指的支点）能舒服够到的范围大致到半径 230px。
// 吹飞键原来放在圆心离角 288px 处——其余六颗都在 88~230 之间，只有它甩在簇外。
// 而键盘上的「攻击+防御同按」在触屏上做不到（拳键与格挡键隔着 160px，一根拇指按不到），
// 所以那颗键是 CD 在触屏上的唯一入口：够不到 = 这个系统在手机上不存在。
test('每颗按键都落在拇指够得到的半径内', () => {
  const bs = buttons();
  const REACH = 240;   // 230 的舒适半径 + 一点余量
  const far = bs
    .map(b => ({ k: b.k, d: Math.hypot(b.r + b.s / 2, b.b + b.s / 2) }))
    .filter(x => x.d > REACH);
  const show = bs.map(b => `${b.k} ${Math.round(Math.hypot(b.r + b.s / 2, b.b + b.s / 2))}`).join('  ');
  expect(far.map(x => `${x.k}(${Math.round(x.d)}px)`),
    `这些键在拇指够不到的地方：${far.map(x => x.k).join('、')}　全部距离：${show}`).toEqual([]);
});

// 开发笔记「七键并成五键」一节报了两个数：最小间隙与最小键径。它旁边原来还写着"这两个数由
// `touchDoc` 那条测试跟 BTN 表对着"——**仓库里根本没有 touchDoc 这条测试**，
// 那句话是假的，而它恰好属于那份笔记自己总结的那一类（声称被守着、其实没人守）。
// 与其删掉那句话，不如让它变成真的：这条就是它说的那条。
//
// 必须钉在「**现在**……」那一句上：同一节讲七键旧版时也写了"最小间隙/最小键径"，
// 只按词去匹会命中旧版那组数（4.1/54），报出来的差值指向历史留档、不是当前布局。
// （这条锚点是从 addCharDoc.test.ts 里那条重复的守门并过来的——同一句话被两条
// 测试守着，等于没人对它负责。）
test('开发笔记报的最小间隙/键径与键表对得上', () => {
  const bs = buttons();
  let worst = Infinity;
  for (let i = 0; i < bs.length; i++) for (let j = i + 1; j < bs.length; j++) {
    const a = bs[i], c = bs[j];
    worst = Math.min(worst, Math.hypot((a.r + a.s / 2) - (c.r + c.s / 2), (a.b + a.s / 2) - (c.b + c.s / 2)) - (a.s + c.s) / 2);
  }
  // 先切到那一节再匹：同一节里讲七键旧版也写了"最小间隙/最小键径"，全文匹会命中历史留档
  const sec = devSrc.slice(devSrc.indexOf('### 七键并成五键'));
  expect(sec.length, 'docs/engine-notes.zh-CN.md 里找不到「### 七键并成五键」这一节——锚点过时了').toBeGreaterThan(0);
  const m = /现在最小间隙 \*\*([\d.]+)px\*\*、最小键径 (\d+)px/.exec(sec);
  expect(m, 'docs/engine-notes.zh-CN.md 里那句「现在最小间隙…、最小键径…」找不到了——这条断言的锚点过时了').toBeTruthy();
  expect(Number(m![1]), '开发笔记写的最小间隙与 BTN 表算出来的对不上').toBeCloseTo(worst, 1);
  expect(Number(m![2]), '开发笔记写的最小键径与 BTN 表算出来的对不上').toBe(Math.min(...bs.map(b => b.s)));
});
