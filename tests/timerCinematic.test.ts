import { expect, test } from 'vitest';
import { Battle } from '../src/engine/battle';
import { CHARACTERS } from '../src/data/characters';
import { NULL_INPUT } from '../src/engine/types';

// 读秒与十秒终结演出的交叉：完整版大招的 KO 是延迟宣布的（pendingKo），
// 演出期间 winner 一直是 null，而读秒只在 winner === null 时才走——
// 于是读秒会在演出途中走完并把它掐断。实测剩 60 帧时放大招，演出走到第 19 帧、
// 一下都还没打出去，回合就被判掉了，花 100 气买的终结演出直接作废。

/** 放一记能致命的完整版大招，返回回合是怎么结束的 */
function superWithClock(timeLeft: number) {
  const c = CHARACTERS[0];
  const b = new Battle(structuredClone(c), structuredClone(c));
  b.p2.x = b.p1.x + 60;
  b.p1.meter = 100;
  b.p2.hp = 20;               // 低于 sp100 的伤害 → 走完整版（十秒演出）
  b.timeLeft = timeLeft;
  let ended = -1;
  for (let f = 0; f < 1200 && ended < 0; f++) {
    b.tick({ ...NULL_INPUT, super: f === 0 }, { ...NULL_INPUT });
    if (b.winner !== null || b.timeUp || b.doubleKo) ended = f;
  }
  return { b, ended };
}

test('大招演出期间不读秒——十秒的终结演出不该被时间掐断', () => {
  const full = CHARACTERS[0].moves.sp100;
  const len = full.startup + full.active + full.recovery;
  for (const left of [200, 60, 20]) {
    const { b, ended } = superWithClock(left);
    expect(b.timeUp, `剩 ${left} 帧：演出被读秒判掉了`).toBe(false);
    expect(b.winner, `剩 ${left} 帧：大招打完却没判给出招者`).toBe(0);
    expect(b.p2.hp, `剩 ${left} 帧：大招没打完`).toBe(0);
    // 演出跑满了才结束——不是提前收场
    expect(ended, `剩 ${left} 帧：第 ${ended} 帧就结束了，演出全长 ${len}`).toBeGreaterThanOrEqual(len - 60);
  }
});

test('没有大招时读秒照常走——不能把时限整个停掉', () => {
  const c = CHARACTERS[0];
  const b = new Battle(structuredClone(c), structuredClone(c));
  b.timeLeft = 30;
  let ended = -1;
  for (let f = 0; f < 200 && ended < 0; f++) {
    b.tick(NULL_INPUT, NULL_INPUT);
    if (b.timeUp || b.winner !== null) ended = f;
  }
  expect(b.timeUp, '读秒没有走完').toBe(true);
  expect(ended, `本该在第 29 帧判掉，实际第 ${ended} 帧`).toBe(29);
});

test('顿帧仍然照走——那是量级完全不同的东西', () => {
  // 一次命中的顿帧只有 4-12 帧，停了反而要在每次命中上做手脚。
  // 这里验的是：普通对拼期间读秒仍在推进。
  const c = CHARACTERS[0];
  const b = new Battle(structuredClone(c), structuredClone(c));
  b.p2.x = b.p1.x + 60;
  const t0 = b.timeLeft;
  for (let f = 0; f < 60; f++) b.tick({ ...NULL_INPUT, attack: f % 6 === 0 }, { ...NULL_INPUT });
  expect(t0 - b.timeLeft, '普通对拼期间读秒停住了').toBeGreaterThan(40);
});
