import type { Box, CharacterDef, FxEvent, Move, MoveSlot } from '../../engine/types';
import { SUPER_ACTIVE, SUPER_RECOVERY, SUPER_STARTUP, buildSuper, HOUYI_VOCAB } from '../superPhases';
import { driveDash, sparkTrack } from '../superChoreo';
import { ASSAULT_ACTIVE, ASSAULT_RECOVERY, ASSAULT_STARTUP, buildAssault } from '../superPhases';
import { BRIEF_ACTIVE, BRIEF_RECOVERY, BRIEF_STARTUP, buildBrief } from '../superPhases';
const SEQ_HY_B = buildBrief('houyi', HOUYI_VOCAB).seq;
const SEQ_HY_A = buildAssault('houyi', HOUYI_VOCAB).seq;
const SEQ_HY = buildSuper('houyi', HOUYI_VOCAB).seq;

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

// 落日金、弓身的深褐、箭镞的冷白。他的颜色是"傍晚"，与红孩儿的正午火焰刻意分开
const SUN = '#ffb340', BOW = '#6b4a2f', ARROW = '#f2efe6';

export const HOUYI: CharacterDef = {
  vsIntro: {
    leizhen: '飞得再高也在射程里。',
  },
  crown: { kind: 'band', color: '#ffb340' },
  quotes: { win: '射日的弓，射你嫌重了。', lose: '手……抖了。',
    taunt: '站着别动，省得我瞄。' , intro: '九个太阳都射下来了。'},
  vs: {
    erlang: '打得再巧，那也叫弹弓。',
    leizhen: '天上飞的，我射下来过九个。',
    xingtian: '没有头，也总得有个准头。',
  },
  vsLose: {
    erlang: '弹弓也能这么用。',
    leizhen: '天上飞的，这只射不下。',
    xingtian: '没有脸，我瞄不准。',
  },
  ending: '第十个太阳照常升起。他把弓挂回墙上——那上面已经落了很厚的灰，他没有擦。',
  endingHard: '最后一支箭他没有射出去。天上只剩一个太阳，而那一个是该留着的。',
  role: '蓄力 · 远射',
  // ── 「他打起来不像弓箭手」这条，实测下来是**指标错了，不是角色错了** ─────────────
  // 曾用"200px 之外落地的伤害占比"来量，得出他只有 12%、全名册第 4（二郎神 14.4、
  // 铁扇 12.4、哪吒 11.3），据此调过两轮参数。那个指标是错的：他三记必杀**每一记自身
  // 还带近身判定框**（伤害 16/15/18），起手动作在近距离就打中了，
  // 于是大量"放箭"被记成了近身伤害。
  //
  // 换成"必杀出手数 / 总出手数"重量，全名册（每人 44 场）：
  //   后羿 48、铁扇 48 | 刑天 38 | 二郎 33、牛魔 33、哪吒 32、钟馗 32
  //   悟空 30、白骨 30、雷震 30 | 八戒 24、红孩儿 23
  // 他并列第一，中位数 32——将近一半的出手是放箭，他本来就是弓箭手。
  //
  // 试过两个旋钮，都不起作用，别再走一遍：
  //   ① 冷却 210/300/360 -> 130/210/300：全 campaign 出箭量 327 -> 338（+3%）。
  //      一场 7200 帧、冷却 130 光 s1 就够放 55 次，而他实际只放约 10 支——冷却远不是瓶颈。
  //   ② mid 档补 attack: 0.35 压普攻：出箭占比 49% -> 51%，几乎没动，
  //      胜率却从 56.4 冲到 65.5（顶到 65 的上限）。
  // 另外"远"这一档在实战里近乎不存在：他只有 6% 的帧处在 >350px，
  // 而二郎神 5%、哪吒 4%——全名册都一样，far 那组权重几乎从不生效。
  // 蓄力远射：够不着就放箭，贴上来就退。近身权重整体压低——他站在原地对拼是死
  aiBias: {
    near: { retreat: 2.6, backstep: 2.2, skill1: 0.3, skill2: 0.3, skill3: 0.5, attack: 0.7 },
    mid: { skill1: 2.4, skill2: 2.0, approach: 0.5, retreat: 1.6 },
    far: { skill1: 3.0, skill2: 2.4, charge: 1.4, approach: 0.4 },
  },
  id: 'houyi', name: '后羿', hp: 185, speed: 4.4, jumpVel: 15,
  width: 52, height: 152,
  palette: { main: '#a8763a', accent: '#f2efe6' },
  // 弓：借 staff 的画法（一根长杆），但握点在正中、颜色是深褐弓身
  weapon: { kind: 'bow', len: 104, grip: 0.5, shaft: '#6b4a2f', edge: '#ffb340' }, // 震天弓
  adorn: {
    sashes: [
      { anchor: 'shoulder', segs: 8, segLen: 9, width: 5, color: '#8c5a2b', tip: '#f2efe6' },
      { anchor: 'hip', segs: 6, segLen: 8, width: 4, color: '#a8763a', tip: '#ffb340' },
    ],
    ember: { color: '#ffb340', rate: 4, rise: 0.3 },   // 最稀：落日的浮尘，不是火
    aura: '#ffb340',
    dust: '#c2a882',
  },
  superGlow: [SUN, ARROW],
  // 少瓣、极窄、尖锐：一圈立起来的箭
  superAura: { petals: 11, spread: 0.18, tipBlunt: 0, curl: 0 },
  moves: {
    jA: { ...mk('houyi_jA', 'jA', '弓身砸', 10, [6, 14, 9], 22, [6, 0], 0, 0,
      [2, -30, 96, 86], 'airStrike',
      [{ frame: 6, type: 'spark', color: ARROW, x: 50, y: 16 }]), guard: 'overhead' },
    // 近身三招是"用弓身挡开"，收招仍是全场最长的一档——他被贴身就该难受。
    //
    // 但**第一版做过了头**：起手 6/5/7、收招 11/12/15，实测总胜率 34%（门槛 35）、
    // 连段效率 0.455（全场唯一被甩开一档）、关1 通关率 45%（哪吒 95%）。
    // 成因不是"远程角色本来就弱"，是这套测量用的陪练**不会站桩放箭**——
    // 它只会压上去（见 docs/engine-notes.zh-CN.md「用手写机器人比"打法强弱"是不成立的」）。
    // 于是他的长处一分都兑现不了，短处却百分之百兑现。
    // 收招保留（那是他的定位），起手与伤害补回常规档：被贴身仍然吃亏，但不是站着挨打。
    n1: mk('houyi_n1', 'n1', '弓身击', 9, [5, 3, 10], 14, [6, 0], 0, 0, [26, 58, 96, 34], 'thrust',
      [{ frame: 5, type: 'spark', color: ARROW, x: 84, y: 72 }]),
    n2: { ...mk('houyi_n2', 'n2', '扫弓', 10, [4, 3, 11], 15, [6, 0], 0, 0, [22, 0, 104, 44], 'sweep',
      [{ frame: 4, type: 'spark', color: BOW, x: 88, y: 16 }]), guard: 'low' },
    n3: mk('houyi_n3', 'n3', '挑弓', 14, [6, 4, 14], 22, [7, 10], 0, 0, [24, 36, 90, 106], 'upthrust',
      [{ frame: 6, type: 'trail', color: SUN, x: 54, y: 84 }, { frame: 8, type: 'burst', color: ARROW, x: 58, y: 116 }]),
    // ── 三记必杀**全是箭** ──────────────────────────────────────────
    // 名册里此前没有人有超过一记投射物（二郎神的光束、哪吒的乾坤圈、铁扇的风刃各一）。
    // 他是唯一一个可以整局不进近身距离的人——三支箭分快/慢/高三档，
    // 逼对手在"绕过去""挡下来""跳过来"之间选，而每一种选择都要付不同的帧数。
    // 近身三招最差 + 身法倒数，就是这份自由的价钱。
    s1: { ...mk('houyi_s1', 's1', '射日箭', 16, [8, 4, 15], 18, [7, 0], 210, 0, [34, 60, 100, 40], 'cast',
      [{ frame: 5, type: 'glyph', color: SUN, x: 20, y: 96, size: 26 },
       { frame: 8, type: 'trail', color: ARROW, x: 70, y: 74, size: 10 }]),
      projectile: {
        // 全场最快的箭（vx 12）：它的价值是"抢在对手动作之前落地"
        spawnFrame: 8, vx: 12, life: 90, damage: 13, hitstun: 16,
        knockback: { x: 8, y: 0 }, w: 44, h: 16, y: 66, kind: 'arrow', color: SUN,
      } },
    // 落日矢：抛得高、飞得慢，落点在对手头顶——跳起来的人正好撞上去
    s2: { ...mk('houyi_s2', 's2', '落日矢', 15, [10, 4, 17], 18, [6, 0], 300, 0, [34, 120, 90, 44], 'cast',
      [{ frame: 7, type: 'glyph', color: SUN, x: 20, y: 130, size: 30 },
       { frame: 11, type: 'trail', color: SUN, x: 70, y: 140, size: 12 }]),
      projectile: {
        spawnFrame: 10, vx: 6, life: 110, damage: 13, hitstun: 18,
        knockback: { x: 6, y: 6 }, w: 40, h: 40, y: 126, kind: 'arrow', color: SUN,
      } },
    // 贯石矢：慢、重、打得倒人。它是他唯一的"逼退键"——对手压上来时用它换空间
    s3: { ...mk('houyi_s3', 's3', '贯石矢', 18, [12, 5, 19], 26, [12, 8], 360, 0, [34, 40, 100, 56], 'cast',
      [{ frame: 8, type: 'glyph', color: ARROW, x: 20, y: 80, size: 34 },
       { frame: 13, type: 'burst', color: SUN, x: 76, y: 66 }]),
      knockdown: true, weaponScale: 1.5,
      projectile: {
        spawnFrame: 12, vx: 7.5, life: 96, damage: 16, hitstun: 22,
        knockback: { x: 15, y: 0 }, w: 52, h: 26, y: 46, kind: 'arrow', color: ARROW,
        knockdown: true,
      } as never },
    sp50: {
      id: 'houyi_sp50', slot: 'sp50', name: '奥义·射日', damage: 31,
      weaponScale: 2.2,
      startup: ASSAULT_STARTUP, active: ASSAULT_ACTIVE, recovery: ASSAULT_RECOVERY, hitstun: 31,
      knockback: { x: 12, y: 13 }, cooldown: 0, meterCost: 50,
      multiHit: { hits: 9, interval: 37 },
      carry: 0.9,
      hitbox: { x: 30, y: 0, w: 300, h: 150 },
      motionId: 'houyiSp50',
      motionSeq: SEQ_HY_A,
      dash: driveDash(
        [{ frame: 146, vx: 6 }, { frame: 156, vx: 6 }, { frame: 166, vx: 5 }],
        ASSAULT_STARTUP + 20, ASSAULT_STARTUP + ASSAULT_ACTIVE - 40, 28, 1.4,
      ),
      fx: [
        { frame: 12, type: 'glyph', color: SUN, x: 0, y: 100, size: 44 },
        { frame: 48, type: 'ring', color: ARROW, x: 0, y: 70, size: 30 },
        { frame: 92, type: 'glyph', color: SUN, x: 0, y: 112, size: 62 },
        { frame: 132, type: 'flash', color: '#fff' },
        { frame: 150, type: 'trail', color: ARROW, x: 40, y: 70, size: 12 },
        { frame: 166, type: 'trail', color: SUN, x: 120, y: 68, size: 11 },
        { frame: 188, type: 'bolt', color: SUN, x: 180, y: 70, size: 54, angle: 0.05 },
        ...sparkTrack(194, 300, 12, [SUN, ARROW]),
        { frame: 224, type: 'bolt', color: ARROW, x: 200, y: 66, size: 58, angle: -0.05 },
        { frame: 272, type: 'bolt', color: SUN, x: 210, y: 72, size: 62, angle: 0.08 },
        { frame: 320, type: 'shockwave', color: SUN, x: 180, y: 0, size: 52 },
        { frame: 368, type: 'ring', color: ARROW, x: 176, y: 74, size: 54 },
        ...sparkTrack(374, 430, 8, [ARROW, SUN], 180, 76),
        { frame: 416, type: 'bolt', color: SUN, x: 214, y: 68, size: 66, angle: 0 },
        { frame: 444, type: 'flash', color: '#fff' },
        { frame: 454, type: 'burst', color: SUN, x: 190, y: 78, size: 32 },
        { frame: 468, type: 'shockwave', color: ARROW, x: 186, y: 0, size: 66 },
        { frame: 486, type: 'ring', color: SUN, x: 180, y: 74, size: 62 },
        { frame: 512, type: 'ring', color: ARROW, x: 176, y: 72, size: 54 },
        { frame: 544, type: 'ring', color: SUN, x: 172, y: 70, size: 44 },
      ],
      brief: {
        startup: BRIEF_STARTUP, active: BRIEF_ACTIVE, recovery: BRIEF_RECOVERY,
        multiHit: { hits: 6, interval: 13 },
        carry: 0.8,
        motionSeq: SEQ_HY_B,
        dash: [{ frame: 34, vx: 6 }, { frame: 42, vx: 5 }, { frame: 62, vx: 1.6 }, { frame: 86, vx: 1.6 }],
        fx: [
          { frame: 4, type: 'glyph', color: SUN, x: 0, y: 104, size: 46 },
          { frame: 24, type: 'flash', color: '#fff' },
          { frame: 36, type: 'trail', color: ARROW, x: 40, y: 70, size: 11 },
          { frame: 58, type: 'bolt', color: SUN, x: 170, y: 70, size: 54, angle: 0.05 },
          ...sparkTrack(62, 128, 9, [SUN, ARROW]),
          { frame: 90, type: 'bolt', color: ARROW, x: 190, y: 66, size: 58, angle: -0.05 },
          { frame: 120, type: 'shockwave', color: SUN, x: 180, y: 0, size: 52 },
          { frame: 140, type: 'ring', color: ARROW, x: 176, y: 74, size: 56 },
        ],
      },
    },
    sp100: {
      id: 'houyi_sp100', slot: 'sp100', name: '超必杀·九日俱落', damage: 51,
      weaponScale: 2.6,
      startup: SUPER_STARTUP, active: SUPER_ACTIVE, recovery: SUPER_RECOVERY, hitstun: 41,
      knockback: { x: 11, y: 18 }, cooldown: 0, meterCost: 100,
      // 九段——一日一箭。全名册段数最少的超必杀之一，每一段都极重
      multiHit: { hits: 27, interval: 15 },
      carry: 0.85,
      hitbox: { x: 0, y: 0, w: 420, h: 220 },
      motionId: 'houyiSp100',
      motionSeq: SEQ_HY,
      dash: driveDash(
        [{ frame: 82, vx: 7 }, { frame: 90, vx: 7 }, { frame: 98, vx: 6 }, { frame: 106, vx: 5 }],
        SUPER_STARTUP + 14, SUPER_STARTUP + SUPER_ACTIVE - 30, 22, 1.4,
      ),
      fx: [
        { frame: 6, type: 'glyph', color: SUN, x: 0, y: 104, size: 50 },
        { frame: 28, type: 'ring', color: ARROW, x: 0, y: 70, size: 34 },
        { frame: 50, type: 'glyph', color: SUN, x: 0, y: 116, size: 68 },
        { frame: 72, type: 'ring', color: SUN, x: 0, y: 80, size: 50 },
        { frame: 78, type: 'flash', color: '#fff' },
        { frame: 90, type: 'bolt', color: SUN, x: 150, y: 72, size: 56, angle: 0.04 },
        { frame: 118, type: 'bolt', color: ARROW, x: 190, y: 68, size: 58, angle: -0.04 },
        ...sparkTrack(122, 300, 20, [SUN, ARROW]),
        { frame: 158, type: 'bolt', color: SUN, x: 230, y: 74, size: 60, angle: 0.06 },
        { frame: 202, type: 'bolt', color: ARROW, x: 260, y: 70, size: 62, angle: -0.06 },
        { frame: 246, type: 'shockwave', color: SUN, x: 200, y: 0, size: 58 },
        { frame: 272, type: 'bolt', color: SUN, x: 280, y: 76, size: 64, angle: 0.05 },
        ...sparkTrack(312, 420, 14, [ARROW, SUN], 220, 74),
        { frame: 340, type: 'bolt', color: ARROW, x: 300, y: 70, size: 66, angle: -0.05 },
        { frame: 372, type: 'ring', color: SUN, x: 210, y: 74, size: 62 },
        { frame: 400, type: 'shockwave', color: ARROW, x: 214, y: 0, size: 68 },
        { frame: 434, type: 'glyph', color: SUN, x: 60, y: 116, size: 80 },
        { frame: 460, type: 'glyph', color: ARROW, x: 120, y: 98, size: 66 },
        { frame: 478, type: 'flash', color: '#fff' },
        { frame: 490, type: 'bolt', color: SUN, x: 240, y: 78, size: 74, angle: 0 },
        { frame: 500, type: 'shockwave', color: SUN, x: 200, y: 0, size: 78 },
        { frame: 514, type: 'burst', color: ARROW, x: 210, y: 84, size: 32 },
        { frame: 530, type: 'ring', color: SUN, x: 200, y: 76, size: 70 },
        { frame: 550, type: 'ring', color: ARROW, x: 194, y: 72, size: 56 },
      ],
      brief: {
        startup: BRIEF_STARTUP, active: BRIEF_ACTIVE, recovery: BRIEF_RECOVERY,
        multiHit: { hits: 11, interval: 8 },
        carry: 0.7,
        motionSeq: SEQ_HY_B,
        dash: [{ frame: 34, vx: 7 }, { frame: 42, vx: 6 }, { frame: 62, vx: 1.6 }, { frame: 86, vx: 1.6 }],
        fx: [
          { frame: 4, type: 'glyph', color: SUN, x: 0, y: 104, size: 48 },
          { frame: 24, type: 'flash', color: '#fff' },
          { frame: 38, type: 'bolt', color: SUN, x: 150, y: 72, size: 56, angle: 0.04 },
          { frame: 62, type: 'bolt', color: ARROW, x: 190, y: 68, size: 58, angle: -0.04 },
          ...sparkTrack(66, 128, 9, [SUN, ARROW]),
          { frame: 96, type: 'shockwave', color: SUN, x: 190, y: 0, size: 56 },
          { frame: 124, type: 'bolt', color: SUN, x: 220, y: 74, size: 62, angle: 0 },
          { frame: 144, type: 'ring', color: ARROW, x: 196, y: 74, size: 58 },
        ],
      },
    },
  },
};
