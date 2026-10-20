import { barragePoses, buildPhaseMotions, phaseSeq, type PhaseDef } from './superChoreo';
import type { Motion, Pose } from '../render/motion';

/** 十秒超必杀的十五段骨架。四个角色共用同一套节拍（这样"什么时候该出现什么"是一致的，
 * 玩家能学会读节奏），姿势词汇各自不同。
 *
 *   起势40 蓄力40 突进30 首击25 连打A45 连打B45 逼近40 版边连打45
 *   挑空35 空中追击50 落地砸35 终结蓄力50 终结爆发40 余波40 收势40  = 600 帧
 *
 *   startup = 起势+蓄力+突进            = 110
 *   active  = 首击 … 终结爆发            = 410
 *   recovery= 余波+收势                  = 80
 */
export const SUPER_FRAMES = 600;
export const SUPER_STARTUP = 110;
export const SUPER_ACTIVE = 410;
export const SUPER_RECOVERY = 80;

/** 一个角色的姿势词汇表：骨架的每一拍从这里取形。 */
export interface PoseVocab {
  /** 起手的松弛站姿 */
  ready: Partial<Pose>;
  /** 蓄到最紧的那一帧 */
  coil: Partial<Pose>;
  /** 冲刺中段 */
  lunge: Partial<Pose>;
  /** 命中定格 */
  impact: Partial<Pose>;
  /** 连打的收手（架式） */
  guard: Partial<Pose>;
  /** 连打的前手出击 / 后手出击 */
  jabF: Partial<Pose>;
  jabB: Partial<Pose>;
  /** 肩撞/压迫推进 */
  drive: Partial<Pose>;
  /** 上挑 */
  launch: Partial<Pose>;
  /** 腾空追击 */
  air: Partial<Pose>;
  /** 落地砸 */
  slam: Partial<Pose>;
  /** 终结蓄力（张到最开） */
  finalWind: Partial<Pose>;
  /** 终结爆发 */
  finalBurst: Partial<Pose>;
}

function skeleton(v: PoseVocab): PhaseDef[] {
  return [
    { id: 'p01Windup', frames: 40, poses: [v.ready, { ...v.ready, crouch: 8 }, v.coil], ease: ['accel', 'accel', 'linear'] },
    { id: 'p02Charge', frames: 40, poses: [v.coil, { ...v.coil, crouch: (v.coil.crouch ?? 0) + 4 }, v.coil], ease: ['hold', 'hold', 'linear'] },
    { id: 'p03Dash', frames: 30, poses: [v.coil, v.lunge, { ...v.lunge, lean: (v.lunge.lean ?? 0) + 0.08 }], ease: ['accel', 'snap', 'linear'] },
    { id: 'p04Strike1', frames: 25, poses: [v.lunge, v.impact, v.impact, v.guard], ease: ['snap', 'hold', 'decel', 'linear'] },
    { id: 'p05FlurryA', frames: 45, poses: barragePoses(v.guard, v.jabF, v.jabB, 6), ease: 'snap' },
    { id: 'p06FlurryB', frames: 45, poses: barragePoses(v.guard, v.jabB, v.jabF, 8), ease: 'snap' },
    { id: 'p07Drive', frames: 40, poses: [v.guard, v.drive, v.drive, v.impact], ease: ['accel', 'hold', 'linear', 'snap'] },
    { id: 'p08FlurryC', frames: 45, poses: barragePoses(v.impact, v.jabF, v.jabB, 9), ease: 'snap' },
    { id: 'p09Launch', frames: 35, poses: [v.guard, { ...v.guard, crouch: 16 }, v.launch, v.launch], ease: ['linear', 'accel', 'snap', 'linear'] },
    { id: 'p10AirChase', frames: 50, poses: [v.launch, v.air, v.jabF, v.air, v.jabB, v.air], ease: 'snap' },
    { id: 'p11Slam', frames: 35, poses: [v.air, v.slam, v.slam, v.guard], ease: ['accel', 'snap', 'hold', 'decel'] },
    { id: 'p12FinalWind', frames: 50, poses: [v.guard, v.finalWind, v.finalWind, v.finalWind], ease: ['accel', 'hold', 'hold', 'linear'] },
    { id: 'p13FinalBurst', frames: 40, poses: [v.finalWind, v.finalBurst, v.finalBurst], ease: ['snap', 'hold', 'linear'] },
    { id: 'p14After', frames: 40, poses: [v.finalBurst, { ...v.impact, crouch: 6 }, v.guard], ease: ['decel', 'decel', 'linear'] },
    { id: 'p15Settle', frames: 40, poses: [v.guard, { ...v.ready, crouch: 6 }, v.ready], ease: 'decel' },
  ];
}

export function buildSuper(charId: string, v: PoseVocab): {
  motions: Record<string, Motion>;
  seq: { motionId: string; weight: number }[];
} {
  const phases = skeleton(v);
  const sum = phases.reduce((n, p) => n + p.frames, 0);
  // 骨架帧数之和必须精确等于招式总帧数——motionSeq 按 weight 切分总帧数，对不上就会
  // 出现某一段被压缩/拉伸，节拍全乱且没有任何报错
  if (sum !== SUPER_FRAMES) throw new Error(`${charId} 超必杀骨架帧数 ${sum} ≠ ${SUPER_FRAMES}`);
  return { motions: buildPhaseMotions(charId, phases), seq: phaseSeq(charId, phases) };
}

// ── 四人的姿势词汇 ──────────────────────────────────────────────────
// 同一套节拍，形态各不相同：哪吒枪走中线快而密，孙悟空棍走大回环，二郎神刀势开阔，
// 牛魔王低伏重压。

