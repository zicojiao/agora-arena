import { expect, test } from 'vitest';
import { overlaps, worldBox } from '../src/engine/collision';

test('相交与不相交', () => {
  expect(overlaps({ x: 0, y: 0, w: 10, h: 10 }, { x: 5, y: 5, w: 10, h: 10 })).toBe(true);
  expect(overlaps({ x: 0, y: 0, w: 10, h: 10 }, { x: 10, y: 0, w: 10, h: 10 })).toBe(false); // 贴边不算
});

test('worldBox 面朝右', () => {
  // 脚底在 (100, 460)，局部框：前方 20px、离地 60px、宽 50 高 30
  const b = worldBox({ x: 20, y: 60, w: 50, h: 30 }, 100, 460, 1);
  expect(b).toEqual({ x: 120, y: 370, w: 50, h: 30 }); // y = 460 - 60 - 30
});

test('worldBox 面朝左镜像', () => {
  const b = worldBox({ x: 20, y: 60, w: 50, h: 30 }, 100, 460, -1);
  expect(b).toEqual({ x: 30, y: 370, w: 50, h: 30 }); // x = 100 - 20 - 50
});
