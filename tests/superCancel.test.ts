import { expect, test } from 'vitest';
import { Battle } from '../src/engine/battle';
import { CHARACTERS } from '../src/data/characters';
import { NULL_INPUT } from '../src/engine/types';

// 暗転（大招起手期间对手一并冻结）。没有它，连段取消进大招必定落空：
// 最短的短版起手 55 帧，而普攻硬直只有 14~16 帧，对手早脱离了。
// 实测「三段接奥义」打出的伤害曾与纯连打的前三段一模一样——花掉 50 气换一个空挥。

/** 连打三段后按大招（或不按），返回总段数与总伤害。
 * 对手**全程按着防御**——这一点是这个用例的全部意义所在：站着不动的木桩不管冻不冻结
 * 都会挨满，测不出任何东西（第一版就是这么写的，去掉暗転照样绿）。会防的对手才分得出
 * "连段锁住了他" 和 "他脱离硬直挡下了大招"。 */
function combo(c: typeof CHARACTERS[number], meter: number, ender: 'none' | 'super') {
  const b = new Battle(structuredClone(c), structuredClone(c));
  b.p2.x = b.p1.x + 60;
  b.p1.meter = meter;
  const hp0 = b.p2.hp;
  let hits = 0, blocked = 0;
  for (let f = 0; f < 700 && b.winner === null; f++) {
    // 在**第二段**取消，不是第三段：n3 是挑空技，把对手打飞之后大招多半落空
    // （实测 n3 后接大招 7 段 40 伤，n2 后接大招 16 段 61-71 伤）。这是路线选择，不是 bug。
    const done = hits >= 2 && ender === 'super';
    b.tick({ ...NULL_INPUT, ...(done ? { super: true } : { attack: f % 5 === 0 }) },
           { ...NULL_INPUT, block: true });
    for (const e of b.events) if (e.type === 'hit') { hits++; if (e.blocked) blocked++; }
  }
  return { hits, dmg: hp0 - b.p2.hp, blocked };
}

test('第二段取消进大招，对手挡不下来——连段一路把他锁到大招打完', () => {
  for (const c of CHARACTERS) {
    const plain = combo(c, 0, 'none');
    const sup = combo(c, 100, 'super');
    // 最直接的判据：大招的段基本不该被挡下。允许收尾漏 1 段——多段判定的后段若有一下
    // 落空（对手被打远了），他就能在那个缝里防住最后一击，这与暗転无关。
    // 去掉暗転时这个数是 10，所以 1 与 0 的区别不影响这条断言的灵敏度。
    expect(sup.blocked, `${c.name} 大招被挡了 ${sup.blocked} 段——暗転没锁住对手`).toBeLessThanOrEqual(1);
    expect(sup.dmg, `${c.name} 接大招 ${sup.dmg} 伤害，纯连打 ${plain.dmg}——花了 100 气没换来伤害`)
      .toBeGreaterThan(plain.dmg * 1.6);
  }
});

test('暗転冻的是计时，不是把对手变成靶子——起手结束时他仍在原来的状态里', () => {
  const c = CHARACTERS[0];
  const b = new Battle(structuredClone(c), structuredClone(c));
  b.p2.x = b.p1.x + 60;
  b.p1.meter = 100;
  // 让 p2 处在中立（不是硬直）时，p1 隔空放大招：冻结期间 p2 的 stateFrame 不该推进
  for (let f = 0; f < 6; f++) b.tick({ ...NULL_INPUT }, { ...NULL_INPUT });
  b.p1.x = 200; b.p2.x = 800;                 // 拉开到打不到的距离
  b.tick({ ...NULL_INPUT, super: true }, { ...NULL_INPUT });
  expect(b.p1.state, '大招没发动，用例没成立').toBe('attack');
  const before = b.p2.stateFrame;
  for (let f = 0; f < 20; f++) b.tick({ ...NULL_INPUT }, { ...NULL_INPUT });
  expect(b.p2.stateFrame, '暗転期间对手的计时仍在推进').toBe(before);
  // 起手结束后必须解冻，否则对手会永远定在那里
  const su = b.p1.move!.startup;
  for (let f = 0; f < su + 10; f++) b.tick({ ...NULL_INPUT }, { ...NULL_INPUT });
  expect(b.p2.stateFrame, '起手结束后对手没有解冻').toBeGreaterThan(before);
});
