import { DESPERATE_HP, FLOOR_Y, LOGIC_H, LOGIC_W } from '../engine/types';
import type { Battle } from '../engine/battle';
import type { CharacterDef, Fighter, Move, WeaponDef } from '../engine/types';
import { worldBox } from '../engine/collision';
import { drawAdornments, drawDecals, drawFlung, drawWings, isDisarmed } from './adornments';
import { skeletalSource, type PoseSource, type SkelDoc } from './poseSource';
import { Camera } from './camera';
import { FxSystem, hexAlpha } from './fx';
import { drawCrown } from './cutin';
import { BannerSystem } from './banner';
import { MandorlaSystem } from './mandorla';
import { CutInSystem } from './cutin';
import { drawHitCounter } from './hitCounter';
import { MOTIONS } from '../data/motions';
import { samplePose, lerpPose } from './motion';
import type { Pose } from './motion';
import { DEFAULT_BG, type StageBg } from '../data/stages';
import { loadParts, type PartImage, type PartImages } from './parts';
import { spriteAction } from './spriteAction';
import { alternateHurt, groundedHurtPose, knockdownPose } from './damageReaction';
import { drawOriginalAction, drawOriginalPortrait, isOriginalFighter, onOriginalAssetsLoaded,
  originalAction, originalFighterReady, originalHeadPart, preloadOriginalFighter, type AtlasAction } from './originalAtlas';
import { INK } from './palette';
import { t as tr } from '../i18n';

// 部件图缓存：'pending' = 加载中（防止 60fps 重复发起探测请求），PartImages = 已探测完成
// （逐件独立结果，可能任意子集为空，包括全空）。两态缺一不可——不区分 in-flight/resolved
// 会导致反复发起探测请求。"还没问过"用 Map 里没有这个 key 表示，不需要第三个显式状态。
type PartsCacheEntry = PartImages | 'pending';
const partsCache = new Map<string, PartsCacheEntry>();

/** fire-and-forget：不阻塞任何一帧，画面永远读缓存里已有的东西 */
/** 部件加载完成时的回调。选人页立绘**只画一次**（挂载那一刻），
 * 而部件是 fire-and-forget 异步探测的——立绘画完时素材往往还没到，
 * getParts 返回 null，于是画成火柴人，之后再也不重画。
 * 对局没这问题（每帧重画，素材一到自然就用上了），所以这个坑只在立绘上显形。
 * 让加载完成时能通知一声，立绘补画一次即可。 */
const partsWaiters = new Set<() => void>();
export function onPartsLoaded(fn: () => void): () => void {
  partsWaiters.add(fn);
  const offOriginal = onOriginalAssetsLoaded(fn);
  return () => { partsWaiters.delete(fn); offOriginal(); };
}

export function preloadParts(id: string): void {
  if (isOriginalFighter(id)) { void preloadOriginalFighter(id); return; }
  if (partsCache.has(id)) return; // 已在探测中或已有结果，不重复发起
  partsCache.set(id, 'pending');
  // catch 是必须的：loadParts 抛出时（见 parts.ts 的 verticalBounds）原来会把这个 id
  // **永久留在 'pending'**——has(id) 挡住后续每一次重试，等待者一个都不触发，
  // 那个角色整场都是火柴人，且控制台只有一条 unhandled rejection。
  // 失败就把坑位删掉让下次能重来，并且照样通知一次，让立绘先按火柴人画出来。
  loadParts(id)
    .then(p => {
      partsCache.set(id, p);
      // A full-body fighter with any pose missing (a dropped request) would stay invisible; free the slot so
      // fighterReady() re-requests it after a pause.
    })
    .catch(() => { partsCache.delete(id); })
    .finally(() => { for (const w of [...partsWaiters]) w(); });
}

function getParts(id: string): PartImages | null {
  const e = partsCache.get(id);
  return e && e !== 'pending' ? e : null;
}

/** Full-body footballers have no acceptable procedural fallback (it draws the original game's stick
 * figure), so they stay invisible until their painted sprites are in. Everyone else is always ready. */
export function fighterReady(def: CharacterDef): boolean {
  if (isOriginalFighter(def.id)) return originalFighterReady(def.id);
  if (!def.footballKit) return true;
  if (isActionSprites(getParts(def.id))) return true;
  preloadParts(def.id); // no-op while a load is in flight; retries once a failed load has been released
  return false;
}

export interface PrevPos { x1: number; y1: number; x2: number; y2: number }

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

export function capturePrev(b: Battle): PrevPos {
  return { x1: b.p1.x, y1: b.p1.y, x2: b.p2.x, y2: b.p2.y };
}

/** 确定性伪随机（GLSL 老套路的 sin-hash）：只吃 seed 派生的数字，逐帧结果恒定，
 * 不能换成 Math.random —— 否则云纹/山形每帧重算会"沸腾" */
function hash(n: number): number {
  const s = Math.sin(n) * 43758.5453;
  return s - Math.floor(s);
}

// hexAlpha 的定义挪到了 fx.ts（fx 也要用它，而 renderer 已经 import fx，反向 import 会成环）。
// 这里再导出，adornments/banner/validate 及测试里原有的 import 路径全部不变。
export { hexAlpha };

// 光晕渐变按关卡缓存：celestialColor 和 cx/cy/r 全是关卡固定值，每帧 createRadialGradient
// 纯属浪费。StageBg 对象本身是 data/stages.ts 里的静态常量（生命周期等同应用），Map 不会泄漏。
const celestialHaloCache = new Map<StageBg, CanvasGradient>();
const stageArtCache = new Map<string, HTMLImageElement>();
const fighterArtCache = new Map<string, HTMLImageElement>();

/** Wait this long before re-requesting an image that failed (a dropped request otherwise left the stage
 * permanently on its dark loading fill, and that dark frame then became the FastH3 clip's first frame). */
const IMAGE_RETRY_MS = 3000;
const imageFailedAt = new WeakMap<HTMLImageElement, number>();

function cachedImage(cache: Map<string, HTMLImageElement>, url: string): HTMLImageElement {
  let image = cache.get(url);
  const failedAt = image ? imageFailedAt.get(image) : undefined;
  if (!image || (failedAt !== undefined && performance.now() - failedAt > IMAGE_RETRY_MS)) {
    const next = new Image();
    next.onerror = () => imageFailedAt.set(next, performance.now());
    next.src = url;
    cache.set(url, next);
    // Keep drawing nothing new until the retry lands; the caller checks complete/naturalWidth.
    image = next;
  }
  return image;
}
function getCelestialHalo(ctx: CanvasRenderingContext2D, bg: StageBg, cx: number, cy: number, r: number): CanvasGradient {
  let g = celestialHaloCache.get(bg);
  if (!g) {
    g = ctx.createRadialGradient(cx, cy, r * 0.4, cx, cy, r * 2.6);
    g.addColorStop(0, hexAlpha(bg.celestialColor, 0.35));
    g.addColorStop(1, hexAlpha(bg.celestialColor, 0));
    celestialHaloCache.set(bg, g);
  }
  return g;
}

/** 天体：每关固定一个，不参与视差（画在屏幕空间固定坐标），加一圈柔光晕做区分 */
/**
 * 天体挂在哪、多大：按 seed 派生。
 *
 * 此前十二关的日月**钉死在同一个点**（800, 86）、同一个半径 34——山形按 seed 各不相同、
 * 云纹按 seed 各不相同，唯独天上那一颗，十二关分毫不差地挂在右上角同一个位置。
 * 换关时最显眼的那一块反而是最没变的。
 *
 * 范围是照着构图定的，不是随手取的：
 *   cx 200~860——再往左会压到左侧血条底下（血条从两边向中间伸），再往右会出安全区
 *   cy 58~148——上不出画，下不进地平线（剪影山脊在 300 上下）
 *   r  26~44 ——比 26 小就读不出是什么，比 44 大会把半个天空占掉
 */
export function celestialPlace(seed: number): { cx: number; cy: number; r: number } {
  return {
    cx: 200 + hash(seed * 1.7 + 11.3) * 660,
    cy: 58 + hash(seed * 2.9 + 4.1) * 90,
    r: 26 + hash(seed * 4.3 + 7.9) * 18,
  };
}

function drawCelestial(ctx: CanvasRenderingContext2D, bg: StageBg) {
  const { cx, cy, r } = celestialPlace(bg.seed);
  ctx.fillStyle = getCelestialHalo(ctx, bg, cx, cy, r);
  ctx.beginPath(); ctx.arc(cx, cy, r * 2.6, 0, Math.PI * 2); ctx.fill();

  if (bg.celestial === 'sun') { // 日轮：加一圈短射线
    ctx.strokeStyle = hexAlpha(bg.celestialColor, 0.55);
    ctx.lineWidth = 2;
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2;
      ctx.beginPath();
      ctx.moveTo(cx + Math.cos(a) * (r + 6), cy + Math.sin(a) * (r + 6));
      ctx.lineTo(cx + Math.cos(a) * (r + 16), cy + Math.sin(a) * (r + 16));
      ctx.stroke();
    }
  }
  ctx.fillStyle = bg.celestialColor;
  ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.fill();
  if (bg.celestial === 'crescent') { // 挖掉一个偏心圆，啃出月牙；save/restore 包住合成模式，
    // 而非手动复位——中间万一被人加个 early return，手动复位那行会被跳过，合成模式漏出去
    ctx.save();
    ctx.globalCompositeOperation = 'destination-out';
    ctx.beginPath(); ctx.arc(cx + r * 0.55, cy - r * 0.25, r * 0.9, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  }
}

/** 如意云纹最小语汇单元：一段拱起主弧 + 弧尾向内卷入的螺旋，区别于写实蓬松云的关键就在这道内卷 */
function drawRuyiCloud(ctx: CanvasRenderingContext2D, cx: number, cy: number, scale: number, rot: number, color: string) {
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(rot);
  ctx.scale(scale, scale);
  ctx.strokeStyle = color;
  ctx.lineWidth = 2.5 / scale;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(-26, 6);
  ctx.bezierCurveTo(-26, -20, -2, -26, 16, -14); // 主弧：如意头部的拱起轮廓
  ctx.bezierCurveTo(30, -6, 32, 10, 20, 17);      // 弧尾开始向内卷
  ctx.bezierCurveTo(11, 22, 2, 16, 7, 7);          // 螺旋第一圈
  ctx.bezierCurveTo(10, 1, 17, 3, 15, 9);          // 螺旋收尾，卷向中心
  ctx.stroke();
  ctx.beginPath(); // 尾端飘带，衬出云气的轻盈
  ctx.moveTo(-26, 6);
  ctx.quadraticCurveTo(-40, 12, -52, 8);
  ctx.stroke();
  ctx.restore();
}

/** 3–5 组如意云纹，0.15 倍视差；位置/大小/旋转全部由 seed 派生的 hash 决定。visW/offX 只改
 * hash 结果映射到的坐标范围（撑满可见宽度、按可见范围居中），hash 本身吃的种子不变——宽屏
 * 上云纹会散得更开，不是种子/视差推导方式变了 */
function drawClouds(ctx: CanvasRenderingContext2D, bg: StageBg, camX: number, visW: number, offX: number) {
  const color = hexAlpha(bg.sky[1], 0.4);
  const n = 3 + (bg.seed % 3);
  for (let i = 0; i < n; i++) {
    const x = hash(bg.seed + i * 12.9) * visW - offX + camX * 0.15;
    const y = 50 + hash(bg.seed * 3.1 + i * 7.7) * 150;
    const scale = 0.6 + hash(bg.seed * 5.3 + i * 3.3) * 0.7;
    const rot = (hash(bg.seed * 9.7 + i * 5.1) - 0.5) * 0.8;
    drawRuyiCloud(ctx, x, y, scale, rot, color);
  }
}

/** 剪影山形：seed 正弦叠加。far/near 两层复用同一形状函数，靠 seed 偏移和振幅/频率区分，不同形。
 * x0/x1 是本次要画满的可见逻辑 x 范围（默认 0..LOGIC_W，宽屏时由调用方传更宽的范围）——山形
 * 曲线本身的算法（wx 的推导）不变，只是多算几段延伸到新边界 */
function drawSilhouette(
  ctx: CanvasRenderingContext2D, color: string, seed: number, camX: number, parallax: number,
  baseH: number, amp1: number, amp2: number, xFreq: number, wxMul2: number, x0: number, x1: number,
) {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(x0, FLOOR_Y);
  for (let x = x0; x <= x1; x += 16) {
    const wx = (x + camX * parallax) * xFreq;
    const h = baseH + Math.sin(wx + seed) * amp1 + Math.sin(wx * wxMul2 + seed * 3) * amp2;
    ctx.lineTo(x, FLOOR_Y - h);
  }
  ctx.lineTo(x1, FLOOR_Y);
  ctx.closePath();
  ctx.fill();
}

// 背景四层，由远及近：渐变天空 → 天体（不参与视差）→ 如意云纹（0.15x）→ 远山剪影（0.3x，已有）
// → 近景剪影（0.6x，新增）。整体画在 cam.apply 之前的屏幕空间，不随相机缩放/抖动；视差靠 camX
// 手动加权算偏移，而非交给画布变换（若挪到 cam.apply 之后，相机的整体平移+缩放会再叠加一层，
// 视差就会双重生效或错位）。visW/visH 默认等于 LOGIC_W/LOGIC_H（不传时行为与改动前完全一致），
// 宽于/高于安全区时由调用方（draw()）传实际可见的逻辑尺寸，背景铺满整块画布，不再露出页面底色。
// 天体（drawCelestial）不是按 seed 派生位置，本来就没有"绘制范围"要跟着变宽——固定挂在安全区
// 右上角，跟这次改动无关，不动它
const gradedArtCache = new Map<string, HTMLCanvasElement>();

/** The stage art with its time-of-day filter baked in once. Filtering the full-screen image every frame
 * costs a GPU pass per frame on phones; the graded copy is drawn like any other image. */
function gradedArt(img: HTMLImageElement, filter?: string): CanvasImageSource & { naturalWidth?: number; width: number; height: number } {
  if (!filter || filter === 'none') return img;
  const key = `${img.src}|${filter}`;
  let canvas = gradedArtCache.get(key);
  if (!canvas) {
    canvas = document.createElement('canvas');
    canvas.width = img.naturalWidth;
    canvas.height = img.naturalHeight;
    const g = canvas.getContext('2d');
    if (!g) return img;
    g.filter = filter;
    g.drawImage(img, 0, 0);
    gradedArtCache.set(key, canvas);
  }
  return canvas;
}

/** Cover the viewport while pinning the authored walking surface to the camera-transformed feet. */
export function stageArtPlacement(imageW: number, imageH: number, visW: number, visH: number,
  floorRatio?: number, floorY = FLOOR_Y) {
  const offX = (visW - LOGIC_W) / 2, offY = (visH - LOGIC_H) / 2;
  const anchored = floorRatio !== undefined && floorRatio > 0 && floorRatio < 1;
  const sourceFloor = imageH * (floorRatio ?? 0.5);
  const scale = anchored
    ? Math.max(visW / imageW, (floorY + offY) / sourceFloor,
      (LOGIC_H + offY - floorY) / (imageH - sourceFloor))
    : Math.max(visW / imageW, visH / imageH);
  const width = imageW * scale, height = imageH * scale;
  return { x: -offX + (visW - width) / 2,
    y: anchored ? floorY - sourceFloor * scale : -offY + (visH - height) / 2, width, height };
}

