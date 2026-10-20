import { expect, test } from 'vitest';
import { FxSystem } from '../src/render/fx';
import { Camera } from '../src/render/camera';
import { createFighter } from '../src/engine/battle';
import { mv, testChar } from './helpers';

test('粒子池有上限，超量 spawn 不增长', () => {
  const fx = new FxSystem();
  for (let i = 0; i < 5000; i++) fx.spawn('burst', 100, 100, { color: '#fff' });
  expect(fx.aliveCount()).toBeLessThanOrEqual(256);
});

test('粒子会死亡回收', () => {
  const fx = new FxSystem();
  fx.spawn('spark', 0, 0, { color: '#fff' });
  for (let i = 0; i < 120; i++) fx.tick();
  expect(fx.aliveCount()).toBe(0);
});

test('冻结帧（stateFrame 未推进）重复调用 syncMoveFx 不重复触发', () => {
  const fx = new FxSystem();
  const f = createFighter(testChar(), 100, 1);
  f.state = 'attack';
  f.stateFrame = 4;
  f.move = mv('n1', { fx: [{ frame: 4, type: 'spark', color: '#fff' }] });
  fx.syncMoveFx(f);
  fx.syncMoveFx(f); // 模拟 hitstop 冻结帧：battle.tick 提前返回，stateFrame 未变化，但仍被调用了一次
  expect(fx.aliveCount()).toBe(6); // spark 每次生成 6 个粒子；重复调用不应叠加成 12
});

test('白闪可延长满亮度持续时间（重击加重白闪）', () => {
  const fx = new FxSystem();
  fx.spawn('flash', 0, 0, { color: '#fff', size: 5 }); // size 复用为额外维持的 tick 数
  for (let i = 0; i < 5; i++) fx.tick();
  expect(fx.flashAlpha).toBe(0.7); // hold 期间不衰减
  fx.tick();
  expect(fx.flashAlpha).toBeLessThan(0.7); // hold 耗尽后才开始按原速率衰减
});

test('shockwave 半径随 size 放大；不传 size 的既有招式 fx 视觉不变', () => {
  const fx = new FxSystem();
  fx.spawn('shockwave', 0, 0, { color: '#fff' }); // 招式时间轴里的写法：不传 size，走默认基准
  fx.spawn('shockwave', 0, 0, { color: '#fff', size: 12 }); // 重击：2x 基准
  for (let i = 0; i < 5; i++) fx.tick(); // 离开 life===max 那一帧，半径才非零
  const arcs: number[] = [];
  const ctx = {
    save() {}, restore() {}, beginPath() {}, stroke() {}, fill() {},
    arc(_x: number, _y: number, r: number) { arcs.push(r); },
    set globalCompositeOperation(_v: string) {}, set globalAlpha(_v: number) {},
    set fillStyle(_v: string) {}, set strokeStyle(_v: string) {}, set lineWidth(_v: number) {},
  } as unknown as CanvasRenderingContext2D;
  fx.draw(ctx);
  expect(arcs.length).toBe(6); // 两组各 3 圈（shockwave 每次 spawn 3 个粒子）
  for (let i = 0; i < 3; i++) {
    // arc() 传的半径带 +4 的固定描边余量（同 t 下与 size 无关），减掉这个常量后才是严格 2 倍关系
    expect(arcs[3 + i] - 4).toBeCloseTo((arcs[i] - 4) * 2, 1);
  }
});

// Task 37 测试 4：新增的 crescent / bolt 形状由 seed / 固定几何决定——同参数两次生成结果
// 一致（不逐帧闪烁）。去掉 bolt 的哈希折线（比如改回 Math.random() 抖动）这条测试会红：
// 两次 draw() 采到的 lineTo 坐标会不一样。
test('crescent 由固定几何决定形状，同参数两次 draw() 结果一致', () => {
  const arcCalls: { x: number; y: number; r: number; a0: number; a1: number }[] = [];
  const ctx = {
    save() {}, restore() {}, beginPath() {}, closePath() {}, fill() {}, stroke() {},
    arc(x: number, y: number, r: number, a0: number, a1: number) { arcCalls.push({ x, y, r, a0, a1 }); },
    set globalCompositeOperation(_v: string) {}, set globalAlpha(_v: number) {},
    set fillStyle(_v: unknown) {}, set strokeStyle(_v: unknown) {}, set lineWidth(_v: number) {},
  } as unknown as CanvasRenderingContext2D;

  const run = () => {
    const fx = new FxSystem();
    fx.spawn('crescent', 50, 60, { color: '#fff', size: 20, angle: 0.4 });
    for (let i = 0; i < 6; i++) fx.tick(); // 离开 life===max 那一帧
    const calls: typeof arcCalls = [];
    const localCtx = { ...ctx, arc: (x: number, y: number, r: number, a0: number, a1: number) => calls.push({ x, y, r, a0, a1 }) } as unknown as CanvasRenderingContext2D;
    fx.draw(localCtx);
    return calls;
  };
  const first = run();
  const second = run();
  expect(first.length).toBeGreaterThan(0);
  expect(second).toEqual(first); // 同参数、同 tick 数，两次生成的弧形几何完全一致
});

test('bolt 由固定 seed 决定折线形状，同参数两次 draw() 结果一致（不闪烁）', () => {
  const run = () => {
    const fx = new FxSystem();
    fx.spawn('bolt', 30, 40, { color: '#0ff', size: 8, angle: 1.1 });
    for (let i = 0; i < 3; i++) fx.tick();
    const lineTos: [number, number][] = [];
    const ctx = {
      save() {}, restore() {}, beginPath() {}, closePath() {}, fill() {}, stroke() {},
      moveTo() {}, lineTo(x: number, y: number) { lineTos.push([x, y]); }, arc() {},
      set globalCompositeOperation(_v: string) {}, set globalAlpha(_v: number) {},
      set fillStyle(_v: unknown) {}, set strokeStyle(_v: unknown) {}, set lineWidth(_v: number) {},
    } as unknown as CanvasRenderingContext2D;
    fx.draw(ctx);
    return lineTos;
  };
  const first = run();
  const second = run();
  expect(first.length).toBeGreaterThan(0);
  expect(second).toEqual(first); // 折线的每一段端点坐标两次完全相同——没有 Math.random() 抖动
});

test('相机缩放有钳制', () => {
  const cam = new Camera();
  for (let i = 0; i < 200; i++) cam.follow(40, 920), cam.tick();
  expect(cam.zoom).toBeGreaterThanOrEqual(0.85);
  for (let i = 0; i < 200; i++) cam.follow(400, 440), cam.tick();
  expect(cam.zoom).toBeLessThanOrEqual(1.15);
});
