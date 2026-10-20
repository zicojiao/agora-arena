import { ARENA_MAX, ARENA_MIN, CROUCH_HEIGHT, FLOOR_Y, GRAVITY, NULL_INPUT } from './types';
import type { BattleEvent, CharacterDef, Dir, Fighter, FighterState, InputFrame, Move, Projectile } from './types';
import { overlaps, worldBox } from './collision';
// 取法只此一处（同 winQuote/loseQuote/introQuote）。data/quotes 只依赖 engine/types
// 这个叶子模块，不成环；把回落在这里再抄一份才是这个项目栽过五次的那种漂移。
import { tauntQuote } from '../data/quotes';

/** 高度差达到这个值就当作「一方已经跨到另一方头顶」，空中不再推挤。
 * 角色高 148-160，跳跃峰值 109-180（jumpVel 14-18 / GRAVITY 0.9）——100 落在两者之间：
 * 起跳与落地阶段仍算同一层、要推挤，跳到高处才放行。 */
const AIR_CLEAR = 100;

// ── KOF 系的三件核心机动 ────────────────────────────────────────────
/** 双击判定窗口（帧）。太短点不出来，太长了走两步就误触发 */
const TAP_WINDOW = 14;
/** 跑速倍率。KOF 的跑不是走得快一点，而是明显换了一档 */
const RUN_MULT = 1.95;
/** 后跳：帧数、初速、离地高度 */
const BACKSTEP_FRAMES = 24, BACKSTEP_VX = 8.5, BACKSTEP_VY = 7;
/** 紧急回避：总帧数与无敌区间。无敌要覆盖中段但不覆盖收尾——
 * 全程无敌就成了无风险按键，KOF 的回避是"赌一个时机"，收尾会被抓 */
export const ROLL_FRAMES = 30, ROLL_INVULN_FROM = 3, ROLL_INVULN_TO = 22, ROLL_VX = 6.4;

/** 小跳：轻点跳跃键只跳这么高（占大跳的比例）。KOF 的进攻节奏一半靠小跳——
 * 大跳滞空太久会被对空，小跳贴着地面压过去。松开得早就是小跳，按住不放才是大跳。 */
/**
 * 着地硬直。跳跃落地后不能立刻行动——拳皇里这是跳入的代价，也是"空跳"能成为
 * 一个真选项的前提（空跳落地快、带攻击落地慢，两者才有取舍）。
 * 此前这里是 0：落地当帧就能再动，被挡下的跳入毫发无损，实测跳入四关全线 64%
 * 且不随关卡下坡——阶梯对这个游戏唯一的中段完全不起作用。
 */
const LAND_STUN = 2;        // 空跳落地
const LAND_STUN_ATK = 3;    // 出过空中攻击再落地

const SHORT_HOP = 0.62;
/** 起跳后这么多帧内仍按住跳跃键，就补成大跳 */
const HOP_DECIDE = 4;
/** 受身：倒地后这么多帧内按攻击/防御可以翻滚起身，把 72 帧的倒地缩到这个值 */
export const TECH_WINDOW = 14;
const TECH_STUN = 20;
/** 蓄气：按住蹲+防御满这么多帧涨一格气；MAX 模式时长与加成 */
/** 蓄气：每这么多帧涨一格气。原来是 8——攒满 100 要按住 800 帧（13 秒）不动，
 * 在 32 秒一局的节奏里根本不可能达成，实测 MAX 模式使用率恒为 0.00。改成 4。 */
// MAX_FRAMES 从 420 收到 300：实测 MAX 状态占了对局 22-23% 的时长，一个常驻的 ×1.25
// 太钝了。爆气 84% 的价值在发动那一下（顶开 + 无敌），持续加成是附赠，不该是主体。
export const CHARGE_RATE = 4, MAX_FRAMES = 300, MAX_DMG = 1.25;
/** 进入 MAX 的气槽门槛与消耗。原本要求满槽且不扣气——但满槽的气总会先被超必杀花掉，
 * MAX 因此永远轮不到。改成 50 气一档、进 MAX 即扣除：这样它和奥义是一个真正的取舍
 * （同样 50 气，换一次伤害提升还是换一记奥义），而不是一个永远够不着的奖励。 */
export const MAX_COST = 50;
/** 爆气把对手顶开的作用距离与自身无敌帧。距离取一个身位半（普攻够得到的范围再宽一点），
 * 无敌 8 帧与防御取消同档——都是"挨打方的出路"，不该比对方更便宜 */
const MAX_BURST_RANGE = 90, MAX_BURST_INVULN = 8;

/** CD 吹飞攻击：攻击+防御同按。通用重击，把人打到版边——与既有的击倒系统天然契合 */
const CD_DMG = 1.35, CD_KB_X = 15, CD_KB_Y = 9;
/** CD 判定框比自家 n3 宽多少。ai 要按同一个数算够不够得着——写两份必然分家 */
const CD_W = 1.15;

/**
 * CD 够得到的最远中心距。判定框是 [x, x+w]（相对攻方中心，见 hitLands 的 worldBox），
 * 受方是以自身为中心、宽 def.width 的盒子，所以够得着的上限是 x + w + 受方半身宽。
 *
 * 给 ai 用：实测 AI 把 CD 甩在中位 68、四分位到 106、最远 192 的距离上，
 * 而它真正打中过的最远只有 119——一记 33-35 帧的招在空气里挥完，是白送对手一套。
 * 成因不是权重表（CD 只在「近身 <120」那一档里），是决策选中后要握住 26-30 帧，
 * 等到能出手的那一帧人早跑开了。
 */
export function cdReach(me: CharacterDef, foe: CharacterDef): number {
  const h = me.moves.n3.hitbox;
  return h.x + h.w * CD_W + foe.width / 2;
}
/**
 * 跳跃攻击够得着多远。与 cdReach 同一套算法（自己的判定框前伸 + 对手半个身宽）。
 * AI 此前用写死的 AIR_RANGE=70，而十二个人的 jA 实际前伸 96~112——
 * 70~112 这一段明明打得到却不出手，而中段是上下段里唯一的"上"。
 */
export function jaReach(me: CharacterDef, foe: CharacterDef): number {
  const h = me.moves.jA.hitbox;
  return h.x + h.w + foe.width / 2;
}

/** 反击命中（カウンターヒット）：打在对手出招的**起手或判定帧**里——他已经把身体交出去了，
 * 收不回来。伤害与硬直都加成，这是拳皇里"读招"和"牵制"之所以有意义的根据。
 * 实测半数攻击落空（空挥率 46%），而抓空挥此前一分钱回报都没有，读招等于白读。
 * 打在收招帧里不算反击——那是普通的抓招，本来就该赚，不需要再叠一层。 */
// 1.3/8 实测把角色差距整个放大了一档（牛魔王 63%、二郎神 35%）——加成太重，
// 起手慢的角色等于把代价付了两遍。1.2/6 仍然让读招明显有回报，但不再压垮慢角色。
export const COUNTER_DMG = 1.2, COUNTER_STUN = 6;
/** 大招起手无敌在判定生效后再多留几帧，盖住「同时出招」的抢帧情形 */
const SUPER_INVULN_TAIL = 6;
/** 防御取消：格挡中花 50 气把攻击方顶开。挨打方的出口，KOF 防守体系的支点 */
export const GC_COST = 50, GC_PUSH = 13, GC_STUN = 26;
/** 投技解脱：被投的窗口内按攻击可以挣脱 */
export const THROW_ESCAPE_WINDOW = 12;
/** 投技距离与冷却。实测第一关每局出现 15.3 次投技——近身按普攻就自动改投，
 * 于是贴身缠斗全变成摔跤。KOF 的投技是**有意为之**的近身选择，不是普攻的自动替代品：
 * 收紧到 52px（约一个身位），并加 72 帧冷却，让它回到「抓时机」而不是「贴上去就投」。 */
export const METER_ATK = 0.42, METER_VIC = 0.26;
/** 先行入力的有效帧数。拳皇量级是 3-8 帧，取 6（0.1 秒）：
 * 够吃下"在收招最后几帧点了一下"，又短到不会让上一次的手滑在半秒后突然冒出来。 */
export const INPUT_BUFFER = 6;
/** 会被缓冲的键。方向与防御不缓冲——那两个是持续状态，缓冲只会让人物自己乱动 */
const BUFFERED = ['attack', 'skill1', 'skill2', 'skill3', 'super', 'blowback'] as const;
/** "从没按过"的哨兵。必须远大于任何可能的窗口：写 99 的话，把 INPUT_BUFFER 调大到 99 以上
 * 就会让**没按过的键**也落进窗口里——实测那样一解除硬直先蹦出来的是吹飞攻击（CD 分支
 * 排在最前，它的 blowback 缓冲同样是那个默认值）。哨兵和窗口大小不该耦合。 */
const NEVER = Number.MAX_SAFE_INTEGER;
/** 投技伤害相对角色 n3（连段收招，他最重的一记普攻）的倍率。
 * 0.9 是按"四人 n3 的均值 13.25 × 0.9 ≈ 12"定的——12 正是改动前写死的那个数：
 * 换成按角色推导是为了让抡人的牛魔王（n3 15 → 投技 14）和扎人的哪吒（12 → 11）不再一样疼，
 * 而不是顺带把投技整体调强。直接用 n3 原值试过，平均伤害从 12 抬到 13.25，
 * 角色矩阵当场从 52/55/48/45 散成 39/51/57/52——改口味不该同时改难度。 */
const THROW_VS_N3 = 0.9;
export const THROW_RANGE = 52;
const THROW_CD = 72;

