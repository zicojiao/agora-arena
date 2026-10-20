import { expect, test } from 'vitest';
import { Battle } from '../src/engine/battle';
import { createAi } from '../src/engine/ai';
import { CHARACTERS } from '../src/data/characters';
import { STAGES } from '../src/data/stages';
import { hintFor, nextHint } from '../src/ui/TouchLayer';
import { press } from './helpers';

// 提示条是玩家发现这十几个系统的主要路径。实测过一次真实的浪费：
// 兜底只覆盖 idle/walk，58% 的帧什么都不显示（出招、受击、跑、跳都空着），
// 提示条一直在闪；而唯一的常驻提示把三个系统挤在一行里，密到没人会读。

test('任何状态都有提示——提示条不该一半时间是空的', () => {
  const seen = new Set<string>();
  let blank = 0, frames = 0;
  for (let si = 0; si < 4; si++) for (let seed = 0; seed < 6; seed++) {
    const st = STAGES[si];
    const b = new Battle(structuredClone(CHARACTERS[seed % CHARACTERS.length]),
      structuredClone(CHARACTERS.find(c => c.id === st.bossId)!));
    const a1 = createAi(STAGES[1].ai, seed * 13 + 1), a2 = createAi(st.ai, seed * 7 + 3);
    for (let f = 0; f < 60 * 30 && b.winner === null && !b.timeUp && !b.doubleKo; f++) {
      b.tick(a1(b, 0), a2(b, 1));
      frames++;
      const h = hintFor(b.p1, b.frame);
      if (!h) blank++;
      seen.add(b.p1.state);
    }
  }
  expect(frames).toBeGreaterThan(1000);
  expect(blank, `${Math.round(blank / frames * 100)}% 的帧提示条是空的`).toBe(0);
  // 用例前提：真的走遍了各种状态，不是只在 idle 里打转
  expect(seen.size, `只出现了 ${seen.size} 种状态，样本不够`).toBeGreaterThan(5);
});

test('空闲提示是轮播的——不是一句长的挤三个系统', () => {
  const me = new Battle(structuredClone(CHARACTERS[0]), structuredClone(CHARACTERS[0])).p1;
  const tips = new Set<string>();
  for (let frame = 0; frame < 60 * 60; frame += 30) tips.add(hintFor(me, frame));
  expect(tips.size, `一整局只轮到 ${tips.size} 条提示`).toBeGreaterThanOrEqual(4);
  // 每条都要短到一眼读完
  for (const t of tips) expect(t.length, `「${t}」太长了`).toBeLessThanOrEqual(24);
  // 同一帧永远给同一条：轮播挂逻辑帧，不挂墙钟
  expect(hintFor(me, 500)).toBe(hintFor(me, 500));
});

// 陪练场的气是每帧灌满的（App 的 onTick），不是打出来的。跟气有关的两条提示于是都失真：
// 开场那条说「上一回合攒下的」——陪练场没有上一回合；「气槽已满」则恒为真，
// 而它的级别压过轮播，把提示条**永久钉死在同一句**上。浏览器里一眼看到的就是这个。
test('陪练场不拿灌满的气说事——提示条得继续轮播', () => {
  const c = CHARACTERS[0];
  const b = new Battle(structuredClone(c), structuredClone(c));
  b.p1.meter = 100;                    // 陪练场每帧都会灌回 100
  b.p1.x = 480;                        // 场地中间，别撞上版边那条
  expect(hintFor(b.p1, 30, true), '陪练场哪来的上一回合').not.toContain('带过来');

  // 真正的损失在这里：一句钉死之后，别的系统就再也轮不到了
  let cur = { text: '', left: 0 };
  const seen = new Set<string>();
  for (let f = 0; f < 60 * 60; f++) {
    cur = nextHint(cur, hintFor(b.p1, f, true));
    seen.add(cur.text);
  }
  expect(seen.size, `陪练场待了一分钟只显示过 ${seen.size} 条提示：「${[...seen].join('」「')}」`)
    .toBeGreaterThanOrEqual(4);

  // 正式对局里这两条仍然要说：关掉的是陪练场，不是机制本身
  expect(hintFor(b.p1, 30), '正式对局带满气开场却不说明').toContain('带过来');
  expect(hintFor(b.p1, 600), '正式对局气满了却不提醒').toContain('气槽已满');
});

