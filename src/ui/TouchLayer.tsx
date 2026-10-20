import { useEffect, useRef, useState } from 'react';
import { TECH_WINDOW, canTaunt } from '../engine/battle';
import { T } from './theme';
import type { Battle } from '../engine/battle';
import type { Fighter, MoveSlot } from '../engine/types';
import { ARENA_MAX, ARENA_MIN, CORNERED } from '../engine/types';
import { clearHeld, press, type Held } from './input';
import { isOriginalFighterId } from '../data/goats';
import { t, type StringKey } from '../i18n';

/** Key-face fallbacks are English ids; the shown text follows the interface language. */
const FALLBACK_TEXT: Record<string, StringKey> = { ATTACK: 'touch.attack', GUARD: 'touch.guard', SKILL: 'touch.skill', ULT: 'touch.ult', BURST: 'touch.burst' };

/**
 * slot 为 null 的键不对应某一个招式（格挡是状态不是招；大招按 meter 在 sp50/sp100 间切）。
 *
 * 这里原来写着"尺寸与坐标不能动：App.tsx 里 MuteButton 的 top=168 是按这个按键簇的包围盒
 * （right 20–196 / bottom 16–152）算出来的"——那句话早就不成立：
 * App 里那颗静音键是 `top={10}`（在屏幕最顶上，按键簇在最底下，两者根本不相干）。
 * 一条过时的"不能动"比没有注释更糟：它会让人以为这些坐标背着别处的依赖。
 *
 * **包围盒不再往注释里抄。** 上一版这里写的是 "right 20–252 / bottom 16–286
 * （格挡键伸到 252、吹飞键伸到 286）"，四个数和两个归属全是错的——按下面这张表算，
 * 实际是 right 12–240（最外沿是**吹飞** 176+64）、bottom 14–216（最高是**技能键** 140+76）。
 * 一段"用来纠正过时注释"的注释自己又过时了，正说明这类数不该手抄：要用就现算，见 CLUSTER_INSET。
 *
 * 真正的约束由 `tests/touchLayout.test.ts` 守着：五颗键两两不重叠、间隙与键径有下限，
 * 静音键在 320~1024 的屏高范围内都不压到这个簇上，
 * 以及每一颗都落在拇指够得到的半径内。改坐标以那几条为准。
 */
/**
 * 右手键位。**五颗**，不是七颗。
 *
 * 七颗那版的问题量得出来：最小间隙只有 **4.1px**（技三与大招之间），最小键径 54px——
 * 拇指接触面直径通常 45-57px，两颗键之间只隔 4px 时误触是必然的，
 * 而按错的代价是最重的那种：想放技三，按出大招，50-100 气当场蒸发。
 *
 * 减掉的两颗是**三颗技能键合成一颗**：按下的那一刻由摇杆方向决定放哪一招
 *（中立=技一、推方向=技二、下=技三）。这是格斗游戏本来的语法——方向+按键，
 * 不是给每一招配一颗键；键位表也因此从"记三个位置"变成"记一条规则"。
 *
 * 位置是搜出来的（爬山法）：在三条约束下最大化最小间隙——
 *   ① 用得多的离拇指近（攻击 r≈94、防御/技能 r≈160-180、大招/吹飞 r≈225-240）
 *   ② 全部落在拇指够得到的半径 240 内
 *   ③ **簇顶离屏底不超过 212px**——这条不是人体工学，是和静音键的约定：
 *      320px 屏高（横屏 iPhone SE）时簇再高就会顶到那颗键上（touchLayout 那条断言守着）
 * 结果：最小间隙 **10.4px**（原来 4.1px），最小键径 64px（原来 54px）。
 * 这两个数按 BTN 表算得出来，别手改：吹飞后来从 58 放大到 64，这行一度还写着 58。
 * 最挤的一对是格挡/吹飞——吹飞是全场按得最少的一颗（实测 0.8 次/回合），
 * 让它退到最远、也最小，换其余四颗宽敞，是这一组约束下最划算的分配。
 */