/** 击倒是**招式的属性**，不是伤害阈值——这一条以前只写在注释里，代码却仍在按
 * 「伤害 >= 12 或带浮空」判定，而几乎每个必杀都带浮空，结果是每人 9 招里 6 招都击倒。
 * 实测倒地占了对局 20.9% 的时间（仅次于出招），一局约 16 次击倒、每 2 秒一次，
 * 而受身只有 0.64 次/局——五分之一的对局时间双方都够不到对方，压制根本无从谈起。
 *
 * 现在只认两件事：招式显式标了 knockdown，或者带浮空（knockback.y > 0）。
 * 每个角色因此只剩一记击倒必杀 + n3 收招 + 大招/投技/吹飞，其余必杀打完对手还站着，
 * 攻势可以接着走。
/** 倒地总时长。46 帧（0.77s）太短，人刚倒下就弹起来，读不出"被打倒"这件事；
 * 但 72 帧太长：实测倒地占了对局 22% 的时间，每 2.5 秒就有人躺在地上。
 * 提高伤害阈值没用——技能大多带浮空，走的是"击飞→落地"那条路，不看伤害。
 * 真正的杠杆是这个时长本身。52 帧仍然装得下摔→躺→撑起来三段，只是每段更紧。 */
export const DOWN_STUN = 52;
/** 起身无敌。30 帧太长，压制方刚贴上去就被无敌顶开，"压上去"根本成立不了；
 * 收到 14 帧——够挡住起身瞬间的必杀，但留出了继续进攻的空间 */
const WAKEUP_INVULN = 14;

/** 一个回合的时限（帧）。60 秒——实测平均一局 27.8s，所以它平时不会响，
 * 但它做成了两件事：一是封顶（只跑不打实测能拖到 89 秒，是正常回合的三倍），
 * 二是让「领先时守住血量」变成一个真的策略，这是拳皇的核心策略层，没有读秒就不存在。
 * 时间到按血量比例判胜；完全相等（极罕见）算平局，双方各记一个回合。 */
export const ROUND_TIME = 60 * 60;

/** KO 之后继续推进的帧数。要够长到把最重的一次击飞走完：击飞初速 vy 最大 19、重力 0.9，
 * 滞空约 2*19/0.9 ≈ 42 帧，落地后 fallen 动作 44 帧，再留一点余量。 */
/** 挡下一击之后的硬直。普攻的收招必须长于它，否则连打就成了没有空隙的真连防
 *（见 tests/training.test.ts 里那条断言）。此前是写死在 applyHit 里的字面量 6。 */
export const BLOCK_STUN = 6;

export const KO_OUTRO = 120;

/**
 * 挑発（KOF97 的挑衅）。**削对手的气**，不是纯表演——拳皇里挑衅削的正是对方的气槽，
 * 而这个游戏最吓人的东西就是 BOSS 的超必杀，削气是有意义的选择。
 *
 * 削 10：一管气 100，四次挑衅抵掉一次奥义的攒气量，够称得上一个选项，
 * 又不至于让"站着不打专心嘲讽"成为打法（那 47 帧里你既不推进也不攒自己的气）。
 *
 * 实测（四关×10 局，一有机会就挑衅 vs 从不挑衅）：
 *   机会 10.4 次/回合（几乎全来自把对手打倒之后），带冷却实际能出 3.6 次
 *   BOSS 大招 0.75 → 0.53 次/回合（少三成——这正是想买到的东西）
 * 代价这一侧量不干净：探针为了强行挑衅得按住防御，于是"多挡了多少"和"少压制了多少"
 * 混在一起，回合末剩血反而升了。代价是靠帧数成立的（47 帧不能动 + 3 秒冷却），
 * 不是靠这个数——**别拿那一栏当证据**。
 */
export const TAUNT_DRAIN = 10;
/** 挑発的收招够长，必须**够不着的时候**才准出，否则就是一个白送的破绽。
 * 320 比全场最长的攻程（二郎神 s1 的 260）还远一档——真的够不着，不是差不多。 */
export const TAUNT_SAFE = 320;
export const TAUNT_FRAMES = { startup: 12, active: 1, recovery: 34 };
/**
 * 挑衅之间的间隔。**必须有**：触屏上"摇杆推上 + 按住防御"是可以一直按着的，
 * 而 47 帧一轮的话，隔着场地按住不放就是每秒削 12.7 气——BOSS 的超必杀会被按到永不出现，
 * 游戏以一种很无聊的方式变简单。180 帧（3 秒）把它压回"一个选择"，
 * 而不是"一个可以按住的水龙头"。
 */
export const TAUNT_CD = 180;

/**
 * 这一刻准不准挑衅。抽成纯函数是为了能单独测这条闸门——它是这个机制唯一的风险控制。
 *
 * 两种情形：对手**正躺着**（起身压制与嘲讽二选一，这是真的取舍），
 * 或者两人隔得够远（够不着）。其余时候按了没反应，宁可哑火也不能变成送人头的按键——
 * 摇杆上推 + 按住防御是「防御中想跳」很容易搓出来的组合。
 *
 * **block 必须算在里面**：真实的按法是先按住防御、再把摇杆推上去（摇杆和按键在两只手上，
 * 同一帧按下是巧合不是操作），而按住防御的那一刻人已经进了 block 状态。
 * 只认 idle/walk 的话这个招在实机上根本按不出来，只有单元测试里"同一帧同时按"那种
 * 写法才触发得了——差一点就这么发出去了。从格挡里挑衅 = 主动撤防，而闸门本身
 * 已经保证了这一刻挨不着打，所以撤防没有代价；贴脸格挡时照旧哑火。
 */
export function canTaunt(state: FighterState, gap: number, foeState: FighterState, cdLeft = 0): boolean {
  if (state !== 'idle' && state !== 'walk' && state !== 'block') return false;
  if (cdLeft > 0) return false;
  return foeState === 'down' || gap > TAUNT_SAFE;
}

/** 回合之间保留多少气。1 = 全额带过去，与 KOF97 一致。
 * 拳皇的气槽是跨回合的，那正是三局两胜越打越热闹的原因，也是"攒气"这件事成立的前提。 */
export const METER_CARRY = 1;

/**
 * 上一回合结束时剩这么多气，下一回合从多少开始。
 *
 * 此前每个回合都 `new Battle`，气槽整个清零。后果实测得很清楚：
 * 一局气槽峰值平均只有 **79**，达到 100 的次数是 0.31 次/回合——
 * 超必杀（全游戏制作最重的一段：十秒演出、cut-in、火焰背光）因此 0.25 次/回合才出现一次。
 * 而到了 100 的那 15 次里有 12 次真的放了超必杀，说明不是"舍不得放"，是**根本攒不到**。
 * 经济本身是紧的（每回合约生成 110-140 气，而 50 档的奥义与爆气合计要花掉一百多），
 * 再加上每回合清零，攒气这条路等于被锁死两重。
 */
export function carryOverMeter(endMeter: number): number {
  return Math.max(0, Math.min(100, Math.round(endMeter * METER_CARRY)));
}

/** 这一位是否正处在大招的起手帧里（暗転期间对手要冻结，见 tick） */
function superStartup(f: Fighter): boolean {
  return f.state === 'attack' && !!f.move && f.move.meterCost > 0 && f.stateFrame < f.move.startup;
}

/** 受击框高度。蹲着矮一截——**蹲防也算蹲着**。
 * 原来只认 'crouch' 状态：单纯蹲下矮，蹲着防却仍是站立高度，于是"蹲下"能整个躲开的招
 *（哪吒 n1、二郎神 s1，判定框都在 68 以上），"蹲着防"反而躲不过，只能挡下来吃削减伤害。
 * 抽成一处是因为近身判定与投射物判定各写了一份，改一处漏一处正是这次踩到的。 */
function hurtHeight(f: Fighter): number {
  const crouchedReaction = f.y <= 0 && f.state === 'hitstun' && f.hurtKind === 'crouch';
  return f.state === 'crouch' || (f.state === 'block' && f.lowGuard) || crouchedReaction
    ? CROUCH_HEIGHT : f.def.height;
}

export function createFighter(def: CharacterDef, x: number, facing: 1 | -1): Fighter {
  return {
    def, x, y: 0, vx: 0, vy: 0, facing,
    hp: def.hp, meter: 0,
    state: 'idle', stateFrame: 0, stun: 0,
    move: null, hitCount: 0, hurtCount: 0, hurtKind: 'high', lastHitFrame: 0, chainQueued: false, airborne: false,
    armorLeft: 0, maxMode: 0, charge: 0, escapeAge: 999, escapePrev: false, techPrev: false, techable: true, downByThrow: false, throwCd: 0, landStun: 0, victory: 0,
    buf: {}, bufPrev: {},
    tapDir: 0, tapAge: 99, prevMove: 0, lowGuard: false,
    invuln: 0, flash: 0, cooldowns: {},
  };
}

export class Battle {
  p1: Fighter;
  p2: Fighter;
  frame = 0;
  hitstop = 0;
  winner: 0 | 1 | null = null;
  /** 终结演出进行中、已经打空血但还没宣布的胜负。
   * 完整版大招是"这一击能 KO 才播"的，若在第 3 段就把 battle 冻住，剩下四十多段连打和
   * 整个终结爆发根本放不出来——演出的意义恰恰在后面。所以命中把血打到 0 时先记在这里，
   * 等这一招自己走完（或出招者被打断）再宣布。 */
  private pendingKo: 0 | 1 | null = null;
  /** KO 之后仍然推进的帧数，用来把死亡动作播完（见 tick 顶部注释） */
  private koOutro = KO_OUTRO;
  /** 本回合剩余帧数。挂在逻辑 tick 上递减——这个项目已经在"按渲染帧推进本该按逻辑帧走的量"
   * 上栽过三次，读秒是最经不起这种错的量 */
  timeLeft = ROUND_TIME;
  /** 这一回合是被读秒判掉的（不是 KO）。渲染层用它决定放不放死亡演出 */
  timeUp = false;
  /** 双 KO：同一帧两边都被打空血。winner 留 null（平局），但回合确实结束了 */
  doubleKo = false;
  /** 本 tick 内宣布过击杀的一方，末尾由 settleKo 统一裁决（可能有两条 = 双 KO） */
  private koIntent: (0 | 1)[] = [];
  /** An off-engine finisher (the FastH3 ultimate cinematic) waiting to land on the next tick. */
  private queuedStrike: { who: 0 | 1; damage: number } | null = null;
  events: BattleEvent[] = [];
  /** 场上的投射物。乾坤圈这类"招式名承诺了实物"的招靠它兑现——实体自带判定框，
   * 飞行途中命中即结算，不是画个特效糊弄 */
  projectiles: Projectile[] = [];

