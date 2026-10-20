import { expect, test } from 'vitest';
import { Battle } from '../src/engine/battle';
import { createAi } from '../src/engine/ai';
import { CHARACTERS } from '../src/data/characters';
import { STAGES } from '../src/data/stages';
import { NULL_INPUT, type Dir, type InputFrame } from '../src/engine/types';

// 远程流（拉开距离放飞行道具、贴脸就推开、对手跳就对空）是目前最强的单一打法：
// 一次通关 34%，而中庸的全能尺子只有 7%。它是个**完整的打法**不是单键无脑解，
// 强一点是应该的——但不能强到"照这个打就能通关"。
//
// 它对引擎改动很敏感：加了"格挡硬直结束可直接出招"之后从 24% 涨到 34%，
// 因为这个打法大量格挡、而反击的转化率提高了。所以它需要一条自己的守门。

const PROJ: Record<string, 'skill1' | 'skill2' | 'skill3'> = { nezha: 'skill2', erlang: 'skill1', niumo: 'skill3' };
const KEY: Record<string, 's1' | 's2' | 's3'> = { skill1: 's1', skill2: 's2', skill3: 's3' };

function zoner() {
  return (b: Battle, w: 0 | 1): InputFrame => {
    const me = w === 0 ? b.p1 : b.p2, foe = w === 0 ? b.p2 : b.p1;
    const toward = (foe.x >= me.x ? 1 : -1) as Dir, away = -toward as Dir;
    const gap = Math.abs(foe.x - me.x);
    const i: InputFrame = { ...NULL_INPUT };
    const k = PROJ[me.def.id];
    if (foe.y > 0 && foe.vy <= 0 && gap < 110) { i.attack = true; return i; }        // 对空
    if (gap < 110) { i.attack = true; i.move = away; return i; }                      // 推开
    if (k && !(me.cooldowns[me.def.moves[KEY[k]].id] > 0) && gap < 520) { i[k] = true; return i; }
    if (gap < 300) { i.move = away; return i; }
    i.block = true; return i;
  };
}

test('单靠远程流打不穿整条阶梯', () => {
  const N = 12;
  const rates = STAGES.map((st, si) => {
    let win = 0, n = 0;
    for (let s = 0; s < N; s++) for (const swap of [false, true]) {
      let pi = s % 4;
      while (!PROJ[CHARACTERS[pi].id]) pi = (pi + 1) % 4;   // 孙悟空没有飞行道具，跳过
      const ei = (s + 1 + si) % 4;
      const [A, B] = swap ? [ei, pi] : [pi, ei];
      const b = new Battle(structuredClone(CHARACTERS[A]), structuredClone(CHARACTERS[B]));
      const ai = createAi(st.ai, s * 13 + 1), bot = zoner();
      for (let f = 0; f < 60 * 180 && b.winner === null; f++) {
        const me = (swap ? 1 : 0) as 0 | 1;
        const mine = bot(b, me);
        b.tick(me === 0 ? mine : ai(b, 0), me === 0 ? ai(b, 1) : mine);
      }
      n++; if (b.winner === (swap ? 1 : 0)) win++;
    }
    return win / n;
  });
  const clear = rates.reduce((a, r) => a * r, 1);
  const show = STAGES.map((s, i) => `${s.name} ${Math.round(rates[i] * 100)}%`).join('  ')
    + `　→ 一次通关概率 ${Math.round(clear * 100)}%`;
  // 0.45：与跳入那条同线，实测 37%，留约两成余量。
  //
  // **这条抓的是漂移，不是某个机制**——如实记下：试着把"AI 对飞来的道具的反应"整支摘掉
  // 做红检，量出来是 **31%，反而比现在的 37% 更低**，没有越线。
  // 也就是说那套道具反应现在对远程流是帮倒忙（AI 会翻滚/大跳去应对，
  // 正好被"贴脸就打"的 bot 抓到），与当初加它时量到的 27%→18% 相反——
  // 中间隔着"格挡可直接出招"等一堆改动。样本（每关 24 场）不足以下定论，先记着。
  expect(clear, `远程流一个打法就能打穿全场　${show}`).toBeLessThan(0.45);
}, 900_000);
