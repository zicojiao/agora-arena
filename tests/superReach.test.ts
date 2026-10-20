import { expect, test } from 'vitest';
import { Battle } from '../src/engine/battle';
import { CHARACTERS } from '../src/data/characters';
import type { CharacterDef } from '../src/engine/types';
import { press } from './helpers';

// Task 36：拆开「连打阶段的拖动」和「终结一击的击飞」——它们是两件事。前者是原始投诉
// （对手被连打拖着走），必须是 0；后者是大招终结一击的收获，应该是一次读得出来的击飞
// 弧线，不该有位移上限。之前把两者收进同一个「总位移 ≤ 40px」指标，逼出了「终结一击也
// 削到 3-4」的过度修正。这里用引擎无头模拟量：连打阶段对手位移、终结一击后的滞空峰值、
// 是否落地转入 down——不摸像素，量引擎自己的坐标。
export function measureSuperReach(casterDef: CharacterDef, victimDef: CharacterDef, gap: number) {
  const casterX = 300, victimX = 300 + gap;
  const b = new Battle(casterDef, victimDef, casterX, victimX);
  b.p1.meter = 100;
  // 完整版十秒演出只在这一击能 KO 时播（Move.brief 的说明）。这几条测的正是那一版，
  // 所以把对手血量压到总伤害以下把它取出来；击杀会推迟到演出走完，连打因此照样跑满。
  b.p2.hp = casterDef.moves.sp100.damage;
  const casterStartX = b.p1.x, victimStartX = b.p2.x;
  const maxHits = casterDef.moves.sp100.multiHit!.hits;
  b.tick(press({ super: true }), press()); // 发动 sp100，victim 全程空输入——真实对局里被
  // 连打锁住的对手同样没法后退，这正是要模拟的「无法后退」场景
  let minGap = Math.abs(b.p2.x - b.p1.x);
  let flurryDrag = b.p2.x - victimStartX; // 一路刷新到终结一击命中那一刻为止
  let casterAdvance = b.p1.x - casterStartX;
  let peakY = b.p2.y;
  let sawDown = false;
  let finalHitLanded = false;
  let guard = 0;
  while (guard++ < 800) {
    b.tick(press(), press());
    if (!finalHitLanded) {
      minGap = Math.min(minGap, Math.abs(b.p2.x - b.p1.x));
      if (b.p1.hitCount < maxHits) flurryDrag = b.p2.x - victimStartX;
      else finalHitLanded = true; // 终结一击刚命中这一帧：knockback 已写入 vx/vy，还没挪动 x
    }
    if (b.p1.state === 'attack') casterAdvance = b.p1.x - casterStartX;
    if (b.p2.y > peakY) peakY = b.p2.y;
    if (b.p2.state === 'down') sawDown = true;
    if (finalHitLanded && b.p1.state !== 'attack' && (sawDown && b.p2.state === 'idle')) break;
  }
  return { casterAdvance, flurryDrag, peakY, sawDown, minGap, hitCount: b.p1.hitCount, maxHits };
}

const GAPS = [180, 280];
// 132.61px 是四人在回归前（旧 knockback.y 12-15）的滞空峰值上限——起跳即算数，仍是「贴地
// 拖行」；150px 是调完之后四人里最低的一档（二郎神）。140 卡在中间，两边都留有余量
const AIRBORNE_THRESHOLD = 140;

// Task 36 原本这里是两条：位移 ≥ 拖动的 3 倍、拖动 ≤ 5px。它们要挡的是当时的真实故障——
// 出招者冲进一个被锁在硬直里的对手，能量几乎全变成推人：位移 135px / 拖动 114px（比值
// 1.18）、净逼近只有 18-24px，读起来是"原地打然后两人一起滑走"。
//
// 现在 Move.carry 让连打中间段**故意**把对手朝版边推，出招者靠 dash 同步跟进（KOF 的
// "逼到版边再轰"）。"拖动 ≤ 5px"因此不再表达原来的意图——它把"故意的编排"和"失控的推挤"
// 当成同一件事。改成按本意断言：出招者必须比对手走得多、间距必须真的收窄、推的量必须有上限
// （是编排不是把人推过半个场地）。三条对 Task 36 的原始故障依然会红（比值 1.18 < 1.5、
// 净逼近 21px < 60px），不是把阈值放宽了事。
const MIN_ADVANCE_RATIO = 1.5;
const MIN_NET_CLOSE = 60;   // px：连打结束时出招者相对对手净逼近多少
// px：对手被推的上限。十秒大招的整段设计就是"把人一路逼到版边"（场地宽 880），
// 实测四人把对手从 560 推到 909-920 即版边，约 290-360px。上限取 400：既容得下这段编排，
// 又能挡住"推过整个场地"这种失控。真正判定"是编排还是失控"的是上面的比值与净逼近两条。
const MAX_CARRY = 400;

test('四个角色的 sp100：出招者走得比对手多，间距真的收窄，且连打全中', () => {
  for (const c of CHARACTERS) {
    for (const gap of GAPS) {
      const r = measureSuperReach(c, c, gap);
      expect(r.hitCount, `${c.id} gap=${gap} 连打没打全，样本作废`).toBe(r.maxHits);
      const ratio = r.casterAdvance / Math.max(r.flurryDrag, 0.01);
      expect(ratio, `${c.id} gap=${gap} 位移/拖动比值`).toBeGreaterThanOrEqual(MIN_ADVANCE_RATIO);
      expect(r.casterAdvance - r.flurryDrag, `${c.id} gap=${gap} 净逼近`).toBeGreaterThanOrEqual(MIN_NET_CLOSE);
    }
  }
});

test('四个角色的 sp100：不带 carry 的招连打阶段几乎不拖人；带 carry 的推量有上限', () => {
  for (const c of CHARACTERS) {
    for (const gap of GAPS) {
      const r = measureSuperReach(c, c, gap);
      const carry = c.moves.sp100.carry ?? 0;
      const cap = carry > 0 ? MAX_CARRY : 5;
      expect(r.flurryDrag, `${c.id} gap=${gap} 连打阶段拖动距离（carry=${carry}）`).toBeLessThanOrEqual(cap);
    }
  }
});

test('四个角色的 sp100：终结一击真的把对手打上天——滞空峰值超过阈值，且落地转入 down（起始间距 180/280px）', () => {
  for (const c of CHARACTERS) {
    for (const gap of GAPS) {
      const r = measureSuperReach(c, c, gap);
      expect(r.peakY, `${c.id} gap=${gap} 终结一击滞空峰值`).toBeGreaterThan(AIRBORNE_THRESHOLD);
      expect(r.sawDown, `${c.id} gap=${gap} 落地应转入 down`).toBe(true);
    }
  }
});

test('四个角色的 sp100：连打期间间距真的收窄，最小间距明显低于起始间距（起始间距 180/280px）', () => {
  for (const c of CHARACTERS) {
    for (const gap of GAPS) {
      const r = measureSuperReach(c, c, gap);
      // 80px 是「明显」的下限——四个角色调完之后实测压缩都在 100px 以上，留出充足余量
      expect(gap - r.minGap, `${c.id} gap=${gap} 间距压缩量`).toBeGreaterThanOrEqual(80);
    }
  }
});
