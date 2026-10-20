import { expect, test } from 'vitest';
import { CHARACTERS } from '../src/data/characters';
import { validateCharacter } from '../src/data/validate';

// 四个对手打完只给一个「胜/败」，谁是谁完全没有分别。一句台词就能把牛魔王和二郎神分开。

type El = { type: unknown; props?: Record<string, unknown> };
const isEl = (n: unknown): n is El => typeof n === 'object' && n !== null && 'type' in n && 'props' in n;
const textOf = (n: unknown): string => {
  if (n == null || typeof n === 'boolean') return '';
  if (typeof n === 'string' || typeof n === 'number') return String(n);
  if (Array.isArray(n)) return n.map(textOf).join('');
  if (isEl(n)) return textOf(n.props?.children);
  return '';
};

test('每个角色都有胜负两句台词，且长度放得下', () => {
  for (const c of CHARACTERS) {
    expect(c.quotes.win.length, `${c.name} 缺胜利台词`).toBeGreaterThan(0);
    expect(c.quotes.lose.length, `${c.name} 缺败北台词`).toBeGreaterThan(0);
    expect(c.quotes.win.length, `${c.name} 胜利台词过长`).toBeLessThanOrEqual(18);
    expect(c.quotes.lose.length, `${c.name} 败北台词过长`).toBeLessThanOrEqual(18);
    expect(c.quotes.win, `${c.name} 的胜负台词一模一样`).not.toBe(c.quotes.lose);
  }
  // 四个人的台词互不相同——复制粘贴忘了改会在这里报红
  const all = CHARACTERS.flatMap(c => [c.quotes.win, c.quotes.lose]);
  expect(new Set(all).size, '有角色的台词重复了').toBe(all.length);
});

test('校验器会挡下缺台词和超长台词的角色', () => {
  const base = structuredClone(CHARACTERS[0]);
  expect(validateCharacter(base)).toEqual([]);
  const noQuote = structuredClone(base);
  (noQuote as { quotes: { win: string; lose: string; taunt: string } }).quotes = { win: '', lose: '有', taunt: '有' };
  expect(validateCharacter(noQuote).join(''), '缺台词没被挡下').toContain('缺胜台词');
  const tooLong = structuredClone(base);
  tooLong.quotes = { win: '一'.repeat(19), lose: '短', taunt: '短', intro: '短' };
  expect(validateCharacter(tooLong).join(''), '超长台词没被挡下').toContain('过长');
});

