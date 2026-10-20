import type { AiProfile } from '../engine/ai';

/** 天体形态：固定挂在天空、不参与视差滚动，只用来区分关卡身份 */
export type Celestial = 'moon' | 'crescent' | 'sun';
export interface StageBg {
  /** Optional painted arena image. */
  artUrl?: string;
  /** Walkable floor line as a fraction of the painted image height. */
  artFloorY?: number;
  /** CSS filter grading the painted art (time of day). Applied once to a cached copy, not per frame. */
  artFilter?: string;
  sky: [string, string]; ground: string; silhouette: string; seed: number;
  celestial: Celestial; celestialColor: string;
  /** 氛围粒子层：每关一种，是这关最直接的"这是哪儿"的信号 */
  /**
   * 氛围粒子。六种形态各有各的运动：ember 向上飘、petal 打着旋往下落、firefly 原地浮、
   * ash 无声下沉（不发光）、spark 明灭不定、mist 大团慢移。
   * 十二关只用三种的时候，四五关共用同一种飘法——背景各不相同，空气却是同一团。
   */
  ambient?: { kind: 'ember' | 'petal' | 'firefly' | 'ash' | 'spark' | 'mist'; color: string; count: number };
}
export interface Stage { name: string; bossId: string; ai: AiProfile; bg: StageBg }

// decideEvery 的真实含义是「一个动作坚持多久」，不是「反应多快」——名字有误导性。
// 窗口越长，AI 打得越连贯：双击才拍得出跑/后跳、格挡才守得住、接近才真的走到位；
// 窗口一短，它就在几个动作之间反复横跳，每样都做半截。所以**数字越大反而越强**，
// 一路测下来都是这样（关1 26→24 胜率 69%→41%，关3 20→26 是 13%→42%）。
// 每关的值都是逐关扫出来的甜点，不要按"数字越小越强"去调。
// 最终关的 decideEvery 比第二关还大也不奇怪：它的强度来自权重表（大招 3、吹飞、翻滚），
// 不来自这个数。
//
// 难度要拿**固定水平**的陪练去量。曾经用 STAGES[min(si,2)].ai 当陪练——关卡越靠后陪练也越强，
// 正好抵消掉 BOSS 变强，量出来是一条平线；换成固定 lv2 中手才看见真相：92/58/**8**/8，
// 第二关到第三关是一堵墙。真人玩家的水平在四关里是恒定的，测量也必须如此。
/**
 * 每个角色的主场：名字 + 背景。
 *
 * 拆出来是因为**关卡不再等于四个固定对手**——十二个人各有各的地方，
 * 而阶梯要从名册里挑人（见 docs/roster-12.md）。挑到谁，就打到谁家去。
 *
 * 背景是程序化画的：一条天空渐变、地面色、剪影色、一颗天体、一层氛围粒子。
 * 每一处都按那个地方的实景取色，不是随机换色板——
 * 火云洞是洞里看出去的赤黑，芭蕉洞是竹雾的青，白虎岭是月照白骨的灰。
 */
