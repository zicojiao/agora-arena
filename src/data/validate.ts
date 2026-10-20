import type { CharacterDef, Move, MoveSlot } from '../engine/types';
import { MOTIONS } from './motions';
import type { StageBg } from './stages';
import { AI_ACTIONS } from '../engine/ai';

const SLOTS: MoveSlot[] = ['n1', 'n2', 'n3', 's1', 's2', 's3', 'sp50', 'sp100'];
const HEX6 = /^#[0-9a-fA-F]{6}$/;

export function validateCharacter(c: CharacterDef): string[] {
  const bad: string[] = [];
  // 台词放在角色数据里而不是 UI 侧的映射表：新增角色时忘了写，这里当场报错，
  // 而不是上线后发现某个对手打完一言不发
  const QUOTE_LABEL = { win: '胜', lose: '负', taunt: '挑衅', intro: '开场' } as const;
  // 每句台词各有各的坑位，宽度也各不相同：挑衅浮在头顶（最窄），开场那句排在关卡横幅
  // 第四行（居中一行，比头顶浮字宽、比结算页窄），胜/负两句在结算页。
  const QUOTE_MAX = { win: 18, lose: 18, taunt: 10, intro: 14 } as const;
  for (const k of ['win', 'lose', 'taunt', 'intro'] as const) {
    const q = c.quotes?.[k];
    if (!q) bad.push(`${c.id}: 缺${QUOTE_LABEL[k]}台词`);
    else if (q.length > QUOTE_MAX[k]) {
      bad.push(`${c.id}: ${k} 台词过长（${q.length} 字，上限 ${QUOTE_MAX[k]}），${QUOTE_LABEL[k]}那个坑位放不下`);
    }
  }
  // 头饰（大招特写那颗头上的那一件）。颜色直接进 ctx.fillStyle/strokeStyle，
  // 三位缩写画不出错、只会画成别的颜色——和 adorn 那批同一条约束
  if (c.crown && !HEX6.test(c.crown.color)) bad.push(`${c.id}: crown.color 必须是 6 位 #RRGGBB`);
  // 无头的人没有那颗头可画，配了也没处画——多半是抄别人的数据时顺手带进来的
  if (c.headless && c.crown) bad.push(`${c.id}: 无头角色不该配 crown`);
  // 定位这一行是玩家判断"这个人怎么打"的唯一入口，缺了就是一张没有理由被选的卡
  if (!c.role) bad.push(`${c.id}: 缺格斗定位`);
  else if (c.role.length > 8) bad.push(`${c.id}: 定位过长（${c.role.length} 字），选人页放不下`);
  const seenIds = new Set<string>();
  /**
   * 一记招式内部的帧号自洽：fx / dash / multiHit 都得落在**它自己的**窗口里。
   * 抽出来是因为大招还有一份**短演出**（Move.brief），它自带 startup/active/recovery
   * 和自己的 fx / dash / multiHit——引擎合并时是 `{ ...m, ...m.brief }`（battle 的 stagedMove），
   * 也就是说那是一套**完整替换**的帧数据，必须按合并后的窗口另测一遍。
   * 十二个人 × 两档大招 = 24 块短演出，此前一条校验都没走到过。
   */
  const checkFrames = (m: Move, label: string) => {
    const total = m.startup + m.active + m.recovery;
    for (const ev of m.fx) {
      if (ev.frame < 0 || ev.frame >= total) bad.push(`${m.id}${label}: fx frame ${ev.frame} 超出招式窗口 [0,${total})`);
    }
    if (m.dash) {
      if (m.dash.length === 0) bad.push(`${m.id}${label}: dash 数组不能为空`);
      const seen = new Set<number>();
      for (const d of m.dash) {
        if (d.frame < 0 || d.frame >= total) bad.push(`${m.id}${label}: dash frame ${d.frame} 超出招式窗口 [0,${total})`);
        if (seen.has(d.frame)) bad.push(`${m.id}${label}: dash frame ${d.frame} 重复`);
        seen.add(d.frame);
      }
    }
    if (m.multiHit) {
      const { hits, interval } = m.multiHit;
      if (hits < 2) bad.push(`${m.id}${label}: multiHit.hits 应 >= 2（否则不该用 multiHit）`);
      if (interval < 1) bad.push(`${m.id}${label}: multiHit.interval 应 >= 1`);
      // 跨度是 **(hits-1)×interval**，不是 hits×interval：引擎的门槛是
      // 「距上一段至少 interval 帧」（battle 的 `stateFrame - lastHitFrame < interval` ），
      // 第一段落在判定窗口开头，之后每段加一个 interval——n 段之间只有 n-1 个间隔。
      // 原来那条按 hits×interval 判，严了整整一个 interval。完整版余量大，看不出来；
      // 短演出（active 只有 85）当场卡住三处：红孩儿 sp50 8×11、铁扇 sp100、后羿 sp100——
      // 而 superConnect 那一组实测这 24 组**全都打满段**，可见卡住的是尺子不是数据。
      if ((hits - 1) * interval >= m.active) {
        bad.push(`${m.id}${label}: multiHit 跨度 (${hits}-1)×${interval}=${(hits - 1) * interval} 超出 active(${m.active})，后段永远打不出来`);
      }
    }
  };

  for (const s of SLOTS) {
    const m = c.moves[s];
    if (!m) { bad.push(`${c.id}: 缺招式 ${s}`); continue; }
    if (m.slot !== s) bad.push(`${m.id}: slot 不符`);
    if (m.damage <= 0 || m.startup < 1 || m.active < 1 || m.recovery < 1) bad.push(`${m.id}: 帧数/伤害非法`);
    if (!MOTIONS[m.motionId]) bad.push(`${m.id}: motionId ${m.motionId} 不存在`);
    // motionSeq：纯渲染层的多段编排，引擎不读，但坏数据会让 renderer 静默拿 MOTIONS.thrust
    // 兜底（看起来像随手换了个动作，而不是报错）——跟 motionId 一样在数据层就拦
    if (m.motionSeq) {
      if (m.motionSeq.length < 2) bad.push(`${m.id}: motionSeq 段数应 >= 2`);
      for (const seg of m.motionSeq) {
        if (!MOTIONS[seg.motionId]) bad.push(`${m.id}: motionSeq 段 motionId ${seg.motionId} 不存在`);
        if (seg.weight <= 0) bad.push(`${m.id}: motionSeq 段 weight 应 > 0`);
      }
    }
    if (s === 'sp50' && m.meterCost !== 50) bad.push(`${m.id}: sp50 耗气应为 50`);
    if (s === 'sp100' && m.meterCost !== 100) bad.push(`${m.id}: sp100 耗气应为 100`);
    if ((s === 's1' || s === 's2' || s === 's3') && m.cooldown <= 0) bad.push(`${m.id}: 技能应有 CD`);
    // stateFrame 在招式期间只跑 [0, startup+active+recovery)，越界的帧号永远不会触发（静默丢特效/位移）
    const total = m.startup + m.active + m.recovery;
    checkFrames(m, '');
    // 短演出是**整套替换**的帧数据（自带 startup/active/recovery 与 fx/dash/multiHit），
    // 引擎按 `{ ...m, ...m.brief }` 合并，所以要按合并后的窗口再验一遍
    if (m.brief) checkFrames({ ...m, ...m.brief } as Move, '(短演出)');
    // multiHit：hits*interval 必须落在 active 窗口内，否则后面几段永远打不出来——
    // 跟上面 fx/dash 帧越界同一类静默失效，只是这次是判定本身而不是特效/位移
    // carry 只在多段判定的中间段生效；负数会把对手朝出招者身后推，意图不明
    if (m.carry !== undefined && !(m.carry >= 0)) bad.push(`${m.id}: carry 必须 >= 0`);
    // 投射物：一整块手写数据，六个角色都有，而此前**一条校验都没有**。
    // 它的每一种写错法都是静默的——引擎那两处判定都是**严格相等**：
    //   生成：`f.stateFrame === projectile.spawnFrame`（battle.ts）
    //   回旋：`pr.age === projectile.back`
    // 帧号落在窗口外，那一发就永远不生成；back 大过 life，乾坤圈就再也不飞回来。
    // 不报错、不掉帧，只是招式名承诺的那件东西没有发生。
    if (m.projectile) {
      const p = m.projectile;
      if (p.spawnFrame < 0 || p.spawnFrame >= total) {
        bad.push(`${m.id}: 投射物 spawnFrame ${p.spawnFrame} 超出招式窗口 [0,${total})，这一发永远不生成`);
      }
      if (p.life <= 0) bad.push(`${m.id}: 投射物 life 必须 > 0`);
      if (p.damage <= 0) bad.push(`${m.id}: 投射物 damage 必须 > 0`);
      if (p.vx === 0) bad.push(`${m.id}: 投射物 vx 为 0，它不会飞出去`);
      if (p.w <= 0 || p.h <= 0) bad.push(`${m.id}: 投射物判定框 ${p.w}×${p.h} 是空的，永远打不中`);
      if (!HEX6.test(p.color)) bad.push(`${m.id}: 投射物 color 必须是 6 位 #RRGGBB`);
      // back 是"飞出这么多帧之后掉头"。它必须真的落在存活期内，否则回旋只是句空话
      if (p.back !== undefined) {
        if (p.back <= 0) bad.push(`${m.id}: 投射物 back 必须 > 0（0 = 不回旋，不要写出来）`);
        else if (p.back >= p.life) {
          bad.push(`${m.id}: 投射物 back ${p.back} >= life ${p.life}，它在掉头之前就消失了`);
        }
      }
    }
    if (m.multiHit) {
      const { hits, interval } = m.multiHit;
      if (hits < 2) bad.push(`${m.id}: multiHit.hits 应 >= 2（否则不该用 multiHit）`);
      if (interval < 1) bad.push(`${m.id}: multiHit.interval 应 >= 1`);
      if (hits * interval > m.active) {
        bad.push(`${m.id}: multiHit hits×interval(${hits * interval}) 超出 active(${m.active})，后段永远打不出来`);
      }
    }
    // cooldowns 以 move.id 为 key，同一角色内撞 id 会共用一个 CD 计时器（静默连坐）
    if (seenIds.has(m.id)) bad.push(`${m.id}: move id 重复`);
    seenIds.add(m.id);
  }
  if (c.hp <= 0 || c.speed <= 0) bad.push(`${c.id}: 基础属性非法`);
  // shade() 用 parseInt(hex.slice(1),16) 解析，3 位简写或 CSS 颜色名都会静默解析出垃圾值
  if (!HEX6.test(c.palette.main) || !HEX6.test(c.palette.accent)) bad.push(`${c.id}: palette 必须是 6 位 #RRGGBB`);
  // 兵器：长度为正，握点必须落在杆子上。渲染按 `len*(1-grip)` / `len*grip` 分前后两段
  //（renderer 的 drawWeapon），grip 跑到 [0,1] 之外会把握点算到杆子外面去，
  // 画出来是"手悬在兵器旁边"，而不报任何错
  if (c.weapon) {
    if (c.weapon.len <= 0) bad.push(`${c.id}: weapon.len 必须 > 0`);
    if (!(c.weapon.grip >= 0 && c.weapon.grip <= 1)) {
      bad.push(`${c.id}: weapon.grip ${c.weapon.grip} 不在 [0,1] 内，握点会落到杆子外面`);
    }
  }
  // 大招背光的花瓣：`(Math.PI*2)/petals` 分槽（mandorla），petals <= 0 会得到
  // 无穷大或负的槽角，整圈背光画不出来
  if (c.superAura && !(c.superAura.petals >= 1)) {
    bad.push(`${c.id}: superAura.petals 必须 >= 1，否则背光分不出槽`);
  }
  // 身上那层"活物"的颜色。**全都要 6 位**：飘带的渐变走 mix()（按 slice(1,3)/(3,5)/(5,7) 取通道）、
  // 余烬与气环走 hexAlpha（按 slice(1) 整体解析）——写成三位不会报错，
  // 会解析成**另一种颜色**（'#fff' → parseInt('fff',16)=4095 → rgb(0,15,255)），
  // 而 mix() 更直接得到 NaN。palette 与 superGlow 早就守着这条，adorn 这一层漏了。
  // 对手专属台词（胜/负两套）：键必须是真角色 id，长度与通用台词同一条上限。
  // 拼错 id 不报错也不崩，只是那一句永远不会出现——回落到通用那句，静默。
  // vsIntro 也在这张网里，但它排在关卡横幅第四行、不在结算页，所以吃更紧的那条上限
  //（与 quotes.intro 同一个坑位，14 字）。三套用同一个循环，别各写一遍。
  for (const [field, table, max, where] of [
    ['vs', c.vs, 18, '结算页'], ['vsLose', c.vsLose, 18, '结算页'], ['vsIntro', c.vsIntro, 14, '开场横幅'],
    // 挑衅浮在头顶，是四个坑位里最窄的一个
    ['vsTaunt', c.vsTaunt, 10, '头顶浮字'],
  ] as const) {
    for (const [foeId, line] of Object.entries(table ?? {})) {
      if (!line) bad.push(`${c.id}: ${field}.${foeId} 是空的`);
      else if (line.length > max) bad.push(`${c.id}: ${field}.${foeId} 过长（${line.length} 字，上限 ${max}），${where}放不下`);
    }
  }
  // 打法偏置：键必须是**真的动作名**。这里是 `Record<string, number>`，
  // TypeScript 拦不住拼错——而拼错的后果是静默的：biased() 会把它当成一个新动作
  // 加进权重表，pick() 可能选中它，switch 里没有对应 case 也没有 default，
  // 于是 AI 站着发呆一整个决策窗（26~30 帧），每次抽到都发一次呆。
  if (c.aiBias) {
    for (const band of ['near', 'mid', 'far'] as const) {
      const t = c.aiBias[band];
      if (!t) continue;
      for (const [k, v] of Object.entries(t)) {
        if (!(AI_ACTIONS as readonly string[]).includes(k)) {
          bad.push(`${c.id}: aiBias.${band} 里的「${k}」不是有效动作名，AI 抽中它会呆立一个决策窗`);
        }
        if (!Number.isFinite(v) || v < 0) bad.push(`${c.id}: aiBias.${band}.${k} 必须是 >= 0 的有限数`);
      }
    }
  }
  // 投技的个人化参数：三项都得为正，否则这个角色的投技等于没有
  if (c.grapple) {
    const g = c.grapple;
    if (g.range <= 0) bad.push(`${c.id}: grapple.range 必须 > 0，否则永远抓不到人`);
    if (g.power <= 0) bad.push(`${c.id}: grapple.power 必须 > 0`);
    if (g.cd <= 0) bad.push(`${c.id}: grapple.cd 必须 > 0`);
  }
  const ad = c.adorn;
  if (ad) {
    for (const [i, sash] of (ad.sashes ?? []).entries()) {
      if (!HEX6.test(sash.color)) bad.push(`${c.id}: adorn.sashes[${i}].color 必须是 6 位 #RRGGBB`);
      if (sash.tip !== undefined && !HEX6.test(sash.tip)) {
        bad.push(`${c.id}: adorn.sashes[${i}].tip 必须是 6 位 #RRGGBB（渐变走 mix，三位会得到 NaN）`);
      }
      if (sash.segs <= 0 || sash.segLen <= 0 || sash.width <= 0) {
        bad.push(`${c.id}: adorn.sashes[${i}] 的 segs/segLen/width 必须 > 0`);
      }
    }
    if (ad.ember) {
      if (!HEX6.test(ad.ember.color)) bad.push(`${c.id}: adorn.ember.color 必须是 6 位 #RRGGBB`);
      // rise 可正可负——白骨洞那位的余屑是**往下沉**的（骨灰不是火星），负值是有意的
      if (ad.ember.rate <= 0) bad.push(`${c.id}: adorn.ember.rate 必须 > 0，否则一颗都不生成`);
    }
    if (ad.wings) {
      // 翼面用 createLinearGradient(color → tip)，两端都得是浏览器认的色值；
      // 三位缩写在这里不会报错，只会画出一片透明的翅膀
      if (!HEX6.test(ad.wings.color)) bad.push(`${c.id}: adorn.wings.color 必须是 6 位 #RRGGBB`);
      if (!HEX6.test(ad.wings.tip)) bad.push(`${c.id}: adorn.wings.tip 必须是 6 位 #RRGGBB`);
      if (ad.wings.span <= 0) bad.push(`${c.id}: adorn.wings.span 必须 > 0，否则翅膀收成一个点`);
      // feathers 参与 `i / (feathers + 1)` 分槽，<1 时一根主羽都画不出来
      if (!(ad.wings.feathers >= 1)) bad.push(`${c.id}: adorn.wings.feathers 必须 >= 1`);
    }
    if (ad.aura !== undefined && !HEX6.test(ad.aura)) bad.push(`${c.id}: adorn.aura 必须是 6 位 #RRGGBB`);
    if (ad.dust !== undefined && !HEX6.test(ad.dust)) bad.push(`${c.id}: adorn.dust 必须是 6 位 #RRGGBB`);
  }
  // 同上：mandorla.ts 的渐变/描边直接吃 superGlow 的两个色值，同一条 shade()/parseInt 约束
  if (c.superGlow && (!HEX6.test(c.superGlow[0]) || !HEX6.test(c.superGlow[1]))) {
    bad.push(`${c.id}: superGlow 必须是 6 位 #RRGGBB`);
  }
  return bad;
}

