import { expect, test } from 'vitest';
import { Battle } from '../src/engine/battle';
import { getHitCounter, tickHitCounter } from '../src/render/hitCounter';
import { press, testChar } from './helpers';

test('HIT 计数按逻辑 tick 推进：命中累加，一段时间无命中后归零', () => {
  const b = new Battle(testChar(), testChar(), 400, 500);
  b.tick(press({ attack: true }), press());
  tickHitCounter(b);
  for (let i = 0; i < 3; i++) { b.tick(press(), press()); tickHitCounter(b); } // 跑到命中帧（startup=3）
  expect(getHitCounter(0).count).toBe(1);

  // 命中带来的 hitstop 期间 battle.events 不会再出现新的 hit，之后一路空转，
  // 超过衰减窗口（24 tick）后计数必须归零——draw() 不负责这件事，tick 才是唯一入口
  for (let i = 0; i < 40; i++) { b.tick(press(), press()); tickHitCounter(b); }
  expect(getHitCounter(0).count).toBe(0);
});

test('新一局（新 Battle 实例）必须重置计数，不能带着上一局的数字', () => {
  const b1 = new Battle(testChar(), testChar(), 400, 500);
  b1.tick(press({ attack: true }), press());
  for (let i = 0; i < 3; i++) { b1.tick(press(), press()); tickHitCounter(b1); }
  expect(getHitCounter(0).count).toBe(1);

  const b2 = new Battle(testChar(), testChar(), 400, 500); // 全新实例，引用不同——即便还没打出命中
  tickHitCounter(b2);
  expect(getHitCounter(0).count).toBe(0);
});

// ── 计数器不能撒谎 ────────────────────────────────────────────────
// 连段计数的意义是「对手中间一下都动不了」。判据只有一条：受击方有没有脱离受控
//（hitstun/倒地）。早先这一条是拿**时间**近似的——无命中满 24 tick 才归零，
// 于是"对手已经缓过来、你隔 0.3 秒又打中一下"会接着上一段往下数。
// 实测虚报 35/6996（0.5%，最多把 1 段显示成 3 段）：不多，但它教给玩家的是错的。
// 现在 24 tick 只管**数字还留多久**（末段太短会一闪而过），不再参与"断没断"的判断。

test('显示的 HIT 数不会超过真连段数——对手起得来，就该重新数', async () => {
  const { createAi } = await import('../src/engine/ai');
  const { CHARACTERS } = await import('../src/data/characters');
  const { STAGES } = await import('../src/data/stages');
  let hits = 0, inflated = 0, worst = '';
  for (let a = 0; a < CHARACTERS.length; a++) for (let b = 0; b < CHARACTERS.length; b++) {
    if (a === b) continue;
    const bt = new Battle(structuredClone(CHARACTERS[a]), structuredClone(CHARACTERS[b]));
    const a1 = createAi(STAGES[3].ai, a * 13 + b * 7 + 1);
    const a2 = createAi(STAGES[3].ai, a * 31 + b * 5 + 3);
    const real = [0, 0];
    for (let f = 0; f < 60 * 120 && bt.winner === null; f++) {
      bt.tick(a1(bt, 0), a2(bt, 1));
      tickHitCounter(bt);
      for (const atk of [0, 1] as const) {
        const vic = atk === 0 ? bt.p2 : bt.p1;
        if (vic.state !== 'hitstun' && vic.state !== 'down') real[atk] = 0;
      }
      for (const e of bt.events) {
        if (e.type !== 'hit' || e.blocked) continue;
        const atk = e.attacker as 0 | 1;
        real[atk]++;
        hits++;
        const shown = getHitCounter(atk).count;
        if (shown > real[atk]) {
          inflated++;
          worst ||= `${CHARACTERS[atk === 0 ? a : b].name} 显示 ${shown} 段、实际 ${real[atk]} 段`;
        }
      }
    }
  }
  expect(hits, '用例没成立：一次命中都没量到').toBeGreaterThan(2000);
  expect(inflated, `${hits} 次命中里有 ${inflated} 次把数字报大了（${worst}）`).toBe(0);
}, 900_000);
