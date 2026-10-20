import { expect, test } from 'vitest';
import { Battle, TAUNT_DRAIN, TAUNT_SAFE, canTaunt } from '../src/engine/battle';
import { CHARACTERS } from '../src/data/characters';
import { STAGES } from '../src/data/stages';
import { createAi } from '../src/engine/ai';
import { NULL_INPUT } from '../src/engine/types';
import { validateCharacter } from '../src/data/validate';

// 挑発（KOF97 的挑衅）：削对手的气，不是纯表演。
// 这个游戏最吓人的就是 BOSS 的超必杀，削气是有意义的选择；而它 47 帧的收招意味着
// 「起身压制」与「嘲讽」二选一——这才是一个选项，不是一个免费按键。

const taunt = { ...NULL_INPUT, block: true, jump: true };

/** 把对手挪到指定距离，双方都站着 */
function stage(gap: number) {
  const b = new Battle(structuredClone(CHARACTERS[0]), structuredClone(CHARACTERS[1]));
  b.p2.x = b.p1.x + gap;
  b.p2.meter = 60;
  return b;
}

test('够不着的时候挑衅削对手的气', () => {
  const b = stage(TAUNT_SAFE + 40);
  const before = b.p2.meter;
  b.tick(taunt, { ...NULL_INPUT });
  expect(b.p2.meter, `隔着 ${TAUNT_SAFE + 40} 没削到气`).toBe(before - TAUNT_DRAIN);
  expect(b.p1.state, '没进出招状态').toBe('attack');
  expect(b.p1.move?.name, '头顶浮的不是这个角色自己的挑衅词').toBe(CHARACTERS[0].quotes.taunt);
});

test('对手躺着也能挑衅——起身压制与嘲讽二选一', () => {
  const b = stage(80);
  b.p2.state = 'down'; b.p2.stateFrame = 5;
  const before = b.p2.meter;
  b.tick(taunt, { ...NULL_INPUT });
  expect(b.p2.meter, '对手正躺着却挑衅不了').toBe(before - TAUNT_DRAIN);
});

test('对手站在打得着的地方时按不出来——不能变成送人头的按键', () => {
  const b = stage(120);
  const before = b.p2.meter;
  b.tick(taunt, { ...NULL_INPUT });
  expect(b.p2.meter, '贴脸也能挑衅').toBe(before);
  // 哑火之后应当照常进防御：这个组合本来就是「防御中想跳」很容易搓出来的
  expect(b.p1.state, '哑火之后连防御都没进，等于吃掉了一次防御输入').toBe('block');
});

test('气削到 0 就不再往下扣', () => {
  const b = stage(TAUNT_SAFE + 40);
  b.p2.meter = 4;
  b.tick(taunt, { ...NULL_INPUT });
  expect(b.p2.meter).toBe(0);
});

test('挑衅打不到人——判定框是空的', () => {
  const b = stage(TAUNT_SAFE + 40);
  const hp = b.p2.hp;
  for (let i = 0; i < 60; i++) b.tick(i === 0 ? taunt : { ...NULL_INPUT }, { ...NULL_INPUT });
  expect(b.p2.hp, '挑衅把人打伤了').toBe(hp);
});

test('挑衅是有代价的：整段收招里动不了', () => {
  const b = stage(TAUNT_SAFE + 40);
  b.tick(taunt, { ...NULL_INPUT });
  const x0 = b.p1.x;
  // 挑衅途中拼命想往前走
  for (let i = 0; i < 30; i++) b.tick({ ...NULL_INPUT, move: 1 }, { ...NULL_INPUT });
  expect(b.p1.x, '挑衅途中还能走动，那就没有代价了').toBe(x0);
  expect(b.p1.state).toBe('attack');
});

// 真实的按法是**先按住格挡、再把摇杆推上去**（触屏与键盘都只能这么按：
// 摇杆和按键在两只手上，同一帧按下是巧合不是操作）。而按住格挡的那一刻人已经进了
// block 状态——只认 idle/walk 的话，这个招在实机上按不出来，只有单元测试里
// 「同一帧同时按」那种写法才触发得了。差一点就这么发出去了。
test('先按住格挡再推上——真实按法必须出得来', () => {
  const b = stage(TAUNT_SAFE + 40);
  for (let i = 0; i < 10; i++) b.tick({ ...NULL_INPUT, block: true }, { ...NULL_INPUT });
  expect(b.p1.state, '用例没成立：按住格挡却没进 block').toBe('block');
  const before = b.p2.meter;
  b.tick(taunt, { ...NULL_INPUT });
  expect(b.p2.meter, '先防后推上按不出挑衅——这才是玩家实际的按法').toBe(before - TAUNT_DRAIN);
});

