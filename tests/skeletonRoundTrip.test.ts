import { expect, test } from 'vitest';
import { skeletalSource, unmappedBones, type SkelDoc } from '../src/render/poseSource';
import { samplePose } from '../src/render/motion';
import { MOTIONS } from '../src/data/motions';
import { CHARACTERS } from '../src/data/characters';
import raw from '../public/skel/nezha.json';

// 甲方案（骨骼命名约定映射）的成败判据：**导出再导入必须逐帧等价**。
// 不等价就说明这套映射有信息损失，"美术在工具里改完放回来"这条路就是假的——
// 动作会在往返中悄悄变形，而且没人看得出来。
//
// public/skel/nezha.json 由 scripts/export-skeleton.mjs 从 MOTIONS 导出，
// 覆盖哪吒实际会播的全部动作（站立/走/跳/防/蹲 + 四套受击反应 + 8 招及其全部编排段）。

const doc = raw as unknown as SkelDoc;
const src = skeletalSource(doc, 'nezha');
const nezha = CHARACTERS.find(c => c.id === 'nezha')!;

/** 哪吒实际会播到的动作 id 全集，与导出脚本用同一套推导 */
function motionIds(): string[] {
  const ids = new Set<string>([
    'idle', 'walk', 'jump', 'block', 'crouch',
    ...['Hit', 'HitAlt', 'Tumble', 'Fallen'].map(s => 'nezha' + s),
  ]);
  for (const mv of Object.values(nezha.moves)) {
    ids.add(mv.motionId);
    for (const seg of mv.motionSeq ?? []) ids.add(seg.motionId);
    for (const seg of (mv.brief?.motionSeq ?? [])) ids.add(seg.motionId);
  }
  return [...ids].filter(id => MOTIONS[id]);
}

test('导出覆盖了哪吒实际会播的每一个动作——漏一个，那个动作迁移后会静默退回程序化', () => {
  const ids = motionIds();
  expect(ids.length).toBeGreaterThan(30);
  for (const id of ids) {
    expect(src.has(`nezha:${id}`), `外部文件缺动作 ${id}`).toBe(true);
  }
});

test('往返逐帧等价：外部文件采样出的姿势与程序化动作完全一致', () => {
  let checked = 0;
  for (const id of motionIds()) {
    const m = MOTIONS[id];
    // 逐帧扫全段，外加半帧偏移覆盖插值中点（缓动曲线在这里最容易露馅）
    for (let f = 0; f <= m.frames; f += 0.5) {
      const want = samplePose(m, f);
      const got = src.sample(`nezha:${id}`, f);
      for (const k of ['lean', 'crouch', 'roll', 'squash', 'headTilt'] as const) {
        expect(got[k], `${id}@${f} 通道 ${k}`).toBeCloseTo(want[k], 6);
      }
      for (const k of ['armF', 'armB', 'legF', 'legB'] as const) {
        expect(got[k][0], `${id}@${f} ${k}[0]`).toBeCloseTo(want[k][0], 6);
        expect(got[k][1], `${id}@${f} ${k}[1]`).toBeCloseTo(want[k][1], 6);
      }
      checked++;
    }
  }
  expect(checked, '采样点太少，覆盖不足').toBeGreaterThan(3000);
});

test('缓动信息被带过去了——只保留关键帧数值的话，蓄力/定格/缓停的节奏会在往返中丢光', () => {
  // 找一个带非线性缓动的动作：大招编排段普遍用 snap/hold/accel/decel
  const withEase = motionIds().find(id => MOTIONS[id].keys.some(k => k.ease && k.ease !== 'linear'));
  expect(withEase, '哪吒应当有带缓动的动作').toBeDefined();
  const m = MOTIONS[withEase!];
  const anim = doc.animations[withEase!];
  const hasEase = Object.values(anim.bones).some(track => track.some(k => k.ease));
  expect(hasEase, `${withEase} 的缓动没有写进外部文件`).toBe(true);

  // 取一个非线性段的中点：线性插值与实际曲线在这里差得最开
  const i = m.keys.findIndex(k => k.ease && k.ease !== 'linear');
  const a = m.keys[i], b = m.keys[i + 1];
  if (b && b.t > a.t) {
    const mid = (a.t + b.t) / 2;
    const got = src.sample(`nezha:${withEase}`, mid);
    const linear = a.pose.lean + (b.pose.lean - a.pose.lean) * 0.5;
    expect(got.lean).toBeCloseTo(samplePose(m, mid).lean, 6);
    if (Math.abs(b.pose.lean - a.pose.lean) > 0.05) {
      expect(Math.abs(got.lean - linear), '中点若与线性插值一致，说明缓动其实没生效').toBeGreaterThan(1e-6);
    }
  }
});

test('导出的骨名全部落在约定内——出现约定外的骨说明逆映射表和 BONE_MAP 对不上了', () => {
  expect(unmappedBones(doc)).toEqual([]);
});

test('fps 标成 60：这是从代码导出的，本来就是本项目的帧率，不该再做换算', () => {
  expect(doc.fps).toBe(60);
});