export function drawBg(ctx: CanvasRenderingContext2D, bg: StageBg, camX: number, visW = LOGIC_W, visH = LOGIC_H, floorY = FLOOR_Y) {
  const offX = (visW - LOGIC_W) / 2, offY = (visH - LOGIC_H) / 2;
  if (bg.artUrl) {
    const raw = cachedImage(stageArtCache, bg.artUrl);
    const image = raw.complete && raw.naturalWidth > 0 ? gradedArt(raw, bg.artFilter) : raw;
    if (raw.complete && raw.naturalWidth > 0) {
      const rect = stageArtPlacement(raw.naturalWidth, raw.naturalHeight, visW, visH, bg.artFloorY, floorY);
      ctx.drawImage(image, rect.x, rect.y, rect.width, rect.height);
      const wash = ctx.createLinearGradient(0, 0, 0, visH);
      wash.addColorStop(0, 'rgba(4,10,24,.08)');
      wash.addColorStop(.7, 'rgba(4,8,18,.02)');
      wash.addColorStop(1, 'rgba(3,7,14,.28)');
      ctx.fillStyle = wash;
      ctx.fillRect(-offX, -offY, visW, visH);
      return;
    }
    // Painted stage still loading: a plain night fill, not the procedural sky/moon/hills of the
    // original game, which flashed as a different, unfinished-looking scene.
    ctx.fillStyle = '#06101d';
    ctx.fillRect(-offX, -offY, visW, visH);
    return;
  }
  const g = ctx.createLinearGradient(0, 0, 0, FLOOR_Y);
  g.addColorStop(0, bg.sky[0]);
  g.addColorStop(1, bg.sky[1]);
  ctx.fillStyle = g;
  // 天空铺满整块画布高度（下沿到 LOGIC_H + offY，即 visH），不是只铺到 FLOOR_Y——地面紧接着
  // 在 cam.apply 之内按世界坐标画，zoom>1 时地面在屏幕上的起始 y 会低于 FLOOR_Y（贴近镜头
  // 把地平线推下去了），如果天空只填到 FLOOR_Y，460 到地面实际起始 y 之间那条横带就没有任何
  // 绘制覆盖——上一帧角色腿部的像素会留在原地。走路会改变双方距离进而改变 zoom，残影就是
  // 这么冒出来的（task-30）。天空现在是"每帧重画一次、覆盖全画布"的基础层，之后不管地面/
  // 角色实际画到哪，画不到的地方最多露出天空色，不会露出上一帧的残留像素
  ctx.fillRect(-offX, -offY, visW, visH);
  drawStars(ctx, bg, camX, visW, offX, offY);
  drawCelestial(ctx, bg);
  drawClouds(ctx, bg, camX, visW, offX);
  drawSilhouette(ctx, bg.silhouette, bg.seed, camX, 0.3, 90, 45, 25, 0.008, 2.7, -offX, LOGIC_W + offX);
  drawSilhouette(ctx, shade(bg.silhouette, -18), bg.seed * 7 + 13, camX, 0.6, 150, 70, 30, 0.005, 1.8, -offX, LOGIC_W + offX);
  drawAmbient(ctx, bg, camX, visW, visH, offX, offY);
  // 前景剪影：比角色更靠近镜头、跟随最快（1.15×），从画面下缘探进来。
  // 这一层是"景深"的关键——此前所有层都在角色之后，画面是平的
  drawSilhouette(ctx, shade(bg.silhouette, -34), bg.seed * 13 + 5, camX, 1.15, 250, 34, 26, 0.006, 1.1, -offX, LOGIC_W + offX);
}

/** 星野：只在夜色足够深的关卡出现（按天空上缘亮度判定），位置由下标的固定散列给出，
 * 不用 Math.random——随机数会让星星逐帧乱闪。视差最慢（0.06×），撑出最远的一层。
 *
 * 取位一律用无符号右移 >>>：h 是 `x >>> 0` 得来的无符号数，但 `h >> n` 是**有符号**移位，
 * h 超过 2^31 时结果为负，半径会跟着变负——canvas 的 arc() 直接抛 IndexSizeError，
 * 整个 draw 挂掉、画面只剩天空渐变。 */
/** 位散列：把下标打散成看起来无规律但逐帧恒定的数。
 * 直接用 `i * 常数 % N` 不行——连续下标乘同一个常数再取模是**等差数列**，
 * 星星和流萤会排成一条条斜线（第一版就是这么翻车的）。这里做两轮异或折叠把高位混进低位。 */
function hash32(n: number): number {
  let h = Math.imul(n + 1, 2654435761) >>> 0;
  h ^= h >>> 15;
  h = Math.imul(h, 2246822519) >>> 0;
  h ^= h >>> 13;
  h = Math.imul(h, 3266489917) >>> 0;
  return (h ^ (h >>> 16)) >>> 0;
}

function drawStars(ctx: CanvasRenderingContext2D, bg: StageBg, camX: number, visW: number, offX: number, offY: number) {
  const lum = parseInt(bg.sky[0].slice(1, 3), 16) + parseInt(bg.sky[0].slice(3, 5), 16) + parseInt(bg.sky[0].slice(5, 7), 16);
  if (lum > 150) return; // 白天/亮天不画星
  const drift = -camX * 0.06;
  for (let i = 0; i < 70; i++) {
    const h = hash32(i);                            // 固定散列，逐帧恒定
    const x = ((h % 1600) + drift) % 1600 - 200;
    const y = -offY + ((h >>> 11) % 240) * 0.85;
    if (x < -offX - 8 || x > visW - offX + 8) continue;
    const tw = 0.35 + ((h >>> 5) % 40) / 100;        // 每颗星自己的亮度，不闪
    ctx.fillStyle = hexAlpha('#EDE3D2', tw * 0.7);
    ctx.beginPath();
    ctx.arc(x, y, ((h >>> 3) % 3) * 0.5 + 0.6, 0, Math.PI * 2);
    ctx.fill();
  }
}

/** 关卡氛围粒子：东海的浪沫、灌江口的流萤、花果山的落瓣、积雷山的火星。
 * 每一颗的轨迹都是「下标 + 帧号」的固定函数，无状态、无随机——因此不需要 tick，
 * 也不会因为掉帧而错乱。frameSeed 由 camX 推出，镜头不动时靠自身相位继续飘。 */
