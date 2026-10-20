import { expect, test } from 'vitest';
import { CHARACTERS } from '../src/data/characters';

const SPECIALS = ['s1', 's2', 's3'] as const;
const HOUYI = CHARACTERS.find(c => c.id === 'houyi')!;

test('后羿是全场唯一三记必杀全是箭的人——这是他的定位本体', () => {
  const projCount = (c: typeof CHARACTERS[number]) =>
    SPECIALS.filter(k => c.moves[k].projectile).length;
  expect(projCount(HOUYI)).toBe(3);
  for (const c of CHARACTERS) {
    if (c === HOUYI) continue;
    expect(projCount(c), `${c.name} 也有 ${projCount(c)} 记投射必杀，后羿不再唯一`).toBeLessThan(3);
  }
});

// 这里原本还有一条"后羿的箭冷却必须比别人的弹短"。删掉了，因为它守错了东西：
// 实测把冷却从 210/300/360 砍到 130/210/300，全campaign 出箭量只从 327 变成 338（+3%）。
// 一场 120 秒 = 7200 帧，冷却 130 光 s1 就够放 55 次，而他实际全场只放约 10 支——
// **冷却离瓶颈还差得远**，真正的约束是 AI 的站位与决策频率（他很少处在远距离）。
// 钉住一个不起作用的旋钮，只会让下一个人以为这件事已经解决了。