export const HOME: Record<string, { name: string; bg: StageBg }> = {
  nezha: {
    name: '东海之滨',
    bg: { sky: ['#0d2a4a', '#3a7a9a'], ground: '#12283a', silhouette: '#0a1f33', seed: 11, celestial: 'moon', celestialColor: '#EDE3D2', ambient: { kind: 'firefly', color: '#9fd8ff', count: 34 } },
  },
  erlang: {
    name: '灌江口',
    bg: { sky: ['#1c1636', '#5a4a8a'], ground: '#221c40', silhouette: '#161030', seed: 22, celestial: 'crescent', celestialColor: '#EDE3D2', ambient: { kind: 'firefly', color: '#c7a6ff', count: 30 } },
  },
  wukong: {
    name: '花果山',
    bg: { sky: ['#0e2a1a', '#4a8a5a'], ground: '#14301e', silhouette: '#0a2012', seed: 33, celestial: 'sun', celestialColor: '#D9A441', ambient: { kind: 'petal', color: '#ffd7e0', count: 30 } },
  },
  niumo: {
    name: '积雷山·魔王真身',
    bg: { sky: ['#1c0606', '#6a1e10'], ground: '#260c08', silhouette: '#140404', seed: 44, celestial: 'moon', celestialColor: '#C8443C', ambient: { kind: 'ember', color: '#ff7a3c', count: 40 } },
  },
  // 火云洞：洞口往外看的赤黑，火舌把岩壁烤成暗红。余烬最密——他本人就是一直在烧的
  honghaier: {
    name: '火云洞',
    bg: { sky: ['#2a0a04', '#8a3a12'], ground: '#2e1008', silhouette: '#180602', seed: 55, celestial: 'sun', celestialColor: '#FF8C2B', ambient: { kind: 'ember', color: '#ffb24a', count: 52 } },
  },
  // 翠云山·芭蕉洞：竹雾的青。全场唯一以绿为天的关，与她儿子的火云洞正好对着
  tieshan: {
    name: '翠云山·芭蕉洞',
    bg: { sky: ['#0a2a26', '#4fa58c'], ground: '#0e2b26', silhouette: '#06201c', seed: 66, celestial: 'crescent', celestialColor: '#EEF3EA', ambient: { kind: 'petal', color: '#bdf0dc', count: 26 } },
  },
  // 白虎岭：惨月照着白骨，天是发灰的青。粒子用萤火但压成骨白，读起来是浮在坡上的磷火
  baigu: {
    name: '白虎岭',
    bg: { sky: ['#141a1c', '#5c6a66'], ground: '#1a2020', silhouette: '#0c1212', seed: 77, celestial: 'moon', celestialColor: '#E8E4D6', ambient: { kind: 'ash', color: '#cfd8d2', count: 26 } },
  },
  // 昆仑·射日台：九日刚落，天边还烧着。他站的是全名册最高的地方，所以天最开阔
  houyi: {
    name: '昆仑·射日台',
    bg: { sky: ['#2a1408', '#e0913a'], ground: '#2a1c10', silhouette: '#180e06', seed: 88, celestial: 'sun', celestialColor: '#FFB340', ambient: { kind: 'ember', color: '#ffd08a', count: 28 } },
  },
  // 西岐·雷云崖：雷云压得极低，天与地几乎同色，只有电光把云底照亮
  leizhen: {
    name: '西岐·雷云崖',
    bg: { sky: ['#101828', '#4a6fa8'], ground: '#141c2c', silhouette: '#0a1018', seed: 99, celestial: 'crescent', celestialColor: '#8FD0FF', ambient: { kind: 'spark', color: '#8fd0ff', count: 34 } },
  },
  // 酆都·鬼门关：石阙与幡，天是暗紫。鬼火用萤火那一层，绿得发冷
  zhongkui: {
    name: '酆都·鬼门关',
    bg: { sky: ['#160a1e', '#4a2a52'], ground: '#1c1024', silhouette: '#0e0614', seed: 110, celestial: 'moon', celestialColor: '#7FE0A8', ambient: { kind: 'mist', color: '#7fe0a8', count: 16 } },
  },
  // 常羊山：荒原、断碑、血日。没有一点绿——他在这里已经打了很多年
  xingtian: {
    name: '常羊山',
    bg: { sky: ['#2a1410', '#9a4a2a'], ground: '#2c1a12', silhouette: '#180c08', seed: 121, celestial: 'sun', celestialColor: '#C8443C', ambient: { kind: 'ember', color: '#d8a068', count: 24 } },
  },
  // 高老庄：秋日的晒场，全名册最"家常"的一关——他打完就回这儿吃饭
  bajie: {
    name: '高老庄',
    bg: { sky: ['#2a2010', '#c8a04a'], ground: '#2c2416', silhouette: '#1a140a', seed: 132, celestial: 'moon', celestialColor: '#E8C98A', ambient: { kind: 'petal', color: '#e8c98a', count: 22 } },
  },
};

