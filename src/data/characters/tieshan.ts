import type { Box, CharacterDef, FxEvent, Move, MoveSlot } from '../../engine/types';
import { SUPER_ACTIVE, SUPER_RECOVERY, SUPER_STARTUP, buildSuper, TIESHAN_VOCAB } from '../superPhases';
import { driveDash, sparkTrack } from '../superChoreo';
import { ASSAULT_ACTIVE, ASSAULT_RECOVERY, ASSAULT_STARTUP, buildAssault } from '../superPhases';
import { BRIEF_ACTIVE, BRIEF_RECOVERY, BRIEF_STARTUP, buildBrief } from '../superPhases';
const SEQ_TS_B = buildBrief('tieshan', TIESHAN_VOCAB).seq;
const SEQ_TS_A = buildAssault('tieshan', TIESHAN_VOCAB).seq;
const SEQ_TS = buildSuper('tieshan', TIESHAN_VOCAB).seq;

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

// 翠云山的青、扇面的月白、风纹的淡碧。她这一身没有一点火气——
// 与丈夫（赤岩熔流）和儿子（三昧真火）刻意拉开，一家三口在画面上分得清清楚楚
const JADE = '#7fd8c0', MOON = '#eef3ea', WIND = '#a8e6ff';

export const TIESHAN: CharacterDef = {
  vsIntro: {
    niumo: '你倒还知道回来。',
    wukong: '又来借扇子？',
  },
  vsTaunt: {
    niumo: '回来了？',
  },
  crown: { kind: 'pin', color: '#eef3ea' },
  quotes: { win: '一扇之下，站得住的没几个。', lose: '扇面破了……罢了。',
    taunt: '再近一步试试。' , intro: '一扇子的事，何必动手。'},
  vs: {
    niumo: '你回来只为借扇子。扇子也认人。',
    honghaier: '一把火烧遍那山，烧不到我这儿。',
    wukong: '上回你钻进我肚里，这回连门都进不来。',
  },
  vsLose: {
    niumo: '你还是把扇子拿走了。',
    honghaier: '这火，到底是你爹给的。',
    wukong: '又是你，又钻进来了。',
  },
  ending: '芭蕉洞的门重新合上。火焰山那边已经三年没有起过火，她也就没有再出去过。',
  endingHard: '扇子扇到第四十九下，火焰山头一回落了雪。她收起扇子，觉得这地方总算安静了。',
  role: '控场 · 推开',
  // 控场推开：把人推回她要的距离，然后守住。近身先脱身，中距离放风刃
  aiBias: {
    near: { retreat: 2.0, skill2: 2.2, backstep: 1.8, attack: 0.8 },
    mid: { skill1: 2.4, retreat: 1.5, approach: 0.6 },
    far: { skill1: 2.2, charge: 1.5, approach: 0.5 },
  },
  id: 'tieshan', name: '铁扇公主', hp: 195, speed: 4.8, jumpVel: 16,
  width: 50, height: 144,
  palette: { main: '#2f8f7a', accent: '#eef3ea' },
  // 芭蕉扇：全场唯一不靠杆长吃饭的兵器——扇面是**横着张开**的，攻程来自风不是杆
  weapon: { kind: 'fan', len: 62, grip: 0.22, shaft: '#5a7a6a', edge: '#eef3ea' },
  adorn: {
    // 长帔与腰绦：她是四人里唯一"站着不动也在动"的角色，飘带最长最柔
    sashes: [
      { anchor: 'shoulder', segs: 13, segLen: 10, width: 6, color: '#2f8f7a', tip: '#eef3ea' },
      { anchor: 'hip', segs: 9, segLen: 9, width: 4, color: '#7fd8c0', tip: '#a8e6ff' },
    ],
    ember: { color: '#a8e6ff', rate: 5, rise: 0.28 },   // 不是火星，是被风卷起来的叶屑：最稀最慢
    aura: '#7fd8c0',
    dust: '#9fb8a8',
  },
  superGlow: [WIND, JADE],
  // 花瓣少而极宽、尖端钝：风是「面」不是「刺」，与红孩儿那朵二十瓣的卷焰正好相反
  superAura: { petals: 9, spread: 0.5, tipBlunt: 0.55, curl: 0.1 },
  moves: {
    jA: { ...mk('tieshan_jA', 'jA', '扇底风', 10, [5, 14, 8], 22, [7, 0], 0, 0,
      [2, -30, 100, 88], 'airStrike',
      [{ frame: 6, type: 'crescent', color: WIND, x: 52, y: 18, size: 30 }]), guard: 'overhead' },
    n1: mk('tieshan_n1', 'n1', '扇面拍', 9, [5, 3, 9], 14, [6, 0], 0, 0, [26, 60, 100, 34], 'thrust',
      [{ frame: 5, type: 'spark', color: MOON, x: 88, y: 74 }]),
    // 下段：扇子贴地一扫，风把人往后推。击退 10 是全场普攻里最高的
    // 击退只有 6：**推开是必杀的事，不是普攻的事**。第一版给普攻 9/10/11 的高击退，
    // 结果三段连打第二段就把人推出了第三段的射程——她的招牌把她自己的连段拆了
    // （chainAndTrade 那条当场报「只有 2 段」）。s1 的 20 仍是全场最高，招牌留在那里
    n2: { ...mk('tieshan_n2', 'n2', '扫叶', 10, [4, 3, 10], 15, [6, 0], 0, 0, [22, 0, 108, 46], 'sweep',
      [{ frame: 4, type: 'crescent', color: JADE, x: 90, y: 14, size: 26 }]), guard: 'low' },
    n3: mk('tieshan_n3', 'n3', '卷风起', 14, [6, 4, 13], 22, [8, 9], 0, 0, [24, 36, 92, 108], 'upthrust',
      [{ frame: 6, type: 'trail', color: WIND, x: 56, y: 86 }, { frame: 8, type: 'ring', color: JADE, x: 60, y: 112, size: 30 }]),
    // 一扇之风：**全场击退最高**（20）、伤害却最低。它买的不是血，是**距离**——
    // 把人推回她要的那个位置，正是这个角色赢的方式。判定框又宽又矮，贴地推过去
    s1: { ...mk('tieshan_s1', 's1', '一扇之风', 13, [10, 7, 18], 18, [20, 0], 240, 0, [30, 20, 200, 70], 'cast',
      [{ frame: 7, type: 'crescent', color: WIND, x: 60, y: 60, size: 46, angle: 0.1 },
       { frame: 11, type: 'crescent', color: JADE, x: 130, y: 56, size: 52, angle: -0.1 },
       { frame: 15, type: 'trail', color: MOON, x: 190, y: 52, size: 14 }]),
      projectile: {
        // 扇形风刃：慢、宽、寿命长——与天眼光束（快而细）、三昧真火（短命）都不是一回事。
        // 它的价值是"占住一段空间"，逼对手绕路或吃下击退
        spawnFrame: 12, vx: 5.2, life: 74, damage: 9, hitstun: 16,
        knockback: { x: 18, y: 0 }, w: 62, h: 76, y: 24, kind: 'fan', color: WIND,
      } },
    // 退风步：唯一一记**向后**的必杀。被贴身时用它拉开，是她的脱身键
    s2: mk('tieshan_s2', 's2', '退风步', 14, [7, 5, 16], 18, [14, 0], 300, 0, [10, 30, 120, 90], 'rush',
      [{ frame: 2, type: 'ring', color: JADE, x: 20, y: 60, size: 34 },
       { frame: 6, type: 'crescent', color: WIND, x: 70, y: 58, size: 40, angle: 0.2 }], [{ frame: 2, vx: -13 }]),
    // 罗刹旋：她这一组里唯一打得倒人的必杀，也是唯一一记贴身用的招
    s3: { ...mk('tieshan_s3', 's3', '罗刹旋', 17, [9, 8, 17], 26, [16, 10], 360, 0, [16, 16, 150, 140], 'cast',
      [{ frame: 6, type: 'ring', color: WIND, x: 40, y: 70, size: 44 },
       { frame: 10, type: 'crescent', color: JADE, x: 70, y: 80, size: 54, angle: -0.5 },
       { frame: 14, type: 'crescent', color: MOON, x: 80, y: 60, size: 50, angle: 0.6 }]),
      knockdown: true, weaponScale: 1.7 },
    sp50: {
      id: 'tieshan_sp50', slot: 'sp50', name: '奥义·一扇之威', damage: 30,
      weaponScale: 2.6,
      startup: ASSAULT_STARTUP, active: ASSAULT_ACTIVE, recovery: ASSAULT_RECOVERY, hitstun: 31,
      knockback: { x: 18, y: 12 }, cooldown: 0, meterCost: 50,
      multiHit: { hits: 9, interval: 38 },
      // carry 最低：她的连打不把人往版边带，而是**一下一下往外推**——
      // 这一档演出的读法就该和另外五人相反
      carry: 0.5,
      hitbox: { x: 20, y: 0, w: 250, h: 170 },
      motionId: 'tieshanSp50',
      motionSeq: SEQ_TS_A,
      dash: driveDash(
        [{ frame: 146, vx: 5 }, { frame: 156, vx: 5 }, { frame: 166, vx: 4 }],
        ASSAULT_STARTUP + 20, ASSAULT_STARTUP + ASSAULT_ACTIVE - 40, 30, 1.2,
      ),
      fx: [
        { frame: 12, type: 'ring', color: WIND, x: 0, y: 90, size: 40 },
        { frame: 48, type: 'crescent', color: JADE, x: 20, y: 80, size: 48, angle: 0.2 },
        { frame: 92, type: 'ring', color: MOON, x: 0, y: 100, size: 58 },
        { frame: 132, type: 'flash', color: '#fff' },
        { frame: 150, type: 'crescent', color: WIND, x: 60, y: 70, size: 56, angle: -0.2 },
        { frame: 168, type: 'trail', color: MOON, x: 110, y: 60, size: 12 },
        { frame: 190, type: 'shockwave', color: JADE, x: 150, y: 0, size: 48 },
        ...sparkTrack(196, 300, 12, [WIND, MOON]),
        { frame: 222, type: 'crescent', color: JADE, x: 150, y: 84, size: 58, angle: 0.35 },
        { frame: 270, type: 'crescent', color: WIND, x: 158, y: 80, size: 64, angle: -0.35 },
        { frame: 322, type: 'ring', color: MOON, x: 156, y: 78, size: 60 },
        { frame: 368, type: 'crescent', color: JADE, x: 160, y: 70, size: 68, angle: 0.5 },
        ...sparkTrack(374, 430, 8, [MOON, WIND], 160, 80),
        { frame: 416, type: 'shockwave', color: WIND, x: 158, y: 0, size: 62 },
        { frame: 444, type: 'flash', color: '#fff' },
        { frame: 452, type: 'crescent', color: MOON, x: 170, y: 84, size: 72, angle: -0.15 },
        { frame: 466, type: 'shockwave', color: JADE, x: 168, y: 0, size: 74 },
        { frame: 480, type: 'ring', color: WIND, x: 162, y: 78, size: 66 },
        { frame: 504, type: 'ring', color: MOON, x: 158, y: 76, size: 58 },
        { frame: 542, type: 'ring', color: JADE, x: 154, y: 72, size: 48 },
      ],
      brief: {
        startup: BRIEF_STARTUP, active: BRIEF_ACTIVE, recovery: BRIEF_RECOVERY,
        multiHit: { hits: 6, interval: 14 },
        carry: 0.4,
        motionSeq: SEQ_TS_B,
        dash: [{ frame: 34, vx: 5 }, { frame: 42, vx: 4 }, { frame: 62, vx: 1.4 }, { frame: 86, vx: 1.4 }],
        fx: [
          { frame: 4, type: 'ring', color: WIND, x: 0, y: 94, size: 42 },
          { frame: 24, type: 'flash', color: '#fff' },
          { frame: 34, type: 'crescent', color: JADE, x: 60, y: 72, size: 52, angle: -0.2 },
          { frame: 56, type: 'shockwave', color: JADE, x: 140, y: 0, size: 44 },
          ...sparkTrack(60, 128, 9, [WIND, MOON]),
          { frame: 80, type: 'crescent', color: WIND, x: 150, y: 84, size: 58, angle: 0.35 },
          { frame: 112, type: 'ring', color: MOON, x: 154, y: 78, size: 56 },
          { frame: 136, type: 'shockwave', color: WIND, x: 158, y: 0, size: 60 },
          { frame: 146, type: 'ring', color: JADE, x: 152, y: 74, size: 52 },
        ],
      },
    },
    sp100: {
      id: 'tieshan_sp100', slot: 'sp100', name: '超必杀·火焰山息', damage: 53,
      weaponScale: 3.0,
      startup: SUPER_STARTUP, active: SUPER_ACTIVE, recovery: SUPER_RECOVERY, hitstun: 41,
      knockback: { x: 22, y: 16 }, cooldown: 0, meterCost: 100,
      // 段数最少、每段最重：一扇顶别人三下。与红孩儿的 46 段正好是两个极端
      multiHit: { hits: 22, interval: 18 },
      carry: 0.6,
      hitbox: { x: 0, y: 0, w: 380, h: 230 },
      motionId: 'tieshanSp100',
      motionSeq: SEQ_TS,
      dash: driveDash(
        [{ frame: 82, vx: 6 }, { frame: 90, vx: 6 }, { frame: 98, vx: 5 }, { frame: 106, vx: 4 }],
        SUPER_STARTUP + 14, SUPER_STARTUP + SUPER_ACTIVE - 30, 24, 1.2,
      ),
      fx: [
        { frame: 6, type: 'ring', color: WIND, x: 0, y: 94, size: 46 },
        { frame: 28, type: 'crescent', color: JADE, x: 10, y: 84, size: 50, angle: 0.25 },
        { frame: 50, type: 'ring', color: MOON, x: 0, y: 104, size: 64 },
        { frame: 70, type: 'crescent', color: WIND, x: 20, y: 90, size: 58, angle: -0.25 },
        { frame: 78, type: 'flash', color: '#fff' },
        { frame: 88, type: 'crescent', color: MOON, x: 60, y: 74, size: 62, angle: 0.15 },
        { frame: 104, type: 'trail', color: WIND, x: 110, y: 60, size: 12 },
        { frame: 118, type: 'shockwave', color: JADE, x: 150, y: 0, size: 46 },
        ...sparkTrack(122, 300, 22, [WIND, MOON]),
        { frame: 156, type: 'crescent', color: JADE, x: 150, y: 84, size: 60, angle: 0.4 },
        { frame: 200, type: 'crescent', color: WIND, x: 156, y: 80, size: 66, angle: -0.4 },
        { frame: 244, type: 'shockwave', color: MOON, x: 158, y: 0, size: 62 },
        { frame: 268, type: 'ring', color: JADE, x: 156, y: 78, size: 64 },
        ...sparkTrack(312, 420, 15, [MOON, JADE], 160, 80),
        { frame: 334, type: 'crescent', color: MOON, x: 158, y: 66, size: 70, angle: 0.55 },
        { frame: 364, type: 'ring', color: WIND, x: 154, y: 76, size: 68 },
        { frame: 398, type: 'shockwave', color: JADE, x: 162, y: 0, size: 70 },
        { frame: 432, type: 'crescent', color: WIND, x: 60, y: 100, size: 82, angle: 0.1 },
        { frame: 458, type: 'crescent', color: MOON, x: 110, y: 92, size: 76, angle: -0.1 },
        { frame: 478, type: 'flash', color: '#fff' },
        { frame: 488, type: 'crescent', color: MOON, x: 170, y: 84, size: 86, angle: 0.05 },
        { frame: 498, type: 'shockwave', color: WIND, x: 168, y: 0, size: 82 },
        { frame: 510, type: 'ring', color: JADE, x: 164, y: 78, size: 76 },
        { frame: 528, type: 'ring', color: MOON, x: 160, y: 76, size: 64 },
        { frame: 548, type: 'ring', color: WIND, x: 156, y: 72, size: 52 },
      ],
      brief: {
        startup: BRIEF_STARTUP, active: BRIEF_ACTIVE, recovery: BRIEF_RECOVERY,
        multiHit: { hits: 9, interval: 10 },
        carry: 0.5,
        motionSeq: SEQ_TS_B,
        dash: [{ frame: 34, vx: 6 }, { frame: 42, vx: 5 }, { frame: 62, vx: 1.4 }, { frame: 86, vx: 1.4 }],
        fx: [
          { frame: 4, type: 'ring', color: WIND, x: 0, y: 94, size: 44 },
          { frame: 24, type: 'flash', color: '#fff' },
          { frame: 34, type: 'crescent', color: MOON, x: 60, y: 74, size: 56, angle: 0.15 },
          { frame: 56, type: 'shockwave', color: JADE, x: 140, y: 0, size: 46 },
          ...sparkTrack(60, 128, 9, [WIND, MOON]),
          { frame: 82, type: 'crescent', color: JADE, x: 150, y: 84, size: 62, angle: 0.4 },
          { frame: 114, type: 'ring', color: WIND, x: 154, y: 78, size: 60 },
          { frame: 138, type: 'shockwave', color: MOON, x: 158, y: 0, size: 64 },
          { frame: 148, type: 'ring', color: JADE, x: 152, y: 74, size: 54 },
        ],
      },
    },
  },
};