  /** Legacy meter mechanics remain available to the engine, but Arena demos disable them. */
  constructor(d1: CharacterDef, d2: CharacterDef, x1 = 300, x2 = 660, readonly advancedCombat = true) {
    this.p1 = createFighter(d1, x1, 1);
    this.p2 = createFighter(d2, x2, -1);
  }

  tick(i1: InputFrame, i2: InputFrame) {
    this.events = [];
    if (!this.advancedCombat) {
      // Enforce the same rules for keyboard, touch, CPU and incoming online inputs.
      i1 = { ...i1, super: false, blowback: false };
      i2 = { ...i2, super: false, blowback: false };
      this.clearLegacyMeter();
    }
    this.faceOpponents();
    // KO 之后再跑一段"落幕帧"：原来这里直接 return，整场瞬间冻住——被击飞的人停在半空、
    // 倒地动作根本不播，慢镜慢放的是一张静止画面。现在继续推进物理与动作，只是双方都
    // 收不到输入（NULL_INPUT），所以不会再有新的攻击，只有被打飞那一位把弧线走完、砸在
    // 地上、塌下去。跑满 KO_OUTRO 帧后才真正停住。
    // timeUp 也要进这一支，而且必须**单列**：读秒判胜时 winner 已经不是 null，
    // 但**读秒平局**（双方血量比例完全相等）winner 留 null、doubleKo 也是 false，
    // 于是整场继续接受输入。实测：贴脸平局判定之后再打 120 帧，winner 从 null 变成 0、
    // 对手被打死——回合早已判为平局，四秒后又悄悄变成一方获胜（上层在结算延迟结束时
    // 才读 winner，读到的是被改写过的那个）。玩家只要一整回合没挨过打就能走到这里。
    if (this.winner !== null || this.doubleKo || this.timeUp) {
      // 双 KO 也要走落幕帧：两个人都得把倒地演完，不能画面一冻就跳结算
      if (this.koOutro <= 0) return;
      this.koOutro--;
      i1 = NULL_INPUT;
      i2 = NULL_INPUT;
    }
    this.frame++;
    // 读秒。三个不走的条件：
    //  · winner 已定（上面那段 KO 落幕帧并没有 return，还会跑 120 帧，不判的话读秒会在
    //    死亡演出里接着走）
    //  · 双 KO 平局同理
    //  · **大招演出期间**——那十秒里对手被暗転冻住、出招者锁在动作里，双方都无法影响局面，
    //    不该计进读秒。实测不停的话：剩 60 帧时放完整版大招，演出走到第 19 帧、一下都还没
    //    打出去，回合就被读秒判掉了，花 100 气买的终结演出直接作废。
    //
    // 顿帧（4-12 帧）仍然照走：那是量级完全不同的东西，停了反而要在每次命中上做手脚。
    if (this.winner === null && !this.doubleKo && !this.inSuperCinematic()
      && this.timeLeft > 0 && --this.timeLeft === 0) this.declareTimeUp();
    if (this.queuedStrike) this.landQueuedStrike();
    if (this.hitstop > 0) { this.hitstop--; return; }
    // 暗転：大招起手期间对手一并冻结。冻结既不是无敌也不是硬直——双方的计时都停住，
    // 起手结束时对手仍停在原来的状态里（还在硬直就继续在硬直里）。
    //
    // 没有它，从连段取消进大招必定落空：最短的短版起手 55 帧，而普攻硬直只有 14~16 帧，
    // 对手早脱离了。实测「三段接奥义」打出的伤害与纯连打的前三段一模一样——花掉 50 气
    // 换来一个空挥。拳皇的超必杀发动本来就有时停，这里此前只在渲染层做了视觉时停。
    const frz1 = superStartup(this.p1), frz2 = superStartup(this.p2);
    if (!frz2) this.update(this.p1, this.p2, i1, 0);
    if (!frz1) this.update(this.p2, this.p1, i2, 1);
    this.separate();
    this.faceOpponents();
    // 同帧相打：两边的判定必须都在任何一边被打进硬直**之前**做出。
    // 原来是 checkHit(p1) 紧接 checkHit(p2)，第一发一落，对手就进了 hitstun，
    // 开头的 `atk.state !== 'attack'` 直接把他的招毙掉——先结算的那一方白嫖所有对拼。
    // 实测双方用完全相同的决策打镜像局，先手胜率 75%。拳皇里两招同时命中是相打ち。
    const m1 = this.hitLands(this.p1, this.p2);
    const m2 = this.hitLands(this.p2, this.p1);
    if (m1) this.applyHit(this.p1, this.p2, 0, m1);
    if (m2) this.applyHit(this.p2, this.p1, 1, m2);
    this.stepProjectiles();
    if (!this.advancedCombat) this.clearLegacyMeter();
    this.settleKo();          // 本 tick 的击杀统一裁决（双 KO 判平局）
    this.flushPendingKo(); // 终结演出走完（或被打断）的那一 tick 才宣布胜负
    // 胜利姿势的计时。放在 tick 末尾而不是 update 里：赢家可能停在任何状态，
    // 而这个量必须每逻辑帧恰好推进一次（这个项目在"按逻辑帧走的量"上栽过四次）
    if (this.p1.victory > 0) this.p1.victory++;
    if (this.p2.victory > 0) this.p2.victory++;
  }

  private clearLegacyMeter() {
    for (const f of [this.p1, this.p2]) {
      f.meter = 0;
      f.maxMode = 0;
      f.charge = 0;
    }
  }

  private faceOpponents() {
    const p1FacesRight = this.p2.x >= this.p1.x;
    this.p1.facing = p1FacesRight ? 1 : -1;
    this.p2.facing = p1FacesRight ? -1 : 1;
  }

  /** 有没有一方正在放大招（含起手暗転与整段演出）。读秒在这段时间里停住。
   * Public so the FastH3 ultimate can wait it out: its reference frame must not be the darkened super screen. */
  inSuperCinematic(): boolean {
    for (const f of [this.p1, this.p2]) {
      if (f.state === 'attack' && f.move && f.move.meterCost > 0) return true;
    }
    return false;
  }

