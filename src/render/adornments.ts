import { FLOOR_Y } from '../engine/types';
import type { Battle, } from '../engine/battle';
import type { CharacterDef, Fighter } from '../engine/types';
import { INK } from './palette';
import { samplePose } from './motion';
import { hexAlpha, poseForFighter, torsoAnchors } from './renderer';

/** 角色身上的"活物"层：飘带、余烬、满槽气环、脚下扬尘、地面痕迹。
 *
 * 这些都是**次级运动**——不由关键帧驱动，而是跟着骨骼锚点用弹簧追赶。手 K 关键帧永远做不出
 * 布料那种滞后与甩动；反过来，一旦有了它，同样的骨骼动作立刻"活"起来，是单位工作量里
 * 收益最高的一层。
 *
 * 全部按固定 1/60s 逻辑 tick 推进（tickAdornments 由 GameCanvas 的累加器调用），
 * draw 只读状态。不含 Math.random——所有摆动由下标与帧号的固定函数给出，逐帧结果恒定。 */

export interface SashDef {
  /** 挂点：肩（披帛/斗篷）或胯（腰带/战裙） */
  anchor: 'shoulder' | 'hip';
  segs: number;      // 节数，越多越柔
  segLen: number;    // 每节长度
  width: number;     // 根部宽度，向梢部收细
  color: string;
  /** 梢部第二色，做渐层；不给则单色 */
  tip?: string;
}

/**
 * 一对翅膀。雷震子整个人就是这件事——胜负台词、两段结局、两招招名（振翅挑／风雷双翅）
 * 全在说翅膀，而画面上此前是**两条同挂一个肩点的 154px 飘带**，注释里写着"要读成一对翅膀"。
 * 两条同锚同长的带子只会叠成一条，加上梢部收尖，读出来是鞭子不是翅膀（用户原话）。
 * 飘带那层做不了这件事：它是垂下来的布，翅膀是撑开的骨架。所以单开一层。
 */
export interface WingDef {
  color: string;     // 翼面
  tip: string;       // 翼梢渐层色
  span: number;      // 展长（根到梢）
  feathers: number;  // 主羽根数
}

export interface AdornDef {
  sashes?: SashDef[];
  /** 一对翅膀（见 WingDef）。离地越高展得越开——他的主战场在空中 */
  wings?: WingDef;
  /** 常驻余烬：跟着角色缓慢上浮的小光点 */
  ember?: { color: string; rate: number; rise: number };
  /** 气槽满时脚下的气环颜色 */
  aura?: string;
  /** 走动/落地扬尘颜色 */
  dust?: string;
}

type Pt = { x: number; y: number; px: number; py: number };
type SashState = { pts: Pt[] };
type Ember = { x: number; y: number; vy: number; life: number; max: number };
type Decal = { x: number; kind: 'scorch' | 'crack'; life: number; max: number; color: string };
/** 被打飞的兵器：翻着旋出去，扎进地里立住。只在 KO 那一刻触发——连打中途让兵器消失
 * 会让后面几十段"空手挥棍"，反而穿帮。 */
type Flung = { x: number; y: number; vx: number; vy: number; rot: number; spin: number; stuck: boolean; who: 0 | 1 };

interface Side {
  sashes: SashState[];
  embers: Ember[];
  emberClock: number;
}

const mkSide = (): Side => ({ sashes: [], embers: [], emberClock: 0 });
const state = { p1: mkSide(), p2: mkSide(), decals: [] as Decal[], flung: [] as Flung[], battle: null as Battle | null, frame: 0 };

const EMBER_MAX = 26;      // 每人常驻余烬上限
const DECAL_MAX = 14;      // 地面痕迹上限，超出丢最旧的
const DECAL_LIFE = 260;

function ensureSashes(side: Side, def: CharacterDef, x: number, feetY: number) {
  const defs = def.adorn?.sashes ?? [];
  if (side.sashes.length === defs.length) return;
  side.sashes = defs.map(d => ({
    // 初始时沿身后斜下方铺开：全部重合的话第一帧约束方向退化（dist=0），
    // 整条带子会朝一个任意方向弹出去
    pts: Array.from({ length: d.segs }, (_, k) => {
      const px0 = x - k * d.segLen * 0.6, py0 = feetY - 60 + k * d.segLen * 0.5;
      return { x: px0, y: py0, px: px0, py: py0 };
    }),
  }));
}

