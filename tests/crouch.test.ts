import { expect, test } from 'vitest';
import { Battle } from '../src/engine/battle';
import { mv, press, testChar } from './helpers';

function attackerWith(hitbox: { x: number; y: number; w: number; h: number }) {
  const c = testChar();
  c.moves.n1 = mv('n1', { hitbox });
  return c;
}

test('按住蹲进入 crouch 状态，原地不动（同时按方向也不动）', () => {
  const b = new Battle(testChar(), testChar());
  const x0 = b.p1.x;
  for (let i = 0; i < 5; i++) b.tick(press({ crouch: true, move: 1 }), press());
  expect(b.p1.state).toBe('crouch');
  expect(b.p1.x).toBe(x0);
});

test('下蹲能躲开高位判定框（站立命中/下蹲落空）', () => {
  const highBox = { x: 20, y: 70, w: 60, h: 40 }; // 离地 70-110，仿二郎神天眼光束

  const stand = new Battle(attackerWith(highBox), testChar(), 400, 500);
  stand.tick(press({ attack: true }), press());
  for (let i = 0; i < 3; i++) stand.tick(press(), press());
  expect(stand.p2.hp).toBe(90);

  const crouch = new Battle(attackerWith(highBox), testChar(), 400, 500);
  crouch.tick(press({ attack: true }), press({ crouch: true }));
  for (let i = 0; i < 3; i++) crouch.tick(press(), press({ crouch: true }));
  expect(crouch.p2.state).toBe('crouch');
  expect(crouch.p2.hp).toBe(100);
});

test('贴地判定框：下蹲照样命中', () => {
  const lowBox = { x: 20, y: 0, w: 60, h: 60 }; // 离地 0-60，仿牛魔王裂地重击
  const b = new Battle(attackerWith(lowBox), testChar(), 400, 500);
  b.tick(press({ attack: true }), press({ crouch: true }));
  for (let i = 0; i < 2; i++) b.tick(press(), press({ crouch: true }));
  expect(b.p2.state).toBe('crouch'); // 命中前一帧：仍蹲着（受击框已是 CROUCH_HEIGHT）
  b.tick(press(), press({ crouch: true }));
  expect(b.p2.hp).toBe(90); // 命中：贴地判定框依旧打中蹲下的受击框，命中后转 hitstun（蹲不是无敌）
});

test('松开蹲键回到 idle', () => {
  const b = new Battle(testChar(), testChar());
  b.tick(press({ crouch: true }), press());
  expect(b.p1.state).toBe('crouch');
  b.tick(press(), press());
  expect(b.p1.state).toBe('idle');
});

test('蹲姿下不能跳', () => {
  const b = new Battle(testChar(), testChar());
  b.tick(press({ crouch: true }), press());
  expect(b.p1.state).toBe('crouch');
  b.tick(press({ crouch: true, jump: true }), press());
  expect(b.p1.state).toBe('crouch');
  expect(b.p1.y).toBe(0);
});

test('蹲姿下按攻击能正常出招', () => {
  const b = new Battle(testChar(), testChar());
  b.tick(press({ crouch: true }), press());
  expect(b.p1.state).toBe('crouch');
  b.tick(press({ crouch: true, attack: true }), press());
  expect(b.p1.state).toBe('attack');
  expect(b.p1.move?.slot).toBe('n1');
});
