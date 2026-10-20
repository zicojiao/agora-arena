export const LOGIC_W = 960;
export const LOGIC_H = 540;
export const FLOOR_Y = 460;   // 地面的屏幕 y
export const ARENA_MIN = 40;  // 角色中心 x 的活动范围
export const ARENA_MAX = 920;
export const GRAVITY = 0.9;

export type Dir = -1 | 0 | 1;

/** 一逻辑帧的输入。attack/skill/super 为「本帧按下」边沿，block/crouch 为持续按住 */
export interface InputFrame {
  move: Dir;
  jump: boolean;
  /** 跳跃键是否仍按住。KOF 的小跳/大跳靠按住时长区分——只有边沿信号分不出来 */
  jumpHeld: boolean;
  attack: boolean;
  skill1: boolean;
  skill2: boolean;
  skill3: boolean;
  super: boolean;
  block: boolean;
  /**
   * 紧急回避。**边沿信号**，由输入层从「防御 + 新按方向」合成（见 ui/input.ts）。
   *
   * 此前没有这一位，回避是引擎自己从 `block && move !== 0` 推出来的，于是输入契约是反的：
   * 按住防御再推方向（真实按法、也是最需要回避的处境）什么都不发生，
   * 因为那两个分支只写在 idle/walk 里；而从 idle 按住「防+后」这个最常见的防守握法，
   * 会因为条件每帧都成立而**连滚不止**（实测 120 帧滚 4 次、格挡 0 帧）。
   * 收成一位显式输入之后，两边都不再"顺手"滚：玩家要有一次新按下的方向，
   * AI 则按自己权重表里的 roll 项发这一位，不会因为同时按了防御和方向就滑进回避。
   */
  roll: boolean;
  /** 吹飞攻击（键盘为攻击+防御同按，触屏为独立键） */
  blowback: boolean;
  crouch: boolean;
}

export const NULL_INPUT: InputFrame = {
  move: 0, jump: false, jumpHeld: false, attack: false,
  skill1: false, skill2: false, skill3: false,
  super: false, block: false, roll: false, blowback: false, crouch: false,
};

/** 左上角 + 宽高，屏幕坐标（y 向下） */
export interface Box { x: number; y: number; w: number; h: number }

/** run/backstep/roll 是 KOF 系的三件核心机动：双击前进起跑、双击后退小跳退、
 * 紧急回避带无敌翻滚。它们不是招式而是移动状态，所以进状态机而不进 moves 表。 */
export type FighterState = 'idle' | 'walk' | 'jump' | 'attack' | 'hitstun' | 'block' | 'down' | 'crouch'
  | 'run' | 'backstep' | 'roll';

/** 下蹲时受击框高度（绝对值，不按角色身高取百分比——身高不同会导致同一招对不同角色时躲时不躲） */
export const CROUCH_HEIGHT = 68;

export type FxType = 'burst' | 'trail' | 'beam' | 'ring' | 'spark' | 'flash' | 'glyph' | 'shockwave' | 'crescent' | 'bolt';

/** frame 相对招式起始帧；x/y 相对出招者脚底（面朝右） */
export interface FxEvent {
  frame: number;
  type: FxType;
  color: string;
  x?: number;
  y?: number;
  size?: number;
  angle?: number;
}

/** jA = 跳跃攻击（空中普攻）。格斗游戏的标准招式类型里，「站立普攻/蹲姿普攻/跳跃普攻」
 * 是三件不同的东西——此前 jump 状态压根没接输入，空中按什么都没反应。 */
export type MoveSlot = 'n1' | 'n2' | 'n3' | 'jA' | 's1' | 's2' | 's3' | 'sp50' | 'sp100';

