import { expect, test } from 'vitest';
import { Battle, DOWN_STUN } from '../src/engine/battle';
import { CHARACTERS } from '../src/data/characters';
import { createAi } from '../src/engine/ai';
import { STAGES } from '../src/data/stages';
import { NULL_INPUT } from '../src/engine/types';
const press = (o: Partial<typeof NULL_INPUT> = {}) => ({ ...NULL_INPUT, ...o });
const C = CHARACTERS[0];
const mk = (gap = 70) => new Battle(structuredClone(C), structuredClone(C), 400, 400 + gap);

test('小跳 / 大跳：松开得早只跳一半高，按住不放才跳满', () => {
  const short = mk(500), tall = mk(500);
  short.tick(press({ jump: true }), press());              // 只给边沿，不按住
  tall.tick(press({ jump: true, jumpHeld: true }), press());
  for (let i = 0; i < 4; i++) tall.tick(press({ jumpHeld: true }), press());
  let sPeak = 0, tPeak = 0;
  for (let i = 0; i < 60; i++) {
    short.tick(press(), press()); tall.tick(press(), press());
    sPeak = Math.max(sPeak, short.p1.y); tPeak = Math.max(tPeak, tall.p1.y);
  }
  expect(sPeak, '小跳要真的低一截').toBeLessThan(tPeak * 0.75);
  expect(sPeak, '小跳也得离地').toBeGreaterThan(20);
});

test('必杀取消：普攻命中后可以直接取消进技能——没有它普攻和必杀永远接不上', () => {
  const b = mk();
  b.tick(press({ attack: true }), press());
  let cancelled = false;
  for (let i = 0; i < 30; i++) {
    // 命中之后立刻按技能键
    const hit = b.p1.hitCount > 0;
    b.tick(press(hit ? { skill1: true } : {}), press());
    if (b.p1.move?.slot === 's1') { cancelled = true; break; }
  }
  expect(cancelled, '命中后按技能键没有取消成功').toBe(true);
});

test('没命中就不能取消——空挥也能取消的话，必杀就成了无风险起手', () => {
  const b = mk(600); // 离得远，普攻打空
  const n1 = C.moves.n1;
  const total = n1.startup + n1.active + n1.recovery;
  b.tick(press({ attack: true }), press());
  let cancelled = false;
  // 只在 n1 自己的帧窗内检查。窗口之外按技能键出招是**正常起手**，不是取消——
  // 第一版没区分这两者，把正常起手当成了取消失败
  for (let i = 0; i < total - 2; i++) {
    b.tick(press({ skill1: true }), press());
    if (b.p1.move?.slot === 's1') cancelled = true;
  }
  expect(b.p1.hitCount, '样本作废：这一拳本该打空').toBe(0);
  expect(cancelled, '空挥不该能取消').toBe(false);
});

test('受身：倒地窗口内按键可以翻滚起身，明显快过干等', () => {
  const slow = mk(), fast = mk();
  for (const b of [slow, fast]) {
    // 用 s3 而不是 s1：击倒改成招式属性之后，哪吒三记必杀里只有 s3 打得倒人
    b.tick(press({ skill3: true }), press());
    for (let i = 0; i < 60 && b.p2.state !== 'down'; i++) b.tick(press(), press());
    expect(b.p2.state, '样本作废：没把对手打倒').toBe('down');
  }
  let slowFrames = 0, fastFrames = 0;
  for (let i = 0; i < 120; i++) { slow.tick(press(), press()); if (slow.p2.state === 'down') slowFrames++; }
  for (let i = 0; i < 120; i++) { fast.tick(press(), press({ block: true })); if (fast.p2.state === 'down') fastFrames++; }
  expect(fastFrames, `受身 ${fastFrames} 帧应明显短于干等 ${slowFrames} 帧`).toBeLessThan(slowFrames * 0.6);
});

test('蓄气：按住防御+大招键能攒气，攒满进 MAX 模式，MAX 期间伤害提升', () => {
  const b = mk();
  // 输入从「蹲+防」改成了「防+大招键」：蹲+防现在是蹲防（上下段防御），不能再兼职蓄气。
  // 进 MAX 会扣掉 50 气，所以不能断言"蓄气之后气槽更高"——那是改动前的账。
  // 真正的可观察量是：蓄够了会进 MAX
  let entered = false;
  for (let i = 0; i < 400; i++) {
    b.tick(press({ block: true, super: true }), press());
    if (b.p1.maxMode > 0) entered = true;
  }
  expect(entered, '一直蓄气应该能进 MAX').toBe(true);

  // MAX 下同一招应打得更疼
  const plain = mk(), maxed = mk();
  maxed.p1.maxMode = 300;
  for (const b2 of [plain, maxed]) for (let i = 0; i < 40; i++) b2.tick(press(i === 0 ? { skill1: true } : {}), press());
  expect(C.hp - maxed.p2.hp, 'MAX 状态该打得更疼').toBeGreaterThan(C.hp - plain.p2.hp);
});

// 用户反馈「打倒应该不能马上起」。查出来是受身太松：只要**按着**攻击/防御就生效，
// 而 AI 是一直按着的，于是每次击倒都自动受身，等于击倒不存在。
// KOF97 的受身要精确输入，且大招/投技/吹飞这类硬直击倒根本不能受身。

test('一直按着攻击键不会自动受身——受身必须是这一帧新按下', () => {
  const b = mk();
  // 先干净地把对手打倒（对手按攻击会反击，打不成击倒，那样测的就不是这件事）
  for (let i = 0; i < 60 && b.p2.state !== 'down'; i++) b.tick(press(i === 0 ? { skill3: true } : {}), press());
  expect(b.p2.state, '样本作废：没打倒').toBe('down');
  // 倒地之后才开始「一直按着」——这正是 AI 的行为
  b.p2.techPrev = true; // 模拟倒地前就已经按着（AI 的攻击键在决策窗内是持续的）
  let downFrames = 0;
  for (let i = 0; i < 120; i++) { b.tick(press(), press({ attack: true })); if (b.p2.state === 'down') downFrames++; }
  expect(downFrames, `一直按着仍然受了身（只躺了 ${downFrames} 帧）`).toBeGreaterThan(DOWN_STUN * 0.8);
});

