import { expect, test } from 'vitest';
import { chainSources, proceduralSource, skeletalSource, unmappedBones, type SkelDoc } from '../src/render/poseSource';
import { MOTIONS } from '../src/data/motions';
import { samplePose } from '../src/render/motion';
// 这份是**手工构造的外部工具样例**（24fps、含约定外骨骼），用来验证"别人导出的文件"能不能接。
// 不要换成 public/skel/nezha.json——那份是我们自己从 MOTIONS 导出的（60fps、骨名全在约定内），
// 验的是另一件事（往返等价，见 skeletonRoundTrip.test.ts）。
import raw from './fixtures/skel-external-sample.json';

// 外部骨骼动画接入验证。回答的问题是：把 Spine/DragonBones 导出的动画接进来要动多少东西。
//
// 结论（详见 poseSource.ts 顶部注释）：按**骨骼命名约定**映射到现有的十个 Pose 通道，
// 成本就是那一个文件；要让美术随意绑骨，则渲染层（drawLimbs/贴图挂载/兵器/飘带锚点/
// 头颈接缝几何）全部要重写。这组测试锁的是前者。

const doc = raw as unknown as SkelDoc;

test('外部文件能作为姿势来源被读出来，动作名对得上', () => {
  const src = skeletalSource(doc, 'nezha');
  expect(src.has('nezha:idle')).toBe(true);
  expect(src.has('nezha:walk')).toBe(true);
  expect(src.has('nezha:超必杀'), '文件里没有的动作应报 false，让调用方回落').toBe(false);
});

test('骨骼旋转被映射到对应的 Pose 通道，成对通道分得清肩肘', () => {
  const src = skeletalSource(doc, 'nezha');
  const p = src.sample('nezha:idle', 0);
  expect(p.armF[0]).toBeCloseTo(0.22, 5);   // armF → [肩角, _]
  expect(p.armF[1]).toBeCloseTo(0.40, 5);   // armFLower → [_, 肘角]
  expect(p.armB[0]).toBeCloseTo(-0.20, 5);
  expect(p.legF[0]).toBeCloseTo(0.15, 5);
  expect(p.lean).toBeCloseTo(0, 5);          // torso → lean
});

test('帧率换算：文件是 24fps，本项目按 60fps 计帧', () => {
  const src = skeletalSource(doc, 'nezha');
  // idle 时长 28（文件帧）= 70 本项目帧。中点姿势应出现在本项目第 35 帧附近
  const mid = src.sample('nezha:idle', 35);
  expect(mid.lean, '第 35 帧应落在 idle 的中点（torso 抬到 0.05）').toBeCloseTo(0.05, 2);
  const start = src.sample('nezha:idle', 0);
  expect(start.lean).toBeCloseTo(0, 5);
});

test('循环动作跨过一轮回到起点，不跳变', () => {
  const src = skeletalSource(doc, 'nezha');
  const a = src.sample('nezha:idle', 0);
  const b = src.sample('nezha:idle', 70);   // 28 文件帧 × (60/24) = 70
  expect(b.lean).toBeCloseTo(a.lean, 4);
  expect(b.armF[0]).toBeCloseTo(a.armF[0], 4);
});

test('约定之外的骨骼被忽略而不是报错——美术多绑几根不会把游戏搞挂', () => {
  const extra = unmappedBones(doc);
  expect(extra, '这份文件里 weapon/cape 是故意放的约定外骨骼').toEqual(['cape', 'weapon']);
  const src = skeletalSource(doc, 'nezha');
  expect(() => src.sample('nezha:idle', 10)).not.toThrow();
});

test('多来源串联：外部文件优先，缺的回落到程序化动作——迁移可以逐个动作推进', () => {
  const proc = proceduralSource(MOTIONS);
  const chain = chainSources(skeletalSource(doc, 'nezha'), proc);
  // 外部有 idle → 走外部（第 0 帧 lean 恰好是 0，改用 armF 区分：外部 0.22 / 程序化 0.2）
  expect(chain.sample('nezha:idle', 0).armF[0]).toBeCloseTo(0.22, 5);
  // 外部没有 thrust → 回落到程序化，且与直接采样一致
  expect(chain.has('thrust')).toBe(true);
  expect(chain.sample('thrust', 4)).toEqual(proc.sample('thrust', 4));
});

test('程序化来源与直接 samplePose 完全一致——这一层是纯包装，不改变现有观感', () => {
  const proc = proceduralSource(MOTIONS);
  for (const id of ['idle', 'walk', 'jump', 'rush', 'slam']) {
    for (const f of [0, 3, 7, 12, 25]) {
      // 跟 samplePose 直接比。拿 proc.sample 跟自己比是测不出任何东西的
      expect(proc.sample(id, f), `${id}@${f}`).toEqual(samplePose(MOTIONS[id], f));
    }
  }
  expect(proc.has('idle')).toBe(true);
  expect(proc.has('不存在的动作')).toBe(false);
});
