import { expect, test } from 'vitest';
import {
  capturePrev, draw, drawBg, extendSeg, headAnchor, torsoAnchors, blockArcGeom, poseForFighter,
  NECK_OVERLAP, WAIST_OVERLAP, TORSO_MOUNT_HALFW, THIGH_LEN, THIGH_W, TAPER,
} from '../src/render/renderer';
import { LOGIC_H, LOGIC_W } from '../src/engine/types';
import { DEFAULT_BG } from '../src/data/stages';
import { Battle } from '../src/engine/battle';
import { Camera } from '../src/render/camera';
import { FxSystem } from '../src/render/fx';
import { BannerSystem } from '../src/render/banner';
import { MandorlaSystem } from '../src/render/mandorla';
import { testChar } from './helpers';
import { MOTIONS } from '../src/data/motions';
import { samplePose } from '../src/render/motion';
import { GOAT_ROSTER } from '../src/data/goats';

test('完整人体角色连续受击时能在 hit 与 hitAlt 之间切换，不会停止渲染循环', () => {
  const battle = new Battle(structuredClone(GOAT_ROSTER[0]), structuredClone(GOAT_ROSTER[1]));
  battle.p2.state = 'hitstun';
  battle.p2.stateFrame = 3;
  battle.p2.hitCount = 1;
  expect(() => poseForFighter(battle.p2)).not.toThrow();
  battle.p2.hitCount = 2;
  expect(() => poseForFighter(battle.p2)).not.toThrow();
});

/** 最小 CanvasRenderingContext2D 桩：只记录 fillRect 的 x 范围和 lineTo 的 x 坐标，
 * 其余方法空操作。够用来断言"背景铺到多宽"，不需要真的渲染像素。 */
function mockCtx() {
  const fillRects: { x: number; w: number }[] = [];
  const lineXs: number[] = [];
  const grad = { addColorStop() {} };
  const ctx = {
    save() {}, restore() {}, translate() {}, rotate() {}, scale() {},
    beginPath() {}, closePath() {}, stroke() {}, fill() {},
    moveTo(x: number) { lineXs.push(x); },
    lineTo(x: number) { lineXs.push(x); },
    arc() {}, bezierCurveTo() {}, quadraticCurveTo() {},
    createLinearGradient() { return grad; },
    createRadialGradient() { return grad; },
    fillRect(x: number, _y: number, w: number) { fillRects.push({ x, w }); },
    set globalCompositeOperation(_v: string) {},
    set globalAlpha(_v: number) {},
    set fillStyle(_v: unknown) {},
    set strokeStyle(_v: unknown) {},
    set lineWidth(_v: number) {},
  } as unknown as CanvasRenderingContext2D;
  return { ctx, fillRects, lineXs };
}

// Task 29：黑边问题的根因是背景只按 0..LOGIC_W 画，可见视口比安全区宽时右侧/左侧露出页面
// 底色。drawBg 现在按传入的 visW/visH 撑满可见宽度——去掉这个改动（比如硬编码回 LOGIC_W）
// 这条测试就会红：宽视口画出来的天空/山形范围会跟默认视口一样窄。
test('可见宽度大于 LOGIC_W 时，背景绘制范围随之变宽（天空铺满、山形延伸到新边界）', () => {
  const narrow = mockCtx();
  drawBg(narrow.ctx, DEFAULT_BG, 0); // 不传 visW/visH：默认等于安全区，行为跟改动前一致
  const wide = mockCtx();
  const visW = LOGIC_W + 400; // 模拟 20:9 超宽视口换算出的可见逻辑宽度
  drawBg(wide.ctx, DEFAULT_BG, 0, visW, LOGIC_H);

  // 天空渐变的 fillRect 宽度必须跟着可见宽度变宽，而不是恒等于 LOGIC_W
  const skyNarrow = narrow.fillRects[0];
  const skyWide = wide.fillRects[0];
  expect(skyNarrow.w).toBeCloseTo(LOGIC_W, 5);
  expect(skyWide.w).toBeCloseTo(visW, 5);
  expect(skyWide.w).toBeGreaterThan(skyNarrow.w);

  // 山形剪影的 lineTo/moveTo 必须画到新的可见右边界（LOGIC_W+offX）之外，不能停在原来的 LOGIC_W
  const maxXNarrow = Math.max(...narrow.lineXs);
  const maxXWide = Math.max(...wide.lineXs);
  expect(maxXNarrow).toBeCloseTo(LOGIC_W, 5);
  expect(maxXWide).toBeGreaterThan(LOGIC_W); // 宽视口下山形延伸到了安全区右边界之外
});

