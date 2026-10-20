import { FLOOR_Y } from '../engine/types';
import type { Fighter, FxType, Move } from '../engine/types';

/** 6 位 hex 转带透明度的 rgba。
 * 原本定义在 renderer.ts，但 fx 也要用它画沿轴渐隐的光束，而 renderer 已经 import fx——
 * 反向 import 会成环。放在这里（fx 只依赖 engine/types，是更底的一层），
 * renderer 再导出，原有 import 路径全部不变。 */
export function hexAlpha(hex: string, a: number): string {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${n >> 16},${(n >> 8) & 255},${n & 255},${a})`;
}

interface P {
  alive: boolean; type: FxType;
  x: number; y: number; vx: number; vy: number;
  life: number; max: number; size: number; color: string; angle: number;
}

const POOL = 256;
// shockwave 半径/线宽的 1x 基准 size；招式 fx 时间轴里已有的 shockwave 事件都没传 size，
// 隐式吃 spawn() 的默认值 6，所以把基准定在 6 上——不传 size 时视觉与改动前完全一致，
// 只有本任务新增的、显式传更大 size 的重击冲击波会变大
const SHOCK_BASE_SIZE = 6;

export class FxSystem {
  private pool: P[] = Array.from({ length: POOL }, () => ({
    alive: false, type: 'spark', x: 0, y: 0, vx: 0, vy: 0, life: 0, max: 1, size: 4, color: '#fff', angle: 0,
  }));
  flashAlpha = 0; // 全屏白闪，draw 后由 GameCanvas 叠加
  private flashHold = 0; // 白闪维持满亮度的剩余 tick 数，过完才开始衰减——按 tick 推进，非渲染帧
  /** 每个 Fighter 上次触发 fx 时的 (move, stateFrame)，用于防止同一帧被重复调用时重复触发（例如 hitstop 冻结期间 stateFrame 不推进） */
  private lastSync = new WeakMap<Fighter, { move: Move; frame: number }>();

  aliveCount() { return this.pool.filter(p => p.alive).length; }

  private take(): P | null {
    for (const p of this.pool) if (!p.alive) return p;
    return null;
  }

  spawn(type: FxType, x: number, y: number, o: { color: string; size?: number; angle?: number } = { color: '#fff' }) {
    // flash 复用 size 字段表达"额外维持满亮度多少 tick"——省得为一个可选参数单开一条 spawn 分支；
    // 调用方不传就是 0（原行为：立刻开始按固定速率衰减）
    if (type === 'flash') { this.flashAlpha = 0.7; this.flashHold = o.size ?? 0; return; }
    const count = type === 'burst' ? 14 : type === 'shockwave' ? 3 : type === 'spark' ? 6 : 1;
    for (let i = 0; i < count; i++) {
      const p = this.take();
      if (!p) return;
      p.alive = true; p.type = type; p.x = x; p.y = y;
      p.color = o.color; p.angle = o.angle ?? 0;
      p.size = o.size ?? 6;
      p.vx = 0; p.vy = 0;
      switch (type) {
        case 'burst': {
          const a = (i / 14) * Math.PI * 2;
          p.vx = Math.cos(a) * (3 + Math.random() * 4);
          p.vy = Math.sin(a) * (3 + Math.random() * 4);
          p.life = p.max = 18 + Math.random() * 10;
          break;
        }
        case 'spark': {
          p.vx = (Math.random() * 2 - 1) * 8;
          p.vy = -Math.random() * 6;
          p.life = p.max = 14;
          break;
        }
        case 'ring': p.life = p.max = 22; break;
        case 'shockwave': p.life = p.max = 16 + i * 6; break;
        case 'beam': p.life = p.max = 14; p.size = o.size ?? 40; break;
        case 'trail': p.life = p.max = 12; break;
        case 'glyph': p.life = p.max = 40; p.size = o.size ?? 60; break;
        case 'crescent': p.life = p.max = 20; p.size = o.size ?? 24; break;
        case 'bolt': p.life = p.max = 16; p.size = o.size ?? 10; break;
      }
    }
  }

  /**
   * 攻击中按 stateFrame 触发招式的 fx 时间轴。调用方每逻辑帧调用一次，但 hitstop 冻结期间
   * battle.tick 提前返回、stateFrame 不会推进，调用方仍可能重复调用本方法——这里按
   * (move, stateFrame) 去重，同一招式同一帧只触发一次，帧推进后自然解除。
   */
  /**
   * @param reachGap 这一招"视觉够不到判定框前沿"的缺口（见 renderer 的 visualReachGap）。
   *   >0 时在**判定生效那一帧**于判定框前沿补一发冲击波——玩家的规矩是
   *   "被打了视觉上得有东西够到"，而必杀/超必杀的特效实测撑不到它们自己的判定前沿。
   *   补在前沿而不是把原特效拉大：原特效是按招式节奏摆的，动它会改掉招式的样子。
   */
  syncMoveFx(f: Fighter, reachGap = 0) {
    if (f.state !== 'attack' || !f.move) return;
    const last = this.lastSync.get(f);
    if (last && last.move === f.move && last.frame === f.stateFrame) return;
    this.lastSync.set(f, { move: f.move, frame: f.stateFrame });
    for (const ev of f.move.fx) {
      if (ev.frame === f.stateFrame) {
        this.spawn(ev.type, f.x + (ev.x ?? 0) * f.facing, FLOOR_Y - f.y - (ev.y ?? 0),
          { color: ev.color, size: ev.size, angle: (ev.angle ?? 0) * f.facing });
      }
    }
    // 补位：判定生效那一帧，在判定框前沿补一发。颜色跟这一招自己的特效走，
    // 没有特效就用兵器刃色——补出来的东西要像这一招的一部分，不是凭空一个白圈
    if (reachGap > 0 && f.stateFrame === f.move.startup) {
      const hb = f.move.hitbox;
      const color = f.move.fx.at(-1)?.color ?? f.def.weapon?.edge ?? '#ffffff';
      this.spawn('shockwave', f.x + (hb.x + hb.w - 10) * f.facing,
        FLOOR_Y - f.y - (hb.y + hb.h / 2), { color, size: Math.min(46, 22 + reachGap * 0.25) });
    }
  }

  tick() {
    if (this.flashAlpha > 0) {
      if (this.flashHold > 0) this.flashHold--;
      else this.flashAlpha = Math.max(0, this.flashAlpha - 0.08);
    }
    for (const p of this.pool) {
      if (!p.alive) continue;
      p.life--;
      if (p.life <= 0) { p.alive = false; continue; }
      p.x += p.vx; p.y += p.vy;
      if (p.type === 'burst' || p.type === 'spark') p.vy += 0.3;
    }
  }

  draw(ctx: CanvasRenderingContext2D) {
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (const p of this.pool) {
      if (!p.alive) continue;
      const t = p.life / p.max; // 1 → 0
      ctx.globalAlpha = t;
      ctx.fillStyle = p.color;
      ctx.strokeStyle = p.color;
      switch (p.type) {
        case 'burst':
        case 'spark':
          ctx.beginPath(); ctx.arc(p.x, p.y, p.size * t, 0, Math.PI * 2); ctx.fill();
          break;
        case 'ring': {
          ctx.lineWidth = 4 * t;
          const r = (1 - t) * 120;
          ctx.beginPath(); ctx.arc(p.x, p.y, r + 4, 0, Math.PI * 2); ctx.stroke();
          break;
        }
        case 'shockwave': {
          // 半径/线宽随 size 放大（基准见 SHOCK_BASE_SIZE）——重击冲击波要比普通命中更有分量
          const scale = p.size / SHOCK_BASE_SIZE;
          ctx.lineWidth = 4 * t * scale;
          const r = (1 - t) * 220 * scale;
          ctx.beginPath(); ctx.arc(p.x, p.y, r + 4, 0, Math.PI * 2); ctx.stroke();
          break;
        }
        case 'beam': {
          ctx.save();
          ctx.translate(p.x, p.y); ctx.rotate(p.angle);
          // 沿轴向渐隐，不再是一整块不透明色块——裸 fillRect 在深色场景里读成
          // "一块没贴图的方块糊在场上"，而不是一道光。
          const bg = ctx.createLinearGradient(0, 0, 420, 0);
          bg.addColorStop(0, hexAlpha(p.color, 0.9));
          bg.addColorStop(0.55, hexAlpha(p.color, 0.5));
          bg.addColorStop(1, hexAlpha(p.color, 0));
          ctx.fillStyle = bg;
          ctx.fillRect(0, -p.size / 2 * t, 420, p.size * t);
          ctx.restore();
          break;
        }
        case 'trail':
          ctx.beginPath(); ctx.arc(p.x, p.y, p.size * (1.2 - t), 0, Math.PI * 2); ctx.fill();
          break;
        case 'glyph': {
          ctx.save();
          ctx.translate(p.x, p.y); ctx.rotate((1 - t) * Math.PI);
          ctx.lineWidth = 3;
          ctx.beginPath(); ctx.arc(0, 0, p.size, 0, Math.PI * 2); ctx.stroke();
          for (let k = 0; k < 3; k++) {
            ctx.rotate(Math.PI * 2 / 3);
            ctx.strokeRect(-p.size * 0.55, -p.size * 0.55, p.size * 1.1, p.size * 1.1);
          }
          ctx.restore();
          break;
        }
        case 'crescent': {
          // 新月剑气弧：一段有厚度的扇环（外弧+内弧收口），随 t 从内向外扩张、变薄、淡出。
          // 形状只由 (x,y,angle,size,t) 这几个数值字段决定，逐帧重算也不会闪烁。
          const grow = (1 - t) * p.size * 2.6;
          const outer = p.size * 0.6 + grow;
          const inner = Math.max(outer - (p.size * 0.5 + 2) * t, 1);
          const half = 0.5; // 弧张角半宽（弧度）
          ctx.beginPath();
          ctx.arc(p.x, p.y, outer, p.angle - half, p.angle + half);
          ctx.arc(p.x, p.y, inner, p.angle + half, p.angle - half, true);
          ctx.closePath();
          ctx.fill();
          break;
        }
        case 'bolt': {
          // 折线闪电：从 (x,y) 沿 angle 方向劈出，锯齿偏移由 (x,y,angle,size) 的固定哈希决定
          // （不是 Math.random()），同一粒子每帧重算都得到同一条路径，只有线宽/透明度随 t 变化。
          const len = 60 + p.size * 6;
          const segs = 5;
          const dx = Math.cos(p.angle), dy = Math.sin(p.angle);
          const nx = -dy, ny = dx; // 垂直方向，用来抖出锯齿
          const seedBase = p.x * 0.13 + p.y * 0.29 + p.angle * 11 + p.size * 0.7;
          const hash = (n: number) => {
            const s = Math.sin(n * 12.9898 + seedBase * 78.233) * 43758.5453;
            return s - Math.floor(s); // 0..1，纯算术，无 Math.random / 无时钟
          };
          const pts: [number, number][] = [[p.x, p.y]];
          for (let i = 1; i <= segs; i++) {
            const along = (len * i) / segs;
            const jitter = (hash(i) - 0.5) * 16 * (1 - (i / segs) * 0.5);
            pts.push([p.x + dx * along + nx * jitter, p.y + dy * along + ny * jitter]);
          }
          ctx.lineWidth = 1.5 + 2 * t;
          ctx.beginPath();
          ctx.moveTo(pts[0][0], pts[0][1]);
          for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
          ctx.stroke();
          const forks = 1 + (hash(99) > 0.5 ? 1 : 0); // 固定几何：1-2 次分叉
          for (let k = 0; k < forks; k++) {
            const at = pts[2 + k] ?? pts[pts.length - 1];
            const forkAngle = p.angle + (hash(200 + k) - 0.5) * 1.2;
            const flen = len * 0.32;
            ctx.beginPath();
            ctx.moveTo(at[0], at[1]);
            ctx.lineTo(at[0] + Math.cos(forkAngle) * flen, at[1] + Math.sin(forkAngle) * flen);
            ctx.stroke();
          }
          break;
        }
      }
    }
    ctx.restore();
    ctx.globalAlpha = 1;
  }
}