/** 飘带一节一节地追前一节：Verlet 式积分 + 距离约束。风是帧号的固定函数，不用随机数。 */
function stepSash(st: SashState, d: SashDef, ax: number, ay: number, facing: number, frame: number, moving: number) {
  const pts = st.pts;
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i];
    if (i === 0) { p.px = p.x; p.py = p.y; p.x = ax; p.y = ay; continue; }
    // 惯性 + 重力 + 一点"逆着运动方向被吹起"的风
    const vx = (p.x - p.px) * 0.86, vy = (p.y - p.py) * 0.86;
    p.px = p.x; p.py = p.y;
    const wind = Math.sin((frame + i * 9) * 0.11) * 0.5 + moving * -facing * 1.15;
    p.x += vx + wind;
    p.y += vy + 0.42;
    // 距离约束：把这一节拉回到离前一节 segLen 的地方
    const prev = pts[i - 1];
    const dx = p.x - prev.x, dy = p.y - prev.y;
    const dist = Math.hypot(dx, dy) || 1;
    const k = (dist - d.segLen) / dist;
    p.x -= dx * k; p.y -= dy * k;
    // 触地：钳 y 的同时把**纵向**速度清掉（p.py = p.y）。清横向那一个是错的——
    // 纵向被钳住而 p.py 还留在钳位之前，p.y - p.py 就成了一个凭空冒出来的速度。
    // 说明：我最初以为浏览器里看到的"飘带竖成一根棍子"是这里造成的，但两个版本跑下来
    // 轨迹没有可测差异（见 tests/adornments.test.ts）——那一幕其实是自动化标签只跑了
    // 几帧、链条还没落定的初始瞬态。这一行保留是因为它本身就该这么写，不是因为它修好了什么。
    if (p.y > FLOOR_Y - 2) { p.y = FLOOR_Y - 2; p.py = p.y; }
  }
}

function stepSide(side: Side, f: Fighter, frame: number) {
  const feetY = FLOOR_Y - f.y;
  const p = poseForFighter(f);
  const { shX, shY, hipX, hipY } = torsoAnchors(f.x, feetY, p.lean, p.crouch, f.facing);
  ensureSashes(side, f.def, f.x, feetY);
  const defs = f.def.adorn?.sashes ?? [];
  const moving = Math.min(Math.abs(f.vx) / 6, 1.6);
  defs.forEach((d, i) => {
    const ax = d.anchor === 'shoulder' ? shX : hipX;
    const ay = d.anchor === 'shoulder' ? shY : hipY;
    stepSash(side.sashes[i], d, ax, ay, f.facing, frame + i * 31, moving);
  });

  // 常驻余烬：按角色的 rate 定期从躯干附近冒出，缓慢上浮后消散
  const em = f.def.adorn?.ember;
  if (em) {
    side.emberClock++;
    if (side.emberClock >= em.rate && side.embers.length < EMBER_MAX) {
      side.emberClock = 0;
      const i = frame % 7;
      side.embers.push({
        x: f.x + (i - 3) * 7, y: feetY - 40 - (i % 4) * 18,
        vy: em.rise * (0.7 + (i % 3) * 0.2), life: 0, max: 48 + i * 6,
      });
    }
    for (const e of side.embers) { e.y -= e.vy; e.x += Math.sin((frame + e.max) * 0.08) * 0.35; e.life++; }
    for (let i = side.embers.length - 1; i >= 0; i--) if (side.embers[i].life >= side.embers[i].max) side.embers.splice(i, 1);
  }
}

/** 新一局重置：与 tickDamageTrail 同一套「靠 Battle 引用变化探测新局」的做法 */
function resetIfNew(b: Battle) {
  if (state.battle === b) return;
  state.battle = b;
  state.p1 = mkSide(); state.p2 = mkSide();
  state.decals = [];
  state.flung = [];
  state.frame = 0;
}