export const BTN: { key: keyof Held; slot: MoveSlot | null; fallback: string; size: number; right: number; bottom: number }[] = [
  // 兜底名从「连击」改成「普攻」：教学文案早已统一叫「普攻」（见 docs/engine-notes.zh-CN.md
  // 「屏幕上一件东西只能有一个名字」），只有这颗键的兜底还留着第三个名字。
  // 平时看不见——有 slot 的键面写的是角色招式名——但少一个名字总是好的。
  { key: 'attack', slot: 'n1', fallback: 'ATTACK', size: 88, right: 16, bottom: 24 },
  { key: 'block', slot: null, fallback: 'GUARD', size: 72, right: 118, bottom: 14 },
  // slot 由摇杆方向决定，这里给 null，标签走 skillSlotFor + buttonView 的专门分支
  { key: 'skill1', slot: null, fallback: 'SKILL', size: 76, right: 14, bottom: 132 },
  // 上排跟下排走同一条弧：拇指支点在右下角，越往左够到的位置越低。
  // 下排本来就是对的（连击 v=74 → 防御 v=52，往左递减），上排却是**平的**
  // （技能 v=171、大招 v=169），于是整块读成一个方阵而不是一把扇面——这是"布局有点怪"的形。
  // 大招下移之后 v 序列成了 171 → 160 → 111（吹飞），与下排同向。
  // 下移量由「与吹飞至少留 10px」卡死：再多挪 2px 就只剩 8px，一根拇指压两颗键。
  { key: 'super', slot: null, fallback: 'ULT', size: 80, right: 108, bottom: 126 },
  // 吹飞攻击在键盘上是攻击+防御同按，触屏上一根拇指按不到两颗键，所以这是 CD 的唯一入口。
  // 它曾是全盘最小的一颗（58），而**它是 CD 在触屏上的唯一入口**——键盘的「攻击+防御同按」
  // 一根拇指做不到。上一次想放大失败，原因其实是我把它**挪**出了 240px 的拇指半径（实测 242）；
  // 放大本身不动圆心，够不够得到跟尺寸无关。所以这次原地长大，改让上排两颗让开间距。
  // 2026-10: respaced so every pair keeps ≥15.7px (was 10.4px; the translucent rings read as overlapping)
  // while every centre stays inside the 240px thumb reach. Searched, not hand-tuned: see touchLayout.test.
  { key: 'blowback', slot: null, fallback: 'BURST', size: 60, right: 182, bottom: 78 },
];

/** 按键簇最左那颗离屏幕右缘多远，再留 10px 的余量。
 *
 * **从 BTN 算，不要手抄。** 这个数原来是两处各写一遍的字面量 250（提示条一份、陪练挡位条
 * 一份），而那两份都是照着「吹飞 right 176 + size 64 = 240，加 10」心算出来的。
 * 键表一改，两个字面量都不会动，也不会有任何报错——正是这个仓库栽过四次的那种漂移，
 * 而且当时只有其中一份被断言盯着。 */
export const CLUSTER_INSET = Math.max(...BTN.map(b => b.right + b.size)) + 10;

/**
 * 「在按键簇左边那条带子里居中」。压在对局画面上的浮层都用它——提示条、陪练场的挡位条。
 *
 * 按视口中线居中是不行的：窄屏上浮层会伸进右下角那簇键，实测提示条与「防御」重叠
 * 49x40px(568x320)、23x24px(667x375)，陪练挡位条更狠（「后羿」压住超必杀 18x24px、
 * 「猪八戒」压住吹飞 56x7px，而挡位条画在按键之后、盖住的是**触摸区**）。
 * 左右各给一个边界、再交给 margin auto 分摊：空间够就是居中，不够就自己让开，
 * 中间没有断点跳变，宽屏上也只是往左挪一点。
 *
 * 冻起来：它是导出的共享对象，两个调用点都是 spread，但没有任何东西**强制**这一点。
 * 谁写成 `const s = LEFT_OF_CLUSTER; s.top = 60` 就会同时挪走提示条和挡位条，
 * 而症状（提示条突然跑到屏幕顶上）指向的地方离改坏它的那个文件很远。
 */
export const LEFT_OF_CLUSTER: React.CSSProperties = Object.freeze({
  position: 'fixed',
  // 左边界不写 0：568x320 上这条带子刚好被文字填满，会贴着屏幕左沿（还会压进刘海）
  left: 'calc(10px + env(safe-area-inset-left, 0px))',
  right: `calc(${CLUSTER_INSET}px + env(safe-area-inset-right, 0px))`,
  // 不写 maxWidth: '100%'：position:fixed 下百分比相对**视口**解析，而 left/right 已经把
  // 宽度卡在 100vw-260 上，比 100vw 严得多——那一行从来没约束过任何东西，留着只会让人
  // 以为它在管事（实测带宽 568→308px、932→520px，都不是 100vw）
  marginInline: 'auto', width: 'fit-content',
});

