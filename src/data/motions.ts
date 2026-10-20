import type { Motion, Pose } from '../render/motion';
import { buildAssault, buildBrief, buildReactions, buildSuper, ERLANG_VOCAB, NEZHA_VOCAB, NIUMO_VOCAB, WUKONG_VOCAB, HONGHAIER_VOCAB, TIESHAN_VOCAB, BAIGU_VOCAB, HOUYI_VOCAB, LEIZHEN_VOCAB, ZHONGKUI_VOCAB, XINGTIAN_VOCAB, BAJIE_VOCAB } from './superPhases';

const P = (over: Partial<Pose>): Pose => ({
  lean: 0, crouch: 0, roll: 0, squash: 1, headTilt: 0,
  armF: [0.2, 0.4], armB: [-0.2, 0.3], legF: [0.15, -0.1], legB: [-0.15, 0.1],
  ...over,
});

export const MOTIONS: Record<string, Motion> = {
  /**
   * 胜利姿势（勝利ポーズ）。KO 之后有 120 帧收尾，此前赢的那一位就站在那儿发呆——
   * 结算页已经在用 quotes.win 说台词了，画面上却没有对应的动作。
   *
   * 不循环：末帧定住就是"摆住的那个造型"。100 帧走完，收尾还剩 20 帧留给定格。
   * 想给某个角色单独做时，在表里加 `${角色id}Victory` 即可，渲染层先查那个键。
   */
  victory: {
    loop: false, frames: 100,
    keys: [
      // 收势：刚打完，重心还沉着
      { t: 0, pose: P({ crouch: 6, lean: 0.1, armF: [0.4, 0.9], armB: [0.2, 0.7] }), ease: 'decel' },
      // 蓄：再压一下，蓄势起身
      { t: 16, pose: P({ crouch: 11, lean: 0.18, armF: [0.15, 1.05], armB: [0.05, 0.85] }), ease: 'accel' },
      // 起：前臂抡上去，身子挺开，下巴抬起
      { t: 38, pose: P({ crouch: -2, lean: -0.1, headTilt: -0.14, armF: [1.45, 0.25], armB: [-0.5, 0.3], legF: [0.12, -0.1] }), ease: 'snap' },
      // 定：略微回落坐定，这就是摆住的造型
      { t: 60, pose: P({ crouch: 0, lean: -0.05, headTilt: -0.1, armF: [1.28, 0.32], armB: [-0.42, 0.28], legF: [0.1, -0.08] }), ease: 'decel' },
      { t: 100, pose: P({ crouch: 0, lean: -0.05, headTilt: -0.1, armF: [1.28, 0.32], armB: [-0.42, 0.28], legF: [0.1, -0.08] }) },
    ],
  },
  // ── 四人各自的胜利姿势 ────────────────────────────────────────────
  // 通用那套（上面的 victory）留作兜底。四个人赢了摆同一个造型，与当初"四人大招背光
  // 除了名字全一样"是同一类问题——赢下来的那一刻是这个角色最该像他自己的时候。
  // 造型分别取自各自的兵器与性格，用的是与招式动作同一套语汇。

  // 哪吒：少年气。枪往身侧一抡，收成单手斜持，另一只手负在身后，下巴微扬
  nezhaVictory: {
    loop: false, frames: 100,
    keys: [
      { t: 0, pose: P({ crouch: 5, lean: 0.12, armF: [0.45, 0.85], armB: [0.2, 0.6] }), ease: 'decel' },
      { t: 14, pose: P({ crouch: 9, lean: 0.2, armF: [-0.5, 0.6], armB: [0.35, 0.7] }), ease: 'accel' },
      { t: 30, pose: P({ crouch: -3, lean: -0.06, headTilt: -0.1, armF: [2.3, 0.35], armB: [-0.7, 0.4] }), ease: 'snap' },
      { t: 52, pose: P({ crouch: 0, lean: -0.12, headTilt: -0.18, armF: [0.95, 0.3], armB: [-1.05, 0.25], legF: [0.16, -0.12] }), ease: 'decel' },
      { t: 100, pose: P({ crouch: 0, lean: -0.12, headTilt: -0.18, armF: [0.95, 0.3], armB: [-1.05, 0.25], legF: [0.16, -0.12] }) },
    ],
  },

  // 孙悟空：棍横搭肩上，另一手挠头，重心一沉一晃——顽劣，不庄重
  wukongVictory: {
    loop: false, frames: 100,
    keys: [
      { t: 0, pose: P({ crouch: 6, lean: 0.1, armF: [0.5, 0.8], armB: [0.15, 0.6] }), ease: 'decel' },
      { t: 18, pose: P({ crouch: 2, lean: -0.05, armF: [1.9, 0.5], armB: [-0.4, 0.4] }), ease: 'snap' },
      { t: 36, pose: P({ crouch: 4, lean: 0.06, headTilt: 0.12, armF: [1.15, 1.35], armB: [-0.3, 0.35] }), ease: 'decel' },
      { t: 58, pose: P({ crouch: 6, lean: 0.02, headTilt: -0.08, armF: [1.1, 1.3], armB: [1.25, 1.5], legF: [0.22, -0.16] }), ease: 'decel' },
      { t: 100, pose: P({ crouch: 6, lean: 0.02, headTilt: -0.08, armF: [1.1, 1.3], armB: [1.25, 1.5], legF: [0.22, -0.16] }) },
    ],
  },

  // 红孩儿：不摆造型。枪往地上一杵，另一只手抹了把脸，肩一耸——小孩打赢了大人的那种得意
  honghaierVictory: {
    loop: false, frames: 100,
    keys: [
      { t: 0, pose: P({ crouch: 10, lean: 0.14, armF: [0.5, 0.8], armB: [0.2, 0.6] }), ease: 'decel' },
      { t: 12, pose: P({ crouch: 20, lean: 0.34, armF: [1.5, 0.2], armB: [-0.3, 0.4] }), ease: 'snap' },
      { t: 30, pose: P({ crouch: 12, lean: -0.08, headTilt: 0.16, armF: [1.35, 0.15], armB: [1.1, 1.4] }), ease: 'decel' },
      { t: 54, pose: P({ crouch: 8, lean: -0.14, headTilt: 0.2, armF: [1.3, 0.12], armB: [0.3, 0.5], legF: [0.2, -0.14] }), ease: 'decel' },
      { t: 100, pose: P({ crouch: 8, lean: -0.14, headTilt: 0.2, armF: [1.3, 0.12], armB: [0.3, 0.5], legF: [0.2, -0.14] }) },
    ],
  },
  // 三昧真火：深吸一口气（整个人缩起来），然后整个上身前倾把火吐出去
  honghaierSp50: { // startup12 active8[12,20) recovery→40
    loop: false, frames: 40,
    keys: [
      { t: 0, pose: P({ crouch: 10, lean: 0.08, armF: [0.4, 0.5], armB: [-0.3, 0.5] }) },
      { t: 7, pose: P({ crouch: 30, lean: -0.36, headTilt: -0.2, armF: [-0.5, 0.7], armB: [0.45, 0.65] }) }, // 吸气缩身
      { t: 12, pose: P({ crouch: 16, lean: 0.5, headTilt: 0.24, armF: [1.9, 0.3], armB: [1.6, 0.35] }) },     // 吐火
      { t: 20, pose: P({ crouch: 12, lean: 0.62, headTilt: 0.3, armF: [2.6, 0.16], armB: [2.3, 0.2] }) },
      { t: 40, pose: P({ crouch: 8, lean: 0.1, armF: [0.4, 0.45], armB: [-0.2, 0.35] }) },
    ],
  },
  // 圣婴烈焰：先原地转一圈把火卷起来，再腾空压下去——比孙悟空那套更碎、更急
  honghaierSp100: { // startup16 active10[16,26) recovery→52
    loop: false, frames: 52,
    keys: [
      { t: 0, pose: P({ crouch: 12, lean: 0.06, armF: [0.6, 0.5], armB: [-0.5, 0.5] }) },
      { t: 7, pose: P({ crouch: 28, lean: -0.3, armF: [-0.6, 0.7], armB: [0.5, 0.7], legF: [0.65, -1.0], legB: [-0.55, -0.85] }) },
      { t: 13, pose: P({ crouch: 6, lean: -0.44, roll: 0.5, armF: [-1.0, 0.3], armB: [-0.8, 0.35], legF: [0.85, -1.35] }) }, // 卷火
      { t: 16, pose: P({ lean: -0.28, roll: 1.1, armF: [2.7, 0.25], armB: [2.5, 0.3], legF: [0.95, -1.45], legB: [-0.7, -1.1] }) },
      { t: 21, pose: P({ lean: 0.14, armF: [3.1, 0.04], armB: [2.95, 0.06], legF: [0.75, -1.2], legB: [-0.5, -0.9] }) },
      { t: 25, pose: P({ lean: 0.5, armF: [1.5, 0.05], armB: [1.4, 0.06], legF: [0.5, -0.6], legB: [-0.3, -0.3] }) },
      { t: 30, pose: P({ crouch: 26, lean: 0.6, armF: [0.8, 0.08], armB: [0.78, 0.1], legF: [0.55, -0.12], legB: [-0.45, 0.18] }) },
      { t: 40, pose: P({ crouch: 10, lean: 0.22, armF: [0.5, 0.3], armB: [-0.2, 0.3] }) },
      { t: 52, pose: P({ crouch: 8, armF: [0.3, 0.4], armB: [-0.2, 0.3], lean: 0.08 }) },
    ],
  },
  // 铁扇公主：扇子在身前一开一合，人纹丝不动——赢了也不必多说什么
  tieshanVictory: {
    loop: false, frames: 100,
    keys: [
      { t: 0, pose: P({ crouch: 4, lean: 0.06, armF: [0.5, 0.7], armB: [-0.4, 0.6] }), ease: 'decel' },
      { t: 16, pose: P({ crouch: 8, lean: -0.04, armF: [-1.4, 0.85], armB: [1.3, 0.8] }), ease: 'accel' },
      { t: 32, pose: P({ crouch: 2, lean: 0.02, headTilt: -0.12, armF: [1.6, 0.3], armB: [-1.5, 0.34] }), ease: 'snap' },
      { t: 56, pose: P({ crouch: 4, lean: 0, headTilt: -0.16, armF: [0.85, 0.55], armB: [-0.5, 0.4], legF: [0.16, -0.1] }), ease: 'decel' },
      { t: 100, pose: P({ crouch: 4, lean: 0, headTilt: -0.16, armF: [0.85, 0.55], armB: [-0.5, 0.4], legF: [0.16, -0.1] }) },
    ],
  },
  // 一扇之威：扇面后引到极限，再横着扫出去——全程不移动重心
  tieshanSp50: {
    loop: false, frames: 40,
    keys: [
      { t: 0, pose: P({ crouch: 4, lean: 0.04, armF: [0.5, 0.6], armB: [-0.4, 0.5] }) },
      { t: 7, pose: P({ crouch: 14, lean: -0.2, armF: [-1.6, 0.95], armB: [1.5, 0.9] }) },
      { t: 12, pose: P({ crouch: 6, lean: 0.16, armF: [1.9, 0.2], armB: [-1.8, 0.25] }) },
      { t: 20, pose: P({ crouch: 4, lean: 0.24, armF: [2.5, 0.12], armB: [-2.4, 0.16] }) },
      { t: 40, pose: P({ crouch: 4, lean: 0.04, armF: [0.5, 0.6], armB: [-0.4, 0.5] }) },
    ],
  },
  // 火焰山息：双臂大开，扇面立在身前，一记横扫把整片风推出去
  tieshanSp100: {
    loop: false, frames: 52,
    keys: [
      { t: 0, pose: P({ crouch: 6, lean: 0.02, armF: [0.6, 0.6], armB: [-0.5, 0.5] }) },
      { t: 8, pose: P({ crouch: 16, lean: -0.22, armF: [-1.8, 1.0], armB: [1.7, 0.95] }) },
      { t: 14, pose: P({ crouch: 8, lean: -0.1, armF: [-2.4, 0.7], armB: [2.3, 0.65] }) },
      { t: 16, pose: P({ crouch: 4, lean: 0.06, armF: [-0.4, 0.4], armB: [0.35, 0.4] }) },
      { t: 21, pose: P({ crouch: 2, lean: 0.22, armF: [2.2, 0.15], armB: [-2.1, 0.2] }) },
      { t: 26, pose: P({ crouch: 4, lean: 0.3, armF: [2.6, 0.1], armB: [-2.5, 0.14] }) },
      { t: 36, pose: P({ crouch: 8, lean: 0.1, armF: [1.0, 0.45], armB: [-0.8, 0.4] }) },
      { t: 52, pose: P({ crouch: 4, lean: 0.02, armF: [0.5, 0.6], armB: [-0.4, 0.5] }) },
    ],
  },
  // 白骨精：慢慢直起腰，从低伏变回人形——赢了才让人看清她本来的样子
  baiguVictory: {
    loop: false, frames: 100,
    keys: [
      { t: 0, pose: P({ crouch: 22, lean: 0.3, armF: [1.4, 0.2], armB: [1.2, 0.25] }), ease: 'decel' },
      { t: 22, pose: P({ crouch: 14, lean: 0.06, armF: [0.5, 0.5], armB: [-0.4, 0.45] }), ease: 'linear' },
      { t: 44, pose: P({ crouch: 2, lean: -0.1, headTilt: -0.2, armF: [-0.3, 0.6], armB: [0.25, 0.55] }), ease: 'decel' },
      { t: 62, pose: P({ crouch: 0, lean: -0.14, headTilt: -0.24, armF: [0.7, 0.35], armB: [-0.6, 0.3], legF: [0.14, -0.1] }), ease: 'decel' },
      { t: 100, pose: P({ crouch: 0, lean: -0.14, headTilt: -0.24, armF: [0.7, 0.35], armB: [-0.6, 0.3], legF: [0.14, -0.1] }) },
    ],
  },
  // 白骨爪：整个人贴到地面，一爪从下方撩上来
  baiguSp50: {
    loop: false, frames: 40,
    keys: [
      { t: 0, pose: P({ crouch: 10, lean: 0.04, armF: [0.5, 0.5], armB: [-0.4, 0.45] }) },
      { t: 7, pose: P({ crouch: 30, lean: -0.32, armF: [-1.9, 0.45], armB: [-1.7, 0.5] }) },
      { t: 12, pose: P({ crouch: 26, lean: 0.4, armF: [-0.2, 0.1], armB: [-0.1, 0.15] }) },
      { t: 20, pose: P({ crouch: 16, lean: 0.5, armF: [1.9, 0.04], armB: [1.7, 0.08] }) },
      { t: 40, pose: P({ crouch: 10, lean: 0.06, armF: [0.5, 0.5], armB: [-0.4, 0.45] }) },
    ],
  },
  // 三尸化形：原地散成三段又合回来，最后一记从高处落下
  baiguSp100: {
    loop: false, frames: 52,
    keys: [
      { t: 0, pose: P({ crouch: 12, lean: 0.02, armF: [0.6, 0.5], armB: [-0.5, 0.45] }) },
      { t: 7, pose: P({ crouch: 28, lean: -0.34, armF: [-2.0, 0.4], armB: [-1.8, 0.45] }) },
      { t: 12, pose: P({ crouch: 20, lean: -0.2, roll: -0.5, armF: [-2.4, 0.3], armB: [-2.2, 0.35] }) },
      { t: 16, pose: P({ crouch: 4, lean: -0.3, armF: [-2.2, 0.3], armB: [-2.0, 0.34], legF: [0.22, -0.9] }) },
      { t: 21, pose: P({ lean: -0.14, armF: [2.8, 0.2], armB: [2.5, 0.26], legF: [0.9, -1.35], legB: [-0.65, -1.05] }) },
      { t: 26, pose: P({ lean: 0.44, armF: [1.5, 0.05], armB: [1.3, 0.08], legF: [0.5, -0.6] }) },
      { t: 31, pose: P({ crouch: 28, lean: 0.5, armF: [0.75, 0.06], armB: [0.72, 0.1], legF: [0.5, -0.1] }) },
      { t: 42, pose: P({ crouch: 16, lean: 0.16, armF: [0.6, 0.4], armB: [-0.4, 0.35] }) },
      { t: 52, pose: P({ crouch: 10, lean: 0.02, armF: [0.5, 0.5], armB: [-0.4, 0.45] }) },
    ],
  },
  // 后羿：弓垂下去，人望着箭飞走的方向——他从不看被自己射中的东西
  houyiVictory: {
    loop: false, frames: 100,
    keys: [
      { t: 0, pose: P({ crouch: 2, lean: 0.08, armF: [2.3, 0.3], armB: [-1.6, 0.35] }), ease: 'decel' },
      { t: 20, pose: P({ crouch: 0, lean: 0.02, armF: [2.0, 0.5], armB: [-0.9, 0.4] }), ease: 'linear' },
      { t: 40, pose: P({ crouch: 0, lean: -0.06, headTilt: -0.22, armF: [0.9, 0.7], armB: [-0.5, 0.4] }), ease: 'decel' },
      { t: 60, pose: P({ crouch: 2, lean: -0.08, headTilt: -0.26, armF: [0.5, 0.75], armB: [-0.4, 0.35], legF: [0.14, -0.08] }), ease: 'decel' },
      { t: 100, pose: P({ crouch: 2, lean: -0.08, headTilt: -0.26, armF: [0.5, 0.75], armB: [-0.4, 0.35], legF: [0.14, -0.08] }) },
    ],
  },
  // 射日：拉满、屏住、放。整段几乎没有位移，全部张力在两只手臂的反向拉开上
  houyiSp50: {
    loop: false, frames: 40,
    keys: [
      { t: 0, pose: P({ crouch: 2, lean: 0.02, armF: [1.6, 0.6], armB: [-1.2, 0.45] }) },
      { t: 8, pose: P({ crouch: 8, lean: -0.14, armF: [1.95, 0.95], armB: [-2.6, 0.5] }) },
      { t: 12, pose: P({ crouch: 6, lean: -0.1, armF: [2.0, 1.0], armB: [-2.75, 0.52] }) },
      { t: 20, pose: P({ crouch: 2, lean: 0.14, armF: [2.5, 0.2], armB: [-1.3, 0.3] }) },
      { t: 40, pose: P({ crouch: 2, lean: 0.02, armF: [1.6, 0.6], armB: [-1.2, 0.45] }) },
    ],
  },
  // 九日俱落：连开九次弓，每一次都比上一次拉得更满，最后一记把弓身整个压下去
  houyiSp100: {
    loop: false, frames: 52,
    keys: [
      { t: 0, pose: P({ crouch: 2, lean: 0.02, armF: [1.6, 0.6], armB: [-1.2, 0.45] }) },
      { t: 8, pose: P({ crouch: 8, lean: -0.16, armF: [1.9, 0.9], armB: [-2.5, 0.5] }) },
      { t: 13, pose: P({ crouch: 4, lean: 0.1, armF: [2.4, 0.25], armB: [-1.4, 0.3] }) },
      { t: 16, pose: P({ crouch: 8, lean: -0.18, armF: [1.95, 0.98], armB: [-2.7, 0.52] }) },
      { t: 20, pose: P({ crouch: 2, lean: 0.16, armF: [2.55, 0.16], armB: [-1.3, 0.26] }) },
      { t: 26, pose: P({ crouch: 10, lean: -0.2, armF: [2.0, 1.05], armB: [-2.8, 0.55] }) },
      { t: 32, pose: P({ crouch: 0, lean: 0.24, armF: [2.7, 0.1], armB: [-1.5, 0.2] }) },
      { t: 42, pose: P({ crouch: 6, lean: 0.06, armF: [1.4, 0.5], armB: [-1.0, 0.4] }) },
      { t: 52, pose: P({ crouch: 2, lean: 0.02, armF: [1.6, 0.6], armB: [-1.2, 0.45] }) },
    ],
  },
  // 雷震子：双翅张到最开，然后慢慢收拢——赢了也还悬着半口气没落地
  leizhenVictory: {
    loop: false, frames: 100,
    keys: [
      { t: 0, pose: P({ crouch: 8, lean: 0.2, armF: [1.2, 0.4], armB: [1.1, 0.45] }), ease: 'decel' },
      { t: 18, pose: P({ crouch: -4, lean: -0.12, armF: [-2.5, 1.05], armB: [-2.4, 1.0] }), ease: 'accel' },
      { t: 40, pose: P({ crouch: 0, lean: -0.06, headTilt: -0.18, armF: [-1.6, 0.95], armB: [-1.5, 0.9] }), ease: 'decel' },
      { t: 64, pose: P({ crouch: 4, lean: 0, headTilt: -0.22, armF: [0.7, 0.85], armB: [0.6, 0.8], legF: [0.14, -0.1] }), ease: 'decel' },
      { t: 100, pose: P({ crouch: 4, lean: 0, headTilt: -0.22, armF: [0.7, 0.85], armB: [0.6, 0.8], legF: [0.14, -0.1] }) },
    ],
  },
  // 雷翼裂空：翅膀猛地一扇把自己拔起来，再整个人砸下去
  leizhenSp50: {
    loop: false, frames: 40,
    keys: [
      { t: 0, pose: P({ crouch: 4, lean: 0.02, armF: [0.7, 0.8], armB: [0.6, 0.75] }) },
      { t: 7, pose: P({ crouch: 20, lean: -0.3, armF: [-1.7, 1.0], armB: [-1.6, 0.95] }) },
      { t: 12, pose: P({ crouch: -6, lean: -0.2, armF: [-2.6, 1.1], armB: [-2.5, 1.05], legF: [0.3, -0.9] }) },
      { t: 20, pose: P({ crouch: 24, lean: 0.5, armF: [0.8, 0.12], armB: [0.75, 0.16], legF: [0.5, -0.12] }) },
      { t: 40, pose: P({ crouch: 6, lean: 0.06, armF: [0.7, 0.8], armB: [0.6, 0.75] }) },
    ],
  },
  // 万钧雷霆：连扇三次翅膀越飞越高，最后一记从最高处直落
  leizhenSp100: {
    loop: false, frames: 52,
    keys: [
      { t: 0, pose: P({ crouch: 6, lean: 0.02, armF: [0.7, 0.8], armB: [0.6, 0.75] }) },
      { t: 7, pose: P({ crouch: 20, lean: -0.32, armF: [-1.8, 1.0], armB: [-1.7, 0.95] }) },
      { t: 12, pose: P({ crouch: -4, lean: -0.24, armF: [-2.5, 1.08], armB: [-2.4, 1.02], legF: [0.35, -1.0] }) },
      { t: 17, pose: P({ crouch: -8, lean: -0.34, armF: [-2.7, 1.12], armB: [-2.6, 1.06], legF: [0.5, -1.3] }) },
      { t: 22, pose: P({ crouch: -10, lean: -0.4, armF: [-2.8, 1.15], armB: [-2.7, 1.1], legF: [0.7, -1.5] }) },
      { t: 27, pose: P({ lean: 0.3, armF: [1.4, 0.15], armB: [1.3, 0.2], legF: [0.6, -0.7] }) },
      { t: 32, pose: P({ crouch: 30, lean: 0.58, armF: [0.7, 0.08], armB: [0.68, 0.12], legF: [0.5, -0.1] }) },
      { t: 42, pose: P({ crouch: 12, lean: 0.2, armF: [0.8, 0.5], armB: [0.7, 0.5] }) },
      { t: 52, pose: P({ crouch: 6, lean: 0.02, armF: [0.7, 0.8], armB: [0.6, 0.75] }) },
    ],
  },
  // 钟馗：判官笔在空中一勾，像是把名字勾掉了——然后才收剑
  zhongkuiVictory: {
    loop: false, frames: 100,
    keys: [
      { t: 0, pose: P({ crouch: 10, lean: 0.24, armF: [1.6, 0.3], armB: [-1.2, 0.3] }), ease: 'decel' },
      { t: 16, pose: P({ crouch: 6, lean: 0.12, armF: [2.3, 0.16], armB: [-0.9, 0.35] }), ease: 'snap' },
      { t: 34, pose: P({ crouch: 8, lean: 0.06, headTilt: -0.14, armF: [1.2, 0.6], armB: [-0.7, 0.4] }), ease: 'decel' },
      { t: 58, pose: P({ crouch: 6, lean: 0.08, headTilt: -0.18, armF: [0.85, 0.5], armB: [-0.9, 0.38], legF: [0.16, -0.1] }), ease: 'decel' },
      { t: 100, pose: P({ crouch: 6, lean: 0.08, headTilt: -0.18, armF: [0.85, 0.5], armB: [-0.9, 0.38], legF: [0.16, -0.1] }) },
    ],
  },
  // 判官笔：笔尖在身前画一道，鬼卒从那道口子里出来
  zhongkuiSp50: {
    loop: false, frames: 40,
    keys: [
      { t: 0, pose: P({ crouch: 8, lean: 0.1, armF: [0.9, 0.5], armB: [-0.9, 0.4] }) },
      { t: 7, pose: P({ crouch: 22, lean: 0.06, armF: [1.4, 0.75], armB: [-1.7, 0.45] }) },
      { t: 12, pose: P({ crouch: 14, lean: 0.34, armF: [2.2, 0.2], armB: [-1.4, 0.3] }) },
      { t: 20, pose: P({ crouch: 10, lean: 0.44, armF: [2.6, 0.08], armB: [-1.1, 0.2] }) },
      { t: 40, pose: P({ crouch: 8, lean: 0.1, armF: [0.9, 0.5], armB: [-0.9, 0.4] }) },
    ],
  },
  // 万鬼夜行：连勾三笔，一笔比一笔沉，最后整个人压上去
  zhongkuiSp100: {
    loop: false, frames: 52,
    keys: [
      { t: 0, pose: P({ crouch: 8, lean: 0.1, armF: [0.9, 0.5], armB: [-0.9, 0.4] }) },
      { t: 8, pose: P({ crouch: 22, lean: 0.04, armF: [1.5, 0.8], armB: [-1.8, 0.45] }) },
      { t: 13, pose: P({ crouch: 12, lean: 0.36, armF: [2.3, 0.16], armB: [-1.3, 0.28] }) },
      { t: 17, pose: P({ crouch: 20, lean: 0.08, armF: [1.4, 0.7], armB: [-2.0, 0.4] }) },
      { t: 22, pose: P({ crouch: 10, lean: 0.42, armF: [2.5, 0.1], armB: [-1.2, 0.22] }) },
      { t: 27, pose: P({ crouch: 24, lean: 0.12, armF: [1.5, 0.75], armB: [-2.3, 0.38] }) },
      { t: 33, pose: P({ crouch: 8, lean: 0.56, armF: [2.7, 0.05], armB: [-1.1, 0.16] }) },
      { t: 42, pose: P({ crouch: 14, lean: 0.24, armF: [1.2, 0.4], armB: [-0.9, 0.32] }) },
      { t: 52, pose: P({ crouch: 8, lean: 0.1, armF: [0.9, 0.5], armB: [-0.9, 0.4] }) },
    ],
  },
  // 刑天：斧与盾在身前一撞，然后端平不动——没有头可抬，胜利姿势就是"还站着"
  xingtianVictory: {
    loop: false, frames: 100,
    keys: [
      { t: 0, pose: P({ crouch: 14, lean: 0.28, armF: [1.5, 0.2], armB: [-0.4, 0.3] }), ease: 'decel' },
      { t: 14, pose: P({ crouch: 8, lean: 0.1, armF: [0.6, 0.4], armB: [-0.5, 0.34] }), ease: 'snap' },
      { t: 30, pose: P({ crouch: 12, lean: 0.06, armF: [0.2, 0.34], armB: [-0.25, 0.3] }), ease: 'decel' },
      { t: 56, pose: P({ crouch: 10, lean: 0.06, armF: [0.5, 0.36], armB: [-0.45, 0.32], legF: [0.16, -0.1] }), ease: 'decel' },
      { t: 100, pose: P({ crouch: 10, lean: 0.06, armF: [0.5, 0.36], armB: [-0.45, 0.32], legF: [0.16, -0.1] }) },
    ],
  },
  // 干戚舞：盾一顶、斧一轮，整个人往前碾一步
  xingtianSp50: {
    loop: false, frames: 40,
    keys: [
      { t: 0, pose: P({ crouch: 10, lean: 0.06, armF: [0.7, 0.45], armB: [-0.45, 0.3] }) },
      { t: 7, pose: P({ crouch: 26, lean: -0.2, armF: [-1.9, 0.7], armB: [-0.4, 0.28] }) },
      { t: 12, pose: P({ crouch: 18, lean: 0.4, armF: [0.4, 0.2], armB: [-0.35, 0.26] }) },
      { t: 20, pose: P({ crouch: 12, lean: 0.5, armF: [1.9, 0.05], armB: [-0.35, 0.24] }) },
      { t: 40, pose: P({ crouch: 10, lean: 0.08, armF: [0.7, 0.45], armB: [-0.45, 0.3] }) },
    ],
  },
  // 断首不死：连轮三斧，每一斧都往前一步，最后一斧把整个上身压下去
  xingtianSp100: {
    loop: false, frames: 52,
    keys: [
      { t: 0, pose: P({ crouch: 10, lean: 0.06, armF: [0.7, 0.45], armB: [-0.45, 0.3] }) },
      { t: 8, pose: P({ crouch: 26, lean: -0.22, armF: [-2.1, 0.7], armB: [-0.4, 0.28] }) },
      { t: 13, pose: P({ crouch: 16, lean: 0.42, armF: [1.6, 0.1], armB: [-0.35, 0.26] }) },
      { t: 18, pose: P({ crouch: 24, lean: -0.14, armF: [-2.3, 0.62], armB: [-0.4, 0.28] }) },
      { t: 23, pose: P({ crouch: 14, lean: 0.48, armF: [1.8, 0.07], armB: [-0.35, 0.24] }) },
      { t: 28, pose: P({ crouch: 26, lean: -0.16, armF: [-2.5, 0.55], armB: [-0.4, 0.26] }) },
      { t: 34, pose: P({ crouch: 30, lean: 0.64, armF: [0.9, 0.05], armB: [-0.35, 0.22] }) },
      { t: 44, pose: P({ crouch: 16, lean: 0.2, armF: [0.7, 0.3], armB: [-0.4, 0.28] }) },
      { t: 52, pose: P({ crouch: 10, lean: 0.06, armF: [0.7, 0.45], armB: [-0.45, 0.3] }) },
    ],
  },
  // 猪八戒：钉耙往肩上一扛，肚子一挺，笑得整个人一晃一晃
  bajieVictory: {
    loop: false, frames: 100,
    keys: [
      { t: 0, pose: P({ crouch: 16, lean: 0.3, armF: [1.4, 0.3], armB: [1.2, 0.35] }), ease: 'decel' },
      { t: 18, pose: P({ crouch: 10, lean: -0.1, armF: [1.1, 1.3], armB: [-0.4, 0.5] }), ease: 'snap' },
      { t: 38, pose: P({ crouch: 16, lean: -0.16, headTilt: 0.14, armF: [1.05, 1.25], armB: [-0.5, 0.45] }), ease: 'decel' },
      { t: 60, pose: P({ crouch: 12, lean: -0.1, headTilt: 0.1, armF: [1.1, 1.3], armB: [-0.45, 0.48], legF: [0.18, -0.12] }), ease: 'decel' },
      { t: 100, pose: P({ crouch: 12, lean: -0.1, headTilt: 0.1, armF: [1.1, 1.3], armB: [-0.45, 0.48], legF: [0.18, -0.12] }) },
    ],
  },
  // 力劈华山：钉耙抡到头顶再整个人压下去
  bajieSp50: {
    loop: false, frames: 40,
    keys: [
      { t: 0, pose: P({ crouch: 12, lean: 0.08, armF: [0.8, 0.6], armB: [-0.7, 0.5] }) },
      { t: 7, pose: P({ crouch: 28, lean: -0.22, armF: [-1.5, 0.9], armB: [-1.3, 0.85] }) },
      { t: 12, pose: P({ crouch: 14, lean: -0.1, armF: [-2.2, 0.5], armB: [-2.0, 0.5] }) },
      { t: 20, pose: P({ crouch: 30, lean: 0.52, armF: [0.85, 0.08], armB: [0.8, 0.12] }) },
      { t: 40, pose: P({ crouch: 14, lean: 0.08, armF: [0.8, 0.6], armB: [-0.7, 0.5] }) },
    ],
  },
  // 天蓬显形：先抱住，再连摔三次，最后一记把人按进地里
  bajieSp100: {
    loop: false, frames: 52,
    keys: [
      { t: 0, pose: P({ crouch: 12, lean: 0.08, armF: [0.8, 0.6], armB: [-0.7, 0.5] }) },
      { t: 8, pose: P({ crouch: 26, lean: 0.3, armF: [-1.2, 0.95], armB: [-1.05, 0.9] }) },   // 张手抱
      { t: 13, pose: P({ crouch: 18, lean: 0.5, armF: [1.5, 0.4], armB: [1.3, 0.45] }) },      // 抱住
      { t: 18, pose: P({ crouch: 24, lean: -0.2, roll: 0.4, armF: [1.3, 0.6], armB: [1.15, 0.62] }) },
      { t: 23, pose: P({ crouch: 30, lean: 0.5, roll: -0.3, armF: [1.0, 0.2], armB: [0.9, 0.25] }) },
      { t: 28, pose: P({ crouch: 22, lean: -0.16, roll: 0.35, armF: [1.35, 0.55], armB: [1.2, 0.58] }) },
      { t: 34, pose: P({ crouch: 32, lean: 0.6, armF: [0.85, 0.06], armB: [0.8, 0.1] }) },
      { t: 44, pose: P({ crouch: 18, lean: 0.2, armF: [0.9, 0.45], armB: [-0.6, 0.4] }) },
      { t: 52, pose: P({ crouch: 12, lean: 0.08, armF: [0.8, 0.6], armB: [-0.7, 0.5] }) },
    ],
  },
  // 二郎神：不摆架子。刀收回体侧，双臂收拢，身形挺直，只把头抬起来——天眼开着
  erlangVictory: {
    loop: false, frames: 100,
    keys: [
      { t: 0, pose: P({ crouch: 6, lean: 0.14, armF: [0.5, 0.9], armB: [0.25, 0.7] }), ease: 'decel' },
      { t: 22, pose: P({ crouch: 2, lean: 0.02, armF: [0.15, 0.5], armB: [-0.15, 0.35] }), ease: 'decel' },
      { t: 46, pose: P({ crouch: -4, lean: -0.14, headTilt: -0.24, armF: [0.05, 0.28], armB: [-0.1, 0.22], legF: [0.08, -0.06], legB: [-0.08, 0.06] }), ease: 'decel' },
      { t: 100, pose: P({ crouch: -4, lean: -0.14, headTilt: -0.24, armF: [0.05, 0.28], armB: [-0.1, 0.22], legF: [0.08, -0.06], legB: [-0.08, 0.06] }) },
    ],
  },

  // 牛魔王：双臂外张、上身后仰，一记咆哮——体量最大的那一位，造型也该占最多空间
  niumoVictory: {
    loop: false, frames: 100,
    keys: [
      { t: 0, pose: P({ crouch: 10, lean: 0.3, armF: [0.4, 0.8], armB: [0.3, 0.7] }), ease: 'decel' },
      { t: 20, pose: P({ crouch: 16, lean: 0.5, armF: [0.1, 1.1], armB: [0.15, 1.0], legF: [0.5, -0.2], legB: [-0.45, 0.25] }), ease: 'accel' },
      { t: 40, pose: P({ crouch: -6, lean: -0.34, headTilt: -0.3, squash: 1.06, armF: [1.55, 1.15], armB: [-1.4, 1.05], legF: [0.3, -0.2], legB: [-0.3, 0.2] }), ease: 'snap' },
      { t: 66, pose: P({ crouch: -2, lean: -0.2, headTilt: -0.2, armF: [1.25, 1.0], armB: [-1.15, 0.92], legF: [0.24, -0.16], legB: [-0.24, 0.16] }), ease: 'decel' },
      { t: 100, pose: P({ crouch: -2, lean: -0.2, headTilt: -0.2, armF: [1.25, 1.0], armB: [-1.15, 0.92], legF: [0.24, -0.16], legB: [-0.24, 0.16] }) },
    ],
  },

  idle: {
    loop: true, frames: 72,
    keys: [
      { t: 0, pose: P({}) },
      { t: 36, pose: P({ crouch: 3, lean: 0.04, armF: [0.25, 0.5] }) },
      { t: 72, pose: P({}) },
    ],
  },
  walk: {
    loop: true, frames: 36,
    keys: [
      { t: 0, pose: P({ legF: [0.5, -0.3], legB: [-0.5, 0.5], armF: [-0.3, 0.3], armB: [0.3, 0.3] }) },
      { t: 18, pose: P({ legF: [-0.5, 0.5], legB: [0.5, -0.3], armF: [0.3, 0.3], armB: [-0.3, 0.3] }) },
      { t: 36, pose: P({ legF: [0.5, -0.3], legB: [-0.5, 0.5], armF: [-0.3, 0.3], armB: [0.3, 0.3] }) },
    ],
  },
  jump: {
    loop: false, frames: 20,
    keys: [
      { t: 0, pose: P({ crouch: 12, legF: [0.4, -0.8], legB: [-0.2, -0.6] }) },
      { t: 8, pose: P({ legF: [0.9, -1.4], legB: [-0.6, -1.0], armF: [1.2, 0.4], armB: [-1.0, 0.4], lean: 0.15 }) },
      { t: 20, pose: P({ legF: [0.5, -0.9], legB: [-0.3, -0.7] }) },
    ],
  },
  hit: {
    loop: false, frames: 14,
    keys: [
      { t: 0, pose: P({ lean: -0.35, crouch: 4, squash: 0.86, roll: 0.14, headTilt: -0.22, armF: [0.9, 1.2], armB: [0.6, 1.0] }), ease: 'snap' },
      { t: 5, pose: P({ lean: -0.4, crouch: 2, squash: 1.06, roll: 0.2, headTilt: -0.3, armF: [1.0, 1.1], armB: [0.7, 0.95] }), ease: 'decel' },
      { t: 14, pose: P({ lean: -0.15, squash: 1, roll: 0.05, headTilt: -0.08, armF: [0.5, 0.8], armB: [0.3, 0.6] }) },
    ],
  },
  block: {
    loop: false, frames: 8,
    keys: [
      { t: 0, pose: P({ armF: [0.9, 1.6], armB: [1.0, 1.8], lean: -0.08, crouch: 6 }) },
      { t: 8, pose: P({ armF: [1.0, 1.7], armB: [1.1, 1.9], lean: -0.1, crouch: 8 }) },
    ],
  },
  crouch: { // 下蹲：深屈膝、重心下沉、双手收在身前
    loop: false, frames: 8,
    keys: [
      { t: 0, pose: P({ crouch: 16, legF: [0.5, -0.9], legB: [-0.5, 0.9], armF: [0.7, 1.3], armB: [0.6, 1.2], lean: 0.05 }) },
      { t: 8, pose: P({ crouch: 22, legF: [0.6, -1.0], legB: [-0.6, 1.0], armF: [0.8, 1.4], armB: [0.7, 1.3], lean: 0.06 }) },
    ],
  },
  sweep: { // 下段扫腿（n2）：沉腰、前腿贴地横扫。
    // 这一招要**看得出是下段**——玩家得能从画面上分辨该蹲防还是站防，
    // 否则上下段就成了背板而不是读招。屈膝深度取 crouch 动作的量级（16-22），
    // 前腿几乎压平（legF 第一节 1.3 接近水平），判定框也贴着地面。
    loop: false, frames: 15,
    keys: [
      { t: 0, pose: P({ crouch: 8, lean: 0.1, armF: [0.3, 0.5], legF: [0.3, -0.3] }) },
      { t: 4, pose: P({ crouch: 20, lean: 0.28, armF: [0.9, 0.9], armB: [-0.5, 0.6], legF: [1.3, -0.15], legB: [-0.5, 0.9] }), ease: 'snap' },
      { t: 7, pose: P({ crouch: 22, lean: 0.3, armF: [1.0, 1.0], legF: [1.35, -0.1], legB: [-0.55, 0.95] }) },
      { t: 15, pose: P({ crouch: 6, lean: 0.08, armF: [0.4, 0.5], legF: [0.25, -0.2] }), ease: 'decel' },
    ],
  },
  thrust: { // 直刺（n1/n2）：前手直线捅出
    loop: false, frames: 15,
    keys: [
      { t: 0, pose: P({ armF: [-0.4, 0.6], lean: 0.05 }) },
      { t: 4, pose: P({ armF: [1.5, 0.05], lean: 0.3, legF: [0.35, -0.2], legB: [-0.4, 0.3] }) },
      { t: 7, pose: P({ armF: [1.55, 0], lean: 0.32 }) },
      { t: 15, pose: P({ armF: [0.3, 0.4], lean: 0.05 }) },
    ],
  },
  upthrust: { // 挑空（n3）：由下向上撩
    loop: false, frames: 21,
    keys: [
      { t: 0, pose: P({ crouch: 10, armF: [-0.8, 0.8], lean: 0.1 }) },
      { t: 6, pose: P({ armF: [2.4, 0.1], lean: -0.15, crouch: 0, legF: [0.5, -0.5] }) },
      { t: 12, pose: P({ armF: [2.6, 0], lean: -0.2 }) },
      { t: 21, pose: P({ armF: [0.4, 0.4] }) },
    ],
  },
  cast: { // 施法（远程技能）：单手前推
    loop: false, frames: 24,
    keys: [
      { t: 0, pose: P({ armF: [-0.6, 1.0], armB: [-0.4, 0.8], crouch: 6 }) },
      { t: 9, pose: P({ armF: [1.4, 0.05], armB: [0.8, 0.3], lean: 0.2, crouch: 0 }) },
      { t: 16, pose: P({ armF: [1.45, 0], lean: 0.22 }) },
      { t: 24, pose: P({ armF: [0.3, 0.5] }) },
    ],
  },
  rush: { // 突进技：前倾冲刺
    loop: false, frames: 26,
    keys: [
      { t: 0, pose: P({ lean: 0.1, crouch: 8, armF: [-0.6, 0.9], armB: [0.5, 0.6] }) },
      { t: 8, pose: P({ lean: 0.55, crouch: 4, armF: [1.1, 0.2], armB: [-0.9, 0.8], legF: [0.8, -0.5], legB: [-0.7, 0.7] }) },
      { t: 18, pose: P({ lean: 0.5, armF: [1.3, 0.1] }) },
      { t: 26, pose: P({ lean: 0.05 }) },
    ],
  },
  slam: { // 双臂过顶砸（重技能/奥义）
    loop: false, frames: 32,
    keys: [
      { t: 0, pose: P({ armF: [2.9, 0.2], armB: [2.9, 0.2], lean: -0.2, crouch: 0 }) },
      { t: 12, pose: P({ armF: [3.1, 0], armB: [3.1, 0], lean: -0.3 }) },
      { t: 16, pose: P({ armF: [0.9, 0.1], armB: [0.9, 0.1], lean: 0.45, crouch: 10 }) },
      { t: 32, pose: P({ lean: 0.1 }) },
    ],
  },
  superPose: { // 超必杀起手：张开双臂蓄力 → 爆发前推（Task 28 之前四角色共用的基准动作，
    // 现在没有角色再引用它——保留在库里只是不动 tests/motion.test.ts 的既有必备条目断言）
    loop: false, frames: 50,
    keys: [
      { t: 0, pose: P({ armF: [1.8, 1.2], armB: [-1.8, 1.2], lean: -0.15, crouch: 8 }) },
      { t: 14, pose: P({ armF: [2.6, 0.6], armB: [-2.6, 0.6], lean: -0.25, crouch: 12 }) },
      { t: 20, pose: P({ armF: [1.5, 0], armB: [1.3, 0.1], lean: 0.4, crouch: 0 }) },
      { t: 34, pose: P({ armF: [1.55, 0], armB: [1.35, 0.05], lean: 0.42 }) },
      { t: 50, pose: P({ armF: [0.3, 0.4], armB: [-0.2, 0.3], lean: 0.05 }) },
    ],
  },

  // ---- Task 30：四角色 sp100/sp50 各自专属动作 ----
  // motion.frames 各自等于该角色该招式的 startup+active+recovery（motionFor 按这个总帧数
  // 拉伸播放），所以下面每条关键帧的 t 直接就是 stateFrame，不需要再心算拉伸比例——
  // 爆发/命中关键帧的 t 落在 [startup, startup+active) 区间内，判定窗口不用跟着挪。

  // 哪吒·三头六臂：快、多段、张扬。重心低伏蓄力后猛地拔起，双臂在 active 窗口内连续
  // 多次交替前挥（六臂快速轮击的错觉），收势带一点甩尾才归位
  nezhaSp100: { // startup16 active10[16,26) recovery→50
    loop: false, frames: 50,
    keys: [
      { t: 0, pose: P({ crouch: 10, lean: -0.15, armF: [1.6, 1.0], armB: [-1.6, 1.0] }) },
      { t: 8, pose: P({ crouch: 18, lean: -0.3, armF: [2.4, 0.7], armB: [-2.4, 0.7] }) }, // 深蓄
      { t: 14, pose: P({ crouch: 6, lean: -0.1, armF: [0.4, 0.3], armB: [-0.4, 0.3], legF: [0.3, -0.2], legB: [-0.3, 0.3] }) }, // 拔起
      { t: 16, pose: P({ crouch: 0, lean: 0.35, armF: [1.7, 0.1], armB: [-0.3, 0.4], legF: [0.5, -0.3], legB: [-0.4, 0.4] }) }, // 挥 1
      { t: 19, pose: P({ lean: 0.3, armF: [0.2, 0.5], armB: [1.75, 0.05], legF: [0.5, -0.3], legB: [-0.4, 0.4] }) }, // 挥 2（换臂）
      { t: 22, pose: P({ lean: 0.4, armF: [1.8, 0], armB: [0.3, 0.4], legF: [0.5, -0.3], legB: [-0.4, 0.4] }) }, // 挥 3
      { t: 26, pose: P({ lean: 0.48, armF: [1.6, -0.1], armB: [1.6, -0.1], legF: [0.5, -0.3], legB: [-0.4, 0.4] }) }, // 命中：六臂齐出
      { t: 34, pose: P({ crouch: 4, lean: 0.2, armF: [0.7, 0.4], armB: [-0.3, 0.3] }) },
      { t: 50, pose: P({ armF: [0.3, 0.4], armB: [-0.2, 0.3], lean: 0.05 }) },
    ],
  },
  // 孙悟空·大圣降临：抡棍过顶大回环，起跳感，落地砸。蓄力时压低屈膝像要起跳，
  // active 窗口内棍从身后甩到头顶再往前劈，命中即落地砸出重心骤降
  wukongSp100: { // startup16 active10[16,26) recovery→52
    loop: false, frames: 52,
    keys: [
      { t: 0, pose: P({ crouch: 8, lean: -0.1, armF: [0.6, 0.5], armB: [-0.5, 0.5], legF: [0.3, -0.5], legB: [-0.2, -0.4] }) },
      { t: 8, pose: P({ crouch: 20, lean: -0.25, armF: [-0.3, 0.6], armB: [0.4, 0.6], legF: [0.6, -1.0], legB: [-0.5, -0.8] }) }, // 深蹲蓄势
      { t: 14, pose: P({ crouch: 0, lean: -0.4, armF: [-0.9, 0.3], armB: [-0.7, 0.3], legF: [0.8, -1.3], legB: [-0.7, -1.1] }) }, // 起跳
      { t: 16, pose: P({ lean: -0.3, armF: [2.6, 0.3], armB: [2.5, 0.3], legF: [0.9, -1.4], legB: [-0.6, -1.0] }) }, // 棍抡过顶
      { t: 20, pose: P({ lean: 0.1, armF: [3.05, 0.05], armB: [3.0, 0.05], legF: [0.7, -1.2], legB: [-0.5, -0.9] }) }, // 顶点
      { t: 24, pose: P({ lean: 0.4, armF: [1.6, 0.05], armB: [1.55, 0.05], legF: [0.5, -0.6], legB: [-0.3, -0.3] }) }, // 下劈
      { t: 28, pose: P({ crouch: 14, lean: 0.5, armF: [0.85, 0.1], armB: [0.85, 0.1], legF: [0.5, -0.15], legB: [-0.4, 0.15] }) }, // 落地砸
      { t: 38, pose: P({ crouch: 6, lean: 0.2, armF: [0.5, 0.3], armB: [-0.2, 0.3] }) },
      { t: 52, pose: P({ armF: [0.3, 0.4], armB: [-0.2, 0.3], lean: 0.05 }) },
    ],
  },
  // 二郎神·天眼灭世：先定身聚力（双手抬到额前做出"天眼"手势，蓄力阶段几乎静止），
  // 再一次性单点前刺——克制而锐利，不铺张，收势也干净利落
  erlangSp100: { // startup18 active12[18,30) recovery→56
    loop: false, frames: 56,
    keys: [
      { t: 0, pose: P({ crouch: 4, lean: -0.05, armF: [0.3, 0.5], armB: [-0.3, 0.5] }) },
      { t: 9, pose: P({ crouch: 6, lean: -0.05, armF: [2.2, 0.9], armB: [-2.2, 0.9] }) }, // 双手抬至额前
      { t: 18, pose: P({ crouch: 4, lean: -0.02, armF: [2.5, 0.75], armB: [-2.3, 0.8] }) }, // 定身聚力，几乎静止
      { t: 22, pose: P({ crouch: 0, lean: 0.15, armF: [1.5, 0.02], armB: [-0.1, 0.4] }) }, // 单点前刺
      { t: 26, pose: P({ lean: 0.18, armF: [1.55, 0], armB: [-0.05, 0.35] }) }, // 刺穿保持
      { t: 30, pose: P({ lean: 0.15, armF: [1.5, 0], armB: [0, 0.35] }) },
      { t: 40, pose: P({ crouch: 2, lean: 0.08, armF: [0.7, 0.3], armB: [-0.2, 0.3] }) },
      { t: 56, pose: P({ armF: [0.3, 0.4], armB: [-0.2, 0.3], lean: 0.02 }) },
    ],
  },
  // 牛魔王·真身巨牛：沉重、蓄势长、爆发短。startup 是四人里最长的一档，对应缓慢压低、
  // 低头顶角的长蓄势；active 窗口内骤然前冲命中；recovery 不是干脆收手，是带着冲撞
  // 惯性一步步踉跄着停下
  niumoSp100: { // startup18 active12[18,30) recovery→60
    loop: false, frames: 60,
    keys: [
      { t: 0, pose: P({ crouch: 6, lean: 0.05 }) },
      { t: 10, pose: P({ crouch: 20, lean: -0.3, armF: [1.0, 0.7], armB: [-0.8, 0.7], legF: [0.4, -0.7], legB: [-0.4, 0.5] }) }, // 缓慢压低
      { t: 18, pose: P({ crouch: 26, lean: -0.5, armF: [1.3, 0.75], armB: [-1.1, 0.75], legF: [0.7, -1.0], legB: [-0.6, 0.8] }) }, // 低头顶角蓄满
      { t: 22, pose: P({ crouch: 6, lean: 0.55, armF: [0.2, 0.3], armB: [0.2, 0.3], legF: [0.9, -0.3], legB: [-0.8, 0.5] }) }, // 骤然前冲
      { t: 26, pose: P({ crouch: 2, lean: 0.6, armF: [0.1, 0.2], armB: [0.1, 0.2], legF: [1.0, -0.2], legB: [-0.9, 0.4] }) }, // 命中顶点
      { t: 30, pose: P({ crouch: 4, lean: 0.5, armF: [0.4, 0.3], armB: [0.3, 0.3], legF: [0.7, -0.2], legB: [-0.6, 0.5] }) },
      { t: 44, pose: P({ crouch: 8, lean: 0.25, armF: [0.5, 0.4], armB: [-0.1, 0.35] }) }, // 惯性踉跄
      { t: 60, pose: P({ armF: [0.3, 0.4], armB: [-0.2, 0.3], lean: 0.05 }) },
    ],
  },

  // sp50（奥义）：延续同一角色的动作意象，但更短更简省，与 sp100 拉开分量差
  nezhaSp50: { // startup12 active7[12,19) recovery→39
    loop: false, frames: 39,
    keys: [
      { t: 0, pose: P({ crouch: 8, lean: -0.15, armF: [1.6, 1.0], armB: [-1.6, 1.0] }) },
      { t: 7, pose: P({ crouch: 14, lean: -0.25, armF: [2.2, 0.7], armB: [-2.2, 0.7] }) },
      { t: 12, pose: P({ crouch: 0, lean: 0.35, armF: [1.7, 0.1], armB: [-0.2, 0.4] }) }, // 挥 1
      { t: 16, pose: P({ lean: 0.4, armF: [0.3, 0.5], armB: [1.7, 0.05] }) }, // 挥 2
      { t: 19, pose: P({ lean: 0.42, armF: [1.55, 0], armB: [1.35, 0.05] }) },
      { t: 39, pose: P({ armF: [0.3, 0.4], armB: [-0.2, 0.3], lean: 0.05 }) },
    ],
  },
  wukongSp50: { // startup12 active8[12,20) recovery→40
    loop: false, frames: 40,
    keys: [
      { t: 0, pose: P({ crouch: 6, lean: -0.1, armF: [0.4, 0.5], armB: [-0.3, 0.5] }) },
      { t: 6, pose: P({ crouch: 16, lean: -0.3, armF: [-0.4, 0.6], armB: [0.3, 0.6] }) },
      { t: 12, pose: P({ lean: -0.2, armF: [2.8, 0.2], armB: [2.7, 0.2] }) }, // 棍直指苍天
      { t: 16, pose: P({ lean: 0.15, armF: [3.05, 0.05], armB: [3.0, 0.05] }) },
      { t: 20, pose: P({ crouch: 10, lean: 0.4, armF: [0.9, 0.1], armB: [0.9, 0.1] }) }, // 下砸
      { t: 40, pose: P({ armF: [0.3, 0.4], armB: [-0.2, 0.3], lean: 0.05 }) },
    ],
  },
  erlangSp50: { // startup13 active7[13,20) recovery→42
    loop: false, frames: 42,
    keys: [
      { t: 0, pose: P({ crouch: 4, lean: -0.05, armF: [0.3, 0.5], armB: [-0.3, 0.5] }) },
      { t: 7, pose: P({ crouch: 10, lean: -0.2, armF: [-0.3, 0.6], armB: [0.3, 0.6] }) }, // 剑势后引
      { t: 13, pose: P({ lean: -0.15, armF: [2.2, 0.1], armB: [0.4, 0.3] }) }, // 纵起斜劈
      { t: 17, pose: P({ lean: 0.25, armF: [1.3, 0], armB: [0.2, 0.3] }) },
      { t: 20, pose: P({ lean: 0.3, armF: [1.1, 0], armB: [0.15, 0.3] }) },
      { t: 42, pose: P({ armF: [0.3, 0.4], armB: [-0.2, 0.3], lean: 0.05 }) },
    ],
  },
  niumoSp50: { // startup14 active8[14,22) recovery→46
    loop: false, frames: 46,
    keys: [
      { t: 0, pose: P({ crouch: 6, lean: 0.05, armF: [0.4, 0.5], armB: [-0.3, 0.5] }) },
      { t: 8, pose: P({ crouch: 16, lean: -0.2, armF: [1.0, 0.8], armB: [-0.9, 0.8] }) }, // 芭蕉扇后引
      { t: 14, pose: P({ crouch: 8, lean: 0.3, armF: [1.6, 0.2], armB: [1.5, 0.2] }) }, // 双臂齐推
      { t: 18, pose: P({ crouch: 4, lean: 0.4, armF: [1.5, 0.05], armB: [1.45, 0.05] }) }, // 风暴延续
      { t: 22, pose: P({ crouch: 6, lean: 0.35, armF: [1.4, 0.1], armB: [1.35, 0.1] }) },
      { t: 46, pose: P({ armF: [0.3, 0.4], armB: [-0.2, 0.3], lean: 0.05 }) },
    ],
  },

  // ---- Task 37：四人 sp100 拆成 4 段 motionSeq 编排后新增的分段专属动作。復用得上的段
  // （突进→rush、挑空→upthrust、跃起→jump、落地砸→slam、蓄力→crouch、冲锋→rush、光束→cast）
  // 直接引用库里已有的条目，不重复定义；这里只补库里没有的形态。lean/crouch/legF[0]/legB[0]
  // 的取值都卡在现有motion已实测过的安全范围内（renderer.test.ts 的头/腰接缝扫描测试覆盖
  // MOTIONS 全表，新条目也逃不掉这项回归）。

  // 哪吒·连刺：承接突进的前倾，双臂快速交替前戳，读出"多段连刺"而不是一次长突刺
  nezhaFlurry: {
    loop: false, frames: 24,
    keys: [
      { t: 0, pose: P({ lean: 0.3, armF: [1.6, 0.1], armB: [-0.3, 0.4], legF: [0.4, -0.2], legB: [-0.3, 0.3] }) }, // 挥 1（承接突进）
      { t: 6, pose: P({ lean: 0.28, armF: [0.2, 0.5], armB: [1.7, 0.05], legF: [0.4, -0.2], legB: [-0.3, 0.3] }) }, // 挥 2 换臂
      { t: 12, pose: P({ lean: 0.35, armF: [1.75, 0], armB: [0.3, 0.4], legF: [0.45, -0.25], legB: [-0.35, 0.35] }) }, // 挥 3
      { t: 18, pose: P({ lean: 0.3, armF: [0.25, 0.5], armB: [1.7, 0], legF: [0.45, -0.25], legB: [-0.35, 0.35] }) }, // 挥 4 换臂
      { t: 24, pose: P({ lean: 0.4, armF: [1.6, -0.1], armB: [1.6, -0.1], legF: [0.5, -0.3], legB: [-0.4, 0.4] }) }, // 收：双臂齐出，过渡到挑空
    ],
  },
  // 哪吒·六臂爆发：终结姿态，双臂大幅展开到近乎水平，读出"六臂齐张"的爆发瞬间
  nezhaSixArm: {
    loop: false, frames: 16,
    keys: [
      { t: 0, pose: P({ lean: 0.15, crouch: 2, armF: [1.4, 0.2], armB: [-1.4, 0.2], legF: [0.3, -0.2], legB: [-0.3, 0.3] }) }, // 承接挑空落势
      { t: 5, pose: P({ lean: 0.05, crouch: 0, armF: [2.2, 0.5], armB: [-2.2, 0.5], legF: [0.4, -0.2], legB: [-0.4, 0.3] }) }, // 六臂展开
      { t: 9, pose: P({ lean: 0, armF: [2.6, 0.7], armB: [-2.6, 0.7], legF: [0.45, -0.25], legB: [-0.45, 0.35] }) }, // 极张，爆发点
      { t: 16, pose: P({ lean: 0.2, crouch: 3, armF: [0.8, 0.4], armB: [-0.6, 0.4], legF: [0.3, -0.15], legB: [-0.25, 0.25] }) }, // 归位
    ],
  },
  // 孙悟空·空中横扫：承接跃起的滞空腿型不变，棍从身后横扫到身前另一侧
  wukongAerialSweep: {
    loop: false, frames: 24,
    keys: [
      { t: 0, pose: P({ lean: -0.2, armF: [2.6, 0.2], armB: [-1.6, 0.3], legF: [0.8, -1.3], legB: [-0.6, -1.0] }) }, // 承接跃起，棍横置身后
      { t: 8, pose: P({ lean: 0.05, armF: [0.6, 0.1], armB: [-2.5, 0.3], legF: [0.85, -1.35], legB: [-0.55, -1.0] }) }, // 横扫过中线
      { t: 16, pose: P({ lean: 0.3, armF: [-1.5, 0.1], armB: [1.6, 0.2], legF: [0.75, -1.25], legB: [-0.5, -0.9] }) }, // 扫至另一侧
      { t: 24, pose: P({ lean: 0.4, armF: [-0.2, 0.3], armB: [2.8, 0.1], legF: [0.6, -1.0], legB: [-0.4, -0.7] }) }, // 收势下沉，过渡到落地
    ],
  },
  // 孙悟空·棍旋收势：承接落地砸的低伏，棍从一侧扬起旋过头顶收到另一侧，最后收棍站定
  wukongStaffSpin: {
    loop: false, frames: 18,
    keys: [
      { t: 0, pose: P({ crouch: 10, lean: 0.35, armF: [0.7, 0.2], armB: [0.7, 0.2], legF: [0.5, -0.15], legB: [-0.4, 0.15] }) }, // 承接落地砸
      { t: 6, pose: P({ crouch: 4, lean: 0.1, armF: [2.2, 0.3], armB: [-1.2, 0.4], legF: [0.4, -0.1], legB: [-0.3, 0.2] }) }, // 棍上扬旋起
      { t: 12, pose: P({ crouch: 0, lean: -0.1, armF: [-0.8, 0.3], armB: [1.5, 0.2], legF: [0.3, -0.05], legB: [-0.2, 0.15] }) }, // 旋至另一侧
      { t: 18, pose: P({ crouch: 2, lean: 0.05, armF: [0.35, 0.4], armB: [-0.2, 0.3], legF: [0.2, -0.1], legB: [-0.15, 0.1] }) }, // 收棍归位
    ],
  },
  // 二郎神·结印：双手抬至额前定身聚力（照搬旧 erlangSp100 的开局段，拆成独立动作单独复用）
  erlangSeal: {
    loop: false, frames: 18,
    keys: [
      { t: 0, pose: P({ crouch: 4, lean: -0.05, armF: [0.3, 0.5], armB: [-0.3, 0.5] }) },
      { t: 9, pose: P({ crouch: 6, lean: -0.05, armF: [2.2, 0.9], armB: [-2.2, 0.9] }) }, // 双手抬至额前
      { t: 18, pose: P({ crouch: 4, lean: -0.02, armF: [2.5, 0.75], armB: [-2.3, 0.8] }) }, // 定身聚力
    ],
  },
  // 二郎神·天眼开：双手从额前下引展开，露出"天眼"，过渡到光束蓄势
  erlangEyeOpen: {
    loop: false, frames: 8,
    keys: [
      { t: 0, pose: P({ crouch: 4, lean: -0.02, armF: [2.5, 0.75], armB: [-2.3, 0.8] }) }, // 承接结印
      { t: 4, pose: P({ crouch: 2, lean: -0.15, armF: [1.6, 0.3], armB: [-1.6, 0.3] }) }, // 双手下引，天眼睁开
      { t: 8, pose: P({ crouch: 0, lean: 0.05, armF: [1.5, 0.05], armB: [-0.2, 0.4] }) }, // 过渡到光束蓄势
    ],
  },
  // 二郎神·收势：光束扫射后引臂归位，克制收尾，呼应雷劈的干脆
  erlangFinish: {
    loop: false, frames: 14,
    keys: [
      { t: 0, pose: P({ lean: 0.15, armF: [1.5, 0], armB: [0, 0.35] }) }, // 承接光束
      { t: 6, pose: P({ lean: 0.05, armF: [0.9, 0.3], armB: [-0.6, 0.4] }) }, // 引臂归位
      { t: 14, pose: P({ lean: 0.02, armF: [0.3, 0.4], armB: [-0.2, 0.3] }) }, // 收势站定
    ],
  },
  // 牛魔王·顶角：冲锋末端把重心压到最低，随即整个上身向后上方甩起挑飞对手
  // ——冲锋段是平推的前倾，这一段必须是竖直的上挑，两段才读得出是两个动作
  niumoGore: {
    loop: false, frames: 10,
    keys: [
      { t: 0, pose: P({ crouch: 16, lean: 0.7, armF: [0.2, 0.2], armB: [0.2, 0.2], legF: [0.9, -0.4], legB: [-0.8, 0.5] }) }, // 蓄到最低，角尖贴地
      { t: 3, pose: P({ crouch: 2, lean: -0.42, armF: [1.5, 1.1], armB: [-1.3, 1.0], legF: [0.5, -0.9], legB: [-0.5, 0.2] }) }, // 上身甩起，双臂外张，把人挑上天
      { t: 10, pose: P({ crouch: 0, lean: -0.22, armF: [1.1, 0.9], armB: [-0.9, 0.8], legF: [0.3, -0.4], legB: [-0.3, 0.2] }) }, // 挑势顶点滞留
    ],
  },
  // 牛魔王·落地震：从顶角的仰身高位整个砸回地面，再缓缓站定
  niumoLandShock: {
    loop: false, frames: 20,
    keys: [
      { t: 0, pose: P({ crouch: 0, lean: -0.2, armF: [1.0, 0.9], armB: [-0.8, 0.8], legF: [0.3, -0.4], legB: [-0.3, 0.2] }) }, // 承接顶角高位
      { t: 5, pose: P({ crouch: 20, lean: 0.3, armF: [0.5, 1.0], armB: [0.4, 1.0], legF: [0.8, -0.1], legB: [-0.8, 0.3] }) }, // 双拳砸地，震波起
      { t: 11, pose: P({ crouch: 12, lean: 0.15, armF: [0.6, 0.5], armB: [-0.2, 0.4], legF: [0.5, -0.15], legB: [-0.5, 0.35] }) }, // 反弹
      { t: 20, pose: P({ crouch: 6, lean: 0.05, armF: [0.3, 0.4], armB: [-0.2, 0.3], legF: [0.3, -0.1], legB: [-0.3, 0.2] }) }, // 站定
    ],
  }
};

