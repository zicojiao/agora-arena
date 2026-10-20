import type { Box, CharacterDef, FxEvent, Move, MoveSlot } from '../../engine/types';
import { SUPER_ACTIVE, SUPER_RECOVERY, SUPER_STARTUP, buildSuper, BAJIE_VOCAB } from '../superPhases';
import { driveDash, sparkTrack } from '../superChoreo';
import { ASSAULT_ACTIVE, ASSAULT_RECOVERY, ASSAULT_STARTUP, buildAssault } from '../superPhases';
import { BRIEF_ACTIVE, BRIEF_RECOVERY, BRIEF_STARTUP, buildBrief } from '../superPhases';
const SEQ_BJ_B = buildBrief('bajie', BAJIE_VOCAB).seq;
const SEQ_BJ_A = buildAssault('bajie', BAJIE_VOCAB).seq;
const SEQ_BJ = buildSuper('bajie', BAJIE_VOCAB).seq;

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

// 僧袍的土褐、钉耙的铁灰、高老庄秋日的暖黄。他是名册里最"家常"的颜色
const ROBE = '#7a5a3a', IRON = '#9aa0a6', WARM = '#e8c98a';

export const BAJIE: CharacterDef = {
  vsIntro: {
    wukong: '猴哥，下手轻点儿。',
  },
  vsTaunt: {
    wukong: '猴哥慢点。',
  },
  crown: { kind: 'ears', color: '#e8c98a' },
  quotes: { win: '别挣了，我这手劲你挣不开。', lose: '哎哟……散架了。',
    taunt: '过来嘛，我又不咬人。' , intro: '打完这场，我要去吃饭。'},
  vs: {
    wukong: '猴哥，这回换你叫我一声。',
    baigu: '三副皮囊我都认得，哪一副都不好看。',
    zhongkui: '判官老爷，我这可是取过经的。',
    erlang: '我当天蓬元帅时，你还得叫我上官。',
  },
  vsLose: {
    wukong: '猴哥，还是你厉害。',
    baigu: '哎哟，又被你骗了。',
    zhongkui: '判官老爷，饶了我罢。',
    erlang: '上官……我不敢了。',
  },
  ending: '高老庄的晒场上摆了三桌。他把钉耙靠在墙根，说这回真的不走了——说完又添了一碗饭。',
  endingHard: '高老庄的酒喝到第三坛。他说这回真的不走了——说完打了个嗝，居然没有人反驳。',
  role: '投技 · 贴身',
  // 投技型：只要贴得上就赢，所以一路压上去，近身多按普攻（贴脸会自动改投）
  aiBias: {
    near: { attack: 2.4, retreat: 0.3, backstep: 0.3, block: 0.7 },
    mid: { approach: 2.6, dash: 2.0, retreat: 0.4 },
    far: { approach: 2.8, dash: 2.4, charge: 0.6 },
  },
  id: 'bajie', name: '猪八戒', hp: 210, speed: 4.2, jumpVel: 14,
  width: 62, height: 148,
  palette: { main: '#7a5a3a', accent: '#e8c98a' },
  weapon: { kind: 'rake', len: 100, grip: 0.44, shaft: '#5a4028', edge: '#9aa0a6' }, // 九齿钉耙
  adorn: {
    sashes: [
      { anchor: 'hip', segs: 8, segLen: 10, width: 8, color: '#7a5a3a', tip: '#e8c98a' },
      { anchor: 'shoulder', segs: 6, segLen: 9, width: 5, color: '#5a4028', tip: '#9aa0a6' },
    ],
    ember: { color: '#e8c98a', rate: 5, rise: 0.25 },
    aura: '#e8c98a',
    dust: '#c0a878',
  },
  superGlow: [WARM, IRON],
  // 瓣数少、宽厚、尖端钝：钉耙齿的形状，粗而实
  superAura: { petals: 9, spread: 0.46, tipBlunt: 0.6, curl: 0.15 },
  /**
   * 投技是他的招牌，而投技本来是**所有人共用一套数值**的系统招——
   * 谁来投都一样远（52px）、一样疼（n3 的 0.9 倍）、一样久（72 帧冷却），
   * 于是"投技型角色"这个原型在这套引擎里无从表达。他是唯一改写它的人：
   *   range 78：一个半身位，别人还在够普攻的距离他已经能抓到
   *   power 1.35：投技伤害 n3×1.35，全场唯一比自己重击还疼的投
   *   cd 44：别人两秒抓一次，他一秒不到
   * 代价在别处：全场倒数第二慢、跳得最低、必杀起手都不快——他抓不到人就什么都不是。
   */
  grapple: { range: 78, power: 1.35, cd: 44 },
  moves: {
    jA: { ...mk('bajie_jA', 'jA', '钉耙坠', 11, [6, 14, 10], 23, [7, 0], 0, 0,
      [2, -32, 104, 92], 'airStrike',
      [{ frame: 6, type: 'spark', color: IRON, x: 54, y: 16 }]), guard: 'overhead' },
    n1: mk('bajie_n1', 'n1', '钉耙击', 10, [5, 3, 10], 15, [6, 0], 0, 0, [26, 60, 100, 36], 'thrust',
      [{ frame: 5, type: 'spark', color: IRON, x: 90, y: 76 }]),
    // 击退 6 而不是 7：7 时第二段把人推出了第三段的射程，三段连打断在中间
    n2: { ...mk('bajie_n2', 'n2', '扫耙', 10, [5, 3, 11], 16, [6, 0], 0, 0, [22, 0, 108, 46], 'sweep',
      [{ frame: 5, type: 'spark', color: ROBE, x: 90, y: 16 }]), guard: 'low' },
    // n3 是投技伤害的底数（投 = n3 × 1.35），所以他的重击必须够重
    n3: mk('bajie_n3', 'n3', '举耙砸', 15, [7, 4, 15], 24, [7, 9], 0, 0, [26, 32, 104, 114], 'upthrust',
      [{ frame: 7, type: 'trail', color: IRON, x: 58, y: 86 }, { frame: 9, type: 'burst', color: WARM, x: 62, y: 118 }]),
    // 一步扑：贴上去的手段。他的三记必杀里两记都是"缩短距离"，因为他只要贴上就赢
    s1: mk('bajie_s1', 's1', '一步扑', 15, [9, 6, 17], 20, [9, 0], 260, 0, [24, 26, 150, 110], 'rush',
      [{ frame: 3, type: 'trail', color: ROBE, x: 16, y: 60, size: 14 },
       { frame: 8, type: 'burst', color: WARM, x: 90, y: 70 }], [{ frame: 3, vx: 11 }]),
    // 耙横扫：唯一一记有点攻程的招，用来赶人回到他的抓取距离里
    s2: { ...mk('bajie_s2', 's2', '耙横扫', 16, [8, 6, 17], 20, [13, 0], 300, 0, [26, 20, 175, 76], 'rush',
      [{ frame: 5, type: 'crescent', color: IRON, x: 90, y: 40, size: 50, angle: 0.1 },
       { frame: 9, type: 'spark', color: WARM, x: 160, y: 36 }]), weaponScale: 1.7 },
    // 压顶：他这一组唯一打得倒人的必杀，也是把人按在地上的那一记
    s3: { ...mk('bajie_s3', 's3', '压顶', 19, [12, 6, 19], 27, [7, 8], 370, 0, [22, 0, 130, 140], 'cast',
      [{ frame: 7, type: 'glyph', color: WARM, x: 34, y: 90, size: 38 },
       { frame: 12, type: 'shockwave', color: ROBE, x: 90, y: 0, size: 46 },
       { frame: 16, type: 'burst', color: IRON, x: 100, y: 50 }]), knockdown: true },
    sp50: {
      id: 'bajie_sp50', slot: 'sp50', name: '奥义·力劈华山', damage: 32,
      weaponScale: 2.5,
      startup: ASSAULT_STARTUP, active: ASSAULT_ACTIVE, recovery: ASSAULT_RECOVERY, hitstun: 32,
      knockback: { x: 12, y: 14 }, cooldown: 0, meterCost: 50,
      multiHit: { hits: 9, interval: 38 },
      carry: 1.3,
      hitbox: { x: 22, y: 0, w: 220, h: 180 },
      motionId: 'bajieSp50',
      motionSeq: SEQ_BJ_A,
      dash: driveDash(
        [{ frame: 146, vx: 8 }, { frame: 156, vx: 8 }, { frame: 166, vx: 7 }],
        ASSAULT_STARTUP + 20, ASSAULT_STARTUP + ASSAULT_ACTIVE - 40, 28, 1.8,
      ),
      fx: [
        { frame: 12, type: 'glyph', color: WARM, x: 0, y: 96, size: 44 },
        { frame: 48, type: 'ring', color: IRON, x: 0, y: 68, size: 32 },
        { frame: 92, type: 'glyph', color: ROBE, x: 0, y: 108, size: 60 },
        { frame: 132, type: 'flash', color: '#fff' },
        { frame: 152, type: 'crescent', color: IRON, x: 90, y: 78, size: 52, angle: -0.4 },
        { frame: 178, type: 'shockwave', color: ROBE, x: 140, y: 0, size: 50 },
        ...sparkTrack(196, 300, 12, [WARM, IRON]),
        { frame: 226, type: 'crescent', color: WARM, x: 150, y: 82, size: 58, angle: 0.3 },
        { frame: 276, type: 'shockwave', color: IRON, x: 152, y: 0, size: 56 },
        { frame: 326, type: 'burst', color: WARM, x: 156, y: 84, size: 30 },
        { frame: 370, type: 'ring', color: ROBE, x: 150, y: 74, size: 54 },
        ...sparkTrack(376, 430, 8, [IRON, WARM], 154, 78),
        { frame: 418, type: 'shockwave', color: WARM, x: 156, y: 0, size: 62 },
        { frame: 446, type: 'flash', color: '#fff' },
        { frame: 458, type: 'crescent', color: WARM, x: 168, y: 84, size: 70, angle: 0.1 },
        { frame: 470, type: 'shockwave', color: ROBE, x: 164, y: 0, size: 74 },
        { frame: 490, type: 'ring', color: IRON, x: 158, y: 76, size: 64 },
        { frame: 518, type: 'ring', color: WARM, x: 152, y: 72, size: 54 },
        { frame: 546, type: 'ring', color: ROBE, x: 148, y: 70, size: 44 },
      ],
      brief: {
        startup: BRIEF_STARTUP, active: BRIEF_ACTIVE, recovery: BRIEF_RECOVERY,
        multiHit: { hits: 6, interval: 13 },
        carry: 1.1,
        motionSeq: SEQ_BJ_B,
        dash: [{ frame: 34, vx: 8 }, { frame: 42, vx: 7 }, { frame: 62, vx: 2 }, { frame: 86, vx: 2 }],
        fx: [
          { frame: 4, type: 'glyph', color: WARM, x: 0, y: 100, size: 46 },
          { frame: 24, type: 'flash', color: '#fff' },
          { frame: 38, type: 'crescent', color: IRON, x: 90, y: 78, size: 52, angle: -0.4 },
          { frame: 58, type: 'shockwave', color: ROBE, x: 140, y: 0, size: 48 },
          ...sparkTrack(62, 128, 9, [WARM, IRON]),
          { frame: 92, type: 'crescent', color: WARM, x: 150, y: 82, size: 58, angle: 0.3 },
          { frame: 122, type: 'shockwave', color: IRON, x: 156, y: 0, size: 60 },
          { frame: 144, type: 'ring', color: ROBE, x: 152, y: 74, size: 56 },
        ],
      },
    },
    sp100: {
      id: 'bajie_sp100', slot: 'sp100', name: '超必杀·天蓬显形', damage: 55,
      weaponScale: 2.4,
      startup: SUPER_STARTUP, active: SUPER_ACTIVE, recovery: SUPER_RECOVERY, hitstun: 42,
      knockback: { x: 12, y: 17 }, cooldown: 0, meterCost: 100,
      multiHit: { hits: 26, interval: 15 },
      carry: 1.3,
      hitbox: { x: 0, y: 0, w: 320, h: 220 },
      motionId: 'bajieSp100',
      motionSeq: SEQ_BJ,
      dash: driveDash(
        [{ frame: 82, vx: 9 }, { frame: 90, vx: 9 }, { frame: 98, vx: 8 }, { frame: 106, vx: 7 }],
        SUPER_STARTUP + 14, SUPER_STARTUP + SUPER_ACTIVE - 30, 22, 1.9,
      ),
      fx: [
        { frame: 6, type: 'glyph', color: WARM, x: 0, y: 100, size: 48 },
        { frame: 28, type: 'ring', color: IRON, x: 0, y: 68, size: 34 },
        { frame: 50, type: 'glyph', color: ROBE, x: 0, y: 112, size: 64 },
        { frame: 72, type: 'ring', color: WARM, x: 0, y: 78, size: 48 },
        { frame: 78, type: 'flash', color: '#fff' },
        { frame: 94, type: 'burst', color: WARM, x: 70, y: 76, size: 28 },
        { frame: 118, type: 'shockwave', color: ROBE, x: 140, y: 0, size: 48 },
        ...sparkTrack(122, 300, 22, [WARM, IRON]),
        { frame: 158, type: 'crescent', color: IRON, x: 150, y: 82, size: 58, angle: -0.35 },
        { frame: 204, type: 'shockwave', color: WARM, x: 152, y: 0, size: 58 },
        { frame: 248, type: 'burst', color: ROBE, x: 154, y: 86, size: 30 },
        { frame: 276, type: 'ring', color: IRON, x: 152, y: 76, size: 58 },
        ...sparkTrack(314, 420, 15, [IRON, WARM], 156, 78),
        { frame: 340, type: 'crescent', color: WARM, x: 158, y: 80, size: 66, angle: 0.4 },
        { frame: 372, type: 'shockwave', color: ROBE, x: 158, y: 0, size: 66 },
        { frame: 404, type: 'ring', color: WARM, x: 154, y: 74, size: 62 },
        { frame: 436, type: 'glyph', color: WARM, x: 52, y: 114, size: 80 },
        { frame: 462, type: 'glyph', color: IRON, x: 112, y: 96, size: 66 },
        { frame: 478, type: 'flash', color: '#fff' },
        { frame: 492, type: 'shockwave', color: WARM, x: 170, y: 0, size: 80 },
        { frame: 506, type: 'burst', color: WARM, x: 178, y: 88, size: 34 },
        { frame: 522, type: 'ring', color: ROBE, x: 164, y: 76, size: 70 },
        { frame: 548, type: 'ring', color: IRON, x: 158, y: 72, size: 56 },
      ],
      brief: {
        startup: BRIEF_STARTUP, active: BRIEF_ACTIVE, recovery: BRIEF_RECOVERY,
        multiHit: { hits: 11, interval: 8 },
        carry: 1.1,
        motionSeq: SEQ_BJ_B,
        dash: [{ frame: 34, vx: 9 }, { frame: 42, vx: 8 }, { frame: 62, vx: 2 }, { frame: 86, vx: 2 }],
        fx: [
          { frame: 4, type: 'glyph', color: WARM, x: 0, y: 100, size: 46 },
          { frame: 24, type: 'flash', color: '#fff' },
          { frame: 40, type: 'burst', color: WARM, x: 80, y: 76, size: 26 },
          { frame: 62, type: 'shockwave', color: ROBE, x: 140, y: 0, size: 48 },
          ...sparkTrack(66, 128, 9, [WARM, IRON]),
          { frame: 96, type: 'crescent', color: IRON, x: 150, y: 82, size: 58, angle: -0.35 },
          { frame: 126, type: 'shockwave', color: WARM, x: 156, y: 0, size: 62 },
          { frame: 146, type: 'ring', color: ROBE, x: 152, y: 74, size: 56 },
        ],
      },
    },
  },
};
