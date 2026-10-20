import type { Box, CharacterDef, FxEvent, Move, MoveSlot } from '../../engine/types';
import { SUPER_ACTIVE, SUPER_RECOVERY, SUPER_STARTUP, buildSuper, NIUMO_VOCAB } from '../superPhases';
import { driveDash, sparkTrack } from '../superChoreo';
import { ASSAULT_ACTIVE, ASSAULT_RECOVERY, ASSAULT_STARTUP, buildAssault } from '../superPhases';
import { BRIEF_ACTIVE, BRIEF_RECOVERY, BRIEF_STARTUP, buildBrief } from '../superPhases';
const SEQ_NIUMO_B = buildBrief('niumo', NIUMO_VOCAB).seq;
const SEQ_NIUMO_A = buildAssault('niumo', NIUMO_VOCAB).seq;
const SEQ_NIUMO = buildSuper('niumo', NIUMO_VOCAB).seq;

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

const EMBER = '#ff5c33', BRONZE = '#d8a05c';

export const NIUMO: CharacterDef = {
  // 血 240 叠上全角色最高伤害，速度慢 24% 抵不掉这两项：实测同档 AI 下总胜率 70%，
  // 既是最强可选角色又是最终 BOSS，最后一关玩家胜率被压到 21%。伤害保留（那是大身板的
  // 立身之本），血量收到 215 —— 一个角色只付一份代价，也只拿一份好处。
  vsIntro: {
    honghaier: '你娘让你回去。',
    tieshan: '扇子放下，回家。',
    wukong: '这一次没人劝架。',
    // 镜像战：选牛魔王的人，末关打的就是他自己（FINAL_BOSS 固定是他）。
    // 这不是边角情形，是**每个选他的玩家必然撞上的一场**——不该还说那句通用的。
    niumo: '哪个是真的，打完知道。',
  },
  vsTaunt: {
    honghaier: '回家吃饭。',
    wukong: '又来。',
    niumo: '看镜子呢。',
  },
  crown: { kind: 'horns', color: '#d8a05c' },
  quotes: { win: '小辈，山可移，我不动。', lose: '这一拳……有点意思。',
    taunt: '再来，我站着不动。' , intro: '站稳了，别一下就飞出去。'},
  vs: {
    wukong: '结拜时你叫大哥，翻脸也没改口。',
    honghaier: '这身火是我给的，用得不好。',
    tieshan: '扇子借我一用。……不借也一样。',
    nezha: '砍一颗长一颗，你砍到几时。',
    xingtian: '连头都不要了还站着——这股劲我认得。',
    niumo: '照镜子照到打起来，也就我了。',
  },
  vsLose: {
    wukong: '结拜这一场，你赢了。',
    honghaier: '儿子……长本事了。',
    tieshan: '夫人的扇子，我认了。',
    nezha: '小娃娃，头砍得挺准。',
    xingtian: '没有头的，比我还硬。',
    niumo: '照镜子输给自己，服了。',
  },
  ending: '扇风散尽，焰火平了。他坐回积雷山顶，像一座终于没人再来搬的山。',
  endingHard: '他把混铁棍插在山口，转身回洞。芭蕉扇还在夫人手里——这一次他没有开口去借。',
  role: '力量 · 耐打', id: 'niumo', name: '牛魔王', hp: 215, speed: 3.8, jumpVel: 14,
  width: 64, height: 160, palette: { main: '#7a4a2b', accent: '#e8c9a0' },
  weapon: { kind: 'mace', len: 78, grip: 0.34, shaft: '#5a4030', edge: '#d8a05c' }, // 混铁棍
  adorn: {
    // 腰间兽皮与铁链：短、重、甩得慢
    sashes: [
      { anchor: 'hip', segs: 6, segLen: 10, width: 8, color: '#5a4030', tip: '#d8a05c' },
      { anchor: 'shoulder', segs: 5, segLen: 9, width: 5, color: '#7a4a2b', tip: '#ff5c33' },
    ],
    ember: { color: '#ff5c33', rate: 8, rise: 0.38 },
    aura: '#ff5c33',
    dust: '#a98a63',
  },
  // 赤焰→古铜，取自本文件的 EMBER/BRONZE：裂地/赤月一脉的赤褐同源配色——注意不能直接拿
  // palette.main（#7a4a2b 太暗），lighter 叠加下会发不出光，EMBER/BRONZE 本身够亮
  superGlow: [EMBER, BRONZE],
  // 重量级：花瓣少而宽厚（petals 少、spread 大），tipBlunt 让尖端裂成一段平口，读出粗野火舌
  superAura: { petals: 8, spread: 0.48, tipBlunt: 0.22, curl: 0 },
  moves: {
    // 中段：蹲防挡不住
    jA: { ...mk('niumo_jA', 'jA', '坠身肘击', 12, [6, 14, 9], 24, [6, 0], 0, 0,
      [4, -36, 96, 96], 'airStrike',
      [{ frame: 7, type: 'spark', color: EMBER, x: 56, y: 16 }]), guard: 'overhead' },
    n1: mk('niumo_n1', 'n1', '重拳', 10, [6, 3, 11], 16, [6, 0], 0, 0, [28, 65, 95, 45], 'thrust',
      [{ frame: 6, type: 'spark', color: BRONZE, x: 90, y: 82 }]),
    // 下段：判定框贴地，站防挡不住
    n2: { ...mk('niumo_n2', 'n2', '扫堂腿', 11, [5, 3, 12], 16, [7, 0], 0, 0, [22, 0, 108, 50], 'sweep',
      [{ frame: 5, type: 'spark', color: BRONZE, x: 90, y: 22 }]), guard: 'low' },
    n3: mk('niumo_n3', 'n3', '双锤砸', 15, [7, 4, 15], 24, [9, 8], 0, 0, [25, 25, 100, 120], 'slam',
      [{ frame: 8, type: 'burst', color: EMBER, x: 70, y: 40 }, { frame: 10, type: 'shockwave', color: BRONZE, x: 70, y: 10 }]),
    s1: mk('niumo_s1', 's1', '蛮牛冲撞', 18, [10, 8, 18], 24, [16, 0], 300, 0, [25, 40, 200, 90], 'rush',
      [{ frame: 5, type: 'shockwave', color: BRONZE, x: 20, y: 20 }, { frame: 10, type: 'spark', color: EMBER, x: 120, y: 60 },
       { frame: 14, type: 'burst', color: BRONZE, x: 190, y: 70 }], [{ frame: 4, vx: 15 }]),
    s2: { ...mk('niumo_s2', 's2', '裂地重击', 17, [12, 5, 20], 24, [8, 10], 330, 0, [30, 0, 180, 60], 'slam',
      [{ frame: 10, type: 'shockwave', color: EMBER, x: 90, y: 5 }, { frame: 13, type: 'burst', color: BRONZE, x: 140, y: 20 },
       { frame: 15, type: 'spark', color: EMBER, x: 60, y: 10 }]), weaponScale: 1.45 },
    s3: {
      ...mk('niumo_s3', 's3', '怒吼震慑', 16, [9, 8, 16], 22, [12, 0], 360, 0, [0, 20, 240, 160], 'cast',
      [{ frame: 5, type: 'ring', color: EMBER, x: 30, y: 100 }, { frame: 9, type: 'ring', color: BRONZE, x: 80, y: 100 },
       { frame: 13, type: 'ring', color: EMBER, x: 140, y: 100 }]),
      projectile: {
        // 出手在近身判定窗口结束之后——贴脸放不该既吃肉搏框又吃实物

        spawnFrame: 18, vx: 6, life: 100, damage: 15, hitstun: 26,
        knockback: { x: 9, y: 0 }, w: 54, h: 54, y: 60,
        kind: 'roar', color: '#7ddc9a',
      },
    },
    // 奥义也是十秒级演出，但骨架与超必杀刻意不同：超必杀是「密集连打一路逼到版边」，
    // 奥义是「长蓄力 + 少数几下极重的技」——两档不只是尺寸差别，节奏形态就不一样，
    // 玩家一眼能分出放的是哪一档。九段：起势60 长蓄80 突进40 首击40 连击90 挑空50
    // 追击80 终结90 收势70。
    sp50: {
      id: 'niumo_sp50', slot: 'sp50', name: '奥义·魔王撼山', damage: 33,
      weaponScale: 1.3,
      startup: ASSAULT_STARTUP, active: ASSAULT_ACTIVE, recovery: ASSAULT_RECOVERY, hitstun: 34,
      knockback: { x: 16, y: 10 }, cooldown: 0, meterCost: 50,
      // 段数比超必杀少一半、每下更重，结构上守住两档的区别
      multiHit: { hits: 8, interval: 42 },
      carry: 1.7,
      hitbox: { x: 30, y: 10, w: 260, h: 200 },
      motionId: 'niumoSp50',
      motionSeq: SEQ_NIUMO_A,
      dash: driveDash(
        [{ frame: 146, vx: 8 }, { frame: 156, vx: 8 }, { frame: 166, vx: 7 }],
        ASSAULT_STARTUP + 20, ASSAULT_STARTUP + ASSAULT_ACTIVE - 40, 26, 2,
      ),
      fx: [
        { frame: 10, type: 'glyph', color: BRONZE, x: 0, y: 105, size: 50 },
        { frame: 44, type: 'ring', color: EMBER, x: 0, y: 70, size: 34 },
        { frame: 90, type: 'glyph', color: BRONZE, x: 0, y: 118, size: 66 },
        { frame: 132, type: 'flash', color: '#fff' },
        { frame: 148, type: 'trail', color: EMBER, x: 20, y: 10, size: 12 },
        { frame: 160, type: 'trail', color: BRONZE, x: 70, y: 8, size: 10 },
        { frame: 182, type: 'shockwave', color: BRONZE, x: 150, y: 0, size: 48 },
        ...sparkTrack(190, 300, 12, [EMBER, BRONZE]),
        { frame: 214, type: 'crescent', color: BRONZE, x: 150, y: 90, size: 52, angle: -0.3 },
        { frame: 262, type: 'crescent', color: EMBER, x: 156, y: 86, size: 58, angle: 0.3 },
        { frame: 316, type: 'crescent', color: BRONZE, x: 158, y: 60, size: 62, angle: -1.1 },
        { frame: 364, type: 'ring', color: EMBER, x: 156, y: 80, size: 56 },
        ...sparkTrack(370, 430, 8, [BRONZE, EMBER], 164, 84),
        { frame: 412, type: 'shockwave', color: EMBER, x: 162, y: 0, size: 62 },
        { frame: 442, type: 'flash', color: '#fff' },
        { frame: 448, type: 'burst', color: EMBER, x: 172, y: 90, size: 30 },
        { frame: 456, type: 'burst', color: BRONZE, x: 192, y: 84, size: 26 },
        { frame: 464, type: 'shockwave', color: BRONZE, x: 172, y: 0, size: 70 },
        { frame: 474, type: 'bolt', color: BRONZE, x: 182, y: 128, size: 58, angle: 1.25 },
        { frame: 496, type: 'ring', color: EMBER, x: 162, y: 80, size: 68 },
        { frame: 540, type: 'ring', color: BRONZE, x: 158, y: 76, size: 52 },
      ],
    
      // 打不死人时换上的三秒短版（见 Move.brief 的说明）。姿势词汇与长版同源，
      // 砍掉的是中段铺陈，不是换一套动作。
      brief: {
        startup: BRIEF_STARTUP, active: BRIEF_ACTIVE, recovery: BRIEF_RECOVERY,
        multiHit: { hits: 7, interval: 12 },
        carry: 1.1,
        motionSeq: SEQ_NIUMO_B,
        dash: [{ frame: 34, vx: 9 }, { frame: 42, vx: 8 }, { frame: 62, vx: 2.4 }, { frame: 86, vx: 2.4 }],
        fx: [
          { frame: 4, type: 'glyph', color: BRONZE, x: 0, y: 108, size: 52 },
          { frame: 24, type: 'flash', color: '#fff' },
          { frame: 32, type: 'trail', color: EMBER, x: 20, y: 10, size: 11 },
          { frame: 42, type: 'trail', color: BRONZE, x: 70, y: 8, size: 10 },
          { frame: 56, type: 'shockwave', color: BRONZE, x: 150, y: 0, size: 44 },
          ...sparkTrack(60, 128, 10, [EMBER, BRONZE]),
          { frame: 74, type: 'crescent', color: BRONZE, x: 150, y: 90, size: 48, angle: -0.3 },
          { frame: 102, type: 'crescent', color: EMBER, x: 156, y: 86, size: 52, angle: 0.28 },
          { frame: 130, type: 'burst', color: EMBER, x: 172, y: 90, size: 28 },
          { frame: 136, type: 'shockwave', color: BRONZE, x: 172, y: 0, size: 60 },
          { frame: 144, type: 'ring', color: BRONZE, x: 160, y: 80, size: 58 },
        ],
      },
    },
    // 十秒超必杀（600 帧）。十五段骨架与另外三人一致——起势/蓄力/突进/首击/连打×3/
    // 逼近/挑空/空中追击/落地砸/终结蓄力/爆发/余波/收势——姿势词汇各自不同，见
    // superPhases.ts。此前是 4 段 6x-7x 帧（约 1.1s），只有普通技能的两倍长，读起来
    // 跟普通招没区别。
    sp100: {
      id: 'niumo_sp100', slot: 'sp100', name: '超必杀·真身巨牛', damage: 58,
      weaponScale: 1.55,
      startup: SUPER_STARTUP, active: SUPER_ACTIVE, recovery: SUPER_RECOVERY, hitstun: 45,
      knockback: { x: 13, y: 19 }, cooldown: 0, meterCost: 100,
      multiHit: { hits: 25, interval: 16 },
      // 连打中间段把对手朝版边推，出招者靠贯穿 active 的小 dash 同步跟进：
      // 两人一起朝版边挪，这就是「逼到版边再轰」那一拍
      carry: 1.8,
      hitbox: { x: 0, y: 0, w: 360, h: 250 },
      motionId: 'niumoSp100',
      motionSeq: SEQ_NIUMO,
      dash: driveDash(
        [{ frame: 82, vx: 9 }, { frame: 90, vx: 9 }, { frame: 98, vx: 8 }, { frame: 106, vx: 7 }],
        SUPER_STARTUP + 14, SUPER_STARTUP + SUPER_ACTIVE - 30, 20, 2.2,
      ),
      fx: [
        { frame: 6, type: 'glyph', color: BRONZE, x: 0, y: 110, size: 56 },
        { frame: 26, type: 'ring', color: EMBER, x: 0, y: 70, size: 38 },
        { frame: 48, type: 'glyph', color: BRONZE, x: 0, y: 120, size: 72 },
        { frame: 70, type: 'ring', color: BRONZE, x: 0, y: 80, size: 52 },
        { frame: 78, type: 'flash', color: '#fff' },
        { frame: 84, type: 'trail', color: EMBER, x: 10, y: 10, size: 11 },
        { frame: 92, type: 'trail', color: EMBER, x: 50, y: 8, size: 10 },
        { frame: 100, type: 'trail', color: BRONZE, x: 90, y: 8, size: 9 },
        { frame: 112, type: 'shockwave', color: BRONZE, x: 150, y: 0, size: 44 },
        ...sparkTrack(116, 300, 26, [EMBER, BRONZE]),
        { frame: 150, type: 'crescent', color: BRONZE, x: 150, y: 90, size: 48, angle: -0.3 },
        { frame: 195, type: 'crescent', color: EMBER, x: 155, y: 88, size: 54, angle: 0.25 },
        { frame: 240, type: 'shockwave', color: EMBER, x: 160, y: 0, size: 60 },
        { frame: 265, type: 'crescent', color: BRONZE, x: 160, y: 92, size: 58, angle: -0.2 },
        ...sparkTrack(310, 420, 16, [BRONZE, EMBER], 165, 84),
        { frame: 330, type: 'crescent', color: EMBER, x: 158, y: 60, size: 64, angle: -1.1 },
        { frame: 360, type: 'ring', color: BRONZE, x: 155, y: 80, size: 58 },
        { frame: 395, type: 'shockwave', color: BRONZE, x: 165, y: 0, size: 66 },
        { frame: 430, type: 'glyph', color: BRONZE, x: 40, y: 120, size: 84 },
        { frame: 455, type: 'glyph', color: EMBER, x: 90, y: 100, size: 70 },
        { frame: 478, type: 'flash', color: '#fff' },
        { frame: 484, type: 'burst', color: EMBER, x: 175, y: 90, size: 32 },
        { frame: 490, type: 'burst', color: BRONZE, x: 195, y: 84, size: 28 },
        { frame: 496, type: 'shockwave', color: BRONZE, x: 175, y: 0, size: 76 },
        { frame: 504, type: 'bolt', color: BRONZE, x: 185, y: 130, size: 62, angle: 1.2 },
        { frame: 512, type: 'bolt', color: EMBER, x: 150, y: 130, size: 56, angle: 1.9 },
        { frame: 524, type: 'ring', color: EMBER, x: 165, y: 80, size: 74 },
        { frame: 545, type: 'ring', color: BRONZE, x: 160, y: 76, size: 60 },
      ],
    
      // 打不死人时换上的三秒短版（见 Move.brief 的说明）。姿势词汇与长版同源，
      // 砍掉的是中段铺陈，不是换一套动作。
      brief: {
        startup: BRIEF_STARTUP, active: BRIEF_ACTIVE, recovery: BRIEF_RECOVERY,
        multiHit: { hits: 14, interval: 6 },
        carry: 0.9,
        motionSeq: SEQ_NIUMO_B,
        dash: [{ frame: 34, vx: 9 }, { frame: 42, vx: 8 }, { frame: 62, vx: 2.4 }, { frame: 86, vx: 2.4 }],
        fx: [
          { frame: 4, type: 'glyph', color: BRONZE, x: 0, y: 108, size: 52 },
          { frame: 24, type: 'flash', color: '#fff' },
          { frame: 32, type: 'trail', color: EMBER, x: 20, y: 10, size: 11 },
          { frame: 42, type: 'trail', color: BRONZE, x: 70, y: 8, size: 10 },
          { frame: 56, type: 'shockwave', color: BRONZE, x: 150, y: 0, size: 44 },
          ...sparkTrack(60, 128, 10, [EMBER, BRONZE]),
          { frame: 74, type: 'crescent', color: BRONZE, x: 150, y: 90, size: 48, angle: -0.3 },
          { frame: 102, type: 'crescent', color: EMBER, x: 156, y: 86, size: 52, angle: 0.28 },
          { frame: 130, type: 'burst', color: EMBER, x: 172, y: 90, size: 28 },
          { frame: 136, type: 'shockwave', color: BRONZE, x: 172, y: 0, size: 60 },
          { frame: 144, type: 'ring', color: BRONZE, x: 160, y: 80, size: 58 },
        ],
      },
    },
  },
};
