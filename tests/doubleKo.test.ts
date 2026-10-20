import { expect, test } from 'vitest';
import { Battle } from '../src/engine/battle';
import { CHARACTERS } from '../src/data/characters';
import { NULL_INPUT } from '../src/engine/types';
import { roundOutcome } from './helpers';

// 双 KO：同一帧两边都被打空血（相打ち致死）。同帧结算落地之后这条路才走得通，
// 而它一直是错的——两次结算里后跑的那次会覆盖前一次，winner 恒为 1，
// 也就是**玩家必输**，纯粹取决于 p2 的判定排在后面。拳皇里这是平局。

/** 双方同血、同帧互相出拳，跑到分出结果为止 */
function trade(hp: number) {
  const c = CHARACTERS[0];
  const b = new Battle(structuredClone(c), structuredClone(c));
  b.p2.x = b.p1.x + 60;
  b.p1.hp = hp; b.p2.hp = hp;
  let kos = 0;
  for (let f = 0; f < 30 && !b.doubleKo && b.winner === null; f++) {
    const atk = { ...NULL_INPUT, attack: f === 0 };
    b.tick(atk, atk);
    kos += b.events.filter(e => e.type === 'ko').length;
  }
  return { b, kos };
}

test('同帧互相打死 = 平局，不是判给判定排在后面的那一方', () => {
  for (const hp of [3, 5, 8]) {
    const { b } = trade(hp);
    expect(b.p1.hp, `${hp} 血：用例前提不成立，p1 没死`).toBe(0);
    expect(b.p2.hp, `${hp} 血：用例前提不成立，p2 没死`).toBe(0);
    expect(b.doubleKo, `${hp} 血：双 KO 没被识别出来`).toBe(true);
    expect(b.winner, `${hp} 血：双 KO 判给了 p${(b.winner ?? 0) + 1}`).toBeNull();
  }
});

test('一次 KO 只发一次事件——两边都死就正好两条，不多不少', () => {
  const { b, kos } = trade(5);
  expect(b.doubleKo).toBe(true);
  // 曾经是三条：先跑的那次结算已经提交过一个胜负和一条事件，后跑的才发现是双杀
  expect(kos, `双 KO 发了 ${kos} 条 ko 事件`).toBe(2);
});

test('单边 KO 不受影响', () => {
  const c = CHARACTERS[0];
  const b = new Battle(structuredClone(c), structuredClone(c));
  b.p2.x = b.p1.x + 60; b.p2.hp = 5;
  let kos = 0;
  for (let f = 0; f < 30 && b.winner === null; f++) {
    b.tick({ ...NULL_INPUT, attack: f === 0 }, { ...NULL_INPUT });
    kos += b.events.filter(e => e.type === 'ko').length;
  }
  expect(b.winner, '单边 KO 没判给出手的一方').toBe(0);
  expect(b.doubleKo, '单边 KO 被误判成双 KO').toBe(false);
  expect(kos).toBe(1);
});

test('双 KO 交给回合制按平局处理——双方各记一个回合', () => {
  // winner 为 null 时 roundOutcome 走平局分支（与读秒平局同一条路）
  expect(roundOutcome([0, 0], null, 2)).toEqual({ done: false, wins: [1, 1] });
  expect(roundOutcome([1, 0], null, 2)).toEqual({ done: true, playerWon: true });
});
