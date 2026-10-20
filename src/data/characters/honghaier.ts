import type { Box, CharacterDef, FxEvent, Move, MoveSlot } from '../../engine/types';
import { SUPER_ACTIVE, SUPER_RECOVERY, SUPER_STARTUP, buildSuper, HONGHAIER_VOCAB } from '../superPhases';
import { driveDash, sparkTrack } from '../superChoreo';
import { ASSAULT_ACTIVE, ASSAULT_RECOVERY, ASSAULT_STARTUP, buildAssault } from '../superPhases';
import { BRIEF_ACTIVE, BRIEF_RECOVERY, BRIEF_STARTUP, buildBrief } from '../superPhases';
const SEQ_HHE_B = buildBrief('honghaier', HONGHAIER_VOCAB).seq;
const SEQ_HHE_A = buildAssault('honghaier', HONGHAIER_VOCAB).seq;
const SEQ_HHE = buildSuper('honghaier', HONGHAIER_VOCAB).seq;

function mk(id: string, slot: MoveSlot, name: string, dmg: number,
  frames: [number, number, number], hitstun: number, kb: [number, number],
  cd: number, cost: 0 | 50 | 100, hb: [number, number, number, number],
  motionId: string, fx: FxEvent[], dash?: { frame: number; vx: number }[]): Move {
  return {
    id, slot, name, damage: dmg,
    startup: frames[0], active: frames[1], recovery: frames[2], hitstun,
    knockback: { x: kb[0], y: kb[1] }, cooldown: cd, meterCost: cost,
    hitbox: { x: hb[0], y: hb[1], w: hb[2], h: hb[3] } as Box, motionId, fx, dash,
  };
}

// 三昧真火：赤心、金焰、青焰芯。青色是"连水都浇不灭"那一层，只用在真火本身，
// 不铺到普攻上——否则这个角色的招式全一个色，看不出哪一招才是他的招牌
const RED = '#ff3a2e', FLAME = '#ff9a2b', CORE = '#8fe3ff';