export const NEZHA_VOCAB: PoseVocab = {
  ready: { lean: 0.05, crouch: 2 },
  coil: { lean: -0.26, crouch: 18, armF: [-1.2, 1.1], armB: [-1.4, 1.0], legF: [0.35, -0.25], legB: [-0.5, 0.35] },
  lunge: { lean: 0.55, crouch: 5, armF: [0.7, 0.4], armB: [-0.9, 0.7], legF: [0.9, -0.6], legB: [-0.8, 0.6] },
  impact: { lean: 0.7, crouch: 1, armF: [1.58, 0.03], armB: [-0.6, 0.5], legF: [0.8, -0.35], legB: [-0.75, 0.5] },
  guard: { lean: 0.42, crouch: 4, armF: [0.45, 0.6], armB: [0.3, 0.55], legF: [0.6, -0.3], legB: [-0.6, 0.4] },
  jabF: { lean: 0.62, armF: [1.62, 0.02], armB: [0.28, 0.6], legF: [0.7, -0.35], legB: [-0.65, 0.45] },
  jabB: { lean: 0.48, crouch: 4, armF: [0.28, 0.7], armB: [1.58, 0.02], legF: [0.62, -0.3], legB: [-0.6, 0.42] },
  drive: { lean: 0.75, crouch: 10, armF: [0.9, 0.5], armB: [0.8, 0.5], legF: [0.95, -0.5], legB: [-0.85, 0.6] },
  launch: { lean: -0.35, crouch: 0, armF: [-2, 0.2], armB: [-1.8, 0.25], legF: [0.15, -0.4], legB: [-0.15, 0.2] },
  air: { lean: 0.2, crouch: 0, armF: [1.2, 0.35], armB: [-1.1, 0.4], legF: [0.7, -1.1], legB: [-0.5, -0.8] },
  slam: { lean: 0.55, crouch: 20, armF: [0.85, 0.15], armB: [0.85, 0.15], legF: [0.6, -0.2], legB: [-0.55, 0.25] },
  finalWind: { lean: -0.1, crouch: 10, armF: [-1.35, 1.1], armB: [1.35, 1.1], legF: [0.45, -0.22], legB: [-0.45, 0.22] },
  finalBurst: { lean: 0.35, crouch: -2, armF: [1.7, 0], armB: [1.55, 0.05], legF: [0.8, -0.5], legB: [-0.8, 0.5] },
};

export const WUKONG_VOCAB: PoseVocab = {
  ready: { lean: 0.04, crouch: 3 },
  coil: { lean: -0.28, crouch: 22, armF: [-0.35, 0.65], armB: [0.45, 0.65], legF: [0.6, -1], legB: [-0.5, -0.8] },
  lunge: { lean: 0.45, crouch: 6, armF: [-0.9, 0.35], armB: [-0.7, 0.35], legF: [0.85, -0.9], legB: [-0.7, -0.7] },
  impact: { lean: 0.42, crouch: 2, armF: [1.6, 0.05], armB: [1.55, 0.05], legF: [0.55, -0.5], legB: [-0.35, -0.25] },
  guard: { lean: 0.2, crouch: 5, armF: [2.5, 0.35], armB: [2.45, 0.35], legF: [0.4, -0.3], legB: [-0.4, 0.3] },
  jabF: { lean: 0.1, armF: [3.05, 0.05], armB: [3, 0.05], legF: [0.5, -0.4], legB: [-0.45, 0.35] },
  jabB: { lean: 0.5, crouch: 6, armF: [1.55, 0.05], armB: [1.5, 0.08], legF: [0.6, -0.35], legB: [-0.5, 0.3] },
  drive: { lean: 0.68, crouch: 12, armF: [2.8, 0.2], armB: [2.75, 0.2], legF: [0.95, -0.45], legB: [-0.8, 0.55] },
  launch: { lean: -0.3, crouch: 0, armF: [-1.9, 0.25], armB: [-1.85, 0.25], legF: [0.2, -0.5], legB: [-0.2, 0.25] },
  air: { lean: -0.15, crouch: 0, armF: [2.7, 0.25], armB: [2.65, 0.25], legF: [0.85, -1.3], legB: [-0.6, -1] },
  slam: { lean: 0.52, crouch: 22, armF: [0.85, 0.1], armB: [0.85, 0.1], legF: [0.5, -0.15], legB: [-0.4, 0.15] },
  finalWind: { lean: -0.32, crouch: 6, armF: [3.05, 0.1], armB: [3, 0.1], legF: [0.35, -0.3], legB: [-0.35, 0.3] },
  finalBurst: { lean: 0.6, crouch: 8, armF: [0.9, 0.08], armB: [0.88, 0.1], legF: [0.75, -0.3], legB: [-0.6, 0.35] },
};

export const ERLANG_VOCAB: PoseVocab = {
  ready: { lean: 0.03, crouch: 3 },
  coil: { lean: -0.05, crouch: 8, armF: [2.4, 0.85], armB: [-2.3, 0.85] },
  lunge: { lean: 0.3, crouch: 4, armF: [1.9, 0.4], armB: [-1.4, 0.5], legF: [0.7, -0.45], legB: [-0.6, 0.45] },
  impact: { lean: 0.35, crouch: 0, armF: [1.5, 0.02], armB: [-0.15, 0.4], legF: [0.6, -0.3], legB: [-0.55, 0.4] },
  guard: { lean: 0.16, crouch: 4, armF: [1.05, 0.55], armB: [-0.5, 0.5], legF: [0.4, -0.2], legB: [-0.4, 0.3] },
  jabF: { lean: 0.34, armF: [1.75, 0.02], armB: [-0.3, 0.45], legF: [0.55, -0.28], legB: [-0.5, 0.36] },
  jabB: { lean: -0.06, crouch: 6, armF: [2.6, 0.3], armB: [-2.2, 0.5], legF: [0.35, -0.18], legB: [-0.35, 0.26] },
  drive: { lean: 0.6, crouch: 10, armF: [1.3, 0.3], armB: [0.9, 0.4], legF: [0.9, -0.45], legB: [-0.8, 0.55] },
  launch: { lean: -0.3, crouch: 0, armF: [2.55, 0.08], armB: [-1.5, 0.3], legF: [0.2, -0.45], legB: [-0.2, 0.22] },
  air: { lean: 0.12, crouch: 0, armF: [1.45, 0.2], armB: [-1.2, 0.35], legF: [0.6, -1], legB: [-0.45, -0.75] },
  slam: { lean: 0.48, crouch: 18, armF: [0.9, 0.12], armB: [0.7, 0.2], legF: [0.55, -0.18], legB: [-0.5, 0.22] },
  finalWind: { lean: -0.12, crouch: 4, armF: [2.7, 0.55], armB: [-2.6, 0.6] },
  finalBurst: { lean: 0.3, crouch: 0, armF: [1.55, 0], armB: [1.35, 0.06], legF: [0.7, -0.4], legB: [-0.6, 0.45] },
};

/**
 * 红孩儿：**低、野、不成章法**。他不是练家子，是个仗着三昧真火横冲直撞的孩子——
 * 重心一律压得比四个大人低（crouch 普遍大一档），出手幅度反而更大（armF 摆到极值），
 * 收手不回架式而是甩在体侧。与哪吒同持火尖枪，姿势却要一眼分得开：
 * 哪吒是"立"（挺脊、枪走直线），红孩儿是"扑"（前倾、枪从下往上撩）。
 */
