import type { Ease, Motion, Pose } from './motion';
import { samplePose } from './motion';

/** 姿势来源抽象：把「这一帧摆什么姿势」和「姿势从哪来」拆开。
 *
 * 现在只有一个来源——data/motions.ts 里代码写死的关键帧。这一层的意义是让**外部骨骼
 * 动画文件**（Spine / DragonBones 导出的 JSON）能作为第二个来源接进来，而渲染层不用改。
 *
 * 这是一次接入验证，不是完整迁移。做完之后能回答一个具体问题：把外部动画接进来要动多少
 * 东西。答案写在 skeletalSource 的注释里。 */
export interface PoseSource {
  /** 这个来源能不能提供某个动作 */
  has(motionId: string): boolean;
  /** 取某个动作在某一帧的姿势；has() 为 false 时行为未定义 */
  sample(motionId: string, frame: number): Pose;
}

/** 现有的程序化来源：直接查 MOTIONS。 */
export function proceduralSource(motions: Record<string, Motion>): PoseSource {
  return {
    has: id => id in motions,
    sample: (id, frame) => samplePose(motions[id], frame),
  };
}

// ── 外部骨骼动画的接入 ──────────────────────────────────────────────

/** 外部骨骼文件里我们真正会用到的最小子集。
 *
 * Spine / DragonBones 的原生格式都是「任意骨骼树 + 每根骨的 rotate/translate/scale 时间轴」。
 * 而本项目的 Pose 是**固定十个通道**（lean/crouch/roll/squash/headTilt + 四对肢体角度），
 * 渲染层（drawLimbs、贴图挂载、兵器握持、飘带锚点）全部按这十个通道写死。
 *
 * 所以接入有两条路：
 *   甲) 按**骨骼命名约定**把外部骨骼映射到这十个通道——就是下面这个实现。便宜、今天能用，
 *       但要求美术按我们的骨架命名（torso/armF/armFLower/legB/...），多出来的骨会被忽略。
 *   乙) 把渲染层改成通用骨骼树，美术爱怎么绑就怎么绑。那是真正的迁移，drawLimbs、部件
 *       挂载、兵器、飘带锚点、头颈接缝几何全要重写，且现有 170+ 条测试里凡是断言姿势
 *       通道的都要重来。
 * 甲的成本是这个文件；乙的成本是渲染层重写。 */
export interface SkelDoc {
  /** 帧率。外部工具通常是 24/30，本项目是 60——采样时按比例换算 */
  fps: number;
  animations: Record<string, SkelAnim>;
}
export interface SkelAnim {
  duration: number; // 以 fps 计的帧数
  loop?: boolean;
  /** 每根骨一条旋转时间轴（弧度）。骨名必须用下面 BONE_MAP 里的约定名 */
  bones: Record<string, { t: number; v: number; ease?: Ease }[]>;
}

/** 骨名 → Pose 通道。这张表就是"命名约定"本身。
 * 值为 [通道, 下标]：下标 0/1 用于四肢的 [肩角, 肘角] 这类成对通道。 */
const BONE_MAP: Record<string, [keyof Pose, number?]> = {
  torso: ['lean'],
  hips: ['crouch'],
  root: ['roll'],
  body: ['squash'],
  head: ['headTilt'],
  armF: ['armF', 0], armFLower: ['armF', 1],
  armB: ['armB', 0], armBLower: ['armB', 1],
  legF: ['legF', 0], legFLower: ['legF', 1],
  legB: ['legB', 0], legBLower: ['legB', 1],
};

const BASE: Pose = {
  lean: 0, crouch: 0, roll: 0, squash: 1, headTilt: 0,
  armF: [0.2, 0.4], armB: [-0.2, 0.3], legF: [0.15, -0.1], legB: [-0.15, 0.1],
};

const clonePose = (p: Pose): Pose => ({
  ...p, armF: [...p.armF], armB: [...p.armB], legF: [...p.legF], legB: [...p.legB],
});

/** 缓动曲线。必须和 motion.ts 里的那套一致——外部文件若不带缓动信息，
 * 导进来的动作就只剩匀速插值，蓄力/定格/缓停的节奏全丢，正是加 ease 要解决的问题。 */
const EASE_FN: Record<Ease, (k: number) => number> = {
  linear: k => k,
  accel: k => k * k,
  decel: k => 1 - (1 - k) * (1 - k),
  snap: k => { const t = Math.min(1, k * 3); return 1 - (1 - t) * (1 - t) * (1 - t); },
  hold: k => (k < 0.8 ? 0 : (k - 0.8) / 0.2),
};

/** 一条骨骼时间轴在给定帧的取值（按关键帧自带的缓动插值，越界钳在两端） */
function sampleTrack(track: { t: number; v: number; ease?: Ease }[], f: number): number {
  if (track.length === 0) return 0;
  if (f <= track[0].t) return track[0].v;
  const last = track[track.length - 1];
  if (f >= last.t) return last.v;
  let i = 0;
  while (i < track.length - 1 && track[i + 1].t <= f) i++;
  const a = track[i], b = track[i + 1];
  if (b.t === a.t) return a.v;
  const k = EASE_FN[a.ease ?? 'linear']((f - a.t) / (b.t - a.t));
  return a.v + (b.v - a.v) * k;
}

/** 把外部骨骼文件包装成一个 PoseSource。
 * motionId 直接对应文件里的 animation 名——调用方按角色前缀去重（如 "nezha:idle"）。 */
export function skeletalSource(doc: SkelDoc, prefix = ''): PoseSource {
  const key = (id: string) => (prefix && id.startsWith(prefix + ':') ? id.slice(prefix.length + 1) : id);
  return {
    has: id => key(id) in doc.animations,
    sample: (id, frame) => {
      const anim = doc.animations[key(id)];
      const out = clonePose(BASE);
      if (!anim) return out;
      // 本项目按 60fps 计帧，外部工具通常 24/30——这里换算到文件自己的时间轴
      const scale = doc.fps / 60;
      let f = frame * scale;
      f = anim.loop ? ((f % anim.duration) + anim.duration) % anim.duration : Math.min(f, anim.duration);
      for (const [bone, track] of Object.entries(anim.bones)) {
        const slot = BONE_MAP[bone];
        if (!slot) continue;                 // 约定外的骨直接忽略，不报错
        const [channel, idx] = slot;
        const v = sampleTrack(track, f);
        if (idx === undefined) (out[channel] as number) = v;
        else (out[channel] as [number, number])[idx] = v;
      }
      return out;
    },
  };
}

/** 多来源按优先级串起来：外部文件优先，缺的回落到程序化动作。
 * 迁移因此可以逐个动作、逐个角色地推进，不需要一次性全换。 */
export function chainSources(...sources: PoseSource[]): PoseSource {
  return {
    has: id => sources.some(s => s.has(id)),
    sample: (id, frame) => (sources.find(s => s.has(id)) ?? sources[sources.length - 1]).sample(id, frame),
  };
}

/** 未被 BONE_MAP 覆盖的骨——接入报告要用它说明"这份文件里有多少东西我们接不住" */
export function unmappedBones(doc: SkelDoc): string[] {
  const seen = new Set<string>();
  for (const anim of Object.values(doc.animations)) {
    for (const bone of Object.keys(anim.bones)) if (!(bone in BONE_MAP)) seen.add(bone);
  }
  return [...seen].sort();
}
