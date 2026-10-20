import { expect, test } from 'vitest';
import { Battle, cdReach } from '../src/engine/battle';
import { createAi } from '../src/engine/ai';
import { CHARACTERS } from '../src/data/characters';
import type { AiProfile } from '../src/engine/ai';

// CD 吹飞攻击是全场接触率最低的一招（22-48%，比最快的普攻还低），而它一空就是
// 33-35 帧站在原地。实测 AI 把它甩在中位 68、四分位到 106、最远 192 的距离上，
// 真正打中过的最远却只有 119——成因不是权重表（CD 只在「近身 <120」那一档），
// 是决策选中后要握住 26-30 帧，等到能出手的那一帧人早跑开了。
//
// 这两条钉的不是胜率（实测总接触率 36%→37%，在噪声里），而是「够不到就别按」这条规矩本身。

/** 只会选 blowback 的档案：把权重表这个变量摘掉，剩下的就是距离判定 */
const ONLY_CD = { name: 'cd', decideEvery: 1, near: { blowback: 1 }, mid: { blowback: 1 }, far: { blowback: 1 } } as AiProfile;

function pressedWithin(gap: number, frames: number): boolean {
  const c = structuredClone(CHARACTERS[3]);   // 牛魔王：最慢，也最经不起白挥
  const b = new Battle(c, structuredClone(CHARACTERS[0]));
  const ai = createAi(ONLY_CD, 1);
  let pressed = false;
  for (let f = 0; f < frames; f++) {
    b.p1.x = 400; b.p2.x = 400 + gap;         // 每帧钉死距离，只看这一个距离下的决策
    if (ai(b, 0).blowback) pressed = true;
    b.tick({ ...ai(b, 0) }, { ...ai(b, 1), blowback: false });
  }
  return pressed;
}

test('够不到的距离上不按 CD——那一下必空，而且要站 33-35 帧', () => {
  const reach = cdReach(CHARACTERS[3], CHARACTERS[0]);
  expect(pressedWithin(Math.round(reach) + 60, 240),
    `离 ${Math.round(reach) + 60} 仍然按了 CD，而它只够得到 ${Math.round(reach)}`).toBe(false);
});

test('够得到就照按不误——不能把这招直接锁死', () => {
  const reach = cdReach(CHARACTERS[3], CHARACTERS[0]);
  expect(pressedWithin(Math.round(reach) - 40, 240),
    `离 ${Math.round(reach) - 40} 在够得到的范围内，却一次都没按出 CD`).toBe(true);
});