export const HONGHAIER_VOCAB: PoseVocab = {
  ready: { lean: 0.1, crouch: 8 },
  coil: { lean: -0.34, crouch: 26, armF: [-0.6, 0.75], armB: [0.5, 0.7], legF: [0.7, -1.1], legB: [-0.6, -0.9] },
  lunge: { lean: 0.58, crouch: 12, armF: [-1.05, 0.3], armB: [-0.85, 0.35], legF: [0.95, -1.0], legB: [-0.8, -0.75] },
  impact: { lean: 0.5, crouch: 6, armF: [1.75, 0.05], armB: [1.6, 0.08], legF: [0.6, -0.5], legB: [-0.4, -0.2] },
  guard: { lean: 0.24, crouch: 12, armF: [0.55, 0.6], armB: [-0.45, 0.45], legF: [0.45, -0.3], legB: [-0.45, 0.3] },
  jabF: { lean: 0.18, crouch: 6, armF: [3.1, 0.02], armB: [-0.5, 0.35], legF: [0.55, -0.4], legB: [-0.5, 0.35] },
  jabB: { lean: 0.56, crouch: 14, armF: [1.35, 0.05], armB: [2.9, 0.06], legF: [0.65, -0.35], legB: [-0.55, 0.3] },
  drive: { lean: 0.76, crouch: 18, armF: [2.95, 0.16], armB: [2.8, 0.2], legF: [1.0, -0.5], legB: [-0.85, 0.6] },
  launch: { lean: -0.38, crouch: 0, armF: [-2.1, 0.2], armB: [-1.7, 0.3], legF: [0.25, -0.55], legB: [-0.25, 0.3] },
  air: { lean: -0.22, crouch: 0, armF: [2.9, 0.2], armB: [2.6, 0.3], legF: [0.95, -1.45], legB: [-0.7, -1.15] },
  slam: { lean: 0.6, crouch: 26, armF: [0.8, 0.08], armB: [0.78, 0.12], legF: [0.55, -0.12], legB: [-0.45, 0.18] },
  finalWind: { lean: -0.4, crouch: 10, armF: [3.1, 0.08], armB: [2.95, 0.12], legF: [0.4, -0.35], legB: [-0.4, 0.35] },
  finalBurst: { lean: 0.7, crouch: 12, armF: [0.85, 0.06], armB: [0.8, 0.1], legF: [0.85, -0.35], legB: [-0.7, 0.4] },
};

/**
 * 铁扇公主：**开阖**。她不冲不撞，一切靠扇面张开的那一下把人推出去——
 * 姿势的主轴是双臂大开大合（armF/armB 一起摆到两侧极值再收回体前），重心稳、几乎不前倾，
 * 与四个近身角色（都靠 lean 压上去）从根子上就不是一套身法。
 * 落脚点：即使是「冲刺中段」（lunge）她也只是滑步，lean 只给到 0.18。
 */
export const TIESHAN_VOCAB: PoseVocab = {
  ready: { lean: 0, crouch: 4 },
  coil: { lean: -0.16, crouch: 14, armF: [-1.5, 0.9], armB: [1.4, 0.85], legF: [0.35, -0.4], legB: [-0.3, -0.3] },
  lunge: { lean: 0.18, crouch: 6, armF: [1.2, 0.75], armB: [-1.1, 0.7], legF: [0.55, -0.35], legB: [-0.5, 0.3] },
  impact: { lean: 0.12, crouch: 2, armF: [1.85, 0.15], armB: [-1.75, 0.2], legF: [0.45, -0.25], legB: [-0.42, 0.28] },
  guard: { lean: 0.05, crouch: 6, armF: [0.75, 0.7], armB: [-0.7, 0.6], legF: [0.3, -0.2], legB: [-0.3, 0.22] },
  jabF: { lean: 0.14, armF: [2.2, 0.12], armB: [-0.6, 0.5], legF: [0.4, -0.28], legB: [-0.4, 0.3] },
  jabB: { lean: 0.1, crouch: 5, armF: [-0.55, 0.5], armB: [2.15, 0.14], legF: [0.42, -0.26], legB: [-0.42, 0.28] },
  drive: { lean: 0.3, crouch: 10, armF: [2.35, 0.3], armB: [-2.2, 0.35], legF: [0.6, -0.3], legB: [-0.55, 0.4] },
  launch: { lean: -0.24, crouch: 0, armF: [-2.3, 0.35], armB: [2.2, 0.4], legF: [0.2, -0.4], legB: [-0.2, 0.2] },
  air: { lean: -0.08, crouch: 0, armF: [2.5, 0.4], armB: [-2.4, 0.45], legF: [0.6, -1.1], legB: [-0.45, -0.85] },
  slam: { lean: 0.34, crouch: 16, armF: [1.05, 0.2], armB: [-1.0, 0.22], legF: [0.4, -0.15], legB: [-0.35, 0.18] },
  finalWind: { lean: -0.26, crouch: 8, armF: [-2.5, 0.5], armB: [2.4, 0.55], legF: [0.3, -0.25], legB: [-0.3, 0.28] },
  finalBurst: { lean: 0.32, crouch: 6, armF: [2.6, 0.18], armB: [-2.5, 0.22], legF: [0.6, -0.28], legB: [-0.55, 0.32] },
};

/**
 * 白骨精：**低伏与假象**。她的每一个姿势都比看上去矮一档（crouch 全线偏大），
 * 出手前先往反方向引（coil 的 armF 摆到身后极值），读起来永远像要做另一件事——
 * 这正是她那两记「必杀也分上下段」在身法上的对应物。
 * 与铁扇公主的开阖、红孩儿的横冲都不一样：她是**收**着打的。
 */
export const BAIGU_VOCAB: PoseVocab = {
  ready: { lean: -0.04, crouch: 10 },
  coil: { lean: -0.3, crouch: 24, armF: [-1.9, 0.5], armB: [-1.7, 0.55], legF: [0.5, -0.7], legB: [-0.45, -0.55] },
  lunge: { lean: 0.42, crouch: 18, armF: [-0.7, 0.2], armB: [-0.6, 0.25], legF: [0.8, -0.7], legB: [-0.7, -0.5] },
  impact: { lean: 0.38, crouch: 10, armF: [1.9, 0.06], armB: [1.7, 0.1], legF: [0.55, -0.35], legB: [-0.45, -0.15] },
  guard: { lean: 0.08, crouch: 14, armF: [0.6, 0.5], armB: [-0.55, 0.4], legF: [0.35, -0.25], legB: [-0.35, 0.25] },
  jabF: { lean: 0.24, crouch: 8, armF: [2.6, 0.04], armB: [-0.45, 0.4], legF: [0.5, -0.32], legB: [-0.45, 0.32] },
  jabB: { lean: 0.3, crouch: 16, armF: [-0.5, 0.42], armB: [2.5, 0.06], legF: [0.55, -0.3], legB: [-0.5, 0.3] },
  drive: { lean: 0.58, crouch: 22, armF: [2.7, 0.14], armB: [2.5, 0.18], legF: [0.85, -0.4], legB: [-0.75, 0.5] },
  launch: { lean: -0.34, crouch: 4, armF: [-2.2, 0.3], armB: [-2.0, 0.34], legF: [0.22, -0.45], legB: [-0.22, 0.24] },
  air: { lean: -0.18, crouch: 0, armF: [2.8, 0.22], armB: [2.55, 0.28], legF: [0.9, -1.35], legB: [-0.65, -1.05] },
  slam: { lean: 0.5, crouch: 28, armF: [0.75, 0.06], armB: [0.72, 0.1], legF: [0.5, -0.1], legB: [-0.4, 0.14] },
  finalWind: { lean: -0.36, crouch: 18, armF: [-2.6, 0.3], armB: [-2.4, 0.35], legF: [0.35, -0.3], legB: [-0.35, 0.3] },
  finalBurst: { lean: 0.64, crouch: 14, armF: [2.8, 0.05], armB: [2.6, 0.08], legF: [0.8, -0.32], legB: [-0.65, 0.38] },
};

