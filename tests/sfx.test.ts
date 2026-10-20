import { afterEach, expect, test } from 'vitest';
import { isMuted, setMuted } from '../src/render/sfx';

// vitest 默认跑在 node 环境，没有全局 window：这本身就覆盖了 localStorage 完全不可用
// （隐私模式的极端情形）时应退回「不静音」且不抛异常的兜底路径。
afterEach(() => setMuted(false)); // 状态是模块级单例，测试之间要复位

test('无 localStorage 环境下默认不静音，读写都不抛异常', () => {
  expect(isMuted()).toBe(false);
  expect(() => setMuted(true)).not.toThrow();
});

test('setMuted/isMuted 内存态原地生效（即使持久化失败）', () => {
  setMuted(true);
  expect(isMuted()).toBe(true);
  setMuted(false);
  expect(isMuted()).toBe(false);
});
