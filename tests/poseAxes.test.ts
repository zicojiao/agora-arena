import { expect, test } from 'vitest';
import { lerpPose, samplePose } from '../src/render/motion';
import { MOTIONS } from '../src/data/motions';
import { CHARACTERS } from '../src/data/characters';

// Pose 从 lean/crouch/四肢 扩到多三根表现力轴：roll（整体翻转）、squash（挤压拉伸）、
// headTilt（头相对躯干的偏转）。它们都是刚体/缩放变换，套在骨骼装配之外——
// 头颈接缝的几何关系因此不受影响（renderer.test.ts 那条楔形缺口扫描仍然覆盖装配内部）。

test('三根新轴都参与插值——漏掉任何一根，动作到中间就会跳变', () => {
  const a = samplePose(MOTIONS.fallen, 0);
  const b = samplePose(MOTIONS.fallen, 16);
  const mid = lerpPose(a, b, 0.5);
  for (const k of ['roll', 'squash', 'headTilt'] as const) {
    if (a[k] === b[k]) continue;
    expect(mid[k], `${k} 没有被插值`).toBeGreaterThan(Math.min(a[k], b[k]));
    expect(mid[k]).toBeLessThan(Math.max(a[k], b[k]));
  }
});

test('倒地是转着摔下去，不是一个写死的角度', () => {
  const start = samplePose(MOTIONS.fallen, 0);
  const end = samplePose(MOTIONS.fallen, 44);
  expect(Math.abs(end.roll), '最终要真的躺平').toBeGreaterThan(1.2);
  expect(Math.abs(start.roll), '起手不该已经躺平——那就没有"摔"的过程了').toBeLessThan(0.8);
  // 砸地那一帧要压扁，之后弹回
  const impact = samplePose(MOTIONS.fallen, 7);
  expect(impact.squash, '砸地该压扁').toBeLessThan(0.9);
  expect(end.squash, '之后要弹回常态').toBeCloseTo(1, 1);
});

test('腾空翻滚在一个循环里翻满整圈，滞空多长都不会停住', () => {
  const n = MOTIONS.tumble.frames;
  expect(MOTIONS.tumble.loop).toBe(true);
  // 循环动作 samplePose 内部取 frame % frames，所以第 n 帧等于第 0 帧——要量"转了多少"
  // 得看关键帧本身，或采样到临界之前
  const first = MOTIONS.tumble.keys[0].pose.roll;
  const last = MOTIONS.tumble.keys[MOTIONS.tumble.keys.length - 1].pose.roll;
  expect(Math.abs(last - first), '一个循环应转满 2π').toBeGreaterThan(Math.PI * 1.9);
  expect(Math.abs(samplePose(MOTIONS.tumble, n - 0.01).roll), '采样到临界前应接近 2π')
    .toBeGreaterThan(Math.PI * 1.9);
  // 跨过循环点要回到起点，否则接缝处会跳
  expect(samplePose(MOTIONS.tumble, n).roll).toBeCloseTo(first, 5);
  expect(samplePose(MOTIONS.tumble, n * 2 + 5).roll).toBeCloseTo(samplePose(MOTIONS.tumble, 5).roll, 5);
});

test('两套挨打反应的挤压方向相反，交替播放才有左右摇晃的读感', () => {
  const h = samplePose(MOTIONS.hit, 0);
  const alt = samplePose(MOTIONS.hitAlt, 0);
  expect(h.squash, '命中当帧要压扁').toBeLessThan(1);
  expect(alt.squash).toBeLessThan(1);
  expect(Math.sign(h.roll), '两套的翻转方向必须相反').not.toBe(Math.sign(alt.roll));
  expect(Math.sign(h.headTilt)).not.toBe(Math.sign(alt.headTilt));
});

test('所有既有动作的新轴都取默认值——加轴不改变任何已有动作的观感', () => {
  const untouched = ['idle', 'walk', 'jump', 'block', 'crouch', 'thrust', 'upthrust', 'cast', 'rush', 'slam'];
  for (const id of untouched) {
    for (const k of MOTIONS[id].keys) {
      expect(k.pose.roll, `${id} 的 roll 应保持 0`).toBe(0);
      expect(k.pose.squash, `${id} 的 squash 应保持 1`).toBe(1);
      expect(k.pose.headTilt, `${id} 的 headTilt 应保持 0`).toBe(0);
    }
  }
});

test('大招编排生成的动作同样带齐三根轴（默认值），不会漏字段', () => {
  const seq = CHARACTERS[0].moves.sp100.motionSeq!;
  for (const s of seq) {
    for (const k of MOTIONS[s.motionId].keys) {
      expect(typeof k.pose.roll).toBe('number');
      expect(typeof k.pose.squash).toBe('number');
      expect(typeof k.pose.headTilt).toBe('number');
    }
  }
});
