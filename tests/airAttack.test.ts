import { expect, test } from 'vitest';
import { Battle } from '../src/engine/battle';
import { CHARACTERS } from '../src/data/characters';
import { NULL_INPUT } from '../src/engine/types';
const press = (o: Partial<typeof NULL_INPUT> = {}) => ({ ...NULL_INPUT, ...o });

// 「怎么没跳起来打」——jump 状态压根没接输入，空中按攻击键什么都不会发生。
// 站立普攻/蹲姿普攻/跳跃普攻是格斗游戏里三件不同的东西，之前只有前两件。

test('四个角色都有跳跃普攻，且判定框压在身体下方（空中招的价值在于从上往下压）', () => {
  for (const c of CHARACTERS) {
    const m = c.moves.jA;
    expect(m, `${c.name} 缺跳跃普攻`).toBeDefined();
    expect(m.slot).toBe('jA');
    expect(m.hitbox.y, `${c.name} 的空中判定框该往下压，不是摆在正前方`).toBeLessThan(0);
    expect(m.meterCost).toBe(0);
  }
});

test('空中按攻击键真的出招——落地前能打到人', () => {
  for (const c of CHARACTERS) {
    const b = new Battle(structuredClone(c), structuredClone(c), 400, 470);
    b.tick(press({ jump: true }), press());
    let attacked = false, hp0 = b.p2.hp;
    for (let i = 0; i < 60; i++) {
      // 起跳后第 6 帧按攻击
      b.tick(press(i === 6 ? { attack: true } : {}), press());
      if (b.p1.state === 'attack' && b.p1.move?.slot === 'jA') attacked = true;
    }
    expect(attacked, `${c.name} 空中按攻击没出招`).toBe(true);
    expect(hp0 - b.p2.hp, `${c.name} 的空中攻击一下都没打中`).toBeGreaterThan(0);
  }
});

test('空中招落地即收，不会浮在空中把帧数走完', () => {
  const c = CHARACTERS[0];
  const b = new Battle(structuredClone(c), structuredClone(c), 400, 900);
  b.tick(press({ jump: true }), press());
  b.tick(press({ attack: true }), press());
  expect(b.p1.move?.slot).toBe('jA');
  let landedState = '';
  for (let i = 0; i < 90; i++) {
    b.tick(press(), press());
    if (b.p1.y <= 0 && !landedState) landedState = b.p1.state;
  }
  expect(landedState, '落地那一刻就该收招回到可控状态').toBe('idle');
  expect(b.p1.state).toBe('idle');
});

test('空中招期间重力照常作用——不是悬在半空挥一下', () => {
  const c = CHARACTERS[0];
  const b = new Battle(structuredClone(c), structuredClone(c), 400, 900);
  b.tick(press({ jump: true }), press());
  for (let i = 0; i < 4; i++) b.tick(press(), press());
  b.tick(press({ attack: true }), press());
  const yStart = b.p1.y;
  let peak = yStart;
  for (let i = 0; i < 30; i++) { b.tick(press(), press()); peak = Math.max(peak, b.p1.y); }
  expect(peak, '出招后应继续沿抛物线上升到顶点').toBeGreaterThan(yStart);
  expect(b.p1.y, '之后必须落回来').toBeLessThan(peak);
});

test('空中招帧数先走完时，控制权交还 jump 而不是停在没有重力的 idle 里', () => {
  // 这条守的是一个实测过的死机：jA 全长 27 帧，而滞空约 38 帧——招式先结束，
  // 如果这时切到 idle，角色会永远浮在半空（实测卡在 y=143 不动，再也落不下来）。
  const c = CHARACTERS[0];
  const b = new Battle(structuredClone(c), structuredClone(c), 400, 900);
  // 必须是**大跳**：小跳滞空短于 jA 的 27 帧，会先落地，测不到"招式先结束"这条路径
  b.tick(press({ jump: true, jumpHeld: true }), press());
  for (let i = 0; i < 4; i++) b.tick(press({ jumpHeld: true }), press());
  b.tick(press({ attack: true }), press());
  const total = c.moves.jA.startup + c.moves.jA.active + c.moves.jA.recovery;
  for (let i = 0; i < total + 4; i++) b.tick(press(), press());
  expect(b.p1.y, '招式走完时应该还在空中，否则这条测试没测到点子上').toBeGreaterThan(0);
  expect(b.p1.state, '还没落地就该回到 jump，让重力继续起作用').toBe('jump');
  let landed = false;
  for (let i = 0; i < 120; i++) { b.tick(press(), press()); if (b.p1.y <= 0) landed = true; }
  expect(landed, '必须真的落回地面，不能浮在半空').toBe(true);
});
