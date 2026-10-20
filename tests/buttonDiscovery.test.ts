import { expect, test } from 'vitest';
import { IDLE_TIPS } from '../src/ui/TouchLayer';

/**
 * 屏幕上只有五颗键，而**没翻过帮助页的人**只能从提示条里知道它们是干什么的。
 * 一颗键在提示条里一次都没被提过，玩家多半整趟都不知道它做什么——
 * 「吹飞」此前正是这种：占着五分之一的操作区，轮播里一句没有，
 * 只在帮助页里躺着（而帮助页要主动去翻）。
 *
 * 这条断言不查"教得好不好"，只查**每颗键都被提到过**——那是最低要求。
 */

test('轮播里的每一句都读得完，也没有重复的', () => {
  for (const t of IDLE_TIPS) {
    expect(t.length, `「${t}」太长，提示条一行放不下`).toBeLessThanOrEqual(24);
    expect(t.length, `「${t}」短得没说清什么`).toBeGreaterThan(6);
  }
  expect(new Set(IDLE_TIPS).size, '轮播里有重复的句子').toBe(IDLE_TIPS.length);
});
