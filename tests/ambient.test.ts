import { expect, test } from 'vitest';
import { drawAmbient } from '../src/render/renderer';
import { HOME } from '../src/data/stages';
import type { StageBg } from '../src/data/stages';

/**
 * 关卡氛围粒子。十二关此前只用三种飘法（ember/petal/firefly），四五关共用同一种——
 * 背景各不相同，空气却是同一团。加了 ash（骨灰无声下沉）、spark（电花明灭）、
 * mist（鬼气大团慢移）之后要守两件事：
 *   ① 每一关声明的形态，渲染层都真的认得——不认得会**静默**落到通用的"原地浮"分支，
 *      数据上写着 ash、画面上还是流萤，没有任何报错
 *   ② 六种形态真的不一样。名字不同而运动相同，等于没加
 */

/** 记录画了哪些点的假 ctx。只实现 drawAmbient 用到的那几个方法 */
function recorder() {
  const pts: { x: number; y: number; r: number; alpha: number }[] = [];
  let tx = 0, ty = 0, fill = '';
  const ctx = {
    save() {}, restore() {}, beginPath() {}, fill() {}, rotate() {},
    globalCompositeOperation: '',
    set fillStyle(v: string) { fill = v; },
    get fillStyle() { return fill; },
    translate(x: number, y: number) { tx = x; ty = y; },
    arc(x: number, y: number, r: number) { pts.push({ x, y, r, alpha: alphaOf(fill) }); },
    ellipse(x: number, y: number, rx: number) { pts.push({ x: tx + x, y: ty + y, r: rx, alpha: alphaOf(fill) }); },
  } as unknown as CanvasRenderingContext2D;
  return { ctx, pts };
}

/** hexAlpha 产出的是 rgba(r,g,b,a) */
function alphaOf(css: string): number {
  const m = /rgba\([^,]+,[^,]+,[^,]+,([^)]+)\)/.exec(css);
  return m ? parseFloat(m[1]) : 1;
}

const KINDS = ['ember', 'petal', 'firefly', 'ash', 'spark', 'mist'] as const;

/** 连画 n 帧，返回每一帧所有粒子的平均 y（drawAmbient 自己推进相位） */
function trace(kind: typeof KINDS[number], frames: number): { ys: number[]; pts: ReturnType<typeof recorder>['pts'] } {
  const bg: StageBg = { ...HOME.nezha.bg, ambient: { kind, color: '#88ccff', count: 24 } };
  const ys: number[] = [];
  let last: ReturnType<typeof recorder>['pts'] = [];
  for (let f = 0; f < frames; f++) {
    const { ctx, pts } = recorder();
    drawAmbient(ctx, bg, 0, 960, 540, 0, 0);
    ys.push(pts.reduce((s, p) => s + p.y, 0) / Math.max(1, pts.length));
    last = pts;
  }
  return { ys, pts: last };
}

test('每一关声明的粒子形态，渲染层都认得', () => {
  for (const home of Object.values(HOME)) {
    const k = home.bg.ambient?.kind;
    expect(k, `${home.name} 没有氛围粒子`).toBeDefined();
    expect(KINDS as readonly string[], `${home.name} 的粒子形态 ${k} 渲染层不认得，会静默落回"原地浮"`)
      .toContain(k!);
  }
});

test('六种形态都有关卡在用——写了没人用等于没写', () => {
  const used = new Set(Object.values(HOME).map(h => h.bg.ambient?.kind));
  for (const k of KINDS) {
    expect(used.has(k), `没有任何一关在用 ${k}`).toBe(true);
  }
});

