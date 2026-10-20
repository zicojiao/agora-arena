import type { MoveSlot } from '../engine/types';
import { FLOOR_Y, LOGIC_W } from '../engine/types';
import { INK } from './palette';
import { t } from '../i18n';

// CJK 衬线栈：ShenxianSerif 是自带的 Noto Serif SC 子集（Task 25，见 index.html 的
// @font-face + scripts/subset-font.mjs），Android 上 Songti SC/SimSun/Noto Serif CJK SC
// 全都没有对应字体，之前会静默退到黑体——放在栈首，后面几个系统衬线留作它没加载出来时
// （网络异常/极端情形）的兜底
/** Barlow Condensed first: it only has Latin glyphs, so English banners match the app UI while any CJK text
 * still falls through to the original serif. */
const SERIF = "'Barlow Condensed','ShenxianSerif','Songti SC','SimSun','Noto Serif CJK SC',serif";
/** Display face for English banners (the GOAT roster); matches the app's HUD typography. */
const TITLE = "'Barlow Condensed', 'DM Sans', sans-serif";
const LATIN = /^[\u0000-\u024F\s]+$/;

// 技能名（s1-s3）：浮在出招者头顶，向上飘 + 淡出。双方各占一路独立计时——双方同一 tick
// 都出技能是完全合法的输入组合，共用一路会丢掉其中一边
const SKILL_LIFE = 40;
const SKILL_RISE = 0.8; // px/tick，向上飘移速度
const SKILL_HEAD_Y = 190; // 头顶大致高度（脚底往上量）；不追求跟骨骼像素对齐，一个粗略的高度足够

interface SkillLabel { on: boolean; text: string; age: number }
const noSkill = (): SkillLabel => ({ on: false, text: '', age: 0 });

// 大招竖排卷轴 + 朱砂印：屏幕空间，出招者背朝的一侧。p1/p2 各占一路独立计时——两人同一
// tick 都放大招是合法输入组合（气槽调快后概率更高），共用一路会丢掉其中一边（Task 23 遗留）
const SUPER_LIFE = 90;
const SUPER_CHAR_TICKS = 5; // 逐字揭示：隔几 tick 出下一个字，是"卷轴展开"而非整块淡入的关键
const SUPER_FADE = 20;      // 结尾淡出占用的 tick 数
const SUPER_START_Y = 120;  // 避开 HUD（血条区到 y≈100）
const SUPER_LINE = 38;      // 竖排逐字行距
const SEAL_GAP = 14;
const SEAL_SIZE = 34;
const SIDE_MARGIN = 100;    // 竖排列与屏幕左右边缘的距离

interface SuperScroll { on: boolean; text: string; seal: string; x: number; age: number }
const noSuper = (): SuperScroll => ({ on: false, text: '', seal: '', x: 0, age: 0 });

// 关卡开场横幅：屏幕居中偏上，淡入 → 停留 → 淡出
export const STAGE_LIFE = 90;
/** 开场横幅最下面那一行（对手的开场白）的基线 y。**导出**是因为它有个看不见的下限：
 * 再往下就压到人物头上了。横幅的四行是 118/150/184/208/这一行，越加越低，
 * 而人物头顶在 y≈306（FLOOR_Y 460 − 颈肩 138 − 头半径 16）。
 * 谁要加第五行，bannerLayout 那条会先拦一下。 */
export const STAGE_INTRO_Y = 232;
export const STAGE_FADE_IN = 15;
const STAGE_FADE_OUT = 25;
/** 横幅开始淡出的那一帧。回合起始的「准备」锁就锁到这里——
 * 横幅还完全立着的时候不该已经在挨打。从横幅自己的节奏推导，不另填一个字面量：
 * 横幅时长改了，锁也跟着改。 */
export const STAGE_HOLD_END = STAGE_LIFE - STAGE_FADE_OUT;

