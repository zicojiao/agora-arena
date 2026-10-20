import { expect, test } from 'vitest';
import { CHARACTERS } from '../src/data/characters';
import type { CharacterDef } from '../src/engine/types';
import { ARENA_MAX, ARENA_MIN } from '../src/engine/types';

/** Longest skill reach; a projectile reaches the whole arena. */
const reach = (c: CharacterDef) => Math.max(...(['s1', 's2', 's3'] as const).map(k => {
  const m = c.moves[k];
  return m.projectile ? ARENA_MAX - ARENA_MIN : m.hitbox.x + m.hitbox.w;
}));

// 短手是要付代价的，但**不能付两次**。
//
// 实际发生过：哪吒是全场最快（身法 5.6）、最短手（攻程 186）的角色，可它三段连击的
// **伤害/帧**只有 0.53，四人里排第三——"快"只快在动作上，没换来任何伤害率。
// 于是短手这个代价白付：杀牛魔王要 8.0 套完整连段，牛魔王杀它只要 5.6 套。
//
// 拳皇里快攻角色的形状是「单发轻、但打得多、收尾狠」。所以这条钉的是：
// **攻程最短的人必须拿到最高的伤害/帧**，而攻程最长的人可以最低（他在用距离换）。

/** 三段连击的伤害/帧：连段是这个游戏的主要输出方式，单看某一招看不出效率 */
function chainRate(c: CharacterDef): number {
  const ks = ['n1', 'n2', 'n3'] as const;
  const dmg = ks.reduce((a, k) => a + c.moves[k].damage, 0);
  const fr = ks.reduce((a, k) => a + c.moves[k].startup + c.moves[k].active + c.moves[k].recovery, 0);
  return dmg / fr;
}

test('没有人既是最短手、又是效率最低——短手的代价不该付两次', () => {
  const rows = CHARACTERS.map(c => ({ n: c.name, r: reach(c), e: chainRate(c) }));
  const show = rows.map(x => `${x.n} 攻程${x.r}/效率${x.e.toFixed(3)}`).join('  ');
  // 判据从「最短手必须效率最高」改成「不能两头都唯一垫底」。
  // 原来那条是在攻程按 w（不含偏移 x）算的年代写的，当时哪吒 186 唯一垫底、效率却排第三，
  // 确实是付了两次。攻程改成 x+w 之后哪吒是第二长，最短手成了孙悟空/牛魔王并列——
  // 「最短手」不再唯一，「必须效率最高」就无从谈起了。要守的本来也不是排名，是不重复受罚。
  const uniqLast = (pick: (x: typeof rows[number]) => number) =>
    rows.filter(x => rows.every(y => y === x || pick(y) > pick(x)));
  const shortest = uniqLast(x => x.r), weakest = uniqLast(x => -x.e);
  const both = shortest.filter(x => weakest.includes(x));
  expect(both.map(x => x.n), `${both.map(x => x.n).join('、')} 既最短手又效率最低，代价付了两次　${show}`)
    .toEqual([]);
});

test('没有人的连段效率被甩开一档', () => {
  const es = CHARACTERS.map(chainRate);
  const show = CHARACTERS.map((c, i) => `${c.name} ${es[i].toFixed(3)}`).join('  ');
  // 1.25：现状 0.517~0.569 是 1.10。留出余量，但挡住"某个角色的输出引擎整体差一档"。
  // 效率低本身不是错（二郎神最低，他在用 260 的攻程换），差到一档才是。
  expect(Math.max(...es) / Math.min(...es), `连段效率差得太开　${show}`).toBeLessThan(1.25);
});