export function drawAmbient(ctx: CanvasRenderingContext2D, bg: StageBg, camX: number, visW: number, visH: number, offX: number, offY: number) {
  const a = bg.ambient;
  if (!a) return;
  ambientPhase = (ambientPhase + 1) % 100000;
  const t = ambientPhase;
  ctx.save();
  // 尘与雾不发光：走正常叠加，才读得出"挡住了后面"而不是"亮起来"。
  // 骨灰用 lighter 画会变成飘在洞里的萤火，那正是这一关原本的样子
  const dull = a.kind === 'petal' || a.kind === 'ash' || a.kind === 'mist';
  ctx.globalCompositeOperation = dull ? 'source-over' : 'lighter';
  for (let i = 0; i < a.count; i++) {
    const h = hash32(i * 7 + 3);
    const speed = 0.25 + ((h >>> 7) % 60) / 100;
    const sway = ((h >>> 13) % 30) + 10;
    // 雾走得比谁都慢（0.08），飘得快就成了烟不是雾
    const drift = a.kind === 'ember' ? 0 : t * speed * (a.kind === 'mist' ? 0.08 : 0.35);
    let x = ((h % 1400) - camX * 0.45 + drift) % 1400 - 220;
    if (x < -offX - 20) x += 1400;
    const span = visH + offY;
    let y: number;
    if (a.kind === 'ember') {           // 火星：向上飘
      y = span - ((t * speed * 0.6 + (h >>> 3) % 600) % 600) - offY;
    } else if (a.kind === 'petal') {    // 落瓣：向下飘
      y = ((t * speed * 0.5 + (h >>> 3) % 620) % 620) - offY;
    } else if (a.kind === 'ash') {      // 骨灰：也向下，但慢得多——无声地沉，不是被风吹落
      y = ((t * speed * 0.22 + (h >>> 3) % 620) % 620) - offY;
    } else {                            // 流萤/电花/鬼气：原地上下浮
      y = -offY + ((h >>> 3) % 420) + Math.sin((t * 0.02 + i) * speed) * sway;
    }
    x += Math.sin((t * 0.012 + i * 1.7)) * sway * 0.5;
    // 雾是大团的，其余都是细粒
    const r = a.kind === 'mist' ? 14 + ((h >>> 17) % 5) * 4 : 1 + ((h >>> 17) % 3) * 0.9;
    let alpha = 0.22 + ((h >>> 19) % 40) / 100 * 0.5;
    // 电花明灭：每颗有自己的频率与相位，闪到接近全暗再亮起来。
    // 雷部那一关的空气该是"啪、啪"地跳，不是匀速漂
    if (a.kind === 'spark') alpha *= 0.15 + 0.85 * Math.pow(Math.max(0, Math.sin(t * 0.09 * speed + i * 2.3)), 6);
    if (a.kind === 'mist') alpha *= 0.28;      // 大团必须更淡，否则糊住整个背景
    ctx.fillStyle = hexAlpha(a.color, alpha);
    if (a.kind === 'petal') {           // 花瓣画成小椭圆，带自转
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(t * 0.01 * speed + i);
      ctx.beginPath(); ctx.ellipse(0, 0, r * 2.2, r, 0, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
    } else {
      ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
    }
  }
  ctx.restore();
}

/** 氛围粒子的相位。它挂在绘制上而不是逻辑 tick——这一层纯装饰、不参与任何判定，
 * 且相位只影响飘动位置，快一点慢一点看不出来；真挂逻辑帧反而要为它多传一个参数进来。 */
let ambientPhase = 0;

/**
 * The FastH3 ultimate charging aura. While the clip renders the fight keeps going, and this column of light under
 * the caster says "an ultimate is coming". Purely visual (wall-clock animated), so it never touches the
 * deterministic battle state that online lockstep relies on.
 */
let chargeAura: { who: 0 | 1; color: string; since: number; level: number; burst: number; label: string } | null = null;
export function setChargeAura(who: 0 | 1 | null, color = '#34c3ff') {
  if (who === null) { chargeAura = null; return; }
  if (chargeAura?.who === who) return;
  chargeAura = { who, color, since: performance.now(), level: 0, burst: 0, label: '' };
}
/** 0–100: how charged the ultimate is. The aura grows from sparks to a column to lightning. */
export function setChargeLevel(level: number) { if (chargeAura) chargeAura.level = level; }
/** The move name floated above the charging fighter's head. */
export function setChargeLabel(label: string) { if (chargeAura) chargeAura.label = label; }
/** A flare when the player pumps the charge with F. */
export function pumpChargeAura() { if (chargeAura) chargeAura.burst = performance.now(); }

/** Floating tag over the charging fighter: what is coming and how close it is. */
function drawChargeTag(ctx: CanvasRenderingContext2D, x: number, top: number, aura: NonNullable<typeof chargeAura>) {
  const t = (performance.now() - aura.since) / 1000;
  const flare = Math.max(0, 1 - (performance.now() - aura.burst) / 220);
  const y = top - 18 + Math.sin(t * 3) * 3;
  const title = `⚡ ${(aura.label || tr('canvas.ultimate')).toUpperCase()}`;
  ctx.save();
  ctx.font = "italic 800 15px 'Barlow Condensed', 'DM Sans', sans-serif";
  const w = Math.max(210, ctx.measureText(title).width + 60), h = 50;
  ctx.translate(x, y);
  ctx.scale(1 + flare * 0.08, 1 + flare * 0.08);
  ctx.fillStyle = 'rgba(4,16,28,.86)';
  ctx.strokeStyle = aura.color;
  ctx.lineWidth = 1.5;
  ctx.shadowColor = aura.color;
  ctx.shadowBlur = 10 + flare * 14;
  ctx.beginPath();
  ctx.roundRect(-w / 2, -h, w, h, 6);
  ctx.fill(); ctx.stroke();
  ctx.shadowBlur = 0;
  // little pointer down to the fighter
  ctx.fillStyle = aura.color;
  ctx.beginPath(); ctx.moveTo(-6, 0); ctx.lineTo(6, 0); ctx.lineTo(0, 7); ctx.fill();
  ctx.fillStyle = '#ffffff';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillText(title, -w / 2 + 10, -h + 13);
  // progress bar
  const bw = w - 18, pct = Math.min(1, aura.level / 100);
  ctx.fillStyle = 'rgba(255,255,255,.14)';
  ctx.fillRect(-bw / 2, -h + 24, bw, 4);
  ctx.fillStyle = aura.color;
  ctx.fillRect(-bw / 2, -h + 24, bw * pct, 4);
  // who is making it: this game exists to show FastH3 Omni and Agora at work
  const dots = '.'.repeat(1 + Math.floor(t * 2) % 3);
  ctx.font = "800 9px 'DM Sans', sans-serif";
  ctx.textAlign = 'left';
  ctx.fillStyle = '#9ff0ff';
  ctx.fillText(`${tr('canvas.generating')}${dots}`, -w / 2 + 10, -h + 39);
  ctx.font = "700 8px 'DM Sans', sans-serif";
  ctx.fillStyle = 'rgba(255,255,255,.75)';
  ctx.textAlign = 'right';
  ctx.fillText(`${Math.round(aura.level)}%`, w / 2 - 8, -h + 13);
  ctx.restore();
}

function drawChargeAura(ctx: CanvasRenderingContext2D, x: number, feetY: number, color: string, ms: number, level: number, sinceBurst: number) {
  const t = ms / 1000;
  const power = 0.45 + 0.55 * Math.min(1, level / 100);
  const flare = Math.max(0, 1 - sinceBurst / 220);
  const grow = Math.min(1, t / 0.6) * power * (1 + flare * 0.35);
  const pulse = 0.75 + 0.25 * Math.sin(t * (7 + level / 12));
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  // Column of light rising from the feet.
  const h = 250 * grow, w = 92 + 14 * pulse;
  const col = ctx.createLinearGradient(0, feetY, 0, feetY - h);
  col.addColorStop(0, hexAlpha(color, 0.85 * pulse));
  col.addColorStop(0.55, hexAlpha(color, 0.35));
  col.addColorStop(1, hexAlpha(color, 0));
  ctx.fillStyle = col;
  ctx.beginPath();
  ctx.ellipse(x, feetY - h / 2, w / 2, h / 2, 0, 0, Math.PI * 2);
  ctx.fill();
  // Two rings expanding out of the floor.
  for (let i = 0; i < 2; i++) {
    const k = (t * 0.9 + i / 2) % 1;
    ctx.strokeStyle = hexAlpha(color, 0.8 * (1 - k));
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.ellipse(x, feetY, 30 + k * 70, (30 + k * 70) / 4.5, 0, 0, Math.PI * 2);
    ctx.stroke();
  }
  // Stage three: lightning arcs crackle around the fighter.
  if (level > 60 || flare > 0) {
    ctx.strokeStyle = hexAlpha('#ffffff', 0.7 * Math.max(flare, (level - 60) / 40));
    ctx.lineWidth = 2;
    for (let i = 0; i < 3; i++) {
      const seed = Math.floor(t * 12) + i * 7;
      let px = x + Math.sin(seed) * 30, py = feetY - h * 0.95;
      ctx.beginPath(); ctx.moveTo(px, py);
      for (let j = 0; j < 5; j++) { px += Math.sin(seed * 3.1 + j * 1.7) * 18; py += h / 6; ctx.lineTo(px, py); }
      ctx.stroke();
    }
  }
  // Sparks spiralling up.
  for (let i = 0; i < 8 + Math.round(level / 7); i++) {
    const k = (t * 0.7 + i / 14) % 1;
    const a = i * 2.4 + t * 3;
    const r = 26 + 14 * Math.sin(i);
    ctx.fillStyle = hexAlpha(i % 3 ? color : '#ffffff', 0.9 * (1 - k));
    ctx.beginPath();
    ctx.arc(x + Math.cos(a) * r, feetY - k * h * 1.1, 2.4 * (1 - k) + 0.8, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

/** 可见视口的逻辑尺寸：默认等于安全区本身（960×540），letterbox 消除后由 GameCanvas 按实际
 * 屏幕比例算出更大的值传进来。draw() 不传这个参数时行为与改动前逐像素一致。 */
export interface Viewport { w: number; h: number }

export function draw(
  ctx: CanvasRenderingContext2D, b: Battle, prev: PrevPos, alpha: number,
  cam: Camera, fx: FxSystem, banner: BannerSystem, mandorla: MandorlaSystem,
  highlight: 0 | 1 | null = null, dark = 0, bg: StageBg = DEFAULT_BG,
  viewport: Viewport = { w: LOGIC_W, h: LOGIC_H }, cutin?: CutInSystem, bars = 0,
  /** Screen-space overlays: health/meter bars, hit counters, move banners and cut-ins. Off behind menus, where the
   * arena is only a backdrop, and for the clean frame FastH3 starts its clip from. */
  hud = true,
) {
  const offX = (viewport.w - LOGIC_W) / 2, offY = (viewport.h - LOGIC_H) / 2;
  drawBg(ctx, bg, cam.x, viewport.w, viewport.h, cam.screenY(FLOOR_Y));
  cam.apply(ctx);
  ctx.fillStyle = bg.artUrl ? 'rgba(9,18,35,.16)' : bg.ground;
  ctx.fillRect(-LOGIC_W - offX, FLOOR_Y, LOGIC_W * 3 + offX * 2, LOGIC_H - FLOOR_Y + offY);
  ctx.strokeStyle = INK.ink;
  ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(-LOGIC_W - offX, FLOOR_Y); ctx.lineTo(LOGIC_W * 2 + offX, FLOOR_Y); ctx.stroke(); // 地平线
  ctx.strokeStyle = hexAlpha(INK.paper, 0.06); // 极淡横向纹理带，不做倒影
  ctx.lineWidth = 1;
  for (let ty = FLOOR_Y + 16; ty < LOGIC_H; ty += 18) {
    ctx.beginPath(); ctx.moveTo(-LOGIC_W - offX, ty); ctx.lineTo(LOGIC_W * 2 + offX, ty); ctx.stroke();
  }
  const p1x = lerp(prev.x1, b.p1.x, alpha), p1y = lerp(prev.y1, b.p1.y, alpha);
  const p2x = lerp(prev.x2, b.p2.x, alpha), p2y = lerp(prev.y2, b.p2.y, alpha);
  if (fighterReady(b.p1.def)) drawShadow(ctx, p1x, p1y, b.p1.def.width);
  if (fighterReady(b.p2.def)) drawShadow(ctx, p2x, p2y, b.p2.def.width);
  drawDecals(ctx);                    // 地面痕迹：地面之上、角色之下
  if (chargeAura) drawChargeAura(ctx, chargeAura.who === 0 ? p1x : p2x, FLOOR_Y - (chargeAura.who === 0 ? p1y : p2y), chargeAura.color, performance.now() - chargeAura.since, chargeAura.level, performance.now() - chargeAura.burst);
  const chargeTag = chargeAura ? { x: chargeAura.who === 0 ? p1x : p2x, top: FLOOR_Y - (chargeAura.who === 0 ? p1y : p2y) - (chargeAura.who === 0 ? b.p1 : b.p2).def.height * 1.25 } : null;
  drawAdornments(ctx, b, 'back');     // 飘带与满槽气环：在角色之下
  drawWeaponTrail(ctx, 0, b.p1.def); // 拖影压在角色之下：刃光该在身后拉出去，不该盖住人
  drawGhosts(ctx, ghostState.p1, b.p1.def); // 残影画在出招者之前（在其身后），只在 sp100 窗口内非空
  drawFighter(ctx, b.p1, p1x, p1y, 0);
  drawWeaponTrail(ctx, 1, b.p2.def);
  drawGhosts(ctx, ghostState.p2, b.p2.def);
  drawFighter(ctx, b.p2, p2x, p2y, 1);
  if (chargeAura && chargeTag) drawChargeTag(ctx, chargeTag.x, chargeTag.top, chargeAura);
  if (dark > 0) {
    ctx.fillStyle = `rgba(6,4,16,${dark * 0.75})`;
    ctx.fillRect(-LOGIC_W, -LOGIC_H, LOGIC_W * 3, LOGIC_H * 3);
    if (highlight !== null) {
      const f = highlight === 0 ? b.p1 : b.p2;
      const px = highlight === 0 ? lerp(prev.x1, f.x, alpha) : lerp(prev.x2, f.x, alpha);
      const py = highlight === 0 ? lerp(prev.y1, f.y, alpha) : lerp(prev.y2, f.y, alpha);
      // 火焰纹背光：压在暗场之上、垫在出招者之下——顺序是暗场遮罩 → 背光 → 残影 → 高亮重绘的出招者。
      // Task 35：残影在第 210/212 行已经画过一次，但 sp100 的 dark 从 startMove 那一刻就是 1，
      // 整个 startup+active+recovery 期间全程 >0（见 GameCanvas 的 cine.hold），上面那次画的残影
      // 会被这里的暗场遮罩原地埋掉——之前只把出招者本人捞出来重画「保持明亮」，残影没有这一步，
      // 于是暗场铺满的这段时间里（也正是残影最需要看见的连打窗口）残影其实是隐形的。这里补上同一
      // 支重绘，让残影跟出招者一起穿过暗场
      mandorla.draw(ctx, px, FLOOR_Y - py - MANDORLA_Y, dark);
      drawGhosts(ctx, highlight === 0 ? ghostState.p1 : ghostState.p2, f.def);
      drawFighter(ctx, f, px, py, highlight); // 遮罩之上重画一次，让出招者保持明亮
    }
  }
  fx.draw(ctx);
  if (hud) banner.drawSkill(ctx, p1x, p1y, p2x, p2y); // 技能名跟出招者走，须在 cam.restore 之前
  if (hud) drawHitCounter(ctx, 0, p2x, p2y); // HIT 计数贴在受击者头顶——p1 打人时数字长在 p2 头上，反之亦然
  if (hud) drawHitCounter(ctx, 1, p1x, p1y);
  cam.restore(ctx);
  // 速度线：屏幕空间，只在超必杀（tier 100）出现，随暗场衰减一起淡出；必须画在竖排招式名之下
  // 颜色跟 mandorla 当次绽放走同一份 glow（角色 superGlow 或默认藤黄→朱砂），不再固定用纸白
  if (mandorla.on && mandorla.tier === 100) drawSpeedLines(ctx, dark, mandorla.glow[0]);
  drawProjectiles(ctx, b);            // 飞行中的实物：乾坤圈/光束/芭蕉扇
  drawAdornments(ctx, b, 'front');    // 余烬浮在角色之上
  drawFlung(ctx, b);                  // 被打飞的兵器：要看得见它飞出去、扎进地里
  if (fx.flashAlpha > 0) {
    ctx.globalAlpha = fx.flashAlpha;
    ctx.fillStyle = '#fff';
    ctx.fillRect(-offX, -offY, viewport.w, viewport.h); // 屏幕空间：白闪要盖满整块画布，不留边
    ctx.globalAlpha = 1;
  }
  if (hud) cutin?.draw(ctx); // cut-in 立绘：在速度线之上、竖排招式名之下（名字必须始终可读）
  if (hud) banner.drawScreen(ctx); // 大招竖排卷轴+印、关卡开场横幅：屏幕空间，不随镜头晃/缩放；须压在速度线之上
  drawLetterbox(ctx, bars, viewport, offX, offY);
  // Keep health and fighter names readable while a super adds cinematic bars, including short phone screens.
  if (hud) drawBars(ctx, b, viewport.w);
}

/** 影院黑边：超必杀期间从上下压进来，收势时退开——是这类大演出最省事也最见效的一层"这是过场"
 * 的信号。屏幕空间，血条在黑边上方绘制，确保演出期间仍可读取生命值。
 * 高度比例由 GameCanvas 的 cine.bars 缓动给出，这里只负责画，不推进任何计时。 */
/** 飞行中的投射物。旋转相位由自身 age 给出（不读时钟、不用随机），
 * 因此暂停/慢镜时它也跟着停，与整套演出同一条时间轴。 */
export function drawProjectiles(ctx: CanvasRenderingContext2D, b: Battle) {
  for (const pr of b.projectiles) {
    const d = pr.def;
    const cy = FLOOR_Y - pr.y - d.h / 2;
    const fade = Math.min(1, (pr.life - pr.age) / 10);
    ctx.save();
    ctx.globalAlpha = fade;
    ctx.globalCompositeOperation = 'lighter';
    ctx.translate(pr.x, cy);
    if (d.kind === 'ring') {            // 乾坤圈：金环旋着飞，带一道内圈
      ctx.rotate(pr.age * 0.34 * pr.facing);
      ctx.strokeStyle = d.color; ctx.lineWidth = 6;
      ctx.beginPath(); ctx.arc(0, 0, d.w / 2 - 3, 0, Math.PI * 2); ctx.stroke();
      ctx.strokeStyle = hexAlpha(INK.paper, 0.75); ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(0, 0, d.w / 2 - 8, 0, Math.PI * 2); ctx.stroke();
      ctx.strokeStyle = hexAlpha(d.color, 0.5); ctx.lineWidth = 3;   // 拖尾一小段弧
      ctx.beginPath(); ctx.arc(0, 0, d.w / 2 + 4, 0.6, 2.2); ctx.stroke();
    } else if (d.kind === 'beam') {     // 天眼光束：横向长条 + 前端亮头
      const g = ctx.createLinearGradient(-d.w / 2, 0, d.w / 2, 0);
      g.addColorStop(0, hexAlpha(d.color, 0));
      g.addColorStop(1, hexAlpha(d.color, 0.95));
      ctx.fillStyle = g;
      ctx.fillRect(-d.w / 2 * pr.facing, -d.h / 2, d.w * pr.facing, d.h);
      ctx.fillStyle = hexAlpha(INK.paper, 0.9);
      ctx.beginPath(); ctx.ellipse(d.w / 2 * pr.facing, 0, 7, d.h / 2, 0, 0, Math.PI * 2); ctx.fill();
    } else if (d.kind === 'arrow') {    // 箭：杆 + 三角镞 + 尾羽——不是一根发光的条
      // 后羿三记必杀全是箭，原本和二郎神的天眼光束共用 'beam'：一根渐变长条 + 椭圆亮头。
      // 那是"能量"的画法，不是"箭"的画法——全场唯一的弓箭手，射出去的东西看不出是箭。
      const f = pr.facing, L = d.w / 2;
      ctx.strokeStyle = hexAlpha(INK.paper, 0.85); ctx.lineWidth = 2.4;
      ctx.beginPath(); ctx.moveTo(-L * f, 0); ctx.lineTo(L * f, 0); ctx.stroke();   // 箭杆
      ctx.fillStyle = d.color;                                                       // 箭镞
      ctx.beginPath();
      ctx.moveTo(L * f, 0);
      ctx.lineTo((L - 11) * f, -d.h / 2);
      ctx.lineTo((L - 11) * f, d.h / 2);
      ctx.closePath(); ctx.fill();
      ctx.strokeStyle = hexAlpha(d.color, 0.75); ctx.lineWidth = 2;                  // 尾羽两片
      for (const sgn of [-1, 1]) {
        ctx.beginPath();
        ctx.moveTo(-L * f, 0);
        ctx.lineTo((-L + 9) * f, sgn * d.h * 0.45);
        ctx.stroke();
      }
      ctx.strokeStyle = hexAlpha(d.color, 0.30); ctx.lineWidth = 5;                  // 一小段拖影
      ctx.beginPath(); ctx.moveTo(-L * f, 0); ctx.lineTo(-(L + 16) * f, 0); ctx.stroke();
    } else if (d.kind === 'wraith') {   // 鬼卒：一具飘着的残影，不是旋转的金环
      // 原本借哪吒的 'ring' 画：召唤出来的鬼兵成了飞旋的金圈。而且环只按 d.w 算半径，
      // 鬼卒的判定框是 46x88——竖着那一半没有任何可见对应物，玩家挨了打找不到打他的东西。
      // 这里按 w x h 整个画满：立起来的躯影 + 空洞的脸 + 下摆散开的尾。
      const w2 = d.w / 2, h2 = d.h / 2, sway = Math.sin(pr.age * 0.12) * 3;
      ctx.fillStyle = hexAlpha(d.color, 0.34);
      ctx.beginPath();
      ctx.moveTo(sway, -h2);                                   // 头顶
      ctx.quadraticCurveTo(w2, -h2 * 0.2, w2 * 0.7, h2 * 0.5);  // 右肩到摆
      ctx.quadraticCurveTo(0, h2, -w2 * 0.7, h2 * 0.5);         // 下摆散开
      ctx.quadraticCurveTo(-w2, -h2 * 0.2, sway, -h2);
      ctx.closePath(); ctx.fill();
      ctx.strokeStyle = hexAlpha(d.color, 0.8); ctx.lineWidth = 2; ctx.stroke();
      ctx.fillStyle = hexAlpha(INK.ink, 0.85);                  // 空洞的脸：两点眼窝
      for (const sgn of [-1, 1]) {
        ctx.beginPath(); ctx.ellipse(sgn * w2 * 0.22, -h2 * 0.62, 2.6, 4, 0, 0, Math.PI * 2); ctx.fill();
      }
    } else if (d.kind === 'roar') {     // 怒吼：一圈圈推出去的声浪，不是转着的扇叶
      // 原本借铁扇的 'fan' 画：牛魔王的一声吼成了一把旋转的芭蕉叶。
      // 声音该是同心弧从口部往外推，越外越淡。
      ctx.lineWidth = 3;
      for (let i = 0; i < 3; i++) {
        const phase = ((pr.age * 0.06 + i / 3) % 1);
        ctx.strokeStyle = hexAlpha(d.color, 0.75 * (1 - phase));
        ctx.beginPath();
        ctx.arc(-d.w / 2 * pr.facing, 0, d.w * (0.25 + phase * 0.75), -1.0, 1.0);
        ctx.stroke();
      }
    } else {                            // 芭蕉扇：扇形，边缘一圈风纹
      ctx.rotate(pr.age * 0.22 * pr.facing);
      ctx.fillStyle = hexAlpha(d.color, 0.8);
      ctx.beginPath(); ctx.moveTo(0, 0);
      ctx.arc(0, 0, d.w / 2, -0.9, 0.9); ctx.closePath(); ctx.fill();
      ctx.strokeStyle = hexAlpha(INK.paper, 0.55); ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(0, 0, d.w / 2 + 5, -0.9, 0.9); ctx.stroke();
    }
    ctx.restore();
  }
}

function drawLetterbox(ctx: CanvasRenderingContext2D, ratio: number, viewport: Viewport, offX: number, offY: number) {
  if (ratio <= 0.001) return;
  const h = viewport.h * ratio;
  ctx.fillStyle = '#05080e';
  ctx.fillRect(-offX, -offY, viewport.w, h);
  ctx.fillRect(-offX, -offY + viewport.h - h, viewport.w, h);
  // 内沿一道极淡的亮线：黑边因此读成"压上来的框"，而不是画布被裁短了
  ctx.fillStyle = hexAlpha(INK.paper, 0.16);
  ctx.fillRect(-offX, -offY + h, viewport.w, 1);
  ctx.fillRect(-offX, -offY + viewport.h - h - 1, viewport.w, 1);
}

// 出招者脚底往上量到胸口大致高度——背光中心不贴地面，也不糊到脸上
const MANDORLA_Y = 95;

const SPEED_LINE_COUNT = 36;

/** 全屏速度线：屏幕中心向外放射，中心留空避免糊住角色，外圈随线本身长度自然变淡。
 * 每条线的长度/宽度由线序号 i 的固定公式决定，不读 Math.random()/时钟——逐帧结果恒定，
 * 不会像随机数那样闪烁。color 取自触发这次超必杀的角色 superGlow（见调用处），不再固定纸白——
 * 之前四个角色的速度线长一个样，是"除了名字都一样"的一部分 */
function drawSpeedLines(ctx: CanvasRenderingContext2D, alpha: number, color: string) {
  if (alpha <= 0) return;
  const cx = LOGIC_W / 2, cy = LOGIC_H / 2;
  const hollow = 90, maxR = 640;
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  for (let i = 0; i < SPEED_LINE_COUNT; i++) {
    const a = (i / SPEED_LINE_COUNT) * Math.PI * 2;
    const spread = (i * 37) % 13 / 13; // 0..1 的固定错落，避免车轮般的机械匀分
    const len = maxR * (0.6 + spread * 0.4);
    const x1 = cx + Math.cos(a) * hollow, y1 = cy + Math.sin(a) * hollow;
    const x2 = cx + Math.cos(a) * len, y2 = cy + Math.sin(a) * len;
    const grad = ctx.createLinearGradient(x1, y1, x2, y2);
    grad.addColorStop(0, hexAlpha(color, alpha * 0.85));
    grad.addColorStop(1, hexAlpha(color, 0)); // 外圈渐隐
    ctx.strokeStyle = grad;
    ctx.lineWidth = 1.5 + spread * 2;
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();
  }
  ctx.restore();
}

// 骨骼尺寸（相对脚底）
const SHOULDER_Y = 118, HIP_Y = 62;
const UPPER_ARM = 26, LOWER_ARM = 26, THIGH = 32, SHIN = 32;
export const THIGH_LEN = THIGH; // 导出给测试算腰部接缝用（腿部胶囊帽半径要用 THIGH_W/TAPER）
export const THIGH_W = 13; // seg() 调用里大腿段的裸 13，命名导出防止测试抄错数

/** motionSeq 段间接缝的姿势混合窗口（帧）。3–5 帧足够抹平切换瞬间的姿势跳变，不必长。 */
const SEAM_BLEND = 4;

/** 按 weight 比例把 total 帧切给 motionSeq 里的每一段：累加权重取整得到切点，末段吃住到
 * total（不会因为取整损耗尾帧）。纯函数，poseForMotionSeq 内部用，也单独导出给测试直接验证
 * 切分结果——四个角色的 sp100 数据故意把 weight 取成分毫不差等于目标帧宽（sum(weight)===total），
 * 这样 round() 不产生任何偏移，报告里给的分段帧区间就是这里算出来的准确值。 */
export function motionSeqBounds(total: number, seq: { weight: number }[]): { start: number; end: number }[] {
  const sumW = seq.reduce((s, x) => s + x.weight, 0) || 1;
  let acc = 0;
  const cuts = [0];
  for (let i = 0; i < seq.length; i++) {
    acc += seq[i].weight;
    cuts.push(i === seq.length - 1 ? total : Math.round((acc / sumW) * total));
  }
  return cuts.slice(0, -1).map((s, i) => ({ start: s, end: cuts[i + 1] }));
}

/** motionSeq 播放到第几段（0-based），供 GameCanvas 的相机脉冲探测"刚跨进新一段"用。
 * 不带 motionSeq（或段数<2）的招式返回 -1。 */
export function motionSeqPhaseIndex(move: Move, stateFrame: number): number {
  if (!move.motionSeq || move.motionSeq.length < 2) return -1;
  const total = move.startup + move.active + move.recovery;
  const bounds = motionSeqBounds(total, move.motionSeq);
  const f = Math.min(Math.max(stateFrame, 0), total - 1);
  const idx = bounds.findIndex(b => f < b.end);
  return idx < 0 ? bounds.length - 1 : idx;
}

/** motionSeq 单帧取姿：定位落在哪一段、段内比例采样那段自己的 Motion，再在每段开头
 * SEAM_BLEND 帧内把上一段的收势姿势（其 motion 末帧）与本段姿势线性混合过去——直接切换会
 * 让姿势瞬间跳变，读成四个不连贯的快照而不是一套连续编排。混合进度是 stateFrame 的纯函数，
 * 不引入新的计时状态，天然挂在逻辑帧上，不会有「按渲染帧走」的风险。 */
export function poseForMotionSeq(seq: { motionId: string; weight: number }[], total: number, stateFrame: number, charId?: string): Pose {
  const bounds = motionSeqBounds(total, seq);
  const f = Math.min(Math.max(stateFrame, 0), total - 1);
  let idx = bounds.findIndex(b => f < b.end);
  if (idx < 0) idx = bounds.length - 1;
  const seg = bounds[idx];
  const segLen = Math.max(seg.end - seg.start, 1);
  const localFrame = f - seg.start;
  const motion = MOTIONS[seq[idx].motionId] ?? MOTIONS.thrust;
  const extSeg = charId ? extPose(charId, seq[idx].motionId) : null;
  const pose = extSeg
    ? extSeg((localFrame / segLen) * motion.frames)
    : samplePose(motion, (localFrame / segLen) * motion.frames);
  if (idx > 0) {
    const blendLen = Math.min(SEAM_BLEND, segLen);
    if (localFrame < blendLen) {
      const prevMotion = MOTIONS[seq[idx - 1].motionId] ?? MOTIONS.thrust;
      const prevPose = samplePose(prevMotion, prevMotion.frames); // 上一段的收势末帧
      return lerpPose(prevPose, pose, localFrame / blendLen);
    }
  }
  return pose;
}

const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));

/** 供附属层（飘带挂点）取当前姿势——与角色本体用同一份，不另算一遍 */
export function poseForFighter(f: Fighter): Pose { return poseFor(f); }

/** 已注册的外部骨骼来源，按角色 id 索引。空表 = 完全走程序化动作，与接入前逐像素一致。 */
const skelSources = new Map<string, PoseSource>();

/** 该角色的外部骨骼里有没有这段动作；有就返回一个取样函数，没有返回 null。
 * 站立/走/跳、单段招式、以及 motionSeq 的每一段都走这同一个入口——
 * 少接一处，那一处就会在迁移后仍然偷偷用着程序化动作，而且看不出来。 */
function extPose(charId: string, motionId: string): ((frame: number) => Pose) | null {
  const src = skelSources.get(charId);
  const key = `${charId}:${motionId}`;
  return src?.has(key) ? (frame: number) => src.sample(key, frame) : null;
}

/** 注册某个角色的外部骨骼动画。fire-and-forget：文件缺失/格式不对就保持程序化，不报错、不卡住。 */
export async function loadSkeleton(charId: string): Promise<boolean> {
  try {
    const res = await fetch(`${import.meta.env.BASE_URL}skel/${charId}.json`);   // 子路径部署，见 parts.ts 那条
    if (!res.ok) return false;
    const doc = await res.json() as SkelDoc;
    if (!doc?.animations) return false;
    skelSources.set(charId, skeletalSource(doc, charId));
    return true;
  } catch { return false; }
}

function poseFor(f: Fighter): Pose {
  // 胜利姿势排在最前：赢下来之后那 120 帧收尾里，不管他停在什么状态都该在摆造型。
  // 排在 attack 之后的话，用大招终结的那一局会一直播大招的收势，赢家等于没有胜利动作。
  // 角色专属优先（`${id}Victory`），没有就用通用那套——同 hitstun 里 own() 的写法
  if (f.victory > 0) {
    const m = MOTIONS[`${f.def.id}Victory`] ?? MOTIONS.victory;
    const ext = extPose(f.def.id, `${f.def.id}Victory`) ?? extPose(f.def.id, 'victory');
    return ext ? ext(f.victory) : samplePose(m, f.victory);
  }
  if (f.state === 'attack' && f.move) {
    const total = f.move.startup + f.move.active + f.move.recovery;
    if (f.move.motionSeq && f.move.motionSeq.length >= 2) {
      return poseForMotionSeq(f.move.motionSeq, total, f.stateFrame, f.def.id);
    }
    const id = f.move.motionId;
    const ext = extPose(f.def.id, id);
    if (ext) { // 外部骨骼里有这段就用外部的，时长同样拉伸到招式帧数
      const m = MOTIONS[id] ?? MOTIONS.thrust;
      return ext((f.stateFrame / Math.max(total, 1)) * m.frames);
    }
    const m = MOTIONS[id] ?? MOTIONS.thrust;
    // 动作时长拉伸到与招式帧数一致
    return samplePose(m, (f.stateFrame / Math.max(total, 1)) * m.frames);
  }
  // 受击反应不能只有一个 hit：它只有 14 帧且不循环，而连打里受击方的 stateFrame 会一路
  // 涨到几百，samplePose 钳在末帧上——整整十秒保持同一个姿势，正是"对方一直一个动作"。
  // 现在①每次命中都把 stateFrame 归零（battle 里做），让挨打反应逐下重放；
  // ②左右交替两套挨打姿势，连打读起来是被打得东倒西歪而不是原地抖；
  // ③腾空时换成会持续翻转的 tumble（loop），落地后是 fallen，都不会钉死。
  if (f.state === 'hitstun') {
    // 受击方向感：同一套反应动作按当下的速度偏一点，读得出是被挑起来、被砸下去，
    // 还是被狠狠推出去。数据全部来自 Fighter 已有的 vx/vy，不需要新的传递链路。
    // 优先用角色专属的反应（幅度按体重/身法派生），没有就回退到通用那套
    // Keep camelCase when falling back to the shared motion. `HitAlt` used to become
    // `hitalt`, which does not exist (`hitAlt` does). The second consecutive hit then
    // passed undefined into samplePose and permanently stopped requestAnimationFrame.
    const own = (base: string) => {
      const shared = base.charAt(0).toLowerCase() + base.slice(1);
      return MOTIONS[`${f.def.id}${base}`] ?? MOTIONS[shared] ?? MOTIONS.hit;
    };
    if (f.y > 0) {
      const p = samplePose(own('Tumble'), f.stateFrame);
      const v = clamp(f.vy, -14, 14) / 14; // +1 正在被挑起，-1 正在下坠
      return { ...p, lean: p.lean - v * 0.22, squash: p.squash + v * 0.06 };
    }
    const p = samplePose(alternateHurt(f) ? own('HitAlt') : own('Hit'), f.stateFrame);
    return groundedHurtPose(f, p, samplePose(MOTIONS.crouch, f.stateFrame));
  }
  if (f.state === 'down') return knockdownPose(f, MOTIONS[`${f.def.id}Fallen`] ?? MOTIONS.fallen,
    samplePose(MOTIONS.idle, 0), samplePose(MOTIONS.crouch, 0));
  const map: Record<string, string> = {
    idle: 'idle', walk: 'walk', jump: 'jump', block: 'block', crouch: 'crouch',
    run: 'run', backstep: 'backstep', roll: 'roll',
  };
  // 蹲防要看得出是蹲着的：防错了段就要挨打，玩家必须能从画面上分辨自己防的是哪一段，
  // 否则上下段就成了纯猜。姿势取 block 的护架、叠上 crouch 的屈膝——不用新做一套动作。
  if (f.state === 'block' && f.lowGuard) {
    const guard = samplePose(MOTIONS.block, f.stateFrame);
    const duck = samplePose(MOTIONS.crouch, f.stateFrame);
    return { ...guard, crouch: duck.crouch, legF: duck.legF, legB: duck.legB };
  }
  const id = map[f.state] ?? 'idle';
  const ext = extPose(f.def.id, id);
  return ext ? ext(f.stateFrame) : samplePose(MOTIONS[id], f.stateFrame);
}

/**
 * 沿 (x,y)→(ex,ey) 方向挂载部件图：以起点为锚，旋转到骨骼方向，宽=w×2、高=段长。
 * 旋转本身是保定向变换（行列式 +1），只会把骨骼终点转到正确位置，不会把贴图内容做
 * 镜像——facing 翻转时终点方向已经跟着 seg() 里的 sin(angle)*facing 镜像过一次了，
 * 但贴图画面本身还是原样，非对称素材（武器、偏一侧的花纹）朝向就会不对。所以额外
 * 在 rotate 之后叠一次 ctx.scale(facing, 1)：终点落在本地 x=0 的对称轴上，scale 不
 * 会挪动它（继续精确落在 ex,ey），但 x≠0 的画面内容会跟着整体镜像，与骨骼一起翻面。
 * white 时叠一层不透明白色（source-atop，只染到贴图已有像素上，不会画出轮廓外），
 * 对应受击白闪——胶囊路径是换描边色，贴图没有"描边色"这个概念，只能后处理染色。
 * 只取 part.top..part.bottom 这段内容行（parts.ts 已裁掉上下透明留白），横向仍是整张图——
 * 素材自带的留白多少不再影响这一段贴图实际画出来有多高，接缝就不再随素材抖动。
 */
export function drawBoneImg(ctx: CanvasRenderingContext2D, x: number, y: number, ex: number, ey: number, w: number, part: PartImage, white: boolean, facing: number) {
  const dx = ex - x, dy = ey - y;
  const len = Math.hypot(dx, dy) || 1;
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(Math.atan2(-dx, dy));
  ctx.scale(facing, 1);
  // 源矩形取**内容包围盒**，横向也裁（parts.ts 的 left/right）。原来横向取整幅 naturalWidth，
  // 后果是素材四周留白多少直接决定画出来的身体有多宽：160 的框里 124 的内容，实际只铺到
  // 40*124/160=31 逻辑单位，比程序化躯干的 TORSO_W=38 明显窄一截。更糟的是头部缩放是拿
  // **躯干内容宽**反推的，两个口径不一致，于是 recut.py 里得挂一个 fill=0.80 的常量去凑——
  // 同一个根因被绕了两次。裁了之后 w*2 就是躯干真实宽度，头躯比例才真的是同一个。
  const { img, top, bottom, left, right } = part;
  const sw = Math.max(1, right - left);
  ctx.drawImage(img, left, top, sw, bottom - top, -w, 0, w * 2, len);
  if (white) {
    ctx.globalCompositeOperation = 'source-atop';
    ctx.fillStyle = '#fff';
    ctx.fillRect(-w, 0, w * 2, len);
  }
  ctx.restore();
}

/** 沿骨骼自身方向（(x,y)→(ex,ey) 的连线）延长线段两端，让贴图挂载"重叠"而非"贴边"——两张
 * 独立裁切的素材边缘再干净，严丝合缝地对接到同一行也容易露一条极细的背景缝，各自沿骨骼轴向
 * 留一点重叠余量，上层素材的边缘就能盖住下层，缝隙无处可露（管线文档：切件本来就要求切口留
 * 10% 重叠余量）。只延长端点、不改角度——方向完全取自原始的两点连线，lean/朝向都照常生效。 */
export function extendSeg(x: number, y: number, ex: number, ey: number, startExt: number, endExt: number): [number, number, number, number] {
  const dx = ex - x, dy = ey - y;
  const len = Math.hypot(dx, dy) || 1;
  const ux = dx / len, uy = dy / len;
  return [x - ux * startExt, y - uy * startExt, ex + ux * endExt, ey + uy * endExt];
}

export const TAPER = 0.55; // 关节端→末端的收分比例，水墨笔锋的锥度
const TORSO_W = 38; // 躯干肩端宽度（直径）：明显大于头部直径 32，撑出宽肩窄腰的武人轮廓
// 贴图躯干挂载半宽（原来是 drawBoneImg 调用里的裸 20）。导出给测试用同一个数，不在
// tests/renderer.test.ts 里另抄一份——抄一份的话渲染这边改了宽度，测试量的还是旧数字。
export const TORSO_MOUNT_HALFW = 20;

// Task 29 接缝重叠量（逻辑单位）。头贴图现在按颈点（shY-NECK_LEN=shY-4）对齐底边，裁掉素材
// 自身留白后底边就落在 shY-4——纯几何量，不随素材变。NECK_OVERLAP 必须 > 4 才能让躯干顶边
// 盖过头部底边、真正重叠而非贴边；多出来的部分反正被后画的头挡住，不会露出拉伸痕迹。躯干裁
// 掉留白后底边已经精确落在髋点，WAIST_OVERLAP 只是防抗锯齿边缘漏色的保险量，不需要很大。
export const NECK_OVERLAP = 8;
export const WAIST_OVERLAP = 4;

// Task 31：NECK_OVERLAP 只沿骨骼轴向补量，lean=0 时够用——但躯干是绕髋点整体旋转的
// （shX/shY 随 p.lean 摆动），头却在 Task 29 里钉死不转，两者的接合线一个在转一个不转，
// lean 越大楔形缺口越大（idle/walk 的小 lean 看不出来，rush/slam 这类前倾攻击帧才露馅）。
// NECK_LEN/CHIN_OFFSET 是 headAnchor() 里量出来的常量：lean=0 时 headAnchor 与旧公式
// （shX+facing*4, shY-20）完全重合，静止姿态一像素不差；旋转补偿只在 lean≠0 时才生效。
//
// 头部贴图挂载方形的边长本身不需要跟着放大——躯干顶边缺口相对头方形中心的偏移量只由
// "头有没有转到跟躯干同一个角度"决定，不受方形边长影响（把方形边长两端同时加大 ΔS，
// 静止姿态和前倾姿态的缺口会同步各自变松 ΔS，两者之间的差值纹丝不动）。真正能收窄
// "前倾比静止更差多少"这个差值的，只有 HEAD_LEAN_FOLLOW 本身——越接近 1（头跟躯干
// 等角度转），前倾姿态跟静止姿态的接缝就越接近同一种状态。取 0.95 时，见
// tests/renderer.test.ts 的楔形缺口扫描测试，全部 motion/帧/朝向下前倾都不比静止差
// 超过 0.5 个逻辑单位（多数在 0.35 以内，钝角残余来自 crouch 项——shY 里 +crouch*0.2
// 那一项不是纯旋转，crouch 和 lean 同时变化的招式会有极小的额外误差，0.95 而不是 1.0
// 是为了在"越接近刚性、误差越小"和"真实脖子不会跟身体等角度转"这两者间留一点余地）。
const HEAD_LEAN_FOLLOW = 0.95;
/** 颈点到肩点的距离，沿骨骼方向。贴图头以此点为**底边中点**向上生长；程序化圆头再往上
 * 抬一个半径当圆心，lean=0 时圆心回到旧的 shY-20，静止姿态一像素不差。 */
const NECK_LEN = 4;
/** 颈点垂直于骨骼方向的偏移（下巴前推）。原值 4 是给各向同性的圆头调的——圆怎么挪都还是圆，
 * 看不出偏心；换成真脸就变成"头没长在脖子上"，是头身分离最直接的一项。收到 1。 */
const CHIN_OFFSET = 1;
/** 没有躯干贴图可参照时，头的目标高度（逻辑单位）——等于旧的 32×32 方框高度 */
// 头贴图的目标高度（逻辑单位，颈点往上）。所有角色统一——骨架是同一副，
// 头就该是同一个大小，角色差异体现在脸的画法、冠饰、发型上，不该体现在头有多大。
// 取 36 是当前全员的均值，换过来不会整体变大或变小，只是把离散度收掉。
// 头贴图的目标**尺度**（逻辑单位）：对齐的是内容盒的几何平均 sqrt(宽×高)，不是单边。
// 33 取自全员当前均值，换过来整体不变大也不变小，只收离散度。
const HEAD_TARGET = 33;

/** 头贴图的像素→逻辑缩放：只看头素材自己的内容盒，按**面积**归一。
 *
 * 按单边归一两头都不成立，实测过：
 *   按高：雷震子的头是 124x95 的宽扁形，高撑到 36 就横向铺到 47 逻辑单位，
 *         而铁扇公主 80x124 的高瘦头只有 23——脸宽差 2.04 倍。
 *   按宽：对称地把离散度挪回纵向。
 * 取 sqrt(宽×高) 之后全员落在 97.5~122.0，1.25 倍，两个方向都收得住，
 * 而且宽脸仍然宽、长脸仍然长——角色差异保留，只是"头有多大"这件事统一了。
 *
 * 导出给测试用同一条式子，不在测试里另抄一份。 */
export function headScale(head: PartImage): number {
  const w = Math.max(1, head.right - head.left);
  const h = Math.max(1, head.bottom - head.top);
  return HEAD_TARGET / Math.sqrt(w * h);
}
const HEAD_R = 16; // 程序化圆头半径

/**
 * 颈部锚点：沿骨骼方向（肩点→颈部延长线）挂载，随 lean 摆动到与躯干顶边同一位置，
 * 而不是像 Task 29 那样钉在 shY-20 不转——这是本任务修复"头和身子间隙"的几何核心。
 * angle 只用于贴图头的 ctx.rotate（部分跟随，HEAD_LEAN_FOLLOW<1），程序化圆头不读它
 * （圆本身各向同性，不需要转,也转不出视觉差异）。facing 已经在 lean 的 sin/cos 分量里
 * 处理过镜像，angle 额外乘一次 fc 是因为它要在 drawBoneImg 同款的
 * "先 rotate（世界系）再 scale(fc,1)（镜像贴图内容）" 顺序里使用——不乘 fc 的话，两侧
 * 朝向会转向同一个屏幕方向，而不是各自转向自己前倾的那一侧。
 */
export function headAnchor(shX: number, shY: number, lean: number, fc: number): { cx: number; cy: number; angle: number } {
  const ux = Math.sin(lean) * fc, uy = -Math.cos(lean); // 骨骼延长线方向（肩→头顶）
  const vx = Math.cos(lean) * fc, vy = Math.sin(lean);  // 垂直于骨骼方向（下巴前推）
  return {
    cx: shX + ux * NECK_LEN + vx * CHIN_OFFSET,
    cy: shY + uy * NECK_LEN + vy * CHIN_OFFSET,
    angle: lean * HEAD_LEAN_FOLLOW * fc,
  };
}

/** 关节粗、末端细的锥形笔触路径：两端各带半圆帽，撑出笔锋起收笔的圆润感。
 * 两个 arc 必须走 anticlockwise（true）——不然帽子朝内折回体内而非朝外鼓起，
 * 路径会在端点处自相交，nonzero 填充规则在自交区域算出卷绕数 0，抠出一个洞，
 * 就是关节处那个"黑洞"的成因（洞里透出来的是洞下面早画好的暗色地面）。 */
function taperedPath(ctx: CanvasRenderingContext2D, x1: number, y1: number, x2: number, y2: number, r1: number, r2: number) {
  const angle = Math.atan2(y2 - y1, x2 - x1);
  const perp = angle + Math.PI / 2;
  const cp = Math.cos(perp), sp = Math.sin(perp);
  ctx.beginPath();
  ctx.moveTo(x1 + cp * r1, y1 + sp * r1);
  ctx.lineTo(x2 + cp * r2, y2 + sp * r2);
  ctx.arc(x2, y2, r2, perp, perp + Math.PI, true);
  ctx.lineTo(x1 - cp * r1, y1 - sp * r1);
  ctx.arc(x1, y1, r1, perp + Math.PI, perp + Math.PI * 2, true);
  ctx.closePath();
}

/** 填充当前 fillStyle 的锥形笔触，再描一圈 INK.ink 细边让肢体从背景里立起来；
 * 受击白闪时跳过描边——整体已经是纯白，深色边线反而破坏"整体转白"的效果 */
function fillTapered(ctx: CanvasRenderingContext2D, x1: number, y1: number, x2: number, y2: number, w: number, white: boolean, taper = TAPER) {
  taperedPath(ctx, x1, y1, x2, y2, w / 2, (w * taper) / 2);
  ctx.fill();
  if (!white) {
    ctx.strokeStyle = INK.ink;
    ctx.lineWidth = 2;
    ctx.stroke();
  }
}

/**
 * 手。骨段是水墨笔锋（TAPER=0.55），前臂 9px 收到末端只剩 5px 的一个尖——
 * 而兵器恰好从这个尖上长出去，于是整条胳膊读起来是**一根鞭子**，不是"手握着兵器"；
 * 前臂又画成 accent 色（和身体不同的浅色），那根"鞭子"还格外显眼。
 * 补一颗手：笔锋照旧收尖，尖上多一个握着的东西，胳膊就有了终点。
 *
 * 画在兵器**之后**——手压在杆上才是握住；画在之前会被杆盖掉，等于没加。
 * 有美术贴图时不画：那时手已经在图里了，再叠一个圆是两只手。
 */
function drawHand(ctx: CanvasRenderingContext2D, at: [number, number], fill: string, white: boolean) {
  // 半径 6.6：5.2 那版**在实机上认不出是手**——前臂末端本来就有 5px 的笔锋，
  // 两者一样粗时读成"笔锋收了个圆头"，而不是"这里有只手"。手要比它握的那截明显粗一圈。
  ctx.fillStyle = white ? '#fff' : fill;
  ctx.beginPath();
  ctx.arc(at[0], at[1], 6.6, 0, Math.PI * 2);
  ctx.fill();
  if (!white) {
    ctx.strokeStyle = INK.ink; ctx.lineWidth = 2; ctx.stroke();
    // 一道指缝：光一个圆仍然像关节，加一笔就读成握着的手
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.moveTo(at[0] - 3.4, at[1] - 1.2);
    ctx.lineTo(at[0] + 3.4, at[1] - 1.2);
    ctx.stroke();
  }
}

type ActionSprites = PartImages & Required<Pick<PartImages,
  'poseIdle' | 'poseRun' | 'posePunch' | 'poseKick' | 'poseBlock' | 'poseSuper'>>;

function isActionSprites(parts: PartImages | null): parts is ActionSprites {
  return !!(parts?.poseIdle && parts.poseRun && parts.posePunch
    && parts.poseKick && parts.poseBlock && parts.poseSuper);
}

function drawActionFrame(
  ctx: CanvasRenderingContext2D, part: PartImage, x: number, feetY: number,
  fc: number, targetH: number, white: boolean, bob = 0,
) {
  const sw = Math.max(1, part.right - part.left);
  const sh = Math.max(1, part.bottom - part.top);
  const targetW = targetH * sw / sh;
  ctx.save();
  ctx.translate(x, feetY + bob);
  ctx.scale(fc, 1);
  if (white) ctx.filter = 'brightness(3) grayscale(1)';
  ctx.drawImage(part.img, part.left, part.top, sw, sh, -targetW / 2, -targetH, targetW, targetH);
  ctx.restore();
}

function drawActionFighter(
  ctx: CanvasRenderingContext2D, f: Fighter, sprites: ActionSprites,
  x: number, feetY: number, white: boolean,
) {
  const act = spriteAction(f);
  const moving = f.state === 'walk' || f.state === 'run';
  const bob = moving ? Math.sin(f.stateFrame * .45) * 2.5 : f.state === 'idle' ? Math.sin(f.stateFrame * .1) * 1.2 : 0;
  const targetH = f.def.height * 1.16;
  const fc = f.facing;
  ctx.save();
  // Feet stay planted: scale from the feet, rotate around the hips, then offset along the facing.
  const ax = x + act.dx * fc, ay = feetY + act.dy;
  // Kicks pivot on the planted rear foot, knockdowns between the feet, everything else at the hips.
  const pivotX = act.pivot === 'feet' ? ax - targetH * .16 * fc : ax;
  const pivotY = act.pivot === 'hips' ? ay - targetH * .48 : ay;
  ctx.translate(pivotX, pivotY);
  ctx.rotate(act.rot * fc);
  ctx.translate(-pivotX, -pivotY);
  ctx.translate(ax, ay);
  ctx.scale(act.sx, act.sy);
  ctx.translate(-ax, -ay);
  drawActionFrame(ctx, sprites[act.pose], ax, ay, fc, targetH, white, bob);
  ctx.restore();
}

/** 角色脚下的地面投影：宽度随 def.width，透明度随离地高度衰减，画在角色之前、地面之后 */
function drawShadow(ctx: CanvasRenderingContext2D, x: number, y: number, width: number) {
  const t = Math.max(0.15, 1 - y / 150);
  const w = width * 0.9 * (0.7 + t * 0.3);
  ctx.fillStyle = `rgba(0,0,0,${0.28 * t})`;
  ctx.beginPath();
  ctx.ellipse(x, FLOOR_Y, w / 2, w / 7, 0, 0, Math.PI * 2);
  ctx.fill();
}

/** 只算骨段末端、不绘制。seg() 的几何与它保持一致——两处各写一遍必然漂移。 */
export function segEnd(x: number, y: number, angle: number, len: number, facing: number): [number, number] {
  return [x + Math.sin(angle) * len * facing, y + Math.cos(angle) * len];
}

function seg(
  ctx: CanvasRenderingContext2D, x: number, y: number, angle: number, len: number, w: number, facing: number,
  img?: PartImage, white = false,
): [number, number] {
  const [ex, ey] = segEnd(x, y, angle, len, facing);
  if (img) {
    drawBoneImg(ctx, x, y, ex, ey, w, img, white, facing);
  } else {
    fillTapered(ctx, x, y, ex, ey, w, white);
  }
  return [ex, ey];
}

/** 髋点/肩点：躯干挂载的两个骨骼锚点。肩点绕髋点按 p.lean 摆动（shLen 是唯一半径），
 * 髋点本身不随 lean 移动——腿从髋点独立发力，不该跟着躯干转。抽成独立、可导出的纯函数，
 * 是为了让 tests/renderer.test.ts 的楔形缺口扫描测试和 drawFighter 用同一份公式：改一处，
 * 两边同步；如果各自照抄一份，公式改坏了测试也不会发现。 */
export function torsoAnchors(x: number, feetY: number, lean: number, crouch: number, fc: number) {
  const hipX = x, hipY = feetY - HIP_Y + crouch;
  const shLen = SHOULDER_Y - HIP_Y;
  const shX = hipX + Math.sin(lean) * shLen * fc;
  const shY = hipY - Math.cos(lean) * shLen + crouch * 0.2;
  return { hipX, hipY, shX, shY };
}

/**
 * 骨骼装配核心：后侧肢体 → 躯干 → 头 → 前侧肢体（前后遮挡）。drawFighter（实时角色）和
 * drawGhost（残影快照）共用同一份拼装——残影要求"贴图路径下也要能跑"，跟正式渲染另起
 * 一份容易在贴图接缝/挂载逻辑上跑偏，抽出来只有一处入口，改一处两边同步。
 * white 只有 drawFighter 会传 true（受击白闪）；残影不闪白，恒传 false。
 */
export function drawLimbs(
  ctx: CanvasRenderingContext2D, p: Pose, x: number, feetY: number, fc: number,
  parts: PartImages | null, main: string, accent: string, white: boolean,
  weapon?: WeaponDef, weaponScale = 1, weaponGlow = 0,
  /** 无头（刑天）：不画头，改在胸口画一对眼、腹上画一张口。见 CharacterDef.headless */
  headless = false,
  /** 头饰。与大招特写共用同一份画法（drawCrown）——对局里那颗头此前也是个光头圆，
   * 十二个人只差配色；而玩家绝大多数时间看的是这里，不是特写。 */
  crown?: CharacterDef['crown'],
): void {
  const { hipX, hipY, shX, shY } = torsoAnchors(x, feetY, p.lean, p.crouch, fc);

  // 每条肢体只有一张图（无分大小臂/大小腿贴图），上下两段共用同一张部件图，
  // 各自按自己的段长/段宽独立挂载
  ctx.fillStyle = shade(main, -25);
  let j = seg(ctx, shX, shY, p.armB[0], UPPER_ARM, 11, fc, parts?.armB, white);
  const handB = seg(ctx, j[0], j[1], p.armB[0] + p.armB[1], LOWER_ARM, 9, fc, parts?.armB, white);
  if (!parts?.armB) drawHand(ctx, handB, main, white);
  j = seg(ctx, hipX, hipY, p.legB[0], THIGH, THIGH_W, fc, parts?.legB, white);
  seg(ctx, j[0], j[1], p.legB[0] - p.legB[1], SHIN, 11, fc, parts?.legB, white);

  if (parts?.torso) {
    // 20 = 原胶囊 lineWidth；起点=肩，图片顶部对肩、底部对腰。两端各沿骨骼轴向多伸出
    // NECK_OVERLAP/WAIST_OVERLAP，让躯干贴图往上盖过颈部、往下盖过腰部，接缝做成重叠
    // 而不是贴边（下面头部绘制会盖在颈部重叠区之上，腰部的重叠区则被后画的腿盖住）
    const [tx, ty, hx, hy] = extendSeg(shX, shY, hipX, hipY, NECK_OVERLAP, WAIST_OVERLAP);
    drawBoneImg(ctx, tx, ty, hx, hy, TORSO_MOUNT_HALFW, parts.torso, white, fc);
  } else if (white) {
    ctx.fillStyle = '#fff';
    fillTapered(ctx, shX, shY, hipX, hipY, TORSO_W, true); // 白闪时整体转白，跳过渐变与描边
  } else {
    const tg = ctx.createLinearGradient(0, shY, 0, hipY); // 竖向渐变：上端 main，下端压暗
    tg.addColorStop(0, main);
    tg.addColorStop(1, shade(main, -28));
    ctx.fillStyle = tg;
    // 肩端粗、髋端细——武人是宽肩窄腰，不是宽臀窄肩的裙摆轮廓（taperedPath 的 x1,y1 是粗的
    // 那头，所以起点传肩不传髋）；TORSO_W 比头部直径 32 明显更宽，肩线撑得起头，不会显小孩
    fillTapered(ctx, shX, shY, hipX, hipY, TORSO_W, false);
  }

  const { cx: headCx, cy: headCy, angle: baseHeadAngle } = headAnchor(shX, shY, p.lean, fc);
  const headAngle = baseHeadAngle + p.headTilt * fc; // 头相对躯干的额外偏转
  if (parts?.head) {
    // 缩放取自**头素材自己的内容高**，对齐一个固定的逻辑目标高度。
    //
    // 这里先后错过两版。最早是把头硬塞进 32×32 方框：横向 32/128、纵向 32/107 两个比例，
    // 非方形的脸当场压扁。改法是让头跟躯干共用一个比例——scale = 40/躯干内容宽——
    // 方向对，但那个比例来自**另一件素材的留白**：屏幕上的头高等于
    //     头内容高 × 40 ÷ 躯干内容宽
    // 是两件独立素材的测量值相除，没有任何解剖依据。实测头素材内容高本身很齐
    // （95~128，中位 124），可除完之后炸成 29.5~45.2，足足 1.53 倍。
    // 更直接的证据：重切了一轮躯干，全员的头尺寸跟着变了——躯干的裁切参数不该有这个权力。
    //
    // 骨架是同一副，头就该是同一个大小。角色差异体现在脸怎么画、戴什么冠，不是头有多大。
    // 按颈部底边对齐这条保留：头素材多高都不会浮起来，脖子始终落在衣领上。
    const { img, top, bottom, left, right } = parts.head;
    const scale = headScale(parts.head);
    // 源矩形取内容包围盒，横纵都裁。原来横向取整幅 naturalWidth，再拿 contentDx 把刚
    // 包进来的留白手工减掉——一进一出，等价于直接裁。裁了之后内容天然居中，脸没画在
    // 正中也不会歪，那个补偿项从构造上就不需要了。
    const sw = Math.max(1, right - left);
    const dw = sw * scale, dh = (bottom - top) * scale;
    ctx.save();
    ctx.translate(headCx, headCy);
    ctx.rotate(headAngle); // 部分跟随 lean——顺序与 drawBoneImg 一致：先在世界系里转，
    ctx.scale(fc, 1); // 再镜像贴图内容，镜像不会带偏已经转好的朝向（同 drawBoneImg 的注释）
    // 只取 top..bottom 这段内容行（parts.ts 已裁掉上下透明留白），横向仍是整张图；
    // 目标矩形的**底边**贴在颈点上（headCy 即颈点），高度由素材自己的比例决定
    ctx.drawImage(img, left, top, sw, bottom - top, -dw / 2, -dh, dw, dh);
    if (white) {
      ctx.globalCompositeOperation = 'source-atop';
      ctx.fillStyle = '#fff';
      ctx.fillRect(-dw / 2, -dh, dw, dh);
    }
    ctx.restore();
  } else if (headless) {
    // 无头：断首之后以乳为目、以脐为口。不画头，改在躯干上画那三处——
    // 这不是省一颗圆，是他这个角色的**本体**（见 CharacterDef.headless）。
    // 位置从肩点与髋点插值取，跟着 lean 一起动，不另立一套坐标。
    const ex = (shX + hipX) / 2, ey = shY + (hipY - shY) * 0.22;
    ctx.fillStyle = white ? '#fff' : INK.paper;
    for (const s2 of [-1, 1]) {
      ctx.beginPath();
      ctx.arc(ex + s2 * 7 * fc * Math.cos(p.lean), ey + s2 * 7 * Math.sin(p.lean) * fc, 3.4, 0, Math.PI * 2);
      ctx.fill();
    }
    if (!white) {
      ctx.strokeStyle = INK.ink; ctx.lineWidth = 1.2;
      for (const s2 of [-1, 1]) {
        ctx.beginPath();
        ctx.arc(ex + s2 * 7 * fc * Math.cos(p.lean), ey + s2 * 7 * Math.sin(p.lean) * fc, 3.4, 0, Math.PI * 2);
        ctx.stroke();
      }
    }
    // 脐为口：髋点略上，一道横弧
    const mx = (shX + hipX) / 2 + (hipX - shX) * 0.28, my = shY + (hipY - shY) * 0.72;
    ctx.strokeStyle = white ? '#fff' : INK.ink;
    ctx.lineWidth = 2.2;
    ctx.beginPath();
    ctx.arc(mx, my, 5.5, 0.25, Math.PI - 0.25);
    ctx.stroke();
  } else {
    // 头：圆形程序化兜底，各向同性，不需要跟着 headAngle 转。headAnchor 现在给的是颈点，
    // 圆心要沿骨骼方向再抬一个半径——lean=0 时圆心正好回到旧的 shY-20
    const cUx = Math.sin(p.lean) * fc, cUy = -Math.cos(p.lean);
    const headCx2 = headCx + cUx * HEAD_R, headCy2 = headCy + cUy * HEAD_R;
    ctx.fillStyle = accent;
    ctx.beginPath(); ctx.arc(headCx2, headCy2, HEAD_R, 0, Math.PI * 2); ctx.fill();
    // 头饰画在头之后、面孔之前：它是戴在头上的，不该被脸盖住，也不该盖住眼睛。
    // 受击白闪时跳过——那一帧整个人是纯白剪影，多画一件反而破坏"闪"的读法
    if (crown && !white) {
      ctx.save();
      ctx.translate(headCx2, 0);
      ctx.scale(fc, 1);            // 非对称的那几件（发簪/抹额）要跟着朝向翻
      drawCrown(ctx, crown, headCy2, HEAD_R);
      ctx.restore();
    }
    if (!white) {
      ctx.strokeStyle = INK.ink;
      ctx.lineWidth = 2;
      ctx.stroke();
      const hiAngle = fc === 1 ? 0 : Math.PI; // 面向侧留一道高光弧
      ctx.strokeStyle = INK.paper;
      ctx.lineWidth = 2.5;
      ctx.beginPath(); ctx.arc(headCx2, headCy2, 11, hiAngle - 0.7, hiAngle + 0.7); ctx.stroke();
      // 侧脸：一道眉、一只眼。没有它这颗头就是一枚空白鹅卵石——
      // public/chars/ 只有最早四个人有 head.png，另外八个走的全是这条程序化分支，
      // 于是同一帧里一边是画出来的脸、一边是没有五官的假人。
      // 只画这两笔：这套画风本来就是平涂粗描边，五官多了反而脏
      ctx.save();
      ctx.translate(headCx2, headCy2);
      ctx.scale(fc, 1);            // 朝向哪边，脸就朝哪边
      ctx.strokeStyle = INK.ink;
      ctx.lineCap = 'round';
      ctx.lineWidth = 2.2;
      ctx.beginPath();             // 眉：略斜，压在眼上方
      ctx.moveTo(2.5, -6.5);
      ctx.lineTo(9.5, -4.5);
      ctx.stroke();
      ctx.fillStyle = INK.ink;     // 眼
      ctx.beginPath();
      ctx.ellipse(7, 0, 1.9, 2.4, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
  }

  ctx.fillStyle = main;
  j = seg(ctx, hipX, hipY, p.legF[0], THIGH, THIGH_W, fc, parts?.legF, white);
  seg(ctx, j[0], j[1], p.legF[0] - p.legF[1], SHIN, 11, fc, parts?.legF, white);
  ctx.fillStyle = accent;
  j = seg(ctx, shX, shY, p.armF[0], UPPER_ARM, 11, fc, parts?.armF, white);
  const elbow = j;
  j = seg(ctx, j[0], j[1], p.armF[0] + p.armF[1], LOWER_ARM, 9, fc, parts?.armF, white);
  if (parts?.weapon) { // 有贴图就用贴图
    seg(ctx, j[0], j[1], p.armF[0] + p.armF[1], 34, 8, fc, parts.weapon, white);
  } else if (weapon) { // 否则走程序化兵器：方向取前臂（肘→手）的实际朝向，不重算角度约定
    drawWeapon(ctx, elbow, j, weapon, white, weaponScale, weaponGlow);
  }
  // 手压在兵器之上——顺序就是"握住"这件事本身
  // 前手用 main，不用 accent。accent 是高光色，多数角色的是接近白的浅色
  // （后羿 #f2efe6、哪吒 #ffd23f），配上深描边和那道指缝，在选人卡的尺寸上
  // 成了每个人腰腹上一枚最显眼的浅色贴纸——比脸还抢眼。
  // 后手本来就是 main，两只手不同色也说不通。可读性靠描边和指缝，不靠亮度。
  if (!parts?.armF) drawHand(ctx, j, main, white);
}

/** 兵器握持点（前手末端）与朝向。抽出来是因为拖影也要用同一个点——
 * 两处各算一遍必然漂移。 */
export function weaponHold(p: Pose, x: number, feetY: number, fc: number) {
  const { shX, shY } = torsoAnchors(x, feetY, p.lean, p.crouch, fc);
  const elbow = segEnd(shX, shY, p.armF[0], UPPER_ARM, fc);
  const hand = segEnd(elbow[0], elbow[1], p.armF[0] + p.armF[1], LOWER_ARM, fc);
  return { elbow, hand };
}

/** 兵器尖端的世界坐标，供拖影采样 */
export function weaponTipOf(p: Pose, x: number, feetY: number, fc: number, w: WeaponDef): [number, number] {
  const { elbow, hand } = weaponHold(p, x, feetY, fc);
  const dx = hand[0] - elbow[0], dy = hand[1] - elbow[1];
  const L = Math.hypot(dx, dy) || 1;
  const ux = dx / L, uy = dy / L;
  const fwd = w.len * (1 - w.grip);
  return [hand[0] + ux * fwd, hand[1] + uy * fwd];
}

/** 程序化兵器：沿前臂方向画一根杆，按形制在两端加不同的头，不用任何美术资源。
 *
 * 九种形制各自对应角色招式名里那件东西——火尖枪的焰形刃、如意棒的箍、三尖两刃刀的三叉、
 * 九齿钉耙的横梁与九根齿、震天弓的弓臂与弦、戚的阔斧、判官剑的剑格、芭蕉扇的叶面、
 * 混铁棍的钝重头。**最后一支是 else**（钝头棍）：新形制忘了加分支不会报错，
 * 只会安静地画成一根棍子，所以 weapons.test 里钉着"九种画出来两两不同"。
 *
 * 导出只为那条测试：它要拿一个记录用的 ctx 把九种各画一遍，比对调用序列。 */
export function drawWeapon(
  ctx: CanvasRenderingContext2D, elbow: [number, number], hand: [number, number],
  w0: WeaponDef, white: boolean, scale = 1, glow = 0,
) {
  const w = scale === 1 ? w0 : { ...w0, len: w0.len * scale };
  if (glow > 0) { // 大招期间刃身发光：叠一层同色的粗描边
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = Math.min(glow, 1) * 0.55;
    drawWeapon(ctx, elbow, hand, { ...w, shaft: w.edge }, false, 1, 0);
    ctx.restore();
  }
  const dx = hand[0] - elbow[0], dy = hand[1] - elbow[1];
  const L = Math.hypot(dx, dy) || 1;
  const ux = dx / L, uy = dy / L;      // 顺着前臂往外
  const px = -uy, py = ux;             // 垂直方向
  const fwd = w.len * (1 - w.grip), back = w.len * w.grip;
  const tipX = hand[0] + ux * fwd, tipY = hand[1] + uy * fwd;
  const buttX = hand[0] - ux * back, buttY = hand[1] - uy * back;
  const shaft = white ? '#fff' : w.shaft;
  const edge = white ? '#fff' : w.edge;

  // 杆。弓没有杆——它是横着握的，画一根顺前臂的直杆就成了"举着一根棍"，
  // 而弓臂本身就是它的形。所以这一段跳过，下面 bow 那一支自己画弓臂与弦。
  if (w.kind !== 'bow') {
    ctx.strokeStyle = shaft;
    ctx.lineWidth = w.kind === 'mace' ? 8 : w.kind === 'staff' ? 6 : w.kind === 'rake' ? 6 : 5;
    ctx.beginPath(); ctx.moveTo(buttX, buttY); ctx.lineTo(tipX, tipY); ctx.stroke();
    ctx.strokeStyle = white ? '#fff' : INK.ink;
    ctx.lineWidth = 1.2;
    ctx.beginPath(); ctx.moveTo(buttX, buttY); ctx.lineTo(tipX, tipY); ctx.stroke();
  }

  const tri = (cx: number, cy: number, len: number, halfW: number) => {
    ctx.beginPath();
    ctx.moveTo(cx + ux * len, cy + uy * len);
    ctx.lineTo(cx + px * halfW, cy + py * halfW);
    ctx.lineTo(cx - px * halfW, cy - py * halfW);
    ctx.closePath(); ctx.fill();
  };

  ctx.fillStyle = edge;
  if (w.kind === 'spear') {          // 火尖枪：焰形刃 + 缨
    tri(tipX, tipY, 16, 5);
    ctx.strokeStyle = edge; ctx.lineWidth = 3;
    for (const s of [-1, 1]) { // 两缕火缨
      ctx.beginPath();
      ctx.moveTo(tipX - ux * 6, tipY - uy * 6);
      ctx.quadraticCurveTo(tipX - ux * 16 + px * 7 * s, tipY - uy * 16 + py * 7 * s,
        tipX - ux * 26 + px * 3 * s, tipY - uy * 26 + py * 3 * s);
      ctx.stroke();
    }
  } else if (w.kind === 'staff') {   // 如意棒：两端金箍
    for (const e of [[tipX, tipY], [buttX, buttY]] as const) {
      ctx.beginPath();
      ctx.arc(e[0], e[1], 5, 0, Math.PI * 2);
      ctx.fill();
    }
  } else if (w.kind === 'glaive') {  // 三尖两刃刀：主刃 + 两侧短叉
    tri(tipX, tipY, 20, 6);
    for (const s of [-1, 1]) tri(tipX + px * 7 * s - ux * 4, tipY + py * 7 * s - uy * 4, 11, 3);
  } else if (w.kind === 'rake') {    // 九齿钉耙：横梁 + 九根齿。名字里就写着几根，那就画几根
    const half = 17;
    ctx.strokeStyle = edge; ctx.lineWidth = 4.5;
    ctx.beginPath();
    ctx.moveTo(tipX + px * half, tipY + py * half);
    ctx.lineTo(tipX - px * half, tipY - py * half);
    ctx.stroke();
    ctx.lineWidth = 2.4; ctx.lineCap = 'round';
    for (let i = 0; i < 9; i++) {
      const t = (i / 8 - 0.5) * 2 * half;
      ctx.beginPath();
      ctx.moveTo(tipX + px * t, tipY + py * t);
      ctx.lineTo(tipX + px * t + ux * 12, tipY + py * t + uy * 12);
      ctx.stroke();
    }
    ctx.lineCap = 'butt';
  } else if (w.kind === 'axe') {     // 戚：偏在一侧的阔斧，刃口外凸；杆头再留一个小尖
    ctx.beginPath();
    ctx.moveTo(tipX - ux * 15, tipY - uy * 15);
    ctx.quadraticCurveTo(tipX - ux * 2 + px * 30, tipY - uy * 2 + py * 30,
      tipX + ux * 11 + px * 7, tipY + uy * 11 + py * 7);
    ctx.lineTo(tipX + ux * 9, tipY + uy * 9);
    ctx.closePath(); ctx.fill();
    ctx.strokeStyle = white ? '#fff' : INK.ink; ctx.lineWidth = 1.4; ctx.stroke();
    ctx.fillStyle = edge; tri(tipX + ux * 9, tipY + uy * 9, 9, 3);
  } else if (w.kind === 'sword') {   // 剑：剑格 + 收锋的直刃。刃比杆宽，才不至于看成一根棍
    const gx = hand[0] + ux * 7, gy = hand[1] + uy * 7;
    ctx.beginPath();
    ctx.moveTo(gx + px * 4.5, gy + py * 4.5);
    ctx.lineTo(tipX + ux * 11, tipY + uy * 11);
    ctx.lineTo(gx - px * 4.5, gy - py * 4.5);
    ctx.closePath(); ctx.fill();
    ctx.strokeStyle = white ? '#fff' : INK.ink; ctx.lineWidth = 1.2; ctx.stroke();
    ctx.strokeStyle = shaft; ctx.lineWidth = 3.4;   // 剑格
    ctx.beginPath();
    ctx.moveTo(gx + px * 10, gy + py * 10);
    ctx.lineTo(gx - px * 10, gy - py * 10);
    ctx.stroke();
  } else if (w.kind === 'bow') {     // 震天弓：弓臂沿垂直方向张开、朝前弯，弦绷在内侧
    const up = w.len * (1 - w.grip), dn = w.len * w.grip;   // grip 决定握点偏上还是偏下
    const t1: [number, number] = [hand[0] + px * up, hand[1] + py * up];
    const t2: [number, number] = [hand[0] - px * dn, hand[1] - py * dn];
    ctx.strokeStyle = shaft; ctx.lineWidth = 5; ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(t1[0], t1[1]);
    ctx.quadraticCurveTo(hand[0] + ux * 26, hand[1] + uy * 26, t2[0], t2[1]);
    ctx.stroke();
    ctx.strokeStyle = edge; ctx.lineWidth = 1.4;    // 弦
    ctx.beginPath(); ctx.moveTo(t1[0], t1[1]); ctx.lineTo(t2[0], t2[1]); ctx.stroke();
    ctx.fillStyle = edge;                            // 两端弓弭
    for (const e of [t1, t2]) { ctx.beginPath(); ctx.arc(e[0], e[1], 3.2, 0, Math.PI * 2); ctx.fill(); }
    ctx.lineCap = 'butt';
  } else if (w.kind === 'fan') {     // 芭蕉扇：宽阔的叶面 + 三根扇骨，握把很短
    // 扇面是**横着张开**的（沿 p 轴展宽），不是顺着杆子伸长——她的攻程来自风，不是杆长
    // 扇面要**大**才读得出是扇：第一版 spread 15 / blade 26 在实机上是一根棍加个小疙瘩。
    // 芭蕉扇本来就是"比人还宽"的法宝，这里给到近乎半个身位
    const spread = 30, blade = 46;
    ctx.beginPath();
    ctx.moveTo(tipX - ux * 4, tipY - uy * 4);
    ctx.quadraticCurveTo(tipX + ux * blade + px * spread, tipY + uy * blade + py * spread,
      tipX + ux * (blade + 6), tipY + uy * (blade + 6));
    ctx.quadraticCurveTo(tipX + ux * blade - px * spread, tipY + uy * blade - py * spread,
      tipX - ux * 4, tipY - uy * 4);
    ctx.closePath(); ctx.fill();
    ctx.strokeStyle = white ? '#fff' : INK.ink; ctx.lineWidth = 1.2; ctx.stroke();
    ctx.strokeStyle = shaft; ctx.lineWidth = 1.4;
    for (const s2 of [-1, 0, 1]) {   // 扇骨
      ctx.beginPath();
      ctx.moveTo(tipX - ux * 2, tipY - uy * 2);
      ctx.lineTo(tipX + ux * (blade - 2) + px * spread * 0.7 * s2, tipY + uy * (blade - 2) + py * spread * 0.7 * s2);
      ctx.stroke();
    }
  } else {                            // 混铁棍：钝重头
    ctx.beginPath();
    ctx.ellipse(tipX + ux * 5, tipY + uy * 5, 11, 8, Math.atan2(uy, ux), 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = white ? '#fff' : INK.ink; ctx.lineWidth = 1.5; ctx.stroke();
  }
}

/**
 * 选人页的立绘：把这个角色按站姿画进一个 w×h 的框里。
 *
 * 十二张选人卡此前只有**竖排名号 + 一层配色**，形状完全一样——玩家第一次
 * 感到"新角色怎么都一样"就在这一屏，比进对局还早。
 * 而现在这十二个人本来就分得开：九种兵器形制、刑天无头、雷震子有翅膀。
 * 所以不新画一套立绘，直接复用对局那套骨骼装配（drawLimbs）——
 * 卡面上出现的就是待会儿真正打的那个人，两边永远不会不一致。
 *
 * 帧号固定传 0：卡片是静态的，不该为了一屏选人跑十二个 60fps 的画布。
 */
export function drawPortrait(ctx: CanvasRenderingContext2D, def: CharacterDef, w: number, h: number) {
  if (isOriginalFighter(def.id)) { drawOriginalPortrait(ctx, def, w, h); return; }
  const parts = getParts(def.id);
  if (def.footballKit && isActionSprites(parts)) {
    drawActionFrame(ctx, parts.poseIdle, w / 2, h * .96, 1, h * .88, false);
    return;
  }
  const FIG = 178;                       // 脚底到头顶的逻辑高度（SHOULDER_Y 118 + 头颈）
  const s = (h * 0.86) / FIG;
  const pose = samplePose(MOTIONS.idle, 0);
  ctx.save();
  ctx.translate(w / 2, h * 0.96);        // 原点落在脚底
  ctx.scale(s, s);
  if (def.adorn?.wings) {
    const a = torsoAnchors(0, 0, pose.lean, pose.crouch, 1);
    drawWings(ctx, def.adorn.wings, a.shX, a.shY, 1, 0, 0);
  }
  // 传 getParts 而不是 null：立绘刚做出来时还没有任何美术素材，当时写死 null 是对的；
  // 现在素材陆续补进来了，选人页却仍是火柴人——而那正是玩家第一眼看的地方。
  // 逐件挂载：有 head.png 就用，没有就回退程序化圆头（连带头饰），互不影响。
  drawLimbs(ctx, pose, 0, 0, 1, parts, def.palette.main, def.palette.accent, false,
    def.weapon, 1, 0, def.headless, def.crown);
  ctx.restore();
}

/**
 * 普通技的兵器视觉倍率：让刃尖**够到判定框前沿**。
 *
 * 玩家反馈「武器还没接触对方就显示被打了」，量下来是真的：判定框前沿普遍比刃尖远——
 * n3 一档多出 40~60px（牛魔王 判定125/兵器78、猪八戒 +59），接近一个身位宽，
 * 打空了却算中，一眼看得出来。
 *
 * 修的是**视觉**不是判定：判定框调过平衡、有一堆守门钉着，动它是另一回事；
 * 而 weaponScale 这个字段本来就是为"招式名承诺变长的招"准备的。
 * 这里只是把它的缺省值从 1 改成"够到判定前沿所需的倍率"，所以**零平衡影响**。
 *
 * 只给普通技（n1~n3）。必杀/超必杀按同样算法要 2~6 倍（牛魔王 sp100 要 6.0×，
 * 78px 的混铁棍会变成 468px、半个场子长）——那一档的射程是特效撑起来的，不是兵器，
 * 所以不在这里凑，宁可不动。CAP 同理：再长就不像挥兵器了，是在拉面条。
 *
 * 结果按 (角色, 招式 id) 记忆化：它只依赖静态数据，而这是每帧都要走的路径。
 */
const REACH_CAP = 2.0;
const reachCache = new Map<string, number>();
export function autoWeaponScale(def: CharacterDef, mv: Move): number {
  if (mv.weaponScale !== undefined) return mv.weaponScale;
  if (!def.weapon || !(mv.slot === 'n1' || mv.slot === 'n2' || mv.slot === 'n3')) return 1;
  const key = `${def.id}:${mv.id}`;
  const hit = reachCache.get(key);
  if (hit !== undefined) return hit;
  const motion = MOTIONS[mv.motionId] ?? MOTIONS.thrust;
  const total = mv.startup + mv.active + mv.recovery;
  const front = mv.hitbox.x + mv.hitbox.w;
  const tipAt = (scale: number) => {
    let best = -1e9;
    for (let fr = mv.startup; fr <= mv.startup + mv.active; fr++) {
      const p = samplePose(motion, (fr / total) * motion.frames);
      best = Math.max(best, weaponTipOf(p, 0, FLOOR_Y, 1, { ...def.weapon!, len: def.weapon!.len * scale })[0]);
    }
    return best;
  };
  let out = 1;
  if (front - tipAt(1) > 12) {          // 差得不多就别动，免得每招都在微调
    let lo = 1, hi = REACH_CAP;
    if (tipAt(hi) < front - 8) out = hi; // 顶到上限也够不着：认了，不再拉长
    else { for (let i = 0; i < 30; i++) { const mid = (lo + hi) / 2; if (tipAt(mid) < front - 8) lo = mid; else hi = mid; } out = hi; }
  }
  reachCache.set(key, out);
  return out;
}

/**
 * 这一招的"视觉够不到判定框前沿"的缺口（px）。0 = 够得到。
 *
 * 规矩是玩家定的：**被打了，视觉上必须有东西够到——兵器，或者特效**。
 * 兵器那一半由 autoWeaponScale 管（只管普通技）。必杀/超必杀的射程本该由特效撑，
 * 实测撑不住：算上特效之后 sp100 仍普遍差 80~124px（牛魔王 判定360/兵器120/特效251），
 * 必杀也差 21~86px。差出来的那一段就是"什么都没碰到却算中"的地方。
 *
 * 这里只**算**缺口；补什么由 FxSystem 决定（在判定生效那一帧于前沿补一发）。
 * 分成两处是因为 renderer 引着 fx，fx 不能反过来引 renderer（会成环）。
 * 同样按 角色+招式 记忆化：只依赖静态数据。
 */
const gapCache = new Map<string, number>();
export function visualReachGap(def: CharacterDef, mv: Move): number {
  if (mv.projectile) return 0;               // 判定属于飞出去那颗，不属于本体
  const key = `${def.id}:${mv.id}`;
  const hit = gapCache.get(key);
  if (hit !== undefined) return hit;
  const front = mv.hitbox.x + mv.hitbox.w;
  const motion = MOTIONS[mv.motionId] ?? MOTIONS.thrust;
  const total = mv.startup + mv.active + mv.recovery;
  let reach = -1e9;
  if (def.weapon) {
    const sc = autoWeaponScale(def, mv);
    for (let f = mv.startup; f <= mv.startup + mv.active; f++) {
      const p = samplePose(motion, (f / total) * motion.frames);
      reach = Math.max(reach, weaponTipOf(p, 0, FLOOR_Y, 1, { ...def.weapon, len: def.weapon.len * sc })[0]);
    }
  }
  for (const e of mv.fx ?? []) {             // 判定窗口前后 6 帧内的特效才算数
    if (e.frame < mv.startup - 6 || e.frame > mv.startup + mv.active + 6) continue;
    reach = Math.max(reach, (e.x ?? 0) + (e.size ?? 24));
  }
  const gap = Math.max(0, front - reach - 20); // 留 20px 宽容：差一点点不值得再补一发
  gapCache.set(key, gap);
  return gap;
}

function drawFighter(ctx: CanvasRenderingContext2D, f: Fighter, x: number, y: number, who: 0 | 1) {
  if (isOriginalFighter(f.def.id)) {
    drawOriginalAction(ctx, f.def, originalAction(f), x, FLOOR_Y - y, f.facing, f.flash > 0);
    if (f.state === 'block') {
      ctx.save(); ctx.strokeStyle = '#7fd4ff'; ctx.lineWidth = 3;
      const { cx, cy, r, a0, a1 } = blockArcGeom(x, FLOOR_Y - y, f.facing);
      ctx.beginPath(); ctx.arc(cx, cy, r, a0, a1); ctx.stroke(); ctx.restore();
    }
    return;
  }
  if (!fighterReady(f.def)) return;
  const p: Pose = poseFor(f);
  const feetY = FLOOR_Y - y;
  const white = f.flash > 0;
  const main = white ? '#fff' : f.def.palette.main;
  const accent = white ? '#fff' : f.def.palette.accent;
  const fc = f.facing;
  if (f.def.artUrl) {
    const image = cachedImage(fighterArtCache, f.def.artUrl);
    if (image.complete && image.naturalWidth > 0) {
      const targetH = f.def.height * 1.38;
      const targetW = targetH * image.naturalWidth / image.naturalHeight;
      const bob = f.state === 'idle' ? Math.sin(f.stateFrame * .11) * 2 : 0;
      ctx.save();
      ctx.translate(x, feetY + bob);
      ctx.scale(fc, 1);
      if (white) ctx.filter = 'brightness(2.6) saturate(.2)';
      ctx.drawImage(image, -targetW / 2, -targetH, targetW, targetH);
      ctx.restore();
      if (f.state === 'block') {
        ctx.strokeStyle = '#8ae9ff'; ctx.lineWidth = 3;
        const { cx, cy, r, a0, a1 } = blockArcGeom(x, feetY, fc);
        ctx.beginPath(); ctx.arc(cx, cy, r, a0, a1); ctx.stroke();
      }
      return;
    }
  }
  // 逐件挂载：parts 里存在哪个字段就用哪张图，缺的字段各自独立回退到笔锋/胶囊绘制
  // （见 drawLimbs 里每处 parts?.xxx 判断）；parts 本身可能是空对象——效果等同完全没有美术
  const parts = getParts(f.def.id);
  const spriteBody = !!f.def.footballKit && isActionSprites(parts);
  // Painted sprites get their own per-move tilt (spriteAction); stacking the skeleton motion's roll on top
  // over-rotates them. Keep the motion roll only where it carries the whole body: rolls, airborne
  // tumbles and super choreography. Knockdowns lie the sprite on the floor themselves.
  const keepRoll = !spriteBody || f.state === 'roll'
    || (f.state === 'hitstun' && f.y > 0) || (f.state === 'attack' && (f.move?.meterCost ?? 0) > 0);
  const roll = keepRoll ? p.roll : 0;

  ctx.save();
  ctx.lineCap = 'round';
  // 整体翻转与挤压：套在骨骼装配之外的刚体/缩放变换，因此不动头颈接缝的几何关系
  //（那条楔形缺口扫描测试量的是 drawLimbs 内部的相对位置，不受这里影响）。
  // 支点取臀部高度：绕脚底转会让人像绕着脚尖倒，绕重心转才像被打翻。
  // 倒地此前是对 down 状态写死的 -90°——既不能插值也只有一个角度；现在由 pose.roll 给，
  // fallen 动作因此能「转着倒下去」，tumble 能在空中真的翻整圈。
  if (roll !== 0 || p.squash !== 1) {
    const pivotY = feetY - 40;
    ctx.translate(x, pivotY);
    if (roll !== 0) ctx.rotate(roll * fc);
    if (p.squash !== 1) ctx.scale(1 / p.squash, p.squash); // 横向反向补偿，体积守恒
    ctx.translate(-x, -pivotY);
  }
  if (spriteBody && isActionSprites(parts)) {
    drawActionFighter(ctx, f, parts, x, feetY, white);
  } else {
    // 兵器倍率取自当前招式；大招期间刃身发光，强度随判定窗口起落
    const mv = f.state === 'attack' ? f.move : null;
    const wScale = mv ? autoWeaponScale(f.def, mv) : 1;
    const wGlow = mv && mv.meterCost > 0 && f.stateFrame >= mv.startup
      && f.stateFrame < mv.startup + mv.active ? 1 : 0;
    // 兵器已被打飞的一方，手上不再画兵器
    const held = isDisarmed(who) ? undefined : f.def.weapon;
    drawLimbs(ctx, p, x, feetY, fc, parts, main, accent, white, held, wScale, wGlow, f.def.headless, f.def.crown);
  }

  if (import.meta.env.DEV && f.state === 'attack' && f.move) { // 判定帧命中框叠加层，直接取自 worldBox，与 checkHit 一致；仅调参用，生产构建裁掉
    const mv = f.move;
    if (f.stateFrame >= mv.startup && f.stateFrame < mv.startup + mv.active) {
      const hb = worldBox(mv.hitbox, x, feetY, fc);
      ctx.fillStyle = 'rgba(255, 224, 102, 0.35)';
      ctx.fillRect(hb.x, hb.y, hb.w, hb.h);
    }
  }

  if (f.state === 'block') {
    ctx.strokeStyle = '#7fd4ff'; ctx.lineWidth = 3;
    const { cx, cy, r, a0, a1 } = blockArcGeom(x, feetY, fc);
    ctx.beginPath(); ctx.arc(cx, cy, r, a0, a1); ctx.stroke();
  }
  ctx.restore();
}

/**
 * 残影环形缓冲：出招者身后 3–4 个逐渐淡出的姿势快照，只在 sp100 攻击窗口内采样——性能与
 * 观感都不需要全程开着。复用 drawLimbs 同一份骨骼拼装（含贴图路径），跟正式渲染是同一套
 * 美术，不会看起来像另一样东西。
 *
 * 推进必须挂在逻辑 tick 上（GameCanvas 固定步长循环里，紧跟 battle.tick() 之后）——同
 * tickDamageTrail 的道理，采样间隔/淡出速度不能绑定渲染帧率，否则 120Hz 手机上残影堆得
 * 更密、淡得更快。用 Battle 引用探测新局，避免上一局的残影漏进下一局第一帧。
 */
interface Ghost { x: number; y: number; pose: Pose; facing: 1 | -1; age: number; atlas?: AtlasAction }
interface GhostState { battle: Battle | null; p1: Ghost[]; p2: Ghost[]; since1: number; since2: number }
const ghostState: GhostState = { battle: null, p1: [], p2: [], since1: 0, since2: 0 };
const GHOST_MAX = 4;
const GHOST_SAMPLE_EVERY = 3; // 每 3 逻辑 tick 采样一次
const GHOST_LIFE = 14;        // age 超过这个 tick 数就从队列移除（淡出全程）
const GHOST_ALPHA = 0.42;     // 最新一张残影的峰值透明度——Task 35 之前是 0.3；那时残影多数
// 时间被 sp100 的暗场+背光盖住看不见（渲染顺序的问题，见下面 draw() 里补的那次重绘），调多高
// 都没用。顺序修好之后再看，0.3 在暗场里仍偏淡，调到 0.42 才在正常观战距离下读得出来是拖尾

function resetGhostsIfNewBattle(b: Battle): void {
  if (ghostState.battle !== b) {
    ghostState.battle = b; ghostState.p1 = []; ghostState.p2 = []; ghostState.since1 = 0; ghostState.since2 = 0;
  }
}

function stepGhostList(list: Ghost[], since: number, f: Fighter): number {
  const inWindow = f.state === 'attack' && f.move?.slot === 'sp100';
  if (!inWindow) { list.length = 0; return 0; } // 出了 sp100 窗口立刻清空，不留尾巴
  for (const g of list) g.age++;
  while (list.length && list[0].age > GHOST_LIFE) list.shift();
  if (since + 1 >= GHOST_SAMPLE_EVERY) {
    list.push({ x: f.x, y: f.y, pose: poseFor(f), facing: f.facing, age: 0,
      atlas: isOriginalFighter(f.def.id) ? originalAction(f) : undefined });
    if (list.length > GHOST_MAX) list.shift();
    return 0;
  }
  return since + 1;
}

/** 每逻辑 tick 调一次，紧跟 battle.tick() 之后（同 tickDamageTrail 的调用位置）。 */
export function tickAfterimages(b: Battle): void {
  resetGhostsIfNewBattle(b);
  ghostState.since1 = stepGhostList(ghostState.p1, ghostState.since1, b.p1);
  ghostState.since2 = stepGhostList(ghostState.p2, ghostState.since2, b.p2);
  stepWeaponTrail(weaponTrail.p1, b.p1);
  stepWeaponTrail(weaponTrail.p2, b.p2);
}

// ── 兵器拖影 ────────────────────────────────────────────────────────
/** 挥动时刃尖划过的弧线。采样只在 attack 状态进行——走路时挥个残影反而脏。
 * 与残影共用同一条逻辑 tick（tickAfterimages），不另起计时器。 */
const TRAIL_LEN = 10;
type TrailPt = { x: number; y: number };
const weaponTrail = { p1: [] as TrailPt[], p2: [] as TrailPt[] };

function stepWeaponTrail(list: TrailPt[], f: Fighter) {
  const w = f.def.weapon;
  if (!w || f.state !== 'attack') { if (list.length) list.length = 0; return; }
  const [tx, ty] = weaponTipOf(poseFor(f), f.x, FLOOR_Y - f.y, f.facing, w);
  list.push({ x: tx, y: ty });
  while (list.length > TRAIL_LEN) list.shift();
}

/** 画拖影：沿采样点连成一条越往回越细越淡的带子。用 lighter 叠加，刃光才亮得起来。 */
function drawTrail(ctx: CanvasRenderingContext2D, list: TrailPt[], color: string) {
  if (list.length < 3) return;
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  ctx.lineCap = 'round';
  for (let i = 1; i < list.length; i++) {
    const k = i / (list.length - 1);       // 0=最旧 1=最新
    ctx.strokeStyle = hexAlpha(color, 0.10 + k * 0.42);
    ctx.lineWidth = 1.5 + k * 6;
    ctx.beginPath();
    ctx.moveTo(list[i - 1].x, list[i - 1].y);
    ctx.lineTo(list[i].x, list[i].y);
    ctx.stroke();
  }
  ctx.restore();
}

function drawGhost(ctx: CanvasRenderingContext2D, g: Ghost, def: CharacterDef) {
  if (!fighterReady(def)) return;
  const alpha = GHOST_ALPHA * Math.max(0, 1 - g.age / GHOST_LIFE);
  if (alpha <= 0.01) return;
  ctx.save();
  ctx.globalAlpha = alpha;
  if (isOriginalFighter(def.id) && g.atlas) {
    drawOriginalAction(ctx, def, g.atlas, g.x, FLOOR_Y - g.y, g.facing);
    ctx.restore(); return;
  }
  const parts = getParts(def.id);
  if (def.footballKit && isActionSprites(parts)) {
    drawActionFrame(ctx, parts.poseSuper, g.x, FLOOR_Y - g.y, g.facing, def.height * 1.16, false);
  } else {
    drawLimbs(ctx, g.pose, g.x, FLOOR_Y - g.y, g.facing, parts, def.palette.main, def.palette.accent, false, def.weapon, 1, 0, def.headless, def.crown);
  }
  ctx.restore();
}

export function drawWeaponTrail(ctx: CanvasRenderingContext2D, who: 0 | 1, def: CharacterDef) {
  if (def.weapon) drawTrail(ctx, who === 0 ? weaponTrail.p1 : weaponTrail.p2, def.weapon.edge);
}

function drawGhosts(ctx: CanvasRenderingContext2D, list: Ghost[], def: CharacterDef) {
  for (const g of list) drawGhost(ctx, g, def);
}

/** cut-in 用：直接复用已探测的部件缓存里的头像，不另开一份加载请求。缺 head.png（或整个
 * public/chars/ 都没有）时返回 null，调用方（GameCanvas 的 CutInSystem.trigger）据此
 * 优雅跳过 cut-in——不崩、不画空框。 */
export function getHeadPart(id: string): PartImage | null {
  if (isOriginalFighter(id)) return originalHeadPart(id);
  return getParts(id)?.head ?? null;
}

/**
 * 防御指示弧几何：圆心已经在镜像（x + fc*26），角度范围也必须跟着镜像——ctx.arc 的角度
 * 是画布绝对角度（0 = 朝 +x，即屏幕右），不会因为圆心挪到了 fc 那一侧就自动跟着转向。
 * 旧代码只镜像了圆心、角度范围写死 -1.2..1.2，面朝左（fc=-1）时弧仍然鼓向屏幕右侧，
 * 结果鼓进角色自己身体、背对对手，玩家报告"站右边防御方向错了"正是这个（右边的角色
 * 面朝左）。这里的 base 偏移写法直接抄头部高光弧那段现成的正确实现（同文件 hiAngle：
 * `fc === 1 ? 0 : Math.PI`），不用 drawBoneImg 那套 translate/scale(fc,1)——这段弧
 * 本身左右对称，偏移半圈跟镜像变换算出来的角度完全一致，没必要多开一次 save/restore。
 * 抽成纯函数只为了让测试量到这一步的确切产出，drawFighter 和测试各调一次同一份实现。
 */
export function blockArcGeom(x: number, feetY: number, fc: number) {
  const base = fc === 1 ? 0 : Math.PI;
  return { cx: x + fc * 26, cy: feetY - 90, r: 40, a0: base - 1.2, a1: base + 1.2 };
}

/** 颜色明度偏移，用于后侧肢体压暗 */
function shade(hex: string, amt: number): string {
  const n = parseInt(hex.slice(1), 16);
  const c = (v: number) => Math.min(255, Math.max(0, v + amt));
  return `rgb(${c(n >> 16)},${c((n >> 8) & 255)},${c(n & 255)})`;
}

// 血条几何：外框 2px ink 描边，2px 内缩为实际内容区
const BAR_W = 320, BAR_H = 20, BAR_Y = 20;
// 气槽两段：紧贴血条下方，段间留出清楚的间隙——离散两次充能，不是一条连续槽
const SEG_GAP = 10, SEG_H = 16, SEG_Y = BAR_Y + BAR_H + 8;
// ShenxianSerif 子集（Task 25）放栈首，系统衬线留作它没加载出来时的兜底——理由同 banner.ts 的 SERIF
const NAME_FONT = "italic 800 20px 'Barlow Condensed','ShenxianSerif','Songti SC','SimSun','Noto Serif CJK SC',serif";
const NAME_GAP = 10;
// 角色名最外侧到真实屏幕边缘的安全距离（逻辑单位）：Task 29 之前这里是裸的 10，宽屏下换算成
// 屏幕像素只有十来 px，几乎贴边。放大到 24 让左右留白显得稳定、宽窄屏看着一致——顺带跟
// MuteButton 拉开的垂直间距配合，两套定位系统才不会再抢同一个角
// （那颗键现在是 top=10 的顶部居中，不再是当初的 top=168——TouchLayer 顶部注释记着这段变更）
const HUD_EDGE_MARGIN = 24;

/** 掉血残影：延迟追上真实血量的半透明条，让玩家看清刚才那套连招吃掉了多少。
 * 用 Battle 实例引用而非任何计时器/随机数判断"新一局"——每场 Fight 都是 new Battle()，
 * 引用一变就说明是新的一局，残影必须贴回满血，否则上一局的拖影会漏进下一局第一帧。 */
interface DamageTrail { battle: Battle | null; p1: number; p2: number }
const dmgTrail: DamageTrail = { battle: null, p1: 1, p2: 1 };
const TRAIL_CATCHUP = 0.02; // 每 tick 固定追赶的血量比例（占满血），不读时钟

function stepTrail(cur: number, real: number): number {
  if (real >= cur) return real; // 回血/训练场每 tick 满血重置：残影立刻贴回，不会倒着往回拖
  return Math.max(real, cur - TRAIL_CATCHUP);
}

function resetTrailIfNewBattle(b: Battle): void {
  if (dmgTrail.battle !== b) {
    dmgTrail.battle = b;
    dmgTrail.p1 = b.p1.hp / b.p1.def.hp;
    dmgTrail.p2 = b.p2.hp / b.p2.def.hp;
  }
}

/** 残影推进：必须挂在逻辑 tick 上（GameCanvas 固定步长循环里，紧跟 battle.tick() 之后），
 * 不能挂在 draw() 上——draw() 每个渲染帧跑一次，追赶速度就会绑定屏幕刷新率：60Hz 手机上
 * 追满全程约 0.83s，120Hz 手机上因为一秒钟多跑一倍帧数，同一段掉血看起来快一倍追平，
 * 同一套连招在不同设备上读出"吃了更少血"的错觉。挂在 tick 上，速度只取决于 60Hz 的固定
 * 逻辑步长，跟渲染帧率无关。 */
export function tickDamageTrail(b: Battle): void {
  resetTrailIfNewBattle(b);
  dmgTrail.p1 = stepTrail(dmgTrail.p1, b.p1.hp / b.p1.def.hp);
  dmgTrail.p2 = stepTrail(dmgTrail.p2, b.p2.hp / b.p2.def.hp);
}

/** 残血搏动的周期（逻辑帧）。约 0.75 秒一次——比心跳略慢，看得出是"警告"而不是闪烁噪点 */
const DANGER_PERIOD = 45;

function healthBar(ctx: CanvasRenderingContext2D, x: number, flip: boolean, f: Fighter, trailFrac: number, frame: number) {
  const w = BAR_W, h = BAR_H, y = BAR_Y;
  // 内容区：paper 极淡内衬 + ink 半透明槽底叠在上面——宣纸贴片压了墨线的底色
  ctx.fillStyle = hexAlpha(INK.paper, 0.12);
  ctx.fillRect(x + 2, y + 2, w - 4, h - 4);
  ctx.fillStyle = hexAlpha(INK.ink, 0.4);
  ctx.fillRect(x + 2, y + 2, w - 4, h - 4);

  const ix = x + 2, iy = y + 2, iw = w - 4, ih = h - 4;
  const hpFrac = f.hp / f.def.hp;
  // 残影画在血量条之下：血量条覆盖掉重叠部分，露出的那道半透明红色就是"刚掉的血"
  ctx.fillStyle = hexAlpha(INK.cinnab, 0.5);
  const trailW = trailFrac * iw;
  ctx.fillRect(flip ? ix + iw - trailW : ix, iy, trailW, ih);
  // 残血：转朱砂色**并且搏动**。0.3 这条线不是这里定的，是引擎那条 DESPERATE_HP——
  // 越过它对手就进入「凶暴」（攻击权重翻倍、逃跑权重砍到三成半）。
  // 光换个颜色的话，玩家看不出"从这一刻起对面会拼命"这件事已经发生了。
  const danger = hpFrac <= DESPERATE_HP;
  ctx.fillStyle = danger ? INK.cinnab : INK.gamboge;
  const hpW = hpFrac * iw;
  ctx.fillRect(flip ? ix + iw - hpW : ix, iy, hpW, ih);
  if (danger && hpFrac > 0) {
    // 搏动挂在**逻辑帧**上，不是渲染帧：这个项目在"按逻辑帧走的量"上栽过四次，
    // 120Hz 手机上按渲染帧算会让它快一倍（见 MenuBackdrop 那条注释）
    const pulse = 0.22 + 0.22 * (1 - Math.cos(2 * Math.PI * (frame % DANGER_PERIOD) / DANGER_PERIOD)) / 2;
    ctx.fillStyle = hexAlpha(INK.paper, pulse);
    ctx.fillRect(flip ? ix + iw - hpW : ix, iy, hpW, ih);
  }

  ctx.strokeStyle = INK.ink;
  ctx.lineWidth = 2;
  ctx.strokeRect(x, y, w, h);

  // 角色名：血条外侧，p1 右对齐贴左端外，p2 左对齐贴右端外；描边加深底色，避免撞上浅色天空。
  // save/restore 包住文字状态（font/baseline/align/描边宽度全在内）——比逐个手动复位更不容易漏
  ctx.save();
  ctx.font = NAME_FONT;
  ctx.textBaseline = 'middle';
  ctx.textAlign = flip ? 'left' : 'right';
  const tx = flip ? x + w + NAME_GAP : x - NAME_GAP;
  const ty = y + h / 2;
  ctx.strokeStyle = hexAlpha(INK.ink, 0.7);
  ctx.lineWidth = 3;
  ctx.strokeText(f.def.name, tx, ty);
  ctx.fillStyle = INK.paper;
  ctx.fillText(f.def.name, tx, ty);
  ctx.restore();
}

function meterBar(ctx: CanvasRenderingContext2D, x: number, flip: boolean, meter: number) {
  const segW = (BAR_W - SEG_GAP) / 2, y = SEG_Y, h = SEG_H;
  // 两格位置镜像：第一格（0→50）永远贴在角色自己那侧的外沿，与血条的锚定方向一致
  const positions = flip ? [x + BAR_W - segW, x] : [x, x + segW + SEG_GAP];
  for (let i = 0; i < 2; i++) {
    const sx = positions[i];
    const charge = Math.min(50, Math.max(0, meter - i * 50));
    if (charge >= 50) {
      // 充满：不只是"更满"，换描边+发光整体变个状态，一眼认得出这一格解锁了
      ctx.save();
      ctx.shadowColor = INK.gamboge;
      ctx.shadowBlur = 12;
      ctx.fillStyle = INK.gamboge;
      ctx.fillRect(sx, y, segW, h);
      ctx.restore();
      ctx.strokeStyle = INK.paper;
      ctx.lineWidth = 2;
      ctx.strokeRect(sx, y, segW, h);
    } else {
      ctx.fillStyle = hexAlpha(INK.ink, 0.4);
      ctx.fillRect(sx, y, segW, h);
      ctx.fillStyle = INK.azurite;
      ctx.fillRect(sx, y, segW * (charge / 50), h);
      ctx.strokeStyle = hexAlpha(INK.ink, 0.8);
      ctx.lineWidth = 1.5;
      ctx.strokeRect(sx, y, segW, h);
    }
    // Label each cell with what it buys, so the two bars under the health bar explain themselves.
    const full = charge >= 50;
    const label = i === 0 ? tr(full ? 'canvas.superReady' : 'canvas.superMeter') : tr(full ? 'canvas.maxReady' : 'canvas.max');
    ctx.save();
    ctx.font = "800 10px 'Barlow Condensed','DM Sans',sans-serif";
    ctx.textBaseline = 'middle';
    ctx.textAlign = flip ? 'right' : 'left';
    ctx.letterSpacing = '1px';
    ctx.fillStyle = full ? INK.ink : hexAlpha(INK.paper, 0.72);
    ctx.fillText(label, flip ? sx + segW - 7 : sx + 7, y + h / 2 + 0.5);
    ctx.restore();
  }
}

/** visW：本帧实际可见的逻辑宽度（默认等于 LOGIC_W，不传时行为不变）。宽屏下 visW > LOGIC_W，
 * 血条要贴真实屏幕左右边缘（-offX / LOGIC_W+offX），不能停在 960 的边上——否则宽屏两侧会露出
 * 一截背景，血条挤在视觉中央 */
function drawBars(ctx: CanvasRenderingContext2D, b: Battle, visW = LOGIC_W) {
  // 只读，不推进：残影的推进挂在 GameCanvas 的逻辑 tick 上（见 tickDamageTrail）。这里的
  // reset 只是防御性兜底——万一某一渲染帧的 draw() 抢在这场新 Battle 的第一次 tick 之前
  // 跑到，不让上一局的残影露一帧脸
  resetTrailIfNewBattle(b);

  const offX = (visW - LOGIC_W) / 2;
  const leftEdge = -offX, rightEdge = LOGIC_W + offX;

  // 外侧留给角色名的余量按实际文字宽度算，而不是拍一个固定 margin——不然长一点的名字
  // 会被血条或屏幕左右边缘挤掉
  ctx.font = NAME_FONT;
  const margin = Math.max(ctx.measureText(b.p1.def.name).width, ctx.measureText(b.p2.def.name).width) + NAME_GAP + HUD_EDGE_MARGIN;

  healthBar(ctx, leftEdge + margin, false, b.p1, dmgTrail.p1, b.frame);
  healthBar(ctx, rightEdge - margin - BAR_W, true, b.p2, dmgTrail.p2, b.frame);
  if (b.advancedCombat) {
    meterBar(ctx, leftEdge + margin, false, b.p1.meter);
    meterBar(ctx, rightEdge - margin - BAR_W, true, b.p2.meter);
  }
}