  private update(f: Fighter, foe: Fighter, input: InputFrame, who: 0 | 1) {
    f.stateFrame++;
    // 投技解脱的输入年龄。原来写的是 escapeArmed = input.attack，配合下面的
    // foe.stateFrame <= THROW_ESCAPE_WINDOW 使用——但 stateFrame 是**受害者当前状态的年龄**，
    // 和刚被投这件事毫无关系，两个条件同时成立近乎不可能：实测解脱 0.02 次/局，
    // 而投技有 4.33 次/局，等于 README 承诺的那个出口根本不存在。
    // 改成记：距上一次新按下攻击键过了几帧，被投前 12 帧内按过就挣脱。
    // 取边沿而不是看按住——按住不放就能免疫投技的话投技又白给了（受身踩过同一个坑）。
    // 先行入力：记下每个出招键距上一次新按下过了几帧。取边沿而不是看按住——
    // 按住不放该是"一直想出招"而不是"入队一百次"，后者会在解除硬直的瞬间连喷好几招
    for (const k of BUFFERED) {
      f.buf[k] = (input[k] && !f.bufPrev[k]) ? 0 : Math.min(NEVER, (f.buf[k] ?? NEVER) + 1);
      f.bufPrev[k] = !!input[k];
    }
    f.escapeAge = (input.attack && !f.escapePrev) ? 0 : f.escapeAge + 1;
    f.escapePrev = input.attack;
    // 非倒地时持续跟踪受身键，进 down 那一帧才有正确的「上一帧」值
    if (f.state !== 'down') f.techPrev = input.attack || input.block;
    if (f.maxMode > 0) f.maxMode--;
    // 蓄气：按住蹲+防御原地聚力。KOF 的爆气入口，也给了"什么都不做"一个用途
    // 蓄气原来是「蹲+防」，那组输入现在归蹲防了（上下段防御，见 hitLands 附近的 blocked 计算）。
    // 挪到「防+大招键」：此前这一组是无操作（idle 分支里 block 先命中，block 状态里不查 super），
    // 空位现成，不占新按键，手机上也够得着。
    if (input.block && input.super && (f.state === 'crouch' || f.state === 'block' || f.state === 'idle')) {
      f.charge++;
      if (f.charge >= CHARGE_RATE) { f.charge = 0; f.meter = Math.min(100, f.meter + 1); }
      if (f.meter >= MAX_COST && f.maxMode === 0) {
        f.meter -= MAX_COST;
        f.maxMode = MAX_FRAMES;
        // 爆气：发动瞬间把贴身的对手顶开，并给自己一小段无敌。
        //
        // 没有这一下，MAX 是被严格支配的：同样 50 气，奥义在连段里能打 60-70 伤害，
        // 而 MAX 只是 5 秒 ×1.25（MAX_FRAMES=300）——按一局能抓到的开口算，大概只值半个奥义，没人会选它。
        // 加上顶开与无敌之后它才是另一种东西：一个花气买的脱身键，被压在版边时的出口。
        // 顶开距离与无敌帧沿用防御取消（GC_PUSH/8 帧），两者是同一类"挨打方的出路"。
        if (Math.abs(foe.x - f.x) < MAX_BURST_RANGE && foe.state !== 'down') {
          // 必须把对手推进 hitstun，光设 vx 是**没用的**：站着的人下一帧就在 idle 分支里
          // 被 `f.vx = input.move * speed` 覆盖掉，一步都不会退——
          // 帮助页写着"顶开对手"，而实测最常见的那种情形（对手站着）一点都没顶开。
          // 防御取消能顶开正是因为它同时进 hitstun（那个状态保留 vx），这里沿用同一套；
          // 但硬直帧数**不**沿用（见 MAX_BURST_STUN 上面那段）。
          // 直接挪位置，不给硬直。只设 vx 是没用的（站着的人下一帧就在 idle 分支里被
          // `f.vx = input.move * speed` 覆盖掉，一步都不会退）；而把人打进 hitstun 又太便宜——
          // 防御取消得先被压在格挡硬直里才用得上，爆气只要有 50 气随时能按，
          // 实测那样哪吒总胜率从 53% 窜到 67%，越过矩阵上限（26 帧和 10 帧都一样越界，
          // 说明贵的不是硬直长度，是"打断对手"这件事本身）。
          // 拳皇里爆气本来也是推开 + 短无敌，不是把人打硬直。
          foe.x = Math.min(ARENA_MAX, Math.max(ARENA_MIN, foe.x + GC_PUSH * f.facing));
          if (foe.state === 'attack') { foe.move = null; this.setState(foe, 'idle'); }
        }
        f.invuln = Math.max(f.invuln, MAX_BURST_INVULN);
        this.events.push({ type: 'maxMode', who });
      }
    } else f.charge = 0;
    for (const k in f.cooldowns) if (f.cooldowns[k] > 0) f.cooldowns[k]--;
    if (f.invuln > 0) f.invuln--;
    if (f.throwCd > 0) f.throwCd--;
    if (f.flash > 0) f.flash--;
    if (f.state !== 'attack') f.facing = foe.x >= f.x ? 1 : -1;

    // 双击检测：同一方向在 TAP_WINDOW 帧内按第二次就起跑/后跳。
    // 放在状态机之前，因为不管当前什么状态都要记录方向历史，否则"走→停→再推"会漏判。
    f.tapAge++;
    const dir = input.move;
    let doubleTap: Dir = 0;
    if (dir !== 0 && f.prevMove === 0) {           // 这一帧刚推杆（上一帧是中立）
      if (f.tapDir === dir && f.tapAge <= TAP_WINDOW) doubleTap = dir;
      f.tapDir = dir; f.tapAge = 0;
    }
    // 方向键的**新按下**边沿，必须在覆盖 f.prevMove **之前**取。
    // 第一版在 block 分支里直接写 `f.prevMove === 0`——而 prevMove 早在这一行就被
    // 当前帧的 dir 覆盖了，那个条件永远不成立，整段防御取消·回避是死代码，
    // 而且所有测试照样绿（它什么都没做，当然不会破坏任何东西）。
    const freshDir = dir !== 0 && f.prevMove === 0;
    f.prevMove = dir;

    // 着地硬直：这几帧里不接受任何操作，但照常受身体碰撞与判定（人是站着的，不是无敌）
    // 写成 else switch 而不是提前 return：switch 之后还有出界钳制，
    // return 会让人在硬直里滑出场地
    if (f.landStun > 0) {
      f.landStun--;
      f.vx *= 0.8;
      f.x += f.vx;
    } else switch (f.state) {
      case 'idle':
      case 'walk':
        // 紧急回避。无敌翻滚穿过对手，是 KOF 最标志性的防守选项。
        // 读的是显式的 input.roll（输入层用「防御 + 新按方向」合成，见 InputFrame.roll）——
        // 此前这里直接判 `block && dir !== 0`，条件每帧都成立，按住「防+后」会连滚不止。
        if (input.roll) {
          const rd = dir !== 0 ? dir : f.facing;      // 不给方向就朝前滚
          f.vx = ROLL_VX * (rd === f.facing ? f.facing : -f.facing);
          this.setState(f, 'roll');
          break;
        }
        if (doubleTap !== 0) {
          if (doubleTap === f.facing) { this.setState(f, 'run'); break; }
          f.vx = -BACKSTEP_VX * f.facing; f.vy = BACKSTEP_VY; f.y = 0.01;
          this.setState(f, 'backstep');
          break;
        }
        // 吹飞攻击（攻击+防御同按）必须排在"进防御"之前判定——否则同按时
        // block 分支先命中，CD 永远出不来
        if (this.advancedCombat && (input.blowback || (input.attack && input.block))) { this.startMove(f, this.cdMove(f), who); break; }
        // 挑発：防御 + 上。排在 block 之前（不然 block 分支先吃掉这个组合），
        // 排在 roll/CD 之后（防+方向、防+拳 都是既有的、更要紧的出路）。
        // canTaunt 不成立时**什么都不做**，继续往下走进防御——按了没反应好过白送一个破绽
        if (input.block && input.jump
          && canTaunt(f.state, Math.abs(foe.x - f.x), foe.state, f.cooldowns[this.tauntMove(f, foe).id] ?? 0)) {
          foe.meter = Math.max(0, foe.meter - TAUNT_DRAIN);
          this.startMove(f, this.tauntMove(f, foe), who);
          break;
        }
        if (input.block) { f.vx = 0; f.lowGuard = input.crouch; this.setState(f, 'block'); break; }
        if (this.tryAttack(f, foe, input, who)) break;
        if (input.jump) { f.vy = f.def.jumpVel * SHORT_HOP; f.y = 0.01; this.setState(f, 'jump'); break; }
        if (input.crouch) { f.vx = 0; this.setState(f, 'crouch'); break; }
        f.vx = input.move * f.def.speed;
        f.x += f.vx;
        this.setState(f, input.move !== 0 ? 'walk' : 'idle');
        break;
      case 'run':
        // 跑：明显快过走。松开方向或反向即停；跳/攻击/防御都能从跑里接出去
        // 吹飞攻击（攻击+防御同按）必须排在"进防御"之前判定——否则同按时
        // block 分支先命中，CD 永远出不来
        if (this.advancedCombat && (input.blowback || (input.attack && input.block))) { this.startMove(f, this.cdMove(f), who); break; }
        if (input.block) { f.vx = 0; this.setState(f, 'block'); break; }
        if (this.tryAttack(f, foe, input, who)) break;
        if (input.jump) { f.vy = f.def.jumpVel * SHORT_HOP; f.y = 0.01; f.vx = f.facing * f.def.speed; this.setState(f, 'jump'); break; }
        if (dir !== f.facing) { f.vx = 0; this.setState(f, 'idle'); break; }
        f.vx = f.facing * f.def.speed * RUN_MULT;
        f.x += f.vx;
        break;
      case 'backstep':
        // 后跳：小抛物线，起跳几帧无敌（KOF 的后跳可以用来躲起身压制）
        f.invuln = Math.max(f.invuln, f.stateFrame < 6 ? 6 - f.stateFrame : 0);
        f.x += f.vx;
        f.vx *= 0.94;
        f.y += f.vy;
        f.vy -= GRAVITY;
        if (f.y <= 0 || f.stateFrame >= BACKSTEP_FRAMES) {
          f.y = 0; f.vy = 0; f.vx = 0; this.setState(f, 'idle');
        }
        break;
      case 'roll':
        // 紧急回避：中段无敌、可以穿过对手，收尾有硬直——赌时机，不是无风险按键
        if (f.stateFrame >= ROLL_INVULN_FROM && f.stateFrame <= ROLL_INVULN_TO) f.invuln = Math.max(f.invuln, 2);
        f.x += f.vx;
        f.vx *= 0.93;
        if (f.stateFrame >= ROLL_FRAMES) { f.vx = 0; this.setState(f, 'idle'); }
        break;
      case 'jump':
        // 小跳 / 大跳：起跳先按小跳给初速，头几帧仍按住跳跃键才补成大跳。
        // 只看边沿信号是分不出长短按的——所以 InputFrame 多带一个 jumpHeld
        if (f.stateFrame <= HOP_DECIDE && input.jumpHeld) f.vy = f.def.jumpVel;
        // 空中普攻：跳跃中按攻击键出 jA。命中/落地都结束这一招（下面 attack 分支里处理落地）
        if (input.attack) { this.startMove(f, f.def.moves.jA, who); f.airborne = true; break; }
        f.x += input.move * f.def.speed * 0.8;
        f.y += f.vy;
        f.vy -= GRAVITY;
        if (f.y <= 0) { f.y = 0; f.vy = 0; f.landStun = LAND_STUN; this.setState(f, 'idle'); }
        break;
      case 'attack': {
        const m = f.move!;
        if (f.airborne) { // 空中招：重力照常作用，落地即收招（不是等帧数走完）
          f.x += input.move * f.def.speed * 0.8;
          f.y += f.vy;
          f.vy -= GRAVITY;
          if (f.y <= 0) {
            f.y = 0; f.vy = 0; f.vx = 0; f.airborne = false;
            f.landStun = LAND_STUN_ATK;
            f.move = null; this.setState(f, 'idle');
            break;
          }
        }
        f.x += f.vx;
        f.vx *= 0.88;
        if (m.dash) for (const d of m.dash) if (f.stateFrame === d.frame) f.vx = d.vx * f.facing;
        if (input.attack && f.hitCount > 0 && (m.slot === 'n1' || m.slot === 'n2')) f.chainQueued = true;
        // 必杀取消：普攻**命中之后**可以立刻取消进技能/大招。连段深度全靠这条——
        // 没有它，普攻和必杀之间永远接不上，只能各打各的
        if (f.hitCount > 0) {
          const fromNormal = m.slot.startsWith('n');
          // 技能取消只能从普攻起手。技能接技能会变成"必杀无限"——每一记必杀都能续上下一记
          if (fromNormal) {
            for (const [key, slot] of [['skill1', 's1'], ['skill2', 's2'], ['skill3', 's3']] as const) {
              if (input[key] && !(f.cooldowns[f.def.moves[slot].id] > 0)) { this.startMove(f, f.def.moves[slot], who); return; }
            }
          }
          // 大招取消：普攻**和必杀**都能接。这是拳皇的スーパーキャンセル，也是连段深度的上限——
          // 没有它，气槽唯一的用法就是"普攻第二段接大招"，一条路走到黑。
          // 明确列出 s1/s2/s3 而不是写 startsWith('s')：那样连 sp50/sp100 都会命中这条，
          // 大招就能在自己的演出途中被下一记大招顶掉。
          const fromSkill = m.slot === 's1' || m.slot === 's2' || m.slot === 's3';
          if ((fromNormal || fromSkill) && input.super) {
            const tier = f.meter >= 100 ? f.def.moves.sp100 : f.meter >= 50 ? f.def.moves.sp50 : null;
            if (tier) { this.startMove(f, tier, who); this.events.push({ type: 'super', who, tier: tier.meterCost as 50 | 100 }); return; }
          }
        }
        // 连段取消：命中之后，收招帧被下一段直接吃掉——这就是拳皇的キャンセル，
        // 也是三段连击能成立的唯一前提。
        //
        // 不砍收招的话，两段之间的实际间隔是「剩余 active + recovery + 下一段 startup」：
        // 实测哪吒 18 帧、孙悟空 19、二郎神 20、牛魔王 23，而 hitstun 只有 14~16——
        // 四个角色一段都连不上，对手在每两段之间都能脱离硬直反击。所谓"三段连击"
        // 其实是三次各打各的。砍掉收招后间隔降到 11~14，才真的锁得住。
        //
        // 空挥不能取消：chainQueued 只在 hitCount > 0 时置位，与必杀取消同一规则。
        if (f.chainQueued && (m.slot === 'n1' || m.slot === 'n2')
            && f.stateFrame >= m.startup + m.active) {
          this.startMove(f, f.def.moves[m.slot === 'n1' ? 'n2' : 'n3'], who);
          return;
        }
        if (f.stateFrame >= m.startup + m.active + m.recovery) {
          if (f.chainQueued && (m.slot === 'n1' || m.slot === 'n2')) {
            this.startMove(f, f.def.moves[m.slot === 'n1' ? 'n2' : 'n3'], who);
          } else if (f.airborne && f.y > 0) {
            // 空中招的帧数走完了但人还没落地——必须交还给 jump 状态，否则会停在
            // 没有重力的 idle 里**永远浮在半空**（实测卡在 y=143 不动）。
            // 这是"空中招"这类招式最容易漏的一条：只处理了"落地时收招"，没处理
            // "招式先结束"。
            f.vx = 0;
            f.move = null;
            f.airborne = false;
            this.setState(f, 'jump');
          } else {
            f.vx = 0;
            f.move = null;
            f.airborne = false;
            this.setState(f, 'idle');
          }
        }
        break;
      }
      case 'block':
        f.x += f.vx;
        f.vx *= 0.8;
        // 防御中随时可以切上下段：按着防再推下就是蹲防。KOF 的防御是持续的判断，
        // 不是进入格挡那一刻定死的姿势
        f.lowGuard = input.crouch;
        // 防御取消：格挡硬直中花 50 气把对手顶开。没有它，一旦被压住就只能一直挡到死
        if (f.stun > 0 && input.attack && f.meter >= GC_COST) {
          f.meter -= GC_COST;
          foe.vx = GC_PUSH * f.facing;
          this.recordHurt(foe, foe.def.height * 0.5);
          this.setState(foe, 'hitstun');
          foe.stateFrame = 0;
          foe.stun = GC_STUN;
          foe.move = null;
          // 下面两行是跟另外三条「把人打进 hitstun」的路径对账补上的：applyHit 每次都设
          // vic.flash（renderer 靠它画白闪），投技解脱每次都设 hitstop——只有防御取消
          // 两样都没有。花 50 气把人顶开，画面上一点动静都没有。
          foe.flash = 2;
          this.hitstop = 6;   // 与投技解脱同值：同样是「把人推开」这一类
          f.stun = 0;
          f.invuln = Math.max(f.invuln, 8);
          this.events.push({ type: 'guardCancel', who });
          this.setState(f, 'idle');
          break;
        }
        // 防御取消·回避（ガードキャンセル前転）：格挡硬直中「防御 + 新按方向」花 50 气滚出去。
        // 与上面那条防御取消同价，换来的却是**位置**而不是距离——滚到对手背后，把版边压制反过来。
        // 拳皇里挨打方有两条花气的出路，这里此前只有一条（顶开），格挡硬直中方向键完全是空的。
        //
        // 取**新按下的边沿**（freshDir），不看"按着没有"：防御时压着后方向是常见握法，
        // 看按住的话玩家一边退一边防就会莫名其妙掉 50 气（受身与投技解脱都栽过同一个坑）。
        if (f.stun > 0 && freshDir && f.meter >= GC_COST) {
          f.meter -= GC_COST;
          f.stun = 0;
          f.vx = ROLL_VX * (dir === f.facing ? f.facing : -f.facing);
          this.setState(f, 'roll');
          this.events.push({ type: 'guardCancel', who });
          break;
        }
        if (f.stun > 0) { f.stun--; break; }
        // 紧急回避**必须在 block 里也有一份**：真实按法是先按住防御再推方向，
        // 而最需要回避的处境（被压在版边挨打）恰恰就是"人已经在挡着"的那一刻。
        // 此前这条只写在 idle/walk 里，于是玩家想用的时候按不出来、不想用的时候连滚不止。
        // 排在格挡硬直之后：硬直中推方向是上面那条花 50 气的防御取消·回避，两者不抢。
        if (input.roll) {
          const rd = dir !== 0 ? dir : f.facing;
          f.vx = ROLL_VX * (rd === f.facing ? f.facing : -f.facing);
          this.setState(f, 'roll');
          break;
        }
        // 格挡硬直一结束就能直接出招，不必先松防。
        // 此前这里没有 tryAttack：挡完得先松开防御键（白花一帧进 idle）才出得了招，
        // 而拳皇里是可以直接从格挡里反击的。这一帧不是小事——实测挡下跳入之后，
        // 帧数上守方有 +11 的优势，实际只领先 1 帧（守方 12 帧才出招、跳入方 13 帧就自由了），
        // 优势全花在流程开销上，反击成功率因此只有 19%。
        if (this.advancedCombat && (input.blowback || (input.attack && input.block))) { this.startMove(f, this.cdMove(f), who); break; }
        // 挑発：防御 + 上。真实按法是先按住防御再推上，所以这条**必须**在 block 里也有一份，
        // 否则实机上按不出来（见 canTaunt 的注释）。排在格挡硬直之后：被压着的时候不撤防
        if (input.jump
          && canTaunt(f.state, Math.abs(foe.x - f.x), foe.state, f.cooldowns[this.tauntMove(f, foe).id] ?? 0)) {
          foe.meter = Math.max(0, foe.meter - TAUNT_DRAIN);
          this.startMove(f, this.tauntMove(f, foe), who);
          break;
        }
        if (this.tryAttack(f, foe, input, who)) break;
        if (!input.block) this.setState(f, 'idle');
        break;
      case 'crouch':
        f.vx = 0;
        if (input.block) { f.lowGuard = true; this.setState(f, 'block'); break; } // 从蹲进防御，天然是蹲防
        if (this.tryAttack(f, foe, input, who)) break;
        if (!input.crouch) this.setState(f, 'idle');
        break;
      case 'hitstun':
        f.x += f.vx;
        f.vx *= 0.85;
        if (f.y > 0) {
          // 悬空期间硬直不计时——必须落地才能脱离 hitstun，否则会卡在半空
          f.y += f.vy;
          f.vy -= GRAVITY;
          if (f.y <= 0) { f.y = 0; f.vy = 0; f.stun = DOWN_STUN; this.setState(f, 'down'); } // 击飞落地与地面击倒走同一套时长
          break;
        }
        f.stun--;
        if (f.stun <= 0) this.setState(f, 'idle');
        break;
      case 'down':
        // 受身：刚倒下的窗口内按攻击/防御可以翻滚起身，把 72 帧的干等缩短。
        // 没有这条的话挨打方只能眼睁睁看着对手站定，压制变成单方面惩罚
        // 受身要满足三条，缺一不可：
        //  1) 这次击倒允许受身——大招/投技/吹飞是硬直击倒，必须躺满
        //  2) 是「这一帧新按下」，不是一直按着。AI 一直按着攻击键，只看「按着」的话
        //     每次击倒都会自动受身，玩家看到的就是「打倒了对方马上就起来」
        //  3) 在窗口内
        const techKey = input.attack || input.block;
        const techEdge = techKey && !f.techPrev;
        f.techPrev = techKey;
        if (f.hp > 0 && f.techable && techEdge && f.stateFrame <= TECH_WINDOW && f.stun > TECH_STUN) {
          f.stun = TECH_STUN;
          f.vx = -3.2 * f.facing;
          this.events.push({ type: 'tech', who });
        }
        f.x += f.vx; f.vx *= 0.82; // 倒地后还带一点滑行，不是钉在原地
        f.stun--;
        // 输掉的那一位不再爬起来——之前 KO 后约 100 帧他会站回 idle，结算画面对着一个
        // 站得好好的人，看不出谁被打死了
        if (f.hp <= 0 || (this.winner !== null && this.winner !== who)) break;
        if (f.stun <= 0) { f.invuln = WAKEUP_INVULN; this.setState(f, 'idle'); }
        break;
    }
    f.x = Math.min(ARENA_MAX, Math.max(ARENA_MIN, f.x));
  }