export interface Move {
  /** 防御属性（拳皇的上下段）。不填 = 中段，站防蹲防都挡得住。
   * 'low' 下段：必须蹲防；'overhead' 中段（跳跃攻击）：必须站防。
   * 有了这一对，防御才是一次读招，而不是一个按住不放的按键。 */
  guard?: 'low' | 'overhead';
  id: string;
  slot: MoveSlot;
  name: string;
  damage: number;
  startup: number;   // 前摇帧
  active: number;    // 判定帧
  recovery: number;  // 后摇帧
  hitstun: number;   // 命中后对方硬直帧
  knockback: { x: number; y: number }; // y>0 = 击飞
  cooldown: number;  // 帧；普攻为 0
  meterCost: 0 | 50 | 100;
  /** 局部攻击框：x=脚底中心向前偏移, y=离地高度（到框底边）, 面朝右定义 */
  hitbox: Box;
  motionId: string;  // 指向 data/motions.ts
  /** 多段动作编排：招式总帧数按 weight 比例分给序列里的每段动作，依次播放。
   * 与 motionId 二选一（都给时以 motionSeq 为准）。引擎不读这个字段，纯渲染层使用。 */
  motionSeq?: { motionId: string; weight: number }[];
  fx: FxEvent[];
  /** 突进位移：可给多次冲量。每次在 stateFrame 到达 frame 时把 vx 设为 vx*facing（正数向前，
   * 负数向后），随后按 attack 状态的摩擦衰减。分散的多次 = 随每一击踏进一步；密集的多次 =
   * 持续冲锋。同一招内不应有重复 frame（校验器管这个，重复会让后一个静默覆盖前一个）。 */
  dash?: { frame: number; vx: number }[];
  /** 多段判定：一次发动内最多命中 hits 次，相邻两次至少间隔 interval 帧。
   * 总伤害仍是 damage，按段分摊，最后一段吃余数保证总量精确。 */
  multiHit?: { hits: number; interval: number };
  /** 连打中间段把对手往后推的速度（px/帧，正数=朝出招者面向）。终结一击不用它，走 knockback。
   * KOF 的超必杀是「把人逼到版边再轰」——中间段完全不推的话两人原地对着打，没有那一拍；
   * 推太多又会把人推出射程，所以配合 dash 让出招者同步跟进，净效果是两人一起朝版边挪。 */
  /** 这一招期间兵器伸长/缩短的倍率（1 = 不变）。如意棒"撑天""横扫千军"就是靠它变长——
   * 招式名承诺的事，画面得兑现。纯渲染层，引擎不读。 */
  /**
   * 霸体（アーマー）：这一招的**起手期间**能硬吃几下而不进硬直。
   *
   * 血照掉、气照给，只是不被打断——所以它不是无敌，是"用血换一次出手"。
   * 只覆盖起手：判定生效之后再扛就成了无脑对拼，而起手正是慢招唯一需要保护的那一段。
   * 全名册只有刑天用它（断头仍战的那位），是他"霸体"定位的机制本体。
   */
  armor?: number;
  /** 强制击倒：不看伤害阈值，这一招命中就把人打倒 */
  knockdown?: boolean;
  /** 硬直击倒（KOF 的ダウン）：这种击倒不能受身，必须躺满。
   * 大招、投技、吹飞攻击都属于这一类——它们是「赢了这一下就该拿到主动权」的招，
   * 若能受身逃掉，压制就没有意义了。 */
  hardKnockdown?: boolean;
  weaponScale?: number;
  /** 投射物：招式名承诺了一件飞出去的实物（乾坤圈、天眼光束、芭蕉扇），就得真的有。
   * 由引擎生成实体、自带判定框，飞行途中命中即结算——不是画个特效糊弄。
   * spawnFrame 相对招式起始帧；back>0 表示会飞回来（乾坤圈那种回旋兵器）。 */
  projectile?: {
    spawnFrame: number;
    vx: number;          // 水平初速（会乘 facing）
    life: number;        // 存活帧数
    damage: number;
    hitstun: number;
    knockback: { x: number; y: number };
    w: number; h: number; // 判定框尺寸
    y: number;            // 离地高度（框底边）
    kind: 'ring' | 'beam' | 'fan' | 'arrow' | 'wraith' | 'roar';
    color: string;
    /** 飞出这些帧之后开始回旋（速度反向）。0 = 不回旋 */
    back?: number;
  };
  carry?: number;
  /** 短演出覆盖：这一击**打不死**对手时换上的三秒版（Move 本身是十秒的终结演出）。
   * 业界通行做法——GG 一击必杀、MK Fatality 都只在终结时播；可重复使用的对局内大招
   * 普遍 2-5 秒。本作气槽填满 50 约需 5 秒战斗，每次都放十秒的话过场会长过战斗本身。
   * 引擎在 startMove 时按 `对手 hp <= damage` 决定用哪一版，之后所有读 f.move 的地方
   * 拿到的都是已经合并好的那一版，不需要各自再判一次。 */
  brief?: Partial<Move>;
  /** 由 startMove 合并短演出时打上，供演出层挑节拍表用；数据里不要手写 */
  isBrief?: boolean;
}

