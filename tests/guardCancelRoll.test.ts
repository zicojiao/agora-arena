import { expect, test } from 'vitest';
import { hintFor } from '../src/ui/TouchLayer';
import touchSrc from '../src/ui/TouchLayer.tsx?raw';
import { createAi } from '../src/engine/ai';
import { STAGES } from '../src/data/stages';
import { Battle, GC_COST } from '../src/engine/battle';
import { CHARACTERS } from '../src/data/characters';
import { ARENA_MAX, ARENA_MIN, CORNERED, NULL_INPUT, type Dir } from '../src/engine/types';

// 防御取消·回避（ガードキャンセル前転）：格挡硬直中「防御 + 新按方向」花 50 气滚出去。
// 挨打方原来只有一条花气的出路（顶开），而格挡硬直里方向键完全是空的。
// 这一条换来的是**位置**而不是距离——滚到对手背后，把版边压制反过来。
//
// 夹具要点：挡下那一下之后紧接着是**顿帧**，tick 会提前返回。
// 只 tick 一次是看不到反应的（第一版就是这么写的，误以为机制没生效）——要连着送几帧。

/** 让 p1 挨一记并防住；返回 battle 与"还在格挡硬直里"的判据 */
function intoBlockstun(meter: number): Battle {
  const b = new Battle(structuredClone(CHARACTERS[0]), structuredClone(CHARACTERS[1]));
  b.p1.x = 420; b.p2.x = 500;
  b.p1.meter = meter;
  for (let f = 0; f < 40; f++) {
    b.tick({ ...NULL_INPUT, block: true }, { ...NULL_INPUT, attack: f === 0 });
    if (b.p1.state === 'block' && b.p1.stun > 0 && b.hitstop === 0) return b;
  }
  throw new Error('用例没成立：没有进入格挡硬直');
}

/** 在格挡硬直里按方向，连送 frames 帧；返回是否滚了出去 */
function tryRoll(b: Battle, frames = 8): boolean {
  for (let f = 0; f < frames; f++) {
    b.tick({ ...NULL_INPUT, block: true, move: 1 as Dir }, { ...NULL_INPUT });
    if (b.p1.state === 'roll') return true;
  }
  return false;
}

test('格挡硬直中「防御 + 新按方向」会花 50 气滚出去', () => {
  const b = intoBlockstun(GC_COST);
  const before = b.p1.meter;
  expect(tryRoll(b), '没有进入回避').toBe(true);
  expect(before - b.p1.meter, `花掉的气不是 ${GC_COST}`).toBe(GC_COST);
});

test('气不够就滚不出去，也不会白扣', () => {
  // 起始气要给得够低：格挡本身会涨气（实测硬直里 50→51），从 49 开始的话
  // 等按到方向时已经攒够 50 了，用例会自己失效
  const b = intoBlockstun(10);
  const before = b.p1.meter;
  expect(tryRoll(b), '气不够却还是滚了').toBe(false);
  expect(b.p1.meter, '气不够还被扣了').toBeGreaterThanOrEqual(before);
});

test('按住不放不会连滚两次——第二次要重新按', () => {
  // 「误触发」这个担心在现实里其实发生不了：从中立按住「防御 + 方向」，
  // idle 分支里那条**紧急回避**会先接管，人根本到不了格挡状态。
  // 真正要守的是另一件事：方向压着不放时，第二次挨打不该再自动滚一次。
  const b = intoBlockstun(100);
  expect(tryRoll(b), '用例没成立：第一次没滚出去').toBe(true);
  const afterFirst = b.p1.meter;
  // 方向一直压着，等他回到格挡再挨几下。
  // 判据用"气有没有再掉 50"而不是"状态是不是 roll"——第一次的回避还没走完时
  // 状态本来就还是 roll，按状态判会把第一次误当成第二次（第一版就是这么错的）。
  let secondSpend = false, prev = afterFirst;
  for (let f = 0; f < 200; f++) {
    b.tick({ ...NULL_INPUT, block: true, move: 1 as Dir }, { ...NULL_INPUT, attack: f % 20 === 0 });
    if (prev - b.p1.meter >= GC_COST) secondSpend = true;
    prev = b.p1.meter;
  }
  expect(secondSpend, '方向压着不放，后面又自动花了一次 50 气——那不是"新按下"').toBe(false);
});

