import { expect, test } from 'vitest';
import { buttonView, shortName } from '../src/ui/TouchLayer';
import { CHARACTERS } from '../src/data/characters';
import type { MoveSlot } from '../src/engine/types';

// 六颗触屏按键原来叫「拳/技1/技2/技3/大招/防」——技能键是按引擎的槽位序号命的名，玩家
// 没有任何办法知道按下去会发生什么，而招式名一直现成躺在数据里；冷却完全没有反馈，按了
// 没反应也不知道为什么；大招键其实是奥义/超必杀两档，却只有边框颜色在变。这三件是这版
// 交互改动的全部行为，锁在这里。

const NEZHA = CHARACTERS.find(c => c.id === 'nezha')!;

/** 造一个只带 buttonView 需要的字段的最小 Fighter 替身 */
const fighter = (meter = 0, cooldowns: Record<string, number> = {}) =>
  ({ def: NEZHA, meter, cooldowns }) as unknown as Parameters<typeof buttonView>[1];

const btn = (key: string, slot: MoveSlot | null, fallback = '—') =>
  ({ key, slot, fallback }) as Parameters<typeof buttonView>[0];

test('技能键显示招式名而不是槽位序号，长名按间隔号与 4 字规则收短', () => {
  expect(shortName('风火轮·升龙')).toBe('风火轮'); // 间隔号前那段
  expect(shortName('筋斗云突袭')).toBe('筋斗云');   // 超过 4 字取前 3，仍是看得懂的东西
  expect(shortName('烈焰突刺')).toBe('烈焰突刺');   // 正好 4 字不动
  expect(shortName('乾坤圈')).toBe('乾坤圈');

  // 全角色全技能位都不能再出现「技1/技2/技3」这类槽位名，且要压得进按钮（≤4 字）
  for (const c of CHARACTERS) {
    for (const slot of ['s1', 's2', 's3'] as MoveSlot[]) {
      const label = buttonView(btn('skill1', slot), fighter()).label;
      expect(label, `${c.name} ${slot}`).not.toMatch(/技[123一二三]/);
      expect(label.length, `${c.name} ${slot} 「${label}」压不进按钮`).toBeLessThanOrEqual(4);
    }
  }
});

test('冷却中的技能键给出剩余比例，冷却走完回到就绪', () => {
  const s1 = NEZHA.moves.s1;
  expect(s1.cooldown).toBeGreaterThan(0);

  const fresh = buttonView(btn('skill1', 's1'), fighter(0, { [s1.id]: s1.cooldown }));
  expect(fresh.cooling).toBe(1);
  expect(fresh.ready).toBe(false);

  const half = buttonView(btn('skill1', 's1'), fighter(0, { [s1.id]: Math.round(s1.cooldown / 2) }));
  expect(half.cooling).toBeGreaterThan(0.4);
  expect(half.cooling).toBeLessThan(0.6);

  const done = buttonView(btn('skill1', 's1'), fighter(0, { [s1.id]: 0 }));
  expect(done.cooling).toBe(0);
  expect(done.ready).toBe(true);
});

test('普攻与格挡没有冷却表现（普攻 cooldown 为 0，格挡不对应招式）', () => {
  expect(buttonView(btn('attack', 'n1'), fighter(0, { [NEZHA.moves.n1.id]: 40 })).cooling).toBe(0);
  const block = buttonView(btn('block', null, '格挡'), fighter());
  expect(block.label).toBe('格挡');
  expect(block.cooling).toBe(0);
});

test('大招键按气槽显示所在档位：不足 50 锁住，50 出奥义，100 出超必杀', () => {
  const locked = buttonView(btn('super', null, '大招'), fighter(49));
  expect(locked.label).toBe('大招');
  expect(locked.ready).toBe(false);
  expect(locked.tone).toBeNull();

  const tier1 = buttonView(btn('super', null, '大招'), fighter(50));
  expect(tier1.label).toBe('奥义');
  expect(tier1.ready).toBe(true);

  const tier2 = buttonView(btn('super', null, '大招'), fighter(100));
  expect(tier2.label).toBe('超必杀');
  expect(tier2.ready).toBe(true);
  expect(tier2.tone).not.toBe(tier1.tone); // 两档的颜色必须不同，不能只有文字变
});
