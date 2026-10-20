import type { Box, CharacterDef, FxEvent, Move, MoveSlot } from '../../engine/types';
import { SUPER_ACTIVE, SUPER_RECOVERY, SUPER_STARTUP, buildSuper, ZHONGKUI_VOCAB } from '../superPhases';
import { driveDash, sparkTrack } from '../superChoreo';
import { ASSAULT_ACTIVE, ASSAULT_RECOVERY, ASSAULT_STARTUP, buildAssault } from '../superPhases';
import { BRIEF_ACTIVE, BRIEF_RECOVERY, BRIEF_STARTUP, buildBrief } from '../superPhases';
const SEQ_ZK_B = buildBrief('zhongkui', ZHONGKUI_VOCAB).seq;
const SEQ_ZK_A = buildAssault('zhongkui', ZHONGKUI_VOCAB).seq;
const SEQ_ZK = buildSuper('zhongkui', ZHONGKUI_VOCAB).seq;

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

// 官袍的绛紫、朱批的红、鬼火的幽绿。他是名册里唯一的紫官袍
const ROBE = '#6b3a6e', VERMILION = '#c8443c', GHOST = '#7fe0a8';

export const ZHONGKUI: CharacterDef = {
  vsIntro: {
    baigu: '你这身骨头，我收了。',
  },
  crown: { kind: 'cap', color: '#c8443c' },
  quotes: { win: '名字我已经记下了。', lose: '判笔……断了。',
    taunt: '跑什么，跑得掉吗。' , intro: '生死簿上，正缺你一笔。'},
  vs: {
    baigu: '一堆白骨也想立在人间。归位。',
    bajie: '入了佛门就不归我管？管管试试。',
    xingtian: '都是死过一回的人。你不肯认。',
  },
  vsLose: {
    baigu: '白骨也能翻这个身。',
    bajie: '取过经的，果然不一样。',
    xingtian: '你比我更不肯认命。',
  },
  ending: '鬼门关的册子上又添了一笔。他合上册子，酆都的灯一盏接一盏地熄了。',
  endingHard: '判官笔搁下了。这一夜终南山没有鬼哭——他坐在石阶上，把那壶酒喝完了。',
  role: '召唤 · 压制',
  // 召唤压制：先放鬼卒占住位置，再跟着它一起压过去
  aiBias: {
    near: { attack: 1.4, skill2: 1.8, retreat: 0.6 },
    mid: { skill1: 2.6, approach: 1.8, retreat: 0.5 },
    far: { skill1: 2.8, approach: 1.6, charge: 0.8 },
  },
  id: 'zhongkui', name: '钟馗', hp: 205, speed: 4.5, jumpVel: 15,
  width: 58, height: 156,
  palette: { main: '#6b3a6e', accent: '#e8d9b0' },
  weapon: { kind: 'sword', len: 92, grip: 0.3, shaft: '#4a2b4c', edge: '#c8443c' }, // 判官剑
  adorn: {
    // 官袍的宽袖与绦带：最宽、最沉，摆动幅度小——他不是靠身法的人
    sashes: [
      { anchor: 'shoulder', segs: 9, segLen: 12, width: 9, color: '#6b3a6e', tip: '#e8d9b0' },
      { anchor: 'hip', segs: 7, segLen: 10, width: 6, color: '#4a2b4c', tip: '#c8443c' },
    ],
    ember: { color: '#7fe0a8', rate: 9, rise: 0.5 },   // 鬼火：唯一的绿色余烬
    aura: '#7fe0a8',
    dust: '#8a7a6a',
  },
  superGlow: [ROBE, GHOST],
  // 中等瓣数、偏宽、尖端略钝、反向卷：官印的形状，不是刀锋也不是火焰
  superAura: { petals: 12, spread: 0.44, tipBlunt: 0.3, curl: -0.25 },
  moves: {
    jA: { ...mk('zhongkui_jA', 'jA', '袍袖压', 11, [6, 14, 9], 22, [7, 0], 0, 0,
      [2, -32, 104, 92], 'airStrike',
      [{ frame: 6, type: 'spark', color: VERMILION, x: 54, y: 16 }]), guard: 'overhead' },
    n1: mk('zhongkui_n1', 'n1', '判官笔', 10, [5, 3, 10], 15, [6, 0], 0, 0, [28, 62, 104, 34], 'thrust',
      [{ frame: 5, type: 'spark', color: VERMILION, x: 92, y: 76 }]),
    n2: { ...mk('zhongkui_n2', 'n2', '扫袍', 10, [5, 3, 11], 15, [7, 0], 0, 0, [22, 0, 110, 46], 'sweep',
      [{ frame: 5, type: 'spark', color: ROBE, x: 92, y: 16 }]), guard: 'low' },
    n3: mk('zhongkui_n3', 'n3', '挑剑', 14, [6, 4, 14], 23, [7, 10], 0, 0, [26, 38, 92, 112], 'upthrust',
      [{ frame: 6, type: 'trail', color: VERMILION, x: 58, y: 88 }, { frame: 8, type: 'burst', color: GHOST, x: 62, y: 120 }]),
    // ── 鬼卒：**全场唯一比走路还慢的投射物** ────────────────────────────
    // 现有的弹速全在 5.2~12 之间，而角色走速是 3.8~5.9——也就是说没有人能跟在自己的弹后面走。
    // 鬼卒 vx 2.6：任何人都能走在它前面，他自己更是能贴着它一路压过去。
    // 这才是「召唤」在这套引擎里真正的意思——留下一个在场上替你占位置的东西，
    // 而不是又一发打出去就没了的弹。伤害因此压得很低（8），它的价值是**时间**不是血。
    s1: { ...mk('zhongkui_s1', 's1', '鬼卒', 10, [11, 5, 16], 16, [5, 0], 270, 0, [30, 30, 90, 70], 'cast',
      [{ frame: 6, type: 'glyph', color: GHOST, x: 26, y: 70, size: 32 },
       { frame: 11, type: 'burst', color: GHOST, x: 70, y: 60 }]),
      projectile: {
        spawnFrame: 11, vx: 2.6, life: 150, damage: 8, hitstun: 18,
        knockback: { x: 6, y: 0 }, w: 46, h: 88, y: 8, kind: 'wraith', color: GHOST,
      } },
    // 镇魂锁：中距离一记横扫，把对手拉进他的节奏。收招长——他压上来是有代价的
    s2: mk('zhongkui_s2', 's2', '镇魂锁', 16, [9, 6, 18], 20, [10, 0], 300, 0, [28, 40, 175, 80], 'rush',
      [{ frame: 3, type: 'trail', color: ROBE, x: 20, y: 70, size: 13 },
       { frame: 7, type: 'crescent', color: VERMILION, x: 100, y: 66, size: 46, angle: 0.15 }], [{ frame: 3, vx: 8 }]),
    // 朱批：他唯一打得倒人的必杀，起手最慢——是"你被鬼卒缠住时"才用得上的那一记
    s3: { ...mk('zhongkui_s3', 's3', '朱批', 18, [12, 6, 18], 26, [8, 11], 360, 0, [24, 20, 130, 140], 'cast',
      [{ frame: 7, type: 'glyph', color: VERMILION, x: 34, y: 90, size: 40 },
       { frame: 12, type: 'burst', color: VERMILION, x: 90, y: 80 },
       { frame: 15, type: 'ring', color: GHOST, x: 96, y: 60, size: 38 }]), knockdown: true, weaponScale: 1.7 },
    sp50: {
      id: 'zhongkui_sp50', slot: 'sp50', name: '奥义·判官笔', damage: 31,
      weaponScale: 2.5,
      startup: ASSAULT_STARTUP, active: ASSAULT_ACTIVE, recovery: ASSAULT_RECOVERY, hitstun: 31,
      knockback: { x: 10, y: 14 }, cooldown: 0, meterCost: 50,
      multiHit: { hits: 10, interval: 34 },
      carry: 1.3,
      hitbox: { x: 24, y: 0, w: 230, h: 170 },
      motionId: 'zhongkuiSp50',
      motionSeq: SEQ_ZK_A,
      dash: driveDash(
        [{ frame: 146, vx: 7 }, { frame: 156, vx: 7 }, { frame: 166, vx: 6 }],
        ASSAULT_STARTUP + 20, ASSAULT_STARTUP + ASSAULT_ACTIVE - 40, 26, 1.8,
      ),
      fx: [
        { frame: 12, type: 'glyph', color: VERMILION, x: 0, y: 96, size: 44 },
        { frame: 46, type: 'ring', color: GHOST, x: 0, y: 66, size: 32 },
        { frame: 92, type: 'glyph', color: ROBE, x: 0, y: 110, size: 60 },
        { frame: 132, type: 'flash', color: '#fff' },
        { frame: 150, type: 'trail', color: ROBE, x: 26, y: 40, size: 13 },
        { frame: 168, type: 'crescent', color: VERMILION, x: 100, y: 76, size: 50, angle: 0.2 },
        { frame: 190, type: 'shockwave', color: ROBE, x: 145, y: 0, size: 46 },
        ...sparkTrack(196, 300, 13, [GHOST, VERMILION]),
        { frame: 224, type: 'glyph', color: VERMILION, x: 150, y: 90, size: 52 },
        { frame: 272, type: 'crescent', color: ROBE, x: 152, y: 84, size: 56, angle: -0.3 },
        { frame: 322, type: 'burst', color: GHOST, x: 156, y: 88, size: 30 },
        { frame: 368, type: 'ring', color: VERMILION, x: 150, y: 76, size: 54 },
        ...sparkTrack(374, 430, 8, [VERMILION, GHOST], 154, 80),
        { frame: 416, type: 'shockwave', color: GHOST, x: 154, y: 0, size: 60 },
        { frame: 444, type: 'flash', color: '#fff' },
        { frame: 454, type: 'glyph', color: VERMILION, x: 166, y: 100, size: 66 },
        { frame: 468, type: 'shockwave', color: ROBE, x: 162, y: 0, size: 70 },
        { frame: 486, type: 'ring', color: GHOST, x: 156, y: 78, size: 64 },
        { frame: 514, type: 'ring', color: VERMILION, x: 152, y: 74, size: 54 },
        { frame: 544, type: 'ring', color: ROBE, x: 148, y: 72, size: 46 },
      ],
      brief: {
        startup: BRIEF_STARTUP, active: BRIEF_ACTIVE, recovery: BRIEF_RECOVERY,
        multiHit: { hits: 7, interval: 12 },
        carry: 1.1,
        motionSeq: SEQ_ZK_B,
        dash: [{ frame: 34, vx: 8 }, { frame: 42, vx: 7 }, { frame: 62, vx: 2 }, { frame: 86, vx: 2 }],
        fx: [
          { frame: 4, type: 'glyph', color: VERMILION, x: 0, y: 100, size: 46 },
          { frame: 24, type: 'flash', color: '#fff' },
          { frame: 36, type: 'crescent', color: VERMILION, x: 96, y: 76, size: 48, angle: 0.2 },
          { frame: 58, type: 'shockwave', color: ROBE, x: 142, y: 0, size: 44 },
          ...sparkTrack(62, 128, 10, [GHOST, VERMILION]),
          { frame: 86, type: 'glyph', color: VERMILION, x: 148, y: 90, size: 52 },
          { frame: 116, type: 'burst', color: GHOST, x: 154, y: 88, size: 28 },
          { frame: 138, type: 'shockwave', color: GHOST, x: 156, y: 0, size: 60 },
          { frame: 148, type: 'ring', color: VERMILION, x: 150, y: 76, size: 54 },
        ],
      },
    },
    sp100: {
      id: 'zhongkui_sp100', slot: 'sp100', name: '超必杀·万鬼夜行', damage: 53,
      weaponScale: 2.3,
      startup: SUPER_STARTUP, active: SUPER_ACTIVE, recovery: SUPER_RECOVERY, hitstun: 41,
      knockback: { x: 10, y: 18 }, cooldown: 0, meterCost: 100,
      multiHit: { hits: 30, interval: 13 },
      carry: 1.25,
      hitbox: { x: 0, y: 0, w: 350, h: 220 },
      motionId: 'zhongkuiSp100',
      motionSeq: SEQ_ZK,
      dash: driveDash(
        [{ frame: 82, vx: 8 }, { frame: 90, vx: 8 }, { frame: 98, vx: 7 }, { frame: 106, vx: 6 }],
        SUPER_STARTUP + 14, SUPER_STARTUP + SUPER_ACTIVE - 30, 20, 1.9,
      ),
      fx: [
        { frame: 6, type: 'glyph', color: VERMILION, x: 0, y: 100, size: 48 },
        { frame: 26, type: 'ring', color: GHOST, x: 0, y: 66, size: 34 },
        { frame: 48, type: 'glyph', color: ROBE, x: 0, y: 112, size: 64 },
        { frame: 70, type: 'ring', color: VERMILION, x: 0, y: 78, size: 48 },
        { frame: 78, type: 'flash', color: '#fff' },
        { frame: 90, type: 'burst', color: GHOST, x: 60, y: 70, size: 26 },
        { frame: 104, type: 'burst', color: GHOST, x: 110, y: 80, size: 24 },
        { frame: 118, type: 'shockwave', color: ROBE, x: 145, y: 0, size: 46 },
        ...sparkTrack(122, 300, 24, [GHOST, VERMILION]),
        { frame: 156, type: 'glyph', color: VERMILION, x: 150, y: 92, size: 54 },
        { frame: 200, type: 'crescent', color: ROBE, x: 154, y: 84, size: 58, angle: -0.3 },
        { frame: 244, type: 'burst', color: GHOST, x: 152, y: 90, size: 30 },
        { frame: 270, type: 'ring', color: VERMILION, x: 152, y: 76, size: 58 },
        ...sparkTrack(312, 420, 16, [VERMILION, GHOST], 156, 80),
        { frame: 338, type: 'glyph', color: ROBE, x: 156, y: 96, size: 64 },
        { frame: 368, type: 'ring', color: GHOST, x: 152, y: 76, size: 62 },
        { frame: 400, type: 'shockwave', color: VERMILION, x: 158, y: 0, size: 68 },
        { frame: 434, type: 'glyph', color: VERMILION, x: 50, y: 116, size: 80 },
        { frame: 460, type: 'glyph', color: GHOST, x: 110, y: 98, size: 66 },
        { frame: 478, type: 'flash', color: '#fff' },
        { frame: 490, type: 'glyph', color: VERMILION, x: 172, y: 110, size: 76 },
        { frame: 500, type: 'shockwave', color: ROBE, x: 168, y: 0, size: 76 },
        { frame: 514, type: 'burst', color: GHOST, x: 178, y: 88, size: 32 },
        { frame: 530, type: 'ring', color: VERMILION, x: 164, y: 78, size: 70 },
        { frame: 550, type: 'ring', color: GHOST, x: 158, y: 74, size: 56 },
      ],
      brief: {
        startup: BRIEF_STARTUP, active: BRIEF_ACTIVE, recovery: BRIEF_RECOVERY,
        multiHit: { hits: 12, interval: 7 },
        carry: 1.0,
        motionSeq: SEQ_ZK_B,
        dash: [{ frame: 34, vx: 8 }, { frame: 42, vx: 7 }, { frame: 62, vx: 2 }, { frame: 86, vx: 2 }],
        fx: [
          { frame: 4, type: 'glyph', color: VERMILION, x: 0, y: 100, size: 46 },
          { frame: 24, type: 'flash', color: '#fff' },
          { frame: 36, type: 'burst', color: GHOST, x: 80, y: 74, size: 26 },
          { frame: 58, type: 'shockwave', color: ROBE, x: 142, y: 0, size: 44 },
          ...sparkTrack(62, 128, 10, [GHOST, VERMILION]),
          { frame: 88, type: 'glyph', color: VERMILION, x: 150, y: 92, size: 54 },
          { frame: 118, type: 'shockwave', color: VERMILION, x: 156, y: 0, size: 62 },
          { frame: 140, type: 'ring', color: GHOST, x: 152, y: 76, size: 56 },
        ],
      },
    },
  },
};
