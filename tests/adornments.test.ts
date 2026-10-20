import { expect, test } from 'vitest';
import { Battle } from '../src/engine/battle';
import { CHARACTERS } from '../src/data/characters';
import { FLOOR_Y, NULL_INPUT } from '../src/engine/types';
import { addDecal, decalCount, emberCount, sashPointsFor, tickAdornments } from '../src/render/adornments';

// 飘带是 Verlet 链：跟着骨骼锚点用弹簧追赶，不由关键帧驱动。它最容易出的问题是数值发散
// ——某一帧注入了错误的速度，整条带子就直挺挺弹出去。下面几条守的就是「垂向、不穿地、
// 不发散、间距被约束住」这几件事。
//
// 一条记录：浏览器里第一次看到"飘带竖成一根棍子"时，我判断是触地钳位清错了速度分量，
// 改完就提交了。补测试时才发现两个版本轨迹没有可测差异——那一幕是自动化标签只跑了几帧、
// 链条还没落定的**初始瞬态**，跟钳位无关。真正管用的是把初始节点沿身后铺开（否则全部
// 重合，第一帧约束方向退化）。这段留在这里，是因为"改完就以为修好了"本身值得记一笔。

const settle = (cid: string, frames = 200) => {
  const c = CHARACTERS.find(x => x.id === cid)!;
  const b = new Battle(structuredClone(c), structuredClone(c));
  for (let i = 0; i < frames; i++) { b.tick(NULL_INPUT, NULL_INPUT); tickAdornments(b); }
  return { b, sashes: sashPointsFor(0) };
};

test('四个角色都配了飘带，且节点数与配置一致', () => {
  for (const c of CHARACTERS) {
    expect(c.adorn?.sashes?.length, `${c.name} 没配飘带`).toBeGreaterThan(0);
    const { sashes } = settle(c.id, 30);
    expect(sashes.length).toBe(c.adorn!.sashes!.length);
    sashes.forEach((pts, i) => expect(pts.length).toBe(c.adorn!.sashes![i].segs));
  }
});

test('静止站立时飘带垂在锚点下方——不会朝上竖起来', () => {
  for (const c of CHARACTERS) {
    const { sashes } = settle(c.id);
    sashes.forEach((pts, i) => {
      const anchor = pts[0], tail = pts[pts.length - 1];
      expect(tail.y, `${c.name} 第 ${i} 条飘带朝上竖起来了（梢部 y=${tail.y.toFixed(0)} 高于锚点 ${anchor.y.toFixed(0)}）`)
        .toBeGreaterThan(anchor.y);
    });
  }
});

// 触地钳位的 bug 只在**瞬态**里显形：稳态下带子早已贴地、纵向速度本来就是 0，怎么钳都看不出来。
// 要复现必须让它带着真实的下落速度砸向地面。
//
// 量什么很关键：下落**过程中**梢部本来就应该翘在锚点上方（带子拖在身后，这是对的），
// 所以不能拿整段过程取最大值——第一版就是这么写的，量到 109px 于是把正确行为报成了 bug。
// 真正该守的是「**落地之后**带子要垂回锚点下方，而不是被反弹成一根朝上的棍子」。
test('落地之后飘带垂回锚点下方，不会被反弹成朝上竖起', () => {
  for (const c of CHARACTERS) {
    const b = new Battle(structuredClone(c), structuredClone(c));
    for (let i = 0; i < 40; i++) { b.tick(NULL_INPUT, NULL_INPUT); tickAdornments(b); }
    b.p1.y = 220; b.p1.vy = -16; b.p1.state = 'jump';
    let landedAt = -1;
    let worstAfter = -Infinity;
    for (let i = 0; i < 200; i++) {
      b.tick(NULL_INPUT, NULL_INPUT);
      tickAdornments(b);
      if (landedAt < 0 && b.p1.y <= 0) landedAt = i;
      if (landedAt >= 0 && i > landedAt + 25) {   // 落地后给 25 帧回落时间
        for (const pts of sashPointsFor(0)) {
          worstAfter = Math.max(worstAfter, pts[0].y - pts[pts.length - 1].y);
        }
      }
    }
    expect(landedAt, `${c.name} 没有落地，样本作废`).toBeGreaterThan(0);
    expect(worstAfter, `${c.name} 落地后飘带仍朝上竖着 ${worstAfter.toFixed(0)}px`).toBeLessThan(20);
  }
});

test('飘带不穿地、不发散', () => {
  for (const c of CHARACTERS) {
    const { sashes } = settle(c.id, 400);
    for (const pts of sashes) {
      for (const p of pts) {
        expect(Number.isFinite(p.x) && Number.isFinite(p.y), `${c.name} 飘带数值发散`).toBe(true);
        expect(p.y, `${c.name} 飘带穿到地面以下`).toBeLessThanOrEqual(FLOOR_Y);
        expect(Math.abs(p.x), `${c.name} 飘带飞出场地`).toBeLessThan(2000);
      }
    }
  }
});

test('相邻节点的间距被约束住，不会被拉成一条直线也不会挤成一点', () => {
  const c = CHARACTERS[0];
  const { sashes } = settle(c.id, 240);
  sashes.forEach((pts, i) => {
    const want = c.adorn!.sashes![i].segLen;
    for (let k = 1; k < pts.length; k++) {
      const d = Math.hypot(pts[k].x - pts[k - 1].x, pts[k].y - pts[k - 1].y);
      expect(d, `第 ${k} 节间距 ${d.toFixed(1)} 偏离目标 ${want}`).toBeGreaterThan(want * 0.5);
      expect(d).toBeLessThan(want * 1.6);
    }
  });
});

test('余烬持续生成又持续消散，数量稳定在上限内', () => {
  const c = CHARACTERS.find(x => x.id === 'nezha')!;
  const b = new Battle(structuredClone(c), structuredClone(c));
  for (let i = 0; i < 60; i++) { b.tick(NULL_INPUT, NULL_INPUT); tickAdornments(b); }
  const early = emberCount(0);
  for (let i = 0; i < 600; i++) { b.tick(NULL_INPUT, NULL_INPUT); tickAdornments(b); }
  expect(early, '应该已经冒出余烬').toBeGreaterThan(0);
  expect(emberCount(0), '余烬不能无限堆积').toBeLessThanOrEqual(26);
});

test('地面痕迹会自然消退，且数量有上限', () => {
  const c = CHARACTERS[0];
  const b = new Battle(structuredClone(c), structuredClone(c));
  tickAdornments(b);
  for (let i = 0; i < 30; i++) addDecal(200 + i * 10, 'scorch', '#b9a888');
  expect(decalCount(), '超出上限的旧痕迹应被丢弃').toBeLessThanOrEqual(14);
  for (let i = 0; i < 400; i++) { b.tick(NULL_INPUT, NULL_INPUT); tickAdornments(b); }
  expect(decalCount(), '痕迹应随时间消退').toBe(0);
});

test('换一局重置：飘带与痕迹不会从上一局带过来', () => {
  const c = CHARACTERS[0];
  const b1 = new Battle(structuredClone(c), structuredClone(c));
  for (let i = 0; i < 120; i++) { b1.tick(NULL_INPUT, NULL_INPUT); tickAdornments(b1); }
  addDecal(300, 'crack', '#fff');
  expect(decalCount()).toBeGreaterThan(0);
  const b2 = new Battle(structuredClone(c), structuredClone(c));
  tickAdornments(b2);
  expect(decalCount(), '新一局应清空地面痕迹').toBe(0);
});
