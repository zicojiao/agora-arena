import { expect, test } from 'vitest';
import { celestialPlace } from '../src/render/renderer';
import { HOME } from '../src/data/stages';
import { LOGIC_W } from '../src/engine/types';

/**
 * 天上那一颗挂在哪。
 *
 * 山形按 seed 派生、云纹按 seed 派生、氛围粒子各关一种，唯独日月此前**钉死在
 * 同一个点**（800, 86）、同一个半径 34——十二关分毫不差。换关时天空是最显眼的一块，
 * 偏偏也是最没变的那一块。
 */

const SEEDS = Object.values(HOME).map(h => h.bg.seed);

test('十二关的日月不在同一个位置', () => {
  const spots = SEEDS.map(s => {
    const p = celestialPlace(s);
    return `${Math.round(p.cx)},${Math.round(p.cy)}`;
  });
  expect(new Set(spots).size, `十二关只用了 ${new Set(spots).size} 个位置`).toBe(SEEDS.length);
  // 不只是"不相等"，还得真的散开：横向跨度至少占半个屏
  const xs = SEEDS.map(s => celestialPlace(s).cx);
  const spread = Math.max(...xs) - Math.min(...xs);
  expect(spread, `十二关的日月横向只散开 ${spread.toFixed(0)}px，看着还是同一个地方`)
    .toBeGreaterThan(LOGIC_W * 0.5);
  // 大小也该有差别，否则只是同一颗挪了个位置
  const rs = SEEDS.map(s => celestialPlace(s).r);
  expect(Math.max(...rs) - Math.min(...rs), '十二关的日月一样大').toBeGreaterThan(6);
});

test('日月整颗都在画面里，也不会掉进山里', () => {
  for (const [id, home] of Object.entries(HOME)) {
    const { cx, cy, r } = celestialPlace(home.bg.seed);
    expect(cx - r, `${home.name}(${id}) 的日月左边出画了`).toBeGreaterThan(0);
    expect(cx + r, `${home.name} 的日月右边出画了`).toBeLessThan(LOGIC_W);
    expect(cy - r, `${home.name} 的日月顶出画了`).toBeGreaterThan(0);
    // 剪影山脊在 300 上下，天体沉到那儿就成了埋在山里
    expect(cy + r, `${home.name} 的日月掉进山里了`).toBeLessThan(280);
  }
});

test('同一关每次都挂在同一处——位置是 seed 的函数，不是随机', () => {
  for (const s of SEEDS) {
    expect(celestialPlace(s)).toEqual(celestialPlace(s));
  }
  // 换个 seed 就该换个地方（否则 seed 根本没参与）
  expect(celestialPlace(11)).not.toEqual(celestialPlace(12));
});