/**
 * 后羿：**开弓**。全套姿势的主轴只有一件事——前手推出去、后手拉到耳后（armF 大正、armB 大负），
 * 身形稳到近乎不动（lean 全线最小、crouch 最浅）。他不是靠身法赢的人，
 * 是站在那里把弓拉满的人；连「冲刺中段」也只是把重心往前挪一档。
 */
export const HOUYI_VOCAB: PoseVocab = {
  ready: { lean: 0.02, crouch: 2 },
  coil: { lean: -0.12, crouch: 8, armF: [1.9, 0.9], armB: [-2.5, 0.5], legF: [0.4, -0.3], legB: [-0.35, -0.25] },
  lunge: { lean: 0.16, crouch: 4, armF: [2.1, 0.75], armB: [-2.2, 0.4], legF: [0.6, -0.3], legB: [-0.55, 0.25] },
  impact: { lean: 0.1, crouch: 0, armF: [2.35, 0.25], armB: [-1.4, 0.3], legF: [0.45, -0.2], legB: [-0.42, 0.24] },
  guard: { lean: 0.04, crouch: 4, armF: [1.5, 0.6], armB: [-1.2, 0.45], legF: [0.3, -0.18], legB: [-0.3, 0.2] },
  jabF: { lean: 0.1, armF: [2.5, 0.2], armB: [-2.4, 0.35], legF: [0.4, -0.24], legB: [-0.4, 0.26] },
  jabB: { lean: 0.06, crouch: 3, armF: [2.15, 0.55], armB: [-2.55, 0.3], legF: [0.42, -0.22], legB: [-0.42, 0.24] },
  drive: { lean: 0.26, crouch: 8, armF: [2.6, 0.3], armB: [-2.5, 0.32], legF: [0.6, -0.28], legB: [-0.55, 0.34] },
  launch: { lean: -0.2, crouch: 0, armF: [-1.7, 0.4], armB: [-2.3, 0.45], legF: [0.2, -0.35], legB: [-0.2, 0.2] },
  air: { lean: -0.06, crouch: 0, armF: [2.45, 0.35], armB: [-2.4, 0.4], legF: [0.55, -1.05], legB: [-0.42, -0.8] },
  slam: { lean: 0.3, crouch: 14, armF: [1.1, 0.15], armB: [-0.9, 0.2], legF: [0.4, -0.14], legB: [-0.35, 0.16] },
  finalWind: { lean: -0.22, crouch: 6, armF: [2.0, 1.0], armB: [-2.7, 0.55], legF: [0.32, -0.26], legB: [-0.32, 0.28] },
  finalBurst: { lean: 0.28, crouch: 4, armF: [2.7, 0.12], armB: [-1.5, 0.2], legF: [0.62, -0.26], legB: [-0.55, 0.3] },
};

/**
 * 雷震子：**双翅**。他的两臂从来不是"手"，是一对张开的翅膀——
 * armF/armB 永远同向、永远大幅张开（两者同号，这在名册里独一份：其余人都是一前一后）。
 * 落地那几拍反而收得极紧（slam 的 crouch 最深），读起来是"从空中砸下来"而不是"站着打"。
 */
export const LEIZHEN_VOCAB: PoseVocab = {
  ready: { lean: 0.02, crouch: 2, armF: [0.6, 0.8], armB: [0.5, 0.75] },
  coil: { lean: -0.28, crouch: 18, armF: [-1.6, 1.0], armB: [-1.5, 0.95], legF: [0.45, -0.6], legB: [-0.4, -0.5] },
  lunge: { lean: 0.36, crouch: 2, armF: [-2.2, 0.85], armB: [-2.1, 0.8], legF: [0.7, -1.0], legB: [-0.6, -0.85] },
  impact: { lean: 0.44, crouch: 4, armF: [1.5, 0.15], armB: [1.4, 0.2], legF: [0.6, -0.5], legB: [-0.45, -0.3] },
  guard: { lean: 0.1, crouch: 6, armF: [0.8, 0.85], armB: [0.7, 0.8], legF: [0.32, -0.24], legB: [-0.32, 0.26] },
  jabF: { lean: 0.2, armF: [2.6, 0.3], armB: [1.2, 0.7], legF: [0.45, -0.3], legB: [-0.45, 0.3] },
  jabB: { lean: 0.24, crouch: 4, armF: [1.2, 0.7], armB: [2.5, 0.32], legF: [0.48, -0.28], legB: [-0.48, 0.28] },
  drive: { lean: 0.5, crouch: 8, armF: [-2.5, 0.9], armB: [-2.4, 0.85], legF: [0.8, -0.6], legB: [-0.7, 0.4] },
  launch: { lean: -0.42, crouch: 0, armF: [-2.6, 1.05], armB: [-2.5, 1.0], legF: [0.2, -0.7], legB: [-0.2, -0.5] },
  air: { lean: -0.1, crouch: 0, armF: [-2.4, 1.1], armB: [-2.3, 1.05], legF: [0.9, -1.5], legB: [-0.7, -1.25] },
  slam: { lean: 0.56, crouch: 30, armF: [0.7, 0.1], armB: [0.68, 0.14], legF: [0.5, -0.1], legB: [-0.42, 0.14] },
  finalWind: { lean: -0.44, crouch: 4, armF: [-2.7, 1.1], armB: [-2.6, 1.05], legF: [0.3, -0.5], legB: [-0.3, -0.35] },
  finalBurst: { lean: 0.6, crouch: 10, armF: [1.3, 0.1], armB: [1.25, 0.14], legF: [0.8, -0.35], legB: [-0.65, 0.4] },
};