/**
 * 摇杆方向 → 这一按放哪一招。方向+按键是格斗游戏本来的语法，
 * 三颗键换成一颗之后，玩家要记的从"三个位置"变成"一条规则"。
 *
 * 刻意**不分前后**（不看朝向）：前后由角色面朝哪边决定，而面朝会在对手跳过头顶时翻转，
 * 同一个手势在翻转前后放出不同的招，是最难受的一类不确定。中立/横推/下推三档，
 * 手上怎么推、屏幕上就出什么。
 */
/**
 * 摇杆方向判定，**带回差**（迟滞）：没推出去时要越过 ON 才算推，推出去之后要收回到 OFF 才算松。
 *
 * 单阈值的问题在拇指按在阈值上时才显出来：dx 在 ±20 附近抖一下，left 就 true/false 连续翻。
 * 走路时这只是脚下微抖，看不出来；**回避改成读方向的按下边沿之后就不一样了**——
 * 抖一次就是新按一次方向，握着格挡的手会莫名其妙滚出去，而回避的收尾是没有无敌的
 *（见 roll.test 那一组）。触屏没有键盘那种干净的按下/抬起，回差就是这里的"按键"。
 *
 * 蹲下同理：lowGuard 跟着 crouch 走，抖动会让站防/蹲防在挨打那一刻反复横跳。
 */
export const STICK_ON = 20, STICK_OFF = 12;
export const STICK_DOWN_ON = 35, STICK_DOWN_OFF = 26;
export function stickDirs(dx: number, dy: number, prev: { left: boolean; right: boolean; crouch: boolean }):
  { left: boolean; right: boolean; crouch: boolean } {
  return {
    left: dx < -(prev.left ? STICK_OFF : STICK_ON),
    right: dx > (prev.right ? STICK_OFF : STICK_ON),
    crouch: dy > (prev.crouch ? STICK_DOWN_OFF : STICK_DOWN_ON),
  };
}

export function skillSlotFor(dir: { left: boolean; right: boolean; crouch: boolean }): 's1' | 's2' | 's3' {
  if (dir.crouch) return 's3';
  if (dir.left || dir.right) return 's2';
  return 's1';
}

/** 招式名压到按钮上：取间隔号前的一段，仍超过 4 字再取前 3。
 * 「风火轮·升龙」→风火轮、「筋斗云突袭」→筋斗云、「哮天犬突袭」→哮天犬——每一个都还是
 * 一件看得懂的东西。原来这三颗键叫「技1/技2/技3」，是按引擎的槽位序号命名的，玩家没有
 * 任何办法知道按下去会发生什么，而招式名在数据里一直现成躺着。 */
export function shortName(full: string): string {
  // English names ("Red Comet", "Knuckle Shot") wrap onto two lines inside the button; cutting them to
  // three letters left "Red" / "Knu", which names nothing.
  if (/^[\u0000-\u024F\s]+$/.test(full)) return full;
  const head = full.split('·')[0];
  return head.length > 4 ? head.slice(0, 3) : head;
}

/** 一颗按键该显示成什么样，从战斗状态纯函数算出来。
 * 抽成纯函数是为了能测：TouchLayer 本体带 hooks，脱离渲染器调用不了，而这里的
 * 「招式名怎么截、冷却扇形转多少、大招显示哪一档」正是这版改动的全部行为。 */
export function buttonView(
  b: { key: keyof Held; slot: MoveSlot | null; fallback: string },
  f: { def: { id?: string; moves: Record<MoveSlot, { id: string; name: string; cooldown: number }> }; meter: number; cooldowns: Record<string, number> },
  /** 技能键专用：当前摇杆方向选中的那一招。按下去会出什么，键面上就写什么——
   * 三合一之后这个反馈是必须的，否则玩家按之前不知道自己选中了哪一招 */
  skillSlot?: MoveSlot,
): { label: string; cooling: number; tone: string | null; ready: boolean } {
  if (b.key === 'skill1' && skillSlot) return buttonView({ ...b, slot: skillSlot }, f);
  if (b.key === 'super') {
    // 大招键其实是两招。此前只有边框颜色在银/金之间变，没有任何文字说明按下去放的是哪一档
    const goat = isOriginalFighterId(f.def.id || '');
    if (f.meter >= 100) return { label: goat ? t('touch.max') : '超必杀', cooling: 0, tone: T.tenghuang, ready: true };
    if (f.meter >= 50) return { label: goat ? t('touch.super') : '奥义', cooling: 0, tone: '#C9CEE0', ready: true };
    return { label: goat ? t('touch.super') : '大招', cooling: 0, tone: null, ready: false };
  }
  const mv = b.slot ? f.def.moves[b.slot] : null;
  if (!mv) return { label: FALLBACK_TEXT[b.fallback] ? t(FALLBACK_TEXT[b.fallback]) : b.fallback, cooling: 0, tone: null, ready: true };
  // cooldowns 里存的是剩余帧，引擎每逻辑帧递减。之前按钮对冷却毫无表示，按下去没反应
  // 也不知道为什么——这是这版交互里代价最低、收益最大的一处补齐。
  const left = mv.cooldown > 0 ? (f.cooldowns[mv.id] ?? 0) : 0;
  const cooling = left > 0 ? Math.min(left / mv.cooldown, 1) : 0;
  return { label: shortName(mv.name), cooling, tone: null, ready: cooling === 0 };
}