// Task 29：头/躯干贴图接缝——drawFighter 里躯干挂载调用 extendSeg 把起止点沿骨骼轴向延长，
// 让贴图内容盖过头/腿的接合处，重叠而不是贴边。去掉这个延长（endExt/startExt 传 0，等价于
// 直接用原始肩/髋点）这条测试就会红。
test('extendSeg 沿骨骼自身方向延长两端，不改变方向，只是伸长', () => {
  // 一段竖直向下的骨骼：肩 (100,100) → 髋 (100,150)，长 50
  const [sx, sy, ex, ey] = extendSeg(100, 100, 100, 150, 8, 4);
  expect(sx).toBeCloseTo(100, 5); // 竖直线延长不改变 x
  expect(sy).toBeCloseTo(92, 5); // 起点沿反方向多退 8：100-8
  expect(ex).toBeCloseTo(100, 5);
  expect(ey).toBeCloseTo(154, 5); // 终点沿正方向多伸 4：150+4

  // 带水平分量的骨骼（模拟 lean 后的躯干）：方向必须原样保留，不能被延长带偏
  const [sx2, sy2, ex2, ey2] = extendSeg(0, 0, 30, 40, 10, 0); // 3-4-5 直角三角形，len=50
  expect(sx2).toBeCloseTo(-6, 5); // 反方向延长 10：单位向量 (0.6,0.8)*10=(6,8)
  expect(sy2).toBeCloseTo(-8, 5);
  expect(ex2).toBeCloseTo(30, 5); // endExt=0，终点不动
  expect(ey2).toBeCloseTo(40, 5);
});

/**
 * 覆盖率桩：Node 测试环境里没有真正的 Canvas 2D 后端（要有真实像素读回得装 `canvas` 这个包，
 * 但本任务不许加新依赖），所以没法照字面意思"离屏 canvas + getImageData 找哨兵色"。这里退
 * 而求其次但等价地建一个覆盖率网格：canvas 初始状态全部标记为"仍是哨兵色"，draw() 过程里
 * 每次 ctx.fillRect 按当前 translate/scale 变换换算成设备坐标矩形，把命中的格子标记为
 * "已重绘"。相机变换（camera.ts 的 apply）以及顶层 GameCanvas 的 setTransform 全程只有
 * translate + 等比 scale，从没有 rotate/skew，所以这个轴对齐换算是精确的，不是近似——凡是
 * draw() 里"必须覆盖全画布"的图层（天空/地面/暗场/白闪）无一例外全是 fillRect，没有一个
 * 靠 fill()/描边路径覆盖，网格法完整复刻了"有没有哪块像素没被本帧任何一次绘制碰到"这件事。
 * fill()/stroke()/drawImage 等不参与网格（本测试不关心装饰性图形有没有画对，只关心哨兵色
 * 会不会露出来），全部空操作即可。
 */