/** 大招火焰纹背光的花瓣形态：四个数字编码角色定位，不是一整套配置系统。
 * petals 少而 spread 大、tipBlunt 高 = 粗野厚重；petals 多而 spread 小、tipBlunt 0 = 纤细锐利；
 * curl 非零 = 花瓣两侧控制点同向偏转，读出旋卷而非对称舒展。 */
export interface SuperAura {
  petals: number;
  spread: number;   // 控制点角度偏移 / 槽位角，0-0.5，越大花瓣越宽厚
  tipBlunt: number;  // 尖端钝化：0=收成锐利尖点，越大尖端裂成越宽的平口
  curl: number;      // 卷曲：两侧控制点同向偏转量（同 spread 单位），0=对称舒展
}

/** 兵器形制。长度是从握把往刃尖的逻辑单位；grip 是握点在全长上的比例
 * （0.5=正中双手棍，0.25=偏后单手枪），决定杆子往手后伸出多少。 */
export interface WeaponDef {
  /**
   * 形制。这不是"武器分类"，是**画法**——每一种都在 drawWeapon 里有自己的一支。
   *
   * 早先只有五种，于是十二个人里有四个共用 mace：九齿钉耙、黄金棍、混铁棍、戚(斧)
   * 画出来是同一根带钝头的棍子，只有长短和颜色不同；后羿更离谱，射日的人拿着 staff。
   * 名字在招式里写得清清楚楚，画面上却认不出是什么——那正是"新角色看着都一样"的来源。
   * 各人最认得出的那件（耙/弓/斧/剑）因此各自有一支画法。
   *
   * 加新形制时**必须同时在 drawWeapon 里加一支**：那里最后一个分支是 else（钝头棍），
   * 漏了不会报错，只会安静地把新武器画成棍子。weapons.test 的"九种形制画出来两两不同"守这条。
   */
  kind: 'spear' | 'staff' | 'glaive' | 'mace' | 'fan' | 'bow' | 'rake' | 'axe' | 'sword';
  len: number;
  grip: number;
  shaft: string;
  edge: string;
}

