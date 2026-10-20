import { expect, test } from 'vitest';
import { roundOutcome } from './helpers';

// 三局两胜。一关一个回合时，一次失误就直接断关；街机格斗都是两胜制，
// 输了第一回合还有调整的机会，第三回合的残血翻盘也是这类游戏最好看的部分。

test('先拿满两胜的一方结束这一关，没拿满就继续下一回合', () => {
  // 2-0：玩家直落两回合
  expect(roundOutcome([1, 0], 0, 2)).toEqual({ done: true, playerWon: true });
  // 0-2：对手直落
  expect(roundOutcome([0, 1], 1, 2)).toEqual({ done: true, playerWon: false });
  // 2-1：玩家先丢一回合再连下两城
  expect(roundOutcome([1, 1], 0, 2)).toEqual({ done: true, playerWon: true });
  expect(roundOutcome([1, 1], 1, 2)).toEqual({ done: true, playerWon: false });
  // 1-0 / 1-1：还没打完
  expect(roundOutcome([0, 0], 0, 2)).toEqual({ done: false, wins: [1, 0] });
  expect(roundOutcome([1, 0], 1, 2)).toEqual({ done: false, wins: [1, 1] });
});

test('输掉第一回合不等于输掉这一关——这正是两胜制的意义', () => {
  let wins: [number, number] = [0, 0];
  const r1 = roundOutcome(wins, 1, 2);            // 第一回合输了
  expect(r1.done, '输一个回合就结束了，等于没有两胜制').toBe(false);
  wins = (r1 as { wins: [number, number] }).wins;
  const r2 = roundOutcome(wins, 0, 2);            // 扳回一城
  expect(r2.done).toBe(false);
  const r3 = roundOutcome((r2 as { wins: [number, number] }).wins, 0, 2);
  expect(r3).toEqual({ done: true, playerWon: true });
});

test('回合数是参数，不是写死的 2', () => {
  // 一局定胜负（need=1）时第一个回合就该结束——这条守的是"别把 2 散落在各处"
  expect(roundOutcome([0, 0], 0, 1)).toEqual({ done: true, playerWon: true });
  // 五局三胜（need=3）时 2-2 还得再打
  expect(roundOutcome([1, 2], 0, 3)).toEqual({ done: false, wins: [2, 2] });
});
