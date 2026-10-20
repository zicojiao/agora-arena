import { expect, test } from 'vitest';
import { Battle, THROW_RANGE } from '../src/engine/battle';
import { press, run, testChar } from './helpers';

test('防御减伤 80% 并有 blockstun', () => {
  const b = new Battle(testChar(), testChar(), 400, 500);
  b.tick(press(), press({ block: true }));
  expect(b.p2.state).toBe('block');
  b.tick(press({ attack: true }), press({ block: true }));
  // block 是持续按住的输入（非 run() 的空输入）——需要一直按住才能挡到 n1 的命中帧
  b.tick(press(), press({ block: true }));
  b.tick(press(), press({ block: true }));
  b.tick(press(), press({ block: true }));
  expect(b.p2.hp).toBe(98); // 10 * 0.2 = 2
  expect(b.p2.state).toBe('block');
  expect(b.p2.stun).toBeGreaterThan(0);
});

test('近身普攻变投技，无视防御', () => {
  // 距离从 THROW_RANGE 推导，不写字面量——这条测试原本写死「距离 60 < 70」，
  // 投技射程收紧到 52 之后就静默失效了。正是 docs/engine-notes.zh-CN.md「别把帧数写进常数里」那一类
  const b = new Battle(testChar(), testChar(), 400, 400 + THROW_RANGE - 10);
  b.tick(press(), press({ block: true }));
  b.tick(press({ attack: true }), press({ block: true }));
  expect(b.events.some(e => e.type === 'throw')).toBe(true);
  // 伤害从角色自己的 n3 推导（THROW_VS_N3 倍），不再是写死的 12——同一类问题：
  // 这里原本断言 hp 恰好是 88，投技伤害一改就红，而红的是测试不是实现
  const c = testChar();
  expect(b.p2.hp).toBe(c.hp - Math.round(c.moves.n3.damage * 0.9));
  expect(b.p2.state).toBe('down');
});

test('普攻三连段：命中后按键续段', () => {
  const b = new Battle(testChar(), testChar(), 400, 500);
  b.tick(press({ attack: true }), press());
  run(b, 3); // n1 命中
  while (b.hitstop > 0) run(b, 1);
  b.tick(press({ attack: true }), press()); // 后摇里预约 n2
  run(b, 10); // n1 结束 → n2 起手
  expect(b.p1.move?.slot).toBe('n2');
});

test('未命中不可续段', () => {
  const b = new Battle(testChar(), testChar(), 400, 900); // 打不到
  b.tick(press({ attack: true }), press());
  run(b, 4);
  b.tick(press({ attack: true }), press());
  run(b, 10);
  expect(b.p1.state).toBe('idle'); // n1 空挥后回到 idle，无 n2
});

test('技能进入 CD，CD 中不可再放', () => {
  const b = new Battle(testChar(), testChar(), 400, 900);
  b.tick(press({ skill1: true }), press());
  expect(b.p1.move?.slot).toBe('s1');
  run(b, 15); // s1 打完（3+3+5=11 帧）
  expect(b.p1.state).toBe('idle');
  b.tick(press({ skill1: true }), press());
  expect(b.p1.state).toBe('idle'); // CD 120 帧未转好
});

test('大招一键分档：气 100 放 sp100 并扣气带无敌', () => {
  const b = new Battle(testChar(), testChar(), 400, 900);
  b.p1.meter = 100;
  b.tick(press({ super: true }), press());
  expect(b.p1.move?.slot).toBe('sp100');
  expect(b.p1.meter).toBe(0);
  expect(b.p1.invuln).toBeGreaterThan(0);
  expect(b.events.some(e => e.type === 'super' && e.tier === 100)).toBe(true);
});

test('气 50-99 放 sp50；气不足 50 大招键退化为普攻', () => {
  const b = new Battle(testChar(), testChar(), 400, 900);
  b.p1.meter = 60;
  b.tick(press({ super: true }), press());
  expect(b.p1.move?.slot).toBe('sp50');
  expect(b.p1.meter).toBe(10);

  const b2 = new Battle(testChar(), testChar(), 400, 900);
  b2.p1.meter = 20;
  b2.tick(press({ super: true }), press());
  expect(b2.p1.state).toBe('idle'); // 无档可放，不出招
});

test('sp100 无敌帧内不吃伤害', () => {
  const b = new Battle(testChar(), testChar(), 400, 500);
  b.p1.meter = 100;
  b.tick(press({ super: true }), press({ attack: true }));
  run(b, 5);
  expect(b.p1.hp).toBe(100);
});