export interface CharacterDef {
  /** Optional full-body transparent character art used by the GOAT Clash renderer. */
  artUrl?: string;
  /** Optional full-body roster artwork. It does not replace the articulated in-fight skeleton. */
  portraitUrl?: string;
  /** Football kit used by the articulated GOAT Clash renderer. */
  footballKit?: {
    number: string;
    shorts: string;
    socks: string;
    boots: string;
    skin: string;
  };
  /** 胜负台词。街机格斗里这是角色性格最直接的载体——四个对手打完只给一个「胜/败」，
   * 谁是谁完全没有分别。win 是他赢下这一关时说的，lose 是他被打败时说的。 */
  /** taunt 是挑発（防御+上）时喊的那一句。KOF97 的挑衅是**削对手气**的实招，
   * 不是纯表演；喊什么则是这个角色此刻怎么看对面，四个人各说各的。 */
  /** intro 是**开场那一句**：关卡横幅报完地名与对手名之后，由对手对着玩家说。
   * KOF 的开场对峙是角色性格最先落地的地方——玩家还没交手就已经知道对面是谁。
   * 此前只有胜/败/挑衅三句，全都发生在**打完之后**，一场仗打到一半才有人说话。 */
  quotes: { win: string; lose: string; taunt: string; intro: string };
  /** 对**特定对手**的胜利台词，键是对手 id，缺了就回落到 quotes.win。
   * KOF97 的胜利台词是按对手分的（草薙京对八神庵那句不会拿去对别人说），
   * 这一层是十二个人之间的关系网唯一说得出口的地方——父子、夫妻、师兄弟、
   * 打过一架的旧账，光靠一句通用台词全都听不见。写不出这一句的组合就不写，
   * 回落是正常状态，不是缺口。 */
  vs?: Record<string, string>;
  /** 对**特定对手**的败北台词，键是对手 id，缺了就回落到 quotes.lose。
   * 与 vs 成对：胜者那句在摆造型时说（对局里），败者这句在结算页说——
   * 两句凑起来才是一段对话。只给胜者写专属台词的话，红孩儿喊完
   * 「爹，你说等我打赢你就认我——现在呢？」，牛魔王回的仍是那句谁都通用的。 */
  vsLose?: Record<string, string>;
  /** 对**特定对手**的开场白，键是对手 id，缺了就回落到 quotes.intro。
   * 与 vs / vsLose 同一张关系网，只是发生在**开打之前**：
   * 开场一句、胜者一句、败者一句，三拍连起来才是一段完整的对话。
   * 此前那张网只在打完之后才响得起来。 */
  vsIntro?: Record<string, string>;
  /** 对**特定对手**的挑衅台词，键是对手 id，缺了就回落到 quotes.taunt。
   * 关系网的第四张表。注意它和前三张**不是一回事**：这句台词是招式的 name
   * （tauntMove 把它塞进 Move.name，借 s1 的坑位在头顶浮字），而那个 Move 是
   * 按 def 缓存的——取法必须每次覆盖 name，不能让它跟着缓存定型。见 tauntMove。
   * 头顶浮字最窄，上限 10 字（比其他三句都紧）。 */
  vsTaunt?: Record<string, string>;
  /** 格斗定位，四到六个字。十二个人要覆盖十二种**打法**而不是十二种外观，
   * 而玩家在选人页看不到帧数与判定框——这一行是他判断"这个人怎么打"的唯一入口。
   * 也是数据自己的约束：写不出一个不重复的定位，说明这个角色没有存在的理由。 */
  role: string;
  /** 通关四关之后的收场白。此前打通只是把结算页的标题从「胜」换成「功德圆满」，
   * 四个角色的结局一模一样——闯完整条阶梯没有任何专属的回报。 */
  ending: string;
  /**
   * **修罗档**通关时改用的收场白。缺了就回落到 ending。
   *
   * 三档难度的六关连过率是 轻松 19.8% / 标准 0.8% / 修罗 0.0%（见 stages 的注释）——
   * 也就是说最难那档此前**通了也和标准档看到同一段字**，那条曲线不给任何额外的回报。
   * 街机的老规矩是最高难度才给真结局，这一条正是难度档要买的那份重玩理由。
   */
  endingHard?: string;
  id: string;
  name: string;
  hp: number;
  speed: number;    // px/帧
  jumpVel: number;  // 起跳初速（向上）
  width: number;    // hurtbox 宽
  height: number;   // hurtbox 高
  palette: { main: string; accent: string };
  /**
   * 无头。刑天断首之后「以乳为目，以脐为口」——他的定位本体就是这件事，
   * 而渲染层此前无条件画一颗头，画面上他和别人一样有脑袋，
   * 「头没了，手还在」那句胜利台词直接落空。
   * 置真时不画头，改在胸口画一对眼、腹上画一张口。
   */
  headless?: boolean;
  /**
   * 头饰：大招特写里那颗头上画什么。
   *
   * 特写的程序化胸像此前是"肩 + 一个光头圆"——十二个人只差配色，
   * 玩家反馈「新增神话人物的头像不该用默认」说的就是这里。
   * 每个人一种，靠这一件就认得出是谁：牛角/金箍/火焰/大耳/第三只眼/双髻/幞头/发簪/骷髅/抹额/双翅。
   * 刑天不给（他无头，特写走胸口那对眼睛）。
   */
  crown?: { kind: 'horns' | 'ring' | 'flame' | 'ears' | 'thirdEye' | 'buns' | 'cap' | 'pin' | 'skull' | 'band' | 'wings'; color: string };
  /** 手持兵器。招式名里满是「火尖枪/如意棒/三尖刀」，画面上却一直空着手——
   * 这里用程序化画法补上，不依赖美术资源（parts 里的 weapon.png 若存在仍优先）。 */
  weapon?: WeaponDef;
  /** 身上的"活物"层：飘带、余烬、满槽气环、扬尘。结构见 render/adornments.ts 的 AdornDef。
   * 引擎不读它，纯渲染层使用；类型放在这里只是为了让角色数据集中在一处描述完。 */
  adorn?: {
    sashes?: { anchor: 'shoulder' | 'hip'; segs: number; segLen: number; width: number; color: string; tip?: string }[];
    /** 一对翅膀（雷震子）。见 render/adornments.ts 的 WingDef */
    wings?: { color: string; tip: string; span: number; feathers: number };
    ember?: { color: string; rate: number; rise: number };
    aura?: string;
    dust?: string;
  };
  /** 大招火焰纹背光/速度线的配色：[内环, 外缘]。不给则回退到默认藤黄→朱砂 */
  superGlow?: [string, string];
  /** 大招火焰纹背光的花瓣形态。不给则回退到原始 14 瓣基准形态 */
  superAura?: SuperAura;
  /**
   * 投技的个人化参数。不给就用全局默认（距离 52px、冷却 72 帧、伤害为 n3 的 0.9 倍）。
   *
   * 投技本来是所有人共用一套数值的系统招，于是"投技型角色"这个原型无从表达——
   * 谁来投都一样远、一样疼、一样久。猪八戒是唯一改写它的人：抓得更远、更疼、更频繁。
   */
  grapple?: { range: number; power: number; cd: number };
  /**
   * AI 控这个角色时的**打法偏置**：按距离档给权重乘一个倍率。
   *
   * 加它是因为量出来一件事：AI 把十二个人打得一模一样。同一档权重表下，
   * 十二个角色使用必杀时的平均间距全落在 194~217px；而猪八戒——抓取距离 78、
   * 冷却 44、伤害 1.35 倍的**投技型**——每千帧只投 1.0 次，比白骨精还少。
   * 也就是说十二种定位在数据里成立，一交给 CPU 就全变成同一个人。
   *
   * 倍率而不是覆盖：关卡难度仍然由 STAGES 的权重表决定（那是调了几十轮的东西），
   * 这里只改「同一个局面下他更爱做什么」。缺省 1。
   */
  aiBias?: Partial<Record<'near' | 'mid' | 'far', Record<string, number>>>;
  moves: Record<MoveSlot, Move>;
}

