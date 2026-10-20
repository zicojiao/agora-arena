import { expect, test } from 'vitest';
import { Battle } from '../src/engine/battle';
import { CHARACTERS } from '../src/data/characters';
import { NULL_INPUT, type InputFrame } from '../src/engine/types';

// 大跳作为**跳入**是劣势选项，这没错——实测调到最好也只有 1% 的通关概率，
// 而深度小跳有 28%。拳皇里也是这样：45 帧滞空的大跳撞对空，深度小跳才是压制手段。
//
// 但那不等于大跳没用。它的正当用途是**跨过飞行道具**：小跳峰值 67px，
// 而二郎神的光束判定框在 70~110——小跳根本躲不掉。这条把这个用途钉住，
// 免得哪天有人「因为大跳打不过人」就把它削掉或删掉。

/** 站在远处挨一发光束，返回是否被打到。hold=true 走大跳 */
function jumpOverBeam(hold: boolean): boolean {
  const er = structuredClone(CHARACTERS.find(c => c.id === 'erlang')!);
  const b = new Battle(structuredClone(CHARACTERS[0]), er);
  b.p1.x = 300; b.p2.x = 760;
  let fired = -1, hit = false;
  for (let f = 0; f < 240; f++) {
    const i: InputFrame = { ...NULL_INPUT };
    // 光束发出后隔几帧起跳，让它正好在道具飞到时处于高位
    if (fired >= 0 && f === fired + 26) i.jump = true;
    if (fired >= 0 && f > fired + 26 && f <= fired + 31) i.jumpHeld = hold;
    b.tick(i, { ...NULL_INPUT, skill1: f === 0 });
    if (fired < 0 && b.projectiles.some(p => p.owner === 1)) fired = f;
    if (b.events.some(e => e.type === 'hit' && e.attacker === 1)) hit = true;
    if (fired >= 0 && b.projectiles.length === 0 && f > fired + 40) break;
  }
  return hit;
}

test('大跳跨得过飞行道具，小跳跨不过——这是大跳的正当用途', () => {
  expect(jumpOverBeam(false), '用例没成立：小跳居然也躲开了光束，这条测试无从对比').toBe(true);
  expect(jumpOverBeam(true), '大跳也被光束打到了——那大跳就彻底没有用途了').toBe(false);
});

test('两种跳的高度确实拉得开', () => {
  const peak = (hold: boolean) => {
    const b = new Battle(structuredClone(CHARACTERS[0]), structuredClone(CHARACTERS[1]));
    let p = 0;
    for (let f = 0; f < 90; f++) {
      b.tick({ ...NULL_INPUT, jump: f === 0, jumpHeld: hold && f < 5 }, { ...NULL_INPUT });
      p = Math.max(p, b.p1.y);
      if (f > 5 && b.p1.y <= 0) break;
    }
    return p;
  };
  const small = peak(false), big = peak(true);
  // 光束判定框在 y 70~110：小跳要够不着，大跳要够得着
  expect(small, `小跳峰值 ${Math.round(small)}px，已经能越过光束了，两种跳没有分工`).toBeLessThan(110);
  expect(big, `大跳峰值 ${Math.round(big)}px，越不过光束`).toBeGreaterThan(150);
});