export function tickAdornments(b: Battle): void {
  resetIfNew(b);
  state.frame++;
  stepSide(state.p1, b.p1, state.frame);
  stepSide(state.p2, b.p2, state.frame);
  for (let i = state.decals.length - 1; i >= 0; i--) {
    if (++state.decals[i].life >= state.decals[i].max) state.decals.splice(i, 1);
  }
  for (const g of state.flung) {
    if (g.stuck) continue;
    g.x += g.vx; g.y += g.vy; g.vy += 0.62; g.rot += g.spin;
    if (g.y >= FLOOR_Y - 4) {          // 扎进地里：立住不倒，角度略偏，像插着
      g.y = FLOOR_Y - 4; g.stuck = true;
      g.rot = -Math.PI / 2 + (g.vx > 0 ? 0.34 : -0.34);
    }
  }
}

/** KO 时把输家的兵器打飞出去。方向取击飞方向，翻转速度按水平速度给。 */
export function flingWeapon(who: 0 | 1, x: number, y: number, dir: number) {
  state.flung.push({
    x, y: FLOOR_Y - y - 70, vx: dir * 5.2, vy: -9.5,
    rot: 0, spin: dir * 0.34, stuck: false, who,
  });
}

/** 被打飞的兵器：画在角色之上（要看得见它飞出去），扎地之后就一直立在那儿 */
export function drawFlung(ctx: CanvasRenderingContext2D, b: Battle) {
  for (const g of state.flung) {
    const def = g.who === 0 ? b.p1.def : b.p2.def;
    const w = def.weapon;
    if (!w) continue;
    ctx.save();
    ctx.translate(g.x, g.y);
    ctx.rotate(g.rot);
    ctx.strokeStyle = w.shaft;
    ctx.lineWidth = w.kind === 'mace' ? 8 : 5;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(-w.len * w.grip, 0);
    ctx.lineTo(w.len * (1 - w.grip), 0);
    ctx.stroke();
    ctx.fillStyle = w.edge;
    ctx.beginPath();                    // 刃端：一个简化的三角，不重复整套形制
    ctx.moveTo(w.len * (1 - w.grip) + 14, 0);
    ctx.lineTo(w.len * (1 - w.grip) - 2, 5.5);
    ctx.lineTo(w.len * (1 - w.grip) - 2, -5.5);
    ctx.closePath(); ctx.fill();
    ctx.restore();
  }
}

/** 兵器已被打飞的那一方，手上就不该再有兵器了 */
export function isDisarmed(who: 0 | 1): boolean {
  return state.flung.some(g => g.who === who);
}

export function flungCount(): number { return state.flung.length; }

/** 落地/撞击在地面留下的痕迹。由 GameCanvas 在判出落地/撞墙的那一 tick 调用。 */
export function addDecal(x: number, kind: Decal['kind'], color: string) {
  state.decals.push({ x, kind, life: 0, max: DECAL_LIFE, color });
  while (state.decals.length > DECAL_MAX) state.decals.shift();
}

/** 地面痕迹画在角色之下、地面之上 */
export function drawDecals(ctx: CanvasRenderingContext2D) {
  for (const d of state.decals) {
    const k = 1 - d.life / d.max;
    ctx.save();
    ctx.globalAlpha = k * 0.5;
    if (d.kind === 'scorch') {
      const g = ctx.createRadialGradient(d.x, FLOOR_Y + 2, 0, d.x, FLOOR_Y + 2, 34);
      g.addColorStop(0, hexAlpha(d.color, 0.9));
      g.addColorStop(1, hexAlpha(d.color, 0));
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.ellipse(d.x, FLOOR_Y + 2, 34, 7, 0, 0, Math.PI * 2); ctx.fill();
    } else {
      ctx.strokeStyle = hexAlpha(INK.ink, 0.85);
      ctx.lineWidth = 1.6;
      for (let i = -2; i <= 2; i++) { // 五道放射裂纹，长度由下标决定，不用随机
        const len = 12 + ((i + 2) % 3) * 9;
        ctx.beginPath();
        ctx.moveTo(d.x, FLOOR_Y + 1);
        ctx.lineTo(d.x + i * 11, FLOOR_Y + 1 + Math.abs(i) * 1.5 - len * 0.05);
        ctx.lineTo(d.x + i * 15, FLOOR_Y + 3);
        ctx.stroke();
      }
    }
    ctx.restore();
  }
}