/**
 * 钟馗：**压**。他不追不躲，一步一步往前碾——所有姿势的重心都压得很低而且**始终朝前**
 *（lean 全线为正，连蓄力的 coil 都不后仰，这在名册里独一份：别人蓄力都要先往回收）。
 * 前手是判官笔（armF 常年伸在身前指着对手），后手拖着剑。
 */
export const ZHONGKUI_VOCAB: PoseVocab = {
  ready: { lean: 0.1, crouch: 6, armF: [0.9, 0.5], armB: [-0.9, 0.4] },
  coil: { lean: 0.06, crouch: 22, armF: [1.3, 0.7], armB: [-1.6, 0.5], legF: [0.5, -0.5], legB: [-0.45, -0.4] },
  lunge: { lean: 0.4, crouch: 14, armF: [1.7, 0.4], armB: [-1.9, 0.35], legF: [0.75, -0.5], legB: [-0.7, -0.4] },
  impact: { lean: 0.36, crouch: 8, armF: [2.0, 0.1], armB: [-1.2, 0.25], legF: [0.55, -0.3], legB: [-0.5, -0.15] },
  guard: { lean: 0.14, crouch: 10, armF: [1.0, 0.55], armB: [-0.85, 0.4], legF: [0.35, -0.22], legB: [-0.35, 0.24] },
  jabF: { lean: 0.26, crouch: 6, armF: [2.4, 0.08], armB: [-0.9, 0.35], legF: [0.5, -0.28], legB: [-0.48, 0.3] },
  jabB: { lean: 0.3, crouch: 12, armF: [1.1, 0.45], armB: [-2.3, 0.12], legF: [0.55, -0.26], legB: [-0.5, 0.28] },
  drive: { lean: 0.54, crouch: 18, armF: [2.5, 0.2], armB: [-2.2, 0.25], legF: [0.85, -0.45], legB: [-0.78, 0.5] },
  launch: { lean: 0.04, crouch: 2, armF: [-1.9, 0.4], armB: [-1.6, 0.45], legF: [0.25, -0.4], legB: [-0.25, 0.22] },
  air: { lean: 0.16, crouch: 0, armF: [2.5, 0.3], armB: [-2.0, 0.35], legF: [0.8, -1.2], legB: [-0.6, -0.95] },
  slam: { lean: 0.48, crouch: 24, armF: [0.85, 0.08], armB: [-0.8, 0.14], legF: [0.5, -0.12], legB: [-0.42, 0.16] },
  finalWind: { lean: 0.08, crouch: 20, armF: [1.5, 0.75], armB: [-2.4, 0.4], legF: [0.4, -0.32], legB: [-0.4, 0.32] },
  finalBurst: { lean: 0.58, crouch: 10, armF: [2.6, 0.06], armB: [-1.3, 0.16], legF: [0.8, -0.3], legB: [-0.68, 0.36] },
};

/**
 * 刑天：**无头**。断头之后以乳为目、以脐为口——所以他的 headTilt 永远是 0，
 * 整套姿势里"看"这件事由躯干完成：身体正对着对手，肩线永远端平（roll 全线为 0），
 * 靠上身的转与压来读方向。左手干（盾）常年横在身前（armB 收在体前不摆开），
 * 右手戚（斧）大开大合。名册里唯一一个从不侧身的人。
 */
export const XINGTIAN_VOCAB: PoseVocab = {
  ready: { lean: 0.06, crouch: 8, armB: [-0.5, 0.35] },
  coil: { lean: -0.18, crouch: 24, armF: [-1.8, 0.7], armB: [-0.45, 0.3], legF: [0.5, -0.6], legB: [-0.45, -0.5] },
  lunge: { lean: 0.44, crouch: 16, armF: [-0.9, 0.3], armB: [-0.4, 0.28], legF: [0.85, -0.7], legB: [-0.75, -0.55] },
  impact: { lean: 0.4, crouch: 10, armF: [1.7, 0.06], armB: [-0.4, 0.3], legF: [0.6, -0.35], legB: [-0.5, -0.2] },
  guard: { lean: 0.12, crouch: 14, armF: [0.7, 0.5], armB: [-0.35, 0.25], legF: [0.35, -0.22], legB: [-0.35, 0.24] },
  jabF: { lean: 0.24, crouch: 8, armF: [2.5, 0.06], armB: [-0.4, 0.28], legF: [0.5, -0.3], legB: [-0.48, 0.3] },
  jabB: { lean: 0.3, crouch: 16, armF: [1.2, 0.3], armB: [-0.3, 0.22], legF: [0.55, -0.28], legB: [-0.5, 0.3] },
  drive: { lean: 0.6, crouch: 22, armF: [2.7, 0.16], armB: [-0.35, 0.26], legF: [0.9, -0.5], legB: [-0.8, 0.55] },
  launch: { lean: -0.26, crouch: 2, armF: [-2.2, 0.35], armB: [-0.45, 0.3], legF: [0.25, -0.45], legB: [-0.25, 0.24] },
  air: { lean: 0.06, crouch: 0, armF: [2.6, 0.24], armB: [-0.4, 0.3], legF: [0.85, -1.25], legB: [-0.65, -1.0] },
  slam: { lean: 0.54, crouch: 30, armF: [0.8, 0.06], armB: [-0.35, 0.2], legF: [0.5, -0.1], legB: [-0.42, 0.14] },
  finalWind: { lean: -0.3, crouch: 20, armF: [-2.5, 0.5], armB: [-0.4, 0.28], legF: [0.4, -0.34], legB: [-0.4, 0.34] },
  finalBurst: { lean: 0.66, crouch: 12, armF: [1.4, 0.05], armB: [-0.35, 0.22], legF: [0.85, -0.32], legB: [-0.7, 0.4] },
};

/**
 * 猪八戒：**沉**。天蓬元帅下界之后那身肉是他的本钱——重心最低、起落最慢，
 * 但两条手臂张得最开（抓人要先张手）。与刑天的"端平不动"不同：他是**扑**，
 * 每一拍都往前送肩，读起来像随时要把人抱住。
 */
