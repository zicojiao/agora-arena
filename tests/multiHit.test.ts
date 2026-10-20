import { expect, test } from 'vitest';
import { Battle } from '../src/engine/battle';
import { mv, press, run, testChar } from './helpers';

// 4 段、每段间隔 3 帧，active 放宽到 20 帧装得下 4*3=12；damage=41 故意不能被 4 整除，
// 用来验证"最后一段吃余数"确实生效（如果实现漏掉余数处理，总伤害会少算成 40 而不是 41）
function multiHitChar() {
  return testChar({
    moves: {
      ...testChar().moves,
      sp100: mv('sp100', {
        damage: 41, startup: 3, active: 20, recovery: 5, hitstun: 30,
        knockback: { x: 10, y: 6 },
        multiHit: { hits: 4, interval: 3 },
      }),
    },
  });
}

// 距离 100（400/500）：跟 combat.test.ts 的 n1 命中测试同一个已验证过的站位，
// 这里复用的默认 mv() hitbox（x:20,y:50,w:60,h:40）跟 n1 完全相同
function setup() {
  return new Battle(multiHitChar(), testChar(), 400, 500);
}

function fireSuper(b: Battle) {
  b.p1.meter = 100;
  b.tick(press({ super: true }), press());
}

/** 跑到 hitCount 到达 4 段或超时；超时返回 false 方便测试自己判断 */
function runUntilAllHits(b: Battle, maxTicks = 300): boolean {
  for (let i = 0; i < maxTicks && b.p1.hitCount < 4; i++) run(b, 1);
  return b.p1.hitCount >= 4;
}

test('多段招式一次发动内命中 hits 次，总伤害与单发时相同', () => {
  const b = setup();
  fireSuper(b);
  expect(runUntilAllHits(b)).toBe(true);
  expect(b.p1.hitCount).toBe(4);
  expect(b.p2.hp).toBe(100 - 41); // 10+10+10+11，四舍五入的余数全部吃在最后一段
});

test('相邻两段的间隔不小于 interval', () => {
  const b = setup();
  fireSuper(b);
  const hitFrames: number[] = [];
  let lastCount = 0;
  for (let i = 0; i < 300 && b.p1.hitCount < 4; i++) {
    run(b, 1);
    if (b.p1.hitCount > lastCount) { hitFrames.push(b.frame); lastCount = b.p1.hitCount; }
  }
  expect(hitFrames.length).toBe(4);
  for (let i = 1; i < hitFrames.length; i++) {
    expect(hitFrames[i] - hitFrames[i - 1]).toBeGreaterThanOrEqual(3);
  }
});

test('中间段不击退，只有最后一段真正击退/击飞', () => {
  const b = setup();
  fireSuper(b);
  let sawIntermediateKnockback = false;
  let lastCount = 0;
  for (let i = 0; i < 300 && b.p1.hitCount < 4; i++) {
    run(b, 1);
    if (b.p1.hitCount > lastCount) {
      lastCount = b.p1.hitCount;
      if (lastCount < 4 && Math.abs(b.p2.vx) > 1) sawIntermediateKnockback = true;
    }
  }
  expect(b.p1.hitCount).toBe(4);
  expect(sawIntermediateKnockback).toBe(false);
  // 最后一段（knockback.y=6>0）应该把受害者送上天
  expect(b.p2.vy).toBeGreaterThan(0);
  expect(b.p2.y).toBeGreaterThan(0);
});

test('对手在整段多段判定过程中保持 hitstun，不会中途脱离', () => {
  const b = setup();
  fireSuper(b);
  let sawNonHitstunAfterFirstHit = false;
  for (let i = 0; i < 300 && b.p1.hitCount < 4; i++) {
    run(b, 1);
    if (b.p1.hitCount > 0 && b.p1.hitCount < 4 && b.p2.state !== 'hitstun') sawNonHitstunAfterFirstHit = true;
  }
  expect(b.p1.hitCount).toBe(4);
  expect(sawNonHitstunAfterFirstHit).toBe(false);
});
