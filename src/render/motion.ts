export interface Pose {
  lean: number;   // 躯干前倾弧度，+ 朝面向侧
  crouch: number; // 重心下移 px
  /** 整体翻转弧度（绕臀部附近的支点转整个人），+ 朝面向侧。
   * 倒地、空中翻滚、大幅旋转全靠它——此前"放倒"是 drawFighter 里对 down 状态写死的
   * -90°，既不能插值也只有一个角度。提成姿势轴之后，倒地可以「转着倒下去」，
   * 空中可以真的翻整圈。它是刚体变换，套在骨骼装配之外，因此不影响头颈接缝几何。 */
  roll: number;
  /** 挤压/拉伸：1 为常态，<1 压扁、>1 拉长；横向按 1/squash 补偿，体积守恒。
   * 命中瞬间压一下、蓄力时拉一下，是动画里最省力也最见效的一种冲击力表达。 */
  squash: number;
  /** 头部相对躯干的额外偏转弧度（叠在既有的跟随 lean 之上），+ 朝面向侧 */
  headTilt: number;
  armF: [number, number]; // 前手 [肩角, 肘角]
  armB: [number, number];
  legF: [number, number]; // 前腿 [髋角, 膝角]
  legB: [number, number];
}

/** 关键帧之间的过渡曲线。挂在**起始那一帧**上，管到下一帧为止。
 *
 * 为什么需要：原来两帧之间一律匀速插值，一整套大招 13-17 个姿势匀速连起来，读作"飘"，
 * 不读作"打"。格斗游戏的动作是有节奏的——蓄力是慢起加速，命中是瞬间到位再定住，
 * 收势是缓停。这几条曲线就是把那个节奏写出来。 */
export type Ease = 'linear' | 'accel' | 'decel' | 'snap' | 'hold';

const EASE: Record<Ease, (k: number) => number> = {
  linear: k => k,
  /** 慢起加速：蓄力、下沉、拉弓 */
  accel: k => k * k,
  /** 快起缓停：收势、落地后的稳定 */
  decel: k => 1 - (1 - k) * (1 - k),
  /** 三分之一区间内就位，其余时间定住——命中/爆发那一拍的"定格"感 */
  snap: k => { const t = Math.min(1, k * 3); return 1 - (1 - t) * (1 - t) * (1 - t); },
  /** 先按兵不动，最后两成瞬间切过去——预备与突袭之间的停顿 */
  hold: k => (k < 0.8 ? 0 : (k - 0.8) / 0.2),
};

export interface Motion {
  loop: boolean;
  frames: number;
  keys: { t: number; pose: Pose; ease?: Ease }[]; // t 为帧号，升序，首键 t=0；ease 缺省 linear
}

const lerp = (a: number, b: number, k: number) => a + (b - a) * k;

/** 两个已采样 Pose 的线性插值——Pose 全是数值字段，逐字段 lerp 就够。除了关键帧内插值，
 * 也是 motionSeq 段间接缝混合的唯一需要的原语（renderer.ts 直接拿它混合前段末帧/本段首帧）。 */
export function lerpPose(a: Pose, b: Pose, k: number): Pose {
  const pair = (x: [number, number], y: [number, number]): [number, number] =>
    [lerp(x[0], y[0], k), lerp(x[1], y[1], k)];
  return {
    lean: lerp(a.lean, b.lean, k),
    crouch: lerp(a.crouch, b.crouch, k),
    roll: lerp(a.roll, b.roll, k),
    squash: lerp(a.squash, b.squash, k),
    headTilt: lerp(a.headTilt, b.headTilt, k),
    armF: pair(a.armF, b.armF), armB: pair(a.armB, b.armB),
    legF: pair(a.legF, b.legF), legB: pair(a.legB, b.legB),
  };
}

export function samplePose(m: Motion, frame: number): Pose {
  let f = m.loop ? frame % m.frames : Math.min(frame, m.frames);
  let i = m.keys.length - 1;
  while (i > 0 && m.keys[i].t > f) i--;
  const a = m.keys[i];
  const b = m.keys[Math.min(i + 1, m.keys.length - 1)];
  if (a === b || b.t === a.t) return a.pose;
  return lerpPose(a.pose, b.pose, EASE[a.ease ?? 'linear']((f - a.t) / (b.t - a.t)));
}