export const STAGES: Stage[] = [
  {
    // 近身表里补了一点 skill1：原来这一关贴身时一个必杀都不会用（只有普攻/后退/发呆），
    // 而加着地硬直之后关1→关2 的落差顶到 35.4 点、压过了 balance 那条 35 的线。
    // 调 react 是不行的（次序不变量：后面每一关的 react 不得低于前一关），难度要从权重表来。
    // 试过的两档都过头：near 改成 idle 1/retreat 3 时关1 掉到 58%，反而撞上
    // 「关1−关4 要拉开 25 点」那条。窗口是 关1 ∈ (63%, 75%]。
    name: HOME.nezha.name, bossId: 'nezha',
    ai: { name: 'lv1', decideEvery: 26, react: 0.25, near: { attack: 4, idle: 2, retreat: 4, block: 1, super: 1, skill1: 1 }, mid: { approach: 3, idle: 2, skill1: 2, retreat: 1, super: 1 }, far: { approach: 4, idle: 2, dash: 2, charge: 2 } },
    bg: HOME.nezha.bg,
  },
  {
    // 试过把近身表从逃跑型（retreat 4 / backstep 2）改成压上去（attack 7 / retreat 1）来治
    // 乱按，48 局的公平对比说明这条路不划算：乱按只降 8 点（83%→75%），尺子却掉 18 点
    // （60%→42%）。表已经改回来了。真正管用的是 react —— 这一关 0.25→0.32，
    // 乱按 83%→58%，尺子 42%→60%，两头都更好。
    //
    // （中途一次 N=32 的抽样给出过"乱按 81%→66%、尺子 50%→53%"的漂亮结论，是噪声；
    //   同一组参数在 N=12/24/48 下分别是 83%/67%/75%。逐关胜率这种量，32 局都不够。）
    //
    // 这个数走过一圈冤枉路：0.25 → 0.32（上面那次实测）→ 0.2（投技改动后为了压住
    // balance 的「关间落差 ≤35 点」硬降的，当时没留说明）→ 0.26（现在）。
    // 降到 0.2 的代价是**这一关变得比第一关还迟钝**，于是成了整条阶梯上唯一一处
    // 有无脑解的地方：实测「只蹲着扫下段」这一个套路在这一关拿 81%，而在第一关只有 63%。
    // 0.26 是满足两头的最小值——比第一关的 0.25 高一步（这条次序不变量被破坏过两次），
    // 下段套路压回 59%，而尺子胜率 67%→63% 在噪声里（N=48，SE≈6.6），
    // balance 的落差断言照过。0.32 仍然过不了那条断言（落差 39.6 点）。
    //
    // 立的规矩：**后面每一关的 react 都不得低于前一关**。难度可以从权重表来（最终关就是
    // 这么做的），但"反应比上一关更慢"一定会在某个套路上开一个洞。
    // mid 段的 skill1 从 4 降到 2（2026 年这一轮）：阶梯中段量出来是平的——
    // 79/**50/49**/38，关2 与关3 几乎一样难，两关手感没有区别。
    // 试过让关3 更难（react 0.5 → 45%、近身表更压迫 → 38%、decideEvery 22 → 反而 57%），
    // 但把关3 压到 38 只是把"平"从中段挪到末段。真正偏离的是关2：
    // 从 79 到 38 四关，均匀该是 79/65/51/38，而它是 50。
    // 难度来自角色本身——二郎神攻程 260、还带光束，中距离那段压制最难受。
    // 收 mid 的 skill1 之后关2 是 60%，阶梯变成 79/60/48/38（落差 19/12/10）。
    // 远距离仍然照放，BOSS 的远程身份保住。
    name: HOME.erlang.name, bossId: 'erlang',
    ai: { name: 'lv2', decideEvery: 26, react: 0.26, near: { attack: 5, block: 2, retreat: 4, skill2: 1, backstep: 2, super: 1 }, mid: { approach: 3, skill1: 2, skill3: 1, jump: 1, dash: 2, retreat: 2, super: 1 }, far: { approach: 2, skill1: 4, dash: 3, charge: 2 } },
    bg: HOME.erlang.bg,
  },
  {
    name: HOME.wukong.name, bossId: 'wukong',
    ai: { name: 'lv3', decideEvery: 26, react: 0.4, near: { attack: 6, block: 3, super: 2, retreat: 3, roll: 1, blowback: 1 }, mid: { approach: 3, skill1: 3, skill2: 3, jump: 2, dash: 2, retreat: 2 }, far: { approach: 3, skill2: 3, skill3: 2, dash: 2, charge: 3, taunt: 1 } },
    bg: HOME.wukong.bg,
  },
  {
    // decideEvery 保持 30。**试过改成 26，退回来了**，过程值得记：
    // 用 60 场/格探测时它把关4 从 38% 压到 30%，看着正好治阶梯末端那块平地；
    // 提交之后用 80 场/格复量是 40%，再用 120 场/格同口径 A/B：
    //   decideEvery 26 → 42%　　decideEvery 30 → 37%
    // **方向是反的**——那个 30% 是噪声。而本仓 docs/engine-notes.zh-CN.md 里写着"要分辨 10 点以内的差得上 80 场"，
    // 我自己写下这条规矩，然后用 60 场下了结论。探测可以小样本，**下结论必须够样本**。
    //
    // 顺带记下另外三个候选，它们反而让关4 更容易：少后跳 40%、近身更压迫 45%、mid 多接近 48%——
    // 逼得太紧的 BOSS 反而站进了对手的射程里（关3 那次也是这个结论）。
    name: HOME.niumo.name, bossId: 'niumo',
    ai: { name: 'boss', decideEvery: 30, react: 0.65, near: { attack: 6, block: 3, super: 3, skill3: 2, roll: 1, backstep: 3, blowback: 1 }, mid: { approach: 3, skill1: 4, skill2: 3, super: 1, dash: 2, retreat: 2 }, far: { approach: 3, skill1: 3, dash: 2, charge: 3, taunt: 1 } },
    bg: HOME.niumo.bg,
  },
];

