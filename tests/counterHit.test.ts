import { expect, test } from 'vitest';
import { Battle } from '../src/engine/battle';
import { CHARACTERS } from '../src/data/characters';
import { NULL_INPUT } from '../src/engine/types';

// 反击命中（カウンターヒット）：打在对手出招的起手/判定帧里，伤害与硬直都加成。
// 加它是因为实测空挥率 46%，而抓空挥此前一分钱回报都没有——读招等于白读。

/** 让 p1 在 p2 出招途中打中他，返回那一发 hit 事件 */
function poke(delayP1: number) {
  const c = CHARACTERS[0];
  const b = new Battle(structuredClone(c), structuredClone(c));
  b.p2.x = b.p1.x + 60;
  for (let f = 0; f < 40; f++) {
    // p2 先出一记起手最长的技能，p1 隔 delayP1 帧再出拳打进去
    b.tick({ ...NULL_INPUT, attack: f === delayP1 }, { ...NULL_INPUT, skill2: f === 0 });
    const hit = b.events.find(e => e.type === 'hit' && e.attacker === 0);
    if (hit && hit.type === 'hit') return hit;
  }
  return null;
}

test('打在对手起手帧里 = 反击命中，伤害更高', () => {
  // p2 的 s2 起手 10 帧；p1 第 1 帧出拳（起手 4）在第 5 帧命中，正落在 p2 的起手里
  const ct = poke(1);
  expect(ct, '没打中，用例本身没成立').not.toBeNull();
  expect(ct!.counter, '打在起手帧里却没算反击').toBe(true);

  // 对照：对手站着不动时打中，同一招同一段，不该有加成
  const c = CHARACTERS[0];
  const b = new Battle(structuredClone(c), structuredClone(c));
  b.p2.x = b.p1.x + 60;
  let plain: number | null = null;
  for (let f = 0; f < 20 && plain === null; f++) {
    b.tick({ ...NULL_INPUT, attack: f === 0 }, { ...NULL_INPUT });
    const h = b.events.find(e => e.type === 'hit');
    if (h && h.type === 'hit') plain = h.damage;
  }
  expect(plain).not.toBeNull();
  expect(ct!.counter).toBe(true);
  expect(ct!.damage, `反击 ${ct!.damage} 应当高于普通命中 ${plain}`).toBeGreaterThan(plain!);
});

test('对手站着不动时不算反击——加成不能白送', () => {
  const c = CHARACTERS[0];
  const b = new Battle(structuredClone(c), structuredClone(c));
  b.p2.x = b.p1.x + 60;
  for (let f = 0; f < 20; f++) {
    b.tick({ ...NULL_INPUT, attack: f === 0 }, { ...NULL_INPUT });
    const h = b.events.find(e => e.type === 'hit');
    if (h && h.type === 'hit') { expect(h.counter, '打中立中的对手不该算反击').toBeFalsy(); return; }
  }
  throw new Error('一次都没打中，用例没成立');
});

test('打在收招帧里不算反击——那是普通抓招，不该再叠一层', () => {
  const c = CHARACTERS[0];
  const b = new Battle(structuredClone(c), structuredClone(c));
  b.p2.x = b.p1.x + 60;
  // 给 p1 上无敌，让 p2 那一拳落空——否则 p2 的 n1 先打中 p1，p1 被打进硬直，
  // 后面那一拳根本出不来，用例测的就不是"抓收招"了
  b.p1.invuln = 200;
  // p2 出 n1（4/3/8）：第 8 帧起进收招。p1 第 6 帧出拳，命中时落在 p2 的收招里
  for (let f = 0; f < 40; f++) {
    // 结算之后 p2 已经被改成 hitstun，事后再看永远看不到他挨打时在哪一帧——必须先记
    const pre = { st: b.p2.state, sf: b.p2.stateFrame, m: b.p2.move };
    b.tick({ ...NULL_INPUT, attack: f === 6 }, { ...NULL_INPUT, attack: f === 0 });
    const h = b.events.find(e => e.type === 'hit' && e.attacker === 0);
    if (h && h.type === 'hit') {
      expect(pre.st, '用例没成立：挨打时 p2 不在出招状态').toBe('attack');
      expect(pre.sf, '用例没成立：挨打时 p2 还没进收招帧')
        .toBeGreaterThanOrEqual(pre.m!.startup + pre.m!.active);
      expect(h.counter, '打在收招帧里被误判成反击').toBeFalsy();
      return;
    }
  }
  throw new Error('一次都没打中，用例没成立');
});