/** 触屏提示条：跑/回避/受身/蓄气这些系统全在引擎里，手机上没有任何线索能发现它们。
 * 这一条按当前局势只显示"此刻最该知道的那一条"，不是常驻说明书。 */
/** 这一帧该显示哪条提示。抽成纯函数是为了能按真实对局的状态分布统计每条的出现率——
 * 提示条是玩家发现这十几个系统的主要路径，某条常年霸屏、另一些从不出现的话，
 * 那些系统对玩家就等于不存在。返回空串表示不显示。 */
/** 空闲时轮播的教学短句。原来是一行把三个系统挤在一起的长句
 * （"双击方向 = 跑 / 后跳　防+下 = 蹲防　防+大招 = 蓄气"），密到没人会读；
 * 拆成几条短的轮流出，每条都读得完。 */
/**
 * 空闲轮播。**这是没翻过帮助页的人发现这十几个系统的唯一通道**——
 * 屏幕上就五颗键，一颗键在这里没被提过，玩家多半一整趟都不知道它做什么。
 * 「吹飞」此前正是这种：它占着五分之一的屏幕，而轮播里一次都没提过它。
 */
export const IDLE_TIPS = [
  '双击前进 = 跑　双击后退 = 后跳',
  '防御 + 下 = 蹲防　站防才挡跳跃攻击',
  '连击第二段是下段扫堂，站防挡不住',
  '普攻命中后再按一下接下一段，按技能／大招取消',
  '防御 + 大招 = 蓄气　50 气爆气顶开',
  '吹飞 = 必倒且不能受身　打空了收招很久',
  '轻点上 = 小跳　按住 = 大跳',
  '贴身按普攻 = 投技　挡不住，但可挣脱',
];
/** 每条停留多久（逻辑帧）。3 秒——够读完一句，又不至于半局只看得到一条。
 * 挂 battle.frame 而不是墙钟：这个项目在"按渲染帧推进本该按逻辑帧走的量"上栽过三次 */
const TIP_HOLD = 180;

/** 这一帧该显示哪条提示。抽成纯函数是为了能按真实对局的状态分布统计每条的出现率——
 * 提示条是玩家发现这十几个系统的主要路径，某条常年霸屏、另一些从不出现的话，
 * 那些系统对玩家就等于不存在。 */
/** 回合刚开始的那一小段。气槽跨回合保留（见 battle.carryOverMeter），
 * 第二回合一开场就有大半管气——不说一句的话玩家会以为是白送的 */
const ROUND_OPEN = 150;
/** 少于这个数就不提了：带过去三五点气不值得占一条提示 */
const CARRY_WORTH = 25;

/**
 * training：陪练场。那里的气是 App 每帧灌满的（见 Fight 的 onTick），不是打出来的，
 * 于是两条跟气有关的提示都在说谎——「上一回合攒下的」那里根本没有上一回合，
 * 「气槽已满」则恒为真，而它的级别高过轮播，会把提示条**永久钉死在同一句上**。
 * 陪练场恰恰是玩家待得最久、最该把十几个系统轮播一遍的地方。
 */
