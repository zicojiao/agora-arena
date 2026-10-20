import type { CharacterDef } from '../../engine/types';
import { SUPER_ACTIVE, SUPER_RECOVERY, SUPER_STARTUP, buildSuper, NEZHA_VOCAB } from '../superPhases';
import { driveDash, sparkTrack } from '../superChoreo';
import { ASSAULT_ACTIVE, ASSAULT_RECOVERY, ASSAULT_STARTUP, buildAssault } from '../superPhases';
import { BRIEF_ACTIVE, BRIEF_RECOVERY, BRIEF_STARTUP, buildBrief } from '../superPhases';
const SEQ_NEZHA_B = buildBrief('nezha', NEZHA_VOCAB).seq;
const SEQ_NEZHA_A = buildAssault('nezha', NEZHA_VOCAB).seq;
const SEQ_NEZHA = buildSuper('nezha', NEZHA_VOCAB).seq;

const FIRE = '#ff6a2b', GOLD = '#ffd23f', RED = '#ff3b3b';

export const NEZHA: CharacterDef = {
  // 孙悟空曾经对哪吒是严格占优：血更多、速度更快、伤害更高，一项都不吃亏，
  // 实测哪吒总胜率 38% 垫底（还是首关角色和门面）。哪吒踩的是风火轮，
  // 速度理应全场最快——把优势放在移动上，伤害与血量仍是全场最低，定位才立得住。
  // 血最低(190) + 伤害最低(166) 又是同时付两份代价，和当初的二郎神一个病。
  // 反击命中/上下段/AI 反应层落地之后重测，哪吒总胜率 36% 垫底、对孙悟空只有 21%，
  // 而它的平均命中间距 99px 是四人里最近的——速度最快却被迫贴身打，快这一项换不回来。
  // 血量拉平到 200：代价只留在伤害上（仍是全场最低），好处是全场最快。
  vsIntro: {
    honghaier: '同样的枪，两种火。',
  },
  crown: { kind: 'buns', color: '#ff8c2b' },
  quotes: { win: '莲花身不坏，你伤不了我。', lose: '……师父，我又输了。',
    taunt: '就这点本事？' , intro: '让开，别挡着我的火尖枪。'},
  vs: {
    wukong: '当年天宫那一场，我记了这么多年。',
    honghaier: '一样的火尖枪，你使得像根烧火棍。',
    niumo: '你这颗头，我砍过一回。',
    erlang: '灌江口的，这次不劳你搭手。',
    leizhen: '封神榜上不打架，这儿打。',
  },
  vsLose: {
    wukong: '猴哥……这一棒我记住了。',
    honghaier: '同一杆枪，你使得比我狠。',
    niumo: '牛魔王的力气，还是没变。',
    erlang: '灌江口那三只眼，果然。',
    leizhen: '封神榜上，你排我前面。',
  },
  ending: '莲藕重塑的身子踏碎最后一道山门。他没有回头——东海的浪早就不再追他了。',
  endingHard: '他把混天绫解下来，系在东海的礁石上。这一次不是赔罪，是告诉那片海：欠的已经还清了。',
  role: '速度 · 连段', id: 'nezha', name: '哪吒', hp: 200, speed: 5.6, jumpVel: 17,
  width: 52, height: 148,
  palette: { main: '#d8383f', accent: '#ffd9a0' },
  weapon: { kind: 'spear', len: 96, grip: 0.28, shaft: '#8a5a3a', edge: '#ff8c2b' }, // 火尖枪
  adorn: {
    // 混天绫：肩上一条长红绫，是哪吒最有辨识度的一件东西
    sashes: [
      { anchor: 'shoulder', segs: 11, segLen: 11, width: 7, color: '#e0392f', tip: '#ffb36b' },
      { anchor: 'hip', segs: 7, segLen: 8, width: 4.5, color: '#c8443c', tip: '#ffd9a0' },
    ],
    ember: { color: '#ff8c2b', rate: 9, rise: 0.55 },
    aura: '#ff8c2b',
    dust: '#c9a06a',
  },
  // 藤黄→朱砂火橙，取自本文件的 GOLD/FIRE：与火尖枪/混天绫一脉的火红同源
  superGlow: ['#ffc24d', '#ff6a2b'],
  // 灵动突进：中等花瓣数，curl 非零让花瓣两侧不对称卷起，读出"张扬"而非对称舒展
  superAura: { petals: 16, spread: 0.38, tipBlunt: 0, curl: 0.24 },
  moves: {
    // 跳跃普攻：空中向下斜刺，落地即收。判定框压在身体下方——空中招的价值在于
    // 从上往下压制，框摆在正前方就变成了"浮空的站桩普攻"
    jA: {
      // 中段：从天上砸下来的，蹲防挡不住
      id: 'nezha_jA', slot: 'jA', name: '火尖枪·俯刺', damage: 9, guard: 'overhead',
      startup: 5, active: 14, recovery: 8, hitstun: 22,
      knockback: { x: 5, y: 0 }, cooldown: 0, meterCost: 0,
      hitbox: { x: 10, y: -30, w: 96, h: 86 }, motionId: 'airStrike',
      fx: [{ frame: 6, type: 'spark', color: FIRE, x: 60, y: 20 }],
    },
    n1: {
      id: 'nezha_n1', slot: 'n1', name: '火尖枪·刺', damage: 7,
      startup: 4, active: 3, recovery: 8, hitstun: 14,
      knockback: { x: 5, y: 0 }, cooldown: 0, meterCost: 0,
      hitbox: { x: 30, y: 70, w: 95, h: 30 }, motionId: 'thrust',
      fx: [{ frame: 4, type: 'spark', color: FIRE, x: 90, y: 85 }],
    },
    // 下段：判定框贴着地面（y 0-46），动作是沉腰横扫，站防挡不住
    n2: {
      id: 'nezha_n2', slot: 'n2', name: '火尖枪·扫堂', damage: 8, guard: 'low',
      startup: 3, active: 3, recovery: 9, hitstun: 15,
      knockback: { x: 6, y: 0 }, cooldown: 0, meterCost: 0,
      hitbox: { x: 26, y: 0, w: 104, h: 46 }, motionId: 'sweep',
      fx: [{ frame: 3, type: 'spark', color: FIRE, x: 95, y: 22 }],
    },
    n3: {
      // 12 → 14：哪吒是全场最快（5.6）、最短手（攻程 186）的角色，可它的
      // **伤害/帧**只有 0.53，四人里排第三（孙悟空 0.57 / 牛魔王 0.55 / 二郎神 0.52）——
      // "快"只快在动作上，没换来任何伤害率，等于短手这个代价白付。三段合计 27→29 之后
      // 是 0.57，回到最高，而单发仍然最轻（7/8/14 对牛魔王的 10/11/15），
      // 快攻角色的回报落在连段收尾上，不落在戳的伤害上——这是拳皇里快角色的形状。
      //
      // 加在 n3 而不是 n1：n1 7→8 实测把矩阵推到 48%、关4 反而更差；
      // 三段收招各 −2 把矩阵推到 62%、二郎神压到 40%，两个都退了。
      // 注意 n3 是**派生源**：投技伤害（n3 × 0.9）11→13，吹飞（n3 × 1.35）16→19，
      // 两项都从四人最低回到中间档——这正是当初把它们改成派生的目的。
      id: 'nezha_n3', slot: 'n3', name: '火尖枪·挑空', damage: 14,
      weaponScale: 1.35,
      startup: 5, active: 4, recovery: 12, hitstun: 22,
      knockback: { x: 6, y: 11 }, cooldown: 0, meterCost: 0,
      hitbox: { x: 25, y: 40, w: 80, h: 110 }, motionId: 'upthrust',
      fx: [
        { frame: 5, type: 'trail', color: FIRE, x: 60, y: 60 },
        { frame: 7, type: 'burst', color: GOLD, x: 65, y: 120 },
      ],
    },
    s1: {
      // s1 的判定框 170x50 是全场最小的必杀框，而哪吒的招整体又窄又竖（s3 是 90x170 的对空）。
      // 在 50% 近身 / 47% 中距的对局里横向够不着，速度快也换不来命中。放宽到 186x58。
      id: 'nezha_s1', slot: 's1', name: '烈焰突刺', damage: 16,
      weaponScale: 1.5,
      startup: 8, active: 5, recovery: 14, hitstun: 20,
      knockback: { x: 13, y: 0 }, cooldown: 240, meterCost: 0,
      hitbox: { x: 30, y: 55, w: 186, h: 58 }, motionId: 'rush',
      dash: [{ frame: 4, vx: 13 }],
      fx: [
        { frame: 3, type: 'glyph', color: FIRE, x: 20, y: 80, size: 40 },
        { frame: 8, type: 'beam', color: FIRE, x: 30, y: 80, size: 46 },
        { frame: 11, type: 'spark', color: GOLD, x: 150, y: 80 },
      ],
    },
    s2: {
      id: 'nezha_s2', slot: 's2', name: '乾坤圈', damage: 14,
      // 乾坤圈是件回旋兵器——招式名承诺了实物，就得真的飞出去再飞回来。
      // 判定交给投射物自己（下面 damage 归零那部分由 projectile 承担），近身的框仍留着
      // 兜住"贴脸放"的情形
      projectile: {
        // 出手在近身判定窗口结束之后——贴脸放不该既吃肉搏框又吃实物

        spawnFrame: 17, vx: 8.5, life: 130, damage: 14, hitstun: 26,
        knockback: { x: 6, y: 0 }, w: 46, h: 46, y: 66,
        // back=52：飞出约 440px 后回旋，正好覆盖默认交战距离（双方初始间距 360）
        kind: 'ring', color: '#ffd23f', back: 52,
      },
      startup: 10, active: 6, recovery: 16, hitstun: 18,
      knockback: { x: 10, y: 0 }, cooldown: 300, meterCost: 0,
      hitbox: { x: 110, y: 50, w: 150, h: 70 }, motionId: 'cast',
      fx: [
        { frame: 6, type: 'ring', color: GOLD, x: 60, y: 85 },
        { frame: 10, type: 'ring', color: GOLD, x: 170, y: 85 },
        { frame: 13, type: 'trail', color: GOLD, x: 200, y: 85, size: 10 },
      ],
    },
    s3: {
      // 18→17：名册长到十人之后他的总胜率压在 65% 的上限线上（断言是严格小于）。
      // 他一项都不领先、却哪一项都不垫底——全能型的顶点本来就最容易滑出上界，
      // 削的是伤害而不是速度：速度是他的定位，伤害本来就不是
      id: 'nezha_s3', slot: 's3', name: '风火轮·升龙', damage: 17,
      startup: 6, active: 6, recovery: 18, hitstun: 26,
      knockback: { x: 4, y: 15 }, cooldown: 360, meterCost: 0,
      hitbox: { x: 15, y: 20, w: 90, h: 170 }, motionId: 'upthrust',
      fx: [
        { frame: 2, type: 'burst', color: FIRE, x: 10, y: 20 },
        { frame: 6, type: 'trail', color: FIRE, x: 40, y: 90, size: 12 },
        { frame: 9, type: 'trail', color: GOLD, x: 50, y: 150, size: 10 },
      ],
    },
    // 奥义也是十秒级演出，但骨架与超必杀刻意不同：超必杀是「密集连打一路逼到版边」，
    // 奥义是「长蓄力 + 少数几下极重的技」——两档不只是尺寸差别，节奏形态就不一样，
    // 玩家一眼能分出放的是哪一档。九段：起势60 长蓄80 突进40 首击40 连击90 挑空50
    // 追击80 终结90 收势70。
    sp50: {
      id: 'nezha_sp50', slot: 'sp50', name: '奥义·混天绫', damage: 30,
      startup: ASSAULT_STARTUP, active: ASSAULT_ACTIVE, recovery: ASSAULT_RECOVERY, hitstun: 30,
      knockback: { x: 9, y: 7 }, cooldown: 0, meterCost: 50,
      // 段数比超必杀少一半、每下更重，结构上守住两档的区别
      multiHit: { hits: 12, interval: 28 },
      carry: 1.1,
      hitbox: { x: 20, y: 30, w: 220, h: 130 },
      motionId: 'nezhaSp50',
      motionSeq: SEQ_NEZHA_A,
      dash: driveDash(
        [{ frame: 146, vx: 8 }, { frame: 156, vx: 8 }, { frame: 166, vx: 7 }],
        ASSAULT_STARTUP + 20, ASSAULT_STARTUP + ASSAULT_ACTIVE - 40, 26, 2,
      ),
      fx: [
        { frame: 10, type: 'glyph', color: GOLD, x: 0, y: 105, size: 50 },
        { frame: 44, type: 'ring', color: RED, x: 0, y: 70, size: 34 },
        { frame: 90, type: 'glyph', color: GOLD, x: 0, y: 118, size: 66 },
        { frame: 132, type: 'flash', color: '#fff' },
        { frame: 148, type: 'trail', color: RED, x: 20, y: 10, size: 12 },
        { frame: 160, type: 'trail', color: GOLD, x: 70, y: 8, size: 10 },
        { frame: 182, type: 'shockwave', color: GOLD, x: 150, y: 0, size: 48 },
        ...sparkTrack(190, 300, 12, [RED, GOLD]),
        { frame: 214, type: 'crescent', color: GOLD, x: 150, y: 90, size: 52, angle: -0.3 },
        { frame: 262, type: 'crescent', color: RED, x: 156, y: 86, size: 58, angle: 0.3 },
        { frame: 316, type: 'crescent', color: GOLD, x: 158, y: 60, size: 62, angle: -1.1 },
        { frame: 364, type: 'ring', color: RED, x: 156, y: 80, size: 56 },
        ...sparkTrack(370, 430, 8, [GOLD, RED], 164, 84),
        { frame: 412, type: 'shockwave', color: RED, x: 162, y: 0, size: 62 },
        { frame: 442, type: 'flash', color: '#fff' },
        { frame: 448, type: 'burst', color: RED, x: 172, y: 90, size: 30 },
        { frame: 456, type: 'burst', color: GOLD, x: 192, y: 84, size: 26 },
        { frame: 464, type: 'shockwave', color: GOLD, x: 172, y: 0, size: 70 },
        { frame: 474, type: 'bolt', color: GOLD, x: 182, y: 128, size: 58, angle: 1.25 },
        { frame: 496, type: 'ring', color: RED, x: 162, y: 80, size: 68 },
        { frame: 540, type: 'ring', color: GOLD, x: 158, y: 76, size: 52 },
      ],
    
      // 打不死人时换上的三秒短版（见 Move.brief 的说明）。姿势词汇与长版同源，
      // 砍掉的是中段铺陈，不是换一套动作。
      brief: {
        startup: BRIEF_STARTUP, active: BRIEF_ACTIVE, recovery: BRIEF_RECOVERY,
        multiHit: { hits: 7, interval: 12 },
        carry: 1.1,
        motionSeq: SEQ_NEZHA_B,
        dash: [{ frame: 34, vx: 9 }, { frame: 42, vx: 8 }, { frame: 62, vx: 2.4 }, { frame: 86, vx: 2.4 }],
        fx: [
          { frame: 4, type: 'glyph', color: GOLD, x: 0, y: 108, size: 52 },
          { frame: 24, type: 'flash', color: '#fff' },
          { frame: 32, type: 'trail', color: RED, x: 20, y: 10, size: 11 },
          { frame: 42, type: 'trail', color: GOLD, x: 70, y: 8, size: 10 },
          { frame: 56, type: 'shockwave', color: GOLD, x: 150, y: 0, size: 44 },
          ...sparkTrack(60, 128, 10, [RED, GOLD]),
          { frame: 74, type: 'crescent', color: GOLD, x: 150, y: 90, size: 48, angle: -0.3 },
          { frame: 102, type: 'crescent', color: RED, x: 156, y: 86, size: 52, angle: 0.28 },
          { frame: 130, type: 'burst', color: RED, x: 172, y: 90, size: 28 },
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
      id: 'nezha_sp100', slot: 'sp100', name: '超必杀·三头六臂', damage: 52,
      weaponScale: 1.6,
      startup: SUPER_STARTUP, active: SUPER_ACTIVE, recovery: SUPER_RECOVERY, hitstun: 40,
      knockback: { x: 9, y: 18 }, cooldown: 0, meterCost: 100,
      multiHit: { hits: 50, interval: 8 },
      // 连打中间段把对手朝版边推，出招者靠贯穿 active 的小 dash 同步跟进：
      // 两人一起朝版边挪，这就是「逼到版边再轰」那一拍
      carry: 1.0,
      hitbox: { x: 0, y: 0, w: 330, h: 230 },
      motionId: 'nezhaSp100',
      motionSeq: SEQ_NEZHA,
      dash: driveDash(
        [{ frame: 82, vx: 9 }, { frame: 90, vx: 9 }, { frame: 98, vx: 8 }, { frame: 106, vx: 7 }],
        SUPER_STARTUP + 14, SUPER_STARTUP + SUPER_ACTIVE - 30, 20, 2.2,
      ),
      fx: [
        { frame: 6, type: 'glyph', color: GOLD, x: 0, y: 110, size: 56 },
        { frame: 26, type: 'ring', color: FIRE, x: 0, y: 70, size: 38 },
        { frame: 48, type: 'glyph', color: GOLD, x: 0, y: 120, size: 72 },
        { frame: 70, type: 'ring', color: GOLD, x: 0, y: 80, size: 52 },
        { frame: 78, type: 'flash', color: '#fff' },
        { frame: 84, type: 'trail', color: FIRE, x: 10, y: 10, size: 11 },
        { frame: 92, type: 'trail', color: FIRE, x: 50, y: 8, size: 10 },
        { frame: 100, type: 'trail', color: GOLD, x: 90, y: 8, size: 9 },
        { frame: 112, type: 'shockwave', color: GOLD, x: 150, y: 0, size: 44 },
        ...sparkTrack(116, 300, 26, [FIRE, GOLD]),
        { frame: 150, type: 'crescent', color: GOLD, x: 150, y: 90, size: 48, angle: -0.3 },
        { frame: 195, type: 'crescent', color: FIRE, x: 155, y: 88, size: 54, angle: 0.25 },
        { frame: 240, type: 'shockwave', color: FIRE, x: 160, y: 0, size: 60 },
        { frame: 265, type: 'crescent', color: GOLD, x: 160, y: 92, size: 58, angle: -0.2 },
        ...sparkTrack(310, 420, 16, [GOLD, FIRE], 165, 84),
        { frame: 330, type: 'crescent', color: FIRE, x: 158, y: 60, size: 64, angle: -1.1 },
        { frame: 360, type: 'ring', color: GOLD, x: 155, y: 80, size: 58 },
        { frame: 395, type: 'shockwave', color: GOLD, x: 165, y: 0, size: 66 },
        { frame: 430, type: 'glyph', color: GOLD, x: 40, y: 120, size: 84 },
        { frame: 455, type: 'glyph', color: FIRE, x: 90, y: 100, size: 70 },
        { frame: 478, type: 'flash', color: '#fff' },
        { frame: 484, type: 'burst', color: FIRE, x: 175, y: 90, size: 32 },
        { frame: 490, type: 'burst', color: GOLD, x: 195, y: 84, size: 28 },
        { frame: 496, type: 'shockwave', color: GOLD, x: 175, y: 0, size: 76 },
        { frame: 504, type: 'bolt', color: GOLD, x: 185, y: 130, size: 62, angle: 1.2 },
        { frame: 512, type: 'bolt', color: FIRE, x: 150, y: 130, size: 56, angle: 1.9 },
        { frame: 524, type: 'ring', color: FIRE, x: 165, y: 80, size: 74 },
        { frame: 545, type: 'ring', color: GOLD, x: 160, y: 76, size: 60 },
      ],
    
      // 打不死人时换上的三秒短版（见 Move.brief 的说明）。姿势词汇与长版同源，
      // 砍掉的是中段铺陈，不是换一套动作。
      brief: {
        startup: BRIEF_STARTUP, active: BRIEF_ACTIVE, recovery: BRIEF_RECOVERY,
        multiHit: { hits: 14, interval: 6 },
        carry: 0.9,
        motionSeq: SEQ_NEZHA_B,
        dash: [{ frame: 34, vx: 9 }, { frame: 42, vx: 8 }, { frame: 62, vx: 2.4 }, { frame: 86, vx: 2.4 }],
        fx: [
          { frame: 4, type: 'glyph', color: GOLD, x: 0, y: 108, size: 52 },
          { frame: 24, type: 'flash', color: '#fff' },
          { frame: 32, type: 'trail', color: FIRE, x: 20, y: 10, size: 11 },
          { frame: 42, type: 'trail', color: GOLD, x: 70, y: 8, size: 10 },
          { frame: 56, type: 'shockwave', color: GOLD, x: 150, y: 0, size: 44 },
          ...sparkTrack(60, 128, 10, [FIRE, GOLD]),
          { frame: 74, type: 'crescent', color: GOLD, x: 150, y: 90, size: 48, angle: -0.3 },
          { frame: 102, type: 'crescent', color: FIRE, x: 156, y: 86, size: 52, angle: 0.28 },
          { frame: 130, type: 'burst', color: FIRE, x: 172, y: 90, size: 28 },
          { frame: 136, type: 'shockwave', color: GOLD, x: 172, y: 0, size: 60 },
          { frame: 144, type: 'ring', color: GOLD, x: 160, y: 80, size: 58 },
        ],
      },
    },
  },
};
