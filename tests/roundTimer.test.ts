import { expect, test } from 'vitest';
import { Battle, ROUND_TIME } from '../src/engine/battle';

/** 墙钟额度里留给大招暗転的部分。一次 100 档大招整段 600 帧，一个回合见到两次已经很多 */
const SUPER_ALLOWANCE = 1200;
import { createAi } from '../src/engine/ai';
import { CHARACTERS } from '../src/data/characters';
import { STAGES } from '../src/data/stages';
import { ARENA_MIN, NULL_INPUT } from '../src/engine/types';
import { roundOutcome } from './helpers';

// 读秒。它平时不会响（实测平均一局 27.8s），但做成了两件事：
// 封顶（只跑不打实测能拖到 89 秒，是正常回合的三倍），
// 以及让「领先时守住血量」变成一个真策略——没有读秒，跑开就没有代价。

test('时间到按血量比例判胜，不是按绝对值', () => {
  // 牛魔王 215 血、哪吒 200 血：绝对值相同的一刀，比例上不一样重
  const b = new Battle(structuredClone(CHARACTERS[0]), structuredClone(CHARACTERS[3]));
  b.p1.hp = 100;                 // 100/200 = 50%
  b.p2.hp = 100;                 // 100/215 = 47%
  b.timeLeft = 1;
  b.tick(NULL_INPUT, NULL_INPUT);
  expect(b.timeUp, '时间没有走完').toBe(true);
  expect(b.winner, '血量比例高的一方该赢——按绝对值的话这里会判平').toBe(0);
});

test('比例完全相等算平局：winner 留 null，双方各记一个回合', () => {
  const c = CHARACTERS[0];
  const b = new Battle(structuredClone(c), structuredClone(c));
  b.p1.hp = 137; b.p2.hp = 137;
  b.timeLeft = 1;
  b.tick(NULL_INPUT, NULL_INPUT);
  expect(b.timeUp).toBe(true);
  expect(b.winner, '完全相等时不该判给任何一方').toBeNull();
  // 平局双方各记一分——不记的话两个只会跑的人能把同一个回合无限重开
  expect(roundOutcome([0, 0], null, 2)).toEqual({ done: false, wins: [1, 1] });
  expect(roundOutcome([1, 1], null, 2)).toEqual({ done: true, playerWon: true });
});

test('读秒挂在逻辑帧上，且胜负已分就停', () => {
  const c = CHARACTERS[0];
  const b = new Battle(structuredClone(c), structuredClone(c));
  expect(b.timeLeft).toBe(ROUND_TIME);
  for (let i = 0; i < 60; i++) b.tick(NULL_INPUT, NULL_INPUT);
  expect(ROUND_TIME - b.timeLeft, '一秒该走掉 60 帧').toBe(60);
  b.winner = 0;
  const left = b.timeLeft;
  for (let i = 0; i < 60; i++) b.tick(NULL_INPUT, NULL_INPUT);
  expect(b.timeLeft, '胜负已分之后不该继续倒数').toBe(left);
});

// 断言挂在**读秒实际走过的帧数**上，不是墙钟帧数：大招暗転期间读秒是停的
// （见 battle.inSuperCinematic），一次 100 档大招就是 600 帧。第一版拿墙钟帧数
// 直接比 ROUND_TIME，只要那一趟恰好出了个大招就会误报——实测种子5 跑了 3956 帧，
// 而读秒只走了 3356，600 帧是暗転。暗転是这条测试写完之后才加的机制。
test('只跑不打的回合会被读秒收掉，而不是拖成三倍长', () => {
  let longest = 0, longestWall = 0;
  for (let seed = 0; seed < 6; seed++) {
    const b = new Battle(structuredClone(CHARACTERS[seed % 4]),
      structuredClone(CHARACTERS.find(c => c.id === STAGES[0].bossId)!));
    const ai = createAi(STAGES[0].ai, seed * 7 + 3);
    let f = 0, ticked = 0;
    for (; f < 60 * 600 && b.winner === null && !b.timeUp; f++) {
      const before = b.timeLeft;
      const away = b.p1.x <= ARENA_MIN + 4 ? 1 : -1;
      b.tick({ ...NULL_INPUT, move: away as 1 | -1, block: true }, ai(b, 1));
      if (b.timeLeft !== before) ticked++;
    }
    longest = Math.max(longest, ticked);
    longestWall = Math.max(longestWall, f);
  }
  expect(longest, `读秒走了 ${longest} 帧，超过一回合的额度，说明读秒没有封住`)
    .toBeLessThanOrEqual(ROUND_TIME);
  // 墙钟另给一档：允许暗転占掉的时间，但仍要挡住"拖成三倍长"（原始故障是 89 秒）
  expect(longestWall, `只跑不打拖到了 ${(longestWall / 60).toFixed(0)} 秒`)
    .toBeLessThanOrEqual(ROUND_TIME + SUPER_ALLOWANCE);
});