export const BAJIE_VOCAB: PoseVocab = {
  ready: { lean: 0.08, crouch: 12 },
  coil: { lean: -0.2, crouch: 28, armF: [-1.4, 0.9], armB: [-1.2, 0.85], legF: [0.45, -0.55], legB: [-0.4, -0.45] },
  lunge: { lean: 0.5, crouch: 20, armF: [-1.0, 0.8], armB: [-0.85, 0.75], legF: [0.8, -0.6], legB: [-0.7, -0.5] },
  impact: { lean: 0.42, crouch: 14, armF: [1.6, 0.3], armB: [1.4, 0.35], legF: [0.55, -0.3], legB: [-0.48, -0.16] },
  guard: { lean: 0.14, crouch: 18, armF: [0.8, 0.7], armB: [-0.7, 0.6], legF: [0.32, -0.2], legB: [-0.32, 0.22] },
  jabF: { lean: 0.26, crouch: 12, armF: [2.3, 0.2], armB: [-0.6, 0.5], legF: [0.48, -0.28], legB: [-0.46, 0.3] },
  jabB: { lean: 0.32, crouch: 20, armF: [-0.55, 0.55], armB: [2.2, 0.22], legF: [0.52, -0.26], legB: [-0.48, 0.28] },
  drive: { lean: 0.62, crouch: 24, armF: [-1.2, 0.95], armB: [-1.05, 0.9], legF: [0.88, -0.5], legB: [-0.78, 0.55] },
  launch: { lean: -0.24, crouch: 6, armF: [-2.0, 0.5], armB: [-1.8, 0.55], legF: [0.24, -0.4], legB: [-0.24, 0.22] },
  air: { lean: 0.1, crouch: 0, armF: [-1.6, 0.9], armB: [-1.4, 0.85], legF: [0.8, -1.15], legB: [-0.6, -0.9] },
  slam: { lean: 0.5, crouch: 32, armF: [0.85, 0.1], armB: [0.8, 0.14], legF: [0.5, -0.1], legB: [-0.42, 0.14] },
  finalWind: { lean: -0.26, crouch: 26, armF: [-1.9, 1.0], armB: [-1.7, 0.95], legF: [0.4, -0.3], legB: [-0.4, 0.32] },
  finalBurst: { lean: 0.64, crouch: 16, armF: [1.5, 0.12], armB: [1.35, 0.16], legF: [0.82, -0.3], legB: [-0.68, 0.38] },
};

export const NIUMO_VOCAB: PoseVocab = {
  ready: { lean: 0.06, crouch: 6 },
  coil: { lean: 0.55, crouch: 24, armF: [0.25, 0.35], armB: [0.25, 0.35], legF: [0.85, -0.45], legB: [-0.75, 0.5] },
  lunge: { lean: 0.7, crouch: 12, armF: [0.35, 0.3], armB: [0.3, 0.32], legF: [0.95, -0.4], legB: [-0.85, 0.55] },
  impact: { lean: -0.42, crouch: 2, armF: [1.5, 1.1], armB: [-1.3, 1], legF: [0.5, -0.9], legB: [-0.5, 0.2] },
  guard: { lean: 0.25, crouch: 10, armF: [0.7, 0.9], armB: [0.55, 0.85], legF: [0.5, -0.2], legB: [-0.5, 0.3] },
  jabF: { lean: 0.5, crouch: 4, armF: [1.65, 0.05], armB: [0.3, 0.7], legF: [0.7, -0.3], legB: [-0.6, 0.4] },
  jabB: { lean: 0.45, crouch: 6, armF: [0.3, 0.75], armB: [1.6, 0.06], legF: [0.65, -0.28], legB: [-0.58, 0.38] },
  drive: { lean: 0.8, crouch: 16, armF: [0.2, 0.25], armB: [0.18, 0.25], legF: [1, -0.5], legB: [-0.9, 0.6] },
  launch: { lean: -0.45, crouch: 0, armF: [1.6, 1.15], armB: [-1.4, 1.05], legF: [0.45, -0.85], legB: [-0.45, 0.2] },
  air: { lean: 0.3, crouch: 0, armF: [1.1, 0.5], armB: [0.9, 0.55], legF: [0.6, -1], legB: [-0.5, -0.75] },
  slam: { lean: 0.35, crouch: 26, armF: [0.55, 1], armB: [0.45, 1], legF: [0.8, -0.12], legB: [-0.8, 0.3] },
  finalWind: { lean: -0.3, crouch: 8, armF: [2.6, 0.7], armB: [-2.5, 0.7], legF: [0.4, -0.25], legB: [-0.4, 0.3] },
  finalBurst: { lean: 0.5, crouch: 4, armF: [1.4, 0.1], armB: [1.3, 0.12], legF: [0.85, -0.4], legB: [-0.75, 0.5] },
};

// ── 镜头与演出节拍 ──────────────────────────────────────────────────
/** 一拍要改变的演出量。frame 是出招者的 stateFrame；跨过这一帧时触发一次。
 * 四人共用同一份节拍表——十五段骨架的段界完全一致，镜头语言也就该一致，
 * 玩家看第二次就能预判"下一拍要拉近了"。 */
export interface CineBeat {
  frame: number;
  /** 焦点缩放的目标值（cam.focus.zoom）。不给则保持上一拍 */
  zoom?: number;
  /** 这一拍的震屏强度 */
  shake?: number;
  /** 这一拍要放的慢镜帧数 */
  slow?: number;
  /** 影院黑边的目标高度（占画面高度的比例，0=收起） */
  bars?: number;
  /** 暗场强度目标（0=全亮） */
  dark?: number;
  /** 额外的定格帧数（时停） */
  freeze?: number;
}

/** 段界（累加）：0 起势 40 蓄力 80 突进 110 首击 135 连打A 180 连打B 225 逼近
 * 265 版边连打 310 挑空 345 空中追击 395 落地砸 430 终结蓄力 480 终结爆发
 * 520 余波 560 收势 600。下面每一拍都钉在段界上。 */
export const SUPER_BEATS: CineBeat[] = [
  { frame: 0, zoom: 1.5, bars: 0.11, dark: 1 },              // 起势：黑边压下来、暗场铺满
  { frame: 40, zoom: 1.32 },                                  // 蓄力：略微拉开，让蓄势的体态看得全
  { frame: 78, zoom: 1.62, shake: 5 },                        // 突进前一拍：抢进
  { frame: 110, zoom: 1.72, shake: 15, slow: 6, freeze: 4 },  // 首击：最重的一次定格
  { frame: 135, zoom: 1.4 },                                  // 连打A：退回中景看连段
  { frame: 180, zoom: 1.46 },                                 // 连打B：略收，节奏加快
  { frame: 225, zoom: 1.28, shake: 8 },                       // 逼近：拉开，让两人一起朝版边挪
  { frame: 265, zoom: 1.52, shake: 6 },                       // 版边连打：贴到最近
  { frame: 310, zoom: 1.22, slow: 8 },                        // 挑空：拉远看抛物线
  { frame: 345, zoom: 1.12 },                                 // 空中追击：全景
  { frame: 395, zoom: 1.5, shake: 18, slow: 5 },              // 落地砸
  { frame: 430, zoom: 1.78, dark: 0.55 },                     // 终结蓄力：推到最近，暗场再压一次
  { frame: 480, zoom: 1.92, shake: 26, slow: 16, freeze: 8 }, // 终结爆发：全场最大的一拍
  { frame: 520, zoom: 1.2, dark: 0 },                         // 余波：放开，天光回来
  { frame: 560, zoom: 1.0, bars: 0 },                         // 收势：黑边收起
];