function makeCoverageCtx(w: number, h: number) {
  const covered = new Uint8Array(w * h); // 0 = 仍是哨兵（这一格从没被任何 fillRect 碰到），1 = 本帧已重绘
  const stack: { a: number; d: number; e: number; f: number }[] = [];
  let a = 1, d = 1, e = 0, f = 0; // 当前变换：device = local*scale + translate（无旋转/斜切）
  function markRect(x: number, y: number, rw: number, rh: number) {
    const dx0 = a * x + e, dx1 = a * (x + rw) + e;
    const dy0 = d * y + f, dy1 = d * (y + rh) + f;
    const x0 = Math.max(0, Math.floor(Math.min(dx0, dx1)));
    const x1 = Math.min(w, Math.ceil(Math.max(dx0, dx1)));
    const y0 = Math.max(0, Math.floor(Math.min(dy0, dy1)));
    const y1 = Math.min(h, Math.ceil(Math.max(dy0, dy1)));
    for (let yy = y0; yy < y1; yy++) {
      const row = yy * w;
      for (let xx = x0; xx < x1; xx++) covered[row + xx] = 1;
    }
  }
  const grad = { addColorStop() {} };
  const ctx = {
    save() { stack.push({ a, d, e, f }); },
    restore() { const s = stack.pop(); if (s) ({ a, d, e, f } = s); },
    translate(x: number, y: number) { e += a * x; f += d * y; },
    scale(sx: number, sy: number) { a *= sx; d *= sy; },
    rotate() {}, // draw() 里带 rotate 的调用（云纹、粒子、部件贴图）都不是"必须覆盖全画布"的图层，见上
    beginPath() {}, closePath() {}, moveTo() {}, lineTo() {}, arc() {}, ellipse() {}, arcTo() {},
    bezierCurveTo() {}, quadraticCurveTo() {},
    fill() {}, stroke() {}, strokeRect() {}, fillText() {}, strokeText() {}, drawImage() {},
    measureText() { return { width: 40 } as TextMetrics; },
    createLinearGradient() { return grad; },
    createRadialGradient() { return grad; },
    fillRect(x: number, y: number, rw: number, rh: number) { markRect(x, y, rw, rh); },
    set globalCompositeOperation(_v: string) {},
    set globalAlpha(_v: number) {},
    set fillStyle(_v: unknown) {},
    set strokeStyle(_v: unknown) {},
    set lineWidth(_v: number) {},
    set lineCap(_v: unknown) {},
    set font(_v: string) {},
    set textAlign(_v: unknown) {},
    set textBaseline(_v: unknown) {},
    set shadowColor(_v: unknown) {},
    set shadowBlur(_v: number) {},
  } as unknown as CanvasRenderingContext2D;
  const total = w * h;
  return {
    ctx,
    isFullyCovered: () => covered.every(v => v === 1),
    coveredRatio: () => covered.reduce((s, v) => s + v, 0) / total,
  };
}

// Task 30 根因：天空只填到 FLOOR_Y，地面在 cam.apply 之内按世界坐标画；zoom > 1 时地面在屏幕
// 上的起始 y 低于 FLOOR_Y（镜头贴近把地平线推下去了），460 到地面实际起始 y 之间那条横带没有
// 任何绘制覆盖，上一帧角色腿部的像素就留在原地——这就是走路残影。把 drawBg 的天空 fillRect
// 高度改回覆盖整块画布（本文件这次改动）后，不管 zoom 是多少，画不到的地方最多露出天空色，
// 不会露出上一帧的残留像素。去掉修复（把 sky fillRect 的高度参数从 visH 改回 FLOOR_Y + offY）
// 这条测试必须变红。
test('draw() 在任意相机缩放下都重绘满整块画布，不留下未被覆盖、可能藏着上一帧残影的区域', () => {
  const battle = new Battle(testChar(), testChar());
  const prev = capturePrev(battle);
  const fx = new FxSystem();
  const banner = new BannerSystem();
  const mandorla = new MandorlaSystem();
  const viewport = { w: LOGIC_W, h: LOGIC_H };

  for (const zoom of [0.85, 1.0, 1.15, 1.45]) {
    const cam = new Camera();
    cam.zoom = zoom;
    const { ctx, isFullyCovered, coveredRatio } = makeCoverageCtx(LOGIC_W, LOGIC_H);
    draw(ctx, battle, prev, 0, cam, fx, banner, mandorla, null, 0, DEFAULT_BG, viewport);
    expect(isFullyCovered(), `zoom=${zoom} 覆盖率=${(coveredRatio() * 100).toFixed(3)}%，存在从未被本帧任何绘制碰到的区域`).toBe(true);
  }
});

