import { expect, test } from 'vitest';
import { Battle } from '../src/engine/battle';
import { CHARACTERS } from '../src/data/characters';
import { NULL_INPUT } from '../src/engine/types';

// 必杀取消进大招（拳皇的スーパーキャンセル）。没有它的时候，气槽只有一条用法：
// 普攻第二段接大招。有了它，n1→n2→必杀→大招 成立，连段深度才有上限可言。

/** 按给定路线打一套，返回段数与伤害。对手全程按防御——站着不动的木桩测不出"连段锁没锁住" */
function combo(c: typeof CHARACTERS[number], plan: (hits: number) => Partial<typeof NULL_INPUT>, meter = 100) {
  const b = new Battle(structuredClone(c), structuredClone(c));
  b.p2.x = b.p1.x + 60;
  b.p1.meter = meter;
  const hp0 = b.p2.hp;
  let hits = 0, blocked = 0;
  for (let f = 0; f < 800 && b.winner === null; f++) {
    b.tick({ ...NULL_INPUT, ...plan(hits) }, { ...NULL_INPUT, block: true });
    for (const e of b.events) if (e.type === 'hit') { hits++; if (e.blocked) blocked++; }
  }
  return { hits, dmg: hp0 - b.p2.hp, blocked };
}

test('必杀命中后能取消进大招，而且比直接接大招更赚', () => {
  for (const c of CHARACTERS) {
    const direct = combo(c, h => (h >= 2 ? { super: true } : { attack: true }));
    const viaSkill = combo(c, h => (h >= 3 ? { super: true } : h >= 2 ? { skill1: true } : { attack: true }));
    expect(viaSkill.dmg, `${c.name} 走必杀这条路 ${viaSkill.dmg} 伤，不如直接接大招的 ${direct.dmg}——那这条路没人会走`)
      .toBeGreaterThan(direct.dmg);
    // 全程锁住：多绕一段必杀，对手也不该挡下更多
    expect(viaSkill.blocked, `${c.name} 走必杀这条路被挡了 ${viaSkill.blocked} 段，连段断了`).toBeLessThanOrEqual(1);
    // 满气一套不该打掉半血以上
    expect(viaSkill.dmg / c.hp, `${c.name} 满气一套打掉 ${Math.round(viaSkill.dmg / c.hp * 100)}% 血，太多了`)
      .toBeLessThan(0.5);
  }
});

// 下面两条守的是「谁能取消谁」这条规则本身，不是"会不会无限"——
// 写第一版时我把理由写成了无限，红检当场证明那是错的：技能有 240-360 帧冷却，
// 互相取消最多串起三记就全进冷却；大招则被气槽卡住（放完就没气了）。
// 真正的理由是伤害与设计：技能能互相取消的话，一套满气连段直接翻倍。

/** 按住 hold 键，看第一招 first 有没有在**跑完自己的帧数之前**被换掉。
 * 这是"取消"与"正常接下一招"的唯一区别——招式打完再出下一记，任何游戏都允许。 */
function cancelledEarly(c: typeof CHARACTERS[number], first: 'skill1' | 'super', hold: Record<string, boolean>) {
  const b = new Battle(structuredClone(c), structuredClone(c));
  b.p2.x = b.p1.x + 60;
  b.p1.meter = 100;
  let prevId = '', prevFrame = -1, total = 0, cancelled = false;
  for (let f = 0; f < 400 && b.winner === null; f++) {
    b.p1.meter = 100;   // 每帧补满：不补的话这条测的就成了气槽，而不是取消规则
    b.tick({ ...NULL_INPUT, [first]: f === 0, ...hold }, { ...NULL_INPUT, block: true });
    const m = b.p1.move;
    if (!m || b.p1.state !== 'attack') { prevId = ''; prevFrame = -1; continue; }
    // 上一招还剩至少一帧没走完才算"被取消"。写成 prevFrame < total 会有边界假阳性：
    // 自然衔接时上一招正好停在 total-1，下一招在同一 tick 起手，那不是取消。
    const incomplete = prevFrame >= 0 && prevFrame + 1 < total;
    // 两种取消都要认：换成别的招（id 变了），以及**同一招从头重启**（stateFrame 倒退）。
    // 只看 id 的话，大招自我取消就漏掉了——招还是那一招，只是又从第 0 帧开始演。
    // 倒退要用严格小于：顿帧那几帧 stateFrame 不推进，写 <= 会把顿帧误判成重启。
    if (incomplete && (m.id !== prevId || b.p1.stateFrame < prevFrame)) cancelled = true;
    prevId = m.id; prevFrame = b.p1.stateFrame; total = m.startup + m.active + m.recovery;
  }
  return cancelled;
}

test('技能之间不能互相取消——只有普攻起手才接得上必杀', () => {
  for (const c of CHARACTERS) {
    expect(cancelledEarly(c, 'skill1', { skill2: true }),
      `${c.name}: s1 还没跑完就被 s2 换掉了——技能之间能互相取消，一套满气连段会直接翻倍`).toBe(false);
  }
});

test('大招不能自我取消——把气槽因素排除掉之后仍然成立', () => {
  for (const c of CHARACTERS) {
    expect(cancelledEarly(c, 'super', { super: true }),
      `${c.name}: 大招还没演完就被下一记大招顶掉了，演出会被反复重启`).toBe(false);
  }
});