/** 气槽满时脚下的转动气环——一眼看出"可以放大招了"，不用去读气条 */
/** MAX 收尾期：剩这么多帧起开始变淡，让"快没了"看得出来 */
const MAX_TAIL = 90;

/**
 * 气环这一帧长什么样。返回 null = 不画。
 *
 * 抽成纯函数是因为这里有两个**含义完全不同**却曾经共用一套画法的状态：
 *   · 气满（meter >= 100）：手上攥着一发超必杀，是"我随时能开"
 *   · MAX 生效中（maxMode > 0）：伤害 ×1.25 的 300 帧正在流逝，是"我现在很凶，但会过去"
 * 两者画得一模一样的话，玩家分不出对面是"憋着大招"还是"正在加成里"，
 * 而且完全看不出 MAX 还剩多少——TouchLayer 那行「MAX 状态 · 伤害提升」也不带时长。
 *
 * MAX 一档：环更多、转更快，并且**随剩余帧数变淡**（最后 90 帧线性收到六成）。
 */
export function auraLook(meter: number, maxLeft: number): { rings: number; speed: number; alpha: number } | null {
  // 进 MAX 恰好扣掉 50 气，所以这里必须同时看 maxLeft——只看 meter 的话，
  // 发动那一刻光环立即熄灭，画面上等于"花了 50 气什么都没发生"
  if (maxLeft > 0) {
    return { rings: 5, speed: 0.09, alpha: 0.6 + 0.4 * Math.min(1, maxLeft / MAX_TAIL) };
  }
  if (meter >= 100) return { rings: 3, speed: 0.05, alpha: 1 };
  return null;
}

