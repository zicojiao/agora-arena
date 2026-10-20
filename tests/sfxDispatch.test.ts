import { expect, test } from 'vitest';
import { Battle, ROUND_TIME } from '../src/engine/battle';
import { createAi } from '../src/engine/ai';
import { CHARACTERS } from '../src/data/characters';
import { STAGES, BOSS_HP_SCALE, BOSS_DMG_SCALE } from '../src/data/stages';
import { sfxForEvent } from '../src/render/sfx';

// 音效分派。合成器里写了一种声音、却没有任何事件会触发它，那就是死代码——
// 肉眼看不出来。实测过一次：挥空声只在**普攻**起手时响，一记打空的必杀完全无声，
// 而空挥率有 46%，近一半的攻击既没有画面反馈也没有声音。

const PROXY = { name: 'proxy', decideEvery: 26, react: 0.3,
  near: { attack: 5, block: 2, retreat: 4, skill2: 1, backstep: 2 },
  mid: { approach: 3, skill1: 4, skill3: 1, jump: 1, dash: 2, retreat: 2 },
  far: { approach: 2, skill1: 4, dash: 3, charge: 2 } } as never;

/** 按真实对局统计每种声音每回合响几次 */
function census() {
  const cnt = new Map<string, number>();
  let rounds = 0;
  for (let si = 0; si < 4; si++) for (let seed = 0; seed < 8; seed++) {
    const st = STAGES[si];
    const me = structuredClone(CHARACTERS[seed % CHARACTERS.length]);
    const boss = structuredClone(CHARACTERS.find(c => c.id === st.bossId)!);
    boss.hp = Math.round(boss.hp * BOSS_HP_SCALE[si]);
    for (const mv of Object.values(boss.moves)) mv.damage = Math.round(mv.damage * BOSS_DMG_SCALE[si]);
    const b = new Battle(me, boss); rounds++;
    const a1 = createAi(PROXY, seed * 13 + 1), a2 = createAi(st.ai, seed * 7 + 3);
    for (let f = 0; f < ROUND_TIME && b.winner === null && !b.timeUp && !b.doubleKo; f++) {
      b.tick(a1(b, 0), a2(b, 1));
      for (const e of b.events) {
        const s = sfxForEvent(e);
        if (s) { const k = `${s.kind}${s.heavy ? '(重)' : ''}`; cnt.set(k, (cnt.get(k) ?? 0) + 1); }
      }
    }
  }
  return { cnt, rounds };
}

test('每一种声音都真的会响——没有写了没人触发的死档', () => {
  const { cnt, rounds } = census();
  const report = [...cnt].map(([k, v]) => `${k} ${(v / rounds).toFixed(2)}`).join('  ');
  for (const k of ['hit', 'block', 'throw', 'super', 'ko', 'whiff', 'whiff(重)']) {
    expect(cnt.get(k) ?? 0, `「${k}」一次都没响过　${report}`).toBeGreaterThan(0);
  }
});

test('必杀起手也发声——不只是普攻', () => {
  const { cnt, rounds } = census();
  const heavy = (cnt.get('whiff(重)') ?? 0) / rounds;
  expect(heavy, `必杀/吹飞起手每回合只响 ${heavy.toFixed(2)} 次`).toBeGreaterThan(3);
});

test('大招不发挥空声——它自己有一声发动音，不该叠两层', () => {
  const c = CHARACTERS[0];
  const sup = sfxForEvent({ type: 'moveStart', who: 0, move: c.moves.sp100 });
  expect(sup, '大招起手不该走挥空声').toBeNull();
  const skill = sfxForEvent({ type: 'moveStart', who: 0, move: c.moves.s1 });
  expect(skill).toEqual({ kind: 'whiff', heavy: true });
  const light = sfxForEvent({ type: 'moveStart', who: 0, move: c.moves.n1 });
  expect(light).toEqual({ kind: 'whiff', heavy: false });
});

// 反过来的那一半：上面几条查的是"写了的声音有没有人触发"，这条查的是
// "发出去的事件有没有人配音"。两个方向都要有，否则新加一种事件时，
// 分派函数默默落进 default 里被丢掉——实测就漏过三条：受身、防御取消、投技解脱，
// 恰好是全套系统里仅有的三个「守方翻盘」瞬间，一个响声都没有，玩家因此学不会它们存在。
test('每一种战斗事件都配了声音——大招起手是唯一的例外', () => {
  const seen = new Map<string, number>();      // 事件类型 → 无声次数
  const total = new Map<string, number>();
  for (let si = 0; si < 4; si++) for (let a = 0; a < 4; a++) {
    const b = (a + 1 + si) % CHARACTERS.length;
    const bt = new Battle(structuredClone(CHARACTERS[a]), structuredClone(CHARACTERS[b]));
    const a1 = createAi(STAGES[si].ai, si * 101 + a * 13 + 1), a2 = createAi(STAGES[si].ai, si * 57 + b * 7 + 3);
    for (let f = 0; f < 60 * 120 && bt.winner === null; f++) {
      bt.tick(a1(bt, 0), a2(bt, 1));
      for (const e of bt.events) {
        total.set(e.type, (total.get(e.type) ?? 0) + 1);
        // 大招的发动声由 super 事件负责，它的 moveStart 不该再叠一层挥空声
        if (!sfxForEvent(e) && !(e.type === 'moveStart' && e.move.meterCost > 0)) {
          seen.set(e.type, (seen.get(e.type) ?? 0) + 1);
        }
      }
    }
  }
  // 先确认这一趟真的把三个翻盘事件都跑出来了，否则"没有无声事件"是空断言
  for (const t of ['tech', 'guardCancel', 'throwEscape']) {
    expect(total.get(t) ?? 0, `用例没成立：整趟对局一次 ${t} 都没发生，这条断言等于没测`).toBeGreaterThan(0);
  }
  expect([...seen.keys()], `这些事件发出去了却没有声音：${[...seen].map(([k, v]) => `${k}(${v}次)`).join('、')}`).toEqual([]);
}, 300_000);

// 挑衅借了 s1 的槽位（battle 的 tauntMove 复用 n1 再改字段），于是按"槽位不是 n 开头 = 必杀"
// 那条规则，它会发出一记沉重的兵器破空声——而它是个空手的嘲讽动作，判定框 0×0、伤害 0。
// AI 现在每回合挑衅 0.3 次，这声不对就一直不对。
test('挑衅不发兵器破空声——它没有兵器，也没有判定框', () => {
  const c = CHARACTERS[0];
  const taunt = { ...c.moves.n1, id: `${c.id}_taunt`, slot: 's1' as const, damage: 0, meterCost: 0 as const };
  const got = sfxForEvent({ type: 'moveStart', who: 0, move: taunt });
  expect(got, '挑衅没有声音').not.toBeNull();
  expect(got!.kind, '挑衅发的是必杀那记重挥').toBe('taunt');
  expect(got!.heavy, '挑衅不该是重音').toBe(false);
});

test('真必杀仍然是重挥，普攻仍然是轻挥——别把上一条改过头', () => {
  const c = CHARACTERS[0];
  expect(sfxForEvent({ type: 'moveStart', who: 0, move: c.moves.s1 })!.heavy, 's1 不再是重挥').toBe(true);
  expect(sfxForEvent({ type: 'moveStart', who: 0, move: c.moves.n1 })!.heavy, 'n1 变成了重挥').toBe(false);
});
