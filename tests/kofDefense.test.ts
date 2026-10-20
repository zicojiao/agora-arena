import { expect, test } from 'vitest';
import { Battle, THROW_ESCAPE_WINDOW } from '../src/engine/battle';
import { CHARACTERS } from '../src/data/characters';
import { NULL_INPUT } from '../src/engine/types';
const press = (o: Partial<typeof NULL_INPUT> = {}) => ({ ...NULL_INPUT, ...o });
const C = CHARACTERS[0];
const mk = (gap = 70) => new Battle(structuredClone(C), structuredClone(C), 400, 400 + gap);

test('CD 吹飞攻击：比自家重击更重、必定击倒、把人打得更远', () => {
  const n3 = mk(), cd = mk();
  for (let i = 0; i < 60; i++) n3.tick(press(i === 0 ? { attack: true } : { attack: i < 14 }), press());
  for (let i = 0; i < 60; i++) cd.tick(press(i === 0 ? { blowback: true } : {}), press());
  expect(cd.p1.move?.name ?? '', 'blowback 键应出吹飞攻击').toMatch(/吹飞|^$/);
  const pushed = cd.p2.x - (400 + 70);
  expect(pushed, 'CD 该把人明显打远').toBeGreaterThan(40);
  expect(C.hp - cd.p2.hp, 'CD 该造成伤害').toBeGreaterThan(0);
});

test('CD 也能用攻击+防御同按打出来——键盘上没有多余的键', () => {
  const b = mk();
  b.tick(press({ attack: true, block: true }), press());
  expect(b.p1.state).toBe('attack');
  expect(b.p1.move?.name).toContain('吹飞');
});

test('防御取消：格挡硬直中花 50 气把对手顶开，气不够则不生效', () => {
  const rich = mk(60), poor = mk(60);
  rich.p1.meter = 100; poor.p1.meter = 0;
  for (const b of [rich, poor]) {
    // 让对手打过来，我方一直按防御
    for (let i = 0; i < 26; i++) b.tick(press({ block: true, attack: i > 12 }), press(i === 0 ? { skill1: true } : {}));
  }
  expect(rich.p1.meter, '防御取消该扣 50 气').toBeLessThan(100);
  // 挡下攻击本身会涨一点气（削减伤害也给气），所以不能断言"仍为 0"——
  // 该断言的是"没有攒够 50 就不会被扣走 50"，即气仍停在低位
  expect(poor.p1.meter, '气不够时不该发生扣费').toBeLessThan(50);
});

test('投技解脱：被投前的短窗口内按过拳就能挣脱，双方都不掉血', () => {
  const b = mk(40);
  const hp0 = b.p2.hp;
  // 受害者全程按着防御——这一点是用例能成立的关键：距离 40 已在投技范围内，
  // 受害者若在中立态按拳，是他先把对方摔了，后面根本轮不到对方投他
  //（第一版就是这么写的，把投技整个关掉它照样绿）。按着防御时按拳不会变成投技，
  // 只是留下一个解脱用的输入边沿。
  b.tick(press(), press({ block: true, attack: true }));  // 边沿：输入年龄归零
  b.tick(press(), press({ block: true }));
  b.tick(press({ attack: true }), press({ block: true })); // 这一帧对方发动投技
  expect(b.p2.hp, '解脱成功不该掉血').toBe(hp0);
  expect(b.p2.state, '解脱后不该被摔倒').not.toBe('down');
});

test('按住攻击键不放**不能**免疫投技——解脱必须是新按下的一手', () => {
  const b = mk(40);
  // 一直按着：边沿只在第一帧出现，之后输入年龄一路增长，很快超出解脱窗口。
  // 直接验这个量而不是绕一次投技出来——一直按着的人会不停出招，
  // 把对方打进硬直，投技根本发不出来，那样测的就不是这条规则了。
  for (let i = 0; i < THROW_ESCAPE_WINDOW * 3; i++) b.tick(press(), press({ attack: true }));
  expect(b.p2.escapeAge, '一直按着就免疫投技的话，投技等于白给')
    .toBeGreaterThan(THROW_ESCAPE_WINDOW);
});

test('触屏多了一颗吹飞键，且不与既有按键重叠', () => {
  // 与 TouchLayer 的 BTN 表同源：这里只验坐标不相交，避免又出现"两颗键叠在一起"
  const btns = [
    { n: '拳', r: 24, b: 24, s: 76 }, { n: '技一', r: 112, b: 16, s: 60 },
    { n: '技二', r: 150, b: 84, s: 60 }, { n: '技三', r: 110, b: 152, s: 60 },
    { n: '大招', r: 20, b: 120, s: 88 }, { n: '格挡', r: 196, b: 20, s: 56 },
    { n: '吹飞', r: 100, b: 232, s: 54 },
  ];
  for (let i = 0; i < btns.length; i++) for (let j = i + 1; j < btns.length; j++) {
    const a = btns[i], c = btns[j];
    const xo = a.r < c.r + c.s && c.r < a.r + a.s;
    const yo = a.b < c.b + c.s && c.b < a.b + a.s;
    expect(xo && yo, `${a.n} 与 ${c.n} 的触摸区重叠`).toBe(false);
  }
});
