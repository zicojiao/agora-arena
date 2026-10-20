import type { Box, CharacterDef, FxEvent, Move, MoveSlot } from '../../engine/types';
import { SUPER_ACTIVE, SUPER_RECOVERY, SUPER_STARTUP, buildSuper, LEIZHEN_VOCAB } from '../superPhases';
import { driveDash, sparkTrack } from '../superChoreo';
import { ASSAULT_ACTIVE, ASSAULT_RECOVERY, ASSAULT_STARTUP, buildAssault } from '../superPhases';
import { BRIEF_ACTIVE, BRIEF_RECOVERY, BRIEF_STARTUP, buildBrief } from '../superPhases';
const SEQ_LZ_B = buildBrief('leizhen', LEIZHEN_VOCAB).seq;
const SEQ_LZ_A = buildAssault('leizhen', LEIZHEN_VOCAB).seq;
const SEQ_LZ = buildSuper('leizhen', LEIZHEN_VOCAB).seq;

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

// 雷青、翅羽的月白、雷芯的紫。全名册唯一的冷紫系
const BOLT = '#8fd0ff', WING = '#f0f4ff', CORE = '#a06bff';

export const LEIZHEN: CharacterDef = {
  crown: { kind: 'wings', color: '#8fd0ff' },
  quotes: { win: '在地上站着，是打不着我的。', lose: '翅膀……收不住了。',
    taunt: '上来啊。' , intro: '雷已经在你头顶了。'},
  vs: {
    nezha: '都是天生的怪相，你还挑我翅膀？',
    houyi: '你射太阳那会儿，太阳是站着不动的。',
    erlang: '天庭的规矩你熟。天上的路，我熟。',
  },
  vsLose: {
    nezha: '怪相对怪相，你更快。',
    houyi: '那张弓，果然射得下我。',
    erlang: '天上的路，你也熟。',
  },
  ending: '他没有落地。西岐的城墙下站满了人，抬头看着那一对翅膀往云里去，越来越小。',
  endingHard: '雷停了。他落在文王的碑前，收起翅膀，像个寻常人那样跪了下去。',
  role: '空中 · 俯冲',
  // 空中俯冲：他的主武器是跳跃攻击，所以中距离多跳，近身用对空把人挑起来再追
  aiBias: {
    near: { skill2: 2.4, attack: 1.2, retreat: 0.7 },
    mid: { jump: 3.0, approach: 1.6, skill1: 1.8, retreat: 0.5 },
    far: { jump: 2.4, approach: 1.8, charge: 0.8 },
  },
  id: 'leizhen', name: '雷震子', hp: 195, speed: 5.2,
  // 全名册最高的起跳初速（22，次高是红孩儿 19、牛魔王只有 14）。
  // 这不是数值好看：小跳/大跳、跳跃攻击、对空的整套读招都建立在滞空时长上，
  // 22 让他的滞空比所有人都久一档——「在地上站着是打不着我的」就是这个数。
  jumpVel: 22,
  width: 54, height: 150,
  palette: { main: '#4a6fa8', accent: '#f0f4ff' },
  weapon: { kind: 'mace', len: 88, grip: 0.42, shaft: '#3a4a6b', edge: '#8fd0ff' }, // 黄金棍
  adorn: {
    // 真的一对翅膀，不再拿飘带假装。此前是两条同挂肩上的 154px 飘带，注释写着
    // 「画面上要读成一对翅膀」——同锚同长只会叠成一条，梢部又收成尖，读出来是鞭子。
    wings: { color: '#dfe8ff', tip: '#8fd0ff', span: 74, feathers: 7 },
    // 翅膀接手之后，飘带退回它本来的角色：腰间一条短的，不跟翅膀抢轮廓
    sashes: [
      { anchor: 'hip', segs: 7, segLen: 9, width: 6, color: '#3a5a90', tip: '#8fd0ff' },
    ],
    ember: { color: '#8fd0ff', rate: 11, rise: 0.9 },   // 上升最快的余烬：他整个人都在往上走
    aura: '#8fd0ff',
    dust: '#a8b4c8',
  },
  superGlow: [BOLT, CORE],
  // 瓣数少而极宽、尖端最钝：雷是"炸开"的，不是刺出去的
  superAura: { petals: 8, spread: 0.48, tipBlunt: 0.7, curl: -0.3 },
  moves: {
    // **全场最重的跳跃攻击**（14，次重是牛魔王 12）。他的主战场在空中，
    // 那一记就该是他最好的一招，而不是像别人那样只是个起手。
    //
    // hitstun 30 是被两条测量逼出来的：① 跳入命中后要接得上自己的 n1（26 时只有 +2 帧，
    // 接不上 5 帧起手，他最主要的一击等于没有回报）；② 更要紧的是 AI 的**对空率饱和在
    // 0.8 以上**——一个靠跳入吃饭的角色被这套陪练硬克，实测总胜率 22%。
    // 跳入既然十次里有八次被接住，那剩下两次落地就必须真的换来一套连段。
    jA: { ...mk('leizhen_jA', 'jA', '雷翼俯冲', 14, [5, 15, 9], 30, [8, 0], 0, 0,
      [0, -38, 112, 100], 'airStrike',
      [{ frame: 5, type: 'bolt', color: BOLT, x: 56, y: 20, size: 42, angle: 1.3 },
       { frame: 8, type: 'spark', color: CORE, x: 70, y: 10 }]), guard: 'overhead' },
    n1: mk('leizhen_n1', 'n1', '棍击', 9, [4, 3, 9], 14, [6, 0], 0, 0, [26, 60, 98, 34], 'thrust',
      [{ frame: 4, type: 'spark', color: BOLT, x: 88, y: 74 }]),
    n2: { ...mk('leizhen_n2', 'n2', '扫棍', 10, [4, 3, 10], 15, [7, 0], 0, 0, [22, 0, 104, 46], 'sweep',
      [{ frame: 4, type: 'spark', color: WING, x: 90, y: 16 }]), guard: 'low' },
    // 挑空最高（y 方向击飞 14，全场最高）：他把人挑起来，是为了追到空中去打
    n3: mk('leizhen_n3', 'n3', '振翅挑', 14, [5, 4, 13], 22, [5, 14], 0, 0, [24, 38, 88, 118], 'upthrust',
      [{ frame: 6, type: 'trail', color: WING, x: 56, y: 90 }, { frame: 8, type: 'burst', color: BOLT, x: 60, y: 126 }]),
    // 雷翼冲：斜着俯冲下去的一记突进。判定框压在身体前下方，是"从空中来"的读法
    s1: mk('leizhen_s1', 's1', '雷翼冲', 17, [8, 6, 16], 20, [12, 0], 240, 0, [24, 30, 170, 96], 'rush',
      [{ frame: 2, type: 'trail', color: WING, x: -18, y: 90, size: 15 },
       { frame: 5, type: 'bolt', color: BOLT, x: 50, y: 70, size: 44, angle: 0.9 },
       { frame: 9, type: 'shockwave', color: CORE, x: 120, y: 0, size: 30 }], [{ frame: 2, vx: 15 }]),
    // 风雷双翅：原地拔高的对空。**y 击飞 18 是全场最高**——被它打中的人飞得最高，
    // 而他自己也上去了，正好接上那一记 14 伤害的俯冲
    s2: { ...mk('leizhen_s2', 's2', '风雷双翅', 16, [7, 6, 18], 24, [3, 18], 300, 0, [10, 24, 96, 168], 'upthrust',
      [{ frame: 4, type: 'bolt', color: BOLT, x: 26, y: 70, size: 46, angle: 1.4 },
       { frame: 8, type: 'burst', color: WING, x: 34, y: 130 },
       { frame: 12, type: 'ring', color: CORE, x: 30, y: 110, size: 36 }]), knockdown: true },
    // 落雷：唯一一记打地面的招。他在空中占尽便宜，总得有一招是给"对手也在地上"准备的
    s3: { ...mk('leizhen_s3', 's3', '落雷', 18, [10, 6, 18], 24, [9, 6], 360, 0, [40, 0, 140, 150], 'cast',
      [{ frame: 7, type: 'glyph', color: CORE, x: 40, y: 150, size: 36 },
       { frame: 11, type: 'bolt', color: BOLT, x: 100, y: 120, size: 60, angle: 1.55 },
       { frame: 14, type: 'shockwave', color: WING, x: 110, y: 0, size: 44 }]), weaponScale: 1.6 },
    sp50: {
      id: 'leizhen_sp50', slot: 'sp50', name: '奥义·雷翼裂空', damage: 30,
      weaponScale: 2.3,
      startup: ASSAULT_STARTUP, active: ASSAULT_ACTIVE, recovery: ASSAULT_RECOVERY, hitstun: 31,
      knockback: { x: 8, y: 17 }, cooldown: 0, meterCost: 50,
      multiHit: { hits: 10, interval: 34 },
      carry: 1.25,
      hitbox: { x: 20, y: 0, w: 210, h: 230 },
      motionId: 'leizhenSp50',
      motionSeq: SEQ_LZ_A,
      dash: driveDash(
        [{ frame: 146, vx: 9 }, { frame: 156, vx: 9 }, { frame: 166, vx: 8 }],
        ASSAULT_STARTUP + 20, ASSAULT_STARTUP + ASSAULT_ACTIVE - 40, 26, 2.1,
      ),
      fx: [
        { frame: 12, type: 'glyph', color: CORE, x: 0, y: 110, size: 44 },
        { frame: 46, type: 'ring', color: BOLT, x: 0, y: 74, size: 32 },
        { frame: 92, type: 'bolt', color: BOLT, x: 0, y: 140, size: 58, angle: 1.5 },
        { frame: 132, type: 'flash', color: '#fff' },
        { frame: 150, type: 'trail', color: WING, x: 24, y: 40, size: 13 },
        { frame: 166, type: 'bolt', color: CORE, x: 90, y: 120, size: 54, angle: 1.2 },
        { frame: 188, type: 'shockwave', color: BOLT, x: 140, y: 0, size: 46 },
        ...sparkTrack(194, 300, 13, [BOLT, WING]),
        { frame: 222, type: 'bolt', color: BOLT, x: 150, y: 130, size: 58, angle: 1.45 },
        { frame: 270, type: 'crescent', color: WING, x: 152, y: 90, size: 56, angle: -0.6 },
        { frame: 320, type: 'bolt', color: CORE, x: 158, y: 140, size: 62, angle: 1.55 },
        { frame: 368, type: 'ring', color: BOLT, x: 152, y: 78, size: 54 },
        ...sparkTrack(374, 430, 8, [WING, BOLT], 156, 82),
        { frame: 416, type: 'shockwave', color: CORE, x: 156, y: 0, size: 60 },
        { frame: 444, type: 'flash', color: '#fff' },
        { frame: 454, type: 'bolt', color: BOLT, x: 168, y: 150, size: 70, angle: 1.5 },
        { frame: 468, type: 'shockwave', color: BOLT, x: 164, y: 0, size: 70 },
        { frame: 486, type: 'ring', color: WING, x: 158, y: 78, size: 64 },
        { frame: 514, type: 'ring', color: CORE, x: 154, y: 74, size: 54 },
        { frame: 544, type: 'ring', color: BOLT, x: 150, y: 72, size: 46 },
      ],
      brief: {
        startup: BRIEF_STARTUP, active: BRIEF_ACTIVE, recovery: BRIEF_RECOVERY,
        multiHit: { hits: 7, interval: 12 },
        carry: 1.05,
        motionSeq: SEQ_LZ_B,
        dash: [{ frame: 34, vx: 10 }, { frame: 42, vx: 9 }, { frame: 62, vx: 2.4 }, { frame: 86, vx: 2.4 }],
        fx: [
          { frame: 4, type: 'glyph', color: CORE, x: 0, y: 112, size: 46 },
          { frame: 24, type: 'flash', color: '#fff' },
          { frame: 34, type: 'trail', color: WING, x: 24, y: 40, size: 12 },
          { frame: 56, type: 'shockwave', color: BOLT, x: 140, y: 0, size: 44 },
          ...sparkTrack(60, 128, 10, [BOLT, WING]),
          { frame: 80, type: 'bolt', color: BOLT, x: 148, y: 128, size: 56, angle: 1.45 },
          { frame: 110, type: 'crescent', color: WING, x: 152, y: 90, size: 54, angle: -0.6 },
          { frame: 136, type: 'shockwave', color: CORE, x: 158, y: 0, size: 60 },
          { frame: 146, type: 'ring', color: BOLT, x: 152, y: 76, size: 54 },
        ],
      },
    },
    sp100: {
      id: 'leizhen_sp100', slot: 'sp100', name: '超必杀·万钧雷霆', damage: 52,
      weaponScale: 2.4,
      startup: SUPER_STARTUP, active: SUPER_ACTIVE, recovery: SUPER_RECOVERY, hitstun: 41,
      knockback: { x: 9, y: 20 }, cooldown: 0, meterCost: 100,
      multiHit: { hits: 34, interval: 11 },
      carry: 1.2,
      hitbox: { x: 0, y: 0, w: 330, h: 260 },
      motionId: 'leizhenSp100',
      motionSeq: SEQ_LZ,
      dash: driveDash(
        [{ frame: 82, vx: 9 }, { frame: 90, vx: 9 }, { frame: 98, vx: 8 }, { frame: 106, vx: 7 }],
        SUPER_STARTUP + 14, SUPER_STARTUP + SUPER_ACTIVE - 30, 20, 2.2,
      ),
      fx: [
        { frame: 6, type: 'glyph', color: CORE, x: 0, y: 112, size: 50 },
        { frame: 26, type: 'ring', color: BOLT, x: 0, y: 74, size: 36 },
        { frame: 48, type: 'bolt', color: BOLT, x: 0, y: 150, size: 60, angle: 1.5 },
        { frame: 70, type: 'ring', color: CORE, x: 0, y: 84, size: 50 },
        { frame: 78, type: 'flash', color: '#fff' },
        { frame: 88, type: 'trail', color: WING, x: 20, y: 40, size: 12 },
        { frame: 100, type: 'bolt', color: CORE, x: 80, y: 130, size: 54, angle: 1.3 },
        { frame: 114, type: 'shockwave', color: BOLT, x: 140, y: 0, size: 46 },
        ...sparkTrack(118, 300, 24, [BOLT, WING]),
        { frame: 152, type: 'bolt', color: BOLT, x: 150, y: 140, size: 58, angle: 1.45 },
        { frame: 198, type: 'bolt', color: CORE, x: 158, y: 150, size: 62, angle: 1.55 },
        { frame: 244, type: 'shockwave', color: WING, x: 152, y: 0, size: 58 },
        { frame: 270, type: 'crescent', color: WING, x: 156, y: 96, size: 60, angle: -0.7 },
        ...sparkTrack(312, 420, 16, [WING, BOLT], 158, 84),
        { frame: 338, type: 'bolt', color: BOLT, x: 160, y: 160, size: 68, angle: 1.5 },
        { frame: 368, type: 'ring', color: CORE, x: 154, y: 78, size: 60 },
        { frame: 400, type: 'shockwave', color: BOLT, x: 160, y: 0, size: 68 },
        { frame: 434, type: 'glyph', color: CORE, x: 50, y: 140, size: 80 },
        { frame: 460, type: 'bolt', color: BOLT, x: 120, y: 160, size: 70, angle: 1.5 },
        { frame: 478, type: 'flash', color: '#fff' },
        { frame: 490, type: 'bolt', color: CORE, x: 175, y: 170, size: 78, angle: 1.55 },
        { frame: 500, type: 'shockwave', color: BOLT, x: 170, y: 0, size: 78 },
        { frame: 514, type: 'burst', color: WING, x: 180, y: 90, size: 32 },
        { frame: 530, type: 'ring', color: BOLT, x: 166, y: 78, size: 72 },
        { frame: 550, type: 'ring', color: CORE, x: 160, y: 74, size: 56 },
      ],
      brief: {
        startup: BRIEF_STARTUP, active: BRIEF_ACTIVE, recovery: BRIEF_RECOVERY,
        multiHit: { hits: 14, interval: 6 },
        carry: 0.95,
        motionSeq: SEQ_LZ_B,
        dash: [{ frame: 34, vx: 10 }, { frame: 42, vx: 9 }, { frame: 62, vx: 2.4 }, { frame: 86, vx: 2.4 }],
        fx: [
          { frame: 4, type: 'glyph', color: CORE, x: 0, y: 112, size: 48 },
          { frame: 24, type: 'flash', color: '#fff' },
          { frame: 36, type: 'bolt', color: CORE, x: 80, y: 130, size: 54, angle: 1.3 },
          { frame: 58, type: 'shockwave', color: BOLT, x: 140, y: 0, size: 46 },
          ...sparkTrack(62, 128, 10, [BOLT, WING]),
          { frame: 88, type: 'bolt', color: BOLT, x: 150, y: 140, size: 60, angle: 1.45 },
          { frame: 118, type: 'shockwave', color: WING, x: 156, y: 0, size: 62 },
          { frame: 140, type: 'ring', color: BOLT, x: 154, y: 76, size: 58 },
        ],
      },
    },
  },
};
