import { expect, test } from 'vitest';
import { Battle } from '../src/engine/battle';
import { CHARACTERS } from '../src/data/characters';
import { NULL_INPUT } from '../src/engine/types';

// 近身命中与投射物命中是两条独立的结算路径。后加的规则很容易只落在其中一条上——
// 实测就漏过两条：反击命中与 MAX 加成都只做在近身那条，
// 三个角色的投射物（乾坤圈 / 天眼光束 / 怒吼震慑）一概吃不到。

const SHOOTERS = [
  { id: 'nezha', slot: 'skill2' as const, name: '乾坤圈' },
  { id: 'erlang', slot: 'skill1' as const, name: '天眼光束' },
  { id: 'niumo', slot: 'skill3' as const, name: '怒吼震慑' },
];

/** 这些招式**自带近身判定框**（最远伸到 340px），对手放得太近的话打中的是那一下、
 * 不是飞出去的实物。间距取 400 就越过了所有人的近身框，只有实物够得着。
 *（第一版用的 320，红检时把投射物的反击判定整个关掉测试照样绿——量的根本是近身命中。） */
const FAR = 400;

/** 放一记投射物打向对手，返回第一次命中的事件 */
function shoot(id: string, slot: 'skill1' | 'skill2' | 'skill3',
  setup: (b: Battle) => void = () => {}) {
  const c = structuredClone(CHARACTERS.find(x => x.id === id)!);
  const b = new Battle(c, structuredClone(c), 300, 300 + FAR);
  setup(b);
  for (let f = 0; f < 200; f++) {
    b.tick({ ...NULL_INPUT, [slot]: f === 0 }, { ...NULL_INPUT });
    const h = b.events.find(e => e.type === 'hit' && e.attacker === 0);
    if (h && h.type === 'hit') return h;
  }
  return null;
}

test('三个角色的投射物都打得到人，而且打中的确实是实物不是近身框', () => {
  for (const s of SHOOTERS) {
    const c = CHARACTERS.find(x => x.id === s.id)!;
    const m = c.moves[s.slot === 'skill1' ? 's1' : s.slot === 'skill2' ? 's2' : 's3'];
    expect(m.hitbox.x + m.hitbox.w, `${s.name} 的近身框伸到 ${m.hitbox.x + m.hitbox.w}，比 FAR 还远`)
      .toBeLessThan(FAR);
    expect(shoot(s.id, s.slot), `${s.name} 一次都没打中`).not.toBeNull();
  }
});

test('投射物也吃 MAX 加成——不能只有近身招享受', () => {
  for (const s of SHOOTERS) {
    const plain = shoot(s.id, s.slot)!;
    const maxed = shoot(s.id, s.slot, b => { b.p1.maxMode = 600; })!;
    expect(maxed.damage, `${s.name} 在 MAX 状态下伤害没变（${plain.damage} → ${maxed.damage}）`)
      .toBeGreaterThan(plain.damage);
  }
});

test('投射物也能打出反击命中——对手正在出招时被打中', () => {
  // 站着不动的对手不该算反击
  for (const s of SHOOTERS) {
    expect(shoot(s.id, s.slot)!.counter, `${s.name} 打中站着不动的人却算了反击`).toBeFalsy();
  }
  // 让对手不停出招，飞行物落在他的起手/判定帧上就该算反击
  let sawCounter = false, sawHit = false;
  for (const s of SHOOTERS) {
    for (let phase = 0; phase < 12 && !sawCounter; phase++) {
      const c = structuredClone(CHARACTERS.find(x => x.id === s.id)!);
      const b = new Battle(c, structuredClone(c), 300, 300 + FAR);
      for (let f = 0; f < 200; f++) {
        b.tick({ ...NULL_INPUT, [s.slot]: f === 0 }, { ...NULL_INPUT, attack: f === phase * 4 + 8 });
        const h = b.events.find(e => e.type === 'hit' && e.attacker === 0);
        if (h && h.type === 'hit') { sawHit = true; if (h.counter) sawCounter = true; break; }
      }
    }
  }
  expect(sawHit, '用例没成立：飞行物一次都没打中').toBe(true);
  expect(sawCounter, '飞行物打在对手起手帧里也不算反击').toBe(true);
});

