import { expect, test } from 'vitest';
import { NEZHA } from '../src/data/characters/nezha';
import { ERLANG } from '../src/data/characters/erlang';
import { CHARACTERS } from '../src/data/characters';
import { validateCharacter } from '../src/data/validate';
import { BAJIE } from '../src/data/characters';
import { MOTIONS } from '../src/data/motions';
import { Battle } from '../src/engine/battle';
import { mv, press, testChar } from './helpers';

test('哪吒数据合法', () => {
  expect(validateCharacter(NEZHA)).toEqual([]);
});

test('哪吒 8 招齐全且大招耗气正确', () => {
  expect(NEZHA.moves.sp50.meterCost).toBe(50);
  expect(NEZHA.moves.sp100.meterCost).toBe(100);
  expect(NEZHA.moves.s1.cooldown).toBeGreaterThan(0);
});

test('fx frame 越界（>= startup+active+recovery）会被校验器抓到', () => {
  const moves = testChar().moves;
  // n1 默认 startup3+active3+recovery5=11，合法窗口是 [0,11)，frame=11 正好越界
  const bad = testChar({ moves: { ...moves, n1: mv('n1', { fx: [{ frame: 11, type: 'spark', color: '#fff' }] }) } });
  const problems = validateCharacter(bad);
  expect(problems.some(p => p.includes('t_n1') && p.includes('fx frame'))).toBe(true);
});

test('fx frame 为负会被校验器抓到', () => {
  const moves = testChar().moves;
  const bad = testChar({ moves: { ...moves, n1: mv('n1', { fx: [{ frame: -1, type: 'spark', color: '#fff' }] }) } });
  const problems = validateCharacter(bad);
  expect(problems.some(p => p.includes('t_n1') && p.includes('fx frame'))).toBe(true);
});

test('dash.frame 越界会被校验器抓到', () => {
  const moves = testChar().moves;
  // s1 默认 startup3+active3+recovery5=11，合法窗口是 [0,11)，frame=11 正好越界
  const bad = testChar({ moves: { ...moves, s1: mv('s1', { dash: [{ frame: 11, vx: 10 }] }) } });
  const problems = validateCharacter(bad);
  expect(problems.some(p => p.includes('t_s1') && p.includes('dash'))).toBe(true);
});

test('dash 数组里同一 frame 出现两次会被校验器抓到（后一个会静默覆盖前一个设下的 vx）', () => {
  const moves = testChar().moves;
  const bad = testChar({ moves: { ...moves, s1: mv('s1', { dash: [{ frame: 2, vx: 5 }, { frame: 2, vx: 8 }] }) } });
  const problems = validateCharacter(bad);
  expect(problems.some(p => p.includes('t_s1') && p.includes('dash') && p.includes('重复'))).toBe(true);
});

test('dash 空数组会被校验器抓到（等同于没写 dash，意图不明）', () => {
  const moves = testChar().moves;
  const bad = testChar({ moves: { ...moves, s1: mv('s1', { dash: [] }) } });
  const problems = validateCharacter(bad);
  expect(problems.some(p => p.includes('t_s1') && p.includes('dash'))).toBe(true);
});

// Task 37 测试 3：validateCharacter 拒绝 motionSeq 里不存在的 motionId、非正 weight、少于 2 段。
// 去掉 validate.ts 里对应的 motionSeq 校验分支，这三条会红。
test('motionSeq 引用不存在的 motionId 会被校验器抓到', () => {
  const moves = testChar().moves;
  const bad = testChar({
    moves: { ...moves, sp100: mv('sp100', { motionSeq: [{ motionId: 'thrust', weight: 1 }, { motionId: 'no_such_motion', weight: 1 }] }) },
  });
  const problems = validateCharacter(bad);
  expect(problems.some(p => p.includes('t_sp100') && p.includes('motionSeq') && p.includes('no_such_motion'))).toBe(true);
});

test('motionSeq 段 weight 非正会被校验器抓到', () => {
  const moves = testChar().moves;
  const bad = testChar({
    moves: { ...moves, sp100: mv('sp100', { motionSeq: [{ motionId: 'thrust', weight: 1 }, { motionId: 'upthrust', weight: 0 }] }) },
  });
  const problems = validateCharacter(bad);
  expect(problems.some(p => p.includes('t_sp100') && p.includes('motionSeq') && p.includes('weight'))).toBe(true);
});