/**
 * 关卡背景数据。与角色那边同一类东西：一整块手写字段，坏起来全是静默的。
 *
 * 色值**必须 6 位**——天色/地面/剪影进 shade()（`parseInt(hex.slice(1),16)` 再按位取通道），
 * 天体光晕与氛围粒子进 hexAlpha，两者都按 6 位解析。写成三位不报错，
 * 只是画出另一种颜色（'#fff' → parseInt('fff',16)=4095 → rgb(0,15,255)）。
 * renderer 里那句「本文件里 sky/silhouette/INK 全部是 6 位 hex」是**约定**，
 * 而约定此前没有任何东西守着。
 */
export function validateStageBg(id: string, name: string, bg: StageBg): string[] {
  const bad: string[] = [];
  if (!name) bad.push(`${id}: 缺关卡名`);
  const colors: [string, string][] = [
    ['sky[0]', bg.sky[0]], ['sky[1]', bg.sky[1]],
    ['ground', bg.ground], ['silhouette', bg.silhouette],
    ['celestialColor', bg.celestialColor],
  ];
  if (bg.ambient) colors.push(['ambient.color', bg.ambient.color]);
  for (const [k, v] of colors) {
    if (!HEX6.test(v)) bad.push(`${id}: ${k} 必须是 6 位 #RRGGBB（${v}）`);
  }
  // seed 派生山形/云纹/天体位置，非有限值会让整张背景算成 NaN
  if (!Number.isFinite(bg.seed)) bad.push(`${id}: seed 必须是有限数`);
  // 一颗都不生成的话，这一关的空气就是空的——而数据上看着"配了粒子"
  if (bg.ambient && bg.ambient.count <= 0) bad.push(`${id}: ambient.count 必须 > 0`);
  return bad;
}