// 第三条伤害路径：投技。它既不走近身结算也不走投射物结算，后加的规则同样漏了——
// 伤害写死 12（四个角色一样疼，而他们的 n3 是 12/13/13/15）、不吃 MAX 加成、
// 气槽收益写死 6 而不是按伤害算。

test('投技伤害按角色推导，不是四个人一个数', () => {
  const dmgs = CHARACTERS.map(c => {
    const b = new Battle(structuredClone(c), structuredClone(c), 300, 340);
    const hp0 = b.p2.hp;
    for (let f = 0; f < 20 && b.p2.hp === hp0; f++) b.tick({ ...NULL_INPUT, attack: f === 0 }, { ...NULL_INPUT });
    return { name: c.name, dmg: hp0 - b.p2.hp, n3: c.moves.n3.damage };
  });
  const report = dmgs.map(d => `${d.name} ${d.dmg}`).join('  ');
  expect(new Set(dmgs.map(d => d.dmg)).size, `四个角色投技伤害一模一样　${report}`).toBeGreaterThan(1);
  // 抡人的（n3 最重）该比扎人的疼
  const heavy = dmgs.reduce((a, b) => (b.n3 > a.n3 ? b : a));
  const light = dmgs.reduce((a, b) => (b.n3 < a.n3 ? b : a));
  expect(heavy.dmg, `${heavy.name}（n3 ${heavy.n3}）投技不比 ${light.name}（n3 ${light.n3}）疼　${report}`)
    .toBeGreaterThan(light.dmg);
});

test('投技也吃 MAX 加成', () => {
  for (const c of CHARACTERS) {
    const run = (maxed: boolean) => {
      const b = new Battle(structuredClone(c), structuredClone(c), 300, 340);
      if (maxed) b.p1.maxMode = 600;
      const hp0 = b.p2.hp;
      for (let f = 0; f < 20 && b.p2.hp === hp0; f++) b.tick({ ...NULL_INPUT, attack: f === 0 }, { ...NULL_INPUT });
      return hp0 - b.p2.hp;
    };
    expect(run(true), `${c.name} 在 MAX 状态下投技伤害没变`).toBeGreaterThan(run(false));
  }
});

test('投技的气槽收益按伤害算，双方都涨', () => {
  const c = CHARACTERS[3];   // 牛魔王：投技最疼，涨气也该最多
  const b = new Battle(structuredClone(c), structuredClone(c), 300, 340);
  const m0 = b.p1.meter, v0 = b.p2.meter;
  for (let f = 0; f < 20 && b.p2.hp === b.p2.def.hp; f++) b.tick({ ...NULL_INPUT, attack: f === 0 }, { ...NULL_INPUT });
  expect(b.p1.meter - m0, '投人的一方没涨气').toBeGreaterThan(0);
  expect(b.p2.meter - v0, '挨投的一方没涨气——命中那条路上是涨的').toBeGreaterThan(0);
  expect(b.p1.meter - m0, '攻方涨气不该少于受方').toBeGreaterThan(b.p2.meter - v0);
});

test('投射物打倒也要重设「能不能受身」——不能沿用上一次击倒的值', () => {
  // 当前三个投射物都不击倒（kb.y=0、没标 knockdown），所以这条路平时走不到；
  // 但 stepProjectiles 里那条 knockdown 分支就在代码里，谁加一个会击倒的飞行物就会踩上。
  // 这里显式造一个来把那条路真的走一遍。
  const c = structuredClone(CHARACTERS.find(x => x.id === 'niumo')!);
  (c.moves.s3 as { projectile?: { knockdown?: boolean } }).projectile!.knockdown = true;
  const b = new Battle(c, structuredClone(c), 300, 300 + FAR);
  b.p2.techable = false;            // 假装上一次是被投技打倒的（硬直击倒）
  let downed = false;
  for (let f = 0; f < 200 && !downed; f++) {
    b.tick({ ...NULL_INPUT, skill3: f === 0 }, { ...NULL_INPUT });
    if (b.p2.state === 'down') downed = true;
  }
  expect(downed, '用例没成立：飞行物没把人打倒').toBe(true);
  expect(b.p2.techable, '飞行物打倒后仍沿用着上一次的「不能受身」').toBe(true);
});
