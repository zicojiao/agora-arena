import type { Box, CharacterDef, FxEvent, Move, MoveSlot } from '../../engine/types';
import { SUPER_ACTIVE, SUPER_RECOVERY, SUPER_STARTUP, buildSuper, BAIGU_VOCAB } from '../superPhases';
import { driveDash, sparkTrack } from '../superChoreo';
import { ASSAULT_ACTIVE, ASSAULT_RECOVERY, ASSAULT_STARTUP, buildAssault } from '../superPhases';
import { BRIEF_ACTIVE, BRIEF_RECOVERY, BRIEF_STARTUP, buildBrief } from '../superPhases';
const SEQ_BG_B = buildBrief('baigu', BAIGU_VOCAB).seq;
const SEQ_BG_A = buildAssault('baigu', BAIGU_VOCAB).seq;
const SEQ_BG = buildSuper('baigu', BAIGU_VOCAB).seq;

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

// 骨白、尸青、一点残血的暗红。她身上没有任何暖色——四个近身角色（火红/金/赤岩）
// 与铁扇的翠青之外，这是第三种色系
const BONE = '#e8e4d6', CORPSE = '#9fb4a8', BLOOD = '#8c2b3a';

export const BAIGU: CharacterDef = {
  vsIntro: {
    wukong: '这双眼，还是那么毒。',
  },
  crown: { kind: 'skull', color: '#e8e4d6' },
  quotes: { win: '你看见的从来不是我。', lose: '这一副……也散了。',
    taunt: '你猜这次是哪一个。' , intro: '皮相罢了，我只看骨头。'},
  vs: {
    wukong: '那双眼睛看得穿皮相——看得穿三次吗？',
    zhongkui: '判官老爷捉的是鬼。我又不是鬼。',
    bajie: '上回你搬弄口舌，这回没人替你说。',
  },
  vsLose: {
    wukong: '第三回……你还是看穿了。',
    zhongkui: '判官老爷，我认栽。',
    bajie: '连你也看得出来了。',
  },
  ending: '白虎岭上再没有樵夫和老妇出现过。山道空了，走过的人只觉得风比别处冷些。',
  endingHard: '她照了照水面。第一次看见的不是三副皮囊，是一个人——水晃了晃，那个人还在。',
  role: '虚实 · 上下',
  /**
   * **她刻意没有 aiBias**，而另外十一个人都有。
   *
   * 试过两版：近身必杀 ×2.4 → 总胜率 44% 掉到 30%；收到 ×1.5 → 31%，几乎没救回来。
   * 原因不在频率，在**这套 AI 没有读人这一层**：她的价值是"两记必杀看起来一样，
   * 你得猜蹲还是站"，而 AI 的"混"是随机权重、不看对手在做什么，
   * 也不会因为对方猜错而追加惩罚。于是提高必杀权重只是在把 17~18 帧的收招反复送上去。
   *
   * 结论记在这里：**打法偏置对"位置型"原型有效（远射/投技/霸体/贴身），
   * 对"信息型"原型无效**——后者要的是读人与骗招，那是 AI 里还没有的一层。
   * 她因此保持中立权重：由玩家操作时她的上下段照样成立，那才是这个角色的用武之地。
   */
  id: 'baigu', name: '白骨精', hp: 196, speed: 5.2, jumpVel: 17,
  width: 48, height: 146,
  palette: { main: '#7d8a84', accent: '#e8e4d6' },
  // 骨爪不是杆兵器：len 最短、握点几乎在根部，画面上只探出一截白骨
  weapon: { kind: 'sword', len: 54, grip: 0.12, shaft: '#c9c3b2', edge: '#e8e4d6' }, // 短骨剑
  adorn: {
    sashes: [
      { anchor: 'shoulder', segs: 10, segLen: 9, width: 5, color: '#6f7d76', tip: '#e8e4d6' },
      { anchor: 'hip', segs: 6, segLen: 8, width: 3.5, color: '#8c2b3a', tip: '#c9c3b2' },
    ],
    ember: { color: '#cfd8d2', rate: 7, rise: -0.2 },   // 唯一往**下**沉的余屑：是骨灰不是火星
    aura: '#9fb4a8',
    dust: '#a8a293',
  },
  superGlow: [BONE, CORPSE],
  // 瓣数中等、极窄、尖端锐利：像一圈立起来的骨刺
  superAura: { petals: 17, spread: 0.22, tipBlunt: 0, curl: -0.18 },
  moves: {
    jA: { ...mk('baigu_jA', 'jA', '骨爪·扑', 10, [5, 14, 8], 22, [6, 0], 0, 0,
      [2, -32, 96, 88], 'airStrike',
      [{ frame: 6, type: 'spark', color: BONE, x: 52, y: 16 }]), guard: 'overhead' },
    n1: mk('baigu_n1', 'n1', '骨爪·撩', 8, [4, 3, 9], 14, [5, 0], 0, 0, [26, 58, 96, 34], 'thrust',
      [{ frame: 4, type: 'spark', color: BONE, x: 86, y: 72 }]),
    n2: { ...mk('baigu_n2', 'n2', '扫骨', 9, [4, 3, 9], 15, [6, 0], 0, 0, [22, 0, 106, 44], 'sweep',
      [{ frame: 4, type: 'spark', color: CORPSE, x: 90, y: 16 }]), guard: 'low' },
    n3: mk('baigu_n3', 'n3', '骨刺挑', 13, [5, 4, 13], 22, [6, 10], 0, 0, [24, 38, 84, 108], 'upthrust',
      [{ frame: 6, type: 'trail', color: BONE, x: 54, y: 86 }, { frame: 8, type: 'burst', color: BLOOD, x: 58, y: 118 }]),
    // ── 她的立身之本：**必杀也分上下段** ──────────────────────────────
    // 全名册里 guard 只出现在两处：跳跃攻击（中段）与连击第二段（下段）。
    // 也就是说所有人的必杀都是"站着蹲着都挡得住"，防御在必杀距离上不需要读招。
    // 她把这件事翻过来：贴地的白骨爪必须蹲防，从上砸下的骨刺升必须站防——
    // 两招起手同为 9 帧、判定框都从身前 30 开始，**看起来是一样的**。
    // 「你看见的从来不是我」这句台词，在机制上就是这一对。
    s1: { ...mk('baigu_s1', 's1', '白骨爪', 15, [9, 5, 17], 20, [8, 0], 240, 0, [30, 0, 150, 52], 'rush',
      [{ frame: 6, type: 'trail', color: CORPSE, x: 40, y: 14, size: 12 },
       { frame: 9, type: 'crescent', color: BONE, x: 110, y: 20, size: 40, angle: 0.15 },
       { frame: 12, type: 'spark', color: BLOOD, x: 160, y: 16 }], [{ frame: 3, vx: 9 }]), guard: 'low' },
    s2: { ...mk('baigu_s2', 's2', '骨刺升', 15, [9, 5, 18], 20, [7, 0], 300, 0, [30, 86, 140, 92], 'cast',
      [{ frame: 6, type: 'trail', color: BONE, x: 40, y: 140, size: 12 },
       { frame: 9, type: 'crescent', color: CORPSE, x: 110, y: 130, size: 42, angle: -0.9 },
       { frame: 12, type: 'burst', color: BONE, x: 150, y: 120 }], [{ frame: 3, vx: 8 }]), guard: 'overhead' },
    // 尸骨阵：留在原地的一段骨墙。慢、伤害低，作用是逼对手换路线——
    // 与二郎神的光束（快而细）、铁扇的风刃（宽而推）都不是一回事
    s3: { ...mk('baigu_s3', 's3', '尸骨阵', 16, [10, 6, 18], 24, [5, 12], 360, 0, [20, 10, 130, 130], 'cast',
      [{ frame: 7, type: 'glyph', color: CORPSE, x: 30, y: 60, size: 38 },
       { frame: 11, type: 'burst', color: BONE, x: 70, y: 90 },
       { frame: 15, type: 'ring', color: BLOOD, x: 90, y: 70, size: 34 }]), knockdown: true, weaponScale: 1.8 },
    sp50: {
      id: 'baigu_sp50', slot: 'sp50', name: '奥义·白骨爪', damage: 30,
      weaponScale: 2.4,
      startup: ASSAULT_STARTUP, active: ASSAULT_ACTIVE, recovery: ASSAULT_RECOVERY, hitstun: 31,
      knockback: { x: 8, y: 14 }, cooldown: 0, meterCost: 50,
      multiHit: { hits: 10, interval: 34 },
      carry: 1.2,
      hitbox: { x: 26, y: 0, w: 200, h: 160 },
      motionId: 'baiguSp50',
      motionSeq: SEQ_BG_A,
      dash: driveDash(
        [{ frame: 146, vx: 8 }, { frame: 156, vx: 8 }, { frame: 166, vx: 7 }],
        ASSAULT_STARTUP + 20, ASSAULT_STARTUP + ASSAULT_ACTIVE - 40, 26, 2,
      ),
      fx: [
        { frame: 12, type: 'glyph', color: CORPSE, x: 0, y: 90, size: 42 },
        { frame: 46, type: 'ring', color: BONE, x: 0, y: 60, size: 30 },
        { frame: 92, type: 'glyph', color: BLOOD, x: 0, y: 104, size: 58 },
        { frame: 132, type: 'flash', color: '#fff' },
        { frame: 150, type: 'trail', color: BONE, x: 24, y: 10, size: 12 },
        { frame: 164, type: 'trail', color: CORPSE, x: 74, y: 8, size: 10 },
        { frame: 186, type: 'shockwave', color: CORPSE, x: 140, y: 0, size: 44 },
        ...sparkTrack(192, 300, 13, [BONE, CORPSE]),
        { frame: 218, type: 'crescent', color: BONE, x: 140, y: 40, size: 48, angle: 0.2 },
        { frame: 266, type: 'crescent', color: CORPSE, x: 146, y: 80, size: 52, angle: -0.5 },
        { frame: 318, type: 'burst', color: BLOOD, x: 150, y: 90, size: 28 },
        { frame: 366, type: 'ring', color: BONE, x: 146, y: 72, size: 50 },
        ...sparkTrack(372, 430, 8, [CORPSE, BONE], 152, 76),
        { frame: 414, type: 'shockwave', color: BONE, x: 152, y: 0, size: 56 },
        { frame: 444, type: 'flash', color: '#fff' },
        { frame: 452, type: 'burst', color: BLOOD, x: 162, y: 84, size: 30 },
        { frame: 466, type: 'shockwave', color: CORPSE, x: 160, y: 0, size: 64 },
        { frame: 480, type: 'crescent', color: BONE, x: 158, y: 74, size: 60, angle: 0.4 },
        { frame: 508, type: 'ring', color: CORPSE, x: 152, y: 72, size: 58 },
        { frame: 542, type: 'ring', color: BONE, x: 148, y: 70, size: 46 },
      ],
      brief: {
        startup: BRIEF_STARTUP, active: BRIEF_ACTIVE, recovery: BRIEF_RECOVERY,
        multiHit: { hits: 7, interval: 12 },
        carry: 1.0,
        motionSeq: SEQ_BG_B,
        dash: [{ frame: 34, vx: 9 }, { frame: 42, vx: 8 }, { frame: 62, vx: 2.2 }, { frame: 86, vx: 2.2 }],
        fx: [
          { frame: 4, type: 'glyph', color: CORPSE, x: 0, y: 94, size: 44 },
          { frame: 24, type: 'flash', color: '#fff' },
          { frame: 34, type: 'trail', color: BONE, x: 22, y: 10, size: 11 },
          { frame: 56, type: 'shockwave', color: CORPSE, x: 140, y: 0, size: 42 },
          ...sparkTrack(60, 128, 10, [BONE, CORPSE]),
          { frame: 78, type: 'crescent', color: BONE, x: 140, y: 60, size: 48, angle: 0.2 },
          { frame: 106, type: 'burst', color: BLOOD, x: 150, y: 88, size: 26 },
          { frame: 136, type: 'shockwave', color: BONE, x: 158, y: 0, size: 58 },
          { frame: 146, type: 'ring', color: CORPSE, x: 150, y: 72, size: 52 },
        ],
      },
    },
    sp100: {
      id: 'baigu_sp100', slot: 'sp100', name: '超必杀·三尸化形', damage: 52,
      weaponScale: 2.2,
      startup: SUPER_STARTUP, active: SUPER_ACTIVE, recovery: SUPER_RECOVERY, hitstun: 41,
      knockback: { x: 9, y: 18 }, cooldown: 0, meterCost: 100,
      multiHit: { hits: 33, interval: 12 },
      carry: 1.15,
      hitbox: { x: 0, y: 0, w: 330, h: 220 },
      motionId: 'baiguSp100',
      motionSeq: SEQ_BG,
      dash: driveDash(
        [{ frame: 82, vx: 9 }, { frame: 90, vx: 9 }, { frame: 98, vx: 8 }, { frame: 106, vx: 7 }],
        SUPER_STARTUP + 14, SUPER_STARTUP + SUPER_ACTIVE - 30, 20, 2,
      ),
      fx: [
        { frame: 6, type: 'glyph', color: CORPSE, x: 0, y: 96, size: 48 },
        { frame: 26, type: 'ring', color: BONE, x: 0, y: 62, size: 34 },
        { frame: 48, type: 'glyph', color: BLOOD, x: 0, y: 108, size: 64 },
        { frame: 70, type: 'ring', color: CORPSE, x: 0, y: 72, size: 48 },
        { frame: 78, type: 'flash', color: '#fff' },
        { frame: 88, type: 'trail', color: BONE, x: 20, y: 10, size: 11 },
        { frame: 100, type: 'trail', color: CORPSE, x: 80, y: 8, size: 10 },
        { frame: 114, type: 'shockwave', color: CORPSE, x: 140, y: 0, size: 44 },
        ...sparkTrack(118, 300, 24, [BONE, CORPSE]),
        { frame: 152, type: 'crescent', color: BONE, x: 140, y: 40, size: 48, angle: 0.2 },
        { frame: 198, type: 'crescent', color: CORPSE, x: 148, y: 86, size: 54, angle: -0.55 },
        { frame: 242, type: 'burst', color: BLOOD, x: 150, y: 92, size: 30 },
        { frame: 268, type: 'ring', color: BONE, x: 152, y: 74, size: 56 },
        ...sparkTrack(312, 420, 16, [CORPSE, BONE], 156, 78),
        { frame: 336, type: 'crescent', color: BONE, x: 154, y: 60, size: 62, angle: 0.5 },
        { frame: 366, type: 'ring', color: CORPSE, x: 150, y: 74, size: 60 },
        { frame: 398, type: 'shockwave', color: BONE, x: 158, y: 0, size: 66 },
        { frame: 432, type: 'glyph', color: CORPSE, x: 40, y: 108, size: 76 },
        { frame: 458, type: 'glyph', color: BLOOD, x: 92, y: 92, size: 62 },
        { frame: 478, type: 'flash', color: '#fff' },
        { frame: 488, type: 'burst', color: BONE, x: 168, y: 86, size: 32 },
        { frame: 496, type: 'shockwave', color: BLOOD, x: 166, y: 0, size: 72 },
        { frame: 508, type: 'crescent', color: BONE, x: 164, y: 76, size: 66, angle: 0.35 },
        { frame: 528, type: 'ring', color: CORPSE, x: 158, y: 74, size: 68 },
        { frame: 548, type: 'ring', color: BONE, x: 154, y: 70, size: 54 },
      ],
      brief: {
        startup: BRIEF_STARTUP, active: BRIEF_ACTIVE, recovery: BRIEF_RECOVERY,
        multiHit: { hits: 13, interval: 6 },
        carry: 0.9,
        motionSeq: SEQ_BG_B,
        dash: [{ frame: 34, vx: 9 }, { frame: 42, vx: 8 }, { frame: 62, vx: 2.2 }, { frame: 86, vx: 2.2 }],
        fx: [
          { frame: 4, type: 'glyph', color: CORPSE, x: 0, y: 94, size: 44 },
          { frame: 24, type: 'flash', color: '#fff' },
          { frame: 34, type: 'trail', color: BONE, x: 22, y: 10, size: 11 },
          { frame: 56, type: 'shockwave', color: CORPSE, x: 140, y: 0, size: 42 },
          ...sparkTrack(60, 128, 10, [BONE, CORPSE]),
          { frame: 80, type: 'crescent', color: BONE, x: 140, y: 60, size: 50, angle: 0.2 },
          { frame: 110, type: 'burst', color: BLOOD, x: 152, y: 88, size: 28 },
          { frame: 138, type: 'shockwave', color: BONE, x: 158, y: 0, size: 60 },
          { frame: 148, type: 'ring', color: CORPSE, x: 152, y: 72, size: 54 },
        ],
      },
    },
  },
};