test('motionSeq 少于 2 段会被校验器抓到', () => {
  const moves = testChar().moves;
  const bad = testChar({
    moves: { ...moves, sp100: mv('sp100', { motionSeq: [{ motionId: 'thrust', weight: 1 }] }) },
  });
  const problems = validateCharacter(bad);
  expect(problems.some(p => p.includes('t_sp100') && p.includes('motionSeq'))).toBe(true);
});

test('二郎神超必杀·天眼灭世：全程不脱靶，连打每一段都命中', () => {
  // 用哪吒当受害者：四人里 hurtbox 最窄（width 52），是后撤最容易打空的最紧张情形；
  // 默认交战距离（Battle 默认 x1=300/x2=660，间距 360）跟这招 hitbox 的前伸距离（360）
  // 几乎一样宽，后撤稍微大一点前几段就会先打空——这条测试就是防这个回归
  const b = new Battle(ERLANG, NEZHA, 300, 660);
  b.p1.meter = 100;
  // 完整版演出只在能 KO 时播，把对手压到总伤害以下取出那一版（击杀推迟到演出结束）
  b.p2.hp = ERLANG.moves.sp100.damage;
  b.tick(press({ super: true }), press());
  const m = ERLANG.moves.sp100;
  const hits = m.multiHit!.hits;
  // 上限按招式自身长度推导。原来手填 200，是按 68 帧的老大招定的；招式拉到 600 帧后
  // 循环在第 7 段就跑完了，测试报"打空"而实际是没跑到——手填的窗口会这样静默失真
  const budget = m.startup + m.active + m.recovery + 60;
  for (let i = 0; i < budget && b.p1.hitCount < hits; i++) b.tick(press(), press());
  expect(b.p1.hitCount).toBe(hits);
});

test('multiHit 的 hits×interval 超出 active 会被校验器抓到（否则后段永远打不出来）', () => {
  const moves = testChar().moves;
  const bad = testChar({ moves: { ...moves, sp100: mv('sp100', { active: 10, multiHit: { hits: 6, interval: 2 } }) } });
  const problems = validateCharacter(bad);
  expect(problems.some(p => p.includes('t_sp100') && p.includes('multiHit'))).toBe(true);
});

test('multiHit.hits < 2 或 interval < 1 会被校验器抓到', () => {
  const moves = testChar().moves;
  const badHits = testChar({ moves: { ...moves, sp100: mv('sp100', { active: 10, multiHit: { hits: 1, interval: 2 } }) } });
  expect(validateCharacter(badHits).some(p => p.includes('multiHit'))).toBe(true);
  const badInterval = testChar({ moves: { ...moves, sp100: mv('sp100', { active: 10, multiHit: { hits: 3, interval: 0 } }) } });
  expect(validateCharacter(badInterval).some(p => p.includes('multiHit'))).toBe(true);
});

test('同一角色内 move id 重复会被校验器抓到', () => {
  const moves = testChar().moves;
  const bad = testChar({ moves: { ...moves, n2: mv('n2', { id: moves.n1.id }) } });
  const problems = validateCharacter(bad);
  expect(problems.some(p => p.includes(moves.n1.id) && p.includes('重复'))).toBe(true);
});

test('palette 不是 6 位 #RRGGBB 会被校验器抓到', () => {
  const bad = testChar({ palette: { main: '#fff', accent: '#ffffff' } });
  const problems = validateCharacter(bad);
  expect(problems.some(p => p.includes('palette'))).toBe(true);
});

test('superGlow 不是 6 位 #RRGGBB 会被校验器抓到', () => {
  // 3 位简写：mandorla.ts 的渐变/描边跟 palette 一样直接 parseInt(hex.slice(1),16) 解析，
  // 简写或非 hex 值会静默解析出垃圾值而不是报错，所以必须在数据层就拦
  const bad = testChar({ superGlow: ['#fff', '#ffffff'] });
  const problems = validateCharacter(bad);
  expect(problems.some(p => p.includes('superGlow'))).toBe(true);
});

