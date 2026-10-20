import { LOGIC_H, LOGIC_W } from '../engine/types';
import type { CharacterDef } from '../engine/types';
import type { PartImage } from './parts';
// 与 banner.ts 同样在本文件里定义，不从 ui/theme 引：那边 import 了 render/palette，
// 反向引会绕成循环（render 不依赖 ui 是这一层的约束）
const SERIF = "'ShenxianSerif','Songti SC','SimSun','Noto Serif CJK SC',serif";

// 头像素材是 128×128 方图（public/chars/<id>/head.png），画在这个高度上——比 32px 骨骼头
// 大得多，SNK 式大头 cut-in
const PORTRAIT_W = 176;
const PORTRAIT_H = 232;
const CENTER_Y = LOGIC_H * 0.46;
const SLANT = 34;         // 斜切平行四边形的水平偏移——比方框更像那个年代的做法
// 头像中心到屏幕边缘的距离。跟 banner.ts 竖排卷轴的 SIDE_MARGIN(100) 不是同一个数——
// 头像更宽，需要更多留白，两者独立定义，改一个不牵动另一个
const SIDE_MARGIN = 150;
const SLIDE_TICKS = 10;   // 时停结束后滑出耗时（逻辑 tick）
const SLIDE_DIST = 420;   // 滑出位移量，确保离开可见区域（含宽屏 letterbox 之外）

/**
 * 发动瞬间的角色大头 cut-in：跟 MandorlaSystem/BannerSystem 同构的 plain class，GameCanvas
 * 用 useMemo 建一次，随固定步长逻辑 tick 推进——draw() 只读 outAge 插值，不自己计时。
 * 只给超必杀（tier 100）用，奥义不触发；调用方在 'super' 事件里按 tier 决定要不要 trigger
 * （见 GameCanvas.tsx）。
 */
export class CutInSystem {
  private on = false;
  private part: PartImage | null = null;   // null = 没立绘，走 def 的程序化回退
  private x = 0;
  private fc: 1 | -1 = 1;
  private outAge = 0; // 时停结束后经过的 tick 数；outAge>=SLIDE_TICKS 时关闭
  private def: CharacterDef | null = null;   // 无立绘时的程序化回退依据

  /** super 事件触发一次；part 为 null（缺 head.png，或整个 public/chars/ 都没有——两者
   * getHeadPart() 内部已经归一成同一个 null）时直接不开启——不崩、不画空框，这就是
   * "优雅退化"的全部实现。奥义（tier 50）时调用方应传 null 主动跳过，顺带清掉上一次
   * 超必杀可能还没滑完的残留状态，不会让两次大招的 cut-in 叠在一起。 */
  trigger(part: PartImage | null, casterFacing: 1 | -1, def?: CharacterDef) {
    // 没有立绘素材就**程序化画一张**，而不是整段不出现。
    // public/chars/ 里只有最早那四个人的 head.png，另外八个一张都没有——
    // 也就是说全场最隆重的那一下（超必杀发动的时停），十二个人里有八个是空白的。
    // 这个项目其余各层缺素材时都有程序化回退（音效/音乐全是合成的，骨骼缺件回退胶囊），
    // 唯独 cut-in 是直接不画。名字、配色、有没有头，这些数据每个角色都现成有。
    this.def = part ? null : (def ?? null);
    if (!part && !this.def) { this.on = false; return; }
    this.on = true;
    this.part = part;   // 有无立绘都往下走：fc/x/outAge 两条路完全一样，分叉只会让它们各写一遍
    this.fc = casterFacing;
    // 出招者自己面朝的一侧——竖排招式名钉在背朝的一侧（banner.ts 的 showMove 用
    // casterFacing===1 ? SIDE_MARGIN : LOGIC_W-SIDE_MARGIN），这里用相反的镜像公式，
    // 物理上两者永远落在屏幕两侧，不会相撞
    this.x = casterFacing === 1 ? LOGIC_W - SIDE_MARGIN : SIDE_MARGIN;
    this.outAge = 0;
  }