/** 训练场等无关卡索引场景使用的默认背景（东海配色） */
export const DEFAULT_BG: StageBg = HOME.nezha.bg;

/** BOSS 关数值强化 */
// 前三关不加任何数值：难度全部来自 boss 的招式权重。
//
// 最终关给 1.1 倍血。这一条曾经被拆到 1，理由是"加血只会把最后一关拖长，不会让它更好玩"——
// **那条理由是可检验的，量完之后推翻了**（120 场/格）：
//   血量 ×1.0：回合 27.6 秒　读秒到底 0%　玩家胜率 37%
//   血量 ×1.1：回合 27.9 秒　读秒到底 0%　玩家胜率 28%   ← 只长了 0.3 秒
//   血量 ×1.2：回合 28.9 秒　读秒到底 0%　玩家胜率 23%
// 多出来的血主要让玩家**输得更早**，而不是把回合拖长。
//
// 之所以回过头来动数值，是因为**行为旋钮已经用尽**，而且都是量出来的：
//   加压：少后跳 40% / 近身更压迫 45% / mid 多接近 48%——全都让关4 更**容易**
//         （逼得太紧的 BOSS 会站进对手射程里，关3 那轮也是同一个结论）
//   加耐心：react 0.65→0.8 得 38% / 近身更耐心 37% / 握得更久 44%——全无效或反效
//   对空率 0.8→0.95 得 34%，在噪声内（对空率 0.8 以上饱和，这是第四次撞到这堵墙）
// 阶梯因此是 88/66/46/**28**，落差 22/20/18。
export const BOSS_HP_SCALE = [1, 1, 1, 1.1];
export const BOSS_DMG_SCALE = [1, 1, 1, 1.0];

// ── 六关阶梯：前五关从名册里抽，最后一关固定 ────────────────────────────
/**
 * 十二个人配四关太薄：一趟只见到三分之一的名册，而且每趟见到的是同一批。
 * 改成六关，**前五关按难度带从名册里抽**、最后一关固定牛魔王。
 *
 * 随机是重复游玩的理由，固定收尾让「通关」仍然是同一件事——
 * 也保住已经量过的那个结论：四个人分别当最终关时，通关率极差是 10/35/20/**20** 点，
 * 牛魔王这个收尾最平（见 pickFairness 的注释）。
 *
 * 抽取是**纯函数**（种子 + 玩家角色 → 六关），不碰 Math.random：
 * 同一趟里刷新页面、重进关卡都必须是同一批对手，而且这件事要可回归。
 */
const RUN_LEN = 6;
export const FINAL_BOSS = 'niumo';

/** 六档难度。react 逐关不降，这条次序不变量被破坏过两次，每次都在某个套路上开了洞。
 * 中间两档是从既有的 lv2/lv3 派生的：只动 react（它是难度的主要来源），
 * 权重表照抄——凭空写两张新表等于把四关调了几十轮的经验丢掉。 */
export const RUN_AI: AiProfile[] = [
  STAGES[0].ai,
  STAGES[1].ai,
  { ...STAGES[1].ai, name: 'lv3', react: 0.32 },
  STAGES[2].ai,
  // lv5 不再只是"lv3 换个 react"：回避收成显式输入之后，**react 越高的档丢的顺手回避越多**
  // （反应多 → 进格挡多 → 旧契约下顺手滚的机会也多），这一档因此凭空松了 8 点、
  // 反而比 关4 还好打。补的是近身压迫而不是回避权重——实测把 roll 从 1 抬到 3
  // 会让 关4 从 43% 松到 47%：滚一次就少打一拍，回避对 AI 是减压不是加压。
  { ...STAGES[2].ai, name: 'lv5', react: 0.5,
    near: { attack: 8, block: 3, super: 2, retreat: 2, roll: 1, blowback: 1 } },
  STAGES[3].ai,
];
/**
 * 逐关的 BOSS 血量/伤害倍率。**六关之后一处数值加成都不留**，难度全部来自招式权重。
 *
 * 四关时代最终关给过 1.1 倍血，理由是行为旋钮已经用尽（加压/加耐心/对空率全都无效或反效，
 * 见 BOSS_HP_SCALE 那段）。六关把这个前提改掉了：阶梯本身长了两级、坡度已经够，
 * 最终关不必再独自扛难度。实测（每关 120 场，SE≈5）：
 *   ×1.1  关1 74% 关2 62% 关3 53% 关4 45% 关5 36% 关6 **13%**　落差 12 9 8 9 **23**
 *   ×1.0  同上五关不变，关6 **20%**　　　　　　　　　　　　落差 12 9 8 9 **16**
 * 前五关是 8~12 点的匀速下坡，末关那一档 23 点是**断崖**不是台阶；去掉血量加成之后
 * 收到 16 点，仍然是最陡的一级（最终关本来就该最难），但接得上前面的坡。
 */
