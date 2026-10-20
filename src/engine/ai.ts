import type { Battle } from './battle';
import { canTaunt, cdReach, jaReach, ROLL_INVULN_FROM, ROLL_INVULN_TO } from './battle';
import type { Dir, Fighter, InputFrame } from './types';
import { ARENA_MAX, ARENA_MIN, CORNERED, DESPERATE_HP, NULL_INPUT } from './types';

/**
 * AI 能选的动作。**运行时的这张表才是本体**，类型由它推出来——
 * 反过来写（类型是本体、另手抄一张表）迟早对不上，而对不上的后果是静默的：
 * aiBias 的键是 `Record<string, number>`，TypeScript 拦不住拼错的动作名；
 * biased() 会把它当成一个新动作加进权重表（那一行专门支持"偏置里补关卡表没有的动作"），
 * pick() 于是可能选中它，而 switch 里没有对应的 case、也没有 default——
 * 输入原样返回 NULL_INPUT，AI 就这么**站着发呆一整个决策窗**（26~30 帧），
 * 而且每次抽到都发一次呆。八个角色手写着四十来个动作名，一个字母就能触发这件事。
 */
export const AI_ACTIONS = [
  'approach', 'retreat', 'jump', 'attack',
  'skill1', 'skill2', 'skill3', 'super', 'block', 'idle',
  // 机动三件套。实测发现它们在对局里出现 0%——AI 压根不会用，单机模式下等于死内容：
  // 玩家既看不到对手跑/回避，也就不会意识到自己能这么做
  'dash', 'backstep', 'roll',
  // 挑衅同理，而且更彻底：实测**每回合 0.00 次**。整套东西都在（十二个人各一句台词、
  // 削对手 10 气、冷却、动作），只是 AI 从来不做，于是玩家在对局里永远撞不见它。
  // 它的闸门（canTaunt）本身就保证了安全：只有对手躺着、或者隔了大半个场子才准挑衅
  'taunt',
  // 实测这三项使用率全是 0.00/局：防御取消、MAX 蓄气、吹飞攻击建好了没人用。
  // 与连段同一个病——系统只存在于代码里，玩家永远看不到它们
  'blowback', 'charge',
] as const;

export type AiAction = typeof AI_ACTIONS[number];

export type ActionWeights = Partial<Record<AiAction, number>>;

export interface AiProfile {
  /** Beginner controller: bypass reactions, character bias, combos and all advanced inputs. */
  basicOnly?: boolean;
  name: string;
  decideEvery: number; // 一个动作坚持多少帧（不是"反应多快"，见 stages.ts 的注释）
  /** 见招拆招的概率（0-1）。对手每出一招掷一次骰子：读到了就在他的起手/判定帧里防、
   * 在他的收招帧里抓。这是真正的难度旋钮——AI 强不强，取决于它看不看得见你在干什么。
   *
   * 加这一层之前，AI 每隔几帧掷一次骰子就不管了，完全不看对手。实测「纯连打、向前走、
   * 从不防御」胜率 96%、剩血 62%，而认真打的「防+见缝反击」只有 75%、剩血 22%——
   * 乱按比会玩更强，这是单机格斗最劝退的一种手感。 */
  react?: number;
  /** 对空率：读到对手起跳并做出反应的概率。与 react 分开，因为跳入好读得多——
   * 见 createAi 里那段。不填按 0.8。 */
  antiAir?: number;
  /** 读到来招时改用爆气脱身（而不是硬挡）的概率。与 react 分开：react 决定"看不看得见"，
   * 这个决定"看见了怎么处理"。默认 0.25。 */
  burst?: number;
  /** 倒地后受身的概率，默认 0.2。与 react 分开，也不逐关递增：受身不是"看得见看不见"
   * 的问题，而是一次取舍——起身从 52 帧缩到 20 帧，但没有起身无敌，等于自己撞进对方的
   * 压制。扫过 0/0.2/0.35/0.5，越高关卡越难（0.5 时第三关掉到 19%），所以取保守的一档：
   * 受身从 0.26 涨到约 0.95 次/回合，起身博弈看得见了，又没有把它变成"必须受身"。 */
  techRate?: number;
  near: ActionWeights; // 距离 < 120
  mid: ActionWeights;  // 120 - 350
  far: ActionWeights;  // > 350
}

export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * 一场对局的 AI 种子。此前是 `关卡序号 * 100 + 7`——**只看关卡**，于是整个游戏
 * 一共只有六条随机流（7 / 107 / 207 …），每一关的 BOSS 永远从同一句开局说起。
 *
 * 这件事平时看不出来，一重打就全暴露了：末关单关胜率 18%，平均要打五六次，
 * 而每次重打都是 Fight 重新挂载 → 新的 createAi → 流从第 0 位重来。
 * 于是玩家反复看同一段开局：同样的时机上前、同样那一发必杀、同样的防御节奏。
 * 街机格斗最不该丢的就是"这次他好像不太一样"，重打时尤其。
 *（回合之间倒是本来就没问题：ai 实例跨回合复用，流是接着往下走的。）
 *
 * attempt 是**进入对局的次数**，所以同一关的第二次和第一次拿到的是两条流。
 *
 * 为什么要做一次雪崩混合，而不是最省事的 `stage * 100 + 7 + attempt`：
 * **不是**因为相邻种子发散得不够——那条我先假设了、然后量了，是错的：
 * 线性式同样能让开局在两秒内分岔（aiVariety 那一组对着它是全绿的）。
 * 真正的理由是**混叠**：线性式里关卡的间距是 100，于是"关0 的第 100 次重打"
 * 和"关1 的第 0 次"是同一条流。末关 18% 的胜率下重打次数能攒得很高，
 * 而撞上之后没有任何征兆——只是某一场忽然和很久以前的某一场一模一样。
 * 混合之后 (stage, attempt) 整体进哈希，不再有这种间距可撞。
 */
