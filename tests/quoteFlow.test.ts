import { expect, test } from 'vitest';
import canvasSrc from '../src/ui/GameCanvas.tsx?raw';
import { CHARACTERS } from '../src/data/characters';
import { STAGES } from '../src/data/stages';

// 一局打完，玩家会看到两句台词：胜利姿势那一句（胜者说的，见 GameCanvas 的 showWinQuote）
// 和结算页那一句。两句必须不同——把胜利台词挪到摆造型那一刻之后，
// 「输」这条路上曾经两句都是对手的 win，同一行字连着出现两次。

// 取法已经收进 data/quotes 的 winQuote / loseQuote（此前是两处各自内联
// `?? 回落`，结算页两条分支又各写一遍，等于四份）。这两条断言跟着改锚点，
// 守的还是原来那件事：**姿势说胜者的 win，结算说败者的 lose，两句不重复**。
test('胜利姿势说的是胜者自己的 win 台词', () => {
  expect(/winQuote\(f\.def,/.test(canvasSrc),
    '胜利姿势不再取胜者自己的台词——这条流程的锚点变了').toBe(true);
});

test('四个角色的 win / lose 台词都不相同——否则换谁打都一样', () => {
  const win = new Set(CHARACTERS.map(c => c.quotes.win));
  const lose = new Set(CHARACTERS.map(c => c.quotes.lose));
  expect(win.size, '有角色共用同一句胜利台词').toBe(CHARACTERS.length);
  expect(lose.size, '有角色共用同一句失败台词').toBe(CHARACTERS.length);
  for (const c of CHARACTERS) {
    expect(c.quotes.win, `${c.name} 的胜负台词是同一句`).not.toBe(c.quotes.lose);
  }
});

test('每一关的 BOSS 都有台词可放——结算页不会开天窗', () => {
  for (const st of STAGES) {
    const b = CHARACTERS.find(c => c.id === st.bossId);
    expect(b, `关卡「${st.name}」的 bossId=${st.bossId} 找不到对应角色`).toBeDefined();
    expect(b!.quotes.lose.length, `${b!.name} 没有失败台词`).toBeGreaterThan(0);
    expect(b!.quotes.win.length, `${b!.name} 没有胜利台词`).toBeGreaterThan(0);
  }
});