test('滚出去是真的脱身——位移够大，而且中段有无敌', () => {
  const b = intoBlockstun(GC_COST);
  const x0 = b.p1.x;
  expect(tryRoll(b), '用例没成立：没滚出去').toBe(true);
  let sawInvuln = false, moved = 0;
  for (let f = 0; f < 60 && b.p1.state === 'roll'; f++) {
    b.tick({ ...NULL_INPUT }, { ...NULL_INPUT });
    if (b.p1.invuln > 0) sawInvuln = true;
    moved = Math.abs(b.p1.x - x0);
  }
  expect(sawInvuln, '整段回避一帧无敌都没有——那就不是脱身手段').toBe(true);
  expect(moved, `只挪了 ${Math.round(moved)}px，压制没解开`).toBeGreaterThan(40);
});

// 上面那条「按住不放」其实**分不出**边沿判定在不在：从中立按住「防御 + 方向」时，
// idle 分支里的紧急回避会先接管，人一直在滚、根本进不了格挡状态，两种判定都走不到。
// 真正有区别的情形是：**先只按防御进入格挡，再压上方向，然后挨打**——
// 这时方向是"早就压着的"，不该算作新按下。
test('先按防御、再压住方向、然后挨打——不该自动滚', () => {
  const b = new Battle(structuredClone(CHARACTERS[0]), structuredClone(CHARACTERS[1]));
  b.p1.x = 440; b.p2.x = 500; b.p1.meter = 100;
  // ① 只按防御，进入格挡状态
  for (let f = 0; f < 4; f++) b.tick({ ...NULL_INPUT, block: true }, { ...NULL_INPUT });
  expect(b.p1.state, '只按防御没有进入格挡').toBe('block');
  // ② 压上方向（此时在 block 状态，不会触发 idle 的紧急回避），再让对手打过来
  const before = b.p1.meter;
  let blocked = false;
  for (let f = 0; f < 40; f++) {
    b.tick({ ...NULL_INPUT, block: true, move: 1 as Dir }, { ...NULL_INPUT, attack: f === 4 });
    if (b.p1.state === 'block' && b.p1.stun > 0) blocked = true;
  }
  expect(blocked, '用例没成立：没有挡下那一击').toBe(true);
  expect(b.p1.state, '方向是早就压着的，却还是自动滚了出去').not.toBe('roll');
  expect(b.p1.meter, `方向早就压着，却被扣了气（${before} → ${b.p1.meter}）`).toBeGreaterThanOrEqual(before);
});

// 机制建好之后还要有人用、有人知道，否则等于不存在——这个项目在这条上反复栽过
//（防御取消、MAX 蓄气、吹飞攻击都当过"建好了没人用"）。
test('AI 会用回避这条出路，而且用在版边——不是只会顶开', () => {
  let push = 0, roll = 0;
  for (let si = 0; si < 4; si++) for (let a = 0; a < 4; a++) for (let b = 0; b < 4; b++) {
    if (a === b) continue;
    const bt = new Battle(structuredClone(CHARACTERS[a]), structuredClone(CHARACTERS[b]));
    const a1 = createAi(STAGES[si].ai, si * 101 + a * 13 + 1);
    const a2 = createAi(STAGES[si].ai, si * 57 + b * 7 + 3);
    for (let f = 0; f < 60 * 120 && bt.winner === null; f++) {
      bt.tick(a1(bt, 0), a2(bt, 1));
      for (const e of bt.events) {
        if (e.type !== 'guardCancel') continue;
        if ((e.who === 0 ? bt.p1.state : bt.p2.state) === 'roll') roll++; else push++;
      }
    }
  }
  // 实测 48 回合里 顶开 15 / 回避 7。两条都要有人走
  expect(push, 'AI 从来不用顶开').toBeGreaterThan(0);
  expect(roll, `AI 从来不用回避这条出路（顶开 ${push} 次、回避 ${roll} 次）`).toBeGreaterThan(0);
}, 900_000);

