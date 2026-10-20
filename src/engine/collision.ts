import type { Box } from './types';

export function overlaps(a: Box, b: Box): boolean {
  return a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
}

/** 面朝右定义的局部框 → 世界屏幕框。feetScreenY = FLOOR_Y - fighter.y */
export function worldBox(local: Box, feetX: number, feetScreenY: number, facing: 1 | -1): Box {
  const x = facing === 1 ? feetX + local.x : feetX - local.x - local.w;
  return { x, y: feetScreenY - local.y - local.h, w: local.w, h: local.h };
}
