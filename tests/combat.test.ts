import { expect, test } from 'vitest';
import { Battle, METER_ATK, METER_VIC } from '../src/engine/battle';
import { press, run, testChar } from './helpers';

// 站位 400/500：在 n1 攻击范围内（hitbox 达 480，hurtbox 起于 470），但超出投技距离 70
function setup() {
  return new Battle(testChar(), testChar(), 400, 500);
}

test('前摇帧不命中', () => {
  const b = setup();
  b.tick(press({ attack: true }), press());
  run(b, 2); // stateFrame=2 < startup=3
  expect(b.p2.hp).toBe(100);
});

test('判定帧命中：扣血/硬直/积气/hitstop', () => {
  const b = setup();
  b.tick(press({ attack: true }), press());
  run(b, 3); // stateFrame 到达 startup
  expect(b.p2.hp).toBe(90);
  expect(b.p2.state).toBe('hitstun');
  // 从倍率常数推导，不写字面量——原本写死「10*0.8」，气槽经济学一调整这条就失效了
  expect(b.p1.meter).toBe(Math.round(10 * METER_ATK));
  expect(b.p2.meter).toBe(Math.round(10 * METER_VIC));
  expect(b.hitstop).toBeGreaterThan(0);
});

test('一招只判一次', () => {
  const b = setup();
  b.tick(press({ attack: true }), press());
  run(b, 20); // 跑完整招 + hitstop
  expect(b.p2.hp).toBe(90);
});

test('硬直期间输入无效', () => {
  const b = setup();
  b.tick(press({ attack: true }), press());
  run(b, 3);
  // 清掉 hitstop 后，硬直中的 p2 尝试走路
  while (b.hitstop > 0) run(b, 1);
  const x = b.p2.x;
  b.tick(press(), press({ move: -1 }));
  expect(b.p2.state).toBe('hitstun');
  // 位移只来自击退惯性（vx>0 向右），不来自输入的向左
  expect(b.p2.x).toBeGreaterThanOrEqual(x);
});

test('击飞落地进入倒地', () => {
  const launcher = testChar();
  launcher.moves.n1.knockback = { x: 4, y: 10 };
  const b = new Battle(launcher, testChar(), 400, 500);
  b.tick(press({ attack: true }), press());
  let sawDown = false;
  for (let i = 0; i < 120; i++) {
    b.tick(press(), press());
    // 绝不允许「悬空却处于 idle」——hitstun 到期前必须先落地
    expect(b.p2.state === 'idle' && b.p2.y > 0).toBe(false);
    if (b.p2.state === 'down') sawDown = true;
  }
  // 已经历 down（落地转倒地，40 帧后起身带无敌）
  expect(sawDown).toBe(true);
  expect(['down', 'idle']).toContain(b.p2.state);
});

test('KO 事件与 winner', () => {
  const weak = testChar({ hp: 10 });
  const b = new Battle(testChar(), weak, 400, 500);
  b.tick(press({ attack: true }), press());
  run(b, 3);
  expect(b.winner).toBe(0);
  // KO 后 tick 冻结
  const hp = b.p2.hp;
  run(b, 10);
  expect(b.p2.hp).toBe(hp);
});