export function hintFor(me: Fighter, frame = 0, training = false, foe?: Fighter): string {
  // 倒地分三种情形，此前只写了一条、而且写错了两处：
  //   ① 判据是 stateFrame <= 14，与受身窗口**一样长**（0.23 秒）——一条讲反应窗口的提示，
  //      显示时长正好等于那个窗口，读到的时候已经错过了。提示是教学，不是实时按键指令，
  //      所以窗口过了继续讲完（改成整段倒地都显示）。
  //   ② 不看 techable。实测 56% 的击倒是硬直击倒（大招/投技/吹飞），
  //      那时提示还在叫玩家按键，按了没反应——比不提示更糟。
  if (me.state === 'down') {
    // 「不能受身」的三种来源里只有投技留了出路：被抓住前的一瞬新按普攻就能挣脱
    //（escapeAge，12 帧窗口）。混进"只能躺满"那一句里，等于把唯一的出路也说成没有。
    // 实测被投 4.0 次/回合、挣脱只有 0.4 次——玩家在对局里根本不知道有这条路。
    if (me.downByThrow) return '被投了　被抓住前的一瞬新按 普攻 能挣脱（按住不放无效）';
    if (!me.techable) return '大招 / 吹飞 打倒的不能受身，只能躺满';
    if (me.stateFrame <= TECH_WINDOW) return '快按 普攻 或 防御 —— 受身起身';
    return '刚才那一下可以受身：倒地的那一瞬新按一次 普攻 或 防御';
  }
  // 防御取消现在有两条出路，而触发这条提示的那一刻**两条都能走**。
  // 只讲顶开等于把回避那条藏起来了——按处境讲对应的那条，判据与 ai 用同一个 CORNERED
  if (me.state === 'block' && me.stun > 0 && me.meter >= 50) {
    const wall = me.x - ARENA_MIN < CORNERED || ARENA_MAX - me.x < CORNERED;
    return wall
      ? '被压在版边　防御取消·推方向 = 滚到背后（50 气）'
      : '防御取消　按 普攻 = 顶开　推方向 = 滚到背后（50 气）';
  }
  // 被压在版边、而人正举着防御——**这才是被压制时最常见的姿势**。
  // 下面那条「被逼到版边」此前只认 idle/walk，于是最需要它的姿势恰好读不到：
  // 和回避这条机制当初犯的是同一个错（只写在 idle/walk 分支里，挡着时按不出来，
  // 见 InputFrame.roll）。机制补好了，教学也得跟着补，否则等于没补。
  // 判据要求 stun <= 0：格挡硬直里免费回避是出不来的（那时走上面那条花 50 气的），
  // 提示不能教一个此刻按不出来的东西。
  if (me.state === 'block' && me.stun <= 0
    && (me.x - ARENA_MIN < CORNERED || ARENA_MAX - me.x < CORNERED)) {
    return '被逼到版边　防御 + 方向 = 回避，可从对手身上滚过去';
  }
  // 上下段比防御取消更基础，但只在"正防着又没被压住"时提示，免得和上面那条抢
  if (me.state === 'block') return me.lowGuard ? '蹲防 · 挡下段，挡不住跳跃攻击' : '站防 · 挡跳跃攻击，挡不住下段';
  // 开场那条排在**限时提示之后**：它只是说明，等得起。
  // 第一版把它放在整条判断链最前面，结果回合开头 150 帧里倒地受身、防御取消
  // 这些限时窗口的提示全被它压住——而那正是最不能等的两条。
  // 挑衅的窗口几乎全在"把对手打倒之后"那几十帧里（实测 10.7 次/回合的机会绝大多数来自这里），
  // 而那正是玩家在想"现在该干嘴"的时刻。放进轮播就成了随机出现的说明书，
  // 教学要落在**按得出来的那一刻**。判据直接用引擎那条闸门，不另写一份（同 CORNERED 的做法）
  if (foe && canTaunt(me.state, Math.abs(foe.x - me.x), foe.state,
    me.cooldowns[`${me.def.id}_taunt`] ?? 0) && foe.state === 'down') {
    return '对手倒地　防御 + 上 = 挑衅，削 10 气';
  }
  // 另一半窗口：**隔着大半个场子**（canTaunt 的 gap > TAUNT_SAFE 那一支）。
  // 此前只教倒地那一种，而那一种恰恰是**要赌的**——挑衅 47 帧、倒地才 52 帧，
  // 对手受身就能提前爬起来punish（AI 随机抽中这一手时实测被打出过 70% 血的连段，
  // 见 aiTaunt 那一组）。隔得远这一支够不着，是白削 10 气，反而没教。
  // AI 现在也只在这个距离上挑衅，玩家看得见、也该学得到同一手。
  if (foe && foe.state !== 'down'
    && canTaunt(me.state, Math.abs(foe.x - me.x), foe.state, me.cooldowns[`${me.def.id}_taunt`] ?? 0)) {
    return '离得远够不着　防御 + 上 = 挑衅，白削 10 气';
  }
  if (!training && frame < ROUND_OPEN && me.meter >= CARRY_WORTH && me.state !== 'attack') {
    return `上一回合攒下的 ${me.meter} 气带过来了 · 满 100 可放超必杀`;
  }
  if (me.maxMode > 0) return 'MAX 状态 · 伤害提升';
  if (!training && me.meter >= 100) return '气槽已满 · 连击第二段命中后按大招最赚';
  // 贴墙时优先教回避：它是版边压制唯一的出口（能从对手身体里滚过去换到背后），
  // 而这一条只在真的被逼到墙角时才有意义，常驻反而挤掉别的提示
  if ((me.state === 'idle' || me.state === 'walk')
    && (me.x - ARENA_MIN < CORNERED || ARENA_MAX - me.x < CORNERED)) return '被逼到版边　防御 + 方向 = 回避，可从对手身上滚过去';
  // 兜底无条件显示。原来只覆盖 idle/walk，实测 58% 的帧是空的——
  // 出招、受击、跑、跳都不显示，提示条于是一直在闪，教学这条通道白白空着一多半
  return IDLE_TIPS[Math.floor(frame / TIP_HOLD) % IDLE_TIPS.length];
}

