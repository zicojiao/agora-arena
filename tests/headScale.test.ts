import { expect, test } from 'vitest';
import { headScale } from '../src/render/renderer';
import type { PartImage } from '../src/render/parts';

const img = {} as HTMLImageElement;
const head = (w: number, h: number): PartImage =>
  ({ img, top: 0, bottom: h, left: 0, right: w });
/** 屏幕上这颗头的尺度：宽高的几何平均 */
const onScreen = (w: number, h: number) => Math.sqrt(w * h) * headScale(head(w, h));

test('屏幕上的头是同一个尺度——宽脸窄脸、长脸圆脸都一样大', () => {
  // 实测的三种极端：雷震子 124x95 宽扁、铁扇公主 80x124 高瘦、猪八戒 120x124 方。
  // 按**单边**归一两头都不成立：按高归一时前者横向铺到 47 逻辑单位、后者只有 23，
  // 脸宽差 2.04 倍；按宽归一只是把这个离散度对称地挪回纵向。
  // 按面积（sqrt(宽×高)）归一后全员 1.25 倍以内。
  const a = onScreen(124, 95), b = onScreen(80, 124), c = onScreen(120, 124);
  expect(a).toBeCloseTo(b, 6);
  expect(b).toBeCloseTo(c, 6);
});

test('宽脸仍然宽、长脸仍然长——归一的是尺度，不是形状', () => {
  // 不能为了统一把每颗头都压成同一个方框——那正是最早"哪吒的脸被压扁"的做法。
  const wide = headScale(head(124, 95)), tall = headScale(head(80, 124));
  expect(124 * wide).toBeGreaterThan(80 * tall);     // 宽的画出来仍然更宽
  expect(124 * tall).toBeGreaterThan(95 * wide);     // 高的画出来仍然更高
});

test('头的缩放与躯干素材无关——重切躯干不该改变任何人的头', () => {
  // 照着真发生的回归写的：为修躯干长宽比重切了一轮素材，
  // 躯干内容宽从 124 变成 108~156，全员的头尺寸跟着变了。
  // 切图脚本的裁切参数不该有改变头部尺寸的权力。
  expect(headScale.length).toBe(1);   // 签名里根本没有躯干
});