// ============================================================================
// Task 31：头/身接缝在前倾姿态下的楔形缺口扫描。
//
// 根因（渲染管线一致，跟具体素材内容无关，纯几何）：躯干贴图挂载沿肩→髋骨骼旋转
// （torsoAnchors 里 shX/shY 随 p.lean 摆动），头部挂载点如果不跟着同一根骨骼转，
// 两者的接合线一个在转一个不转，lean 越大缺口越大——idle/walk 的小 lean（≤0.06）看
// 不出来，rush/slam/niumoSp100 这类前倾攻击帧（lean 到 ±0.5~0.6）才露馅。task-31 报告
// 里用真实素材截图确认过这条缺口在浏览器里确实可见，也确认了修复后确实闭合。
//
// 下面这组矩阵工具精确复刻 drawBoneImg／头部贴图分支的 translate→rotate→scale 顺序
// （不是照抄渲染公式的近似值），保证测试量的和实际画出来的是同一件事。
type Mat = [number, number, number, number, number, number]; // a,b,c,d,e,f: x'=ax+cy+e, y'=bx+dy+f
const IDENT: Mat = [1, 0, 0, 1, 0, 0];
function mMul(m: Mat, n: Mat): Mat {
  const [a, b, c, d, e, f] = m, [a2, b2, c2, d2, e2, f2] = n;
  return [a * a2 + c * b2, b * a2 + d * b2, a * c2 + c * d2, b * c2 + d * d2, a * e2 + c * f2 + e, b * e2 + d * f2 + f];
}
const mTranslate = (m: Mat, x: number, y: number): Mat => mMul(m, [1, 0, 0, 1, x, y]);
const mRotate = (m: Mat, a: number): Mat => { const c = Math.cos(a), s = Math.sin(a); return mMul(m, [c, s, -s, c, 0, 0]); };
const mScale = (m: Mat, sx: number, sy: number): Mat => mMul(m, [sx, 0, 0, sy, 0, 0]);
const mApply = (m: Mat, x: number, y: number): [number, number] => [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]];
/** 世界坐标点 -> 某个变换矩阵所定义的局部坐标系（矩阵求逆） */
function toLocal(m: Mat, px: number, py: number): [number, number] {
  const [a, b, c, d, e, f] = m;
  const det = a * d - b * c;
  const dx = px - e, dy = py - f;
  return [(d * dx - c * dy) / det, (-b * dx + a * dy) / det];
}

/** 躯干贴图顶边（挂在颈部延长点）的两个端点，精确复刻 drawFighter 里
 * extendSeg + drawBoneImg 的 translate/rotate(atan2(-dx,dy))/scale(fc,1) 顺序。 */
function torsoTopCorners(lean: number, crouch: number, fc: 1 | -1): { topL: [number, number]; topR: [number, number] } {
  const { hipX, hipY, shX, shY } = torsoAnchors(0, 0, lean, crouch, fc);
  const [tx, ty, hx, hy] = extendSeg(shX, shY, hipX, hipY, NECK_OVERLAP, WAIST_OVERLAP);
  const angle = Math.atan2(-(hx - tx), hy - ty);
  let m = IDENT; m = mTranslate(m, tx, ty); m = mRotate(m, angle); m = mScale(m, fc, 1);
  return { topL: mApply(m, -TORSO_MOUNT_HALFW, 0), topR: mApply(m, TORSO_MOUNT_HALFW, 0) };
}