test('全角色数据合法且 id 唯一', () => {
  // 不再钉死人数（名册要从四个长到十二个，见 docs/roster-12.md）——
  // 钉死的是"每个人的数据都合法、id 不撞"，那才是这条断言真正守的东西
  expect(CHARACTERS.length, '名册空了').toBeGreaterThanOrEqual(4);
  const ids = new Set(CHARACTERS.map(c => c.id));
  expect(ids.size, 'id 撞了：cooldowns 与美术部件都按 id 索引，撞 id 会静默共用').toBe(CHARACTERS.length);
  for (const c of CHARACTERS) expect(validateCharacter(c), c.id).toEqual([]);
});

// 十二个人要覆盖十二种**打法**而不是十二种外观。定位这一行是玩家在选人页做决定的
// 唯一依据，两个人写成同一句就说明其中一个没有存在的理由。
test('每个人的格斗定位互不重复', () => {
  const roles = CHARACTERS.map(c => c.role);
  const dup = roles.filter((r, i) => roles.indexOf(r) !== i);
  expect(dup, `这些定位重复了：${dup.join('、')}`).toEqual([]);
});

// Task 30：改动前四个角色的 sp100 全都是 motionId: 'superPose'——同一段动作，只有名字/配色/
// 粒子不同。这里锁住两件事：(1) 四人的 sp100 motionId 两两不同（不能有人退回共用一个），
// (2) 每个 motionId 都真的存在于 MOTIONS 里（不是随手改个字符串就当交差，validateCharacter
// 已经在别处查过这点，这里再断言一次是为了让"四人各有专属动作"这件事本身可回归）。
// 把任意一个角色的 sp100.motionId 改回 'superPose' 这条测试就会红。
test('四个角色的 sp100 各有专属 motionId，互不相同且都在 MOTIONS 里定义', () => {
  const ids = CHARACTERS.map(c => ({ id: c.id, motionId: c.moves.sp100.motionId }));
  for (const { id, motionId } of ids) {
    expect(MOTIONS[motionId], `${id}: sp100.motionId=${motionId} 在 MOTIONS 里不存在`).toBeDefined();
  }
  const motionIds = new Set(ids.map(x => x.motionId));
  expect(motionIds.size, `四人的 sp100 motionId 应互不相同，实际是 ${JSON.stringify(ids)}`).toBe(ids.length);
});

test('四个角色的大招 aura 参数互不相同——不能只换色，形态也得是各自的', () => {
  // 用户原话「除了名字都一样」：如果四人的 superAura 两两相等，说明还是同一朵花换了个色，
  // 没有真正做到形态差异化。这里两两比对，任何一对相同都算不通过。
  const auras = CHARACTERS.map(c => ({ id: c.id, aura: c.superAura }));
  for (const a of auras) expect(a.aura, a.id).toBeDefined();
  for (let i = 0; i < auras.length; i++) {
    for (let j = i + 1; j < auras.length; j++) {
      expect(JSON.stringify(auras[i].aura), `${auras[i].id} vs ${auras[j].id}`)
        .not.toBe(JSON.stringify(auras[j].aura));
    }
  }
});

// 刑天断首之后「以乳为目，以脐为口」——渲染层此前无条件画一颗头，
// 画面上他和别人一样有脑袋，「头没了，手还在」那句胜利台词直接落空。
// 这条守的是：这面旗只插在他一个人身上，别人不许无头。
test('只有刑天是无头的', () => {
  for (const c of CHARACTERS) {
    if (c.id === 'xingtian') {
      expect(c.headless, '刑天有头了——他的定位本体就是没有头').toBe(true);
      expect(c.quotes.win, '胜利台词与无头这件事对不上').toContain('头');
    } else {
      expect(c.headless, `${c.name} 也无头了`).toBeFalsy();
    }
  }
});