// ── 奥义（sp50）：另一套骨架 ─────────────────────────────────────────
/** 奥义同样是十秒级的演出，但结构与超必杀刻意不同：超必杀是「密集连打一路逼到版边」，
 * 奥义是「长蓄力 + 少数几下极重的技」。两档因此不只是尺寸差别——节奏形态就不一样，
 * 玩家一眼能分出放的是哪一档。
 *
 *   起势60 长蓄80 突进40 首击40 连击90 挑空50 追击80 终结90 收势70 = 600 帧
 *   startup=180  active=350  recovery=70
 *
 * 姿势词汇直接复用超必杀那一份（同一个角色的身法本来就该是同一套），不另写一遍。 */
export const ASSAULT_STARTUP = 180;
export const ASSAULT_ACTIVE = 350;
export const ASSAULT_RECOVERY = 70;

function assaultSkeleton(v: PoseVocab): PhaseDef[] {
  return [
    { id: 'a1Windup', frames: 60, poses: [v.ready, { ...v.ready, crouch: 10 }, v.coil], ease: ['accel', 'accel', 'linear'] },
    { id: 'a2Charge', frames: 80, poses: [v.coil, { ...v.coil, crouch: (v.coil.crouch ?? 0) + 6 }, v.coil, v.coil], ease: ['hold', 'hold', 'hold', 'linear'] },
    { id: 'a3Dash', frames: 40, poses: [v.coil, v.lunge, { ...v.lunge, lean: (v.lunge.lean ?? 0) + 0.1 }], ease: ['accel', 'snap', 'linear'] },
    { id: 'a4Strike', frames: 40, poses: [v.lunge, v.impact, v.impact, v.guard], ease: ['snap', 'hold', 'hold', 'decel'] },
    { id: 'a5Combo', frames: 90, poses: barragePoses(v.guard, v.jabF, v.jabB, 5), ease: 'snap' },
    { id: 'a6Launch', frames: 50, poses: [v.guard, { ...v.guard, crouch: 18 }, v.launch, v.launch], ease: ['linear', 'accel', 'snap', 'linear'] },
    { id: 'a7Chase', frames: 80, poses: [v.launch, v.air, v.drive, v.air, v.slam], ease: ['snap', 'snap', 'snap', 'accel', 'snap'] },
    { id: 'a8Final', frames: 90, poses: [v.slam, v.finalWind, v.finalWind, v.finalBurst, v.finalBurst], ease: ['decel', 'hold', 'hold', 'snap', 'linear'] },
    { id: 'a9Settle', frames: 70, poses: [v.finalBurst, { ...v.guard, crouch: 8 }, v.ready], ease: 'decel' },
  ];
}

export function buildAssault(charId: string, v: PoseVocab): {
  motions: Record<string, Motion>;
  seq: { motionId: string; weight: number }[];
} {
  const phases = assaultSkeleton(v);
  const sum = phases.reduce((n, p) => n + p.frames, 0);
  if (sum !== SUPER_FRAMES) throw new Error(`${charId} 奥义骨架帧数 ${sum} != ${SUPER_FRAMES}`);
  return { motions: buildPhaseMotions(`${charId}A`, phases), seq: phaseSeq(`${charId}A`, phases) };
}

/** 奥义的节拍表：拍数比超必杀少（9 拍对 15 拍），每拍停得更久——对应"少数几下极重的技"。
 * 黑边压得比超必杀薄一档（0.08 对 0.11），暗场也浅一档，让两档在观感上分得开。 */
export const ASSAULT_BEATS: CineBeat[] = [
  { frame: 0, zoom: 1.34, bars: 0.08, dark: 0.6 },            // 起势
  { frame: 60, zoom: 1.2 },                                    // 长蓄：拉开，蓄势本身就是看点
  { frame: 140, zoom: 1.5, shake: 6 },                         // 突进
  { frame: 180, zoom: 1.66, shake: 16, slow: 8, freeze: 5 },   // 首击：奥义的重拍在这里
  { frame: 220, zoom: 1.34 },                                  // 连击
  { frame: 310, zoom: 1.18, slow: 6 },                         // 挑空：拉远
  { frame: 360, zoom: 1.28, shake: 10 },                       // 追击
  { frame: 440, zoom: 1.8, shake: 22, slow: 14, freeze: 6 },   // 终结
  { frame: 530, zoom: 1.0, bars: 0, dark: 0 },                 // 收势
];

// ── 短演出（打不死人时用）─────────────────────────────────────────────
/** 十秒演出只在这一击能 KO 时播；打不死人时换成这个约三秒的短版。
 *
 * 这是业界通行解法（GG 一击必杀、MK Fatality 都只在终结时播）：可重复使用的对局内大招
 * 普遍是 2-5 秒，超过 8 秒的一律限制成"一场一次"或"只能终结时放"，否则挨打那边每回合
 * 都要干看十秒。本作气槽填满 50 约需 5 秒战斗、填满 100 约 8.6 秒——若每次都放十秒，
 * 过场时间会超过实际战斗时间。
 *
 *   起势30 突进25 首击25 连打60 收势40 = 180 帧（3s）
 *   startup=55  active=85  recovery=40
 *
 * 姿势词汇仍复用同一份，形态因此和长版一脉相承，只是把中段的铺陈全部砍掉。 */
export const BRIEF_FRAMES = 180;
export const BRIEF_STARTUP = 55;
export const BRIEF_ACTIVE = 85;
export const BRIEF_RECOVERY = 40;

function briefSkeleton(v: PoseVocab): PhaseDef[] {
  return [
    { id: 'b1Windup', frames: 30, poses: [v.ready, v.coil], ease: ['accel', 'linear'] },
    { id: 'b2Dash', frames: 25, poses: [v.coil, v.lunge], ease: ['snap', 'linear'] },
    { id: 'b3Strike', frames: 25, poses: [v.lunge, v.impact, v.guard], ease: ['snap', 'hold', 'decel'] },
    { id: 'b4Combo', frames: 60, poses: barragePoses(v.guard, v.jabF, v.jabB, 4), ease: 'snap' },
    { id: 'b5Settle', frames: 40, poses: [v.finalBurst, { ...v.guard, crouch: 8 }, v.ready], ease: ['snap', 'decel', 'decel'] },
  ];
}

