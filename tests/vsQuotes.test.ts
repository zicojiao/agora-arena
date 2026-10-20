import { expect, test } from 'vitest';
import { CHARACTERS } from '../src/data/characters';
import { loseQuote, winQuote } from '../src/data/quotes';

// 对手专属胜利台词（CharacterDef.vs）。KOF97 的胜利台词是按对手分的，
// 十二个人之间那张关系网——父子、夫妻、结拜、师兄弟、打过一架的旧账——
// 只有在这一层才说得出口。
//
// 这类数据的坏法**全都是静默的**：键名写错一个字母就永远命中不了，
// 玩家看到的只是那句通用台词，没有报错、没有空白、什么都不缺，
// 只是那对关系从此不存在。下面几条就是冲着「静默」去的。

const byId = new Map(CHARACTERS.map(c => [c.id, c]));

test('vs 的键全是真角色 id——写错一个字母就是永远不触发', () => {
  for (const c of CHARACTERS) {
    for (const foeId of Object.keys(c.vs ?? {})) {
      expect(byId.has(foeId), `${c.name} 的 vs 里有个不存在的对手 id：${foeId}`).toBe(true);
    }
  }
});

test('专属台词不会跟通用那句撞车——撞了就等于没写', () => {
  for (const c of CHARACTERS) {
    for (const [foeId, line] of Object.entries(c.vs ?? {})) {
      expect(line.length, `${c.name} 对 ${foeId} 的台词是空的`).toBeGreaterThan(0);
      expect(line, `${c.name} 对 ${byId.get(foeId)?.name} 说的就是他的通用台词`)
        .not.toBe(c.quotes.win);
    }
  }
});

// 和 quotes.win 同一个坑位（横幅居中一行，19px，不折行也不缩放），
// 所以吃同一条 18 字上限——这条不是审美，是几何：横幅锚在 0.30/0.70 屏宽处，
// 字太长会从屏幕左（右）边穿出去，而画布不会报任何错。
test('专属台词不超过 18 字——横幅不折行，长了就穿出屏幕', () => {
  for (const c of CHARACTERS) {
    for (const [foeId, line] of Object.entries(c.vs ?? {})) {
      expect(line.length, `${c.name} 对 ${byId.get(foeId)?.name} 那句太长：「${line}」`)
        .toBeLessThanOrEqual(18);
    }
  }
});

test('全场没有两句一样的台词——复制粘贴忘了改，读起来就是串词', () => {
  const seen = new Map<string, string>();
  for (const c of CHARACTERS) {
    for (const [foeId, line] of Object.entries(c.vs ?? {})) {
      const here = `${c.name}→${byId.get(foeId)?.name}`;
      expect(seen.has(line), `${here} 和 ${seen.get(line)} 是同一句话`).toBe(false);
      seen.set(line, here);
    }
  }
});

// 关系是**双向**的：阶梯打下来，同一对人你既会赢也会输，两边都能听到。
// A 对 B 有话说而 B 对 A 只有通用那句，玩家会当成漏了——事实上也是漏了。
test('有话说的两个人，两个方向都要有话说', () => {
  for (const c of CHARACTERS) {
    for (const foeId of Object.keys(c.vs ?? {})) {
      if (foeId === c.id) continue;   // 自己打自己（牛魔王打到最后一关）天然对称
      const foe = byId.get(foeId)!;
      expect(foe.vs?.[c.id], `${c.name} 对 ${foe.name} 有专属台词，反过来 ${foe.name} 只有通用那句`)
        .toBeDefined();
    }
  }
});

// 取法本身收成了 data/quotes 里的两个纯函数（winQuote / loseQuote），
// 所以这里直接调它们，不再去源码里扫锚点——扫锚点这件事本会话吃过两次亏：
// 锚点不唯一时守的是另一行代码（选人页那次、结算页这次都是）。
test('按对手取台词：写过的用专属，没写过的回落通用', () => {
  const nezha = byId.get('nezha')!;
  expect(winQuote(nezha, 'wukong'), '写过的组合没取到专属胜利台词').toBe(nezha.vs!.wukong);
  expect(winQuote(nezha, 'baigu'), '没写过的组合没回落到通用胜利台词').toBe(nezha.quotes.win);
  const niumo = byId.get('niumo')!;
  expect(loseQuote(niumo, 'honghaier'), '写过的组合没取到专属败北台词').toBe(niumo.vsLose!.honghaier);
  expect(loseQuote(niumo, 'baigu'), '没写过的组合没回落到通用败北台词').toBe(niumo.quotes.lose);
  // 十二个人任取一对都不该产出 undefined——回落必须永远兜得住
  for (const a of CHARACTERS) for (const b of CHARACTERS) {
    expect(winQuote(a, b.id), `${a.name} 对 ${b.name} 的胜利台词是空的`).toBeTruthy();
    expect(loseQuote(a, b.id), `${a.name} 对 ${b.name} 的败北台词是空的`).toBeTruthy();
  }
});

// ── 败北那一句也按对手分 ────────────────────────────────────────────
// 胜者那句在摆造型时说（对局里），败者这句在结算页说。只给胜者写专属台词的话，
// 红孩儿喊完「爹，你说等我打赢你就认我——现在呢？」，牛魔王回的仍是那句谁都通用的——
// 一段对话只说了一半。

test('vsLose 的键也全是真角色 id', () => {
  for (const c of CHARACTERS) {
    for (const foeId of Object.keys(c.vsLose ?? {})) {
      expect(byId.has(foeId), `${c.name} 的 vsLose 里有个不存在的对手 id：${foeId}`).toBe(true);
    }
  }
});

test('败北专属台词不会跟通用那句撞车，也不超长', () => {
  for (const c of CHARACTERS) {
    for (const [foeId, line] of Object.entries(c.vsLose ?? {})) {
      expect(line, `${c.name} 对 ${byId.get(foeId)?.name} 的败北台词就是通用那句`).not.toBe(c.quotes.lose);
      expect(line.length, `${c.name} 对 ${byId.get(foeId)?.name} 的败北台词太长`).toBeLessThanOrEqual(18);
    }
  }
});

// 一段对话要两头都在：A 对 B 有胜利台词，B 对 A 就该有败北台词，反之亦然。
// 缺一半的话，玩家听到的是"我赢了说得很得意，你输了却像在对陌生人说话"。
test('胜利台词与败北台词成对——一段对话不能只说一半', () => {
  for (const c of CHARACTERS) {
    for (const foeId of Object.keys(c.vs ?? {})) {
      if (foeId === c.id) continue;
      const foe = byId.get(foeId)!;
      expect(foe.vsLose?.[c.id],
        `${c.name} 对 ${foe.name} 有专属胜利台词，而 ${foe.name} 输给他时说的还是通用那句`)
        .toBeDefined();
    }
  }
});

// 接线仍要守，但锚到**唯一**的调用形态上：结算页两条分支（玩家赢／玩家输）
// 都必须走 loseQuote，胜利姿势必须走 winQuote。
// 第一版锚的是 `vsLose?.[`，而它在结算页出现两次——摘掉一条照样绿。