/** 躯干贴图底边（腰部延长点）的两个端点，同上，只是取 extendSeg 返回的另一端。 */
function torsoBottomCorners(lean: number, crouch: number, fc: 1 | -1): { botL: [number, number]; botR: [number, number] } {
  const { hipX, hipY, shX, shY } = torsoAnchors(0, 0, lean, crouch, fc);
  const [tx, ty, hx, hy] = extendSeg(shX, shY, hipX, hipY, NECK_OVERLAP, WAIST_OVERLAP);
  const angle = Math.atan2(-(hx - tx), hy - ty);
  const len = Math.hypot(hx - tx, hy - ty);
  let m = IDENT; m = mTranslate(m, tx, ty); m = mRotate(m, angle); m = mScale(m, fc, 1);
  return { botL: mApply(m, -TORSO_MOUNT_HALFW, len), botR: mApply(m, TORSO_MOUNT_HALFW, len) };
}

const HEAD_S = 16; // drawFighter 里贴图头方形的半径（s=32 的一半），跟渲染那边字面量一致

/** 贴图头方形（headAnchor 给出的中心+旋转）覆盖某个世界坐标点的余量：
 * >=0 表示点落在方形内（接缝闭合），<0 表示点落在方形外（缺口，|值|=缺口宽度）。
 * 这个余量本身在静止姿态就不是 0（CHIN_OFFSET 让头略微前探，背侧天然留一点点——
 * 见下面测试对 REST 基线的说明），所以这里不是拿它跟 0 比，是拿它跟 REST 基线比。 */
function headSquareMargin(p: [number, number], shX: number, shY: number, lean: number, fc: 1 | -1): number {
  const { cx, cy, angle } = headAnchor(shX, shY, lean, fc);
  let m = IDENT; m = mTranslate(m, cx, cy); m = mRotate(m, angle); m = mScale(m, fc, 1);
  const [lx, ly] = toLocal(m, p[0], p[1]);
  return HEAD_S - Math.max(Math.abs(lx), Math.abs(ly));
}

/** 大腿胶囊（fillTapered/taperedPath 的精确复刻：髋端半径 r1 的圆头帽 + 向膝端线性收分
 * 的梯形躯体）覆盖某个世界坐标点的余量。腿部贴图目前不存在（public/chars 下每个角色目录
 * 只有 head.png 和 torso.png，从未出现过 legF/legB 图），程序化胶囊是唯一实际会跑的
 * 路径，量它就是量真实渲染结果，不是量一个假设未来会出现的素材形态。 */
function legCapsuleMargin(p: [number, number], hipX: number, hipY: number, legAngle: number, fc: 1 | -1): number {
  const dirx = Math.sin(legAngle) * fc, diry = Math.cos(legAngle);
  const dx = dirx * THIGH_LEN, dy = diry * THIGH_LEN;
  const segLen = Math.hypot(dx, dy) || 1;
  const ex = dy / segLen, ey = -dx / segLen; // 垂直于大腿方向的单位向量
  const relx = p[0] - hipX, rely = p[1] - hipY;
  const s = relx * dirx + rely * diry; // 沿大腿方向的投影
  const t = relx * ex + rely * ey;      // 垂直于大腿方向的投影
  const r1 = THIGH_W / 2, r2 = (THIGH_W * TAPER) / 2;
  const discMargin = r1 - Math.hypot(relx, rely); // 髋端圆头帽：与朝向无关的兜底覆盖
  const rAtS = s <= 0 ? r1 : s >= THIGH_LEN ? r2 : r1 + (r2 - r1) * (s / THIGH_LEN);
  const bodyOk = s >= -1e-6 && s <= THIGH_LEN + 1e-6;
  const bodyMargin = bodyOk ? rAtS - Math.abs(t) : -Infinity;
  return Math.max(discMargin, bodyMargin);
}

