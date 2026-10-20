import { expect, test } from 'vitest';
import { BannerSystem } from '../src/render/banner';

/** 记录 banner 画了哪些文字的假 ctx */
function textRecorder() {
  const texts: string[] = [];
  const ctx: Record<string, unknown> = {
    globalAlpha: 1, lineWidth: 1, strokeStyle: '', fillStyle: '', font: '',
    textAlign: '', textBaseline: '', globalCompositeOperation: '',
  };
  for (const m of ['save', 'restore', 'beginPath', 'closePath', 'moveTo', 'lineTo',
    'arc', 'ellipse', 'fill', 'stroke', 'clip', 'translate', 'scale', 'rotate',
    'fillRect', 'strokeRect', 'quadraticCurveTo', 'bezierCurveTo', 'setLineDash', 'roundRect']) {
    ctx[m] = () => {};
  }
  ctx.createLinearGradient = () => ({ addColorStop() {} });
  ctx.measureText = () => ({ width: 40 });
  ctx.fillText = (t: string) => { texts.push(t); };
  ctx.strokeText = (t: string) => { texts.push(t); };
  return { ctx: ctx as unknown as CanvasRenderingContext2D, texts };
}

/** 最小 CanvasRenderingContext2D 桩：只记录 fillText 调用的文本，其余方法/属性全是空操作 */
function mockCtx() {
  const fillText: string[] = [];
  const ctx = {
    save() {}, restore() {}, beginPath() {}, moveTo() {}, arcTo() {}, closePath() {},
    fill() {}, stroke() {}, strokeText() {},
    fillText(t: string) { fillText.push(t); },
  } as unknown as CanvasRenderingContext2D;
  return { ctx, fillText };
}

test('计时按 tick() 推进，不是一次性到位或挂渲染帧', () => {
  const b = new BannerSystem();
  b.showMove('烈焰突刺', 's1', 1, 0);
  for (let i = 0; i < 39; i++) b.tick();
  expect(b.activeCount()).toBe(1); // 39 次 tick 还没到技能名的 40 tick 寿命，横幅还在
  b.tick(); // 第 40 次
  expect(b.activeCount()).toBe(0); // 到寿命后消失
});

test('reset() 清空所有横幅（技能名 + 大招卷轴 + 关卡横幅）', () => {
  const b = new BannerSystem();
  b.showMove('烈焰突刺', 's1', 1, 0);
  b.showMove('奥义·混天绫', 'sp50', 1, 0);
  b.showStage('东海之滨', '哪吒');
  expect(b.activeCount()).toBe(3);
  b.reset();
  expect(b.activeCount()).toBe(0);
});

test('普攻(n1/n2/n3)不产生横幅', () => {
  const b = new BannerSystem();
  b.showMove('火尖枪·刺', 'n1', 1, 0);
  b.showMove('火尖枪·连刺', 'n2', 1, 0);
  b.showMove('火尖枪·挑空', 'n3', 1, 0);
  expect(b.activeCount()).toBe(0);
});

test('大招竖排逐字揭示：先出第一个字，不是整块出现', () => {
  const b = new BannerSystem();
  b.showMove('奥义·混天绫', 'sp50', 1, 0);
  b.tick(); // 只过 1 个逻辑 tick
  const { ctx, fillText } = mockCtx();
  b.drawScreen(ctx);
  expect(fillText).toEqual(['奥']); // 只有第一个字揭示，印章还没盖（要等全字出完）
});

test('p1/p2 同一 tick 都放大招各占一路槽位，不会互相顶掉', () => {
  const b = new BannerSystem();
  b.showMove('奥义·混天绫', 'sp50', 1, 0);
  b.showMove('超必杀·三头六臂', 'sp100', -1, 1);
  expect(b.activeCount()).toBe(2); // 两路大招卷轴都还在，没有一路覆盖另一路
});

test('朱砂印编码大招档位：奥义(sp50)盖「奥」，超必杀(sp100)盖「超」', () => {
  const b = new BannerSystem();
  b.showMove('超必杀·三头六臂', 'sp100', 1, 0);
  for (let i = 0; i < 40; i++) b.tick(); // 8 个字全部揭示完
  const { ctx, fillText } = mockCtx();
  b.drawScreen(ctx);
  expect(fillText.at(-1)).toBe('超'); // 全字揭示后最后画的是印章
});

// 六关连战的收尾此前没有任何记号：第六关的开场横幅和第一关一模一样，
// 玩家要自己数着关数才知道打到头了。街机的最后一场是要报一声的。
test('最后一关的开场横幅标出来，别的关不标', () => {
  const draw = (final: boolean) => {
    const b = new BannerSystem();
    b.showStage('积雷山·魔王真身', '牛魔王', '力量 · 耐打', final);
    const { ctx, texts } = textRecorder();
    b.drawScreen(ctx);
    return texts.join('　');
  };
  expect(draw(true), '最后一关没有标记').toContain('最 终 关');
  expect(draw(false), '普通关卡不该标「最终关」').not.toContain('最 终 关');
  // 标记不能顶掉地名与对手名——它是记号，不是主行
  expect(draw(true), '标了最终关却把地名挤掉了').toContain('积雷山·魔王真身');
  expect(draw(true), '标了最终关却把对手名挤掉了').toContain('牛魔王');
});