// 十秒超必杀的十五段编排由 superPhases.ts 按同一套骨架生成后并入——600 帧 × 4 人
// 需要 240+ 个姿势，手写既容易前后矛盾也没法整体调节奏。生成是模块加载时的纯函数，
// 不含 Math.random，引擎的确定性不受影响。
for (const [id, v, hp, speed] of [
  ['nezha', NEZHA_VOCAB, 190, 5], ['wukong', WUKONG_VOCAB, 200, 5.5],
  ['erlang', ERLANG_VOCAB, 180, 4.6], ['niumo', NIUMO_VOCAB, 240, 3.8],
  // 红孩儿：全场最轻最快，被打飞的幅度也就最大（buildReactions 按体重/身法派生）
  ['honghaier', HONGHAIER_VOCAB, 180, 5.9],
  ['tieshan', TIESHAN_VOCAB, 195, 4.8],
  ['baigu', BAIGU_VOCAB, 185, 5.2],
  ['houyi', HOUYI_VOCAB, 185, 4.4],
  ['leizhen', LEIZHEN_VOCAB, 190, 5.0],
  ['zhongkui', ZHONGKUI_VOCAB, 205, 4.5],
  ['xingtian', XINGTIAN_VOCAB, 210, 4.0],
  ['bajie', BAJIE_VOCAB, 210, 4.2],
] as const) {
  Object.assign(MOTIONS, buildSuper(id, v).motions);
  // 奥义走另一套九段骨架（长蓄力 + 少数几下极重的技），姿势词汇复用同一份——
  // 同一个角色的身法本来就该是同一套，两档的区别在节奏形态而不是换个人打
  Object.assign(MOTIONS, buildAssault(id, v).motions);
  // 短演出（打不死人时用）：同一份姿势词汇，砍掉中段铺陈
  Object.assign(MOTIONS, buildBrief(id, v).motions);
  // 各角色专属的受击反应：幅度按体重/身法派生，轻的人被打得更夸张、空中翻得更多
  Object.assign(MOTIONS, buildReactions(id, v, hp, speed));
}

