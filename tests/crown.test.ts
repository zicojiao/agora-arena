import { expect, test } from 'vitest';
import { CHARACTERS } from '../src/data/characters';
import { validateCharacter } from '../src/data/validate';
import { drawCrown } from '../src/render/cutin';
import { drawPortrait } from '../src/render/renderer';
import cutinSrc from '../src/render/cutin.ts?raw';

/**
 * 大招特写里那颗头。
 *
 * 此前程序化胸像画的是"肩 + 一个光头圆"，十二个人**只差配色**——
 * 玩家反馈「新增神话人物的头像不该用默认」说的正是这里。
 * 现在每人一件头饰（牛角/金箍/火焰/大耳/第三只眼/双髻/幞头/发簪/骷髅/抹额/双翅），
 * 靠这一件就该认得出是谁。刑天不给：他无头，特写走胸口那对眼睛。
 */

test('除刑天外每个人都有头饰，而且没有两个人戴同一件', () => {
  const seen = new Map<string, string>();
  for (const c of CHARACTERS) {
    if (c.headless) {
      expect(c.crown, `${c.name} 无头却配了头饰——特写里没地方画`).toBeUndefined();
      continue;
    }
    expect(c.crown, `${c.name} 没有头饰，特写里还是那个默认光头圆`).toBeDefined();
    const k = c.crown!.kind;
    expect(seen.has(k), `${c.name} 和 ${seen.get(k)} 戴同一件（${k}）——那就还是"看着都一样"`).toBe(false);
    seen.set(k, c.name);
  }
  // 十二个人里十一个有头饰
  expect(seen.size, '有头饰的人数不对').toBe(CHARACTERS.filter(c => !c.headless).length);
});

test('头饰颜色是 6 位 #RRGGBB——校验器管着', () => {
  for (const c of CHARACTERS) {
    if (!c.crown) continue;
    expect(c.crown.color, `${c.name} 的头饰颜色格式不对`).toMatch(/^#[0-9a-f]{6}$/i);
  }
  const bad = structuredClone(CHARACTERS.find(c => !c.headless)!);
  bad.crown = { kind: 'horns', color: '#fff' };
  expect(validateCharacter(bad).join(''), '三位缩写的头饰颜色没被挡下').toContain('crown');
});

// 上面两条只看数据。数据全对、而画法里少一支 case（或者根本没调 drawCrown），
// 它们照样全绿——本会话反复栽的"算了但没接上"。所以比**画出来的东西**。
// **不收 save/restore**：drawCrown 头尾必调它们，收进来的话"switch 里漏了一支"
// 也会留下 save()|restore() 这条非空且唯一的痕迹，两条断言全绿——
// 实测就是这样：删掉 ears 那一支，四条测试一条不红。只收真正落墨的调用。
const CALLS = ['beginPath', 'moveTo', 'lineTo', 'quadraticCurveTo', 'arc', 'ellipse',
  'rect', 'closePath', 'fill', 'stroke'] as const;

function trace(kind: NonNullable<typeof CHARACTERS[number]['crown']>['kind']): string {
  const log: string[] = [];
  const ctx = new Proxy({} as Record<string, unknown>, {
    get(_t, k: string) {
      if ((CALLS as readonly string[]).includes(k)) {
        return (...a: unknown[]) => log.push(`${k}(${a.map(v => typeof v === 'number' ? v.toFixed(1) : String(v)).join(',')})`);
      }
      // save/restore 之类照样要能调，只是不记账——返回 undefined 会让 ctx.save() 直接抛
      return () => {};
    },
    set() { return true; },
  }) as unknown as CanvasRenderingContext2D;
  drawCrown(ctx, { kind, color: '#abcdef' }, 0, 40);
  return log.join('|');
}

test('十一件头饰画出来两两不同——漏一支 case 就是安静地什么都不画', () => {
  const seen = new Map<string, string>();
  for (const c of CHARACTERS) {
    if (!c.crown) continue;
    const t = trace(c.crown.kind);
    expect(t.length, `${c.crown.kind} 什么都没画（多半是 switch 里漏了这一支）`).toBeGreaterThan(0);
    expect(seen.has(t), `${c.crown.kind} 和 ${seen.get(t)} 画出来一模一样`).toBe(false);
    seen.set(t, c.crown.kind);
  }
  expect(seen.size).toBe(CHARACTERS.filter(c => c.crown).length);
});

test('特写真的调了它——不是加了个字段摆着', () => {
  const line = cutinSrc.split(String.fromCharCode(10)).find(l => /drawCrown\(/.test(l) && !/^export function/.test(l.trim()));
  expect(line, '特写里找不到 drawCrown 调用——头饰加了但没画').toBeTruthy();
  expect(line!, '调用没带上角色自己的 crown').toContain('def.crown');
});

// 头饰不能只活在大招特写里：玩家绝大多数时间看的是**对局里那颗头**和选人页的立绘。
// 这一条钉的是"同一份 crown 数据也画到了对局/立绘上"——用立绘走一遍（它跟对局共用
// drawLimbs 那套骨骼装配），比对戴与不戴的绘制序列。
test('对局与立绘里那颗头也戴上了——不是只有特写有', () => {
  const wukong = CHARACTERS.find(c => c.id === 'wukong')!;
  const bare = structuredClone(wukong);
  delete (bare as { crown?: unknown }).crown;
  const draw = (def: typeof wukong) => {
    const log: string[] = [];
    const ctx = new Proxy({} as Record<string, unknown>, {
      get(_t, k: string) {
        if ((CALLS as readonly string[]).includes(k)) {
          return (...a: unknown[]) => log.push(`${k}(${a.map(v => typeof v === 'number' ? v.toFixed(1) : String(v)).join(',')})`);
        }
        if (k === 'createLinearGradient') return () => ({ addColorStop: () => {} });
        return () => {};
      },
      set() { return true; },
    }) as unknown as CanvasRenderingContext2D;
    drawPortrait(ctx, def, 120, 190);
    return log.join('|');
  };
  expect(draw(wukong), '戴不戴头饰画出来一模一样——crown 没接到立绘/对局那条路上')
    .not.toBe(draw(bare));
});