/** 每条 motion 在 [0, frames] 上采样：关键帧本身的 t（分段线性的极值只会落在断点上，
 * 保证扫到 lean 的真实峰值）+ 200 个均匀插值帧（覆盖关键帧之间、题目要求的"插值帧"）。 */
function sampleFrames(m: (typeof MOTIONS)[string]): number[] {
  const uniform = Array.from({ length: 201 }, (_, i) => (i / 200) * m.frames);
  return [...uniform, ...m.keys.map(k => k.t)];
}

// Task 31 验证过：这条缺口在 lean=0（idle 静止姿态）本来就不是严格贴合的零——CHIN_OFFSET
// 让头略微前探，静止姿态下背侧本就留了一点点余量（真实素材的衣领/发型会盖住，task-31 报告
// 里截图确认过静止姿态肉眼是闭合的）。这条测试不检查绝对零缺口（那既不是这次要修的 bug，
// 也不是当前素材实际呈现的样子），而是检查前倾"不会比静止姿态更差"——这才是用户报告的
// 症状本体："静止看着是合的，一前倾就露出缝"。REST 值本身当基线，只需要算一次。
const REST = { lean: 0, crouch: 0 } as const;

test('头/躯干接缝：任意 motion 的任意帧、任意朝向下，前倾都不会让缺口比静止姿态更大（Task 31）', () => {
  const { shX: restShX, shY: restShY } = torsoAnchors(0, 0, REST.lean, REST.crouch, 1);
  const restCorners = torsoTopCorners(REST.lean, REST.crouch, 1);
  const restMargin = Math.min(
    headSquareMargin(restCorners.topL, restShX, restShY, REST.lean, 1),
    headSquareMargin(restCorners.topR, restShX, restShY, REST.lean, 1),
  );

  const failures: string[] = [];
  for (const [name, m] of Object.entries(MOTIONS)) {
    for (const fc of [1, -1] as const) {
      for (const frame of sampleFrames(m)) {
        const p = samplePose(m, frame);
        const { shX, shY } = torsoAnchors(0, 0, p.lean, p.crouch, fc);
        const corners = torsoTopCorners(p.lean, p.crouch, fc);
        const margin = Math.min(
          headSquareMargin(corners.topL, shX, shY, p.lean, fc),
          headSquareMargin(corners.topR, shX, shY, p.lean, fc),
        );
        // 容差 0.6：headAnchor 的位置公式是纯旋转（跟 lean 走同一根轴），只有 HEAD_LEAN_FOLLOW
        // <1 时头贴图本身的旋转落后于骨骼，加上 shY 里 +crouch*0.2 不是纯旋转项（crouch 和
        // lean 同时变化的招式会带一点点残余）——这两处误差在 HEAD_LEAN_FOLLOW=0.95 下全量扫描
        // 的实测峰值约 0.36。0.6 留了一倍多余量，同时仍然远小于旧实现在 rush/slam 类前倾帧下
        // 的实际缺口增量（约 4~8，见 task-31 报告），改坏了会在这条线上被抓到。
        if (margin < restMargin - 0.6) {
          failures.push(`${name} fc=${fc} frame=${frame.toFixed(1)} lean=${p.lean.toFixed(2)} margin=${margin.toFixed(2)} (rest=${restMargin.toFixed(2)})`);
        }
      }
    }
  }
  expect(failures, `${failures.length} 个采样点缺口比静止姿态更大，前几个：\n${failures.slice(0, 8).join('\n')}`).toEqual([]);
});