export const RUN_HP_SCALE = [1, 1, 1, 1, 1, 1];
export const RUN_DMG_SCALE = [1, 1, 1, 1, 1, 1];

/** 与 ai.ts 同一份实现。放在这里是为了不让 data 依赖 engine 的内部工具 */
function rng32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * 生成一趟的六关。
 *
 * @param playerId 玩家选的角色——**不会在前五关出现**（打自己没意思，
 *                 而且镜像对局的手感与别的对位差得远）；最终关仍可能是镜像（牛魔王选牛魔王），
 *                 那一格是量过的（45%）。
 * @param seed     这一趟的种子。同种子必得同一批对手。
 */
export function buildRun(playerId: string, seed: number, roster: readonly { id: string }[]): Stage[] {
  const pool = roster.map(c => c.id).filter(id => id !== playerId && id !== FINAL_BOSS);
  const rnd = rng32(seed);
  // Fisher-Yates：抽而不放回，一趟里不会连着打同一个人两次
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  const picks = pool.slice(0, RUN_LEN - 1);
  // 名册不够时（比如测试里塞一个很短的 roster）回落到重复利用，别让阶梯短掉
  while (picks.length < RUN_LEN - 1) picks.push(pool[picks.length % Math.max(1, pool.length)] ?? FINAL_BOSS);
  return [...picks, FINAL_BOSS].map((bossId, i) => ({
    name: HOME[bossId]?.name ?? HOME[FINAL_BOSS].name,
    bossId,
    ai: RUN_AI[i],
    bg: HOME[bossId]?.bg ?? HOME[FINAL_BOSS].bg,
  }));
}

// ── 难度档 ──────────────────────────────────────────────────────────
/**
 * 三档难度。标准档就是这几十轮调出来的那条曲线，另外两档在它两侧各让一步。
 *
 * 为什么要有：标准档的末关是 15%、六关连过 0.8%——这是给「练熟了再来」的人调的，
 * 而第一次上手的人在第四关就会卡死。街机厅有投币续关，手机上没有，
 * 那就把这个选择交给玩家。
 *
 * 三个旋钮一起动，因为**单动 react 分不开档**（实测 react -0.12 也只把末关从 15% 抬到 19%，
 * 对空饱和那堵墙挡在那儿）。血量与伤害是玩家真正感觉得到的两项。
 * 实测（12 角色 × 4 种子、每关独立量）：
 *   轻松  96/85/79/83/71/52　六关连过 19.8%
 *   标准  75/63/60/48/40/15　六关连过 0.8%
 *   修罗  52/23/27/27/13/2 　六关连过 0.0%
 */
export interface Difficulty { name: string; hint: string; reactOff: number; hp: number; dmg: number }
export const DIFFICULTIES: Difficulty[] = [
  { name: '轻松', hint: '对手看得慢一点，打得轻一点', reactOff: -0.08, hp: 0.92, dmg: 0.86 },
  { name: '标准', hint: '不放水，也不加码', reactOff: 0, hp: 1, dmg: 1 },
  { name: '修罗', hint: '对手更会读招，也更耐打', reactOff: 0.10, hp: 1.05, dmg: 1.08 },
];
/** 最高难度档的下标。真结局挂在它上面（见 CharacterDef.endingHard），
 * 别在两处各写一个 2——档位增减时那两个数迟早对不上 */
export const HARDEST_DIFF = DIFFICULTIES.length - 1;

export const DEFAULT_DIFFICULTY = 1;

/** 把难度档套到一关上。react 夹在 [0.05, 0.95]——两头都要留出"还会猜错"的余地 */
export function applyDifficulty(st: Stage, d: Difficulty): Stage {
  return { ...st, ai: { ...st.ai, react: Math.max(0.05, Math.min(0.95, (st.ai.react ?? 0.3) + d.reactOff)) } };
}