export const HONGHAIER: CharacterDef = {
  vsIntro: {
    niumo: '爹，别手下留情。',
    nezha: '同是一杆枪，比比火。',
  },
  vsTaunt: {
    niumo: '爹，看好了。',
  },
  crown: { kind: 'flame', color: '#ff9a2b' },
  quotes: { win: '你也配让我认真？', lose: '……观音姐姐，救我。',
    taunt: '我爹都打不过我。' , intro: '三昧真火，你受得住么？'},
  vs: {
    niumo: '爹，你说等我打赢你就认我——现在呢？',
    tieshan: '娘，扇子灭得了火焰山，灭不了我。',
    wukong: '叔叔，三昧真火还想再尝一口么。',
    nezha: '同一杆火尖枪，你使得也就这样。',
  },
  vsLose: {
    niumo: '爹……我还是打不过你。',
    tieshan: '娘，扇子还是灭得了火。',
    wukong: '叔叔，这次算你赢。',
    nezha: '同一杆枪，你比我熟。',
  },
  ending: '火云洞的火熄了三日。他蹲在洞口数着自己赢过的名字，数到第八个就忘了往下数。',
  endingHard: '三昧真火烧到最后只剩一点星子。他把它含在嘴里，学着他爹的样子，坐上了那座山头。',
  role: '极速 · 骗招',
  // 极速骗招：贴身连打，上下段来回换。退是他最不该做的事
  aiBias: {
    near: { attack: 2.6, skill2: 1.6, retreat: 0.35, backstep: 0.4 },
    mid: { approach: 2.4, dash: 2.2, skill1: 1.4, retreat: 0.4 },
    far: { approach: 2.6, dash: 2.4 },
  },
  id: 'honghaier', name: '红孩儿', hp: 190, speed: 5.9, jumpVel: 19,
  // 全场最小的受击框（46×128，比哪吒还窄 6、矮 20）。
  // **别把它当成一项优势来配平**——这是实测纠正过的一处想当然：攻击判定框绝大多数贴在
  // y<128 的高度上（二郎神的天眼光束在 70、牛魔王裂地重击在 0），矮 20px 躲不掉什么。
  // 第一版按"小=灵活"给他血 180 + 全场最低伤害 + 全场最短攻程，只换一项速度领先，
  // 实测总胜率 26%（门槛 35%）。血与伤害都补回半档，代价只留在攻程上。
  width: 46, height: 128,
  palette: { main: '#e03a2c', accent: '#ffd08a' },
  // 火尖枪。与哪吒同名同形，但短一截（78 对 96）、握点更靠后：他是个孩子，抡不动长的
  weapon: { kind: 'spear', len: 78, grip: 0.34, shaft: '#7a3a22', edge: '#ff9a2b' },
  adorn: {
    // 肚兜的两条系带，短而乱——不是哪吒那条飘逸的混天绫
    sashes: [
      { anchor: 'shoulder', segs: 6, segLen: 8, width: 5, color: '#e03a2c', tip: '#ffd08a' },
      { anchor: 'hip', segs: 5, segLen: 7, width: 4, color: '#c02a1e', tip: '#ff9a2b' },
    ],
    ember: { color: '#ff9a2b', rate: 16, rise: 0.72 },   // 余烬最密最快：他本人一直在烧
    aura: '#ff6a2b',
    dust: '#c98a5a',
  },
  superGlow: [FLAME, CORE],
  // 花瓣最多最尖、卷曲最大：三昧真火是"卷"起来的火，不是舒展的莲
  superAura: { petals: 20, spread: 0.3, tipBlunt: 0, curl: 0.42 },
  moves: {
    // hitstun 25 不是随手写的：跳入命中后的帧优势必须**接得上自己的 n1**，
    // 而他的 n1 是全场最快的 3 帧，门槛也就最高（22 时只有 +1，接不上，跳入等于没有回报）
    jA: { ...mk('honghaier_jA', 'jA', '火尖枪·扑', 9, [4, 14, 8], 25, [5, 0], 0, 0,
      [4, -30, 92, 84], 'airStrike',
      [{ frame: 5, type: 'spark', color: FLAME, x: 54, y: 14 }]), guard: 'overhead' },
    // 全场最快的普攻起手（3 帧）。伤害也是全场最低——快是他唯一的本钱
    n1: mk('honghaier_n1', 'n1', '火尖枪·刺', 7, [3, 3, 8], 14, [5, 0], 0, 0, [26, 62, 88, 30], 'thrust',
      [{ frame: 3, type: 'spark', color: FLAME, x: 84, y: 74 }]),
    // 下段扫堂 3 帧起手，全场最快的下段：骗招型的立身之本是「上下段猜不出来」
    n2: { ...mk('honghaier_n2', 'n2', '燎地扫', 8, [3, 3, 9], 15, [6, 0], 0, 0, [22, 0, 96, 44], 'sweep',
      [{ frame: 3, type: 'spark', color: RED, x: 88, y: 16 }]), guard: 'low' },
    n3: mk('honghaier_n3', 'n3', '挑火', 13, [5, 4, 12], 22, [6, 11], 0, 0, [24, 38, 76, 104], 'upthrust',
      [{ frame: 5, type: 'trail', color: FLAME, x: 54, y: 84 }, { frame: 7, type: 'burst', color: CORE, x: 60, y: 120 }]),
    // 三昧真火：一口喷出去的火。**寿命只有 22 帧**（二郎神的天眼光束是 60）——
    // 它不是隔屏对射的弹，是"中距离突然多出一段攻程"的骗招，喷完人还站在原地要收招
    s1: mk('honghaier_s1', 's1', '三昧真火', 16, [9, 6, 16], 20, [9, 0], 240, 0, [40, 46, 170, 56], 'cast',
      [{ frame: 6, type: 'glyph', color: CORE, x: 20, y: 92, size: 30 },
       { frame: 10, type: 'burst', color: FLAME, x: 70, y: 78 },
       { frame: 13, type: 'trail', color: RED, x: 130, y: 74, size: 12 }]),
    // 火轮冲：突进最远、收招也最长的一招。撞进去之后是他唯一能强行贴脸的手段
    s2: mk('honghaier_s2', 's2', '火轮冲', 15, [8, 6, 17], 18, [10, 0], 300, 0, [26, 30, 150, 76], 'rush',
      [{ frame: 2, type: 'trail', color: FLAME, x: -16, y: 50, size: 14 },
       { frame: 5, type: 'trail', color: RED, x: 44, y: 46, size: 12 },
       { frame: 9, type: 'shockwave', color: FLAME, x: 110, y: 0, size: 26 }], [{ frame: 2, vx: 17 }]),
    // 焚天升：他这一组里唯一打得倒人的必杀（同「倒不倒是招式属性」那条规矩）
    // weaponScale：焚天升是火顺着枪身窜上去，枪尖那一截火焰要真的伸出来（同如意棒撑天那套）
    s3: { ...mk('honghaier_s3', 's3', '焚天升', 17, [7, 6, 18], 26, [4, 14], 360, 0, [12, 20, 84, 156], 'upthrust',
      [{ frame: 5, type: 'bolt', color: CORE, x: 30, y: 60, size: 40, angle: 1.2 },
       { frame: 9, type: 'burst', color: FLAME, x: 40, y: 120 },
       { frame: 12, type: 'ring', color: RED, x: 34, y: 100, size: 34 }]), knockdown: true, weaponScale: 1.9 },
    sp50: {
      id: 'honghaier_sp50', slot: 'sp50', name: '奥义·三昧真火', damage: 29,
      startup: ASSAULT_STARTUP, active: ASSAULT_ACTIVE, recovery: ASSAULT_RECOVERY, hitstun: 30,
      knockback: { x: 7, y: 15 }, cooldown: 0, meterCost: 50,
      multiHit: { hits: 11, interval: 31 },
      carry: 1.35,
      hitbox: { x: 24, y: 0, w: 210, h: 150 },
      motionId: 'honghaierSp50',
      motionSeq: SEQ_HHE_A,
      dash: driveDash(
        [{ frame: 146, vx: 9 }, { frame: 156, vx: 9 }, { frame: 166, vx: 8 }],
        ASSAULT_STARTUP + 20, ASSAULT_STARTUP + ASSAULT_ACTIVE - 40, 26, 2.2,
      ),
      fx: [
        { frame: 12, type: 'glyph', color: CORE, x: 0, y: 96, size: 44 },
        { frame: 46, type: 'ring', color: FLAME, x: 0, y: 64, size: 30 },
        { frame: 92, type: 'glyph', color: RED, x: 0, y: 108, size: 60 },
        { frame: 132, type: 'flash', color: '#fff' },
        { frame: 150, type: 'trail', color: FLAME, x: 24, y: 12, size: 13 },
        { frame: 164, type: 'trail', color: CORE, x: 74, y: 10, size: 11 },
        { frame: 186, type: 'shockwave', color: FLAME, x: 140, y: 0, size: 44 },
        ...sparkTrack(192, 300, 14, [FLAME, CORE]),
        { frame: 218, type: 'crescent', color: RED, x: 140, y: 82, size: 48, angle: -0.4 },
        { frame: 266, type: 'crescent', color: FLAME, x: 146, y: 78, size: 54, angle: 0.36 },
        { frame: 318, type: 'bolt', color: CORE, x: 150, y: 110, size: 52, angle: 1.3 },
        { frame: 366, type: 'ring', color: FLAME, x: 146, y: 74, size: 52 },
        ...sparkTrack(372, 430, 9, [CORE, FLAME], 152, 78),
        { frame: 414, type: 'shockwave', color: CORE, x: 152, y: 0, size: 58 },
        { frame: 444, type: 'flash', color: '#fff' },
        { frame: 450, type: 'burst', color: FLAME, x: 160, y: 84, size: 30 },
        { frame: 458, type: 'burst', color: CORE, x: 180, y: 78, size: 26 },
        { frame: 466, type: 'shockwave', color: RED, x: 160, y: 0, size: 66 },
        { frame: 478, type: 'bolt', color: FLAME, x: 170, y: 118, size: 56, angle: 1.3 },
        { frame: 500, type: 'ring', color: CORE, x: 150, y: 74, size: 64 },
        { frame: 542, type: 'ring', color: FLAME, x: 146, y: 70, size: 50 },
      ],
      brief: {
        startup: BRIEF_STARTUP, active: BRIEF_ACTIVE, recovery: BRIEF_RECOVERY,
        multiHit: { hits: 8, interval: 11 },
        carry: 1.15,
        motionSeq: SEQ_HHE_B,
        dash: [{ frame: 34, vx: 10 }, { frame: 42, vx: 9 }, { frame: 62, vx: 2.6 }, { frame: 86, vx: 2.6 }],
        fx: [
          { frame: 4, type: 'glyph', color: CORE, x: 0, y: 100, size: 46 },
          { frame: 24, type: 'flash', color: '#fff' },
          { frame: 32, type: 'trail', color: FLAME, x: 22, y: 12, size: 12 },
          { frame: 42, type: 'trail', color: RED, x: 72, y: 10, size: 10 },
          { frame: 56, type: 'shockwave', color: FLAME, x: 140, y: 0, size: 42 },
          ...sparkTrack(60, 128, 11, [FLAME, CORE]),
          { frame: 76, type: 'crescent', color: RED, x: 140, y: 82, size: 46, angle: -0.4 },
          { frame: 104, type: 'bolt', color: CORE, x: 148, y: 108, size: 48, angle: 1.3 },
          { frame: 130, type: 'burst', color: FLAME, x: 160, y: 84, size: 28 },
          { frame: 138, type: 'shockwave', color: RED, x: 160, y: 0, size: 56 },
          { frame: 146, type: 'ring', color: CORE, x: 150, y: 74, size: 54 },
        ],
      },
    },
    sp100: {
      id: 'honghaier_sp100', slot: 'sp100', name: '超必杀·圣婴烈焰', damage: 51,
      startup: SUPER_STARTUP, active: SUPER_ACTIVE, recovery: SUPER_RECOVERY, hitstun: 40,
      knockback: { x: 9, y: 18 }, cooldown: 0, meterCost: 100,
      // 段数全场最多（46 段）、每段最轻：他打的是"数量"，牛魔王打的是"分量"
      multiHit: { hits: 46, interval: 8 },
      carry: 1.25,
      hitbox: { x: 0, y: 0, w: 320, h: 210 },
      motionId: 'honghaierSp100',
      motionSeq: SEQ_HHE,
      dash: driveDash(
        [{ frame: 82, vx: 10 }, { frame: 90, vx: 10 }, { frame: 98, vx: 9 }, { frame: 106, vx: 8 }],
        SUPER_STARTUP + 14, SUPER_STARTUP + SUPER_ACTIVE - 30, 18, 2.4,
      ),
      fx: [
        { frame: 6, type: 'glyph', color: CORE, x: 0, y: 100, size: 50 },
        { frame: 26, type: 'ring', color: FLAME, x: 0, y: 64, size: 34 },
        { frame: 48, type: 'glyph', color: RED, x: 0, y: 112, size: 66 },
        { frame: 70, type: 'ring', color: CORE, x: 0, y: 74, size: 48 },
        { frame: 78, type: 'flash', color: '#fff' },
        { frame: 84, type: 'trail', color: FLAME, x: 10, y: 12, size: 12 },
        { frame: 92, type: 'trail', color: RED, x: 50, y: 10, size: 11 },
        { frame: 100, type: 'trail', color: CORE, x: 90, y: 10, size: 10 },
        { frame: 112, type: 'shockwave', color: FLAME, x: 140, y: 0, size: 42 },
        ...sparkTrack(116, 300, 30, [FLAME, CORE]),
        { frame: 150, type: 'crescent', color: RED, x: 140, y: 82, size: 46, angle: -0.4 },
        { frame: 195, type: 'bolt', color: CORE, x: 146, y: 110, size: 50, angle: 1.25 },
        { frame: 240, type: 'shockwave', color: CORE, x: 150, y: 0, size: 56 },
        { frame: 265, type: 'crescent', color: FLAME, x: 150, y: 84, size: 54, angle: -0.3 },
        ...sparkTrack(310, 420, 18, [CORE, FLAME], 155, 78),
        { frame: 330, type: 'bolt', color: RED, x: 148, y: 116, size: 58, angle: 1.35 },
        { frame: 360, type: 'ring', color: FLAME, x: 145, y: 74, size: 54 },
        { frame: 395, type: 'shockwave', color: RED, x: 155, y: 0, size: 62 },
        { frame: 430, type: 'glyph', color: CORE, x: 40, y: 112, size: 78 },
        { frame: 455, type: 'glyph', color: FLAME, x: 90, y: 94, size: 64 },
        { frame: 478, type: 'flash', color: '#fff' },
        { frame: 484, type: 'burst', color: FLAME, x: 165, y: 84, size: 30 },
        { frame: 490, type: 'burst', color: CORE, x: 185, y: 78, size: 26 },
        { frame: 496, type: 'shockwave', color: RED, x: 165, y: 0, size: 72 },
        { frame: 504, type: 'bolt', color: FLAME, x: 175, y: 120, size: 58, angle: 1.25 },
        { frame: 512, type: 'bolt', color: CORE, x: 140, y: 120, size: 52, angle: 1.95 },
        { frame: 524, type: 'ring', color: CORE, x: 155, y: 74, size: 70 },
        { frame: 545, type: 'ring', color: FLAME, x: 150, y: 70, size: 56 },
      ],
      brief: {
        startup: BRIEF_STARTUP, active: BRIEF_ACTIVE, recovery: BRIEF_RECOVERY,
        multiHit: { hits: 16, interval: 5 },
        carry: 0.95,
        motionSeq: SEQ_HHE_B,
        dash: [{ frame: 34, vx: 10 }, { frame: 42, vx: 9 }, { frame: 62, vx: 2.6 }, { frame: 86, vx: 2.6 }],
        fx: [
          { frame: 4, type: 'glyph', color: CORE, x: 0, y: 100, size: 46 },
          { frame: 24, type: 'flash', color: '#fff' },
          { frame: 32, type: 'trail', color: FLAME, x: 22, y: 12, size: 12 },
          { frame: 42, type: 'trail', color: RED, x: 72, y: 10, size: 10 },
          { frame: 56, type: 'shockwave', color: FLAME, x: 140, y: 0, size: 42 },
          ...sparkTrack(60, 128, 11, [FLAME, CORE]),
          { frame: 76, type: 'crescent', color: RED, x: 140, y: 82, size: 46, angle: -0.4 },
          { frame: 104, type: 'bolt', color: CORE, x: 148, y: 108, size: 48, angle: 1.3 },
          { frame: 130, type: 'burst', color: FLAME, x: 160, y: 84, size: 28 },
          { frame: 138, type: 'shockwave', color: RED, x: 160, y: 0, size: 56 },
          { frame: 146, type: 'ring', color: CORE, x: 150, y: 74, size: 54 },
        ],
      },
    },
  },
};