  /** 每逻辑 tick 调一次（freeze/慢镜跳帧分支也要调，同 mandorla.tick）。freezeActive 传
   * cine.freeze>0：时停内保持满位，时停一结束（本 tick 传入 false）开始倒数滑出。 */
  tick(freezeActive: boolean) {
    if (!this.on) return;
    if (freezeActive) { this.outAge = 0; return; }
    this.outAge++;
    if (this.outAge >= SLIDE_TICKS) this.on = false;
  }

  /**
   * 没有 head.png 时的程序化立绘：一具剪影胸像 + 角色名，配色取自角色自己的 palette。
   * 不追求像素级还原，追求的是**一眼认得出是谁**——十二个人十二种配色、十二个名字。
   *
   * headless 要照顾到：刑天断首之后「以乳为目，以脐为口」，这正是他的定位本体
   *（渲染层画骨骼时也是这么处理的）。给他画一颗头，等于把这个角色最要紧的一件事画反。
   */
  private drawProcedural(ctx: CanvasRenderingContext2D, def: CharacterDef, w: number, h: number) {
    const { main, accent } = def.palette;
    // 底：角色主色的竖向渐变，上深下亮，让剪影浮起来
    const g = ctx.createLinearGradient(0, -h / 2, 0, h / 2);
    g.addColorStop(0, main);
    g.addColorStop(1, '#0a0814');
    ctx.globalAlpha = 0.85;
    ctx.fillStyle = g;
    ctx.fillRect(-w / 2 - SLANT, -h / 2, w + SLANT * 2, h);
    ctx.globalAlpha = 1;

    // 胸像剪影：肩 + 头。比底色暗，靠 accent 描边把轮廓提出来
    const cy = h * 0.08;
    ctx.fillStyle = 'rgba(8,6,16,0.62)';
    ctx.beginPath();
    ctx.moveTo(-w * 0.42, h / 2);
    ctx.quadraticCurveTo(-w * 0.34, cy + h * 0.10, 0, cy + h * 0.08);
    ctx.quadraticCurveTo(w * 0.34, cy + h * 0.10, w * 0.42, h / 2);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = accent;
    ctx.globalAlpha = 0.5;
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.globalAlpha = 1;

    if (!def.headless) {
      const hy = cy - h * 0.16, hr = w * 0.17;
      ctx.fillStyle = 'rgba(8,6,16,0.62)';
      ctx.beginPath();
      ctx.arc(0, hy, hr, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 0.5;
      ctx.strokeStyle = accent;
      ctx.stroke();
      ctx.globalAlpha = 1;
      // 头饰：这一件才是"认得出是谁"的地方。此前十二个人共用一个光头圆，只差配色
      if (def.crown) drawCrown(ctx, def.crown, hy, hr);
    } else {
      // 无头：眼睛落在胸口，嘴落在腹上——把「头没了，手还在」画出来
      ctx.fillStyle = accent;
      for (const dx of [-w * 0.10, w * 0.10]) {
        ctx.beginPath(); ctx.ellipse(dx, cy + h * 0.02, 7, 4, 0, 0, Math.PI * 2); ctx.fill();
      }
      ctx.beginPath(); ctx.ellipse(0, cy + h * 0.14, 12, 6, 0, 0, Math.PI * 2); ctx.fill();
    }

    // 名字：压在胸像上，镜像回正（外层为了让人像朝屏幕中心做过 scale(fc,1)）
    ctx.save();
    ctx.scale(this.fc, 1);
    ctx.font = `bold 46px ${SERIF}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.lineWidth = 5;
    ctx.strokeStyle = 'rgba(8,6,16,0.9)';
    ctx.strokeText(def.name, 0, h * 0.30);
    ctx.fillStyle = accent;
    ctx.fillText(def.name, 0, h * 0.30);
    ctx.restore();
  }

  /** 屏幕空间：cam.restore 之后画。层次由调用方保证——压在速度线之上、竖排招式名之下。 */
  draw(ctx: CanvasRenderingContext2D) {
    if (!this.on || (!this.part && !this.def)) return;
    const t = Math.min(1, this.outAge / SLIDE_TICKS); // 0=在位，1=完全滑出
    const dx = t * SLIDE_DIST * this.fc; // 继续往它已经偏向的那一侧滑出屏幕外
    const w = PORTRAIT_W, h = PORTRAIT_H;

    ctx.save();
    ctx.translate(this.x + dx, CENTER_Y);
    ctx.scale(this.fc, 1); // 镜像画面内容，人像朝屏幕中心——跟骨骼头部同一套镜像约定
    ctx.beginPath();
    ctx.moveTo(-w / 2 + SLANT, -h / 2);
    ctx.lineTo(w / 2 + SLANT, -h / 2);
    ctx.lineTo(w / 2 - SLANT, h / 2);
    ctx.lineTo(-w / 2 - SLANT, h / 2);
    ctx.closePath();
    ctx.fillStyle = 'rgba(10,8,20,0.55)';
    ctx.fill();
    ctx.save();
    ctx.clip();
    const part = this.part;
    if (part) {
      // **保持长宽比**：这里原来是把源区域硬拉满 w×h。当年只有那四张手工素材、
      // 内容都接近正方（注释里写着"128×128 方图"），拉满看不出问题；
      // 而生成的素材内容是 124×95、100×124 这类非正方，拉进方框就明显变形（脸被压扁或抻长）。
      // 宽度必须也用**裁剪后**的内容宽（left..right），不能用 naturalWidth：
      // 混用"未裁的宽 + 裁过的高"会让 k 恒被宽度锁死（176/128），232px 的框高永远够不到——
      // 实测铁扇公主只画到 170.5px、雷震子只有 130.6px（框高的 56%），
      // 于是**有美术素材的角色反而比程序化兜底的小**，好坏顺序颠倒。
      // left/right 是 parts.ts 早就算好的，renderer 那边一直在用，只有这里漏了。
      const sx = part.left, sw = Math.max(1, part.right - part.left);
      const sh = Math.max(1, part.bottom - part.top);
      const k = Math.min(w / sw, h / sh);
      const dw = sw * k, dh = sh * k;
      ctx.drawImage(part.img, sx, part.top, sw, sh, -dw / 2, -dh / 2, dw, dh);
    } else if (this.def) {
      this.drawProcedural(ctx, this.def, w, h);
    }
    ctx.restore(); // 只撤销 clip，路径本身不受 save/restore 影响，下面 stroke 仍用同一条边框
    ctx.lineWidth = 4;
    ctx.strokeStyle = '#f4e9d0';
    ctx.stroke();
    ctx.restore();
  }
}

/**
 * 大招特写里那颗头上的一件头饰。**每个人一种**——此前十二个人共用一个光头圆、只差配色，
 * 玩家一句「新增神话人物的头像不该用默认」说的就是那个。
 * 画得很省：这是特写里一闪而过的东西，认得出是谁就够了，不是立绘。
 */
export function drawCrown(ctx: CanvasRenderingContext2D, c: NonNullable<CharacterDef['crown']>, hy: number, hr: number) {
  ctx.save();
  ctx.strokeStyle = c.color;
  ctx.fillStyle = c.color;
  ctx.lineWidth = Math.max(2, hr * 0.16);
  ctx.lineCap = 'round';
  const top = hy - hr;
  switch (c.kind) {
    case 'horns':                                    // 牛角：两侧外扬
      for (const s of [-1, 1]) {
        ctx.beginPath();
        ctx.moveTo(s * hr * 0.72, hy - hr * 0.45);
        ctx.quadraticCurveTo(s * hr * 1.5, hy - hr * 1.0, s * hr * 1.35, hy - hr * 1.55);
        ctx.stroke();
      }
      break;
    case 'ring':                                     // 金箍：贴额一圈
      ctx.beginPath();
      ctx.ellipse(0, hy - hr * 0.42, hr * 0.94, hr * 0.3, 0, Math.PI * 0.06, Math.PI * 0.94, true);
      ctx.stroke();
      break;
    case 'flame':                                    // 火焰：三簇上窜
      for (const [dx, hgt] of [[-0.5, 0.7], [0, 1.05], [0.5, 0.7]] as const) {
        ctx.beginPath();
        ctx.moveTo(dx * hr, top + hr * 0.1);
        ctx.quadraticCurveTo(dx * hr + hr * 0.28, top - hr * hgt * 0.6, dx * hr, top - hr * hgt);
        ctx.quadraticCurveTo(dx * hr - hr * 0.28, top - hr * hgt * 0.6, dx * hr, top + hr * 0.1);
        ctx.fill();
      }
      break;
    case 'ears':                                     // 大耳：两侧垂下
      for (const s of [-1, 1]) {
        ctx.beginPath();
        ctx.ellipse(s * hr * 1.05, hy - hr * 0.1, hr * 0.34, hr * 0.6, s * 0.3, 0, Math.PI * 2);
        ctx.fill();
      }
      break;
    case 'thirdEye':                                 // 第三只眼：竖瞳
      ctx.beginPath();
      ctx.ellipse(0, hy - hr * 0.35, hr * 0.16, hr * 0.4, 0, 0, Math.PI * 2);
      ctx.fill();
      break;
    case 'buns':                                     // 双髻
      for (const s of [-1, 1]) {
        ctx.beginPath();
        ctx.arc(s * hr * 0.7, top + hr * 0.04, hr * 0.34, 0, Math.PI * 2);
        ctx.fill();
      }
      break;
    case 'cap':                                      // 幞头：官帽 + 两翅
      ctx.beginPath();
      ctx.rect(-hr * 0.8, top - hr * 0.55, hr * 1.6, hr * 0.62);
      ctx.fill();
      for (const s of [-1, 1]) {
        ctx.beginPath();
        ctx.moveTo(s * hr * 0.8, top - hr * 0.24);
        ctx.lineTo(s * hr * 1.55, top - hr * 0.34);
        ctx.stroke();
      }
      break;
    case 'pin':                                      // 发簪：斜插一根
      ctx.beginPath();
      ctx.moveTo(-hr * 0.9, top - hr * 0.15);
      ctx.lineTo(hr * 0.65, top - hr * 0.75);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(hr * 0.75, top - hr * 0.79, hr * 0.2, 0, Math.PI * 2);
      ctx.fill();
      break;
    case 'skull':                                    // 骷髅：两个空眼窝
      for (const s of [-1, 1]) {
        ctx.beginPath();
        ctx.ellipse(s * hr * 0.38, hy - hr * 0.12, hr * 0.2, hr * 0.26, 0, 0, Math.PI * 2);
        ctx.fill();
      }
      break;
    case 'band':                                     // 抹额：一条横带 + 垂尾
      ctx.beginPath();
      ctx.moveTo(-hr * 0.95, hy - hr * 0.4);
      ctx.lineTo(hr * 0.95, hy - hr * 0.4);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(hr * 0.9, hy - hr * 0.4);
      ctx.lineTo(hr * 1.35, hy + hr * 0.35);
      ctx.stroke();
      break;
    case 'wings':                                    // 双翅：头侧张开
      for (const s of [-1, 1]) {
        ctx.beginPath();
        ctx.moveTo(s * hr * 0.85, hy - hr * 0.25);
        ctx.quadraticCurveTo(s * hr * 1.9, hy - hr * 1.1, s * hr * 1.7, hy - hr * 0.05);
        ctx.quadraticCurveTo(s * hr * 1.4, hy - hr * 0.35, s * hr * 0.85, hy - hr * 0.25);
        ctx.fill();
      }
      break;
  }
  ctx.restore();
}