// 投射物是一整块手写数据（六个角色都有），而它的每一种写错法都是**静默**的：
// 引擎那两处判定都是严格相等——生成 `stateFrame === spawnFrame`、回旋 `age === back`。
// 帧号落在招式窗口外，那一发永远不生成；back 大过 life，乾坤圈再也飞不回来。
// 不报错、不掉帧，只是招式名承诺的那件东西没有发生。
test('投射物的每一种静默写错法都拦得住', () => {
  const withProj = (over: Record<string, unknown>) => {
    const c = structuredClone(NEZHA);
    const m = c.moves.s2;
    m.projectile = { ...m.projectile!, ...over } as typeof m.projectile;
    return validateCharacter(c);
  };
  const total = NEZHA.moves.s2.startup + NEZHA.moves.s2.active + NEZHA.moves.s2.recovery;

  expect(withProj({ spawnFrame: total }).join(), '生成帧越界没拦住——那一发永远不会生成')
    .toMatch(/spawnFrame/);
  expect(withProj({ w: 0 }).join(), '判定框宽 0 没拦住——它永远打不中').toMatch(/判定框/);
  expect(withProj({ h: 0 }).join(), '判定框高 0 没拦住').toMatch(/判定框/);
  expect(withProj({ vx: 0 }).join(), 'vx 为 0 没拦住——它不会飞出去').toMatch(/vx/);
  expect(withProj({ life: 0 }).join(), 'life 为 0 没拦住').toMatch(/life/);
  expect(withProj({ damage: 0 }).join(), 'damage 为 0 没拦住').toMatch(/damage/);
  expect(withProj({ color: '#abc' }).join(), '三位色值没拦住——hexAlpha 会解析成别的颜色')
    .toMatch(/color/);
  // 回旋：back 必须真的落在存活期内
  expect(withProj({ back: NEZHA.moves.s2.projectile!.life }).join(),
    'back >= life 没拦住——它在掉头之前就消失了').toMatch(/back/);
  expect(withProj({ back: 0 }).join(), 'back 为 0 没拦住（0 = 不回旋，不该写出来）').toMatch(/back/);
});

test('十二个人现有的投射物全都合法', () => {
  for (const c of CHARACTERS) {
    expect(validateCharacter(c), `${c.name} 的数据不合法`).toEqual([]);
  }
});

// 大招还有一份**短演出**（Move.brief）：打不死人时播的三秒版，自带 startup/active/recovery
// 和自己的 fx / dash / multiHit——引擎按 `{ ...m, ...m.brief }` 整套替换（stagedMove）。
// 十二个人 × 两档大招 = 24 块这样的帧数据，此前**校验器一次都没走到过**，
// 而它的窗口比完整版短得多（BRIEF_* 对 SUPER_*），主招放得下的帧号在这里未必放得下。
test('短演出的帧号也按它自己的窗口验——不是拿完整版的窗口糊弄过去', () => {
  const c = structuredClone(NEZHA);
  const m = c.moves.sp100;
  const briefTotal = m.brief!.startup! + m.brief!.active! + m.brief!.recovery!;
  const fullTotal = m.startup + m.active + m.recovery;
  // 前提：短演出确实比完整版短，否则这条测的东西不成立
  expect(briefTotal, '短演出没有比完整版短，这条断言失去意义').toBeLessThan(fullTotal);

  // 一个落在完整版窗口内、却超出短演出窗口的帧号：只有按各自窗口验才抓得到
  const between = briefTotal + 5;
  expect(between, '构造的帧号没落在两个窗口之间').toBeLessThan(fullTotal);

  const withBriefFx = structuredClone(c);
  withBriefFx.moves.sp100.brief!.fx = [{ frame: between, type: 'flash', color: '#ffffff' }];
  expect(validateCharacter(withBriefFx).join(), '短演出的 fx 越界没拦住').toMatch(/短演出.*fx frame/);

  const withBriefDash = structuredClone(c);
  withBriefDash.moves.sp100.brief!.dash = [{ frame: between, vx: 8 }];
  expect(validateCharacter(withBriefDash).join(), '短演出的 dash 越界没拦住').toMatch(/短演出.*dash frame/);

  // 段数放不进短演出的 active：后半段永远打不出来，而这正是短演出最容易写错的一处
  const withBriefHits = structuredClone(c);
  withBriefHits.moves.sp100.brief!.multiHit = { hits: 99, interval: 12 };
  expect(validateCharacter(withBriefHits).join(), '短演出的 multiHit 超窗没拦住')
    .toMatch(/短演出.*multiHit/);
});

