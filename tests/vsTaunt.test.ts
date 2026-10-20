import { expect, test } from 'vitest';
import { Battle, TAUNT_SAFE } from '../src/engine/battle';
import { CHARACTERS } from '../src/data/characters';
import { tauntQuote } from '../src/data/quotes';
import { NULL_INPUT } from '../src/engine/types';

/**
 * 关系网的第四张表：按对手分的挑衅台词。
 *
 * 它和前三张（vs / vsLose / vsIntro）**用法不同**，这条测试主要就是为那个不同写的：
 * 那三句是"取一个字符串直接显示"，而挑衅那句是**招式的 name**——
 * tauntMove 把它塞进 Move.name（借 s1 的坑位在头顶浮字），
 * 而那个 Move 是**按角色缓存**的（`f.def._taunt`，同 cdMove 的 `_cd`）。
 * 把 name 一起缓存进去的话，它会锁死在**第一个挑衅过的对手**身上：
 * 换关卡也不变，而且不报任何错——正是这个项目最常出的那种静默 bug。
 */

const byId = (id: string) => CHARACTERS.find(c => c.id === id)!;

/** 让 f 对着指定对手挑衅一次，返回浮字用的招式名 */
function tauntNameAgainst(meId: string, foeId: string): string {
  const bt = new Battle(structuredClone(byId(meId)), structuredClone(byId(foeId)));
  bt.p1.x = 200; bt.p2.x = 200 + TAUNT_SAFE + 60;   // 隔得够远，canTaunt 才放行
  for (let i = 0; i < 4 && !bt.p1.move?.id.endsWith('_taunt'); i++) {
    bt.tick({ ...NULL_INPUT, block: true, jump: true }, NULL_INPUT);
  }
  expect(bt.p1.move?.id.endsWith('_taunt'), `${meId} 没能对着 ${foeId} 挑衅出来`).toBe(true);
  return bt.p1.move!.name;
}

test('挑衅台词按对手分，写过的用专属、没写过的回落通用', () => {
  const niumo = byId('niumo');
  expect(tauntQuote(niumo, 'honghaier')).toBe(niumo.vsTaunt!.honghaier);
  expect(tauntQuote(niumo, 'baigu')).toBe(niumo.quotes.taunt);
  for (const a of CHARACTERS) for (const b of CHARACTERS) {
    expect(tauntQuote(a, b.id), `${a.name} 对 ${b.name} 的挑衅台词是空的`).toBeTruthy();
  }
});

// ── 这条才是重点：缓存不能把台词一起冻住 ──────────────────────────────
test('换个对手再挑衅，浮字跟着换——不能锁死在第一个对手身上', () => {
  // 同一个角色，先对 A 挑衅再对 B 挑衅：两次拿到的名字必须不同
  const first = tauntNameAgainst('niumo', 'honghaier');
  const second = tauntNameAgainst('niumo', 'wukong');
  expect(first, '第一次挑衅拿到的就是通用那句——name 根本没按对手取（多半是跟着缓存一起冻住了）')
    .toBe(byId('niumo').vsTaunt!.honghaier);
  expect(second, '换了对手，头顶浮字还是上一个对手那句——name 被缓存冻住了')
    .toBe(byId('niumo').vsTaunt!.wukong);
  // 回落那一支也要跟着换：对没写过的对手，浮字应回到通用那句
  expect(tauntNameAgainst('niumo', 'baigu'), '回落那一支也被缓存冻住了')
    .toBe(byId('niumo').quotes.taunt);
});