  protected setState(f: Fighter, s: Fighter['state']) {
    if (f.state !== s) { f.state = s; f.stateFrame = 0; }
  }

  /** Call only for impacts that interrupt the victim, before changing their state or height. */
  private recordHurt(f: Fighter, contactHeight: number, launches = false) {
    const crouched = f.state === 'crouch' || (f.state === 'block' && f.lowGuard)
      || (f.state === 'hitstun' && f.hurtKind === 'crouch');
    f.hurtCount++;
    f.hurtKind = f.y > 0 || launches ? 'air' : crouched ? 'crouch'
      : contactHeight >= f.def.height * 0.65 ? 'high' : 'body';
  }

  /** CD 吹飞攻击：由该角色的 n3 合成——通用系统招不该逼着四个角色各写一份数据，
   * 而且"比自家重击更重"这件事本来就该从自家重击推出来。缓存在 def 上，只算一次。 */
  /** 硬直击倒判据：大招（吃气的）、吹飞攻击、投技。KOF 里这几类赢了就该拿到主动权 */
  private isHard(m: Move): boolean {
    return !!m.hardKnockdown || m.meterCost > 0 || m.id.endsWith('_cd');
  }

  /** 挑発：同 cdMove 一样是**系统招**，由角色自己的数据合成，不逼四份数据各写一遍。
   * 判定框给 0 宽——它打不到人，也不该被 checkHit 当成一次挥空来处理。
   * 动作直接借胜利造型（`${id}Victory`，四人各有一套）：挑衅本来就是"提前摆给你看"，
   * 复用既有的四套姿势，不必为它新画一套。 */
  /**
   * 挑衅招。**缓存的是招式的形状，不是那句台词**——台词按对手分（vsTaunt），
   * 而这个 Move 挂在 `f.def._taunt` 上按角色缓存：把 name 一起缓存进去的话，
   * 它会锁死在第一个挑衅过的对手身上，之后换谁都是那一句，且不报任何错。
   * 所以每次调用都用 tauntQuote 覆盖一遍 name。
   *（同一个 fighter 同时只可能有一次挑衅在演，两个 fighter 各有各的 def，所以改共享对象是安全的。）
   */
  private tauntMove(f: Fighter, foe: Fighter): Move {
    const cache = f.def as CharacterDef & { _taunt?: Move };
    if (!cache._taunt) {
      cache._taunt = {
        ...f.def.moves.n1, id: `${f.def.id}_taunt`, name: f.def.quotes.taunt,
        // slot 借 s1：横幅那边只给 s1-s3 在头顶浮字，挑衅要的正是这一种呈现
        slot: 's1', damage: 0, hitstun: 0, cooldown: TAUNT_CD, meterCost: 0,
        ...TAUNT_FRAMES,
        hitbox: { x: 0, y: 0, w: 0, h: 0 },
        knockback: { x: 0, y: 0 },
        motionId: `${f.def.id}Victory`,
        motionSeq: undefined, multiHit: undefined, projectile: undefined,
        dash: undefined, knockdown: undefined, hardKnockdown: undefined,
        guard: undefined, fx: [],
      };
    }
    cache._taunt.name = tauntQuote(f.def, foe.def.id);
    return cache._taunt;
  }