export function aiSeed(stage: number, attempt: number): number {
  let h = (Math.imul(stage + 1, 0x9e3779b1) ^ Math.imul(attempt + 1, 0x85ebca6b)) >>> 0;
  h = Math.imul(h ^ (h >>> 15), 0x2545f491) >>> 0;
  return (h ^ (h >>> 13)) >>> 0;
}

function pick(w: ActionWeights, rng: () => number): AiAction {
  const entries = Object.entries(w) as [AiAction, number][];
  let total = 0;
  for (const [, v] of entries) total += v;
  if (total <= 0) return 'idle';
  let r = rng() * total;
  for (const [k, v] of entries) { r -= v; if (r <= 0) return k; }
  return entries[entries.length - 1][0];
}

const SKILL_SLOT = { skill1: 's1', skill2: 's2', skill3: 's3' } as const;

/** 这个动作此刻放得出来吗。原来的 pick 只看距离，选到冷却中的技能或气槽不够的大招时，
 * 按键被引擎直接丢掉，AI 就白站一整个决策窗（decideEvery 帧）。实测：boss 档
 * (decideEvery 9) 的出招按键有 64% 落空，lv2/lv3 也有 25-27%——看起来就是"boss 突然发呆"。 */
function available(a: AiAction, me: Fighter, foe?: Fighter): boolean {
  // 蓄气只在离得远、且气不满时才划算——贴着脸蓄气纯粹是送
  // charge 现在有两个用途：远距离原地攒气，以及近身花 50 气爆气脱身（发动瞬间顶开对手 + 8 帧无敌）。
  // 只留"远距离才可用"的话，MAX 永远只出现在对局 3% 的时间里，等于不存在。
  if (a === 'charge') {
    if (!foe) return false;
    if (me.maxMode > 0) return false;                       // 已经在 MAX 里，再按没有意义
    return Math.abs(foe.x - me.x) > 220 ? me.meter < 100 : me.meter >= 50;
  }
  // 挑衅：闸门与引擎同一条（canTaunt），不另写一份——那正是这个项目反复栽的"两处规则漂移"
  if (a === 'taunt') {
    if (!foe) return false;
    // 权重只写在 far 档（见 stages 的 lv3/boss）：挑衅固定发生在**隔着大半个场子**时。
    //
    // 试过给近身档也加一份——那才是拳皇最经典的画面（把人打倒了站在旁边嘲讽），
    // 两条实测都不答应，如实记下：
    //   ① canTaunt 只问"这一刻准不准"、不问"来得及吗"。挑衅 47 帧，倒地才 52 帧，
    //      可受身的话对手还能提前爬起来——一套连段当场从 49% 血涨到 **70%**
    //      （对手爬起来时 AI 正卡在 34 帧收招里）。
    //   ② 就算补上"对手确实起不来"的闸门，它仍然会顺手废掉版边压制：
    //      挑衅不算逃跑类，压制砍掉逃跑权重反而抬高了它的相对份额，
    //      压制效果从「开 2.6% / 关 3.8%」塌到「开 2.8% / 关 3.0%」。
    // 远距离那一档两个毛病都没有：够不着，也不在压制的射程里。
    return canTaunt(me.state, Math.abs(foe.x - me.x), foe.state, me.cooldowns[`${me.def.id}_taunt`] ?? 0);
  }
  if (a === 'super') {
    // 攒到 100 再放，除非对手残血——残血时 50 档能直接终结，那才是该花的时候。
    // 一到 50 就花掉的话气槽永远到不了 100，十秒完整演出一次都见不到（实测 0.0 次/局）
    if (me.meter >= 100) return true;
    // 两条出路：能一击致命（平时把气存着等这一下），或自己残血（都要死了就没有"存着"这回事）。
    //
    // 试过加第三条"气满了就放"，A/B 之后删了：带不带它，新手在第一关每回合见到的大招
    // 都是 0.47 次——因为满槽的大招本来就走连段分支那条路（命中后取消进大招，
    // 绕过这个函数），这条规则一次都没被用上。真正让教学关见得到大招的是权重表里
    // 补的那一项 super（0.19 → 0.47）。
    return me.meter >= 50 && !!foe
      && (foe.hp <= me.def.moves.sp50.damage * 1.2 || isDesperate(me));
  }
  const slot = SKILL_SLOT[a as keyof typeof SKILL_SLOT];
  if (!slot) return true; // approach/retreat/jump/attack/block/idle 随时可用
  return !(me.cooldowns[me.def.moves[slot].id] > 0);
}

/** 把当下放不出来的动作从权重表里剔掉。全被剔光时返回原表——调用方照原样抽，
 * 抽到什么算什么，行为退回改动前，不会因为"没得选"而卡死。 */