// 身上那层「活物」（飘带/余烬/气环/扬尘）与兵器、背光花瓣，都是手写数据，
// 而此前只有 palette 和 superGlow 守着色值位数。它们坏起来同样不报错：
//   · mix() 按 slice(1,3)/(3,5)/(5,7) 取通道——三位色值直接得到 NaN
//   · hexAlpha 按 slice(1) 整体解析——'#fff' 会变成 rgb(0,15,255)，是另一种颜色
//   · weapon.grip 跑出 [0,1]，握点算到杆子外面，画出来是手悬在兵器旁边
//   · superAura.petals <= 0，`(2π)/petals` 得到无穷大或负角，整圈背光画不出来
test('外观数据的每一种静默写错法都拦得住', () => {
  const bend = (f: (c: ReturnType<typeof structuredClone<typeof NEZHA>>) => void) => {
    const c = structuredClone(NEZHA);
    f(c);
    return validateCharacter(c).join();
  };
  expect(bend(c => { c.adorn!.sashes![0].color = '#fff'; }), '飘带三位色值没拦住').toMatch(/sashes\[0\]\.color/);
  expect(bend(c => { c.adorn!.sashes![0].tip = '#fff'; }), '飘带梢三位色值没拦住').toMatch(/tip/);
  expect(bend(c => { c.adorn!.sashes![0].segs = 0; }), '飘带节数为 0 没拦住').toMatch(/segs/);
  expect(bend(c => { c.adorn!.ember!.color = '#fff'; }), '余烬三位色值没拦住').toMatch(/ember\.color/);
  expect(bend(c => { c.adorn!.ember!.rate = 0; }), '余烬 rate 为 0 没拦住').toMatch(/ember\.rate/);
  expect(bend(c => { c.adorn!.aura = '#fff'; }), '气环三位色值没拦住').toMatch(/aura/);
  expect(bend(c => { c.adorn!.dust = '#fff'; }), '扬尘三位色值没拦住').toMatch(/dust/);
  expect(bend(c => { c.weapon!.grip = 1.4; }), '握点越界没拦住').toMatch(/grip/);
  expect(bend(c => { c.weapon!.len = 0; }), '兵器长度为 0 没拦住').toMatch(/weapon\.len/);
  expect(bend(c => { c.superAura!.petals = 0; }), '花瓣数为 0 没拦住').toMatch(/petals/);
  // 余烬的 rise 可正可负：白骨精那位的余屑是**往下沉**的（骨灰不是火星），不该被拦
  expect(bend(c => { c.adorn!.ember!.rise = -0.2; }), '负的 rise 被误拦了——那是有意的').toBe('');
});

// aiBias 的键是 `Record<string, number>`——TypeScript **拦不住拼错的动作名**，
// 而拼错的后果是静默的：biased() 有一行专门"把偏置里出现、关卡表里没有的动作补进来"，
// 于是 `attak: 2.4` 会变成一个真的权重项；pick() 抽中它，switch 里没有对应 case
// 也没有 default，输入原样是 NULL_INPUT——AI 站着发呆一整个决策窗（26~30 帧），
// 每次抽到都发一次呆。八个角色手写着四十来个动作名，一个字母就够。
test('打法偏置里拼错的动作名拦得住——它会让 AI 呆立一个决策窗', () => {
  const withBias = (band: 'near' | 'mid' | 'far', t: Record<string, number>) => {
    const c = structuredClone(BAJIE);
    c.aiBias = { ...c.aiBias, [band]: t };
    return validateCharacter(c).join();
  };
  expect(withBias('near', { attak: 2.4 }), '拼错的动作名没拦住').toMatch(/attak/);
  expect(withBias('mid', { approach: -1 }), '负的倍率没拦住').toMatch(/aiBias\.mid\.approach/);
  expect(withBias('far', { approach: NaN }), 'NaN 倍率没拦住').toMatch(/aiBias\.far\.approach/);
  // 正常的键不该被误拦；0 是合法的（"这个角色从不做这件事"是一种写法）
  expect(withBias('near', { attack: 2.4, retreat: 0 }), '正常的偏置被误拦了').toBe('');
});

test('八个有偏置的角色，键名全都是真动作', () => {
  for (const c of CHARACTERS) {
    expect(validateCharacter(c), `${c.name} 的偏置里有不存在的动作名`).toEqual([]);
  }
});