  private cdMove(f: Fighter): Move {
    const cache = f.def as CharacterDef & { _cd?: Move };
    if (!cache._cd) {
      const base = f.def.moves.n3;
      cache._cd = {
        ...base, id: `${f.def.id}_cd`, name: '吹飞攻击',
        damage: Math.round(base.damage * CD_DMG),
        knockback: { x: CD_KB_X, y: CD_KB_Y },
        knockdown: true, hardKnockdown: true, cooldown: 0, meterCost: 0,
        startup: base.startup + 3, recovery: base.recovery + 6,
        hitbox: { ...base.hitbox, w: base.hitbox.w * CD_W },
        multiHit: undefined, brief: undefined, projectile: undefined,
      };
    }
    return cache._cd;
  }

  /** 这个出招键这一帧算不算按下：当前按着，或者在缓冲窗口内新按过。**不改状态**。
   *
   * 与 eat 分成两步是被坑出来的：第一版写成一个"查看即消费"的函数，
   * 结果 CD 那一行 `peek(blowback) || (peek(attack) && input.block)` 会先把 attack 的缓冲
   * 吃掉，再因为 input.block 为假而不出招——缓冲没了，后面的普攻也就出不来。
   * 短路表达式里放带副作用的函数就是这么塌的。 */
  private peek(f: Fighter, input: InputFrame, key: typeof BUFFERED[number]): boolean {
    return !!input[key] || (f.buf[key] ?? NEVER) <= INPUT_BUFFER;
  }

  /** 兑现缓冲：一次按下只能出一招。
   * 说明白：目前没有任何测试能证明它是必需的——最短的招也有 15 帧，而缓冲只有 6 帧，
   * 出招期间缓冲必然自己过期，所以"反复出招"这条路现在走不通（红检时确认过：
   * 把这个函数改成空的，测试全绿）。留着是因为它在原则上正确，且将来出现更短的招时
   * 就是必需的——但不假装有测试守着。 */
  private eat(f: Fighter, ...keys: (typeof BUFFERED[number])[]): void {
    for (const k of keys) f.buf[k] = NEVER;
  }

  private tryAttack(f: Fighter, foe: Fighter, input: InputFrame, who: 0 | 1): boolean {
    const mv = f.def.moves;
    // CD 吹飞攻击：攻击+防御同按。放在最前面，否则会被单独的 attack 分支先吃掉
    if (this.advancedCombat && (this.peek(f, input, 'blowback') || (this.peek(f, input, 'attack') && input.block))) {
      this.eat(f, 'blowback', 'attack');
      this.startMove(f, this.cdMove(f), who);
      return true;
    }
    if (this.peek(f, input, 'super')) {
      const tier = f.meter >= 100 ? mv.sp100 : f.meter >= 50 ? mv.sp50 : null;
      if (tier) {
        this.eat(f, 'super');
        this.startMove(f, tier, who);
        this.events.push({ type: 'super', who, tier: tier.meterCost as 50 | 100 });
        return true;
      }
      return false;
    }
    for (const [key, slot] of [['skill1', 's1'], ['skill2', 's2'], ['skill3', 's3']] as const) {
      if (this.peek(f, input, key) && !(f.cooldowns[mv[slot].id] > 0)) {
        this.eat(f, key);
        this.startMove(f, mv[slot], who);
        return true;
      }
    }
    if (this.peek(f, input, 'attack')) {
      this.eat(f, 'attack');
      const g = f.def.grapple;
      const near = Math.abs(foe.x - f.x) < (g?.range ?? THROW_RANGE) && f.throwCd <= 0 && foe.y <= 0
        && foe.state !== 'hitstun' && foe.state !== 'down' && foe.invuln <= 0;
      if (near) { f.throwCd = g?.cd ?? THROW_CD; this.doThrow(f, foe, who); return true; }
      this.startMove(f, mv.n1, who);
      return true;
    }
    return false;
  }

  private doThrow(f: Fighter, foe: Fighter, who: 0 | 1) {
    // 投技解脱：对手刚起手或正处于可解脱状态时按攻击键即可挣脱，双方分开、都不吃伤害。
    // 投技若无解，近身就变成了纯粹的猜拳惩罚
    if (foe.state !== 'hitstun' && foe.state !== 'down' && foe.escapeAge <= THROW_ESCAPE_WINDOW) {
      f.vx = -6 * f.facing; foe.vx = 6 * f.facing;
      this.hitstop = 6;
      this.events.push({ type: 'throwEscape', who });
      return;
    }
    // 伤害从角色自己的 n3（连段收招，也就是他最重的一记普攻）推导，不再写死 12。
    // 写死的话四个人一样疼——而牛魔王的 n3 是 15、哪吒是 12，一个抡人一个扎人，
    // 投技的手感却相同，这正是 docs/engine-notes.zh-CN.md 里「别把帧数写进常数里」那条。
    // MAX 加成一并补上：近身与投射物两条路径都吃，投技这条原来漏了。
    const dmg = Math.round(f.def.moves.n3.damage * (f.def.grapple?.power ?? THROW_VS_N3)
      * (f.maxMode > 0 ? MAX_DMG : 1));
    foe.hp = Math.max(0, foe.hp - dmg);
    this.recordHurt(foe, foe.def.height * 0.5);
    foe.flash = 2;
    foe.vx = 5 * f.facing;
    foe.stun = DOWN_STUN;
    foe.move = null;
    foe.techable = false; // 投技是硬直击倒，不能受身
    foe.downByThrow = true;   // 但它是唯一留了出路的那一种（被抓前一瞬按普攻），提示层要分得出来
    this.setState(foe, 'down');
    // 气槽也走与命中同一套公式，原来是写死的 6（约等于 12 × METER_ATK，
    // 但伤害一变它就对不上了）；挨投的一方同样该攒气
    f.meter = Math.min(100, f.meter + Math.round(dmg * METER_ATK));
    foe.meter = Math.min(100, foe.meter + Math.round(dmg * METER_VIC));
    this.hitstop = 8;
    this.events.push({ type: 'throw', attacker: who });
    if (foe.hp <= 0) this.declareKo(who, f);
  }

  protected startMove(f: Fighter, m: Move, who: 0 | 1) {
    m = this.stagedMove(m, who);
    f.move = m;
    f.vx = 0; // 位移只来自这一招自己的 dash，不继承起手前（如走路）残留的速度
    f.hitCount = 0;
    f.armorLeft = m.armor ?? 0;
    f.lastHitFrame = 0;
    f.chainQueued = false;
    if (m.cooldown > 0) f.cooldowns[m.id] = m.cooldown;
    if (m.meterCost) f.meter -= m.meterCost;
    // 大招起手无敌：必须覆盖到判定生效为止，所以从招式自身推导而不是填常数。
    // 原来写死 60——那是 startup 还只有 16 帧时定的；现在 startup 是 110 帧，
    // 第 60 帧之后无敌就没了，对手正好在起手后半段把大招打断（用户实测到的正是这个）。
    // 判定一旦生效就恢复可被打，这是 KOF 的规矩：起手无敌不等于全程无敌。
    if (m.meterCost > 0) f.invuln = Math.max(f.invuln, m.startup + SUPER_INVULN_TAIL);
    f.state = 'attack';
    f.stateFrame = 0;
    this.events.push({ type: 'moveStart', who, move: m });
  }

  /** 挑演出版本：十秒的完整终结演出只在这一击**能 KO** 时播，否则换上三秒的短版。
   *
   * 判据在发动瞬间就能确定——`damage` 是这一招的总伤害，对手血量不高于它就必然被打死
   * （多段判定的每段伤害之和等于 damage）。因此不需要"打到一半再决定"，也就不会出现
   * 演出中途换版本的尴尬。
   *
   * 合并后返回一个新对象：下游所有读 f.move 的地方（判定窗口、fx、motionSeq、镜头节拍）
   * 拿到的都是已经定好的那一版，不必各自再判一次；每次发动多分配一个对象，代价可忽略。 */
  private stagedMove(m: Move, who: 0 | 1): Move {
    if (!m.brief) return m;
    const foe = who === 0 ? this.p2 : this.p1;
    if (foe.hp <= m.damage) return m; // 这一击能终结 → 完整演出
    return { ...m, ...m.brief, isBrief: true };
  }