/** 背水：血量低于这条线时把权重往进攻挪，并放开大招。
 *
 * 街机格斗的对手被打到残血会变凶，那是一场对局里最好看的一段。实测这里完全没有——
 * AI 的出招占帧在「满血-75%/75-50%/50-25%/25-0%」四档上是 26/29/30/28%，一条平线，
 * 打到最后一格血和第一格血是同一个人。 */
/**
 * 进攻类权重的倍率与逃跑类的折扣。不改 decideEvery——那是"一个动作坚持多久"，
 * 不是凶不凶（这一条在 stages.ts 里踩过）。
 *
 * **后来量过一次，实际效果比名字小得多，如实记在这里：**
 * 把这两个数中性化（都设成 1）再跑同样的对局，残血时的**出招占帧一模一样，都是 41.4%**——
 * ×2 那一半没有产生任何可见效果。残血时出招比血多时高（41.4% vs 27%）是**处境**造成的
 *（残血 = 正被压着打），不是这个权重。真正在起作用的只有 FLEE 那一半：
 * 后退占帧 2.4% → 0.8%，也就是"少逃"，而不是"变凶"。
 *
 * 胜负上则完全中性：进入过残血的 367 例翻盘 37%，中性化之后 372 例仍是 37%。
 * 留着是因为"少逃"这一点是真的（残血还在满场跑很出戏），但别指望它把 AI 变凶。
 */
/**
 * 把角色的打法偏置乘到关卡权重上。倍率缺省 1；乘完仍是同一张表的形状，
 * 只是各项的相对高低变了——关卡难度（哪些动作可用、反应率多高）仍归 STAGES 管。
 * 结果四舍五入到 0.1 的精度再取整数权重：pick 只认相对大小，精度到这里足够。
 */
export function biased(w: Record<string, number>, bias?: Record<string, number>): Record<string, number> {
  if (!bias) return w;
  const out: Record<string, number> = {};
  for (const [k, v] of Object.entries(w)) out[k] = Math.max(0, v * (bias[k] ?? 1));
  // 偏置里出现、而关卡表里没有的动作也要能加进来（比如给投技型补 approach）
  for (const [k, m] of Object.entries(bias)) if (!(k in out) && m > 0) out[k] = m;
  return out;
}

const DESPERATE_ATK = 2, DESPERATE_FLEE = 0.35;
const ATTACKISH = new Set<AiAction>(['attack', 'skill1', 'skill2', 'skill3', 'super', 'approach', 'dash', 'jump']);
const FLEEISH = new Set<AiAction>(['retreat', 'backstep', 'block', 'idle', 'charge']);

export function isDesperate(me: Fighter): boolean {
  return me.hp / me.def.hp < DESPERATE_HP;
}

/** 残血时重新配权重：进攻翻倍、逃跑打三折。原表不动（它是四关的身份），只在这一刻加权 */
function desperate(w: ActionWeights): ActionWeights {
  const out: ActionWeights = {};
  for (const [k, v] of Object.entries(w) as [AiAction, number][]) {
    out[k] = v * (ATTACKISH.has(k) ? DESPERATE_ATK : FLEEISH.has(k) ? DESPERATE_FLEE : 1);
  }
  return out;
}

/**
 * 把对手逼到墙角之后，逃跑类权重打的折扣。压住不放才是把这份优势兑现。
 *
 * 0.25 试过，压得太狠：最终关的 BOSS 会一直站在扫堂的射程里，
 * 「只扫下段」那个套路在关4 反而从 21% 涨到 33%、比关3 还容易（stageReact 当场挡下）。
 * 0.5 两头都过：版边时长确实拉长了，也没有把 BOSS 钉死在别人的射程里。
 */
const PIN_FLEE = 0.5;
/** 会不会压制的门槛，按关卡的 react 分。前两关（0.25/0.26）不会，后两关（0.4/0.65）会 */
const PIN_SKILL = 0.35;

/**
 * 对手被逼到墙角时重新配权重：只砍逃跑，不加进攻。
 *
 * 加这条是因为实测**版边根本不重要**：双方在版边的时间占 21.8%，而在版边挨的伤害
 * 也占 21.1%——完全成比例；按"被逼到角落的时间比例"分档的胜率是 48/53/54/45%，一条平线。
 * 再追一层就看到原因：**76% 的离开版边是"直接走出去"**（翻滚 6%、后跳 5%、跳走 7%），
 * 中位停留只有 1.3 秒。引擎的角落没问题（挡下不产生间距），是**没人把你钉在那里**——
 * AI 把人逼到墙角之后照样按权重表抽 retreat/backstep，自己退开了。
 *
 * 只砍逃跑不加进攻：加进攻会变成"贴脸乱按"，而残血那次已经量过，
 * ATTACKISH ×2 对出招率一点效果都没有（41.4% → 41.4%），加了也是白加。
 */
export function pinning(w: ActionWeights): ActionWeights {
  const out: ActionWeights = {};
  for (const [k, v] of Object.entries(w) as [AiAction, number][]) {
    out[k] = v * (FLEEISH.has(k) ? PIN_FLEE : 1);
  }
  return out;
}

function usable(w: ActionWeights, me: Fighter, foe: Fighter): ActionWeights {
  const out: ActionWeights = {};
  let any = false;
  for (const [k, v] of Object.entries(w) as [AiAction, number][]) {
    if (available(k, me, foe)) { out[k] = v; any = true; }
  }
  return any ? out : w;
}

/** 能起招的状态。tryAttack 只在 idle/walk（battle.ts case 'idle'）与 crouch 两处被调用，
 * 其余状态下按键一律被吞掉。 */
