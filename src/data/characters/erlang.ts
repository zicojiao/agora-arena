import type { Box, CharacterDef, FxEvent, Move, MoveSlot } from '../../engine/types';
import { SUPER_ACTIVE, SUPER_RECOVERY, SUPER_STARTUP, buildSuper, ERLANG_VOCAB } from '../superPhases';
import { driveDash, sparkTrack } from '../superChoreo';
import { ASSAULT_ACTIVE, ASSAULT_RECOVERY, ASSAULT_STARTUP, buildAssault } from '../superPhases';
import { BRIEF_ACTIVE, BRIEF_RECOVERY, BRIEF_STARTUP, buildBrief } from '../superPhases';
const SEQ_ERLANG_B = buildBrief('erlang', ERLANG_VOCAB).seq;
const SEQ_ERLANG_A = buildAssault('erlang', ERLANG_VOCAB).seq;
const SEQ_ERLANG = buildSuper('erlang', ERLANG_VOCAB).seq;

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

const AZURE = '#5ab0ff', SILVER = '#dfe8ff', VIOLET = '#9a6bff';

export const ERLANG: CharacterDef = {
  // 二郎神原来同时付三份代价：血最低(180)、速度低于哪吒(4.6 vs 5)、必杀起手最慢(s1 12 帧)。
  // 实测同档 AI 下总胜率只有 37%（垫底）。定位是远程牵制，代价应当只付在起手帧上，
  // 血量拉回中位——他不是脆皮刺客，是站桩打光束的。
  vsIntro: {
    wukong: '五百年了，再来。',
  },
  vsTaunt: {
    wukong: '又是你。',
  },
  crown: { kind: 'thirdEye', color: '#dfe8ff' },
  quotes: { win: '天眼之下，你的破绽早写在脸上。', lose: '哮天，我们走。',
    taunt: '这一招你还要用几次？' , intro: '三只眼都盯着你呢。'},
  vs: {
    wukong: '七十二变数到头，还是这一只猴。',
    nezha: '天条写着同僚不得相斗——写归写。',
    houyi: '射得远，不如射得准。',
    bajie: '天蓬元帅——如今该叫你什么来着。',
    leizhen: '翅膀是雷劈出来的，路还是我走得熟。',
  },
  vsLose: {
    wukong: '这猴子，比上回难缠。',
    nezha: '天条不许我全力，罢了。',
    houyi: '射日的那张弓，服了。',
    bajie: '天蓬元帅……名不虚传。',
    leizhen: '你那对翅膀，我够不着。',
  },
  ending: '第三只眼缓缓阖上。他把刀收回鞘里，转身时哮天犬正蹲在山道尽头等他。',
  endingHard: '第三只眼再没睁开过。灌江口的香火照旧，只是庙里那尊像，从此低着头。',
  // 长手要配长收招，这是格斗游戏给"高回报"配的那份风险。改之前二郎神的 s1 攻程 260
  // （全场最长，比哪吒的 186 长 40%），收招却只有 16 帧、和哪吒的 14 帧差不多——
  // 短手角色够不着又抓不到，只能挨打。实测第二关（BOSS 正是二郎神）的通关率完全按攻程排序：
  // 二郎神镜像 63% / 牛魔王 54% / 孙悟空 29% / 哪吒 25%，四关复利下来选二郎神比选哪吒
  // 容易十倍（13% vs 1%）。s1 收招 16→24、s2 15→20，让"够不着"至少能换来"抓得到"。
  role: '远程 · 长手', id: 'erlang', name: '二郎神', hp: 195, speed: 4.6, jumpVel: 16,
  width: 54, height: 152, palette: { main: '#3f6bd8', accent: '#e8ecff' },
  weapon: { kind: 'glaive', len: 104, grip: 0.3, shaft: '#4a5a7a', edge: '#dfe8ff' }, // 三尖两刃刀
  adorn: {
    // 战袍后摆：长而挺，摆动比哪吒的绫子沉
    sashes: [
      { anchor: 'shoulder', segs: 10, segLen: 12, width: 9, color: '#2f4f9e', tip: '#dfe8ff' },
    ],
    ember: { color: '#5ab0ff', rate: 14, rise: 0.5 },
    aura: '#5ab0ff',
    dust: '#9aa8c4',
  },
  // 石青→紫电，取自本文件的 AZURE/VIOLET：天眼光束一脉的青紫同源配色
  superGlow: [AZURE, VIOLET],
  // 远程压制：花瓣多而细窄（spread 小）、尖端不裂口（tipBlunt=0 收成锐点），读出放射的锋芒
  superAura: { petals: 22, spread: 0.22, tipBlunt: 0, curl: 0 },
  moves: {
    // 中段：蹲防挡不住
    jA: { ...mk('erlang_jA', 'jA', '三尖刀·俯劈', 10, [5, 14, 8], 22, [5, 0], 0, 0,
      [6, -32, 100, 90], 'airStrike',
      [{ frame: 6, type: 'spark', color: AZURE, x: 60, y: 18 }]), guard: 'overhead' },
    n1: mk('erlang_n1', 'n1', '三尖刀·斩', 8, [5, 3, 9], 14, [5, 0], 0, 0, [30, 60, 105, 40], 'thrust',
      [{ frame: 5, type: 'spark', color: SILVER, x: 100, y: 78 }]),
    // 下段：判定框贴地，站防挡不住
    n2: { ...mk('erlang_n2', 'n2', '三尖刀·横扫', 9, [4, 3, 10], 15, [6, 0], 0, 0, [24, 0, 116, 48], 'sweep',
      [{ frame: 4, type: 'spark', color: SILVER, x: 95, y: 20 }]), guard: 'low' },
    n3: mk('erlang_n3', 'n3', '三尖刀·重劈', 13, [6, 4, 14], 22, [8, 9], 0, 0, [28, 30, 95, 120], 'slam',
      [{ frame: 7, type: 'trail', color: AZURE, x: 60, y: 110 }, { frame: 9, type: 'burst', color: SILVER, x: 70, y: 60 }]),
    s1: {
      ...mk('erlang_s1', 's1', '天眼光束', 16, [12, 6, 24], 20, [10, 0], 270, 0, [80, 70, 260, 40], 'cast',
      [{ frame: 5, type: 'glyph', color: VIOLET, x: 10, y: 130, size: 35 }, { frame: 12, type: 'beam', color: AZURE, x: 20, y: 130, size: 36 },
       { frame: 15, type: 'spark', color: SILVER, x: 300, y: 90 }]),
      projectile: {
        // 出手在近身判定窗口结束之后——贴脸放不该既吃肉搏框又吃实物

        spawnFrame: 19, vx: 11, life: 90, damage: 15, hitstun: 24,
        knockback: { x: 7, y: 0 }, w: 70, h: 26, y: 92,
        kind: 'beam', color: '#5ab0ff',
      },
    },
    s2: mk('erlang_s2', 's2', '哮天犬突袭', 15, [9, 6, 20], 18, [12, 0], 330, 0, [60, 40, 220, 60], 'cast',
      [{ frame: 4, type: 'burst', color: SILVER, x: 30, y: 40 }, { frame: 8, type: 'trail', color: SILVER, x: 120, y: 45, size: 14 },
       { frame: 12, type: 'trail', color: SILVER, x: 220, y: 45, size: 12 }]),
    s3: { ...mk('erlang_s3', 's3', '天罗地网', 18, [11, 8, 18], 26, [5, 13], 360, 0, [40, 20, 220, 160], 'cast',
      [{ frame: 5, type: 'glyph', color: AZURE, x: 100, y: 100, size: 60 }, { frame: 11, type: 'ring', color: AZURE, x: 100, y: 100 },
       { frame: 15, type: 'ring', color: VIOLET, x: 150, y: 90 }]), weaponScale: 1.4 },
    // 奥义也是十秒级演出，但骨架与超必杀刻意不同：超必杀是「密集连打一路逼到版边」，
    // 奥义是「长蓄力 + 少数几下极重的技」——两档不只是尺寸差别，节奏形态就不一样，
    // 玩家一眼能分出放的是哪一档。九段：起势60 长蓄80 突进40 首击40 连击90 挑空50
    // 追击80 终结90 收势70。
    sp50: {
      id: 'erlang_sp50', slot: 'sp50', name: '奥义·纵天斩', damage: 31,
      weaponScale: 1.8,
      startup: ASSAULT_STARTUP, active: ASSAULT_ACTIVE, recovery: ASSAULT_RECOVERY, hitstun: 32,
      knockback: { x: 10, y: 8 }, cooldown: 0, meterCost: 50,
      // 段数比超必杀少一半、每下更重，结构上守住两档的区别
      multiHit: { hits: 9, interval: 38 },
      carry: 1.5,
      hitbox: { x: 20, y: 20, w: 240, h: 180 },
      motionId: 'erlangSp50',
      motionSeq: SEQ_ERLANG_A,
      dash: driveDash(
        [{ frame: 146, vx: 8 }, { frame: 156, vx: 8 }, { frame: 166, vx: 7 }],
        ASSAULT_STARTUP + 20, ASSAULT_STARTUP + ASSAULT_ACTIVE - 40, 26, 2,
      ),
      fx: [
        { frame: 10, type: 'glyph', color: SILVER, x: 0, y: 105, size: 50 },
        { frame: 44, type: 'ring', color: AZURE, x: 0, y: 70, size: 34 },
        { frame: 90, type: 'glyph', color: SILVER, x: 0, y: 118, size: 66 },
        { frame: 132, type: 'flash', color: '#fff' },
        { frame: 148, type: 'trail', color: AZURE, x: 20, y: 10, size: 12 },
        { frame: 160, type: 'trail', color: SILVER, x: 70, y: 8, size: 10 },
        { frame: 182, type: 'shockwave', color: SILVER, x: 150, y: 0, size: 48 },
        ...sparkTrack(190, 300, 12, [AZURE, SILVER]),
        { frame: 214, type: 'crescent', color: SILVER, x: 150, y: 90, size: 52, angle: -0.3 },
        { frame: 262, type: 'crescent', color: AZURE, x: 156, y: 86, size: 58, angle: 0.3 },
        { frame: 316, type: 'crescent', color: SILVER, x: 158, y: 60, size: 62, angle: -1.1 },
        { frame: 364, type: 'ring', color: AZURE, x: 156, y: 80, size: 56 },
        ...sparkTrack(370, 430, 8, [SILVER, AZURE], 164, 84),
        { frame: 412, type: 'shockwave', color: AZURE, x: 162, y: 0, size: 62 },
        { frame: 442, type: 'flash', color: '#fff' },
        { frame: 448, type: 'burst', color: AZURE, x: 172, y: 90, size: 30 },
        { frame: 456, type: 'burst', color: SILVER, x: 192, y: 84, size: 26 },
        { frame: 464, type: 'shockwave', color: SILVER, x: 172, y: 0, size: 70 },
        { frame: 474, type: 'bolt', color: SILVER, x: 182, y: 128, size: 58, angle: 1.25 },
        { frame: 496, type: 'ring', color: AZURE, x: 162, y: 80, size: 68 },
        { frame: 540, type: 'ring', color: SILVER, x: 158, y: 76, size: 52 },
      ],
    
      // 打不死人时换上的三秒短版（见 Move.brief 的说明）。姿势词汇与长版同源，
      // 砍掉的是中段铺陈，不是换一套动作。
      brief: {
        startup: BRIEF_STARTUP, active: BRIEF_ACTIVE, recovery: BRIEF_RECOVERY,
        multiHit: { hits: 7, interval: 12 },
        carry: 1.1,
        motionSeq: SEQ_ERLANG_B,
        dash: [{ frame: 34, vx: 9 }, { frame: 42, vx: 8 }, { frame: 62, vx: 2.4 }, { frame: 86, vx: 2.4 }],
        fx: [
          { frame: 4, type: 'glyph', color: SILVER, x: 0, y: 108, size: 52 },
          { frame: 24, type: 'flash', color: '#fff' },
          { frame: 32, type: 'trail', color: AZURE, x: 20, y: 10, size: 11 },
          { frame: 42, type: 'trail', color: SILVER, x: 70, y: 8, size: 10 },
          { frame: 56, type: 'shockwave', color: SILVER, x: 150, y: 0, size: 44 },
          ...sparkTrack(60, 128, 10, [AZURE, SILVER]),
          { frame: 74, type: 'crescent', color: SILVER, x: 150, y: 90, size: 48, angle: -0.3 },
          { frame: 102, type: 'crescent', color: AZURE, x: 156, y: 86, size: 52, angle: 0.28 },
          { frame: 130, type: 'burst', color: AZURE, x: 172, y: 90, size: 28 },
          { frame: 136, type: 'shockwave', color: SILVER, x: 172, y: 0, size: 60 },
          { frame: 144, type: 'ring', color: SILVER, x: 160, y: 80, size: 58 },
        ],
      },
    },
    // 十秒超必杀（600 帧）。十五段骨架与另外三人一致——起势/蓄力/突进/首击/连打×3/
    // 逼近/挑空/空中追击/落地砸/终结蓄力/爆发/余波/收势——姿势词汇各自不同，见
    // superPhases.ts。此前是 4 段 6x-7x 帧（约 1.1s），只有普通技能的两倍长，读起来
    // 跟普通招没区别。
    sp100: {
      id: 'erlang_sp100', slot: 'sp100', name: '超必杀·天眼灭世', damage: 54,
      weaponScale: 1.5,
      startup: SUPER_STARTUP, active: SUPER_ACTIVE, recovery: SUPER_RECOVERY, hitstun: 42,
      knockback: { x: 8, y: 16 }, cooldown: 0, meterCost: 100,
      multiHit: { hits: 30, interval: 13 },
      // 连打中间段把对手朝版边推，出招者靠贯穿 active 的小 dash 同步跟进：
      // 两人一起朝版边挪，这就是「逼到版边再轰」那一拍
      carry: 1.5,
      hitbox: { x: 0, y: 0, w: 360, h: 220 },
      motionId: 'erlangSp100',
      motionSeq: SEQ_ERLANG,
      dash: driveDash(
        [{ frame: 82, vx: 9 }, { frame: 90, vx: 9 }, { frame: 98, vx: 8 }, { frame: 106, vx: 7 }],
        SUPER_STARTUP + 14, SUPER_STARTUP + SUPER_ACTIVE - 30, 20, 2.2,
      ),
      fx: [
        { frame: 6, type: 'glyph', color: SILVER, x: 0, y: 110, size: 56 },
        { frame: 26, type: 'ring', color: AZURE, x: 0, y: 70, size: 38 },
        { frame: 48, type: 'glyph', color: SILVER, x: 0, y: 120, size: 72 },
        { frame: 70, type: 'ring', color: SILVER, x: 0, y: 80, size: 52 },
        { frame: 78, type: 'flash', color: '#fff' },
        { frame: 84, type: 'trail', color: AZURE, x: 10, y: 10, size: 11 },
        { frame: 92, type: 'trail', color: AZURE, x: 50, y: 8, size: 10 },
        { frame: 100, type: 'trail', color: SILVER, x: 90, y: 8, size: 9 },
        { frame: 112, type: 'shockwave', color: SILVER, x: 150, y: 0, size: 44 },
        ...sparkTrack(116, 300, 26, [AZURE, SILVER]),
        { frame: 150, type: 'crescent', color: SILVER, x: 150, y: 90, size: 48, angle: -0.3 },
        { frame: 195, type: 'crescent', color: AZURE, x: 155, y: 88, size: 54, angle: 0.25 },
        { frame: 240, type: 'shockwave', color: AZURE, x: 160, y: 0, size: 60 },
        { frame: 265, type: 'crescent', color: SILVER, x: 160, y: 92, size: 58, angle: -0.2 },
        ...sparkTrack(310, 420, 16, [SILVER, AZURE], 165, 84),
        { frame: 330, type: 'crescent', color: AZURE, x: 158, y: 60, size: 64, angle: -1.1 },
        { frame: 360, type: 'ring', color: SILVER, x: 155, y: 80, size: 58 },
        { frame: 395, type: 'shockwave', color: SILVER, x: 165, y: 0, size: 66 },
        { frame: 430, type: 'glyph', color: SILVER, x: 40, y: 120, size: 84 },
        { frame: 455, type: 'glyph', color: AZURE, x: 90, y: 100, size: 70 },
        { frame: 478, type: 'flash', color: '#fff' },
        { frame: 484, type: 'burst', color: AZURE, x: 175, y: 90, size: 32 },
        { frame: 490, type: 'burst', color: SILVER, x: 195, y: 84, size: 28 },
        { frame: 496, type: 'shockwave', color: SILVER, x: 175, y: 0, size: 76 },
        { frame: 504, type: 'bolt', color: SILVER, x: 185, y: 130, size: 62, angle: 1.2 },
        { frame: 512, type: 'bolt', color: AZURE, x: 150, y: 130, size: 56, angle: 1.9 },
        { frame: 524, type: 'ring', color: AZURE, x: 165, y: 80, size: 74 },
        { frame: 545, type: 'ring', color: SILVER, x: 160, y: 76, size: 60 },
      ],
    
      // 打不死人时换上的三秒短版（见 Move.brief 的说明）。姿势词汇与长版同源，
      // 砍掉的是中段铺陈，不是换一套动作。
      brief: {
        startup: BRIEF_STARTUP, active: BRIEF_ACTIVE, recovery: BRIEF_RECOVERY,
        multiHit: { hits: 14, interval: 6 },
        carry: 0.9,
        motionSeq: SEQ_ERLANG_B,
        dash: [{ frame: 34, vx: 9 }, { frame: 42, vx: 8 }, { frame: 62, vx: 2.4 }, { frame: 86, vx: 2.4 }],
        fx: [
          { frame: 4, type: 'glyph', color: SILVER, x: 0, y: 108, size: 52 },
          { frame: 24, type: 'flash', color: '#fff' },
          { frame: 32, type: 'trail', color: AZURE, x: 20, y: 10, size: 11 },
          { frame: 42, type: 'trail', color: SILVER, x: 70, y: 8, size: 10 },
          { frame: 56, type: 'shockwave', color: SILVER, x: 150, y: 0, size: 44 },
          ...sparkTrack(60, 128, 10, [AZURE, SILVER]),
          { frame: 74, type: 'crescent', color: SILVER, x: 150, y: 90, size: 48, angle: -0.3 },
          { frame: 102, type: 'crescent', color: AZURE, x: 156, y: 86, size: 52, angle: 0.28 },
          { frame: 130, type: 'burst', color: AZURE, x: 172, y: 90, size: 28 },
          { frame: 136, type: 'shockwave', color: SILVER, x: 172, y: 0, size: 60 },
          { frame: 144, type: 'ring', color: SILVER, x: 160, y: 80, size: 58 },
        ],
      },
    },
  },
};