// 先制（本回合第一记有效命中）。KOF 的 FIRST ATTACK。
// 加它不是为了热闹：实测 317 个回合里，先手命中方最终获胜 61.2%，比五五开高出 4.0 个标准误
//（逐关 64/59/70/53，最终关最弱——BOSS 翻盘的余地最大）。它报的是真信息。
// 命短：50 帧，比技能名还短。这一下之后立刻要打，横幅不该抢戏。
const FIRST_LIFE = 50;
const FIRST_FADE = 14;
const FIRST_Y = 150;        // 避开 HUD（血条到 y≈100）与回合比分（top 60）
interface FirstAtk { on: boolean; who: 0 | 1; age: number }
const noFirst = (): FirstAtk => ({ on: false, who: 0, age: 0 });

// 胜利台词。拳皇里胜利姿势是**带话**的——这边 quotes.win 早就写好了，
// 却只在结算页出现，而摆造型那 120 帧一个字都没有。
// 落在造型定住之后（胜利动作 t≈52-66 收势），一直挂到收尾结束、结算页接手。
const QUOTE_FADE_IN = 12;
const QUOTE_Y = 196;        // 先制横幅在 150，错开一行
interface WinQuote { on: boolean; text: string; who: 0 | 1; age: number }
const noQuote = (): WinQuote => ({ on: false, text: '', who: 0, age: 0 });

interface StageIntro { on: boolean; stageName: string; opponentName: string; trait: string; intro: string; final: boolean; age: number }
const noStage = (): StageIntro => ({ on: false, stageName: '', opponentName: '', trait: '', intro: '', final: false, age: 0 });

// 判词：不是 KO 结束的那些回合，屏幕上得有一句话说明刚才发生了什么。
// 读秒判胜、读秒平局、双双倒地——这三种此前**一个字都不说**（KO 有整套死亡演出交代，
// 它们什么都没有），回合就这么没了。三种共用一路：它们互斥，一个回合最多出现一句。
// 居中偏上，与关卡横幅同一位置（那时它早已退场，不会撞）。
const VERDICT_LIFE = 120;
const VERDICT_FADE = 30;
interface VerdictBanner { on: boolean; text: string; age: number }

function edgeAlpha(age: number, life: number, fadeIn: number, fadeOut: number): number {
  if (age < fadeIn) return age / fadeIn;
  if (age > life - fadeOut) return Math.max(0, (life - age) / fadeOut);
  return 1;
}

/** 圆角方块路径：只给朱砂印用，不追求通用（比如不处理 r 大于 w/h 一半的退化情形——
 * SEAL_SIZE/圆角半径都是本文件里的固定常量，不会撞上这个边界） */
