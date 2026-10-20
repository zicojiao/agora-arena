import type { Box, CharacterDef, FxEvent, Move, MoveSlot } from '../../engine/types';
import { SUPER_ACTIVE, SUPER_RECOVERY, SUPER_STARTUP, buildSuper, XINGTIAN_VOCAB } from '../superPhases';
import { driveDash, sparkTrack } from '../superChoreo';
import { ASSAULT_ACTIVE, ASSAULT_RECOVERY, ASSAULT_STARTUP, buildAssault } from '../superPhases';
import { BRIEF_ACTIVE, BRIEF_RECOVERY, BRIEF_STARTUP, buildBrief } from '../superPhases';
const SEQ_XT_B = buildBrief('xingtian', XINGTIAN_VOCAB).seq;
const SEQ_XT_A = buildAssault('xingtian', XINGTIAN_VOCAB).seq;
const SEQ_XT = buildSuper('xingtian', XINGTIAN_VOCAB).seq;

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

// 铁锈红、青铜、干（盾）上的土黄。没有一点亮色——他是一具还在打的躯干
const RUST = '#8c3b2a', BRONZE = '#b08d57', EARTH = '#d8c08a';

export const XINGTIAN: CharacterDef = {
  quotes: { win: '头没了，手还在。', lose: '……终于停了。',
    taunt: '砍这里，我不躲。' , intro: '头没了，路照样认得。'},
  vs: {
    zhongkui: '你撞的是台阶，我掉的是脑袋。谁更硬。',
    houyi: '箭要射中，先得找得到我的脸。',
    niumo: '两个不用脑子的，比一比谁更不用。',
  },
  vsLose: {
    zhongkui: '你撞得比我狠。',
    houyi: '箭还是找着我了。',
    niumo: '力气这回合，我输了。',
  },
  ending: '常羊山的风把血迹吹干了。那具无头的身子仍旧朝着天的方向，舞着干戚，没有停过。',
  endingHard: '干戚落地。他站在常羊山顶，朝着天空的方向，把最后一个招式做完了。',
  role: '霸体 · 硬吃',
  // 霸体硬吃：起手扛得住一下，所以他敢在近身直接放慢招——别人不敢的正是这个
  aiBias: {
    near: { skill1: 2.4, skill2: 2.2, skill3: 2.0, retreat: 0.3, backstep: 0.3, block: 0.6 },
    mid: { approach: 2.2, skill1: 1.6, retreat: 0.4 },
    far: { approach: 2.4, charge: 1.2 },
  },
  id: 'xingtian', name: '刑天', hp: 210, speed: 4.0, jumpVel: 14,
  width: 60, height: 150,
  // 断首之后以乳为目、以脐为口——渲染层据此不画头（见 CharacterDef.headless）。
  // 「头没了，手还在」那句胜利台词，画面上得先兑现
  headless: true,
  palette: { main: '#8c3b2a', accent: '#d8c08a' },
  weapon: { kind: 'axe', len: 96, grip: 0.34, shaft: '#5a3a2a', edge: '#b08d57' }, // 戚（斧）
  adorn: {
    sashes: [
      { anchor: 'hip', segs: 7, segLen: 9, width: 7, color: '#8c3b2a', tip: '#d8c08a' },
      { anchor: 'hip', segs: 5, segLen: 8, width: 5, color: '#6b2a1e', tip: '#b08d57' },
    ],
    ember: { color: '#b08d57', rate: 6, rise: 0.2 },   // 扬起的土，不是火
    aura: '#b08d57',
    dust: '#b0a080',
  },
  superGlow: [RUST, EARTH],
  // 瓣数最少、最宽、尖端最钝：一面盾的轮廓
  superAura: { petals: 7, spread: 0.5, tipBlunt: 0.8, curl: 0.05 },
  moves: {
    jA: { ...mk('xingtian_jA', 'jA', '斧坠', 12, [6, 14, 10], 24, [7, 0], 0, 0,
      [2, -34, 100, 94], 'airStrike',
      [{ frame: 6, type: 'spark', color: BRONZE, x: 54, y: 16 }]), guard: 'overhead' },
    n1: mk('xingtian_n1', 'n1', '斧击', 10, [6, 3, 11], 16, [7, 0], 0, 0, [28, 62, 100, 36], 'thrust',
      [{ frame: 6, type: 'spark', color: BRONZE, x: 92, y: 76 }]),
    n2: { ...mk('xingtian_n2', 'n2', '扫斧', 11, [5, 3, 12], 16, [8, 0], 0, 0, [22, 0, 108, 48], 'sweep',
      [{ frame: 5, type: 'spark', color: RUST, x: 92, y: 16 }]), guard: 'low' },
    n3: mk('xingtian_n3', 'n3', '举斧劈', 15, [7, 4, 15], 24, [8, 9], 0, 0, [26, 30, 96, 116], 'upthrust',
      [{ frame: 7, type: 'trail', color: BRONZE, x: 58, y: 86 }, { frame: 9, type: 'burst', color: RUST, x: 62, y: 118 }]),
    // ── 霸体：起手期间**硬吃**几下不进硬直 ──────────────────────────────
    // 引擎此前没有这个概念：所有招式的起手都能被一发普攻打断，因此慢招在贴身战里
    // 根本不存在（起手 10 帧以上的必杀，对手 3-6 帧的普攻永远抢得过）。
    // 他把这块空白填上：血照掉、气照给，只是动作不断——**用血换一次出手**。
    // 只覆盖起手：判定生效后再扛就成了无脑对拼，而起手正是慢招唯一需要保护的那一段。
    //
    // 三记都是**一层**。第一版给了 1/2/3 层，实测发现两层以上根本够不着：
    // 起手最长的裂地斧也只有 16 帧，而对手一轮普攻（起手4+判定3+收招8）要 15 帧，
    // 连段取消最快也就在起手窗口里塞进两下——第三层永远用不上。
    // 真正的梯度在**起手长度**上：10/13/16 帧，起手越长霸体窗口越久、越可能真的扛到东西。
    s1: { ...mk('xingtian_s1', 's1', '干戚舞', 17, [10, 6, 16], 22, [11, 0], 260, 0, [26, 24, 160, 110], 'rush',
      [{ frame: 3, type: 'trail', color: RUST, x: 16, y: 60, size: 14 },
       { frame: 7, type: 'crescent', color: BRONZE, x: 90, y: 70, size: 48, angle: -0.3 },
       { frame: 11, type: 'shockwave', color: EARTH, x: 140, y: 0, size: 30 }], [{ frame: 3, vx: 9 }]),
      armor: 1, weaponScale: 1.6 },
    // 撞盾：一步一步顶过去。扛两下——他就是要你打他
    s2: { ...mk('xingtian_s2', 's2', '撞盾', 15, [13, 6, 18], 22, [16, 0], 300, 0, [22, 20, 140, 120], 'rush',
      [{ frame: 4, type: 'shockwave', color: EARTH, x: 40, y: 0, size: 28 },
       { frame: 9, type: 'burst', color: BRONZE, x: 90, y: 60 },
       { frame: 13, type: 'shockwave', color: RUST, x: 130, y: 0, size: 40 }], [{ frame: 4, vx: 7 }, { frame: 10, vx: 6 }]),
      armor: 1 },
    // 裂地斧：全场起手最慢的必杀（16 帧），扛三下。它是"我就站在这里劈，你拦不住"
    s3: { ...mk('xingtian_s3', 's3', '裂地斧', 20, [16, 6, 20], 28, [10, 10], 380, 0, [24, 0, 150, 150], 'cast',
      [{ frame: 8, type: 'glyph', color: RUST, x: 34, y: 90, size: 40 },
       { frame: 16, type: 'shockwave', color: EARTH, x: 100, y: 0, size: 52 },
       { frame: 19, type: 'burst', color: BRONZE, x: 110, y: 50 }]),
      armor: 1, knockdown: true, weaponScale: 1.9 },
    sp50: {
      id: 'xingtian_sp50', slot: 'sp50', name: '奥义·干戚', damage: 33,
      weaponScale: 2.6,
      startup: ASSAULT_STARTUP, active: ASSAULT_ACTIVE, recovery: ASSAULT_RECOVERY, hitstun: 33,
      knockback: { x: 14, y: 13 }, cooldown: 0, meterCost: 50,
      multiHit: { hits: 8, interval: 42 },
      carry: 1.3,
      hitbox: { x: 22, y: 0, w: 240, h: 180 },
      motionId: 'xingtianSp50',
      motionSeq: SEQ_XT_A,
      dash: driveDash(
        [{ frame: 146, vx: 7 }, { frame: 156, vx: 7 }, { frame: 166, vx: 6 }],
        ASSAULT_STARTUP + 20, ASSAULT_STARTUP + ASSAULT_ACTIVE - 40, 28, 1.7,
      ),
      fx: [
        { frame: 12, type: 'glyph', color: RUST, x: 0, y: 94, size: 44 },
        { frame: 48, type: 'shockwave', color: EARTH, x: 0, y: 0, size: 36 },
        { frame: 92, type: 'glyph', color: BRONZE, x: 0, y: 106, size: 60 },
        { frame: 132, type: 'flash', color: '#fff' },
        { frame: 152, type: 'crescent', color: BRONZE, x: 90, y: 76, size: 52, angle: -0.35 },
        { frame: 176, type: 'shockwave', color: RUST, x: 140, y: 0, size: 50 },
        ...sparkTrack(196, 300, 11, [EARTH, BRONZE]),
        { frame: 226, type: 'crescent', color: RUST, x: 150, y: 82, size: 58, angle: 0.3 },
        { frame: 276, type: 'shockwave', color: EARTH, x: 152, y: 0, size: 58 },
        { frame: 326, type: 'crescent', color: BRONZE, x: 156, y: 78, size: 62, angle: -0.4 },
        { frame: 370, type: 'ring', color: EARTH, x: 150, y: 72, size: 54 },
        ...sparkTrack(376, 430, 7, [BRONZE, EARTH], 154, 76),
        { frame: 418, type: 'shockwave', color: RUST, x: 156, y: 0, size: 64 },
        { frame: 446, type: 'flash', color: '#fff' },
        { frame: 456, type: 'crescent', color: RUST, x: 168, y: 84, size: 72, angle: 0.1 },
        { frame: 470, type: 'shockwave', color: EARTH, x: 164, y: 0, size: 76 },
        { frame: 490, type: 'ring', color: BRONZE, x: 158, y: 74, size: 64 },
        { frame: 518, type: 'ring', color: EARTH, x: 152, y: 72, size: 54 },
        { frame: 546, type: 'ring', color: RUST, x: 148, y: 70, size: 44 },
      ],
      brief: {
        startup: BRIEF_STARTUP, active: BRIEF_ACTIVE, recovery: BRIEF_RECOVERY,
        multiHit: { hits: 6, interval: 14 },
        carry: 1.1,
        motionSeq: SEQ_XT_B,
        dash: [{ frame: 34, vx: 8 }, { frame: 42, vx: 7 }, { frame: 62, vx: 2 }, { frame: 86, vx: 2 }],
        fx: [
          { frame: 4, type: 'glyph', color: RUST, x: 0, y: 98, size: 46 },
          { frame: 24, type: 'flash', color: '#fff' },
          { frame: 38, type: 'crescent', color: BRONZE, x: 90, y: 76, size: 52, angle: -0.35 },
          { frame: 58, type: 'shockwave', color: RUST, x: 140, y: 0, size: 48 },
          ...sparkTrack(62, 128, 9, [EARTH, BRONZE]),
          { frame: 92, type: 'crescent', color: RUST, x: 150, y: 82, size: 58, angle: 0.3 },
          { frame: 122, type: 'shockwave', color: EARTH, x: 156, y: 0, size: 62 },
          { frame: 144, type: 'ring', color: BRONZE, x: 152, y: 74, size: 56 },
        ],
      },
    },
    sp100: {
      id: 'xingtian_sp100', slot: 'sp100', name: '超必杀·断首不死', damage: 56,
      weaponScale: 2.8,
      startup: SUPER_STARTUP, active: SUPER_ACTIVE, recovery: SUPER_RECOVERY, hitstun: 43,
      knockback: { x: 13, y: 18 }, cooldown: 0, meterCost: 100,
      multiHit: { hits: 24, interval: 17 },
      carry: 1.3,
      hitbox: { x: 0, y: 0, w: 350, h: 230 },
      motionId: 'xingtianSp100',
      motionSeq: SEQ_XT,
      dash: driveDash(
        [{ frame: 82, vx: 8 }, { frame: 90, vx: 8 }, { frame: 98, vx: 7 }, { frame: 106, vx: 6 }],
        SUPER_STARTUP + 14, SUPER_STARTUP + SUPER_ACTIVE - 30, 22, 1.8,
      ),
      fx: [
        { frame: 6, type: 'glyph', color: RUST, x: 0, y: 98, size: 48 },
        { frame: 28, type: 'shockwave', color: EARTH, x: 0, y: 0, size: 38 },
        { frame: 50, type: 'glyph', color: BRONZE, x: 0, y: 110, size: 64 },
        { frame: 72, type: 'ring', color: RUST, x: 0, y: 76, size: 48 },
        { frame: 78, type: 'flash', color: '#fff' },
        { frame: 92, type: 'crescent', color: BRONZE, x: 70, y: 78, size: 54, angle: -0.35 },
        { frame: 118, type: 'shockwave', color: RUST, x: 140, y: 0, size: 48 },
        ...sparkTrack(122, 300, 20, [EARTH, BRONZE]),
        { frame: 160, type: 'crescent', color: RUST, x: 150, y: 84, size: 60, angle: 0.32 },
        { frame: 206, type: 'shockwave', color: EARTH, x: 152, y: 0, size: 60 },
        { frame: 250, type: 'crescent', color: BRONZE, x: 156, y: 80, size: 64, angle: -0.4 },
        { frame: 292, type: 'ring', color: EARTH, x: 152, y: 74, size: 58 },
        ...sparkTrack(314, 420, 14, [BRONZE, EARTH], 156, 78),
        { frame: 344, type: 'crescent', color: RUST, x: 158, y: 76, size: 68, angle: 0.4 },
        { frame: 374, type: 'shockwave', color: BRONZE, x: 158, y: 0, size: 66 },
        { frame: 406, type: 'ring', color: RUST, x: 154, y: 74, size: 62 },
        { frame: 436, type: 'glyph', color: RUST, x: 50, y: 112, size: 80 },
        { frame: 462, type: 'glyph', color: BRONZE, x: 112, y: 96, size: 66 },
        { frame: 478, type: 'flash', color: '#fff' },
        { frame: 492, type: 'crescent', color: RUST, x: 172, y: 88, size: 82, angle: 0.05 },
        { frame: 502, type: 'shockwave', color: EARTH, x: 168, y: 0, size: 80 },
        { frame: 516, type: 'burst', color: BRONZE, x: 178, y: 86, size: 32 },
        { frame: 532, type: 'ring', color: RUST, x: 164, y: 76, size: 70 },
        { frame: 550, type: 'ring', color: EARTH, x: 158, y: 72, size: 56 },
      ],
      brief: {
        startup: BRIEF_STARTUP, active: BRIEF_ACTIVE, recovery: BRIEF_RECOVERY,
        multiHit: { hits: 10, interval: 8 },
        carry: 1.1,
        motionSeq: SEQ_XT_B,
        dash: [{ frame: 34, vx: 8 }, { frame: 42, vx: 7 }, { frame: 62, vx: 2 }, { frame: 86, vx: 2 }],
        fx: [
          { frame: 4, type: 'glyph', color: RUST, x: 0, y: 98, size: 46 },
          { frame: 24, type: 'flash', color: '#fff' },
          { frame: 40, type: 'crescent', color: BRONZE, x: 90, y: 78, size: 54, angle: -0.35 },
          { frame: 62, type: 'shockwave', color: RUST, x: 140, y: 0, size: 48 },
          ...sparkTrack(66, 128, 9, [EARTH, BRONZE]),
          { frame: 96, type: 'crescent', color: RUST, x: 150, y: 84, size: 60, angle: 0.32 },
          { frame: 126, type: 'shockwave', color: EARTH, x: 156, y: 0, size: 64 },
          { frame: 146, type: 'ring', color: BRONZE, x: 152, y: 74, size: 58 },
        ],
      },
    },
  },
};
