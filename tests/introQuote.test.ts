import { expect, test } from 'vitest';
import { CHARACTERS } from '../src/data/characters';
import { introQuote, loseQuote, winQuote } from '../src/data/quotes';
import { FINAL_BOSS } from '../src/data/stages';
import { FLOOR_Y } from '../src/engine/types';
import { validateCharacter } from '../src/data/validate';
import { BannerSystem, STAGE_FADE_IN, STAGE_INTRO_Y } from '../src/render/banner';

// 开场那一句。此前十二个人各有胜/负/挑衅三句，**全都发生在打完之后**——
// 一场仗要打到一半才有人说话，而开场对峙恰恰是 KOF 里角色性格最先落地的地方：
// 玩家还没交手，就已经知道对面是谁。

test('十二个人都有开场白，而且各说各的', () => {
  const seen = new Map<string, string>();
  for (const c of CHARACTERS) {
    const q = c.quotes.intro;
    expect(q, `${c.name} 没有开场白`).toBeTruthy();
    expect(seen.has(q), `${c.name} 和 ${seen.get(q)} 的开场白一模一样`).toBe(false);
    seen.set(q, c.name);
    // 也不能跟自己另外三句撞——撞了等于这个坑位没写
    for (const k of ['win', 'lose', 'taunt'] as const) {
      expect(q, `${c.name} 的开场白就是他的${k}台词`).not.toBe(c.quotes[k]);
    }
  }
});

test('长度受校验器管着——横幅第四行是居中一行，长了就穿出去', () => {
  const bad = structuredClone(CHARACTERS[0]);
  bad.quotes = { ...bad.quotes, intro: '一'.repeat(15) };
  expect(validateCharacter(bad).join(''), '超长开场白没被挡下').toContain('intro 台词过长');
  const missing = structuredClone(CHARACTERS[0]);
  missing.quotes = { ...missing.quotes, intro: '' };
  expect(validateCharacter(missing).join(''), '缺开场白没被挡下').toContain('缺开场台词');
  // 十二个人现在都得过
  for (const c of CHARACTERS) {
    expect(validateCharacter(c).filter(m => m.includes('intro')), `${c.name} 的开场白不合格`).toEqual([]);
  }
});

// ── 按对手分的开场白 ────────────────────────────────────────────────
// vs / vsLose 那张关系网此前**只在打完之后才响得起来**：胜者摆造型说一句、
// 败者在结算页回一句。开场这一拍补上之后，一对有渊源的人是"开场—胜—负"三拍。

test('vsIntro 的键全是真角色 id，且不跟通用那句撞', () => {
  const byId = new Set(CHARACTERS.map(c => c.id));
  let n = 0;
  for (const c of CHARACTERS) {
    for (const [foeId, line] of Object.entries(c.vsIntro ?? {})) {
      n++;
      expect(byId.has(foeId), `${c.name} 的 vsIntro 里有个不存在的对手 id：${foeId}`).toBe(true);
      expect(line, `${c.name} 对 ${foeId} 的开场白就是他的通用那句`).not.toBe(c.quotes.intro);
    }
  }
  expect(n, '一条按对手分的开场白都没有').toBeGreaterThan(8);
});

test('取法走 introQuote：写过的用专属，没写过的回落通用', () => {
  const niumo = CHARACTERS.find(c => c.id === 'niumo')!;
  expect(introQuote(niumo, 'honghaier'), '写过的组合没取到专属开场白').toBe(niumo.vsIntro!.honghaier);
  expect(introQuote(niumo, 'baigu'), '没写过的组合没回落到通用开场白').toBe(niumo.quotes.intro);
  // 任取一对都不该产出空——回落必须永远兜得住
  for (const a of CHARACTERS) for (const b of CHARACTERS) {
    expect(introQuote(a, b.id), `${a.name} 对 ${b.name} 的开场白是空的`).toBeTruthy();
  }
});