/** 场上飞行的投射物。owner 用来避免打到自己，也用来结算气槽。 */
/**
 * 残血线：血量低于这个比例就进入「凶暴」。
 *
 * 放在 types 而不是 ai.ts，是因为**两处在用**：ai 靠它决定要不要不要命地压上去，
 * 渲染层靠它把血条转成朱砂色并开始搏动。此前渲染层是自己写死的 0.3——
 * 同一条规则写了两份，调一处另一处不会跟着动（这个项目在这类漂移上栽过三次）。
 */
export const DESPERATE_HP = 0.3;

/**
 * 离版边多近算被逼到墙角。角色宽 52-64、跑一步约 10px——140 大约是两三步的余量。
 *
 * 放在 types 是因为**三处在用**：ai 靠它决定被压住时是顶开还是滚出去，
 * 提示条靠它决定该教哪一条出路。此前 ai.ts 里是常量、TouchLayer 里是字面量 140，
 * 同一条规则写了两份（这个项目在这类漂移上栽过四次，最近一次是残血线 DESPERATE_HP）。
 */
export const CORNERED = 140;

export interface Projectile {
  owner: 0 | 1;
  x: number; y: number; vx: number;
  age: number; life: number;
  facing: 1 | -1;
  hit: boolean;         // 已命中过就不再判定（单段）
  def: NonNullable<Move['projectile']>;
}

export type HurtKind = 'high' | 'body' | 'crouch' | 'air';

