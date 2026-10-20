import { INK } from './palette';
import type { SuperAura } from '../engine/types';

// 永乐宫/敦煌壁画里神仙身后那圈火焰状背光：一环首尾相接的火舌，内凹起于内环、鼓出、收成尖。
// 不是放射线，不是同心圆——每片用两段 quadraticCurveTo 从内环上的同一点出发，鼓向外侧，
// 收回到外环上的尖点，靠花瓣间的角度留白让每一片读得出独立轮廓
//
// Task 28：四个角色共用这一套几何语法，但花瓣数/宽厚/尖端/卷曲由角色的 SuperAura 决定——
// 之前颜色写死、花瓣数写死，四人的大招背光除了名字全一样，见 task-28-brief。DEFAULT_AURA
// 的四个值就是原先的硬编码常量，没有 superAura 的角色（或 tests 里的裸调用）落回原样。
const DEFAULT_AURA: SuperAura = { petals: 14, spread: 0.42, tipBlunt: 0, curl: 0 };
const DEFAULT_GLOW: [string, string] = [INK.gamboge, INK.cinnab];

const R_INNER = 70;
const R_TIP = 175;
const R_BULGE = R_INNER + (R_TIP - R_INNER) * 0.58;

const BLOOM_TICKS = 12; // 绽放（scale-in）耗时，按逻辑 tick 计
const ROT_SPEED = 0.008; // rad/tick，缓慢自转

function polar(a: number, r: number): [number, number] {
  return [Math.cos(a) * r, Math.sin(a) * r];
}

/** 单片火舌：起于内环一点，两段鼓向外侧的弧收成外环尖点（或钝口），闭合成一片独立轮廓。
 * aura.tipBlunt>0 时尖端从单点裂成一段以 R_TIP 为半径的短平边——"钝而厚"读的是这段平口，
 * 不是随便磨圆角；aura.curl 把两侧控制点同向偏转同一个量，花瓣就从对称舒展变成偏向一侧的
 * 旋卷，同一朵花从"张开"变"打卷"就靠这一个数字。 */
function petalPath(ctx: CanvasRenderingContext2D, angle: number, slot: number, aura: SuperAura) {
  const spread = slot * aura.spread;
  const curl = slot * aura.curl;
  const tipBlunt = slot * aura.tipBlunt;
  const [bx, by] = polar(angle, R_INNER);
  const [clx, cly] = polar(angle - spread + curl, R_BULGE);
  const [crx, cry] = polar(angle + spread + curl, R_BULGE);
  ctx.beginPath();
  ctx.moveTo(bx, by);
  if (tipBlunt > 0.001) {
    const [tlx, tly] = polar(angle - tipBlunt, R_TIP);
    const [trx, tryy] = polar(angle + tipBlunt, R_TIP);
    ctx.quadraticCurveTo(clx, cly, tlx, tly);
    ctx.lineTo(trx, tryy);
  } else {
    const [tx, ty] = polar(angle, R_TIP);
    ctx.quadraticCurveTo(clx, cly, tx, ty);
  }
  ctx.quadraticCurveTo(crx, cry, bx, by);
  ctx.closePath();
  ctx.fill();
}

/**
 * 出招者背后的火焰纹背光。plain class，与 FxSystem/BannerSystem 同构：GameCanvas 用
 * useMemo 建一次，随固定步长逻辑 tick 推进，renderer 里 draw()。绽放/自转的计时全部
 * 挂在 tick() 的 age 计数上，draw() 只读 age 插值——这条项目已经在"按渲染帧推进本该
 * 按逻辑帧走的量"上栽过两次（大招暗场衰减、血条残影），这里不能重蹈。
 */
export class MandorlaSystem {
  /** 只读式公开（同 FxSystem.flashAlpha 的用法）：renderer 用它判断要不要画速度线——
   * 速度线只在超必杀（tier 100）出现，见 renderer.ts 里 `mandorla.on && mandorla.tier === 100` */
  on = false;
  tier: 50 | 100 = 50;
  /** 本次绽放的配色，同样只读式公开——renderer 画速度线时跟着取同一份颜色，不必再传一次
   * 角色数据。trigger 时从出招者身上取，缺省回退到原先写死的藤黄→朱砂。 */
  glow: [string, string] = DEFAULT_GLOW;
  private aura: SuperAura = DEFAULT_AURA;
  private age = 0;

  /** super 事件触发一次；tier 决定后续 draw() 的尺寸/亮度档位，glow/aura 决定配色与花瓣形态 */
  trigger(tier: 50 | 100, glow?: [string, string], aura?: SuperAura) {
    this.on = true;
    this.tier = tier;
    this.glow = glow ?? DEFAULT_GLOW;
    this.aura = aura ?? DEFAULT_AURA;
    this.age = 0;
  }

  /**
   * 每逻辑 tick 调一次（freeze/慢镜跳帧分支也要调，同 banner.tick）。active 传 GameCanvas
   * 的 cine.dark>0：暗场退场即背光跟着退场，不必再维护第二套淡出计时器与 cine.dark 各算各的。
   */
  tick(active: boolean) {
    if (!this.on) return;
    if (!active) { this.on = false; return; }
    this.age++;
  }

  /**
   * 相机空间：画在暗场遮罩之后、出招者高亮重绘之前——压在暗场之上，垫在出招者之下。
   * x/y 是出招者的插值屏幕坐标；dark 是 cine.dark 当前值，直接拿来当整体亮度包络，
   * 与暗场同步淡出。
   */
  draw(ctx: CanvasRenderingContext2D, x: number, y: number, dark: number) {
    if (!this.on) return;
    const tierAlpha = this.tier === 100 ? 1 : 0.6;
    const alpha = dark * tierAlpha;
    if (alpha <= 0.01) return;
    const bloom = Math.min(1, this.age / BLOOM_TICKS);
    const tierScale = this.tier === 100 ? 1 : 0.7;
    const scale = bloom * tierScale;
    if (scale <= 0.01) return;

    ctx.save();
    ctx.translate(x, y);
    ctx.scale(scale, scale);
    ctx.rotate(this.age * ROT_SPEED);
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = alpha;

    const grad = ctx.createRadialGradient(0, 0, R_INNER * 0.3, 0, 0, R_TIP);
    grad.addColorStop(0, this.glow[0]);
    grad.addColorStop(1, this.glow[1]);
    ctx.fillStyle = grad;

    // 内环一道极淡的轮廓，让花瓣读得出"从一圈内环长出来"，而不是漂浮的碎片
    ctx.strokeStyle = this.glow[0];
    ctx.lineWidth = 1.5;
    ctx.globalAlpha = alpha * 0.35;
    ctx.beginPath();
    ctx.arc(0, 0, R_INNER, 0, Math.PI * 2);
    ctx.stroke();
    ctx.globalAlpha = alpha;

    const slot = (Math.PI * 2) / this.aura.petals;
    for (let i = 0; i < this.aura.petals; i++) petalPath(ctx, i * slot, slot, this.aura);

    ctx.restore();
  }
}
