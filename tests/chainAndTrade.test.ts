import { expect, test } from 'vitest';
import { Battle, THROW_RANGE } from '../src/engine/battle';
import { CHARACTERS } from '../src/data/characters';
import { NULL_INPUT } from '../src/engine/types';

// 这两条守的是"招式表看着没问题、打起来完全不是那回事"的一类故障。
// 都是实测挖出来的，改之前四个角色全部命中。

test('三段连击是真连段——对手在整个连段期间不会脱离硬直', () => {
  for (const c of CHARACTERS) {
    const b = new Battle(structuredClone(c), structuredClone(c));
    // 贴到普攻打得到、但**够不着投技**的距离。60px 对所有人都成立——
    // 直到猪八戒把抓取距离改写到 78px：那时第一下按出来的是投技（投技不接连段），
    // 这条断言当场报「连打打不出三段」，而实际是它根本没在量连打。
    const grab = c.grapple?.range ?? THROW_RANGE;
    b.p2.x = b.p1.x + Math.max(60, grab + 10);
    const hitAt: number[] = [];
    let escaped = 0;
    for (let f = 0; f < 90 && hitAt.length < 3; f++) {
      b.tick({ ...NULL_INPUT, attack: f % 6 === 0 }, { ...NULL_INPUT });
      for (const e of b.events) if (e.type === 'hit' && e.attacker === 0) hitAt.push(f);
      // 三段没打完就脱离硬直 = 中间有缝，对手能挡能反击，那就不叫连段
      if (hitAt.length > 0 && hitAt.length < 3 && f > hitAt[0] && b.p2.state !== 'hitstun') escaped++;
    }
    const gaps = hitAt.slice(1).map((v, i) => v - hitAt[i]);
    expect(hitAt.length, `${c.name} 连打打不出三段（只有 ${hitAt.length} 段）`).toBe(3);
    expect(escaped, `${c.name} 三段之间有 ${escaped} 帧脱离硬直，段间隔 ${gaps}，硬直 ${c.moves.n1.hitstun}/${c.moves.n2.hitstun}`).toBe(0);
  }
});

test('同帧对拼是相打ち——两招同时命中，双方都要挨', () => {
  const c = CHARACTERS[0];
  const b = new Battle(structuredClone(c), structuredClone(c));
  // 摆成完全对称：同样距离、同一帧出招
  b.p2.x = b.p1.x + 60;
  const hp0 = [b.p1.hp, b.p2.hp];
  let traded = false;
  for (let f = 0; f < 30; f++) {
    const atk = { ...NULL_INPUT, attack: f === 0 };
    b.tick(atk, atk);
    if (b.events.filter(e => e.type === 'hit').length >= 2) traded = true;
  }
  expect(traded, '同帧双方各命中一次没有发生').toBe(true);
  // 曾经是先结算的一方把对手打进 hitstun，对手的招在 `atk.state !== "attack"` 上被毙掉，
  // 于是后手一滴血都掉不了对方——完全对称的输入下先手胜率 75%
  expect(b.p1.hp, '先手没有挨打，说明后手的招被吃掉了').toBeLessThan(hp0[0]);
  expect(b.p2.hp, '后手没有挨打').toBeLessThan(hp0[1]);
});