export function buildBrief(charId: string, v: PoseVocab): {
  motions: Record<string, Motion>;
  seq: { motionId: string; weight: number }[];
} {
  const phases = briefSkeleton(v);
  const sum = phases.reduce((n, p) => n + p.frames, 0);
  if (sum !== BRIEF_FRAMES) throw new Error(`${charId} 短演出骨架帧数 ${sum} != ${BRIEF_FRAMES}`);
  return { motions: buildPhaseMotions(`${charId}B`, phases), seq: phaseSeq(`${charId}B`, phases) };
}

/** 短演出的节拍：五拍，幅度全面低一档，也不压影院黑边——黑边是"这是过场"的信号，
 * 留给真正的终结演出，短版不该抢那个分量。 */
export const BRIEF_BEATS: CineBeat[] = [
  { frame: 0, zoom: 1.28, dark: 0.5 },
  { frame: 30, zoom: 1.4, shake: 4 },
  { frame: 55, zoom: 1.55, shake: 12, slow: 5 },
  { frame: 80, zoom: 1.34 },
  { frame: 140, zoom: 1.0, dark: 0 },
];

// ── 各角色专属的受击反应 ────────────────────────────────────────────
/** 挨打/腾空/倒地此前四人共用一套。体型与身法差这么多（哪吒轻灵、牛魔王 240 血的重装），
 * 挨打反应却一模一样，是"每个人打起来都一样"的最后一块。
 * 这里按角色的 hp/speed 派生幅度：越轻越快的人被打得越夸张、翻得越多；越重的人晃得少、
 * 塌得沉。姿势词汇仍复用同一份，不需要再手写四套。 */
export function buildReactions(charId: string, v: PoseVocab, hp: number, speed: number): Record<string, Motion> {
  // 轻＝反应大：以牛魔王(240/3.8)为最重、哪吒(190/5.0)为最轻，归一到 0.8-1.35
  const light = Math.min(Math.max((speed / 5.5) * (200 / hp), 0.55), 1.3);
  const A = 0.85 + light * 0.38;   // 幅度系数
  const P = (o: Partial<Pose>): Pose => ({
    lean: 0, crouch: 0, roll: 0, squash: 1, headTilt: 0,
    armF: [0.2, 0.4], armB: [-0.2, 0.3], legF: [0.15, -0.1], legB: [-0.15, 0.1], ...o,
  });
  return {
    [`${charId}Hit`]: {
      loop: false, frames: 14,
      keys: [
        { t: 0, pose: P({ lean: -0.3 * A, crouch: 4, squash: 1 - 0.14 * A, roll: 0.12 * A, headTilt: -0.2 * A, armF: [0.9, 1.2], armB: [0.6, 1.0] }), ease: 'snap' },
        { t: 5, pose: P({ lean: -0.36 * A, crouch: 2, squash: 1 + 0.06 * A, roll: 0.18 * A, headTilt: -0.28 * A, armF: [1.0, 1.1], armB: [0.7, 0.95] }), ease: 'decel' },
        { t: 14, pose: P({ lean: -0.14 * A, squash: 1, roll: 0.04 * A, headTilt: -0.07 * A, armF: [0.5, 0.8], armB: [0.3, 0.6] }) },
      ],
    },
    [`${charId}HitAlt`]: {
      loop: false, frames: 14,
      keys: [
        { t: 0, pose: P({ lean: -0.26 * A, crouch: 10, squash: 1 - 0.12 * A, roll: -0.11 * A, headTilt: 0.18 * A, armF: [0.4, 1.4], armB: [1.1, 1.2], legF: [0.5, -0.4], legB: [-0.3, 0.2] }), ease: 'snap' },
        { t: 6, pose: P({ lean: -0.36 * A, crouch: 4, squash: 1 + 0.05 * A, roll: -0.16 * A, headTilt: 0.25 * A, armF: [1.2, 1.0], armB: [0.3, 1.3], legF: [0.2, -0.2], legB: [-0.5, 0.4] }), ease: 'decel' },
        { t: 14, pose: P({ lean: -0.15 * A, crouch: 6, squash: 1, roll: -0.05 * A, headTilt: 0.08 * A, armF: [0.6, 0.9], armB: [0.4, 0.8] }) },
      ],
    },
    // 轻的人在空中多翻半圈，重的人只翻一圈——同一套循环，转量按体重给
    [`${charId}Tumble`]: {
      loop: true, frames: Math.round(40 / light),
      keys: [0, 1, 2, 3].map(i => ({
        t: Math.round((40 / light) * (i / 3)),
        pose: P({
          lean: -0.35, roll: -(Math.PI * 2 * light) * (i / 3),
          armF: i % 2 ? [2.2, 0.5] : [1.6, 0.8], armB: i % 2 ? [-2.1, 0.6] : [-1.5, 0.9],
          legF: i % 2 ? [0.4, -1.2] : [0.9, -0.9], legB: i % 2 ? [-1.1, -0.9] : [-0.8, -0.5],
        }),
      })),
    },
    // 倒地全程 72 帧，与 DOWN_STUN 对齐：摔 → 躺 → 撑起来。
    // 没有最后那段"撑起来"，人就是从躺着瞬移到站着，玩家根本读不出倒过。
    [`${charId}Fallen`]: {
      loop: false, frames: 52,
      keys: [
        { t: 0, pose: P({ lean: -0.3, crouch: 8, roll: -0.5, squash: 1 + 0.05 * A, armF: [1.9, 0.7], armB: [-1.7, 0.8], legF: [1.0, -0.6], legB: [-0.9, -0.3] }), ease: 'accel' },
        { t: 7, pose: P({ lean: -0.25, crouch: 16, roll: -1.45, squash: 1 - 0.2 * A, armF: [2.3, 0.4], armB: [-2.1, 0.5], legF: [1.3, -0.25], legB: [-1.1, 0.05] }), ease: 'decel' },
        { t: 16, pose: P({ lean: -0.22, crouch: 18, roll: -1.5, squash: 1.02, headTilt: -0.15, armF: [2.35, 0.3], armB: [-2.15, 0.4], legF: [1.28, -0.2], legB: [-1.08, 0.1] }), ease: 'hold' },
        { t: 32, pose: P({ lean: -0.2, crouch: 18, roll: -1.48, squash: 1, headTilt: -0.18, armF: [2.3, 0.32], armB: [-2.1, 0.42], legF: [1.25, -0.18], legB: [-1.05, 0.12] }), ease: 'accel' },
        { t: 42, pose: P({ lean: 0.12, crouch: 26, roll: -0.62, armF: [1.1, 1.2], armB: [-0.9, 1.1], legF: [0.9, -0.8], legB: [-0.7, 0.4] }), ease: 'decel' },
        { t: 52, pose: P({ lean: 0.06, crouch: 10, roll: -0.12, armF: [0.5, 0.7], armB: [-0.35, 0.6], legF: [0.4, -0.3], legB: [-0.35, 0.2] }) },
      ],
    },
  };
}