/**
 * 一条提示至少要站住多少帧才能被换掉。
 *
 * 不加这个的话提示条是在**频闪**而不是教学——实测（16 分钟对局）：
 *   站防/蹲防 那两条出现 305 / 265 段，**平均每段 5 帧和 4 帧**（0.08 秒）
 *   「被逼到版边」出现 233 段，平均 10 帧
 * 出现几百次、每次不到 0.1 秒，没有任何一次读得完。
 * 50 帧 ≈ 0.83 秒，够扫完一句短句。
 */
export const HINT_MIN_HOLD = 50;

/** 提示的轻重。更要紧的可以立刻打断正在显示的，同级或更轻的得等它站完。
 *
 * 顶层是**限时窗口的实时提示**：受身只有 14 帧、防御取消只有 6 帧格挡硬直，
 * 等不起——它们必须能插队。这一条是补上去的：只把受身放进顶层时，
 * 实测「防御取消」那条 hintFor 想显示 40 帧、被最短停留压得**一帧都没显示出来**
 *（当时正显示着同级的站防/蹲防还没站完）。加最短停留反而把一条提示整个压没了。
 *
 * 中层是其余情境提示（彼此频闪才是要治的病），轮播垫底。 */
export function hintRank(text: string): number {
  // 「受不了身」那一条不再单列：文案统一成「不能受身」之后它已经被 '受身' 这一支覆盖，
  // 留着只是一条永远为假的判断
  if (text.includes('受身') || text.includes('防御取消')) return 3;
  return IDLE_TIPS.includes(text) ? 1 : 2;
}

/** 提示条的状态推进。纯函数：给上一帧的状态和这一帧「想显示什么」，返回这一帧真正显示什么。
 * 抽出来是为了能直接测「频闪」这件事，而不必去驱动一个组件。 */
export function nextHint(cur: { text: string; left: number }, want: string):
  { text: string; left: number } {
  if (want === cur.text) return { text: cur.text, left: Math.max(0, cur.left - 1) };
  // 更要紧的立刻插进来。倒地那一组（rank 3）内部也要能互相替换：
  // 「快按…受身」和「刚才那一下可以受身」是**同一件事的两个阶段**，不是互相竞争的两条——
  // 不让它们互换的话，窗口过了还会被最短停留按着继续显示「快按」，
  // 又变回"提示在骗人"（那正是上一轮刚修掉的毛病）。
  const canCut = hintRank(want) > hintRank(cur.text)
    || (hintRank(want) === 3 && hintRank(cur.text) === 3);

  if (cur.left > 0 && !canCut) return { text: cur.text, left: cur.left - 1 };
  return { text: want, left: HINT_MIN_HOLD };
}

