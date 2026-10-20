import { expect, test } from 'vitest';
import { HOME, STAGES } from '../src/data/stages';
import { CHARACTERS } from '../src/data/characters';
import { validateStageBg } from '../src/data/validate';

// 十二个人各有各的主场。阶梯不再等于四个固定对手（见 docs/roster-12.md），
// 挑到谁就打到谁家去——所以"每个人都得有个家"是可回归的前提，不是装饰。

test('每个角色都有主场，且没有多余的条目', () => {
  for (const c of CHARACTERS) {
    expect(HOME[c.id], `${c.name} 没有主场——阶梯挑到他就没地方打`).toBeTruthy();
    expect(HOME[c.id].name.length, `${c.name} 的关卡名是空的`).toBeGreaterThan(1);
  }
  const extra = Object.keys(HOME).filter(id => !CHARACTERS.some(c => c.id === id));
  expect(extra, `HOME 里有名册上没有的人：${extra.join('、')}`).toEqual([]);
});

test('关卡名互不重复——十二个地方要是十二个地方', () => {
  const names = CHARACTERS.map(c => HOME[c.id].name);
  const dup = names.filter((n, i) => names.indexOf(n) !== i);
  expect(dup, `这些关卡名重复了：${dup.join('、')}`).toEqual([]);
});

test('每关的配色都分得开——不能是同一张图换个色相', () => {
  // 判据：天空渐变的两端 + 地面 + 剪影，四个色拼起来当指纹
  const key = (id: string) => {
    const b = HOME[id].bg;
    return [...b.sky, b.ground, b.silhouette].join('|');
  };
  const keys = CHARACTERS.map(c => key(c.id));
  expect(new Set(keys).size, '有两关的配色完全一样').toBe(keys.length);
  // 视差用的 seed 也要各不相同：同 seed 会画出一模一样的山脊
  const seeds = CHARACTERS.map(c => HOME[c.id].bg.seed);
  expect(new Set(seeds).size, `seed 撞了：${seeds.join(',')}——山脊会画成同一条`).toBe(seeds.length);
});

test('阶梯用的就是主场那一份，不另存一份', () => {
  // 同一份数据存两处就是漂移的开始（这个项目在这类事上栽过六次）
  for (const st of STAGES) {
    expect(st.bg, `${st.name} 的背景不是 HOME 里那一份`).toBe(HOME[st.bossId].bg);
    expect(st.name, `${st.name} 的关卡名与 HOME 对不上`).toBe(HOME[st.bossId].name);
  }
});

// 关卡背景是一整块手写字段，而此前只有"名字不重复""配色分得开"这类整体性质，
// 单个字段自己合不合法一条都没查。它坏起来同样静默：
// 天色/地面/剪影进 shade()（parseInt(hex.slice(1),16) 再按位取通道），
// 天体光晕与氛围粒子进 hexAlpha，两者都按 6 位解析——写成三位不报错，
// 只是画出另一种颜色（'#fff' → 4095 → rgb(0,15,255)）。
// renderer 里那句「本文件里 sky/silhouette/INK 全部是 6 位 hex」是**约定**，
// 而约定此前没有任何东西守着。
test('十二关的背景数据全部合法', () => {
  for (const [id, home] of Object.entries(HOME)) {
    expect(validateStageBg(id, home.name, home.bg), `${home.name} 的背景数据不合法`).toEqual([]);
  }
});

test('背景数据的每一种静默写错法都拦得住', () => {
  const bend = (f: (bg: typeof HOME.nezha.bg) => void) => {
    const bg = structuredClone(HOME.nezha.bg);
    f(bg);
    return validateStageBg('nezha', '东海之滨', bg).join();
  };
  expect(bend(b => { b.sky[0] = '#fff'; }), '天色三位没拦住').toMatch(/sky\[0\]/);
  expect(bend(b => { b.ground = '#abc'; }), '地面三位没拦住').toMatch(/ground/);
  expect(bend(b => { b.silhouette = '#abc'; }), '剪影三位没拦住').toMatch(/silhouette/);
  expect(bend(b => { b.celestialColor = '#abc'; }), '天体三位没拦住').toMatch(/celestialColor/);
  expect(bend(b => { b.ambient!.color = '#abc'; }), '粒子三位没拦住').toMatch(/ambient\.color/);
  expect(bend(b => { b.ambient!.count = 0; }), '粒子数为 0 没拦住').toMatch(/count/);
  expect(bend(b => { b.seed = NaN; }), 'seed 为 NaN 没拦住').toMatch(/seed/);
  expect(validateStageBg('x', '', HOME.nezha.bg).join(), '空关卡名没拦住').toMatch(/关卡名/);
});