// 受击/倒地反应。原来 hitstun 和 down 共用一个 14 帧的 hit，连打里 stateFrame 涨到几百，
// 姿势钳在末帧不动——"对方一直一个动作"就是这么来的。
Object.assign(MOTIONS, {
  // 跑：比走幅度大得多的大步流星，身体明显前倾
  run: {
    loop: true, frames: 24,
    keys: [
      { t: 0, pose: P({ lean: 0.34, crouch: 4, legF: [0.95, -0.7], legB: [-0.8, 0.85], armF: [-0.6, 0.7], armB: [0.75, 0.6] }) },
      { t: 12, pose: P({ lean: 0.38, crouch: 2, legF: [-0.8, 0.9], legB: [0.95, -0.65], armF: [0.75, 0.6], armB: [-0.6, 0.7] }) },
      { t: 24, pose: P({ lean: 0.34, crouch: 4, legF: [0.95, -0.7], legB: [-0.8, 0.85], armF: [-0.6, 0.7], armB: [0.75, 0.6] }) },
    ],
  },
  // 后跳：团身向后飘
  backstep: {
    loop: false, frames: 24,
    keys: [
      { t: 0, pose: P({ lean: -0.35, crouch: 12, legF: [0.7, -1.0], legB: [-0.5, -0.7], armF: [-0.5, 0.9], armB: [-0.35, 0.8] }), ease: 'snap' as const },
      { t: 10, pose: P({ lean: -0.5, crouch: 0, roll: -0.22, legF: [0.95, -1.35], legB: [-0.7, -1.0], armF: [-0.9, 1.1], armB: [-0.7, 1.0] }), ease: 'decel' as const },
      { t: 24, pose: P({ lean: -0.2, crouch: 8, legF: [0.5, -0.8], legB: [-0.35, -0.5], armF: [-0.3, 0.7], armB: [-0.2, 0.6] }) },
    ],
  },
  // 紧急回避：整个人低伏着滚过去，roll 轴转一整圈
  roll: {
    loop: false, frames: 30,
    keys: [
      { t: 0, pose: P({ lean: 0.5, crouch: 18, legF: [0.9, -0.9], legB: [-0.7, 0.6], armF: [0.6, 1.2], armB: [0.5, 1.1] }), ease: 'accel' as const },
      { t: 8, pose: P({ lean: 0.6, crouch: 30, roll: -2.1, squash: 0.9, legF: [1.2, -1.4], legB: [-1.0, -0.6], armF: [1.0, 1.5], armB: [0.9, 1.4] }) },
      { t: 18, pose: P({ lean: 0.6, crouch: 30, roll: -5.0, squash: 0.92, legF: [1.1, -1.3], legB: [-0.9, -0.5], armF: [0.9, 1.45], armB: [0.8, 1.35] }), ease: 'decel' as const },
      { t: 30, pose: P({ lean: 0.2, crouch: 10, roll: -6.283, legF: [0.5, -0.5], legB: [-0.4, 0.3], armF: [0.4, 0.8], armB: [0.3, 0.7] }) },
    ],
  },
  // 跳跃普攻：身体在空中团起来、武器向斜下方压出去，落地即收
  airStrike: {
    loop: false, frames: 27,
    keys: [
      { t: 0, pose: P({ lean: -0.2, crouch: 0, armF: [-0.7, 0.9], armB: [-0.5, 0.7], legF: [0.7, -1.1], legB: [-0.5, -0.8] }), ease: 'accel' as const },
      { t: 6, pose: P({ lean: 0.5, crouch: 0, squash: 1.06, armF: [1.15, 0.12], armB: [-0.8, 0.6], legF: [0.5, -0.8], legB: [-0.35, -0.5] }), ease: 'snap' as const },
      { t: 18, pose: P({ lean: 0.56, crouch: 0, armF: [1.28, 0.06], armB: [-0.7, 0.55], legF: [0.35, -0.6], legB: [-0.25, -0.35] }), ease: 'decel' as const },
      { t: 27, pose: P({ lean: 0.3, crouch: 0, armF: [0.7, 0.4], armB: [-0.4, 0.4], legF: [0.4, -0.7], legB: [-0.3, -0.45] }) },
    ],
  },
  // 另一侧的挨打反应：与 hit 按 hitCount 奇偶交替，连打读成被打得左右摇晃。
  // 命中当帧用 squash 压一下（0.88）再弹回——冲击力最省力的一种表达。
  hitAlt: {
    loop: false, frames: 14,
    keys: [
      { t: 0, pose: P({ lean: -0.3, crouch: 10, squash: 0.88, roll: -0.12, headTilt: 0.2, armF: [0.4, 1.4], armB: [1.1, 1.2], legF: [0.5, -0.4], legB: [-0.3, 0.2] }), ease: 'snap' as const },
      { t: 6, pose: P({ lean: -0.42, crouch: 4, squash: 1.05, roll: -0.18, headTilt: 0.28, armF: [1.2, 1.0], armB: [0.3, 1.3], legF: [0.2, -0.2], legB: [-0.5, 0.4] }), ease: 'decel' as const },
      { t: 14, pose: P({ lean: -0.18, crouch: 6, squash: 1, roll: -0.06, headTilt: 0.1, armF: [0.6, 0.9], armB: [0.4, 0.8] }) },
    ],
  },
  // 腾空翻滚：循环，且靠 roll 真的翻整圈——滞空多久都不会停在一帧
  tumble: {
    loop: true, frames: 36,
    keys: [
      { t: 0, pose: P({ lean: -0.35, roll: 0, armF: [1.6, 0.8], armB: [-1.5, 0.9], legF: [0.9, -0.9], legB: [-0.8, -0.5] }) },
      { t: 12, pose: P({ lean: -0.4, roll: -2.1, armF: [2.2, 0.5], armB: [-2.1, 0.6], legF: [0.4, -1.2], legB: [-1.1, -0.9] }) },
      { t: 24, pose: P({ lean: -0.35, roll: -4.2, armF: [1.1, 1.1], armB: [-1.0, 1.1], legF: [1.1, -0.6], legB: [-0.4, -0.2] }) },
      { t: 36, pose: P({ lean: -0.35, roll: -6.283, armF: [1.6, 0.8], armB: [-1.5, 0.9], legF: [0.9, -0.9], legB: [-0.8, -0.5] }) },
    ],
  },
  // 倒地：转着摔下去、砸地时压扁、再缓缓塌住。roll 到 -1.45 是真正的躺平——
  // 此前"放倒"是 drawFighter 里写死的 -90°，只有一个角度、也没法演出"摔"的过程
  fallen: {
    loop: false, frames: 44,
    keys: [
      { t: 0, pose: P({ lean: -0.3, crouch: 8, roll: -0.5, squash: 1.06, armF: [1.9, 0.7], armB: [-1.7, 0.8], legF: [1.0, -0.6], legB: [-0.9, -0.3] }), ease: 'accel' as const },
      { t: 7, pose: P({ lean: -0.25, crouch: 16, roll: -1.45, squash: 0.82, armF: [2.3, 0.4], armB: [-2.1, 0.5], legF: [1.3, -0.25], legB: [-1.1, 0.05] }), ease: 'decel' as const },
      { t: 16, pose: P({ lean: -0.22, crouch: 18, roll: -1.5, squash: 1.02, headTilt: -0.15, armF: [2.35, 0.3], armB: [-2.15, 0.4], legF: [1.28, -0.2], legB: [-1.08, 0.1] }), ease: 'decel' as const },
      { t: 44, pose: P({ lean: -0.2, crouch: 18, roll: -1.5, squash: 1, headTilt: -0.2, armF: [2.3, 0.32], armB: [-2.1, 0.42], legF: [1.25, -0.18], legB: [-1.05, 0.12] }) },
    ],
  },
});

/**
 * 胜者摆定造型、可以开口的那一帧（从判胜算起）。
 *
 * 从动作自身推导，不填字面量：四套胜利动作的收势时刻并不一致（哪吒/二郎神 52 与 46，
 * 牛魔王要到 66），写死一个数必然对不上其中几个——第一版写的 58 就让牛魔王在抡到
 * 一半时开口。这正是 docs/engine-notes.zh-CN.md「别把帧数写进常数里」那条：**这个数是从别的数算出来的**。
 *
 * 「定住」= 末两个关键帧姿势相同的那一段，取它的起点。
 */
export function victoryQuoteFrame(charId: string): number {
  const m = MOTIONS[`${charId}Victory`] ?? MOTIONS.victory;
  const k = m.keys;
  const last = JSON.stringify(k[k.length - 1].pose);
  for (let i = k.length - 2; i >= 0; i--) {
    if (JSON.stringify(k[i].pose) !== last) return k[i + 1].t;
  }
  return k[0].t;
}
