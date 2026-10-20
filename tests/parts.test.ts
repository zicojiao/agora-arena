import { afterEach, expect, test } from 'vitest';
import { loadParts, trimVertical } from '../src/render/parts';

// 测试环境是 vitest 默认的 node，没有浏览器 Image——用一个假 Image 桩子顶替 globalThis.Image。
// src 里 loadImg() 只在被调用时才 new Image()，不在 import 时，所以在每个 test 内部按需替换
// 全局即可，不需要模块级 mock。按 src 里请求的文件名（`/chars/<id>/<part>.png`）决定这次
// 探测该成功还是失败，从而模拟"这个部件文件存在/不存在"。
let allow: Set<string>;

/** 这一轮请求过的 URL。探测列表收窄之后，"没为某个名字发请求"本身就是要守的行为 */
let requested: string[] = [];

class FakeImage {
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  set src(v: string) {
    requested.push(v);
    const ok = [...allow].some(name => v.endsWith(`/${name}.png`));
    queueMicrotask(() => (ok ? this.onload : this.onerror)?.());
  }
}

const realImage = globalThis.Image;
afterEach(() => { globalThis.Image = realImage; });

test('只有 head 时其余回退：head 字段就位，torso 不存在', async () => {
  allow = new Set(['head']);
  requested = [];
  globalThis.Image = FakeImage as unknown as typeof Image;

  const parts = await loadParts('testchar');

  expect(parts.head).toBeTruthy();
  expect(parts.torso).toBeUndefined();
});

// 探测列表从七件收到两件（head/torso）之后，原来那几条 `expect(parts.armF).toBeUndefined()`
// **永远不可能失败**——那些字段再没有任何实现会去设它。换成守真正的新行为：
// 只为 NAMES 里的名字发请求，一个多余的都不发（那 60 个必然 404 就是这么来的）。
test('只探 head/torso 两件，不为四肢与兵器发请求', async () => {
  allow = new Set(['head', 'torso']);
  requested = [];
  globalThis.Image = FakeImage as unknown as typeof Image;

  await loadParts('testchar');

  const names = requested.map(u => u.split('/').pop());
  expect(names.sort(), '探测的部件名与 NAMES 对不上').toEqual(['head.png', 'torso.png']);
  for (const gone of ['armF', 'armB', 'legF', 'legB', 'weapon']) {
    expect(requested.some(u => u.endsWith(`/${gone}.png`)),
      `又在探测 ${gone}.png——那是管线明确不生产的部件，每个角色白付一个 404`).toBe(false);
  }
});

test('一件都没有时行为不变：全部字段都不存在，等价于纯程序化回退', async () => {
  allow = new Set(); // 模拟 public/chars/<id>/ 目录整个不存在——两个探测请求都 onerror
  requested = [];
  globalThis.Image = FakeImage as unknown as typeof Image;

  const parts = await loadParts('testchar');

  expect(parts.head).toBeUndefined();
  expect(parts.torso).toBeUndefined();
  expect(Object.keys(parts), '目录不存在时不该有任何部件字段').toEqual([]);
});

// Task 29：素材上下透明留白裁切——头/躯干接缝（脖子、腰）是纵向现象，trimVertical 只吃一列
// 拍平的 alpha 数组，不需要真的解码 PNG，就能验证"内容包围盒"算对了。去掉裁切（比如把实现
// 换成永远返回整张图 {top:0,bottom:h}）这条测试就会红——第二个断言会失败。
test('trimVertical 裁掉上下透明留白，只留内容行范围，横向不动', () => {
  const w = 4, h = 10;
  const alpha = new Uint8Array(w * h); // 全 0 = 全透明
  // 第 3~6 行（含）有内容：整行画上不透明像素
  for (let y = 3; y <= 6; y++) {
    for (let x = 0; x < w; x++) alpha[y * w + x] = 255;
  }
  expect(trimVertical(alpha, w, h)).toEqual({ top: 3, bottom: 7 }); // [top, bottom) 半开区间
});

test('trimVertical 全透明兜底返回整张图，不裁', () => {
  const w = 4, h = 10;
  const alpha = new Uint8Array(w * h); // 全透明，没有任何内容行
  expect(trimVertical(alpha, w, h)).toEqual({ top: 0, bottom: h });
});
