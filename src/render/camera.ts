import { LOGIC_W } from '../engine/types';

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));

export class Camera {
  x = LOGIC_W / 2;
  zoom = 1;
  private shake = 0;
  private sx = 0;
  private sy = 0;
  /** 演出焦点覆写：设置后 follow 朝焦点收敛，忽略双人跟随逻辑 */
  focus: { x: number; zoom: number } | null = null;

  /** focusWho 给定时，焦点每帧改写成那一位的当前 x（演出期间跟着出招者走）；给 null 则
   * 焦点固定在设置时的位置（KO 慢镜要的正是钉住倒下的那一位，不跟）。
   *
   * 为什么焦点必须会跟：cam.focus.x 原来只在大招发动瞬间取一次，而四个大招后来都加了
   * 冲刺，出招者会离开那个点 105-157px——整段演出镜头钉在过时的位置上，人冲出画面中心，
   * 焦点释放后再慢慢漂 168-210px 追回来。跟随之后滞后降到 71px（0.25 lerp 的稳态跟踪
   * 误差，跟不掉的那部分），释放后回漂降到 56-73px。 */
  follow(p1x: number, p2x: number, focusWho: 0 | 1 | null = null) {
    if (this.focus) {
      if (focusWho !== null) this.focus.x = focusWho === 0 ? p1x : p2x;
      this.x = lerp(this.x, this.focus.x, 0.25);
      this.zoom = lerp(this.zoom, this.focus.zoom, 0.25);
      return;
    }
    const mid = (p1x + p2x) / 2;
    const dist = Math.abs(p2x - p1x);
    this.x = lerp(this.x, clamp(mid, LOGIC_W * 0.35, LOGIC_W * 0.65), 0.08);
    this.zoom = lerp(this.zoom, clamp(1.25 - dist / 1600, 0.85, 1.15), 0.05);
  }

  addShake(power: number) { this.shake = Math.max(this.shake, power); }

  tick() {
    this.shake *= 0.85;
    if (this.shake < 0.3) this.shake = 0;
    this.sx = (Math.random() * 2 - 1) * this.shake;
    this.sy = (Math.random() * 2 - 1) * this.shake;
  }

  screenY(worldY: number) { return 300 + this.sy + (worldY - 300) * this.zoom; }

  apply(ctx: CanvasRenderingContext2D) {
    ctx.save();
    ctx.translate(LOGIC_W / 2 + this.sx, 300 + this.sy);
    ctx.scale(this.zoom, this.zoom);
    ctx.translate(-this.x, -300);
  }

  restore(ctx: CanvasRenderingContext2D) { ctx.restore(); }
}