const ACTIONABLE = new Set(['idle', 'walk', 'crouch']);

/**
 * 反应层的作用距离。普攻判定框最远伸到 ~130px，留一点余量。
 *
 * 已知的副作用（试过改，测完退回来了）：这是个**全局**常量，而各角色攻程差很多。
 * 二郎神 s1 攻程 340，他从 150 外出招，反应层一次都不触发；哪吒攻程 186，全程在圈内挨读。
 * 实测（单回合胜率，对手都是牛魔王）：双方同档时 哪吒 47% / 孙悟空 34% / 二郎神 50%，
 * 换成打最终关 BOSS 档变成 6% / 22% / 47%——BOSS 档吃掉哪吒 41 点，二郎神只有 3 点。
 * 也就是说 BOSS 的难度里有一部分不是"强"，是"专克短手、对长手近乎失明"。
 *
 * 试过把这里换成按来招的判定框宽度算（threatens(m, myWidth, dist)）。结果：
 *   · 好的一面：BOSS 档吃掉的点数从 3~41 收敛到 13~35，关4 通关率极差 50→30 点
 *   · 坏的一面：**下段无脑解从关2 搬到了关1（81%）**，平衡的关间落差压线超标（35.4%），
 *     而它本来要救的哪吒纹丝不动（5%→5%）
 * 各关的 react 全是在这个门限下标定出来的，换门限等于同时改四个关卡的难度，
 * 要动就得连带重标——不是改一个函数的事。留在这里是为了别再从零发现一遍。
 */
const REACT_RANGE = 150;
/** 挡下之后"要还手"的窗口长度（帧）。格挡硬直只有 6 帧，留 14 帧够它等到能动的那一帧 */
const BLOCK_PUNISH = 14;
/** 空中攻击的出手距离。判定框宽 96-104，但这里取 70——比框还窄。
 * 跳跃攻击命中很赚、落空极易被抓，扫下来只有"真正跳到人头上才按"这一档站得住：
 * 115 时逐关曲线塌成 71/33/42/42（AI 满场乱跳送反击），95 时末两关倒挂，
 * 70 保住 71/58/29/25 的单调下坡。宁可少跳，不要乱跳。 */
/** 对空迎击的出手距离。普攻判定框伸到 125-133，加上对手半身宽约 26-32，够得着的上限在 160 上下；
 * 取 110 是留出"他还在往下掉、这一拳出手时他正好进框"的提前量——按上限出手多半打在他落地之后。 */
const AA_RANGE = 110;
/** 飞行道具进到多近才处理。道具速度 6-9 px/帧，180px 约 20-30 帧——够按出防御或翻滚 */
const PROJ_RANGE = 180;
/**
 * 翻滚/大跳穿越飞行道具的最小安全距离。近了就老实挡下。
 *
 * 实测（远程流 bot，每关 60 场）：三条出路全开时它的一次通关是 31%，
 * 只留挡下是 23%——**动作越多越差**（大跳单独 +5 点、翻滚 +3 点）。
 * 而同样三种配置下，中庸尺子的成绩完全一样（都是 6%），说明代价只落在"被远程压着"这一种处境。
 * 原因是位置：贴脸时滚过去/跳过去正好撞进对方的近身攻击里。
 *
 * 没有直接删掉那两条——AI 只会站着挡火球是死板的，玩家也就永远看不到
 * "可以滚过去、可以跳过去"这两个答案。改成只在**有空间**时才用。
 */
const SAFE_APPROACH = 250;
/** 有道具飞来时改用大跳跨过去的概率。留出另外两条出路（挡下、回避穿过），
 * 三选一才叫博弈——只会跳的话玩家放一发就知道对面要起跳 */
const HOP_OVER_RATE = 0.35;

/** Forgiving sparring partner: a short walk or one jab, followed by a long pause. */
function createBasicAi(decideEvery: number, seed: number) {
  const rng = mulberry32(seed);
  let tick = 0, nextDecision = 90, walkUntil = 0;
  let direction: Dir = 0;
  return (b: Battle, who: 0 | 1): InputFrame => {
    tick++;
    const me = who === 0 ? b.p1 : b.p2;
    const foe = who === 0 ? b.p2 : b.p1;
    if (!ACTIONABLE.has(me.state) || me.y > 0 || foe.state === 'down') {
      walkUntil = 0;
      return { ...NULL_INPUT };
    }
    const distance = Math.abs(foe.x - me.x);
    if (tick < walkUntil) {
      if (distance <= 100) { walkUntil = 0; return { ...NULL_INPUT }; }
      return { ...NULL_INPUT, move: direction };
    }
    if (tick < nextDecision) return { ...NULL_INPUT };
    nextDecision = tick + decideEvery + Math.floor(rng() * 60);
    if (distance > 100) {
      direction = foe.x >= me.x ? 1 : -1;
      walkUntil = tick + 30;
      return { ...NULL_INPUT, move: direction };
    }
    return { ...NULL_INPUT, attack: true };
  };
}

