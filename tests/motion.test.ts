import { expect, test } from 'vitest';
import { samplePose } from '../src/render/motion';
import { MOTIONS } from '../src/data/motions';
import type { Motion } from '../src/render/motion';

const M: Motion = {
  loop: false, frames: 10,
  keys: [
    { t: 0, pose: { lean: 0, crouch: 0, roll: 0, squash: 1, headTilt: 0, armF: [0, 0], armB: [0, 0], legF: [0, 0], legB: [0, 0] } },
    { t: 10, pose: { lean: 1, crouch: 10, roll: 0, squash: 1, headTilt: 0, armF: [2, 1], armB: [0, 0], legF: [0, 0], legB: [0, 0] } },
  ],
};

test('关键帧中点线性插值', () => {
  const p = samplePose(M, 5);
  expect(p.lean).toBeCloseTo(0.5);
  expect(p.crouch).toBeCloseTo(5);
  expect(p.armF[0]).toBeCloseTo(1);
});

test('非循环动作钳在末帧，循环动作回绕', () => {
  expect(samplePose(M, 99).lean).toBeCloseTo(1);
  const loop: Motion = { ...M, loop: true };
  expect(samplePose(loop, 15).lean).toBeCloseTo(0.5); // 15 % 10 = 5
});

test('动作库必备条目齐全', () => {
  for (const id of ['idle', 'walk', 'jump', 'hit', 'block', 'thrust', 'upthrust', 'cast', 'rush', 'slam', 'superPose']) {
    expect(MOTIONS[id], id).toBeDefined();
    expect(MOTIONS[id].keys.length).toBeGreaterThanOrEqual(2);
  }
});
