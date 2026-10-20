import { expect, test } from 'vitest';
import { Battle } from '../src/engine/battle';
import { CHARACTERS } from '../src/data/characters';
import { NULL_INPUT } from '../src/engine/types';

// 霸体（アーマー）：起手期间硬吃几下不进硬直。
//
// 加它是因为引擎里有一块空白：**所有招式的起手都能被一发普攻打断**，
// 于是起手 10 帧以上的必杀在贴身战里根本不存在——对手 3-6 帧的普攻永远抢得过。
// 刑天（断头仍战的那位）把这块填上：血照掉、气照给，只是动作不断——用血换一次出手。

const xt = () => CHARACTERS.find(c => c.id === 'xingtian')!;

/**
 * 让 p1 出某一招，然后在**起手期间**用 p2 的普攻打他 n 下，返回打完之后的战斗。
 *
 * 命中数按 hit 事件数（attacker===1）；按"血少了没有"数是不行的——
 * 血少一次之后这个条件恒真，循环会把没打中的帧也算进去（第一版就是这么写的，
 * 两条断言因此假红）。
 */
function hitDuringStartup(slot: 's1' | 's2' | 's3' | 'n1', want: number) {
  const b = new Battle(structuredClone(xt()), structuredClone(CHARACTERS[0]));
  b.p1.x = 400; b.p2.x = 470;
  const key = slot === 'n1' ? 'attack' : slot === 's1' ? 'skill1' : slot === 's2' ? 'skill2' : 'skill3';
  b.tick({ ...NULL_INPUT, [key]: true }, { ...NULL_INPUT });
  const startup = b.p1.move!.startup;
  let landed = 0;
  for (let f = 0; f < startup * 4 && landed < want; f++) {
    // p1 的 stateFrame 已经越过起手就停手——这个夹具只量"起手期间"
    if (b.p1.state !== 'attack' || b.p1.stateFrame >= startup) break;
    b.tick({ ...NULL_INPUT }, { ...NULL_INPUT, attack: true });
    for (const ev of b.events) if (ev.type === 'hit' && ev.attacker === 1 && !ev.blocked) landed++;
  }
  return { b, landed };
}

test('霸体招的起手挨打不断——血掉了，动作还在', () => {
  const { b, landed } = hitDuringStartup('s3', 1);
  expect(landed, '压根没挨到打，用例没成立').toBeGreaterThanOrEqual(1);
  expect(b.p1.hp, '挨了打血却没掉——霸体不该免伤').toBeLessThan(xt().hp);
  expect(b.p1.state, '带 3 层霸体的裂地斧被一下打断了').toBe('attack');
  expect(b.p1.move?.id, '招式被换掉了').toBe('xingtian_s3');
});

test('没有霸体的招照样被打断——霸体不是全局规则', () => {
  const { b, landed } = hitDuringStartup('n1', 1);
  expect(landed, '用例没成立：一下都没打中').toBeGreaterThanOrEqual(1);
  expect(b.p1.state, '普攻起手挨打却没进硬直——霸体漏给了所有招').toBe('hitstun');
});

test('一层用完就照常被打断——霸体是有限的', () => {
  const one = hitDuringStartup('s3', 1);
  expect(one.landed, '用例没成立：没打中').toBe(1);
  expect(one.b.p1.state, '一层霸体没扛住第一下').toBe('attack');
  expect(one.b.p1.armorLeft, '扛了一下，层数没扣').toBe(0);
  const two = hitDuringStartup('s3', 2);
  expect(two.landed, '用例没成立：没打满两下（对手要靠连段取消才塞得进两下）').toBe(2);
  expect(two.b.p1.state, '一层霸体扛住了第二下').toBe('hitstun');
});

// 起手之后不该再受保护。这里打的是**收招**那一段：判定期同样不受保护，但那一段测不了——
// 刑天的判定框比对手的普攻远得多，判定一生效对手先进硬直，根本打不出来（试过，一下都打不中）。
// 收招期他的判定框已经收了，对手打得到，而规则是同一条：stateFrame >= startup 就没有霸体。
test('只有起手受保护——起手过后照常挨打', () => {
  const b = new Battle(structuredClone(xt()), structuredClone(CHARACTERS[0]));
  b.p1.x = 400; b.p2.x = 470;
  b.tick({ ...NULL_INPUT, skill3: true }, { ...NULL_INPUT });
  const m = b.p1.move!;
  expect(m.armor, '用例没成立：这一招没有霸体').toBe(1);
  // 摆到收招第一帧，霸体层数仍然满着
  b.p1.stateFrame = m.startup + m.active;
  b.p1.armorLeft = 1;
  let landed = 0;
  for (let i = 0; i < 30 && landed === 0; i++) {
    b.tick({ ...NULL_INPUT }, { ...NULL_INPUT, attack: true });
    for (const ev of b.events) if (ev.type === 'hit' && ev.attacker === 1 && !ev.blocked) landed++;
  }
  expect(landed, '用例没成立：一下都没打中').toBeGreaterThanOrEqual(1);
  expect(b.p1.armorLeft, '起手之后还在扣霸体层数——那说明那一段也被保护了').toBe(1);
  expect(b.p1.state, '起手之后挨打却没进硬直').toBe('hitstun');
});

test('霸体是刑天一个人的东西', () => {
  for (const c of CHARACTERS) {
    const armored = Object.values(c.moves).filter(m => (m.armor ?? 0) > 0).length;
    if (c.id === 'xingtian') expect(armored, '刑天没有任何一招带霸体').toBe(3);   // 三记必杀各一层
    else expect(armored, `${c.name} 也带了霸体——这是刑天的定位`).toBe(0);
  }
});