export interface Fighter {
  def: CharacterDef;
  x: number;
  y: number;         // 离地高度，0=着地，向上为正
  vx: number;
  vy: number;
  facing: 1 | -1;
  hp: number;
  meter: number;     // 0-100
  state: FighterState;
  stateFrame: number; // 当前状态已持续帧数
  stun: number;      // hitstun/down 剩余帧
  move: Move | null; // attack 状态的当前招式
  hitCount: number;      // 当前招式已命中段数（单发招式最多到 1）
  /** Incoming reactions, independent of the current move's outgoing hit count. Block/armor do not advance it. */
  hurtCount: number;
  /** Contact context captured before the hit replaces the victim's state. */
  hurtKind: HurtKind;
  lastHitFrame: number;  // 上次命中时的 stateFrame，多段判定用来量间隔
  chainQueued: boolean;
  /** 当前这一招是不是空中招（jA）。空中招落地即收，不等帧数走完 */
  airborne: boolean;
  /** 双击检测：上一次方向输入的方向与距今帧数。KOF 的跑与后跳都靠双击同一方向触发 */
  /** MAX 模式剩余帧。KOF 的爆气：伤害提升、超必杀半价 */
  /** 当前招式还剩几层霸体。startMove 时从 move.armor 装填，每硬吃一下减一 */
  armorLeft: number;
  maxMode: number;
  /** 蓄气已持续帧数（按住蹲+防御） */
  charge: number;
  /** 本帧是否按着攻击键——用于投技解脱判定 */
  /** 上一帧的受身键状态。受身必须是「这一帧新按下」，不能靠按住蒙——
   * 一直按着攻击键的话（AI 就是这么打的）每次击倒都会自动受身，等于击倒不存在 */
  techPrev: boolean;
  /** 胜出后过了几帧（0 = 没赢）。渲染层靠它切胜利姿势——
   * KO 之后有 120 帧收尾，此前赢的那一位在这段时间里就站着发呆 */
  victory: number;
  /** 这次击倒能不能受身。硬直击倒（大招/投技/吹飞）不能 */
  techable: boolean;
  /**
   * 这一次倒地是被**投**打倒的。
   *
   * 只给提示层用，引擎自己不读它。分出来是因为「不能受身」的三种来源里，
   * 只有投技留了一条真正的出路（被抓住前一瞬按普攻可以挣脱，见 escapeAge），
   * 而大招/吹飞是躺定了。混在一句「大招 / 投技 / 吹飞 打倒的，只能躺满」里，
   * 等于把唯一那条出路也说成了没有。
   */
  downByThrow: boolean;
  /** 投技冷却剩余帧，防止贴身后连续投 */
  throwCd: number;
  tapDir: Dir;
  tapAge: number;
  /** 上一帧的方向输入，用来识别「刚推杆」这一瞬间 */
  prevMove: Dir;
  /** 先行入力缓冲：每个出招键距上一次**新按下**过了多少帧（99 = 没按过）。
   * 拳皇里按早了几帧仍然算数，这里同理——没有它的话，在硬直/收招里点的键会被直接丢掉，
   * 手感就是"我按了但没反应"，触屏上尤其明显。 */
  buf: Record<string, number>;
  /** 上一帧各出招键的状态，用来取"新按下"的边沿（按住不放不该反复入队） */
  bufPrev: Record<string, boolean>;
  /** 距离上一次**新按下**攻击键过了多少帧。投技解脱看这个：被投前 12 帧内按过就挣脱。
   * 用年龄而不是 bool，是因为投技发生在哪一帧不可预知，玩家不可能刚好按在那一帧上。 */
  escapeAge: number;
  /** 着地硬直剩余帧。跳跃落地后不能立刻动——KOF 里这是跳入要付的代价 */
  landStun: number;
  /** 上一帧攻击键的状态，用来取新按下的边沿（按住不放不算，同受身） */
  escapePrev: boolean;
  /** 当前这次格挡是蹲着的（下段防御）还是站着的。按着防御推下即可切换 */
  lowGuard: boolean;
  invuln: number;    // 无敌剩余帧
  flash: number;     // 受击白闪剩余帧（渲染读取）
  cooldowns: Record<string, number>; // moveId -> 剩余帧
}

export type BattleEvent =
  | { type: 'hit'; attacker: 0 | 1; damage: number; x: number; y: number; blocked: boolean; heavy: boolean; counter?: boolean }
  | { type: 'throw'; attacker: 0 | 1 }
  | { type: 'super'; who: 0 | 1; tier: 50 | 100 }
  | { type: 'moveStart'; who: 0 | 1; move: Move }
  | { type: 'ko'; loser: 0 | 1 }
  | { type: 'tech'; who: 0 | 1 }
  | { type: 'maxMode'; who: 0 | 1 }
  | { type: 'guardCancel'; who: 0 | 1 }
  | { type: 'throwEscape'; who: 0 | 1 };
