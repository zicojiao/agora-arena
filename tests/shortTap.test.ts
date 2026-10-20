import { expect, test } from 'vitest';
import { clearHeld, createHeld, press, toInputFrame } from '../src/ui/input';

// 极短点按：pointerdown 与 pointerup 都落在同一个逻辑帧的间隙里时，
// 边沿检测（这一帧 held 为真、上一帧为假）两次采样都是 false，这一下会彻底消失——
// 连引擎那层的先行入力也救不了，因为它压根没收到这次输入。
// 掉帧时更糟：累加器会在一次 rAF 里连跑好几个 tick，读的是同一份 held 快照。

test('按下又立刻松开（同一帧间隙内）仍然算一次出招', () => {
  const held = createHeld(), prev = createHeld();
  press(held, 'attack');
  held.attack = false;          // 还没到下一个逻辑帧就松手了
  const f = toInputFrame(held, prev);
  expect(f.attack, '极短点按被整个丢掉了').toBe(true);
});

test('一次按下只产生一个边沿——不能连着几帧都算', () => {
  const held = createHeld(), prev = createHeld();
  press(held, 'attack');
  held.attack = false;
  expect(toInputFrame(held, prev).attack).toBe(true);
  expect(toInputFrame(held, prev).attack, '同一次点按产生了第二个边沿').toBe(false);
  expect(toInputFrame(held, prev).attack).toBe(false);
});

test('按住不放仍然只有一个边沿（连打靠反复按，不是靠按住）', () => {
  const held = createHeld(), prev = createHeld();
  press(held, 'attack');
  const edges = [0, 1, 2, 3, 4].map(() => toInputFrame(held, prev).attack);
  expect(edges.filter(Boolean).length, `按住 5 帧产生了 ${edges.filter(Boolean).length} 个边沿`).toBe(1);
});

test('方向与防御不锁存——它们是持续状态，锁存只会让人物自己乱动', () => {
  const held = createHeld(), prev = createHeld();
  press(held, 'block');
  held.block = false;
  expect(toInputFrame(held, prev).block, '防御被锁存了，松手之后还在挡').toBe(false);
  press(held, 'right');
  held.right = false;
  expect(toInputFrame(held, prev).move, '方向被锁存了，松手之后还在走').toBe(0);
});

test('切窗口时锁存也要清掉——回来不该突然放一招', () => {
  // 直接测 clearHeld（blur 监听器就调它）：项目没装 jsdom，测不了真实的 window 事件
  const held = createHeld(), prev = createHeld();
  press(held, 'super');
  press(held, 'right');
  clearHeld(held);
  const f = toInputFrame(held, prev);
  expect(f.super, 'alt-tab 回来突然放了个大招').toBe(false);
  expect(f.move, 'alt-tab 回来人还在走').toBe(0);
});