function HintBar({ battle, training }: { battle: Battle; training?: boolean }) {
  // 最短停留按**逻辑帧**扣，不按重绘次数。
  // 别照重绘次数扣：这个组件的重绘频率**没有上限**——除了 TouchLayer 那个 100ms 的
  // interval，摇杆一动 onPointerMove 就 setStick，触屏上每秒能重绘 60-120 次。
  //（这句先后写错过两次：先写成"每 200ms 重绘一次"，那是 screens.tsx 里 RoundScore 的
  //  interval；改成 100ms 仍然是错的，它只是其中一个来源，不是上限。）
  // 所以记住上次看到的 battle.frame，补扣中间过去的那些帧——多出来的重绘因此是幂等的，
  // 这正是本文件反复警告的"别拿渲染帧推进逻辑量"。
  const st = useRef({ text: '', left: 0, seen: 0 });
  const want = hintFor(battle.p1, battle.frame, training, battle.p2);
  const elapsed = Math.max(0, Math.min(battle.frame - st.current.seen, HINT_MIN_HOLD * 4));
  let cur = { text: st.current.text, left: st.current.left };
  for (let i = 0; i < elapsed; i++) cur = nextHint(cur, want);
  if (elapsed === 0 && !cur.text) cur = { text: want, left: HINT_MIN_HOLD };
  st.current = { ...cur, seen: battle.frame };
  const text = cur.text;
  if (!text) return null;
  return (
    <div style={{
      ...LEFT_OF_CLUSTER,   // 让开右下角按键簇，见那上面的注释
      bottom: `calc(10px + env(safe-area-inset-bottom, 0px))`,
      // textWrap: pretty 避开孤字。窄屏上这条要折两行，而末行常常只剩一个字
      //（568x320 实测「…白削他 10 气」的"气"独占一行）——同 Select 详情面板那一处的做法。
      // 用词统一成「防御」之后每条都长了一点，这个问题从偶发变成常见
      padding: '5px 14px', fontSize: 12, letterSpacing: 1, textWrap: 'pretty',
      color: 'rgba(237,227,210,.78)', background: 'rgba(7,13,24,.62)',
      border: '1px solid rgba(237,227,210,.18)', pointerEvents: 'none', zIndex: 15,
    }}>{text}</div>
  );
}

