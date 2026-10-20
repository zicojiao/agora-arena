import { expect, test } from 'vitest';
import { drawLimbs } from '../src/render/renderer';
import { MOTIONS } from '../src/data/motions';
import { CHARACTERS } from '../src/data/characters';

/**
 * 没有立绘素材的角色，头上得有五官。
 *
 * `public/chars/` 里只有最早四个人有 head.png / torso.png，另外八个走的全是程序化分支——
 * 而那条分支此前只画一个填色圆 + 一道高光弧，**一张脸都没有**。
 * 打开浏览器看一眼就明白问题有多显眼：同一帧里，哪吒是画出来的人（有眉眼、发髻、抹额），
 * 钟馗是一枚空白鹅卵石顶在胶囊身子上。单元测试看不见这个，所以这条是照着截图补的。
 */

function recorder() {
  const ops: { op: string; args: number[] }[] = [];
  const ctx: Record<string, unknown> = {
    globalAlpha: 1, lineWidth: 1, strokeStyle: '', fillStyle: '', lineCap: '',
    lineJoin: '', globalCompositeOperation: '', filter: '', shadowBlur: 0, shadowColor: '',
  };
  for (const m of ['save', 'restore', 'beginPath', 'closePath', 'fill', 'stroke', 'clip',
    'translate', 'scale', 'rotate', 'drawImage', 'setLineDash', 'quadraticCurveTo',
    'bezierCurveTo', 'rect', 'fillRect', 'moveTo', 'lineTo', 'arc', 'ellipse']) {
    ctx[m] = (...args: number[]) => { ops.push({ op: m, args }); };
  }
  ctx.createLinearGradient = () => ({ addColorStop() {} });
  ctx.createRadialGradient = () => ({ addColorStop() {} });
  return { ctx: ctx as unknown as CanvasRenderingContext2D, ops };
}

/** 画一个没有素材的角色，返回画了哪些图元 */
function drawProcedural(headless = false) {
  const { ctx, ops } = recorder();
  const pose = MOTIONS.idle.keys[0].pose;
  drawLimbs(ctx, pose, 300, 460, 1, null, '#7a4a2b', '#e8c9a0', false,
    undefined, 1, 0, headless);
  return ops;
}

test('没有立绘的角色，头上画得出眉和眼——不是一枚空白鹅卵石', () => {
  const ops = drawProcedural();
  // 眼是一枚小椭圆：半径都在 3 以内（头半径 16，五官必须比它小得多）
  const eyes = ops.filter(o => o.op === 'ellipse' && o.args[2] < 3 && o.args[3] < 3);
  expect(eyes.length, '程序化的头上没有眼睛').toBeGreaterThan(0);
  // 眉是一段短线：moveTo→lineTo 的水平跨度在 5~12 之间
  const brows = ops.filter((o, i) => o.op === 'lineTo' && ops[i - 1]?.op === 'moveTo'
    && Math.abs(o.args[0] - ops[i - 1].args[0]) > 4 && Math.abs(o.args[0] - ops[i - 1].args[0]) < 13);
  expect(brows.length, '程序化的头上没有眉').toBeGreaterThan(0);
});

test('刑天不画头，自然也不画脸——他的眼在胸口', () => {
  const ops = drawProcedural(true);
  // 无头时不该出现头那一圈：半径 16 的整圆
  const heads = ops.filter(o => o.op === 'arc' && Math.abs(o.args[2] - 16) < 0.01);
  expect(heads.length, '无头角色却画了一颗头').toBe(0);
});

test('这条兜底真的有人在走——八个角色没有立绘素材', () => {
  // 若哪天十二个人都补齐了 head.png，这条兜底就不再有人走，上面两条也就失去意义
  const withArt = ['nezha', 'wukong', 'erlang', 'niumo'];
  const without = CHARACTERS.filter(c => !withArt.includes(c.id));
  expect(without.length, '所有角色都有立绘了？那这组断言该重新审一遍').toBeGreaterThan(0);
});
