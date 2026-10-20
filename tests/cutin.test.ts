import { expect, test } from 'vitest';
import { CutInSystem } from '../src/render/cutin';

function mockCtx() {
  const calls: string[] = [];
  const drawn: number[][] = [];
  const ctx = {
    save() {}, restore() {}, translate() {}, rotate() {}, scale() {},
    beginPath() {}, moveTo() {}, lineTo() {}, closePath() {}, clip() {},
    fill() { calls.push('fill'); }, stroke() { calls.push('stroke'); },
    drawImage(...a: unknown[]) { calls.push('drawImage'); drawn.push(a as number[]); },
    set fillStyle(_v: unknown) {}, set strokeStyle(_v: unknown) {}, set lineWidth(_v: number) {},
  } as unknown as CanvasRenderingContext2D;
  return { ctx, calls, drawn };
}

test('缺 head.png（part 为 null）时 trigger 直接跳过，draw 不产生任何绘制调用——不崩、不画空框', () => {
  const c = new CutInSystem();
  c.trigger(null, 1);
  const { ctx, calls } = mockCtx();
  expect(() => c.draw(ctx)).not.toThrow();
  expect(calls.length).toBe(0);
});

test('时停内保持在位，时停结束后按 tick（不是 draw）滑出并最终关闭', () => {
  const img = {} as HTMLImageElement;
  const c = new CutInSystem();
  c.trigger({ img, top: 0, bottom: 128, left: 0, right: 128 }, 1);
  c.tick(true); // 仍在时停
  const { ctx: ctx1, calls: c1 } = mockCtx();
  c.draw(ctx1);
  expect(c1).toContain('drawImage'); // 时停内仍然画出来

  for (let i = 0; i < 30; i++) c.tick(false); // 时停结束，滑出耗时远小于 30 次 tick
  const { ctx: ctx2, calls: c2 } = mockCtx();
  c.draw(ctx2);
  expect(c2.length).toBe(0); // 滑出完毕后关闭，不再画
});

test('头像按**裁剪后**的内容等比铺进 176x232 框：参数全部有限，且必有一边贴满', () => {
  // 这条守门以前形同虚设：老 mock 传 {} as HTMLImageElement，naturalWidth 是 undefined，
  // 于是 drawImage 九个几何参数全是 NaN，而测试只断言"调用过 drawImage"照样绿。
  // canvas 对非有限参数是**静默不画**的，所以那种回归会带着全绿的测试发出去，画面上啥也没有。
  const img = {} as HTMLImageElement;   // 故意不给 naturalWidth：算式不该再依赖它
  const c = new CutInSystem();
  // 铁扇公主的真实口径：整图 128 宽，内容只占 x=24..104（80px）、y=2..126（124px）
  c.trigger({ img, top: 2, bottom: 126, left: 24, right: 104 }, 1);
  const { ctx, drawn } = mockCtx();
  c.draw(ctx);
  const a = drawn[0];
  expect(a).toBeTruthy();
  for (const v of a.slice(1)) expect(Number.isFinite(v)).toBe(true);
  const [, , , , , , , dw, dh] = a;
  // 钉死两边的实际尺寸，不写"宽高有一条贴满"——那条区分不了老 bug：
  // 老代码拿整幅 128 宽算，宽边照样正好贴满 176，断言一样是绿的。
  expect(dw).toBeCloseTo(149.68, 1);
  expect(dh).toBeCloseTo(232, 1);
});