function drawAura(ctx: CanvasRenderingContext2D, f: Fighter, color: string, frame: number) {
  const look = auraLook(f.meter, f.maxMode);
  if (!look) return;
  const feetY = FLOOR_Y - f.y;
  const t = frame * look.speed;
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  for (let i = 0; i < look.rings; i++) {
    const ph = t + i * (6.3 / look.rings);
    const r = 26 + (ph % 1.6) * 16;
    ctx.strokeStyle = hexAlpha(color, 0.34 * look.alpha * (1 - (ph % 1.6) / 1.6));
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.ellipse(f.x, feetY + 2, r, r * 0.3, 0, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.restore();
}

/**
 * 翅膀展开的程度（0=收拢贴背，1=完全张开）。纯函数，所以"离地就张开"这条能被测到，
 * 不用去截图里数像素。
 *
 * 站在地上是**半收**（0.42）而不是完全折起：完全折起时他和别人一个轮廓，
 * 那就又回到"新角色看着都一样"。离地 60px 之内线性张到满，再高不再变
 * ——跳跃顶点约 110px，全程都该是张开的。
 * 另叠一层很浅的呼吸摆动（±0.04），站着不动时翅膀也在动。
 */
export function wingSpread(y: number, frame: number): number {
  const air = Math.min(1, Math.max(0, y) / 60);
  return 0.42 + air * 0.5 + Math.sin(frame * 0.055) * 0.04;
}

/**
 * 一对翅膀 = **一把从肩上散开的羽扇**，不是一片填色的翼面。
 *
 * 第一版画的是"前缘上凸、后缘下兜"的一整片，再在里面拉几根羽线——出来是一片**叶子**，
 * 羽线读成叶脉。这种扁平描边风格里，翅膀真正认得出来的特征是**一根根排开的主羽**，
 * 不是翼面的轮廓；所以改成直接画羽毛，每根一个拉长的椭圆，从肩点呈扇形散开，
 * 中间最长两头短（真羽翼就是这个包络）。轮廓由羽毛自己叠出来，不另画。
 */
export function drawWings(
  ctx: CanvasRenderingContext2D, w: WingDef,
  /** 肩挂点、朝向、离地高度。**不收 Fighter**：选人页的立绘没有 Fighter，
   * 而"翅膀长什么样"只该有一份实现——收成挂点参数，对局与立绘走同一条。 */
  shX: number, shY: number, facing: number, y: number, frame: number,
) {
  const back = -facing;                         // 往身后展
  const open = wingSpread(y, frame);
  for (const far of [true, false]) {
    // 两只差的是角度与长度，不只是位置——只错开几像素仍旧糊成一只
    const rx = shX + (far ? back * 7 : 0), ry = shY - (far ? 6 : 0);
    const span = w.span * (far ? 0.86 : 1);
    const lo = -0.32 + open * 0.22;             // 最下面那根：略低于水平
    const hi = 0.18 + open * 0.92;              // 最上面那根：张开时高高扬起
    ctx.save();
    if (far) ctx.globalAlpha = 0.5;
    for (let i = 0; i < w.feathers; i++) {
      const t = w.feathers === 1 ? 0.5 : i / (w.feathers - 1);
      const ang = lo + (hi - lo) * t;
      const len = span * (0.58 + 0.42 * Math.sin(Math.PI * t));   // 中间最长
      const wid = span * 0.15;
      const dx = back * Math.cos(ang), dy = -Math.sin(ang);
      ctx.fillStyle = mix(w.color, w.tip, t);
      ctx.beginPath();
      ctx.ellipse(rx + dx * len * 0.5, ry + dy * len * 0.5, len * 0.5, wid * 0.5,
        Math.atan2(dy, dx), 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = INK.ink; ctx.lineWidth = 1.4; ctx.stroke();
    }
    ctx.restore();
  }
}

/** 角色身上的附属层。分两次调用：back 在角色之下（飘带、气环），front 在角色之上（余烬）。 */
export function drawAdornments(ctx: CanvasRenderingContext2D, b: Battle, layer: 'back' | 'front') {
  for (const [f, side] of [[b.p1, state.p1], [b.p2, state.p2]] as const) {
    const ad = f.def.adorn;
    if (!ad) continue;
    if (layer === 'back') {
      // 画不画、画成什么样，全在 auraLook 里（纯函数，可测）
      if (ad.aura) drawAura(ctx, f, ad.aura, state.frame);
      if (ad.wings) {
        const wp = poseForFighter(f);
        const wa = torsoAnchors(f.x, FLOOR_Y - f.y, wp.lean, wp.crouch, f.facing);
        drawWings(ctx, ad.wings, wa.shX, wa.shY, f.facing, f.y, state.frame);
      }
      const defs = ad.sashes ?? [];
      defs.forEach((d, i) => {
        const st = side.sashes[i];
        if (!st || st.pts.length < 2) return;
        ctx.save();
        ctx.lineCap = 'round';
        for (let k = 1; k < st.pts.length; k++) {
          const t = k / (st.pts.length - 1);
          ctx.strokeStyle = d.tip ? mix(d.color, d.tip, t) : d.color;
          // 收分只到 55%，不是 25%：带子是**一条带**，收成针尖就成了鞭梢
          ctx.lineWidth = d.width * (1 - t * 0.45);
          ctx.beginPath();
          ctx.moveTo(st.pts[k - 1].x, st.pts[k - 1].y);
          ctx.lineTo(st.pts[k].x, st.pts[k].y);
          ctx.stroke();
        }
        ctx.restore();
      });
    } else if (ad.ember) {
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      for (const e of side.embers) {
        const a = 1 - e.life / e.max;
        ctx.fillStyle = hexAlpha(ad.ember.color, a * 0.75);
        ctx.beginPath();
        ctx.arc(e.x, e.y, 1.4 + a * 2.2, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    }
  }
}

/** 两个 #rrggbb 之间按 t 混色 */
function mix(a: string, b: string, t: number): string {
  const pa = [1, 3, 5].map(i => parseInt(a.slice(i, i + 2), 16));
  const pb = [1, 3, 5].map(i => parseInt(b.slice(i, i + 2), 16));
  const c = pa.map((v, i) => Math.round(v + (pb[i] - v) * t));
  return `#${c.map(v => v.toString(16).padStart(2, '0')).join('')}`;
}

/** 供测试用：读当前飘带节点，验证它确实在动、且不穿地 */
export function sashPointsFor(who: 0 | 1): { x: number; y: number }[][] {
  const side = who === 0 ? state.p1 : state.p2;
  return side.sashes.map(s => s.pts.map(p => ({ x: p.x, y: p.y })));
}
export function emberCount(who: 0 | 1): number {
  return (who === 0 ? state.p1 : state.p2).embers.length;
}
export function decalCount(): number { return state.decals.length; }

/** samplePose 的再导出，避免调用方为了取姿势而反向依赖 renderer 内部 */
export { samplePose };