test('硬直击倒不能受身：吹飞攻击打倒后必须躺满', () => {
  const b = mk();
  for (let i = 0; i < 40 && b.p2.state !== 'down'; i++) b.tick(press(i === 0 ? { blowback: true } : {}), press());
  expect(b.p2.state, '样本作废：吹飞没打倒').toBe('down');
  expect(b.p2.techable, '吹飞该是硬直击倒').toBe(false);
  let downFrames = 0;
  // 精确地在窗口内新按一次——软击倒会起来，硬直击倒不会
  for (let i = 0; i < 120; i++) { b.tick(press(), press({ attack: i === 3 })); if (b.p2.state === 'down') downFrames++; }
  expect(downFrames, `硬直击倒被受身逃掉了（只躺了 ${downFrames} 帧）`).toBeGreaterThan(DOWN_STUN * 0.8);
});

test('软击倒仍然可以受身——不能把受身一并砍掉，那样挨打方又没出口了', () => {
  const b = mk();
  for (let i = 0; i < 40 && b.p2.state !== 'down'; i++) b.tick(press(i === 0 ? { skill1: true } : {}), press());
  expect(b.p2.techable, '普通技能该是软击倒').toBe(true);
  let downFrames = 0;
  for (let i = 0; i < 120; i++) { b.tick(press(), press({ attack: i === 3 })); if (b.p2.state === 'down') downFrames++; }
  expect(downFrames, '软击倒该能受身起身').toBeLessThan(40);
});

// 用户反馈「放大招时对方还能反击，把大招打断」。查出来是 startMove 里 sp100 的
// invuln = 60 —— 那是 startup 还只有 16 帧时定的常数；大招拉到 600 帧后 startup 是 110，
// 第 60 帧之后无敌就没了，对手正好在起手后半段打断。与 KO_SETTLE_DELAY 是同一类故障：
// 常数按旧帧数写死，帧数一改就静默失效，且没有任何报错。
test('大招起手全程无敌，覆盖到判定生效为止——不会在起手后半段被打断', () => {
  for (const c of CHARACTERS) {
    for (const slot of ['sp50', 'sp100'] as const) {
      const b = new Battle(structuredClone(c), structuredClone(c), 400, 470);
      b.p1.meter = slot === 'sp100' ? 100 : 50;
      // 必须把对手压到残血才取得到**完整版**（十秒演出，startup 110）。
      // 用满血对手测的是三秒短版（startup 55），而 55 < 旧常数 60，正好被盖住——
      // 第一版就是这么写的，对这个 bug 完全不敏感。用户遇到的正是"对方将死时"，
      // 也就是完整版那条路径。
      b.p2.hp = 5;
      b.tick(press({ super: true }), press());
      const m = b.p1.move!;
      expect(m.isBrief, `${c.name} ${slot} 该走完整版`).toBeFalsy();
      let brokenAt = -1;
      for (let i = 0; i < m.startup; i++) {
        // 对手每隔几帧就打一拳，全程试图打断
        b.tick(press(), press({ attack: i % 6 === 0 }));
        if (b.p1.state !== 'attack' && brokenAt < 0) brokenAt = i;
      }
      expect(brokenAt, `${c.name} ${slot} 在起手第 ${brokenAt} 帧被打断了`).toBe(-1);
    }
  }
});

test('判定生效之后不再无敌——起手无敌不等于全程无敌', () => {
  const c = CHARACTERS[0];
  const b = new Battle(structuredClone(c), structuredClone(c), 400, 470);
  b.p1.meter = 100;
  b.p2.hp = 5;
  b.tick(press({ super: true }), press());
  const m = b.p1.move!;
  for (let i = 0; i < m.startup + 30; i++) b.tick(press(), press());
  expect(b.p1.invuln, '判定生效一段时间后无敌应该已经用完').toBe(0);
});

// 实测发现连段系统建好了却没有任何东西在用：1057 次进攻里 1040 次是单段，
// 必杀取消 0 次、普攻续段 0 次。原因是 AI 每个决策窗只按一次攻击键，而续段/取消
// 要求招式**命中之后**再按一次。AI 不会连段，玩家也就永远看不到「原来可以这么打」。
test('AI 会连段与取消——连段系统不能只存在于代码里', () => {
  let chains = 0, cancels = 0;
  for (let seed = 0; seed < 8; seed++) {
    const a = structuredClone(CHARACTERS[seed % 4]);
    const b = new Battle(a, structuredClone(CHARACTERS[(seed + 1) % 4]));
    const ai1 = createAi(STAGES[2].ai, seed * 13 + 1), ai2 = createAi(STAGES[3].ai, seed * 7 + 3);
    let prev = '';
    for (let f = 0; f < 60 * 90 && b.winner === null; f++) {
      b.tick(ai1(b, 0), ai2(b, 1));
      const cur = b.p1.state === 'attack' ? b.p1.move!.slot : '';
      if (prev.startsWith('n') && cur.startsWith('s') && b.p1.stateFrame <= 1) cancels++;
      if (prev === 'n1' && cur === 'n2') chains++;
      prev = cur;
    }
  }
  expect(cancels, 'AI 一次必杀取消都没做出来').toBeGreaterThan(5);
  expect(chains, 'AI 一次普攻续段都没做出来').toBeGreaterThan(0);
});