// 提示条：触发那一刻两条出路都能走，只讲一条等于把另一条藏起来。
// 判据用与 ai 同一个 CORNERED——此前 TouchLayer 里是字面量 140、ai.ts 里是常量，
// 同一条规则写了两份（这个项目在这类漂移上栽过四次，最近一次是残血线 DESPERATE_HP）。
test('被压在版边时教回避，场地中间时两条都讲', () => {
  const b = new Battle(structuredClone(CHARACTERS[0]), structuredClone(CHARACTERS[1]));
  const f = b.p1;
  f.state = 'block'; f.stun = 3; f.meter = 60;

  f.x = ARENA_MIN + CORNERED - 10;                 // 贴着版边
  const atWall = hintFor(f, 500);
  expect(atWall, `贴版边时没教回避：「${atWall}」`).toContain('推方向');
  expect(atWall, '贴版边还在讲顶开——顶开在墙边没用').not.toContain('顶开');

  f.x = (ARENA_MIN + ARENA_MAX) / 2;               // 场地中间
  const mid = hintFor(f, 500);
  expect(mid, `场地中间没讲顶开：「${mid}」`).toContain('顶开');
  expect(mid, '场地中间把回避那条藏起来了').toContain('推方向');
});

test('版边这条线只有一份——ai 与提示条用同一个常量', () => {
  const aiSrc = touchSrc;   // 这里查的是提示条那侧
  expect(aiSrc.includes('CORNERED'), 'TouchLayer 没有引用共用的 CORNERED').toBe(true);
  expect(/ARENA_MIN < 1\d\d|ARENA_MAX - me\.x < 1\d\d/.test(aiSrc),
    'TouchLayer 里还留着写死的版边距离').toBe(false);
});

// 挡完能不能直接出招，是一帧的事，但那一帧决定了防守方兑不兑现得了优势。
// 实测：挡下跳入之后帧数上守方有 +11 的优势，而**实际只领先 1 帧**
//（守方 12 帧才出招、跳入方 13 帧就自由了）——优势全花在"先松防再出招"这个流程税上，
// 反击成功率因此只有 19%。让格挡状态直接接 tryAttack 之后是 68%。
test('格挡硬直结束后可以直接出招，不必先松开防御键', () => {
  const b = new Battle(structuredClone(CHARACTERS[0]), structuredClone(CHARACTERS[1]));
  b.p1.x = 440; b.p2.x = 500;
  // 让 p1 挡下一击
  let blocked = false;
  for (let f = 0; f < 40 && !blocked; f++) {
    b.tick({ ...NULL_INPUT, block: true }, { ...NULL_INPUT, attack: f === 0 });
    if (b.p1.state === 'block' && b.p1.stun > 0) blocked = true;
  }
  expect(blocked, '用例没成立：没挡下那一击').toBe(true);
  // 硬直走完之后，**一直按着防御**的同时按攻击——不松防也该出得了招
  let attacked = -1;
  for (let f = 0; f < 30 && attacked < 0; f++) {
    b.tick({ ...NULL_INPUT, block: true, attack: true }, { ...NULL_INPUT });
    if (b.p1.state === 'attack') attacked = f;
  }
  expect(attacked, '按着防御键按攻击出不了招——挡完必须先松防，白花一帧').toBeGreaterThanOrEqual(0);
  // 注意：防御键按着 + 攻击 = 吹飞攻击（与 idle/run 一致），这里验的是"出得了招"
  expect(b.p1.move?.name, '按着防御出的不是吹飞攻击，与 idle/run 的规则不一致').toBe('吹飞攻击');
});