export function TouchLayer({ held, battle, training, hideHints }: { held: Held; battle: Battle; training?: boolean; hideHints?: boolean }) {
  const [stick, setStick] = useState<{ ox: number; oy: number; x: number; y: number } | null>(null);
  const stickId = useRef(-1);
  const jumpArmed = useRef(true);
  const [, force] = useState(0);

  // 大招档位与技能冷却都要读引擎状态刷新按钮外观。这里只是「读」——冷却的推进在
  // battle.tick 的固定 1/60s 逻辑帧里（cooldowns[k]--），这个 interval 不推进任何计时量，
  // 换了刷新频率也不会改变冷却快慢，因此不属于本项目栽过四次的"按渲染帧推进逻辑量"。
  // 100ms：2 秒左右的冷却能扫出约 20 格，够顺；再快对 6 个 div 也无意义。
  useEffect(() => {
    const t = setInterval(() => force(v => v + 1), 100);
    // 卸载时清空本层能置位的所有 Held 标志，避免 Task 14 逐回合挂/卸载 TouchLayer 时
    // 卸载发生在按键中途，留下卡死的 true（和 pointercancel 是同一类问题）
    return () => {
      clearInterval(t);
      clearHeld(held);
    };
  }, [held]);

  const onStickMove = (x: number, y: number, ox: number, oy: number) => {
    const dx = x - ox, dy = y - oy;
    const d = stickDirs(dx, dy, held);
    held.left = d.left;
    held.right = d.right;
    if (dy < -35 && jumpArmed.current) { press(held, 'jump'); jumpArmed.current = false; }
    if (dy > -15) { held.jump = false; jumpArmed.current = true; }
    held.crouch = d.crouch;
    setStick({ ox, oy, x, y });
  };

  const releaseStick = () => {
    held.left = held.right = held.jump = held.crouch = false;
    jumpArmed.current = true;
    stickId.current = -1;
    setStick(null);
  };

  const me = battle.p1;

  return (
    <div
      style={{ position: 'fixed', inset: 0, touchAction: 'none' }}
      onPointerDown={e => {
        if (e.clientX < window.innerWidth / 2 && stickId.current === -1) {
          stickId.current = e.pointerId;
          setStick({ ox: e.clientX, oy: e.clientY, x: e.clientX, y: e.clientY });
        }
      }}
      onPointerMove={e => {
        if (e.pointerId === stickId.current && stick) onStickMove(e.clientX, e.clientY, stick.ox, stick.oy);
      }}
      onPointerUp={e => { if (e.pointerId === stickId.current) releaseStick(); }}
      onPointerCancel={e => { if (e.pointerId === stickId.current) releaseStick(); }}
    >
      {stick && (
        <>
          <div style={circle(stick.ox, stick.oy, 60, 'rgba(237,227,210,.07)')} />
          <div style={circle(
            stick.ox + clamp(stick.x - stick.ox, -40, 40),
            stick.oy + clamp(stick.y - stick.oy, -40, 40), 26, 'rgba(237,227,210,.22)')} />
        </>
      )}
      {!hideHints && battle.advancedCombat && <HintBar battle={battle} training={training} />}
      <div style={{
        position: 'absolute', top: 0, left: 0,
        right: 'env(safe-area-inset-right, 0px)',
        bottom: 'env(safe-area-inset-bottom, 0px)',
      }}>
        {BTN.filter(b => battle.advancedCombat || (b.key !== 'super' && b.key !== 'blowback')).map(b => {
          // 技能键的键面随摇杆方向实时变：推着下时写「风火轮」，松开写「烈焰突刺」
          const slot = b.key === 'skill1' ? skillSlotFor(held) : undefined;
          const { label, cooling, tone, ready } = buttonView(b, me, slot);
          // pointerup/leave/cancel 都要落回 false，否则中断的一次按下（来电、系统手势）会把
          // 标志卡在 true 上（block 永久格挡 / 其它键在下一 tick 因 prev 锁存而永久失灵）
          // 技能键按下的是三个标志之一，松手要三个一起清——按住时改推方向不换招
          //（招在按下的那一刻就定了，同真机上的格斗游戏），但松手若只清一个就会卡住另一个
          const release = () => {
            if (b.key === 'skill1') { held.skill1 = held.skill2 = held.skill3 = false; }
            else held[b.key] = false;
          };
          return (
            <div
              key={b.key}
              onPointerDown={e => {
                e.stopPropagation();
                press(held, b.key === 'skill1'
                  ? ({ s1: 'skill1', s2: 'skill2', s3: 'skill3' } as const)[skillSlotFor(held)]
                  : b.key);
              }}
              onPointerUp={release}
              onPointerLeave={release}
              onPointerCancel={release}
              style={{
                position: 'absolute', right: b.right, bottom: b.bottom,
                // border-box：2px 描边默认长在 size 之外，60px 的键实际占 64px，把
                // 风火轮与大招之间留的那 2px 间隙吃掉，两者的触摸区在角上叠了 2px。
                // 加上这条，声明的 size 就是实际占位，上面那张坐标表才算数
                boxSizing: 'border-box',
                width: b.size, height: b.size, borderRadius: '50%',
                // 冷却中的那一瓣压暗，随剩余帧收拢到零；从 -90deg 起扫，读法与钟面一致
                background: cooling > 0
                  ? `conic-gradient(from -90deg, rgba(8,12,20,.62) 0turn ${cooling}turn, rgba(237,227,210,.10) ${cooling}turn 1turn)`
                  : 'rgba(237,227,210,.10)',
                border: `2px solid ${tone ?? (ready ? T.hair : 'rgba(237,227,210,.12)')}`,
                boxShadow: tone ? `0 0 16px ${tone}` : 'none',
                // 冷却中压暗但仍要认得出是哪一招：faint(.55) 叠在扇形暗色上实测读不清，
                // 用 dim(.74)——比就绪态（paper）明显暗，又不至于看不见
                color: ready ? T.paper : T.dim,
                display: 'grid', placeItems: 'center', textAlign: 'center',
                fontSize: b.size >= 76 ? 14 : 12, lineHeight: 1.15, letterSpacing: 0.5,
                userSelect: 'none', touchAction: 'none',
              }}
            >
              {/* 折行宽度按字数给，不是一律 2.4em。那个宽度是键还只有 60px 时定的，
                  键涨到 76~88 之后仍然按两字一行折，三字招式（超必杀／一步扑／钉耙击）
                  就全被劈成「超必 / 杀」——一屏五颗键，三颗是断开的，这是整块看着挤的主因。
                  14px × 3 字 ≈ 44px，88px 圆的内接方约 59px，三字本来就放得下。
                  四字（如意金箍）仍然排 2×2：那才真的塞不进一行。 */}
              <span style={/^[\u0000-\u024F\s]+$/.test(label)
                ? { width: b.size - 18, fontSize: label.length > 6 ? 11 : undefined, fontWeight: 700, overflowWrap: 'anywhere' }
                : { width: label.length >= 4 ? '2.4em' : undefined, whiteSpace: label.length >= 4 ? undefined : 'nowrap' }}>{label}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));
const circle = (cx: number, cy: number, r: number, bg: string): React.CSSProperties => ({
  position: 'absolute', left: cx - r, top: cy - r, width: r * 2, height: r * 2,
  borderRadius: '50%', background: bg, pointerEvents: 'none',
});