// 格挡中挑衅 = 主动撤防。闸门（对手倒地/够不着）已经保证了这一刻挨不着打，
// 所以撤防没有代价；而贴脸格挡时推上仍然必须哑火，否则就成了压力下的自杀键
test('贴脸格挡时推上不会撤防去挑衅', () => {
  const b = stage(120);
  for (let i = 0; i < 10; i++) b.tick({ ...NULL_INPUT, block: true }, { ...NULL_INPUT });
  const before = b.p2.meter;
  b.tick(taunt, { ...NULL_INPUT });
  expect(b.p2.meter, '被压着还能挑衅').toBe(before);
  expect(b.p1.state, '哑火之后没继续防').toBe('block');
});

test('闸门是纯函数，几种情形都守得住', () => {
  expect(canTaunt('idle', 999, 'idle'), '远距离站着不让挑衅').toBe(true);
  expect(canTaunt('walk', 40, 'down'), '对手躺着不让挑衅').toBe(true);
  expect(canTaunt('block', 999, 'idle'), '格挡中不让挑衅——真实按法正是从格挡里出').toBe(true);
  expect(canTaunt('idle', 100, 'idle'), '贴脸也让挑衅').toBe(false);
  expect(canTaunt('block', 100, 'idle'), '贴脸格挡也让挑衅').toBe(false);
  expect(canTaunt('jump', 999, 'idle'), '空中也能挑衅').toBe(false);
  expect(canTaunt('attack', 999, 'idle'), '出招途中也能挑衅').toBe(false);
});

test('四个角色各有一句挑衅词，校验器守着', () => {
  const lines = new Set(CHARACTERS.map(c => c.quotes.taunt));
  expect(lines.size, '有人共用同一句挑衅词').toBe(CHARACTERS.length);
  for (const c of CHARACTERS) expect(validateCharacter(c), `${c.name} 数据不合法`).toEqual([]);
  // 缺了要报，太长也要报（头顶浮字比结算页窄）
  const noTaunt = structuredClone(CHARACTERS[0]);
  (noTaunt.quotes as { taunt: string }).taunt = '';
  expect(validateCharacter(noTaunt).join(''), '缺挑衅词没被挡下').toContain('缺挑衅台词');
  const long = structuredClone(CHARACTERS[0]);
  long.quotes.taunt = '一'.repeat(11);
  expect(validateCharacter(long).join(''), '超长挑衅词没被挡下').toContain('过长');
});

// AI 不会挑衅：它的权重表里没有这个动作，也从不同时送出 block+jump。
// 这条不是"防止 AI 变强/变弱"，是**防止它悄悄变了**——挑衅有 47 帧收招，
// AI 一旦开始按，四关难度会跟着漂，而胜率那几条断言的容差看不出这种漂移的来源。
test('AI 从不挑衅——它的难度不会被这个机制悄悄改掉', () => {
  let taunts = 0, frames = 0;
  for (let si = 0; si < STAGES.length; si++) {
    const st = STAGES[si];
    const b = new Battle(structuredClone(CHARACTERS[si % 4]),
      structuredClone(CHARACTERS.find(c => c.id === st.bossId)!));
    const a1 = createAi(STAGES[1].ai, si * 13 + 1), a2 = createAi(st.ai, si * 7 + 3);
    for (let f = 0; f < 60 * 60 && b.winner === null && !b.timeUp; f++) {
      const i1 = a1(b, 0), i2 = a2(b, 1);
      if ((i1.block && i1.jump) || (i2.block && i2.jump)) taunts++;
      b.tick(i1, i2);
      frames++;
    }
  }
  expect(frames, '用例没成立：一帧都没跑').toBeGreaterThan(1000);
  expect(taunts, `AI 送出了 ${taunts} 次 防御+上`).toBe(0);
});
