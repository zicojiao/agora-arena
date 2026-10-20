import { expect, test } from 'vitest';
import { motionSeqBounds, poseForMotionSeq } from '../src/render/renderer';
import { CHARACTERS } from '../src/data/characters';
import { MOTIONS } from '../src/data/motions';
import type { Motion } from '../src/render/motion';

// 测试 1：motionSeq 按权重切分——给定总帧数与权重，指定帧落在预期的段与段内进度。
// 去掉 motionSeqBounds 的实现（比如永远只返回一段）这条测试会红。
test('motionSeq 按 weight 比例切分总帧数，指定帧落在预期的段与段内进度', () => {
  // 4:3:2:1 的比例，总帧数 100：边界应精确落在 40/70/90/100
  const bounds = motionSeqBounds(100, [{ weight: 4 }, { weight: 3 }, { weight: 2 }, { weight: 1 }]);
  expect(bounds).toEqual([
    { start: 0, end: 40 },
    { start: 40, end: 70 },
    { start: 70, end: 90 },
    { start: 90, end: 100 },
  ]);

  // 第 3 段（[70,90)）中点 frame=80 应落在第 3 段，段内进度 0.5
  const idx = bounds.findIndex(b => 80 < b.end);
  expect(idx).toBe(2);
  const seg = bounds[idx];
  expect((80 - seg.start) / (seg.end - seg.start)).toBeCloseTo(0.5);

  // weight 之和恰好等于 total 时（四个角色 sp100 的实际写法）不经过取整损耗，切点是整数精确值
  const exact = motionSeqBounds(64, [{ weight: 16 }, { weight: 24 }, { weight: 12 }, { weight: 12 }]);
  expect(exact).toEqual([
    { start: 0, end: 16 }, { start: 16, end: 40 }, { start: 40, end: 52 }, { start: 52, end: 64 },
  ]);
});

// 测试 2：段间混合——交界处的姿势介于两段之间，不是突变。去掉 poseForMotionSeq 里的混合分支
// （直接返回本段采样结果）这条测试会红：localFrame=0 时会直接跳到motion B 的起始姿势（lean=-1），
// 而不是从 motion A 的收势姿势（lean=1）渐变过去。
test('motionSeq 段间接缝做姿势混合，不是瞬间跳变', () => {
  const A: Motion = {
    loop: false, frames: 10,
    keys: [
      { t: 0, pose: { lean: 0, crouch: 0, roll: 0, squash: 1, headTilt: 0, armF: [0, 0], armB: [0, 0], legF: [0, 0], legB: [0, 0] } },
      { t: 10, pose: { lean: 1, crouch: 0, roll: 0, squash: 1, headTilt: 0, armF: [0, 0], armB: [0, 0], legF: [0, 0], legB: [0, 0] } },
    ],
  };
  const B: Motion = {
    loop: false, frames: 10,
    keys: [
      { t: 0, pose: { lean: -1, crouch: 0, roll: 0, squash: 1, headTilt: 0, armF: [0, 0], armB: [0, 0], legF: [0, 0], legB: [0, 0] } },
      { t: 10, pose: { lean: -1, crouch: 0, roll: 0, squash: 1, headTilt: 0, armF: [0, 0], armB: [0, 0], legF: [0, 0], legB: [0, 0] } },
    ],
  };
  MOTIONS.__testA = A;
  MOTIONS.__testB = B;
  try {
    const seq = [{ motionId: '__testA', weight: 10 }, { motionId: '__testB', weight: 10 }];
    // 边界正好在 stateFrame=10：段 A 末帧 lean=1，段 B 首帧 lean=-1——直接切换会瞬间从 1 跳到 -1。
    const atBoundary = poseForMotionSeq(seq, 20, 10);
    expect(atBoundary.lean).toBeCloseTo(1); // 混合窗口起点：全权重仍在上一段收势姿势
    expect(atBoundary.lean).not.toBeCloseTo(-1);

    // 混合窗口（SEAM_BLEND=4）半程：lean 应严格介于 1 和 -1 之间，既不是 1 也不是 -1
    const mid = poseForMotionSeq(seq, 20, 12);
    expect(mid.lean).toBeLessThan(1);
    expect(mid.lean).toBeGreaterThan(-1);

    // 混合窗口结束后应完全落回段 B 自己的采样值
    const after = poseForMotionSeq(seq, 20, 16);
    expect(after.lean).toBeCloseTo(-1);
  } finally {
    delete MOTIONS.__testA;
    delete MOTIONS.__testB;
  }
});

// 测试 5：四个角色的 sp100 都有 motionSeq 且段数为 4。去掉任一角色的 motionSeq 字段这条测试会红。
test('四个角色的 sp100 都是多段编排，且段数够撑起一段演出', () => {
  // 原来固定断言 4 段。Task 39 把大招从"4 段 / 64 帧"扩到"多段 / 150+ 帧"——段数不再是
  // 一个固定值，真正要守的是「不是单段」和「每段都有实体动作」。下限取 4，避免有人把它
  // 悄悄退回两段了事。
  for (const c of CHARACTERS) {
    const seq = c.moves.sp100.motionSeq;
    expect(seq, `${c.id}: sp100 缺 motionSeq`).toBeDefined();
    expect(seq!.length, `${c.id}: sp100 段数`).toBeGreaterThanOrEqual(4);
    for (const seg of seq!) {
      expect(MOTIONS[seg.motionId], `${c.id}: 段 ${seg.motionId} 不在 MOTIONS 里`).toBeDefined();
      expect(seg.weight, `${c.id}: 段 ${seg.motionId} weight`).toBeGreaterThan(0);
    }
  }
});