  /** 投射物：生成、飞行、命中结算。回旋兵器（back>0）飞到一定帧数后速度反向。 */
  private stepProjectiles() {
    const atkOf = (pr: Projectile) => (pr.owner === 0 ? this.p1 : this.p2);
    for (const [f, who] of [[this.p1, 0], [this.p2, 1]] as const) {
      const m = f.state === 'attack' ? f.move : null;
      if (m?.projectile && f.stateFrame === m.projectile.spawnFrame) {
        this.projectiles.push({
          owner: who, x: f.x + 24 * f.facing, y: m.projectile.y,
          vx: m.projectile.vx, age: 0, life: m.projectile.life,
          facing: f.facing, hit: false, def: m.projectile,
        });
      }
    }
    for (let i = this.projectiles.length - 1; i >= 0; i--) {
      const pr = this.projectiles[i];
      pr.age++;
      if (pr.def.back && pr.age === pr.def.back) pr.vx = -pr.vx; // 回旋
      pr.x += pr.vx * pr.facing;
      const vic = pr.owner === 0 ? this.p2 : this.p1;
      // 倒地的人打不到（格斗游戏的通例：躺在地上的判定是关掉的）。不加这条的话，
      // 自己扔出去的投射物会在对手倒地途中把他打回站立硬直，击倒直接被自己取消——
      // 实测二郎神天眼光束/牛魔王芭蕉扇的倒地时长只剩 2-3 帧
      if (!pr.hit && vic.invuln <= 0 && vic.state !== 'down') {
        const pb = { x: pr.x - pr.def.w / 2, y: FLOOR_Y - pr.y - pr.def.h, w: pr.def.w, h: pr.def.h };
        const vb = worldBox(
          // 与近身判定同一套：蹲防也算蹲着，飞行物同样该从头上掠过
          { x: -vic.def.width / 2, y: 0, w: vic.def.width, h: hurtHeight(vic) },
          vic.x, FLOOR_Y - vic.y, 1,
        );
        if (overlaps(pb, vb)) {
          pr.hit = true;
          const blocked = vic.state === 'block';
          // 与近身同一套：反击命中（打在对手起手/判定帧里）与 MAX 加成，飞行物一样吃
          const counter = this.isCounter(vic, blocked);
          const boost = (atkOf(pr).maxMode > 0 ? MAX_DMG : 1) * (counter ? COUNTER_DMG : 1);
          const dmg = Math.round((blocked ? pr.def.damage * 0.2 : pr.def.damage) * boost);
          vic.hp = Math.max(0, vic.hp - dmg);
          vic.flash = 2;
          const atk = atkOf(pr);
          atk.meter = Math.min(100, atk.meter + Math.round(dmg * METER_ATK));
          vic.meter = Math.min(100, vic.meter + Math.round(dmg * METER_VIC));
          if (!blocked) {
            this.recordHurt(vic, pr.y + pr.def.h / 2 - vic.y, pr.def.knockback.y > 0);
            this.setState(vic, 'hitstun');
            vic.stateFrame = 0;
            vic.stun = pr.def.hitstun + (counter ? COUNTER_STUN : 0);
            vic.move = null;
            vic.vx = pr.def.knockback.x * pr.facing;
            // 可受身标记每次击倒都必须重设。近身那条路每个分支都设了，投射物这条一次都没设——
            // 于是它沿用上一次击倒留下的值：前一下是投技（硬直击倒、不能受身），
            // 后面被飞行物打倒也会变成不能受身，反过来同理。
            // 飞行物属于普通必杀，是软击倒，可以受身。
            vic.techable = true;
            if (pr.def.knockback.y > 0) { vic.vy = pr.def.knockback.y; vic.y = 0.01; }
            // 投射物同样按"击倒是招式属性"那套规矩来：飞出去的实物默认不击倒，
            // 要倒就在 projectile 上显式标 knockdown（同近身判定，不再看伤害阈值）
            else if ((pr.def as { knockdown?: boolean }).knockdown) {
              vic.vy = 0; vic.y = 0;
              vic.stun = DOWN_STUN;
              this.setState(vic, 'down');
              vic.stateFrame = 0;
            }
          } else vic.stun = BLOCK_STUN;
          this.hitstop = 5;
          this.events.push({
            type: 'hit', attacker: pr.owner, damage: dmg,
            x: pr.x, y: FLOOR_Y - pr.y - pr.def.h / 2, blocked, heavy: false, counter,
          });
          if (vic.hp <= 0) this.declareKo(pr.owner, atk);
        }
      }
      if (pr.age >= pr.life || pr.x < ARENA_MIN - 60 || pr.x > ARENA_MAX + 60) this.projectiles.splice(i, 1);
    }
  }

  /** 这一帧 atk 的判定框是否吃到 vic；命中则返回那一招。纯谓词，不改任何状态。
   * 和 applyHit 分开，是为了让同一帧两边的判定都基于「谁都还没挨打」的那个状态（见 tick）。 */
  private hitLands(atk: Fighter, vic: Fighter): Move | null {
    if (atk.state !== 'attack' || !atk.move) return null;
    const m = atk.move;
    // 多段判定：一次发动最多命中 multiHit.hits 次；单发招式等价于 maxHits=1
    const maxHits = m.multiHit ? m.multiHit.hits : 1;
    if (atk.hitCount >= maxHits) return null;
    if (atk.stateFrame < m.startup || atk.stateFrame >= m.startup + m.active) return null;
    // 相邻两段至少间隔 interval 帧——同一个静态判定框在 active 窗口内反复检测，
    // 靠这条间隔门槛切成一段段命中，而不是每帧都判一次
    if (m.multiHit && atk.hitCount > 0 && atk.stateFrame - atk.lastHitFrame < m.multiHit.interval) return null;
    const hb = worldBox(m.hitbox, atk.x, FLOOR_Y - atk.y, atk.facing);
    const vb = worldBox(
      { x: -vic.def.width / 2, y: 0, w: vic.def.width, h: hurtHeight(vic) },
      vic.x, FLOOR_Y - vic.y, 1,
    );
    // 倒地期间不吃判定。「压上去」指的是贴住等他起身，不是打地上的人
    return overlaps(hb, vb) && vic.invuln <= 0 && vic.state !== 'down' ? m : null;
  }

  /** 这一下是不是反击命中：打在对手出招的**起手或判定帧**里（他已经把身体交出去了）。
   * 抽成一处是因为近身与投射物两条结算路径各自独立，后加的规则很容易只落在其中一条上——
   * 实测就漏过：反击命中与 MAX 加成都只做在近身那条，三个角色的投射物
   *（乾坤圈 / 天眼光束 / 怒吼震慑）一概吃不到。 */
  private isCounter(vic: Fighter, blocked: boolean): boolean {
    return !blocked && vic.state === 'attack' && !!vic.move
      && vic.stateFrame < vic.move.startup + vic.move.active;
  }

  /** 落实一次已判定成立的命中。招式由调用方传入：走到这里时攻击方**可能已经被对手同一帧的招
   * 打进硬直**（相打ち的第二发正是这种情形），此处若再自查 atk.state 会把它毙掉。
   * 所有前置条件都在 hitLands 里判完，这里不重复。 */
  private applyHit(atk: Fighter, vic: Fighter, who: 0 | 1, m: Move) {
    const maxHits = m.multiHit ? m.multiHit.hits : 1;
    const hb = worldBox(m.hitbox, atk.x, FLOOR_Y - atk.y, atk.facing);

    atk.hitCount++;
    atk.lastHitFrame = atk.stateFrame;
    const finalHit = !m.multiHit || atk.hitCount >= maxHits;

    // 上下段：站防（lowGuard=false）挡不住下段，蹲防挡不住中段（跳跃攻击）。
    // 没有这一对，按住防御就能挡一切，防守是个不需要读招的按键——这是拳皇攻防体系里
    // 最核心的一块。防中了才叫 blocked，防错了这一下按正常命中结算。
    const guardBeats = !m.guard
      || (m.guard === 'low' ? vic.lowGuard : !vic.lowGuard);
    const blocked = vic.state === 'block' && guardBeats;
    // 反击命中：对手正在出招的起手/判定帧里挨了这一下。同帧对拼时双方都成立——
    // 拳皇里相打ち本来就是互相反击，不是谁占谁的便宜。
    const counter = this.isCounter(vic, blocked);
    // 每段伤害 = damage/hits 四舍五入，最后一段吃余数，保证总伤害与单发时完全一致
    const segDamage = !m.multiHit ? m.damage
      : finalHit ? m.damage - Math.round(m.damage / m.multiHit.hits) * (m.multiHit.hits - 1)
      : Math.round(m.damage / m.multiHit.hits);
    const boost = (atk.maxMode > 0 ? MAX_DMG : 1) * (counter ? COUNTER_DMG : 1);
    const dmg = Math.round((blocked ? segDamage * 0.2 : segDamage) * boost);
    vic.hp = Math.max(0, vic.hp - dmg);
    vic.flash = 2;
    // 气槽倍率。0.8/0.5 是当年**大招只有 0.65 秒**时为了"让大招能出现"调高的；
    // 短版拉到 3 秒、完整版 10 秒之后这套经济学没跟着改，实测三四关有 41-46% 的对局
    // 时间是大招过场（每局攒够 6.8 次奥义）。折半后大招回到"一局用两三次的投资"。
    atk.meter = Math.min(100, atk.meter + Math.round(dmg * METER_ATK));
    vic.meter = Math.min(100, vic.meter + Math.round(dmg * METER_VIC));

    // 霸体：正在出招、还在**起手**里、且这一招带霸体层数——硬吃这一下，不进硬直。
    // 血照掉、气照给（上面已经结算过），只是动作不断。
    // 位置也不推：被推开的话慢招照样打空，霸体就等于没给。
    const armored = !blocked && vic.state === 'attack' && vic.move !== null
      && vic.armorLeft > 0 && vic.stateFrame < vic.move.startup;
    if (armored) {
      vic.armorLeft--;
    } else if (blocked) {
      vic.stun = BLOCK_STUN;
      if (finalHit) vic.vx = m.knockback.x * 0.3 * atk.facing;
    } else {
      this.recordHurt(vic, atk.y + m.hitbox.y + m.hitbox.h / 2 - vic.y, finalHit && m.knockback.y > 0);
      this.setState(vic, 'hitstun');
      // 已经在 hitstun 里时 setState 不会重置 stateFrame，挨打动作只有 14 帧且不循环，
      // 连打里 stateFrame 会涨到几百、姿势钳死在末帧——所以每一下都显式归零，让反应逐下重放
      vic.stateFrame = 0;
      vic.stun = m.hitstun + (counter ? COUNTER_STUN : 0); // 每段都刷新，多段判定期间对手全程被锁住
      vic.move = null;
      // 中间段不击退——否则第一下就把对手推出射程，后面几段全部落空；
      // 只有最后一段才用招式原本的 knockback，把对手真正打飞出去
      if (finalHit) {
        vic.vx = m.knockback.x * atk.facing;
        if (m.knockback.y > 0) { vic.vy = m.knockback.y; vic.y = 0.01; vic.techable = !this.isHard(m); vic.downByThrow = false; }
        // 重击直接打倒：此前只有"被打飞、落地"才会进 down，地面上的重手一律只是后仰，
        // 打半天对手不倒。damage>=14 或招式本身标了 knockdown 的，落地即倒
        else if (m.knockdown) { // 不带浮空的击倒招：原地倒下
          vic.vy = 0; vic.y = 0;
          vic.stun = DOWN_STUN;
          vic.techable = !this.isHard(m); vic.downByThrow = false;
          this.setState(vic, 'down');
          vic.stateFrame = 0;
        }
      } else if (m.carry) {
        // 中间段只推一点点（配合出招者的 dash 同步跟进），两人一起朝版边挪
        vic.vx = m.carry * atk.facing;
      }
    }

    const heavy = m.meterCost > 0 && finalHit;
    // 顿帧：多段判定的中间段只顿 2 帧，最后一段（含所有单发招式）沿用原有分档，
    // 否则一段 12 帧的顿帧连打十几次，一招放半分钟
    this.hitstop = m.multiHit && !finalHit ? 2 : (heavy ? 12 : m.damage >= 12 ? 8 : 4);
    this.events.push({
      type: 'hit', attacker: who, damage: dmg,
      x: hb.x + hb.w / 2, y: hb.y + hb.h / 2, blocked, heavy, counter,
    });
    if (vic.hp <= 0) this.declareKo(who, atk);
  }