// 挑衅的窗口几乎全在「把对手打倒之后」那几十帧里，而那正是玩家在想"现在该干嘛"的时刻。
// 放进轮播就成了随机出现的说明书；教学要落在按得出来的那一刻——**也只在按得出来的时候**。
test('对手倒地才教挑衅，而且冷却没好时不教——提示不能骗人', () => {
  const c = CHARACTERS[0];
  const b = new Battle(structuredClone(c), structuredClone(c));
  b.p1.x = 480; b.p2.x = 540;          // 贴脸：只有"对手倒地"这一条能开门
  b.p2.state = 'down'; b.p2.stateFrame = 5;
  expect(hintFor(b.p1, 300, false, b.p2), '对手倒着却没教挑衅').toContain('挑衅');

  // 冷却里按不出来。这时候还在教，就是在叫玩家按一个不响的键
  b.p1.cooldowns[`${c.id}_taunt`] = 90;
  expect(hintFor(b.p1, 300, false, b.p2), '冷却没好还在教挑衅').not.toContain('挑衅');

  // 对手站着且贴脸：闸门不开，同样不该教
  b.p1.cooldowns[`${c.id}_taunt`] = 0;
  b.p2.state = 'idle';
  expect(hintFor(b.p1, 300, false, b.p2), '贴脸站着也在教挑衅').not.toContain('挑衅');

  // 不传 foe 时（老调用点/测试）行为不变，不会崩
  expect(hintFor(b.p1, 300)).not.toContain('挑衅');
});

test('情境提示压过轮播——该教受身的时候不能还在讲跑', () => {
  const c = CHARACTERS[0];
  const b = new Battle(structuredClone(c), structuredClone(c));
  // 倒地窗口内：必须是受身提示，不管轮播轮到哪一条
  b.p1.state = 'down'; b.p1.stateFrame = 3;
  for (const frame of [0, 200, 400, 900]) {
    expect(hintFor(b.p1, frame), '倒地时没在教受身').toContain('受身');
  }
  // 蹲防时讲上下段
  b.p1.state = 'block'; b.p1.stun = 0; b.p1.lowGuard = true;
  expect(hintFor(b.p1, 0)).toContain('蹲防');
  b.p1.lowGuard = false;
  expect(hintFor(b.p1, 0)).toContain('站防');
});

test('被逼到版边才教回避——场地中间不占这条通道', () => {
  const c = CHARACTERS[0];
  const b = new Battle(structuredClone(c), structuredClone(c));
  b.p1.state = 'idle';
  b.p1.x = 480;                       // 场地中间
  expect(hintFor(b.p1, 0)).not.toContain('回避');
  b.p1.x = 60;                        // 贴左墙
  expect(hintFor(b.p1, 0), '被逼到墙角却没教回避').toContain('回避');
});

// 被压在版边的人**多半正举着防御**——这条提示此前只认 idle/walk，
// 于是最需要它的姿势恰好读不到，落到通用的「站防/蹲防」上。
// 这和回避这条机制当初犯的是同一个错（只写在 idle/walk 分支里）：机制补好了，
// 教学不跟着补，等于玩家仍然不知道有这条出路。
test('举着防御被压在版边，也要教回避——那才是被压制时最常见的姿势', () => {
  const c = CHARACTERS[0];
  const b = new Battle(structuredClone(c), structuredClone(c));
  b.p1.state = 'block';
  b.p1.stun = 0;
  b.p1.x = 480;
  expect(hintFor(b.p1, 0), '场地中间举着防御不该占用这条').not.toContain('回避');
  b.p1.x = 60;
  expect(hintFor(b.p1, 0), '举着防御被逼到墙角却只讲站防/蹲防').toContain('回避');
});

test('格挡硬直里不教免费回避——那一刻按不出来', () => {
  const c = CHARACTERS[0];
  const b = new Battle(structuredClone(c), structuredClone(c));
  b.p1.state = 'block';
  b.p1.x = 60;                        // 贴墙
  b.p1.stun = 5;                      // 正在格挡硬直里
  b.p1.meter = 0;                     // 也没气走防御取消
  // 免费回避在引擎里排在 `stun > 0` 之后，此刻确实出不来——提示不能教按不出来的东西
  expect(hintFor(b.p1, 0), '格挡硬直里教了按不出来的免费回避').not.toContain('防御 + 方向 = 回避');
});

// 倒地那条提示原来有两个毛病，都是"提示本身在骗人"：
//   ① 判据 stateFrame <= 14 与受身窗口一样长（0.23 秒）——一条讲反应窗口的提示，
//      显示时长正好等于那个窗口，读到时已经错过了
//   ② 不看 techable，而实测 56% 的击倒是硬直击倒，那时它还在叫玩家按键，按了没反应

