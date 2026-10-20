import type { Box, CharacterDef, FxEvent, Move, MoveSlot } from '../../engine/types';
import { SUPER_ACTIVE, SUPER_RECOVERY, SUPER_STARTUP, buildSuper, WUKONG_VOCAB } from '../superPhases';
import { driveDash, sparkTrack } from '../superChoreo';
import { ASSAULT_ACTIVE, ASSAULT_RECOVERY, ASSAULT_STARTUP, buildAssault } from '../superPhases';
import { BRIEF_ACTIVE, BRIEF_RECOVERY, BRIEF_STARTUP, buildBrief } from '../superPhases';
const SEQ_WUKONG_B = buildBrief('wukong', WUKONG_VOCAB).seq;
const SEQ_WUKONG_A = buildAssault('wukong', WUKONG_VOCAB).seq;
const SEQ_WUKONG = buildSuper('wukong', WUKONG_VOCAB).seq;

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

const GOLD = '#ffd23f', CLOUD = '#fff6e0', FIRE = '#ff8c2b';

export const WUKONG: CharacterDef = {
  // 血、速度、伤害三项全在前列，实测总胜率 65% 一枝独秀。速度让给哪吒（他才是踩风火轮的），
  // 悟空的立身之本是伤害与血量的均衡，不是样样第一。
  vsIntro: {
    bajie: '呆子，别拖后腿。',
    erlang: '你那条狗呢？',
    niumo: '大哥，得罪了。',
    baigu: '又是你这张脸。',
  },
  vsTaunt: {
    erlang: '狗呢？',
    bajie: '呆子。',
    niumo: '大哥。',
  },
  crown: { kind: 'ring', color: '#ffd23f' },
  quotes: { win: '一个跟头十万八千里，你追得上？', lose: '罢了罢了，这一棒算你接住了。',
    taunt: '起来啊，俺还没热身。' , intro: '棒子无眼，你自己当心。'},
  vs: {
    nezha: '小哪吒又长高了些，本事没跟着长。',
    erlang: '梅山那六个呢？叫齐了再来也是这个数。',
    niumo: '大哥，这一棒就算把结拜还你了。',
    honghaier: '叫一声叔叔，俺就当今天没打过。',
    baigu: '三回了。这次不必师父开口。',
    bajie: '挑唆的时候嘴挺快，动手怎么这么慢。',
    tieshan: '嫂嫂那把扇子，俺在里头待过。',
  },
  vsLose: {
    nezha: '小哪吒，是俺小看你了。',
    erlang: '梅山那六个，一个没来。',
    niumo: '大哥……还是你力气大。',
    honghaier: '侄儿，你这火比你爹还烈。',
    baigu: '第四回，让你走了。',
    bajie: '呆子……几时这么能打了。',
    tieshan: '嫂嫂那扇子，真不好惹。',
  },
  ending: '棍子往肩上一横，他打了个哈欠。天上地下都问过一遍了，也没人再敢答话。',
  endingHard: '花果山的猴子们等着他讲这一趟。他讲到一半就睡着了——天大的事，说起来也不过一觉的工夫。',
  role: '均衡 · 全能', id: 'wukong', name: '孙悟空', hp: 200, speed: 5.1, jumpVel: 18,
  width: 54, height: 150, palette: { main: '#c9862b', accent: '#ffe8b0' },
  weapon: { kind: 'staff', len: 118, grip: 0.5, shaft: '#c9862b', edge: '#ffd23f' }, // 如意金箍棒
  adorn: {
    // 虎皮裙的两条系带 + 筋斗云的余絮
    sashes: [
      { anchor: 'hip', segs: 9, segLen: 9, width: 6, color: '#c9862b', tip: '#fff6e0' },
      { anchor: 'hip', segs: 7, segLen: 8, width: 4.5, color: '#8a5a2b', tip: '#ffd23f' },
    ],
    ember: { color: '#fff6e0', rate: 12, rise: 0.42 },
    aura: '#ffd23f',
    dust: '#cbb68a',
  },
  // 金→云白，取自本文件的 GOLD/CLOUD：金箍棒与筋斗云一脉的同源配色
  superGlow: [GOLD, CLOUD],
  // 均衡：花瓣数/宽厚/尖端/卷曲全取原始基准值，四人里最接近 Task 28 之前的那朵花
  superAura: { petals: 14, spread: 0.42, tipBlunt: 0, curl: 0 },
  moves: {
    // 中段：蹲防挡不住
    jA: { ...mk('wukong_jA', 'jA', '如意棒·下砸', 10, [5, 14, 8], 22, [5, 0], 0, 0,
      [0, -34, 104, 92], 'airStrike',
      [{ frame: 6, type: 'spark', color: GOLD, x: 60, y: 16 }]), weaponScale: 1.4, guard: 'overhead' },
    n1: mk('wukong_n1', 'n1', '如意棒·击', 8, [4, 3, 8], 14, [5, 0], 0, 0, [28, 65, 100, 32], 'thrust',
      [{ frame: 4, type: 'spark', color: GOLD, x: 95, y: 80 }]),
    // 下段：判定框贴地，站防挡不住
    n2: { ...mk('wukong_n2', 'n2', '如意棒·扫', 9, [4, 3, 9], 15, [7, 0], 0, 0, [22, 0, 116, 48], 'sweep',
      [{ frame: 4, type: 'spark', color: GOLD, x: 100, y: 20 }]), weaponScale: 1.5, guard: 'low' },
    n3: mk('wukong_n3', 'n3', '如意棒·挑', 13, [5, 4, 13], 22, [7, 10], 0, 0, [25, 40, 85, 110], 'upthrust',
      [{ frame: 6, type: 'trail', color: GOLD, x: 60, y: 90 }, { frame: 8, type: 'burst', color: FIRE, x: 65, y: 130 }]),
    s1: { ...mk('wukong_s1', 's1', '横扫千军', 17, [7, 5, 15], 20, [14, 0], 240, 0, [25, 50, 190, 60], 'rush',
      [{ frame: 4, type: 'trail', color: GOLD, x: 60, y: 75, size: 12 }, { frame: 8, type: 'trail', color: GOLD, x: 140, y: 75, size: 12 },
       { frame: 11, type: 'spark', color: CLOUD, x: 180, y: 70 }], [{ frame: 3, vx: 10 }]), weaponScale: 2.4 },
    // 起手 6 帧配 160x70 的框，是全场唯一又快又宽的必杀（其他人 9/10/12 帧）。
    // 孙悟空实测总胜率 62-67%、打谁都赢，短板一处都没有——速度得付点代价，收到 9 帧。
    s2: mk('wukong_s2', 's2', '筋斗云突袭', 15, [9, 6, 14], 18, [11, 0], 300, 0, [30, 50, 160, 70], 'rush',
      [{ frame: 2, type: 'trail', color: CLOUD, x: -20, y: 70, size: 16 }, { frame: 5, type: 'trail', color: CLOUD, x: 40, y: 70, size: 14 },
       { frame: 8, type: 'trail', color: CLOUD, x: 110, y: 70, size: 12 }], [{ frame: 2, vx: 16 }]),
    s3: mk('wukong_s3', 's3', '分身幻击', 17, [10, 6, 18], 24, [6, 12], 360, 0, [60, 30, 180, 140], 'cast',
      [{ frame: 4, type: 'glyph', color: GOLD, x: 40, y: 100, size: 45 }, { frame: 10, type: 'burst', color: GOLD, x: 100, y: 90 },
       { frame: 13, type: 'burst', color: CLOUD, x: 180, y: 90 }]),
    // 奥义也是十秒级演出，但骨架与超必杀刻意不同：超必杀是「密集连打一路逼到版边」，
    // 奥义是「长蓄力 + 少数几下极重的技」——两档不只是尺寸差别，节奏形态就不一样，
    // 玩家一眼能分出放的是哪一档。九段：起势60 长蓄80 突进40 首击40 连击90 挑空50
    // 追击80 终结90 收势70。
    sp50: {
      id: 'wukong_sp50', slot: 'sp50', name: '奥义·如意棒撑天', damage: 32,
      weaponScale: 3.2,
      startup: ASSAULT_STARTUP, active: ASSAULT_ACTIVE, recovery: ASSAULT_RECOVERY, hitstun: 32,
      knockback: { x: 8, y: 16 }, cooldown: 0, meterCost: 50,
      // 段数比超必杀少一半、每下更重，结构上守住两档的区别
      multiHit: { hits: 10, interval: 34 },
      carry: 1.3,
      hitbox: { x: 30, y: 0, w: 140, h: 240 },
      motionId: 'wukongSp50',
      motionSeq: SEQ_WUKONG_A,
      dash: driveDash(
        [{ frame: 146, vx: 8 }, { frame: 156, vx: 8 }, { frame: 166, vx: 7 }],
        ASSAULT_STARTUP + 20, ASSAULT_STARTUP + ASSAULT_ACTIVE - 40, 26, 2,
      ),
      fx: [
        { frame: 10, type: 'glyph', color: GOLD, x: 0, y: 105, size: 50 },
        { frame: 44, type: 'ring', color: CLOUD, x: 0, y: 70, size: 34 },
        { frame: 90, type: 'glyph', color: GOLD, x: 0, y: 118, size: 66 },
        { frame: 132, type: 'flash', color: '#fff' },
        { frame: 148, type: 'trail', color: CLOUD, x: 20, y: 10, size: 12 },
        { frame: 160, type: 'trail', color: GOLD, x: 70, y: 8, size: 10 },
        { frame: 182, type: 'shockwave', color: GOLD, x: 150, y: 0, size: 48 },
        ...sparkTrack(190, 300, 12, [CLOUD, GOLD]),
        { frame: 214, type: 'crescent', color: GOLD, x: 150, y: 90, size: 52, angle: -0.3 },
        { frame: 262, type: 'crescent', color: CLOUD, x: 156, y: 86, size: 58, angle: 0.3 },
        { frame: 316, type: 'crescent', color: GOLD, x: 158, y: 60, size: 62, angle: -1.1 },
        { frame: 364, type: 'ring', color: CLOUD, x: 156, y: 80, size: 56 },
        ...sparkTrack(370, 430, 8, [GOLD, CLOUD], 164, 84),
        { frame: 412, type: 'shockwave', color: CLOUD, x: 162, y: 0, size: 62 },
        { frame: 442, type: 'flash', color: '#fff' },
        { frame: 448, type: 'burst', color: CLOUD, x: 172, y: 90, size: 30 },
        { frame: 456, type: 'burst', color: GOLD, x: 192, y: 84, size: 26 },
        { frame: 464, type: 'shockwave', color: GOLD, x: 172, y: 0, size: 70 },
        { frame: 474, type: 'bolt', color: GOLD, x: 182, y: 128, size: 58, angle: 1.25 },
        { frame: 496, type: 'ring', color: CLOUD, x: 162, y: 80, size: 68 },
        { frame: 540, type: 'ring', color: GOLD, x: 158, y: 76, size: 52 },
      ],
    
      // 打不死人时换上的三秒短版（见 Move.brief 的说明）。姿势词汇与长版同源，
      // 砍掉的是中段铺陈，不是换一套动作。
      brief: {
        startup: BRIEF_STARTUP, active: BRIEF_ACTIVE, recovery: BRIEF_RECOVERY,
        multiHit: { hits: 7, interval: 12 },
        carry: 1.1,
        motionSeq: SEQ_WUKONG_B,
        dash: [{ frame: 34, vx: 9 }, { frame: 42, vx: 8 }, { frame: 62, vx: 2.4 }, { frame: 86, vx: 2.4 }],
        fx: [
          { frame: 4, type: 'glyph', color: GOLD, x: 0, y: 108, size: 52 },
          { frame: 24, type: 'flash', color: '#fff' },
          { frame: 32, type: 'trail', color: CLOUD, x: 20, y: 10, size: 11 },
          { frame: 42, type: 'trail', color: GOLD, x: 70, y: 8, size: 10 },
          { frame: 56, type: 'shockwave', color: GOLD, x: 150, y: 0, size: 44 },
          ...sparkTrack(60, 128, 10, [CLOUD, GOLD]),
          { frame: 74, type: 'crescent', color: GOLD, x: 150, y: 90, size: 48, angle: -0.3 },
          { frame: 102, type: 'crescent', color: CLOUD, x: 156, y: 86, size: 52, angle: 0.28 },
          { frame: 130, type: 'burst', color: CLOUD, x: 172, y: 90, size: 28 },
          { frame: 136, type: 'shockwave', color: GOLD, x: 172, y: 0, size: 60 },
          { frame: 144, type: 'ring', color: GOLD, x: 160, y: 80, size: 58 },
        ],
      },
    },
    // 十秒超必杀（600 帧）。十五段骨架与另外三人一致——起势/蓄力/突进/首击/连打×3/
    // 逼近/挑空/空中追击/落地砸/终结蓄力/爆发/余波/收势——姿势词汇各自不同，见
    // superPhases.ts。此前是 4 段 6x-7x 帧（约 1.1s），只有普通技能的两倍长，读起来
    // 跟普通招没区别。
    sp100: {
      id: 'wukong_sp100', slot: 'sp100', name: '超必杀·大圣降临', damage: 55,
      weaponScale: 2.0,
      startup: SUPER_STARTUP, active: SUPER_ACTIVE, recovery: SUPER_RECOVERY, hitstun: 42,
      knockback: { x: 10, y: 19 }, cooldown: 0, meterCost: 100,
      multiHit: { hits: 40, interval: 10 },
      // 连打中间段把对手朝版边推，出招者靠贯穿 active 的小 dash 同步跟进：
      // 两人一起朝版边挪，这就是「逼到版边再轰」那一拍
      carry: 1.2,
      hitbox: { x: 0, y: 0, w: 340, h: 240 },
      motionId: 'wukongSp100',
      motionSeq: SEQ_WUKONG,
      dash: driveDash(
        [{ frame: 82, vx: 9 }, { frame: 90, vx: 9 }, { frame: 98, vx: 8 }, { frame: 106, vx: 7 }],
        SUPER_STARTUP + 14, SUPER_STARTUP + SUPER_ACTIVE - 30, 20, 2.2,
      ),
      fx: [
        { frame: 6, type: 'glyph', color: GOLD, x: 0, y: 110, size: 56 },
        { frame: 26, type: 'ring', color: CLOUD, x: 0, y: 70, size: 38 },
        { frame: 48, type: 'glyph', color: GOLD, x: 0, y: 120, size: 72 },
        { frame: 70, type: 'ring', color: GOLD, x: 0, y: 80, size: 52 },
        { frame: 78, type: 'flash', color: '#fff' },
        { frame: 84, type: 'trail', color: CLOUD, x: 10, y: 10, size: 11 },
        { frame: 92, type: 'trail', color: CLOUD, x: 50, y: 8, size: 10 },
        { frame: 100, type: 'trail', color: GOLD, x: 90, y: 8, size: 9 },
        { frame: 112, type: 'shockwave', color: GOLD, x: 150, y: 0, size: 44 },
        ...sparkTrack(116, 300, 26, [CLOUD, GOLD]),
        { frame: 150, type: 'crescent', color: GOLD, x: 150, y: 90, size: 48, angle: -0.3 },
        { frame: 195, type: 'crescent', color: CLOUD, x: 155, y: 88, size: 54, angle: 0.25 },
        { frame: 240, type: 'shockwave', color: CLOUD, x: 160, y: 0, size: 60 },
        { frame: 265, type: 'crescent', color: GOLD, x: 160, y: 92, size: 58, angle: -0.2 },
        ...sparkTrack(310, 420, 16, [GOLD, CLOUD], 165, 84),
        { frame: 330, type: 'crescent', color: CLOUD, x: 158, y: 60, size: 64, angle: -1.1 },
        { frame: 360, type: 'ring', color: GOLD, x: 155, y: 80, size: 58 },
        { frame: 395, type: 'shockwave', color: GOLD, x: 165, y: 0, size: 66 },
        { frame: 430, type: 'glyph', color: GOLD, x: 40, y: 120, size: 84 },
        { frame: 455, type: 'glyph', color: CLOUD, x: 90, y: 100, size: 70 },
        { frame: 478, type: 'flash', color: '#fff' },
        { frame: 484, type: 'burst', color: CLOUD, x: 175, y: 90, size: 32 },
        { frame: 490, type: 'burst', color: GOLD, x: 195, y: 84, size: 28 },
        { frame: 496, type: 'shockwave', color: GOLD, x: 175, y: 0, size: 76 },
        { frame: 504, type: 'bolt', color: GOLD, x: 185, y: 130, size: 62, angle: 1.2 },
        { frame: 512, type: 'bolt', color: CLOUD, x: 150, y: 130, size: 56, angle: 1.9 },
        { frame: 524, type: 'ring', color: CLOUD, x: 165, y: 80, size: 74 },
        { frame: 545, type: 'ring', color: GOLD, x: 160, y: 76, size: 60 },
      ],
    
      // 打不死人时换上的三秒短版（见 Move.brief 的说明）。姿势词汇与长版同源，
      // 砍掉的是中段铺陈，不是换一套动作。
      brief: {
        startup: BRIEF_STARTUP, active: BRIEF_ACTIVE, recovery: BRIEF_RECOVERY,
        multiHit: { hits: 14, interval: 6 },
        carry: 0.9,
        motionSeq: SEQ_WUKONG_B,
        dash: [{ frame: 34, vx: 9 }, { frame: 42, vx: 8 }, { frame: 62, vx: 2.4 }, { frame: 86, vx: 2.4 }],
        fx: [
          { frame: 4, type: 'glyph', color: GOLD, x: 0, y: 108, size: 52 },
          { frame: 24, type: 'flash', color: '#fff' },
          { frame: 32, type: 'trail', color: CLOUD, x: 20, y: 10, size: 11 },
          { frame: 42, type: 'trail', color: GOLD, x: 70, y: 8, size: 10 },
          { frame: 56, type: 'shockwave', color: GOLD, x: 150, y: 0, size: 44 },
          ...sparkTrack(60, 128, 10, [CLOUD, GOLD]),
          { frame: 74, type: 'crescent', color: GOLD, x: 150, y: 90, size: 48, angle: -0.3 },
          { frame: 102, type: 'crescent', color: CLOUD, x: 156, y: 86, size: 52, angle: 0.28 },
          { frame: 130, type: 'burst', color: CLOUD, x: 172, y: 90, size: 28 },
          { frame: 136, type: 'shockwave', color: GOLD, x: 172, y: 0, size: 60 },
          { frame: 144, type: 'ring', color: GOLD, x: 160, y: 80, size: 58 },
        ],
      },
    },
  },
};