  /** 时间到：按剩余血量的**比例**判胜（双方满血不同，比绝对值不公平）。
   * 完全相等时算平局——winner 留 null，由上层按平局处理（双方各记一个回合）。 */
  private declareTimeUp() {
    this.timeUp = true;
    const r1 = this.p1.hp / this.p1.def.hp, r2 = this.p2.hp / this.p2.def.hp;
    if (r1 === r2) { this.pendingKo = null; return; }   // 平局：winner 保持 null
    this.winner = r1 > r2 ? 0 : 1;
    // 读秒判胜**不是 KO**，两件事都要改口（这条路 AI 对局 474 回合里一次都没走到，
    // 所以一直没人看见）：
    //   ① 不发 ko 事件——它驱动的是兵器脱手扎地、震屏、慢镜、镜头怼脸那一整套死亡演出，
    //      而此刻输家正站着，血还剩一半，画面在说一件没发生的事。
    //   ② 要发胜利姿势——赢家的 victory 此前只在 settleKo 里置位，靠时间赢下来的回合
    //      于是既没造型也没台词，读秒赢和什么都没发生长得一样。
    (this.winner === 0 ? this.p1 : this.p2).victory = 1;
  }

  /** 宣布 KO；若击杀发生在完整版大招的演出途中，则推迟到演出结束再宣布（见 pendingKo）。 */
  private declareKo(who: 0 | 1, atk: Fighter) {
    if (atk.state === 'attack' && atk.move && atk.move.meterCost > 0 && !atk.move.isBrief) {
      this.pendingKo = who;
      return;
    }
    // 只记意图，本 tick 末尾统一裁决（settleKo）。
    // 直接在这里提交是不行的：同一帧两边都可能致死（相打ち致死），先跑的那次会先提交一个
    // 胜负和一条 ko 事件，后跑的那次再改口——实测双 KO 时 winner 恒为 1（玩家必输，
    // 纯粹取决于 p2 的判定跑在后面），而且会留下三条 ko 事件。
    this.koIntent.push(who);
  }

  /**
   * Queue a hit that was staged outside the engine — the FastH3 ultimate cinematic plays while the fight is
   * paused, and its damage lands when the fight resumes. It is applied inside the next tick rather than here:
   * events are cleared at the top of every tick, so a hit pushed now would never reach the FX and sound
   * consumers, and the KO has to go through settleKo like every other kill. Unblockable and untechable.
   */
  queueStrike(who: 0 | 1, damage: number) {
    if (this.winner !== null || this.doubleKo || this.timeUp) return;
    this.queuedStrike = { who, damage: Math.max(0, Math.round(damage)) };
  }

  private landQueuedStrike() {
    const strike = this.queuedStrike;
    this.queuedStrike = null;
    if (!strike || this.winner !== null || this.doubleKo || this.timeUp) return;
    const atk = strike.who === 0 ? this.p1 : this.p2;
    const vic = strike.who === 0 ? this.p2 : this.p1;
    const dmg = Math.min(vic.hp, strike.damage);
    vic.hp -= dmg;
    this.recordHurt(vic, vic.def.height * 0.5);
    vic.flash = 2;
    vic.move = null;
    vic.vx = 9 * atk.facing;
    vic.vy = 0; vic.y = 0;
    vic.stun = DOWN_STUN;
    vic.techable = false; vic.downByThrow = false;
    this.setState(vic, 'down');
    vic.stateFrame = 0;
    this.hitstop = 12;
    this.events.push({
      type: 'hit', attacker: strike.who, damage: dmg,
      x: vic.x, y: FLOOR_Y - vic.def.height * 0.55, blocked: false, heavy: true,
    });
    if (vic.hp <= 0) this.koIntent.push(strike.who);
  }

  /** 本 tick 的击杀裁决：一次决定，1 或 2 条事件。双方都空血就是平局（拳皇里的双 KO）。 */
  private settleKo() {
    if (this.koIntent.length === 0) return;
    this.holdDefeatedFighters();
    if (this.p1.hp <= 0 && this.p2.hp <= 0) {
      this.doubleKo = true;
      this.winner = null;                       // 平局：交给上层按"双方各记一个回合"处理
      this.events.push({ type: 'ko', loser: 0 });
      this.events.push({ type: 'ko', loser: 1 });
    } else {
      const who = this.koIntent[0];
      this.winner = who;
      (who === 0 ? this.p1 : this.p2).victory = 1;
      // 胜利姿势的起点。双 KO 那一支不置位——没人赢，两个都躺着

      this.events.push({ type: 'ko', loser: who === 0 ? 1 : 0 });
    }
    this.koIntent.length = 0;
  }

  /** 出招者一离开 attack 状态（正常打完或被打断）就把欠着的 KO 结算掉。 */
  private flushPendingKo() {
    if (this.pendingKo === null) return;
    const atk = this.pendingKo === 0 ? this.p1 : this.p2;
    // 连打全部打完（终结一击已落地）就宣布——不必等出招者把收势走完。等收势的话，
    // 被击飞的人早已落地爬起、状态回到 idle，KO 慢镜对着的就是一个站着的人，没有死亡瞬间。
    const done = atk.move && atk.hitCount >= (atk.move.multiHit?.hits ?? 1);
    if (atk.state === 'attack' && !done) return;
    this.holdDefeatedFighters();
    this.winner = this.pendingKo;
    this.events.push({ type: 'ko', loser: this.pendingKo === 0 ? 1 : 0 });
    this.pendingKo = null;
  }

  /** A lethal grounded jab/chip/armor hit must also end on the floor. Wait until KO is final
   * so a staged multi-hit ultimate can finish; airborne losers retain their landing physics. */
  private holdDefeatedFighters() {
    for (const f of [this.p1, this.p2]) {
      if (f.hp > 0) continue;
      f.move = null;
      f.techable = false;
      if (f.y > 0) this.setState(f, 'hitstun');
      else if (f.state !== 'down') {
        f.vy = 0;
        f.stun = DOWN_STUN;
        this.setState(f, 'down');
      }
    }
  }

  private separate() {
    const a = this.p1, b = this.p2;
    if (a.y > 0 || b.y > 0) {
      // 腾空时默认不推挤——那是正常的跳跃换边，硬推会让跳过对手变得不可靠。
      // 唯一的例外是带冲刺的招式：牛魔王 sp100 冲进一个腾空的对手时会直接从身体里穿过去
      // （实测最小间距 -67px，即越到了对手另一侧；其余三人不越过但重叠 27-38px）。
      // 只在「一方正在放带 dash 的招」且「两人高度差还不足以算跨过头顶」时才恢复推挤，
      // 普通跳跃的手感一点不动。
      const dashing = (f: Fighter) => f.state === 'attack' && !!f.move?.dash;
      if (!(dashing(a) || dashing(b)) || Math.abs(a.y - b.y) >= AIR_CLEAR) return;
    }
    // 紧急回避穿身：滚动中的一方不参与推挤。这是 KOF 的回避之所以是「位置工具」而不是
    // 「带风险的闪避」的全部原因——它能从对手身体里滚过去，换边、脱出版边压制。
    // 改之前实测：滚过去只是把对手一起推着走（两人间距始终 40px，一步都没越过），
    // 那样它比后跳还不如——后跳至少拉得开距离。
    if (a.state === 'roll' || b.state === 'roll') return;
    // 双方正常站立时维持 40px（防止完全重叠）；只要有一方被打进 hitstun——锁住无法后退，
    // 攻击方本该能压进去——把下限收紧到 16px（角色宽 52-64px，仍留出不完全重叠的余量）。
    // 站立场景的 40 不变，现有测试「着地时不可完全重叠」覆盖的就是这一档。
    const minGap = (a.state === 'hitstun' || b.state === 'hitstun') ? 16 : 40;
    const dx = b.x - a.x;
    if (Math.abs(dx) < minGap) {
      const push = (minGap - Math.abs(dx)) / 2;
      const dir = dx >= 0 ? 1 : -1;
      a.x = Math.max(ARENA_MIN, a.x - push * dir);
      b.x = Math.min(ARENA_MAX, b.x + push * dir);
    }
  }
}
