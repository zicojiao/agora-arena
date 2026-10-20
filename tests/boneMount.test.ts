import { expect, test } from 'vitest';
import { drawBoneImg, TORSO_MOUNT_HALFW } from '../src/render/renderer';
import type { PartImage } from '../src/render/parts';

/** 只记 drawImage 九个实参，其余空操作。 */
function mockCtx() {
  const drawn: number[][] = [];
  const ctx = {
    save() {}, restore() {}, translate() {}, rotate() {}, scale() {}, fillRect() {},
    drawImage(...a: unknown[]) { drawn.push(a as number[]); },
    set globalCompositeOperation(_v: string) {}, set fillStyle(_v: unknown) {},
  } as unknown as CanvasRenderingContext2D;
  return { ctx, drawn };
}

/** 内容盒一样宽（cw），只是四周留白不同（画布 naturalWidth 不同）。 */
function part(naturalWidth: number, cw: number): PartImage {
  const left = Math.floor((naturalWidth - cw) / 2);
  return { img: { naturalWidth } as HTMLImageElement, top: 0, bottom: 100, left, right: left + cw };
}

/** 把一件躯干挂到长 68 的骨骼上，返回内容在屏幕上实际占的逻辑宽度。 */
function mountedContentWidth(p: PartImage): number {
  const { ctx, drawn } = mockCtx();
  drawBoneImg(ctx, 0, 0, 0, 68, TORSO_MOUNT_HALFW, p, false, 1);
  const [, , , sw, , , , dw] = drawn[0];
  return (p.right - p.left) * (dw / sw);   // 内容宽 × 像素→逻辑比例
}

test('躯干画出来有多宽只由内容盒决定，与素材四周留白无关', () => {
  // 这条守门是照着真出过的缺陷写的：drawBoneImg 的源矩形横向取整幅 naturalWidth，
  // 于是 160 的框里 124 的内容只铺到 40*124/160=31 逻辑单位，比程序化躯干 TORSO_W=38 还窄；
  // 而头部缩放是拿**躯干内容宽**反推的，两个口径对不上，只能在 recut.py 里挂一个
  // fill=0.80 的常量去凑——同一个根因被绕了两次，谁都没修。
  // 改动当时 642 条测试一条都没红，因为这条路径压根没有守门。
  const tight = mountedContentWidth(part(160, 124));   // 留白少
  const loose = mountedContentWidth(part(240, 124));   // 同样的身体，画布大一圈
  expect(loose).toBeCloseTo(tight, 6);
  // 并且就等于挂载宽本身——这才让头部那条 (TORSO_MOUNT_HALFW*2)/(torso.right-torso.left)
  // 反推出的比例，跟躯干真实的像素→逻辑比例是同一个数（此前差 160/124=1.29 倍）。
  expect(tight).toBeCloseTo(TORSO_MOUNT_HALFW * 2, 6);
});

test('头和躯干的像素→逻辑比例是同一个数（头部缩放公式由此才成立）', () => {
  const torso = part(160, 124);
  const { ctx, drawn } = mockCtx();
  drawBoneImg(ctx, 0, 0, 0, 68, TORSO_MOUNT_HALFW, torso, false, 1);
  const [, , , sw, , , , dw] = drawn[0];
  const torsoRatio = dw / sw;                                        // 躯干实际用的比例
  const headRatio = (TORSO_MOUNT_HALFW * 2) / (torso.right - torso.left); // renderer 里头部用的公式
  expect(headRatio).toBeCloseTo(torsoRatio, 6);
});
