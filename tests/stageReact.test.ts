import { expect, test } from 'vitest';
import { Battle } from '../src/engine/battle';
import { createAi } from '../src/engine/ai';
import { CHARACTERS } from '../src/data/characters';
import { STAGES } from '../src/data/stages';
import { NULL_INPUT, type Dir, type InputFrame } from '../src/engine/types';

// 这两条守的是同一件事的两个面：**某一关比前一关更迟钝**，以及它必然带来的后果
//（那一关出现一个别的关卡没有的无脑解）。
//
// 实际发生过：关2 的 react 被从 0.32 降到 0.2 去压 balance 的落差断言，于是它比
// 关1 的 0.25 还低。后果是「只蹲着扫下段」这一个套路在关2 拿 81%，关1 只有 63% ——
// 第二关比第一关好打，而且好打在一个具体的洞上。改回 0.26 后压到 59%。

test('后面每一关的反应速度都不低于前一关', () => {
  const r = STAGES.map(s => s.ai.react ?? 0);
  const show = STAGES.map((s, i) => `${s.name} ${r[i]}`).join('  ');
  for (let i = 1; i < r.length; i++) {
    expect(r[i], `第 ${i + 1} 关比上一关还迟钝　${show}`).toBeGreaterThanOrEqual(r[i - 1]);
  }
});

/**
 * 下段套路也要扫构造，理由同 jumpInCheese：钉死一种写法，量的是那种写法，不是机制。
 * 实测五种构造（节奏 / 走近时蹲不蹲 / 进入距离）在第一关给出 56%~75%——
 * 而这条断言原来的门槛是 70%：换个构造它就翻面。
 */
const SWEEPS: [string, number, boolean, number][] = [
  ['每6帧 走时蹲 90px', 6, true, 90],
  ['每4帧 走时蹲 90px', 4, true, 90],
  ['每14帧 走时站 100px', 14, false, 100],
];

function sweepRate(si: number, cad: number, crouchWalk: boolean, range: number, N: number): number {
  const to = (b: Battle, w: 0 | 1): Dir => {
    const me = w === 0 ? b.p1 : b.p2, foe = w === 0 ? b.p2 : b.p1;
    return (foe.x >= me.x ? 1 : -1) as Dir;
  };
  const st = STAGES[si];
  let win = 0, n = 0;
  for (let s = 0; s < N; s++) for (const swap of [false, true]) {
    const pi = s % 4, ei = (s + 1 + si) % 4;
    const [A, B] = swap ? [ei, pi] : [pi, ei];
    const b = new Battle(structuredClone(CHARACTERS[A]), structuredClone(CHARACTERS[B]));
    const ai = createAi(st.ai, s * 13 + 1);
    for (let f = 0; f < 60 * 180 && b.winner === null; f++) {
      const me = (swap ? 1 : 0) as 0 | 1;
      const far = Math.abs(b.p1.x - b.p2.x) > range;
      const bot: InputFrame = { ...NULL_INPUT, crouch: crouchWalk || !far,
        attack: f % cad === 0, move: far ? to(b, me) : 0 };
      b.tick(me === 0 ? bot : ai(b, 0), me === 0 ? ai(b, 1) : bot);
    }
    n++; if (b.winner === (swap ? 1 : 0)) win++;
  }
  return win / n;
}

test('没有哪一关能被「只蹲着扫下段」单独攻破，而且越靠后的关卡越挡得住', () => {
  const N = 12;   // 24 场 × 3 种构造/关
  const rates = STAGES.map((_, si) => Math.max(...SWEEPS.map(([, c, w, r]) => sweepRate(si, c, w, r, N))));
  const show = STAGES.map((s, i) => `${s.name} ${Math.round(rates[i] * 100)}%`).join('  ');

  // 绝对门槛：取最强构造后实测第一关 75%，所以线放在 80%。
  // 一个只按一个键、连防御都不会的套路，胜率不该高过这个
  for (let i = 0; i < rates.length; i++) {
    expect(rates[i], `第 ${i + 1} 关被单一下段套路攻破　${show}`).toBeLessThan(0.80);
  }
  // 相对门槛——这条才是当初真正出问题的形状：关2 的 react 被降到比关1 还低时，
  // 下段套路在关2 拿 81%、关1 只有 63%，**第二关比第一关更好打**。
  // 绝对值随构造浮动，但"越靠后越挡得住"这条形状不该随构造翻面。
  for (let i = 1; i < rates.length; i++) {
    expect(rates[i] - rates[i - 1], `第 ${i + 1} 关比上一关更容易被下段打穿　${show}`)
      .toBeLessThanOrEqual(0.10);
  }
}, 600_000);