function roundedRectPath(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

export class BannerSystem {
  private skillP1: SkillLabel = noSkill();
  private skillP2: SkillLabel = noSkill();
  private zhaoP1: SuperScroll = noSuper();
  private zhaoP2: SuperScroll = noSuper();
  private stage: StageIntro = noStage();
  private first: FirstAtk = noFirst();
  /** 本回合报过先制没有。BannerSystem 与 Battle 生命周期一一对应（见 GameCanvas 里那条注释），
   * 所以这个标记天然按回合复位，不用另外探测新局 */
  private firstDone = false;
  private quote: WinQuote = noQuote();
  private verdict: VerdictBanner = { on: false, text: '', age: 0 };
  /** 本回合报过判词没有。同 firstDone：BannerSystem 与 Battle 一一对应，天然按回合复位 */
  private verdictDone = false;

  /** 招式起手（moveStart）时调用一次。n1-n3 不产生任何横幅——连打时满屏刷字会抢戏；
   * s1-s3 在出招者头顶浮字；sp50/sp100 走竖排卷轴+朱砂印，位置取决于出招者背朝哪一侧 */
  showMove(name: string, slot: MoveSlot, casterFacing: 1 | -1, who: 0 | 1) {
    if (slot === 's1' || slot === 's2' || slot === 's3') {
      const label: SkillLabel = { on: true, text: name, age: 0 };
      if (who === 0) this.skillP1 = label; else this.skillP2 = label;
    } else if (slot === 'sp50' || slot === 'sp100') {
      const x = casterFacing === 1 ? SIDE_MARGIN : LOGIC_W - SIDE_MARGIN; // 背朝的一侧
      const latin = LATIN.test(name);
      const scroll: SuperScroll = { on: true, text: name, seal: latin ? (slot === 'sp50' ? 'SUPER' : 'MAX SUPER') : slot === 'sp50' ? '奥' : '超', x, age: 0 };
      if (who === 0) this.zhaoP1 = scroll; else this.zhaoP2 = scroll;
    }
  }

  /** 本回合第一记有效命中时调用。重复调用无效——「先制」按定义一个回合只有一次 */
  showFirstAttack(who: 0 | 1) {
    if (this.firstDone) return;

    this.firstDone = true;
    this.first = { on: true, who, age: 0 };
  }

  /** 胜者摆定造型时调用一次。不设时限——它一直挂到结算页接手为止 */
  showWinQuote(text: string, who: 0 | 1) {
    if (this.quote.on) return;
    this.quote = { on: true, text, who, age: 0 };
  }

  /**
   * 回合以非 KO 的方式结束时，每 tick 调用（调用方拿的是状态位不是事件，见 GameCanvas）。
   * 返回这一次是不是**真的点着了**，调用方靠它决定要不要额外发一声。
   *
   * 判重必须用 done 而不是 on：横幅 120 帧后自己熄灭，而 timeUp/doubleKo 状态位一直是真，
   * 只看 on 的话它会熄一次点一次，无限循环。
   */
  showVerdict(text: string): boolean {
    if (this.verdictDone) return false;
    this.verdictDone = true;
    this.verdict = { on: true, text, age: 0 };
    return true;
  }

  /** 每局开始调用一次：关卡名 + 对手名，训练场没有关卡概念，调用方不应传入 */
  /** final：这是一趟阶梯的最后一关。开场横幅此前对第六关和第一关说的是同一句话——
   * 六关连战的收尾没有任何标记，玩家要数着关数才知道自己打到头了 */
  showStage(stageName: string, opponentName: string, trait = '', final = false, intro = '') {
    this.stage = { on: true, stageName, opponentName, trait, intro, final, age: 0 };
  }

  /** 每逻辑 tick 调一次，绝不能挂渲染帧——这个项目已经在"按渲染帧推进本该按逻辑帧走的量"
   * 上栽过两次（大招暗场衰减、血条残影），120Hz 手机上会让卷轴展开、浮字淡出快一倍 */
  tick() {
    if (this.skillP1.on && ++this.skillP1.age >= SKILL_LIFE) this.skillP1.on = false;
    if (this.skillP2.on && ++this.skillP2.age >= SKILL_LIFE) this.skillP2.on = false;
    if (this.zhaoP1.on && ++this.zhaoP1.age >= SUPER_LIFE) this.zhaoP1.on = false;
    if (this.zhaoP2.on && ++this.zhaoP2.age >= SUPER_LIFE) this.zhaoP2.on = false;
    if (this.stage.on && ++this.stage.age >= STAGE_LIFE) this.stage.on = false;
    if (this.first.on && ++this.first.age >= FIRST_LIFE) this.first.on = false;
    if (this.verdict.on && ++this.verdict.age >= VERDICT_LIFE) this.verdict.on = false;
    if (this.quote.on) this.quote.age++;   // 不自动熄灭：结算页出现时整个 BannerSystem 一起卸载
  }

  /** 测试/调试用：当前有几路横幅在播（技能×2 + 大招×2 + 关卡 + 先制 + 判词 + 胜利台词，最多 8） */
  activeCount(): number {
    return (this.skillP1.on ? 1 : 0) + (this.skillP2.on ? 1 : 0)
      + (this.zhaoP1.on ? 1 : 0) + (this.zhaoP2.on ? 1 : 0) + (this.stage.on ? 1 : 0)
      + (this.first.on ? 1 : 0) + (this.verdict.on ? 1 : 0) + (this.quote.on ? 1 : 0);
  }

  /** 测试用：判词横幅在不在播 */
  verdictOn(): boolean { return this.verdict.on; }

  /** 世界空间：技能名跟着出招者的插值坐标走，随镜头震动/缩放一起变形。
   * 必须画在 cam.apply/restore 之内 */
  drawSkill(ctx: CanvasRenderingContext2D, p1x: number, p1y: number, p2x: number, p2y: number) {
    this.drawFloatingName(ctx, this.skillP1, p1x, p1y);
    this.drawFloatingName(ctx, this.skillP2, p2x, p2y);
  }

  private drawFloatingName(ctx: CanvasRenderingContext2D, label: SkillLabel, fx: number, fy: number) {
    if (!label.on) return;
    const y = FLOOR_Y - fy - SKILL_HEAD_Y - label.age * SKILL_RISE;
    ctx.save();
    ctx.font = `20px ${SERIF}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.globalAlpha = 1 - label.age / SKILL_LIFE;
    ctx.lineWidth = 3;
    ctx.strokeStyle = INK.ink;
    ctx.strokeText(label.text, fx, y);
    ctx.fillStyle = INK.paper;
    ctx.fillText(label.text, fx, y);
    ctx.restore();
  }

  /** 屏幕空间：大招竖排卷轴+印、关卡开场横幅——两者都不该随镜头晃/缩放。
   * 必须画在 cam.restore 之后 */
  drawScreen(ctx: CanvasRenderingContext2D) {
    this.drawSuperScroll(ctx, this.zhaoP1);
    this.drawSuperScroll(ctx, this.zhaoP2);
    this.drawStageIntro(ctx);
    this.drawFirstAttack(ctx);
    this.drawVerdict(ctx);
    this.drawWinQuote(ctx);
  }

  /** 判词：居中一行大字。做得比关卡横幅小一档——它是判决，不是开场 */
  private drawVerdict(ctx: CanvasRenderingContext2D) {
    const t = this.verdict;
    if (!t.on) return;
    ctx.save();
    ctx.globalAlpha = edgeAlpha(t.age, VERDICT_LIFE, 8, VERDICT_FADE);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = `bold 40px ${SERIF}`;
    ctx.lineWidth = 5;
    ctx.strokeStyle = INK.ink;
    ctx.strokeText(t.text, LOGIC_W / 2, 150);
    ctx.fillStyle = INK.cinnab;
    ctx.fillText(t.text, LOGIC_W / 2, 150);
    ctx.restore();
  }

  /** 胜利台词：说话那一方的半场，横排一行。不做卷轴——那是大招的语汇，这里是"说了句话" */
  private drawWinQuote(ctx: CanvasRenderingContext2D) {
    const q = this.quote;
    if (!q.on) return;
    const x = q.who === 0 ? LOGIC_W * 0.30 : LOGIC_W * 0.70;
    ctx.save();
    ctx.globalAlpha = Math.min(1, q.age / QUOTE_FADE_IN);
    ctx.font = `19px ${SERIF}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.lineWidth = 4;
    ctx.strokeStyle = INK.ink;
    ctx.strokeText(q.text, x, QUOTE_Y);
    ctx.fillStyle = INK.paper;
    ctx.fillText(q.text, x, QUOTE_Y);
    ctx.restore();
  }

  /** 先制：出手那一方的半场，一行小字 + 一条短横线。刻意做小——它是提示，不是庆典 */
  private drawFirstAttack(ctx: CanvasRenderingContext2D) {
    const f = this.first;
    if (!f.on) return;
    const x = f.who === 0 ? LOGIC_W * 0.28 : LOGIC_W * 0.72;
    const rise = Math.min(f.age, FIRST_LIFE - FIRST_FADE) * 0.35;   // 前段缓缓上浮，淡出时停住
    ctx.save();
    ctx.globalAlpha = edgeAlpha(f.age, FIRST_LIFE, 8, FIRST_FADE);
    ctx.font = `22px ${SERIF}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.lineWidth = 4;
    ctx.strokeStyle = INK.ink;
    ctx.strokeText(t('canvas.firstAttack'), x, FIRST_Y - rise);
    ctx.fillStyle = INK.gamboge;
    ctx.fillText(t('canvas.firstAttack'), x, FIRST_Y - rise);
    // 下划线比字暗一档。不引 renderer 的 hexAlpha——banner 被 renderer 用着，反向引会绕成循环
    ctx.globalAlpha *= 0.7;
    ctx.strokeStyle = INK.gamboge;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(x - 26, FIRST_Y - rise + 16);
    ctx.lineTo(x + 26, FIRST_Y - rise + 16);
    ctx.stroke();
    ctx.restore();
  }

  /** Latin move names ("GOAT Ascension") read across, not as a one-letter-per-line vertical scroll that
   * would run off the bottom of the screen. Same reveal pacing and seal, laid out horizontally. */
  private drawSuperTitle(ctx: CanvasRenderingContext2D, s: SuperScroll) {
    const text = s.text.toUpperCase();
    const revealed = Math.min(text.length, Math.floor(s.age / (SUPER_CHAR_TICKS / 2)) + 1);
    const alpha = s.age > SUPER_LIFE - SUPER_FADE ? Math.max(0, (SUPER_LIFE - s.age) / SUPER_FADE) : 1;
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.font = `italic 800 40px ${TITLE}`;
    const width = ctx.measureText(text).width;
    const cx = Math.min(LOGIC_W - width / 2 - 24, Math.max(width / 2 + 24, s.x));
    const y = SUPER_START_Y + 24;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.lineWidth = 5;
    const shown = text.slice(0, revealed);
    ctx.strokeStyle = INK.ink;
    ctx.strokeText(shown, cx - width / 2, y);
    ctx.fillStyle = INK.paper;
    ctx.fillText(shown, cx - width / 2, y);
    ctx.font = `800 12px ${TITLE}`;
    ctx.textAlign = 'center';
    const tag = s.seal;
    const tagW = ctx.measureText(tag).width + 16;
    ctx.fillStyle = INK.cinnab;
    roundedRectPath(ctx, cx - tagW / 2, y - 44, tagW, 20, 3);
    ctx.fill();
    ctx.fillStyle = INK.paper;
    ctx.fillText(tag, cx, y - 33);
    ctx.restore();
  }

  private drawSuperScroll(ctx: CanvasRenderingContext2D, s: SuperScroll) {
    if (!s.on) return;
    if (LATIN.test(s.text)) { this.drawSuperTitle(ctx, s); return; }
    const revealed = Math.min(s.text.length, Math.floor(s.age / SUPER_CHAR_TICKS) + 1);
    const alpha = s.age > SUPER_LIFE - SUPER_FADE ? Math.max(0, (SUPER_LIFE - s.age) / SUPER_FADE) : 1;
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = `32px ${SERIF}`;
    ctx.lineWidth = 4;
    for (let i = 0; i < revealed; i++) {
      const cy = SUPER_START_Y + i * SUPER_LINE;
      ctx.strokeStyle = INK.ink;
      ctx.strokeText(s.text[i], s.x, cy);
      ctx.fillStyle = INK.paper;
      ctx.fillText(s.text[i], s.x, cy);
    }
    if (revealed === s.text.length) { // 全字揭示完才盖印——卷轴念完再落章
      const sealY = SUPER_START_Y + s.text.length * SUPER_LINE + SEAL_GAP;
      ctx.fillStyle = INK.cinnab;
      roundedRectPath(ctx, s.x - SEAL_SIZE / 2, sealY, SEAL_SIZE, SEAL_SIZE, 6);
      ctx.fill();
      ctx.font = `22px ${SERIF}`;
      ctx.fillStyle = INK.paper;
      ctx.fillText(s.seal, s.x, sealY + SEAL_SIZE / 2 + 1);
    }
    ctx.restore();
  }

  /** private，但测试要直接调它验画布状态；见 introQuote.test 里那条描边透明度的断言 */
  drawStageIntro(ctx: CanvasRenderingContext2D) {
    const s = this.stage;
    if (!s.on) return;
    const alpha = edgeAlpha(s.age, STAGE_LIFE, STAGE_FADE_IN, STAGE_FADE_OUT);
    const cx = LOGIC_W / 2;
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    // 最后一关：主行之上压一行小字。做得比关卡名小得多、用朱砂——
    // 它是"这是最后一场"的记号，不该抢地名的位置（同 trait 那一行的分寸）
    if (s.final) {
      ctx.font = `bold 15px ${SERIF}`;
      ctx.lineWidth = 3;
      ctx.strokeStyle = INK.ink;
      ctx.strokeText('最 终 关', cx, 118);
      ctx.fillStyle = INK.cinnab;
      ctx.fillText('最 终 关', cx, 118);
    }
    ctx.font = `bold 34px ${SERIF}`;
    ctx.lineWidth = 4;
    ctx.strokeStyle = INK.ink;
    ctx.strokeText(s.stageName, cx, 150);
    ctx.fillStyle = INK.paper;
    ctx.fillText(s.stageName, cx, 150);
    ctx.font = `18px ${SERIF}`;
    ctx.lineWidth = 3;
    ctx.strokeStyle = INK.ink;
    ctx.strokeText(`对手 · ${s.opponentName}`, cx, 184);
    ctx.fillStyle = INK.gamboge;
    ctx.fillText(`对手 · ${s.opponentName}`, cx, 184);
    // 第三行：这一位**跟别人哪儿不一样**。六关的对手是随机抽的，报了名字还不够——
    // 玩家没打过刑天就不会知道他的必杀起手能硬吃一下，而那正是这一场要怎么打的关键。
    // 比名字小一档、颜色更淡：它是注解，不该抢开场横幅的主行
    if (s.trait) {
      ctx.font = `13px ${SERIF}`;
      ctx.lineWidth = 2.5;
      ctx.strokeStyle = INK.ink;
      ctx.strokeText(s.trait, cx, 208);
      ctx.fillStyle = INK.paper;
      ctx.globalAlpha = alpha * 0.72;
      ctx.fillText(s.trait, cx, 208);
    }
    // 第四行：对手的**开场那一句**。此前三句台词（胜/败/挑衅）全都发生在打完之后，
    // 一场仗打到一半才有人说话；开场对峙是 KOF 里角色性格最先落地的地方。
    // 比注解那行再淡一档、位置更低：它是这个人在说话，不是横幅在报信息。
    if (s.intro) {
      ctx.font = `14px ${SERIF}`;
      ctx.lineWidth = 2.5;
      // globalAlpha 必须自己设回去：上面那行注解（trait）把它压到了 alpha*0.72 就没还原，
      // 而**描边正是这行字在人物身上还读得清的唯一原因**。不设的话有两个后果：
      // 描边比该有的淡，且**有没有 trait 决定它多淡**——同一句话在不同对手身上深浅不一。
      ctx.globalAlpha = alpha;
      ctx.strokeStyle = INK.ink;
      ctx.strokeText(`「${s.intro}」`, cx, STAGE_INTRO_Y);
      ctx.fillStyle = INK.gamboge;
      ctx.globalAlpha = alpha * 0.62;
      ctx.fillText(`「${s.intro}」`, cx, STAGE_INTRO_Y);
    }
    ctx.restore();
  }

  /** 新一局必须调用，否则上一局还没放完的横幅会漏进下一局。BannerSystem 本身由
   * GameCanvas 用 useMemo 与 cam/fx 同生命周期创建，每场 Fight 都是全新实例
   * （App.tsx 用 key 强制 Fight 整体重挂载，不存在跨局复用同一 BannerSystem 的路径），
   * 所以这里不需要像 tickDamageTrail 那样靠 Battle 引用变化去探测新局——实例本身
   * 就是新局的边界，调用方在 GameCanvas 挂载时调一次即可 */
  reset() {
    this.skillP1 = noSkill();
    this.skillP2 = noSkill();
    this.zhaoP1 = noSuper();
    this.zhaoP2 = noSuper();
    this.stage = noStage();
  }
}
