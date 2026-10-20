import { expect, test } from 'vitest';
import { Battle } from '../src/engine/battle';
import { STICK_OFF, STICK_ON, stickDirs } from '../src/ui/TouchLayer';
import { createHeld, toInputFrame } from '../src/ui/input';
import { press, testChar } from './helpers';

/**
 * 触屏摇杆的抖动。这是**手游那一侧**的输入契约，和键盘那条是一回事的两种硬件：
 * 键盘有干净的按下/抬起，玻璃上的拇指没有——它会停在阈值上来回蹭。
 *
 * 单阈值（`held.left = dx < -20`）时，dx 在 -20 附近抖一下 left 就翻一次。
 * 走路时这只是脚下微抖看不出来；而回避改成读**方向的按下边沿**之后，
 * 抖一次就等于新按一次方向——握着格挡的手会莫名其妙滚出去，
 * 而回避的收尾没有无敌，等于白送对手一套。
 */

/** 拇指压在阈值上来回蹭：在 ON 边界两侧各跨一点点 */
const JITTER = [-21, -19, -22, -18, -21, -19, -23, -17, -21, -19];

test('拇指压在阈值上来回蹭，方向不该跟着翻', () => {
  let prev = { left: false, right: false, crouch: false };
  let flips = 0;
  for (const dx of JITTER) {
    const d = stickDirs(dx, 0, prev);
    if (d.left !== prev.left) flips++;
    prev = d;
  }
  // 第一次越过 ON 是**该**翻的，此后回差把人按住：-19/-18/-17 都还没收回到 OFF
  expect(flips, `摇杆在阈值附近翻了 ${flips} 次——回差没起作用`).toBe(1);
});

test('回差不是把摇杆焊死：真的收回来还是要松开', () => {
  let d = stickDirs(-30, 0, { left: false, right: false, crouch: false });
  expect(d.left, '推到 -30 应当算推左').toBe(true);
  d = stickDirs(-(STICK_OFF + 1), 0, d);
  expect(d.left, `回到 -${STICK_OFF + 1}（还没收回 OFF）应当仍算推左`).toBe(true);
  d = stickDirs(-(STICK_OFF - 1), 0, d);
  expect(d.left, `收回到 -${STICK_OFF - 1} 应当松开`).toBe(false);
  // 松开之后再推，要重新越过 ON 才算数——否则回差就只有一半
  d = stickDirs(-(STICK_ON - 1), 0, d);
  expect(d.left, `松开后推到 -${STICK_ON - 1}（没到 ON）不该算推左`).toBe(false);
});

test('握着格挡时摇杆抖动，不该抖出翻滚来', () => {
  const c = testChar();
  const b = new Battle(structuredClone(c), structuredClone(c), 400, 500);
  const held = createHeld(), prev = createHeld();
  held.block = true;                      // 一只手一直按着格挡
  let rolls = 0, was = false;
  for (let f = 0; f < 120; f++) {
    const d = stickDirs(JITTER[f % JITTER.length], 0, held);
    held.left = d.left; held.right = d.right; held.crouch = d.crouch;
    b.tick(toInputFrame(held, prev), press({ attack: f % 15 === 0 }));
    if (b.p1.state === 'roll' && !was) rolls++;
    was = b.p1.state === 'roll';
  }
  // 拇指第一次越过阈值算一次真的方向输入，之后全是抖动，不该再滚
  expect(rolls, `摇杆抖动滚出了 ${rolls} 次回避——玩家没打算滚，而回避收尾没有无敌`)
    .toBeLessThanOrEqual(1);
});