export function createAi(profile: AiProfile, seed: number) {
  if (profile.basicOnly) return createBasicAi(profile.decideEvery, seed);
  const rng = mulberry32(seed);
  /** 「跳过道具」单独一条随机流。混进主流会把**后面所有决策**整个重排，
   * 改动的效果和洗牌就分不开了
   *（见 docs/engine-notes.zh-CN.md「改动里多出来的 `rng()` 调用会把整条随机流洗牌」）。 */
  const rngHop = mulberry32(seed ^ 0x9e3779b9);
  let current: AiAction = 'idle';
  let frames = 0;
  /** 当前正在"读"的那一招（招式 id + 发动帧），以及这一招读到了没有。
   * 每招只掷一次骰子，不是每帧掷一次——读招是一次判断，不是持续的抽奖。 */
  let readId = '';
  let reading = false;
  /** 对手第几次离地。読み的 key 在对手滞空期间必须**保持不变**：
   * 按状态拼 key 的话，对手从 'jump' 变成 'attack'（跳跃攻击出手）的那一刻 key 就变了，
   * 对空的那次读会被 react 重掷一次丢掉——正好丢在最该生效的瞬间。
   * 实测那版：jA 活跃期间 AI 只有 32% 的帧按防御，挡下率 21%，
   * 挨打时防守方 43% 在 hitstun、29% 在出招，真正在防御的只有 1%。 */
  let airId = 0;
  let wasAir = false;
  /** 刚挡下一击之后还剩几帧"要还手"。只挡不还的话，react 越高 AI 越被动——实测 react 0.5
   * 的第三关反而比 react 0.3 的第二关更好打（50% vs 47%），因为它把帧全花在格挡上，
   * 一整局打不出伤害。挡下就是一次机会，KOF 里防完立刻反击才是防御的意义。 */
  let punishFor = 0;
  /** 本决策窗内是否已经把这一击按出去过。原来出招键只在决策那一帧按下（fresh），
   * 若恰好那一帧人还在 hitstun/attack 里，按键被吞、整个窗口就废了。改成"在窗口内等到
   * 能动的第一帧再按"，按成一次就置位，不会连按。 */
  let punched = false;
  return (b: Battle, who: 0 | 1): InputFrame => {
    const me = who === 0 ? b.p1 : b.p2;
    const foe = who === 0 ? b.p2 : b.p1;
    frames++;
    if (frames >= profile.decideEvery) {
      frames = 0;
      punched = false;
      const dist = Math.abs(foe.x - me.x);
      const band = dist < 120 ? 'near' : dist < 350 ? 'mid' : 'far';
      // 角色自己的打法偏置乘在关卡权重上：关卡决定难度，角色决定"他更爱做什么"。
      // 没有它的话十二个人在 CPU 手里是同一个人（见 CharacterDef.aiBias 的实测）
      const base = biased(profile[band], me.def.aiBias?.[band]);
      // 对手被逼到墙角、而且自己贴得够近时，压住不放。
      // 但这是**熟练度**，不是所有人都会：用现成的 react 分档（0.25/0.26/0.4/0.65），
      // 前两关不压、后两关压。不这么分的话教学关也会压人——实测那样压上型打法在
      // 关1 掉到 50%、关2 是 70%，倒挂 20 点，balance 当场挡下。
      const foeCornered = !!foe && (foe.x - ARENA_MIN < CORNERED || ARENA_MAX - foe.x < CORNERED);
      const canPin = (profile.react ?? 0) >= PIN_SKILL;
      const w0 = isDesperate(me) ? desperate(base) : base;
      const w = canPin && foeCornered && dist < REACT_RANGE ? pinning(w0) : w0;
      const choices = b.advancedCombat ? w : Object.fromEntries(
        Object.entries(w).filter(([key]) => !['super', 'blowback', 'charge', 'taunt'].includes(key)),
      );
      current = pick(usable(choices, me, foe), rng);
    }
    // ── 反应层：对手出招时读一次，读到了就拆 ────────────────────────────
    // 优先于权重表：权重表决定"没事的时候做什么"，反应层决定"对手动了怎么办"。
    // 读招的对象有两类：对手**出招**，以及对手**起跳**。
    // 只读出招的话跳入是无解的——跳跃途中对手的状态是 'jump' 不是 'attack'，
    // 等 jA 真出来（起手才 5 帧）反应层才醒，已经来不及。实测：一个调好时机的
    // 小跳跳入（第 6 帧出手、落地接普攻）能打出 100/100/88/79，四关全线碾压。
    const airborne = foe.y > 0;
    if (airborne && !wasAir) airId++;
    wasAir = airborne;
    // 第三类要读的东西：**已经飞在空中的道具**。
    // 反应层原来只读"对手在出招"，可道具一扔出去对手就进收招了——那一刻起 AI 眼里
    // 什么威胁都没有。实测：道具在飞的约 3000 帧里 AI 在防的只占 6%，四关一模一样
    //（不随难度变），挡下率 7-22%。跳入那次是同一个结构性毛病：读的东西不对。
    const inbound = b.projectiles.find(pr => pr.owner !== who && !pr.hit
      && (pr.x - me.x) * (pr.vx * pr.facing) < 0        // 正朝我飞
      && Math.abs(pr.x - me.x) < PROJ_RANGE);
    const atkKey = inbound ? `proj@${inbound.owner}#${Math.round(inbound.x / 40)}`
      : airborne ? `air@${airId}`
      : foe.state === 'attack' && foe.move ? `${foe.move.id}@${b.frame - foe.stateFrame}` : '';
    if (atkKey !== readId) {
      readId = atkKey;
      // 「读跳入」和「读一记 4 帧起手的普攻」是两种完全不同的能力，不该共用一个骰子。
      // 跳入有 25-45 帧滞空，是全游戏最好读的动作；而 react 为了难度被压在 0.25-0.65。
      // 共用的后果实测过：空中攻击只有 18% 被挡下（430 命中 vs 96 被挡），伤害比 3.81，
      // 一个调好时机的小跳跳入四关全线 100/100/88/79。
      // 对空率单独给一档、且默认高——教学关也该让玩家知道"一直跳是要挨打的"，
      // 否则这一关教会他的第一件事就是跳入免费。
      // 道具和跳入一样好读（飞过来要 20-30 帧），所以共用高的那一档，不用 react
      const rate = inbound || airborne ? (profile.antiAir ?? 0.8) : (profile.react ?? 0);
      reading = atkKey !== '' && rng() < rate;
    }
    // 受身：倒地窗口内新按一次拳，把 52 帧的干等缩到 20 帧。
    // 不加这一条的话实测受身只有 0.26 次/回合（一个回合约 7.8 次击倒，才 3%），
    // 起身博弈只剩一半——攻方压根不用猜对手起不起。
    // 固定在第 2 帧按：受身要的是**新按下**的边沿，一直按着无效（这条规矩是为了不让
    // "AI 一直按着攻击键"变成自动受身才立的），所以要挑一帧干净地按一次。
    // 硬直击倒（大招/投技/吹飞）techable 为假，按了也没用，不浪费这一帧。
    if (me.state === 'down' && me.techable && me.stateFrame === 2 && rng() < (profile.techRate ?? 0.2)) {
      return { ...NULL_INPUT, attack: true };
    }

    // 空中攻击：跳起来了就要打，否则"跳"只是一次位移。
    // jA 还是上下段里"中段"那一半——AI 从不在空中按攻击的话，玩家永远见不到中段，
    // 上下段读心只剩下段一边。实测四个角色的 jA 输出占比全是 0%。
    // 只在下落段按：上升段按出去多半打空，落地还要吃收招。
    if (me.state === 'jump' && me.vy <= 0 && me.y > 20 && foe.y <= 0
        // ×0.75 而不是照攻程满打：按下去还有 5~6 帧起手，这期间人还在下落也还在前移，
        // 贴着攻程尖端出手多半落空。写死的 70 太紧（打得到也不出手），满攻程又太松
        && Math.abs(foe.x - me.x) < jaReach(me.def, foe.def) * 0.75) {
      return { ...NULL_INPUT, attack: true };
    }

    // 挡下之后要还手：格挡硬直一解除就立刻出拳，把防守转成攻势
    if (me.state === 'block' && me.stun > 0) punishFor = BLOCK_PUNISH;
    if (punishFor > 0) {
      punishFor--;
      // 刚挡完时状态**就是** 'block'，而 ACTIONABLE 只收 idle/walk/crouch——
      // 第一版写成 ACTIONABLE.has(me.state) 的话这个分支一次都进不去，实测加不加都是 16%。
      // 从格挡里出招要先松防：这里不带 block 键，引擎下一帧就把他放回 idle。
      if (me.stun <= 0 && (ACTIONABLE.has(me.state) || me.state === 'block')
          && Math.abs(foe.x - me.x) < REACT_RANGE) {
        return { ...NULL_INPUT, attack: true };
      }
    }
    // 对空：读到起跳就处理。这是拳皇里跳入的标准答案，没有它，中段这条路是无解的。
    // 分两段：还在上升 / 还够不着 → 立防（跳跃攻击是中段，蹲防挡不住）；
    // 已经在下落且进到普攻够得着的距离 → 迎击。
    // 只在下落段迎击：对手还在升的时候打上去是自己先把身体交出来。
    // 道具来了：挡下，或者翻滚穿过去。翻滚是拳皇对付飞行道具的正解——挡下只是不掉血，
    // 滚过去才能把距离要回来，否则远程流可以一直站在外面白扔。
    if (reading && inbound) {
      // 大跳跨过去。这是大跳在拳皇里的正当用途，也是它在这里唯一划算的用法：
      // 小跳峰值 67px 躲不开光束（判定框 70~110），大跳 220px 跨得过。
      // 反过来，泛泛地用大跳做接近手段是亏的——45 帧滞空撞对空，实测调到最好也只有
      // 1% 的通关概率（深度小跳是 28%）。所以这里只在**确实有道具飞来**时才跳。
      const room = Math.abs(foe.x - me.x) > SAFE_APPROACH;
      if (room && ACTIONABLE.has(me.state) && rngHop() < HOP_OVER_RATE) {
        return { ...NULL_INPUT, jump: true, jumpHeld: true, move: (foe.x >= me.x ? 1 : -1) as Dir };
      }
      // roll 位不能漏：回避收成显式输入之后（见 InputFrame.roll），光给 block+move
      // 只会站着挡，这条"滚穿道具"的反应会**整条哑掉而不报任何错**。
      //
      // 0.45 → 0.28：补上 roll 位之后这条真的开始滚了，而滚是**赌**——中段才无敌，
      // 起手与收尾都吃满伤害，赌输就是一记干净的命中；挡下则稳稳只掉一点。
      // 实测按 0.45 滚，花果山那关的干净挨打率从 24% 涨到 26%，顶破了守门那条线。
      // 滚穿仍然要留着（挡下只是不掉血，距离照样被白拿，远程流可以一直站在外面扔），
      // 但它该是偶尔一次的抢身位，不是见道具就滚。
      // 滚穿道具，但**只在滚得掉的时候滚**。回避是中段无敌（第 3~22 帧），起手与收尾都吃满伤害：
      // 算一下这颗道具还要几帧到脸上，落在无敌窗口里才滚，否则老老实实挡。
      // 补上 roll 位、这条真的开始滚之后，不看时机地滚把第 3 关的干净挨打率从 24% 顶到 26%，
      // 越过了守门那条 25% 的线——「见道具就滚」是在赌，而挡下是稳的。
      // rng() 仍放在时机判断之前：让随机流的消耗次序与改动前一致（多一次/少一次调用
      // 都会把整条流洗牌，这个坑本项目踩过）。
      const eta = Math.abs(inbound.x - me.x) / Math.max(1, Math.abs(inbound.vx));
      if (room && ACTIONABLE.has(me.state) && rng() < 0.45
        && eta >= ROLL_INVULN_FROM && eta <= ROLL_INVULN_TO) {
        return { ...NULL_INPUT, roll: true, block: true, move: (foe.x >= me.x ? 1 : -1) as Dir };
      }
      return { ...NULL_INPUT, block: true, crouch: false };
    }
    // 起跳之后的头几帧要继续按住，否则升不成大跳（HOP_DECIDE=4，见 battle 的 jump 分支）
    if (me.state === 'jump' && me.stateFrame <= 4 && me.vy > 0) {
      return { ...NULL_INPUT, jumpHeld: true, move: (foe.x >= me.x ? 1 : -1) as Dir };
    }
    if (reading && airborne && Math.abs(foe.x - me.x) < REACT_RANGE) {
      // 只在下落段迎击：对手还在升的时候打上去是自己先把身体交出来。
      // 这条试着放宽过（"记住对手在连着跳就提前迎击"），实测跳入 100% 通关——
      // 打空之后的收招正好喂给落下来的那一下。见 docs/engine-notes.zh-CN.md「已经试过并退回的方向」。
      if (foe.vy <= 0 && Math.abs(foe.x - me.x) < AA_RANGE && ACTIONABLE.has(me.state)) {
        return { ...NULL_INPUT, attack: true };
      }
      return { ...NULL_INPUT, block: true, crouch: false };
    }
    if (reading && Math.abs(foe.x - me.x) < REACT_RANGE && foe.move) {
      const fm = foe.move;
      if (foe.stateFrame < fm.startup + fm.active) {
        // 被逼到版边时用回避穿身脱出。回避现在能从对手身体里滚过去（见 battle.separate），
        // 这是它唯一比后跳强的地方——后跳在墙边无处可退，回避能换到对手背后。
        // 只在贴墙时用：场地中间滚一下没有意义，收尾还会被抓。
        const wall = me.x - ARENA_MIN < CORNERED || ARENA_MAX - me.x < CORNERED;
        if (wall && ACTIONABLE.has(me.state) && rng() < 0.20) {
          // roll 位不能漏，同上：漏了这条"被逼到版边用回避脱出"的反应会整条哑掉，
          // 而且不报任何错——AI 只是站在墙角挡着，看起来像"它选择了防守"
          return { ...NULL_INPUT, roll: true, block: true, move: (foe.x >= me.x ? 1 : -1) as Dir };
        }
        // 爆气脱身：读到来招时花 50 气顶开对手。只花"零头的那 50 气"（>=50 且 <100），
        // 满槽仍然留给大招——第一版把 charge 直接塞进近身权重表，结果是 MAX 每局 1.27 次
        // 但只有 9% 发生在对手出招时（其余是近身瞎按），而大招出场率被这笔开销从 43%
        // 挤到 29%。把它挪进反应层之后，每一次爆气按定义都是在拆招。
        if (b.advancedCombat && me.meter >= 50 && me.meter < 100 && me.maxMode === 0 && rng() < (profile.burst ?? 0.25)) {
          return { ...NULL_INPUT, block: true, super: true };
        }
        // 起手/判定帧：防。段位仍然是猜的（同 block 分支的先验），读到了不等于看穿了，
        // 玩家的上下段照样骗得到它
        return { ...NULL_INPUT, block: true, crouch: foe.y > 0 ? rng() < 0.25 : rng() < 0.75 };
      }
      return { ...NULL_INPUT, attack: true }; // 收招帧：抓
    }

    // 连段与取消：招式**命中之后**再按一次才接得上，而每个决策窗只按一次的话永远接不上。
    // 实测：1057 次进攻里 1040 次是单段，必杀取消 0 次、普攻续段 0 次——三段连击和取消
    // 系统都建好了却没有任何东西在用。AI 不会连段，玩家也就永远看不到"原来可以这么打"。
    if (me.state === 'attack' && me.move && me.hitCount > 0) {
      const slot = me.move.slot;
      // 必杀取消进大招（スーパーキャンセル）：满槽时把一记命中的必杀直接接成大招。
      // 不加这一条的话，AI 只会走"普攻第二段接大招"一条路，玩家永远看不到更深的那条
      if (b.advancedCombat && (slot === 's1' || slot === 's2' || slot === 's3') && me.meter >= 100 && rng() < 0.20) {
        const i4: InputFrame = { ...NULL_INPUT }; i4.super = true; return i4;
      }
      if (slot === 'n1' || slot === 'n2') {
        const i2: InputFrame = { ...NULL_INPUT };
        // 气满时先考虑取消进大招：暗転补上之后连段接大招才真的接得上（此前必定落空，
        // 花 50 气换一个空挥），而 AI 一直只在"能一击致命"时才开大——实测七成的对局
        // 从头到尾看不到一次大招。满槽拿来做连段收尾，50 气仍然留给终结。
        const roll = rng();
        if (b.advancedCombat && me.meter >= 100 && roll < 0.25) { const i3: InputFrame = { ...NULL_INPUT }; i3.super = true; return i3; }
        // 大约三成的机会取消进技能，其余续普攻——两者都要出现，玩家才看得出这两条路
        if (roll < 0.3) {
          const pick3 = roll < 0.1 ? 'skill1' : roll < 0.2 ? 'skill2' : 'skill3';
          const slot3 = pick3 === 'skill1' ? 's1' : pick3 === 'skill2' ? 's2' : 's3';
          if (!(me.cooldowns[me.def.moves[slot3].id] > 0)) { i2[pick3] = true; return i2; }
        }
        i2.attack = true;
        return i2;
      }
    }
    // 出招键在"这一窗还没按成 + 现在能起招"时按下；持续型动作（移动/格挡）不受此限
    const strike = !punched && ACTIONABLE.has(me.state);
    if (strike) punched = true;
    const toFoe = (foe.x >= me.x ? 1 : -1) as Dir;
    const i: InputFrame = { ...NULL_INPUT };
    // 双击/回避要靠连续几帧的输入形态做出来，不是一帧的标志位。
    // dashPhase 在决策窗内推进：推 → 松 → 再推，正是引擎认的双击
    if (current === 'dash' || current === 'backstep') {
      const d = (current === 'dash' ? toFoe : -toFoe) as Dir;
      const ph = frames % 6;
      i.move = ph === 0 || ph >= 3 ? d : 0;
      return i;
    }
    // 显式发 roll 位。此前靠 `block + move` 让引擎推出回避，和玩家共用一条隐式契约，
    // 于是"把回避补进 block 分支"这件事一动就会连累 AI（它每 26 帧换一次决策，
    // 在格挡里新按方向太容易了）。收成显式一位之后，AI 滚多滚少只由权重表里的 roll 项决定。
    if (current === 'roll') { i.roll = true; i.block = true; i.move = toFoe; return i; }
    if (current === 'charge') { i.block = true; i.super = true; return i; } // 蓄气改到「防+大招键」：蹲+防归蹲防了
    if (current === 'blowback') {
      // 够不着就先走过去，别甩空。CD 是全场接触率最低的一招（22-48%，比最快的普攻还低），
      // 而它一空就是 33-35 帧站在那里给人打——AI 甩空一次，玩家白捡一套。
      if (Math.abs(foe.x - me.x) > cdReach(me.def, foe.def)) { i.move = toFoe; return i; }
      i.blowback = strike; return i;
    }
    // 防御取消：被打进格挡硬直、且气够，就花 50 气脱出去。这是挨打方的主动出口，
    // AI 不用的话玩家根本不知道有这条路。
    //
    // 两条出路同价，但换来的东西不同，所以按处境选：
    //   · 被逼到版边 → **回避**（防御 + 新按方向）：滚到对手背后，把压制反过来。
    //     顶开在墙边没用——把人推开一点，自己还是贴着墙。
    //   · 场地中间 → **顶开**（防御 + 拳）：直接换到安全距离。
    if (me.state === 'block' && me.stun > 0 && me.meter >= 50) {
      const i2: InputFrame = { ...NULL_INPUT };
      i2.block = true;
      const wall = me.x - ARENA_MIN < CORNERED || ARENA_MAX - me.x < CORNERED;
      if (wall) i2.move = (foe.x >= me.x ? 1 : -1) as Dir;   // 朝对手滚，穿过去换边
      else i2.attack = true;
      return i2;
    }
    switch (current) {
      case 'approach': i.move = toFoe; break;
      case 'retreat': i.move = -toFoe as Dir; break;
      case 'jump': i.jump = strike; i.move = toFoe; break;
      case 'attack': i.attack = strike; break;
      case 'skill1': i.skill1 = strike; break;
      case 'skill2': i.skill2 = strike; break;
      case 'skill3': i.skill3 = strike; break;
      case 'super': i.super = strike; break;
      case 'taunt':
        // 决策会持续整个窗口，而窗口里对手可能已经爬起来了——发之前再问一次闸门。
        // 问不过就什么都不做：`防御+上` 在闸门关着时会被引擎读成"防御中想跳"，白跳一次
        if (canTaunt(me.state, Math.abs(foe.x - me.x), foe.state, me.cooldowns[`${me.def.id}_taunt`] ?? 0)) {
          i.jump = true; i.block = true;
        }
        break;
      case 'block':
        i.block = true;
        // 上下段是**猜**，不是查表。对手在空中多半是中段（跳跃攻击），落地多半是下段，
        // AI 按这个先验去防——但留四分之一的猜错率。
        //
        // 第一版写的是 `i.crouch = foe.y <= 0`，一次都不会猜错：AI 永远防对，
        // 玩家的上下段读心一分钱回报都没有，等于这套系统只对 AI 单向生效。
        // 会被骗到，这套读心才成立。
        i.crouch = foe.y > 0 ? rng() < 0.25 : rng() < 0.75;
        break;
    }
    return i;
  };
}
