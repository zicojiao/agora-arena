import { expect, test } from 'vitest';
import { Battle, THROW_RANGE } from '../src/engine/battle';
import { CHARACTERS } from '../src/data/characters';
import { NULL_INPUT } from '../src/engine/types';

// 投技本来是**所有人共用一套数值**的系统招：谁来投都一样远、一样疼、一样久，
// 于是"投技型角色"这个原型在这套引擎里无从表达。猪八戒是唯一改写它的人。

const bj = () => CHARACTERS.find(c => c.id === 'bajie')!;

/** 在给定间距下贴身按普攻，返回是否投出来了 */
function throwsAt(who: string, gap: number) {
  const me = CHARACTERS.find(c => c.id === who)!;
  const b = new Battle(structuredClone(me), structuredClone(CHARACTERS[0]));
  b.p1.x = 400; b.p2.x = 400 + gap;
  b.tick({ ...NULL_INPUT, attack: true }, { ...NULL_INPUT });
  return b.events.some(e => e.type === 'throw' && e.attacker === 0);
}

test('他抓得比别人远——别人够不着的距离他能投', () => {
  const g = bj().grapple!;
  expect(g.range, '抓取距离没有超过全局默认').toBeGreaterThan(THROW_RANGE);
  // 全局距离之内谁都能投
  expect(throwsAt('bajie', THROW_RANGE - 10), '近处他反而投不出来').toBe(true);
  expect(throwsAt('nezha', THROW_RANGE - 10), '近处哪吒投不出来，用例没成立').toBe(true);
  // 超出全局距离、但在他的距离内：只有他能投
  const between = Math.round((THROW_RANGE + g.range) / 2);
  expect(throwsAt('bajie', between), `隔 ${between}px 他该抓得到`).toBe(true);
  expect(throwsAt('nezha', between), `隔 ${between}px 哪吒不该抓得到`).toBe(false);
});

test('他投得比别人疼——而且比自己的重击还疼', () => {
  const g = bj().grapple!;
  const dmg = Math.round(bj().moves.n3.damage * g.power);
  expect(dmg, '投技伤害没有超过自己的 n3——投技型角色的投技该是他最重的一下')
    .toBeGreaterThan(bj().moves.n3.damage);
  // 实打一次，确认引擎真的按他的倍率算（不是只写在数据里）
  const b = new Battle(structuredClone(bj()), structuredClone(CHARACTERS[0]));
  b.p1.x = 400; b.p2.x = 440;
  const hp0 = b.p2.hp;
  b.tick({ ...NULL_INPUT, attack: true }, { ...NULL_INPUT });
  expect(b.events.some(e => e.type === 'throw'), '没投出来').toBe(true);
  expect(hp0 - b.p2.hp, '掉的血对不上他自己的倍率').toBe(dmg);
});

test('他抓得比别人频繁', () => {
  expect(bj().grapple!.cd, '投技冷却没有比全局默认短').toBeLessThan(72);
});

test('别人一个都没改写投技——这是他一个人的定位', () => {
  for (const c of CHARACTERS) {
    if (c.id === 'bajie') expect(c.grapple, '猪八戒没有自己的投技参数').toBeTruthy();
    else expect(c.grapple, `${c.name} 也改写了投技`).toBeUndefined();
  }
});
