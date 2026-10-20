import type { Ease, Motion, Pose } from '../render/motion';
import type { FxEvent, FxType } from '../engine/types';

/** 十秒超必杀的编排层。
 *
 * 为什么不手写：600 帧 × 4 个角色，按每 8-10 帧一个姿势算是 240-300 个 Pose 字面量。
 * 那个量级手写既容易前后矛盾（同一段的收势姿势和下一段的起手姿势对不上），也没法在改
 * 节奏时整体调整。这里把"一段动作"抽成构件，各角色只提供自己的姿势词汇表，帧数与节拍
 * 由构件按同一套规则铺开——改总时长只要改一处比例。
 *
 * 生成是纯函数（模块加载时跑一次），不含 Math.random，引擎的确定性不受影响。 */

const P = (over: Partial<Pose>): Pose => ({
  lean: 0, crouch: 0, roll: 0, squash: 1, headTilt: 0,
  armF: [0.2, 0.4], armB: [-0.2, 0.3], legF: [0.15, -0.1], legB: [-0.15, 0.1],
  ...over,
});

export interface PhaseDef {
  /** 段名，拼进 motionId */
  id: string;
  frames: number;
  /** 这一段依次要摆到的姿势。构件把它们按帧数均分铺开 */
  poses: Partial<Pose>[];
  /** 每个姿势之间的过渡曲线；给一个就是全段统一，给数组就是逐段指定 */
  ease?: Ease | Ease[];
}

export function buildPhaseMotions(charId: string, phases: PhaseDef[]): Record<string, Motion> {
  const out: Record<string, Motion> = {};
  for (const ph of phases) {
    const n = ph.poses.length;
    const step = ph.frames / Math.max(n - 1, 1);
    out[`${charId}_${ph.id}`] = {
      loop: false,
      frames: ph.frames,
      keys: ph.poses.map((pose, i) => ({
        t: Math.round(i * step),
        pose: P(pose),
        ease: Array.isArray(ph.ease) ? (ph.ease[i] ?? 'linear') : (ph.ease ?? 'linear'),
      })),
    };
  }
  return out;
}

export const phaseSeq = (charId: string, phases: PhaseDef[]) =>
  phases.map(ph => ({ motionId: `${charId}_${ph.id}`, weight: ph.frames }));

/** 连打段的姿势词汇：前后手交替出击，每一拍都是 snap（三分之一区间内到位再定住）。
 * strikes 决定这一段打几下，越往后节拍越密由调用方通过 frames/strikes 控制。 */
export function barragePoses(
  guard: Partial<Pose>, strikeF: Partial<Pose>, strikeB: Partial<Pose>, strikes: number,
): Partial<Pose>[] {
  const out: Partial<Pose>[] = [guard];
  for (let i = 0; i < strikes; i++) out.push(i % 2 === 0 ? strikeF : strikeB);
  out.push(guard);
  return out;
}

/** 沿整段时间轴均匀铺一串特效事件。手写 60-80 条 fx 同样不现实，而且节拍要跟动作对齐。 */
export function spreadFx(
  from: number, to: number, count: number,
  make: (i: number, frame: number) => Omit<FxEvent, 'frame'>,
): FxEvent[] {
  const out: FxEvent[] = [];
  const step = (to - from) / Math.max(count - 1, 1);
  for (let i = 0; i < count; i++) {
    const frame = Math.round(from + i * step);
    out.push({ frame, ...make(i, frame) } as FxEvent);
  }
  return out;
}

/** 连打段的火花：沿判定框前沿小幅上下摆动，位置由下标决定（不用随机，逐帧重算才稳定） */
export function sparkTrack(
  from: number, to: number, count: number, colors: [string, string], x = 160, y = 90,
): FxEvent[] {
  return spreadFx(from, to, count, i => ({
    type: 'spark' as FxType,
    color: colors[i % 2],
    x: x + ((i * 7) % 24) - 12,
    y: y + ((i * 11) % 18) - 9,
  }));
}

/** 出招者朝版边持续推进用的冲量序列：接近段给大冲量，连打段每隔 interval 帧补一小步，
 * 保证被 carry 推着走的对手始终留在射程内。 */
export function driveDash(
  approach: { frame: number; vx: number }[],
  from: number, to: number, interval: number, vx: number,
): { frame: number; vx: number }[] {
  const out = [...approach];
  const used = new Set(approach.map(d => d.frame));
  for (let f = from; f <= to; f += interval) {
    if (!used.has(f)) { out.push({ frame: f, vx }); used.add(f); }
  }
  return out.sort((a, b) => a.frame - b.frame);
}
