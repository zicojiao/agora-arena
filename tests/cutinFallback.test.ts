import { expect, test } from 'vitest';
import { CutInSystem } from '../src/render/cutin';
import { CHARACTERS } from '../src/data/characters';
import canvasSrc from '../src/ui/GameCanvas.tsx?raw';

/**
 * 超必杀发动那一下的大头 cut-in。素材是 `public/chars/<id>/head.png`，
 * 而那个目录里**只有最早四个人**（哪吒/孙悟空/二郎神/牛魔王）——另外八个一张都没有。
 * 缺素材时 trigger 直接 `this.on = false`，于是全场最隆重的那一下，
 * 十二个人里有八个是**整段空白**，而且不报任何错。
 *
 * 这个项目其余各层缺素材都有程序化回退（音效音乐全是合成的、骨骼缺件回退胶囊），
 * 唯独这里没有。名字、配色、有没有头，这些数据每个角色都现成有。
 */

/** 记录画了什么的假 ctx：只关心"到底画没画东西" */
function recorder() {
  const ops: string[] = [];
  const texts: string[] = [];
  const ctx: Record<string, unknown> = {
    canvas: { width: 960, height: 540 },
    globalAlpha: 1, lineWidth: 1, strokeStyle: '', fillStyle: '', font: '',
    textAlign: '', textBaseline: '', globalCompositeOperation: '',
  };
  for (const m of ['save', 'restore', 'beginPath', 'closePath', 'moveTo', 'lineTo',
    'quadraticCurveTo', 'arc', 'ellipse', 'rect', 'fill', 'stroke', 'clip', 'translate',
    'scale', 'rotate', 'fillRect', 'drawImage']) {
    ctx[m] = () => { ops.push(m); };
  }
  ctx.createLinearGradient = () => ({ addColorStop() {} });
  ctx.fillText = (t: string) => { ops.push('fillText'); texts.push(t); };
  ctx.strokeText = (t: string) => { ops.push('strokeText'); texts.push(t); };
  return { ctx: ctx as unknown as CanvasRenderingContext2D, ops, texts };
}

function drawFor(def: typeof CHARACTERS[number]) {
  const cut = new CutInSystem();
  cut.trigger(null, 1, def);            // null = 没有 head.png
  const { ctx, ops, texts } = recorder();
  cut.draw(ctx);
  return { ops, texts };
}

test('十二个人都画得出 cut-in——没有立绘就程序化画一张', () => {
  for (const c of CHARACTERS) {
    const { ops } = drawFor(c);
    expect(ops.length, `${c.name} 的超必杀 cut-in 一笔都没画（缺 head.png 时整段消失）`)
      .toBeGreaterThan(0);
  }
});

test('程序化那张认得出是谁——名字要写上去', () => {
  for (const c of CHARACTERS) {
    const { texts } = drawFor(c);
    expect(texts.join(''), `${c.name} 的 cut-in 上没有他的名字，十二张看着一样`)
      .toContain(c.name);
  }
});

test('刑天不画头——「以乳为目，以脐为口」是他的定位本体', () => {
  const xt = CHARACTERS.find(c => c.headless)!;
  const other = CHARACTERS.find(c => !c.headless)!;
  // 有头的那些用 arc 画头，无头的那位不该有这一笔
  expect(drawFor(other).ops.filter(o => o === 'arc').length,
    `${other.name} 的 cut-in 没画头`).toBeGreaterThan(0);
  expect(drawFor(xt).ops.filter(o => o === 'arc').length,
    `${xt.name} 断了首，cut-in 却给他画了一颗头`).toBe(0);
});

test('有立绘时仍然走立绘，不被程序化那张顶掉', () => {
  const cut = new CutInSystem();
  const fake = { img: { naturalWidth: 128 } as HTMLImageElement, top: 0, bottom: 128, left: 0, right: 128 };
  cut.trigger(fake, 1, CHARACTERS[0]);
  const r = recorder();
  cut.draw(r.ctx);
  expect(r.ops, '有 head.png 却没画立绘').toContain('drawImage');
  expect(r.texts.join(''), '有立绘时不该再叠程序化的名字').not.toContain(CHARACTERS[0].name);
});

test('奥义（50 气）不触发 cut-in——那是超必杀专属的排场', () => {
  expect(/tier === 100 \? f\.def : undefined/.test(canvasSrc),
    '调用处没有按 tier 决定要不要传程序化回退，奥义可能也弹 cut-in').toBe(true);
});