// 腰部（躯干底边 vs 大腿）：同样的"沿骨骼轴向延长 vs 挂载点独立摆动"结构（WAIST_OVERLAP
// 沿骨骼轴向、大腿从髋点按自己的 legF/legB 角度独立摆动，不跟躯干 lean 联动）。
// 但跟脖子不同——task-31 报告里用真实素材截图确认过，重装前倾（rush 全程、niumoSp100 的
// lean=0.6 顶点）腰部肉眼看不出缺口：髋点本身不随 lean 移动（只有 WAIST_OVERLAP=4 这一点
// 点随骨骼转），且大腿髋端的圆头帽半径覆盖是各向同性的，不会因为躯干转了就露出来。这条测试
// 验证这个"腰部不怕前倾"的结论具备几何保证，而不只是肉眼看了几帧——同样按"前倾不比静止差"
// 的标准，不要求绝对零重叠（腿是独立关节，不该也不能跟躯干一起转）。
// Task 32 根因：防御指示弧的圆心用 x + fc*26 镜像了，但 ctx.arc 的角度范围写死
// -1.2..1.2（画布绝对角度，0 = 朝屏幕右）。面朝左（fc=-1）时圆心挪到了角色左边，弧本身
// 却仍然鼓向屏幕右——鼓进角色自己身体，而不是朝向对手。玩家报告"站右边防御方向都错了"，
// 是因为站右边的角色固定面朝左。这条测试量弧的鼓起顶点（角度区间中点对应的圆周上那一点）
// 相对角色自身位置 x 落在哪一侧，不管 fc 是 1 还是 -1，顶点都必须落在 fc 那一侧。
test('防御指示弧朝 facing 方向鼓起，不管站在哪一侧（Task 32）', () => {
  for (const fc of [1, -1] as const) {
    const { cx, r, a0, a1 } = blockArcGeom(100, 200, fc);
    const mid = (a0 + a1) / 2;
    const apexX = cx + Math.cos(mid) * r;
    expect(Math.sign(apexX - 100)).toBe(fc);
  }
});

test('腰部接缝：任意 motion 的任意帧、任意朝向下，前倾都不会让缺口比静止姿态更大（Task 31）', () => {
  const restCorners = torsoBottomCorners(REST.lean, REST.crouch, 1);
  const { hipX: restHipX, hipY: restHipY } = torsoAnchors(0, 0, REST.lean, REST.crouch, 1);
  const restPose = samplePose(MOTIONS.idle, 0);
  const restMargin = Math.min(
    Math.max(legCapsuleMargin(restCorners.botL, restHipX, restHipY, restPose.legF[0], 1), legCapsuleMargin(restCorners.botL, restHipX, restHipY, restPose.legB[0], 1)),
    Math.max(legCapsuleMargin(restCorners.botR, restHipX, restHipY, restPose.legF[0], 1), legCapsuleMargin(restCorners.botR, restHipX, restHipY, restPose.legB[0], 1)),
  );

  const failures: string[] = [];
  for (const [name, m] of Object.entries(MOTIONS)) {
    for (const fc of [1, -1] as const) {
      for (const frame of sampleFrames(m)) {
        const p = samplePose(m, frame);
        const { hipX, hipY } = torsoAnchors(0, 0, p.lean, p.crouch, fc);
        const corners = torsoBottomCorners(p.lean, p.crouch, fc);
        const margin = Math.min(
          Math.max(legCapsuleMargin(corners.botL, hipX, hipY, p.legF[0], fc), legCapsuleMargin(corners.botL, hipX, hipY, p.legB[0], fc)),
          Math.max(legCapsuleMargin(corners.botR, hipX, hipY, p.legF[0], fc), legCapsuleMargin(corners.botR, hipX, hipY, p.legB[0], fc)),
        );
        if (margin < restMargin - 1) {
          failures.push(`${name} fc=${fc} frame=${frame.toFixed(1)} lean=${p.lean.toFixed(2)} margin=${margin.toFixed(2)} (rest=${restMargin.toFixed(2)})`);
        }
      }
    }
  }
  expect(failures, `${failures.length} 个采样点缺口比静止姿态更大，前几个：\n${failures.slice(0, 8).join('\n')}`).toEqual([]);
});