// 轨迹是模 620 循环的，首尾相减会被"绕回去"骗到（落瓣量出 -15，像在上升）。
// 而**多颗一起取平均**同样不行：红检时把 ash 的分支整个摘掉、让它落回"原地浮"，
// 这条断言照样绿——24 颗浮游粒子的平均 y 在采样窗口里碰巧也是往下多几帧。
// 只看一颗、逐帧数方向，才分得出"一路沉下去"和"原地上下晃"。
test('下沉的两种真的在下沉，火星真的在上升，浮游的原地晃', () => {
  const drop = (k: typeof KINDS[number]) => {
    const bg: StageBg = { ...HOME.nezha.bg, ambient: { kind: k, color: '#88ccff', count: 1 } };
    const ys: number[] = [];
    for (let f = 0; f < 1200; f++) {
      const { ctx, pts } = recorder();
      drawAmbient(ctx, bg, 0, 960, 540, 0, 0);
      ys.push(pts[0].y);
    }
    let down = 0, n = 0, step = 0;
    for (let i = 1; i < ys.length; i++) {
      const d = ys[i] - ys[i - 1];
      if (Math.abs(d) > 100) continue;      // 绕回那一跳
      if (d > 0) down++;
      step += Math.abs(d); n++;
    }
    // 幅度：一路沉/升的会扫过大半个屏幕，原地浮的只在自己那点 sway 里晃
    return { share: down / Math.max(1, n), speed: step / Math.max(1, n),
      range: Math.max(...ys) - Math.min(...ys) };
  };
  // 一路沉/一路升的，方向必须几乎每一帧都一致；原地浮的该是一半一半
  expect(drop('petal').share, '落瓣不是一路往下').toBeGreaterThan(0.9);
  expect(drop('ash').share, '骨灰不是一路下沉——多半落回了"原地浮"那一支').toBeGreaterThan(0.9);
  expect(drop('ember').share, '火星不是一路往上').toBeLessThan(0.1);
  // 浮游的三种不看方向看**幅度**：它们的正弦周期比采样窗口还长，
  // 单看方向会读成"一路在走"（firefly 量出 0%）。原地浮的幅度只有自己那点 sway
  for (const k of ['firefly', 'spark', 'mist'] as const) {
    const r = drop(k).range;
    // 实测 1200 帧里：ember 600 / petal 390 / ash 171，而 firefly / spark / mist 都是 24
    expect(r, `${k} 上下扫了 ${r.toFixed(0)}px，不像原地浮游`).toBeLessThan(60);
  }
  for (const k of ['petal', 'ash', 'ember'] as const) {
    const r = drop(k).range;
    expect(r, `${k} 只在 ${r.toFixed(0)}px 里晃，没有真的飘过场`).toBeGreaterThan(120);
  }
  // 骨灰比落瓣慢得多：它是无声地沉，不是被风吹落
  expect(drop('ash').speed, `骨灰每帧走 ${drop('ash').speed.toFixed(2)}，和落瓣的 `
    + `${drop('petal').speed.toFixed(2)} 一样快，两种读起来就是一种`)
    .toBeLessThan(drop('petal').speed * 0.7);
});

test('电花会明灭，流萤不会——名字不同，运动也得不同', () => {
  const swing = (k: typeof KINDS[number]) => {
    let lo = 1, hi = 0;
    for (let f = 0; f < 30; f++) {
      const { ctx, pts } = recorder();
      drawAmbient(ctx, { ...HOME.nezha.bg, ambient: { kind: k, color: '#88ccff', count: 24 } }, 0, 960, 540, 0, 0);
      for (const p of pts) { lo = Math.min(lo, p.alpha); hi = Math.max(hi, p.alpha); }
    }
    return hi - lo;
  };
  const spark = swing('spark'), fly = swing('firefly');
  expect(spark, `电花的明暗差只有 ${spark.toFixed(2)}，闪不起来`).toBeGreaterThan(0.3);
  expect(spark, `电花明灭 ${spark.toFixed(2)} 不比流萤的 ${fly.toFixed(2)} 明显`).toBeGreaterThan(fly);
});

test('鬼气是大团的，其余都是细粒', () => {
  const rOf = (k: typeof KINDS[number]) => {
    const { pts } = trace(k, 2);
    return pts.reduce((s, p) => s + p.r, 0) / pts.length;
  };
  const mist = rOf('mist');
  for (const k of ['ember', 'firefly', 'ash', 'spark'] as const) {
    expect(mist, `鬼气(${mist.toFixed(1)}) 没有比 ${k}(${rOf(k).toFixed(1)}) 明显更大`)
      .toBeGreaterThan(rOf(k) * 3);
  }
});
