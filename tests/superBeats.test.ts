import { expect, test } from 'vitest';
import {
  ASSAULT_ACTIVE, ASSAULT_BEATS, ASSAULT_RECOVERY, ASSAULT_STARTUP,
  SUPER_ACTIVE, SUPER_BEATS, SUPER_FRAMES, SUPER_RECOVERY, SUPER_STARTUP,
} from '../src/data/superPhases';

/** 两档大招各有自己的骨架与总谱，下面的结构性断言对两者都要成立 */
import { CHARACTERS } from '../src/data/characters';
import { MOTIONS } from '../src/data/motions';

const TIERS = [
  { slot: 'sp100' as const, label: '超必杀', beats: SUPER_BEATS, segs: 15,
    startup: SUPER_STARTUP, active: SUPER_ACTIVE, recovery: SUPER_RECOVERY },
  { slot: 'sp50' as const, label: '奥义', beats: ASSAULT_BEATS, segs: 9,
    startup: ASSAULT_STARTUP, active: ASSAULT_ACTIVE, recovery: ASSAULT_RECOVERY },
];

// 十秒超必杀的演出节拍表。GameCanvas 按出招者的 stateFrame 跨拍触发，逻辑本身只有几行；
// 真正容易出错的是"表和招式对不上"——帧号越界、某一拍永远触发不到、段界和拍子错位。
// 这些都不会抛错，只会让演出少一拍，肉眼还未必看得出来。

test.each(TIERS)('$label：每一拍都落在招式窗口内，且按帧号严格递增', (t) => {
  expect(t.startup + t.active + t.recovery).toBe(SUPER_FRAMES);
  let prev = -1;
  for (const b of t.beats) {
    expect(b.frame, `拍 ${b.frame} 越出招式窗口 [0,${SUPER_FRAMES})`).toBeGreaterThanOrEqual(0);
    expect(b.frame).toBeLessThan(SUPER_FRAMES);
    expect(b.frame, '节拍表必须按帧号严格递增，否则跨拍判定会漏拍').toBeGreaterThan(prev);
    prev = b.frame;
  }
});

test.each(TIERS)('$label：每一拍都钉在某个段界上——镜头换语言的时机必须跟动作换形态的时机重合', (t) => {
  // 段界由骨架帧宽累加得到，取哪个角色都一样（四人共用同一套骨架）
  const seq = CHARACTERS[0].moves[t.slot].motionSeq!;
  const bounds = new Set<number>();
  let acc = 0;
  for (const s of seq) { bounds.add(acc); acc += s.weight; }
  // 允许一拍落在段界前若干帧（如突进那一拍要抢在动作之前起势）
  const LEAD = 2;
  for (const b of t.beats) {
    const onBoundary = [...bounds].some(x => Math.abs(x - b.frame) <= LEAD);
    expect(onBoundary, `拍 ${b.frame} 没有落在任何段界上（段界：${[...bounds].join(',')}）`).toBe(true);
  }
});

test.each(TIERS)('$label：跨拍触发一次且仅一次，走完 600 帧刚好用满整张表', (t) => {
  // 复刻 GameCanvas 的跨拍判定：beat.frame > 上一帧 && beat.frame <= 当前帧
  let beatFrame = -1;
  const fired: number[] = [];
  for (let f = 0; f < SUPER_FRAMES; f++) {
    for (const b of t.beats) if (b.frame > beatFrame && b.frame <= f) fired.push(b.frame);
    beatFrame = f;
  }
  expect(fired).toEqual(t.beats.map(b => b.frame));
});

test.each(TIERS)('$label：节拍表构成一段完整的镜头调度——黑边有起有收，暗场有压有放', (t) => {
  const bars = t.beats.filter(b => b.bars !== undefined);
  expect(bars[0].bars, '开场要把黑边压下来').toBeGreaterThan(0);
  expect(bars[bars.length - 1].bars, '收势要把黑边收回去').toBe(0);

  const dark = t.beats.filter(b => b.dark !== undefined);
  expect(dark[dark.length - 1].dark, '收势要把天光放回来').toBe(0);

  // 震屏与缩放的峰值必须落在同一拍——那一拍就是这套演出的高潮（超必杀的终结爆发 /
  // 奥义的终结）。两者分散在不同拍上，观感就没有明确的顶点
  const maxShake = Math.max(...t.beats.map(b => b.shake ?? 0));
  const maxZoom = Math.max(...t.beats.map(b => b.zoom ?? 0));
  const peak = t.beats.find(b => b.shake === maxShake)!.frame;
  expect(t.beats.find(b => b.zoom === maxZoom)!.frame, '震屏峰值与缩放峰值不在同一拍').toBe(peak);
  expect(peak, '高潮该落在后半段').toBeGreaterThan(SUPER_FRAMES * 0.6);
});

test('两档大招的演出形态必须分得开：拍数与幅度都不同', () => {
  expect(SUPER_BEATS.length, '超必杀的拍数应明显多于奥义').toBeGreaterThan(ASSAULT_BEATS.length);
  const peak = (bs: typeof SUPER_BEATS, k: 'zoom' | 'shake' | 'bars') =>
    Math.max(...bs.map(b => b[k] ?? 0));
  for (const k of ['zoom', 'shake', 'bars'] as const) {
    expect(peak(SUPER_BEATS, k), `超必杀的 ${k} 峰值应高于奥义`).toBeGreaterThan(peak(ASSAULT_BEATS, k));
  }
});

test.each(TIERS)('$label：四个角色都用这套骨架——600 帧、段数一致、每段动作都在 MOTIONS 里', (t) => {
  for (const c of CHARACTERS) {
    const m = c.moves[t.slot];
    expect(m.startup + m.active + m.recovery, `${c.id} 总帧数`).toBe(SUPER_FRAMES);
    const seq = m.motionSeq!;
    expect(seq.length, `${c.id} 段数`).toBe(t.segs);
    expect(seq.reduce((n, s) => n + s.weight, 0), `${c.id} 段宽之和必须等于总帧数`).toBe(SUPER_FRAMES);
    for (const s of seq) expect(MOTIONS[s.motionId], `${c.id} 缺动作 ${s.motionId}`).toBeDefined();
  }
});