// 挑衅有两个窗口（见 canTaunt）：对手倒地，或者隔得够远。
// 提示条此前只教倒地那一种，而那一种是**要赌的**——挑衅 47 帧、倒地才 52 帧，
// 对手受身就能提前爬起来反打（AI 抽中这一手时实测被打出过 70% 血的连段）。
// 隔得远那一支够不着、是白削 10 气，反倒一直没教。
test('隔得远也教挑衅——那是白削气的那一种，不是要赌的那一种', () => {
  const c = CHARACTERS[0];
  const b = new Battle(structuredClone(c), structuredClone(c));
  b.p1.state = 'idle'; b.p2.state = 'idle';
  b.p1.x = 100; b.p2.x = 860;                 // 隔了大半个场子（> TAUNT_SAFE）
  expect(hintFor(b.p1, 0, false, b.p2), '够不着的距离上没教挑衅').toContain('挑衅');
  // 冷却没好就不该教——提示不能教一个此刻按不出来的东西
  b.p1.cooldowns[`${c.id}_taunt`] = 60;
  expect(hintFor(b.p1, 0, false, b.p2), '挑衅还在冷却里却照教').not.toContain('挑衅');
});

test('走得近了就不再教挑衅——那时按了没反应', () => {
  const c = CHARACTERS[0];
  const b = new Battle(structuredClone(c), structuredClone(c));
  b.p1.state = 'idle'; b.p2.state = 'idle';
  b.p1.x = 420; b.p2.x = 520;                 // 贴近，且对手站着
  expect(hintFor(b.p1, 0, false, b.p2), '够得着的距离上还在教挑衅').not.toContain('挑衅');
});

test('硬直击倒时不叫玩家按受身——按了也没用', () => {
  const b = new Battle(structuredClone(CHARACTERS[0]), structuredClone(CHARACTERS[1]));
  const f = { ...b.p1, state: 'down' as const, stateFrame: 3, techable: false };
  const t = hintFor(f, 0);
  expect(t.includes('不能受身'), `硬直击倒时的提示是「${t}」，仍在叫玩家按键`).toBe(true);
});

test('可受身的倒地，窗口过了也要把话讲完', () => {
  const b = new Battle(structuredClone(CHARACTERS[0]), structuredClone(CHARACTERS[1]));
  const base = { ...b.p1, state: 'down' as const, techable: true };
  const inWindow = hintFor({ ...base, stateFrame: 5 }, 0);
  const after = hintFor({ ...base, stateFrame: 40 }, 0);
  expect(inWindow.includes('受身'), `窗口内没在讲受身：「${inWindow}」`).toBe(true);
  expect(after.includes('受身'), `窗口过了就不讲了：「${after}」——那条提示只存在 0.23 秒，没人读得完`).toBe(true);
  expect(after, '窗口内外说的是同一句话——过了窗口还催人按键是在骗人').not.toBe(inWindow);
});

// 「不能受身」有三种来源（大招/投技/吹飞），但只有**投技**留了一条真出路：
// 被抓住前的一瞬新按拳就能挣脱（escapeAge，12 帧）。此前三种混在一句
// 「大招 / 投技 / 吹飞 打倒的，只能躺满」里——等于把唯一那条出路也说成了没有。
// 实测被投 4.0 次/回合、挣脱只有 0.4 次，玩家在对局里根本撞不见这条路。
test('被投打倒时教挣脱，不是笼统地说"只能躺满"', () => {
  const c = CHARACTERS[0];
  const b = new Battle(structuredClone(c), structuredClone(c), 400, 440);
  // 贴到投技距离，按攻击 → 变投技
  let thrown = false;
  for (let f = 0; f < 30 && !thrown; f++) {
    b.tick(press({ attack: f === 0 }), press());
    if (b.events.some(e => e.type === 'throw')) thrown = true;
  }
  expect(thrown, '用例没成立：没有投出去').toBe(true);
  expect(b.p2.state, '被投之后应当倒地').toBe('down');
  expect(b.p2.downByThrow, '被投倒地却没标记 downByThrow').toBe(true);
  const t = hintFor(b.p2, 0, false, b.p1);
  expect(t, '被投倒地时没教挣脱').toContain('挣脱');
});

test('大招/吹飞打倒的仍然说"只能躺满"——那才是真的没出路', () => {
  const c = CHARACTERS[0];
  const b = new Battle(structuredClone(c), structuredClone(c));
  b.p1.state = 'down';
  b.p1.techable = false;
  b.p1.downByThrow = false;
  const t = hintFor(b.p1, 0);
  expect(t, '硬直击倒却教了挣脱').not.toContain('挣脱');
  expect(t, '硬直击倒没说清躺满').toContain('躺满');
});
