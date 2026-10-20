import { expect, test } from 'vitest';
import { MandorlaSystem } from '../src/render/mandorla';

/** 最小 CanvasRenderingContext2D 桩：只记录 scale/globalAlpha/fill 调用，其余方法空操作 */
function mockCtx() {
  const calls: string[] = [];
  const grad = { addColorStop() {} };
  const ctx = {
    save() {}, restore() {}, translate() {}, rotate() {},
    scale(sx: number) { calls.push(`scale:${sx.toFixed(3)}`); },
    beginPath() {}, moveTo() {}, quadraticCurveTo() {}, closePath() {}, arc() {}, stroke() {},
    fill() { calls.push('fill'); },
    createRadialGradient() { return grad; },
    set globalCompositeOperation(_v: string) {},
    set globalAlpha(v: number) { calls.push(`alpha:${v.toFixed(3)}`); },
    set fillStyle(_v: unknown) {},
    set strokeStyle(_v: unknown) {},
    set lineWidth(_v: number) {},
  } as unknown as CanvasRenderingContext2D;
  return { ctx, calls };
}

test('绽放走逻辑 tick，不是一次到位：刚触发时不可见，满 12 tick 后画出完整花瓣', () => {
  const m = new MandorlaSystem();
  m.trigger(100);
  const { ctx: ctx0, calls: c0 } = mockCtx();
  m.draw(ctx0, 0, 0, 1);
  expect(c0.filter(c => c === 'fill').length).toBe(0); // age=0，绽放为 0，还没画出任何花瓣

  for (let i = 0; i < 12; i++) m.tick(true);
  const { ctx: ctx1, calls: c1 } = mockCtx();
  m.draw(ctx1, 0, 0, 1);
  expect(c1.filter(c => c === 'fill').length).toBeGreaterThan(0); // 满 12 tick 绽放到位
});

test('暗场退场（active=false）后立即关闭，draw 不再画任何东西', () => {
  const m = new MandorlaSystem();
  m.trigger(100);
  for (let i = 0; i < 12; i++) m.tick(true);
  m.tick(false); // 对应 cine.dark 已衰减到 0
  const { ctx, calls } = mockCtx();
  m.draw(ctx, 0, 0, 0);
  expect(calls.length).toBe(0);
});

test('奥义(sp50) 比超必杀(sp100) 尺寸更小、更暗——两档要有明确的分量差', () => {
  const m50 = new MandorlaSystem(); m50.trigger(50);
  const m100 = new MandorlaSystem(); m100.trigger(100);
  for (let i = 0; i < 12; i++) { m50.tick(true); m100.tick(true); }
  const r50 = mockCtx(), r100 = mockCtx();
  m50.draw(r50.ctx, 0, 0, 1);
  m100.draw(r100.ctx, 0, 0, 1);
  const scale50 = Number(r50.calls.find(c => c.startsWith('scale:'))!.split(':')[1]);
  const scale100 = Number(r100.calls.find(c => c.startsWith('scale:'))!.split(':')[1]);
  const alpha50 = Number(r50.calls.find(c => c.startsWith('alpha:'))!.split(':')[1]);
  const alpha100 = Number(r100.calls.find(c => c.startsWith('alpha:'))!.split(':')[1]);
  expect(scale50).toBeLessThan(scale100);
  expect(alpha50).toBeLessThan(alpha100);
});

test('花瓣数在 12–16 片之间（brief 要求的范围），每片一次 fill', () => {
  const m = new MandorlaSystem();
  m.trigger(100);
  for (let i = 0; i < 12; i++) m.tick(true);
  const { ctx, calls } = mockCtx();
  m.draw(ctx, 0, 0, 1);
  const fills = calls.filter(c => c === 'fill').length;
  expect(fills).toBeGreaterThanOrEqual(12);
  expect(fills).toBeLessThanOrEqual(16);
});