// 画布状态是**流着的**：前一段设的 globalAlpha 会一直生效到有人改它。
// 开场白那行的描边（它在人物身上还读得清的唯一原因）就吃过这个亏——
// 上一行注解把 alpha 压到 0.72 之后没还原，于是描边跟着变淡，
// 而且**有没有注解决定它多淡**：同一句话在不同对手身上深浅不一，还不会报任何错。
test('开场白的描边不吃上一行留下的透明度——有没有定位那行都一样深', () => {
  const trace = (trait: string) => {
    const log: string[] = [];
    let alpha = 1;
    const ctx = new Proxy({} as Record<string, unknown>, {
      get(_t, k: string) {
        if (k === 'strokeText' || k === 'fillText') {
          return (txt: string, _x: number, y: number) => log.push(`${k}@${y}:${alpha.toFixed(3)}:${txt}`);
        }
        if (['save', 'restore', 'beginPath', 'fill', 'stroke', 'moveTo', 'lineTo', 'closePath',
          'arc', 'ellipse', 'quadraticCurveTo', 'rect', 'translate', 'scale', 'clip'].includes(k)) return () => {};
        return undefined;
      },
      set(_t, k: string, v) { if (k === 'globalAlpha') alpha = v as number; return true; },
    }) as unknown as CanvasRenderingContext2D;
    const b = new BannerSystem();
    b.showStage('花果山', '孙悟空', trait, false, '棒子无眼，你自己当心。');
    // 必须先推过淡入段：age=0 时 edgeAlpha 是 0，两次描边都记成 0.000，
    // 这条断言就恒成立——第一版正是这么写的，红检（拿掉那行 globalAlpha）纹丝不动。
    for (let i = 0; i < STAGE_FADE_IN + 5; i++) b.tick();
    (b as unknown as { drawStageIntro(c: CanvasRenderingContext2D): void }).drawStageIntro(ctx);
    // 用常量取，不写死 232：那一行的 y 一改，写死的过滤器就什么都筛不到，
    // 这条断言会以「根本没描边」的名义报错——名字对不上病灶，查起来先绕一圈（刚绕过）
    return log.filter(l => l.startsWith(`strokeText@${STAGE_INTRO_Y}`)).join('');
  };
  const withTrait = trace('力量·霸体'), without = trace('');
  expect(withTrait, '开场白那行根本没描边').toBeTruthy();
  expect(withTrait, '有没有定位那行，开场白的描边深浅居然不一样——上一行的 alpha 漏过来了')
    .toBe(without);
});

// 末关固定是 FINAL_BOSS。选中他的玩家，最后一场打的就是自己——
// 这不是边角情形，是**十二分之一的玩家必然撞上的一场**，而且是整趟的收尾那一场。
// 通用开场白在这里读起来像"他没认出对面是谁"。
test('镜像战三句台词都是专属的——选最终 BOSS 的人必然打到这一场', () => {
  const boss = CHARACTERS.find(c => c.id === FINAL_BOSS)!;
  // 三个坑位一起钉。开场是这一轮才补的，胜/负两句本来就写了
  //（「照镜子照到打起来，也就我了。」／「照镜子输给自己，服了。」）——
  // 但没有断言看着它们，重构时掉一句不会有人发现，而这是整趟收尾的那一场。
  for (const [label, got, generic] of [
    ['开场', introQuote(boss, boss.id), boss.quotes.intro],
    ['胜', winQuote(boss, boss.id), boss.quotes.win],
    ['负', loseQuote(boss, boss.id), boss.quotes.lose],
  ] as const) {
    expect(got, `${boss.name} 打自己时的${label}台词还是那句通用的`).not.toBe(generic);
  }
  // vsQuotes 那条"两个方向都要有话说"专门跳过 foeId === c.id（自指天然对称），
  // 所以自指这一格没有别的断言在看——它只由这里守着
  expect(boss.vsIntro?.[boss.id] && boss.vs?.[boss.id] && boss.vsLose?.[boss.id],
    `${boss.name} 的镜像战台词缺了其中一句`).toBeTruthy();
});

// 开场横幅是一行行往下加的：118（最终关）/150（地名）/184（对手）/208（定位）/232（开场白）。
// 再往下就压到人物头上——而那是**画布上没有边框的地方**，越界不会被裁掉、不会报错，
// 只会看见一行字糊在角色脸上。第五行迟早有人要加，先把下限钉住。
test('横幅最下面那行仍在人物头顶之上——再加行数会先撞到这条', () => {
  // 人物头顶：脚底 FLOOR_Y 起算，颈肩 SHOULDER_Y=118 + 头心再抬一个半径 HEAD_R=16，
  // 头顶再往上一个半径。这三个数是渲染层的，取当前值算一遍，别写死结果。
  const headTop = FLOOR_Y - (118 + 16) - 16;
  expect(STAGE_INTRO_Y, `开场白那行(y=${STAGE_INTRO_Y})已经压到人物头顶(y=${headTop})上了`)
    .toBeLessThan(headTop);
  // 也要留出一行字的余量，不能贴着
  expect(headTop - STAGE_INTRO_Y, '开场白那行离人物头顶不足一行字的高度').toBeGreaterThan(20);
});
