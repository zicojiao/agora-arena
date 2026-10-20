import { expect, test } from 'vitest';
import { CHARACTERS } from '../src/data/characters';
import { drawPortrait } from '../src/render/renderer';

// 选人页此前是十二张**形状完全一样**的卡：竖排名号 + 一层配色。
// 玩家第一次感到"新角色怎么都一样"就在这一屏，比进对局还早。
// 现在卡面垫的是对局里同一套骨骼装配，所以这条守的是最直接的那句话：
// **没有任何两个人画出来是一样的**。
//
// 用记调用的 ctx 比对绘制序列——比对图像要有 canvas 实现，比对源码则守不住任何东西。

const METHODS = ['beginPath', 'moveTo', 'lineTo', 'quadraticCurveTo', 'bezierCurveTo', 'arc',
  'ellipse', 'closePath', 'fill', 'stroke', 'save', 'restore', 'translate', 'scale',
  'rect', 'arcTo', 'setTransform', 'clip'] as const;
const PROPS = ['fillStyle', 'strokeStyle', 'lineWidth', 'globalAlpha', 'lineCap',
  'globalCompositeOperation'] as const;

function trace(def: typeof CHARACTERS[number]): string {
  const log: string[] = [];
  const ctx = new Proxy({} as Record<string, unknown>, {
    get(_t, k: string) {
      if (k === 'createLinearGradient') {
        // 渐变对象只需要能收 addColorStop；颜色本身进日志，两个人配色不同就分得开
        return (...a: number[]) => {
          log.push(`grad(${a.map(v => v.toFixed(1)).join(',')})`);
          return { addColorStop: (o: number, c: string) => log.push(`stop(${o},${c})`) };
        };
      }
      if ((METHODS as readonly string[]).includes(k)) {
        return (...a: unknown[]) => log.push(`${k}(${a.map(v => typeof v === 'number' ? v.toFixed(1) : String(v)).join(',')})`);
      }
      return undefined;
    },
    set(_t, k: string, v) {
      if ((PROPS as readonly string[]).includes(k)) log.push(`${k}=${String(v)}`);
      return true;
    },
  }) as unknown as CanvasRenderingContext2D;
  drawPortrait(ctx, def, 120, 190);
  return log.join('|');
}

test('十二张选人卡两两不同——这就是"新角色怎么都一样"那句话本身', () => {
  const seen = new Map<string, string>();
  for (const c of CHARACTERS) {
    const t = trace(c);
    expect(t.length, `${c.name} 的立绘什么都没画`).toBeGreaterThan(0);
    expect(seen.has(t), `${c.name} 和 ${seen.get(t)} 画出来一模一样`).toBe(false);
    seen.set(t, c.name);
  }
});

test('立绘画的是对局里那个人：兵器、无头、翅膀都要出现在卡面上', () => {
  const xingtian = CHARACTERS.find(c => c.id === 'xingtian')!;
  const zhongkui = CHARACTERS.find(c => c.id === 'zhongkui')!;
  // 刑天无头：他的立绘不该出现别人都有的那颗程序化圆头（HEAD_R=16 的整圆）。
  // 锚点只钉半径与整圆两项——圆心随 lean 摆动，写死坐标就是一条随时会过期的断言
  //（第一版把圆心当成 0,0，当场被下面那条"有头的反而没画头"抓出来）。
  const HEAD = /arc\([-\d.]+,[-\d.]+,16\.0,0\.0,6\.3\)/;
  expect(HEAD.test(trace(xingtian)), '刑天的立绘上长出了一颗头').toBe(false);
  expect(HEAD.test(trace(zhongkui)), '有头的角色反而没画头，这条断言的锚点过时了').toBe(true);
  // 雷震子的翅膀：翼羽走 ellipse，且只有他一个人在立绘里画翅膀
  const winged = CHARACTERS.filter(c => c.adorn?.wings);
  expect(winged.length, '有翅膀的不止一个，下面这条就不成立了').toBe(1);
  const w = winged[0].adorn!.wings!;
  // 锚在**羽毛根数**上，不锚颜色：雷震子的翼梢色和他兵器的刃色恰好同为 #8fd0ff，
  // 按颜色找会被兵器满足（一条守门被两个东西同时满足，就不再守任何一个）。
  // 远近两只翅膀各 feathers 根，每根一个 ellipse，所以至少 2×feathers 个。
  const ell = (c: typeof CHARACTERS[number]) => (trace(c).match(/ellipse\(/g) ?? []).length;
  expect(ell(winged[0]), `${winged[0].name} 的立绘上没有翅膀`).toBeGreaterThanOrEqual(2 * w.feathers);
  // 没翅膀的人不该也画出这么多椭圆——否则上面那条数字是巧合，不是翅膀
  const wingless = CHARACTERS.filter(c => !c.adorn?.wings);
  expect(Math.max(...wingless.map(ell)), '没有翅膀的角色也画出了同样多的椭圆，这条锚点不成立')
    .toBeLessThan(2 * w.feathers);
});
