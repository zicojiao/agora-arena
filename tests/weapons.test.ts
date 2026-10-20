import { expect, test } from 'vitest';
import { CHARACTERS } from '../src/data/characters';
import { MOTIONS } from '../src/data/motions';
import { samplePose } from '../src/render/motion';
import { drawWeapon, segEnd, weaponHold, weaponTipOf } from '../src/render/renderer';
import type { WeaponDef } from '../src/engine/types';

// 招式名里满是「火尖枪/如意棒/三尖刀」，画面上却一直空着手——weapon.png 一张都没有，
// 而武器槽只在有贴图时才画。改成程序化兵器，不依赖美术资源。

test('每个角色都配了兵器，形制分得开', () => {
  const kinds = CHARACTERS.map(c => c.weapon?.kind);
  expect(kinds.every(Boolean), '有角色没配兵器').toBe(true);
  // 这里曾按"枪/棍/刀/锤/扇本来就那么几类"放行到只要 4 种——而正是那句话
  // 放过了真正的毛病：共用 mace 的四个人拿的是**九齿钉耙、黄金棍、混铁棍、戚(斧)**，
  // 那不是一类东西的四个变体，是四件不同的兵器被画成了同一根棍子；
  // 后羿更直接，射日的人配了 staff。招式名里写得清清楚楚，画面上认不出来。
  // 现在的标准是：**各人最认得出的那件必须自己成一种**（见下面那条按名字对形制的断言），
  // 剩下真同类的才允许共用——哪吒与红孩儿同持火尖枪、牛魔王与雷震子同为棍——
  // 而共用时**必须在尺寸上分得开**（96/0.28 对 78/0.34，画面上是两件东西）。
  expect(new Set(kinds).size, '兵器形制的分化不够，多半又有人被并进了别人的画法')
    .toBeGreaterThanOrEqual(9);
  const byKind = new Map<string, typeof CHARACTERS>();
  for (const c of CHARACTERS) {
    const k = c.weapon!.kind;
    byKind.set(k, [...(byKind.get(k) ?? []), c]);
  }
  for (const [k, group] of byKind) {
    for (let i = 0; i < group.length; i++) for (let j = i + 1; j < group.length; j++) {
      const a = group[i].weapon!, b = group[j].weapon!;
      const same = Math.abs(a.len - b.len) < 8 && Math.abs(a.grip - b.grip) < 0.04;
      expect(same, `${group[i].name} 与 ${group[j].name} 同为 ${k}，长度/握点也几乎一样——画面上是同一件东西`)
        .toBe(false);
    }
  }
  for (const c of CHARACTERS) {
    const w = c.weapon!;
    expect(w.len, `${c.name} 兵器长度`).toBeGreaterThan(40);
    expect(w.grip, `${c.name} 握点比例应在 0-1 之间`).toBeGreaterThan(0);
    expect(w.grip).toBeLessThan(1);
    expect(w.shaft).toMatch(/^#[0-9a-f]{6}$/i);
    expect(w.edge).toMatch(/^#[0-9a-f]{6}$/i);
  }
});

test('刃尖挂在前手上、顺着前臂朝外——朝向翻转时刃尖跟着镜像', () => {
  const p = samplePose(MOTIONS.idle, 0);
  for (const c of CHARACTERS) {
    const w = c.weapon!;
    const right = weaponTipOf(p, 400, 460, 1, w);
    const left = weaponTipOf(p, 400, 460, -1, w);
    expect(right[0], `${c.name} 面朝右时刃尖应在身体右侧`).toBeGreaterThan(400);
    expect(left[0], `${c.name} 面朝左时刃尖应镜像到左侧`).toBeLessThan(400);
    expect(right[1], `${c.name} 两侧的刃尖高度应一致`).toBeCloseTo(left[1], 6);
  }
});

test('刃尖到握把的距离等于兵器的前段长度（len × (1-grip)）', () => {
  const p = samplePose(MOTIONS.thrust, 5);
  for (const c of CHARACTERS) {
    const w = c.weapon!;
    const { hand } = weaponHold(p, 400, 460, 1);
    const tip = weaponTipOf(p, 400, 460, 1, w);
    const d = Math.hypot(tip[0] - hand[0], tip[1] - hand[1]);
    expect(d, `${c.name} 刃尖距离对不上`).toBeCloseTo(w.len * (1 - w.grip), 4);
  }
});

test('segEnd 与 seg 的几何一致——两处各算一遍必然漂移，所以只留一份', () => {
  // 0 = 正下方，正角度朝面向侧；这是全项目的 FK 约定
  expect(segEnd(0, 0, 0, 10, 1)).toEqual([0, 10]);
  expect(segEnd(0, 0, Math.PI / 2, 10, 1)[0]).toBeCloseTo(10, 6);
  expect(segEnd(0, 0, Math.PI / 2, 10, -1)[0]).toBeCloseTo(-10, 6);
});

test('受击反应按体重/身法分化：越重的人晃得越少、空中翻得越慢', () => {
  const heavy = CHARACTERS.find(c => c.id === 'niumo')!;   // 240 血、最慢
  const quick = CHARACTERS.find(c => c.id === 'wukong')!;  // 最快
  const hRoll = Math.abs(MOTIONS[`${heavy.id}Tumble`].keys.at(-1)!.pose.roll);
  const qRoll = Math.abs(MOTIONS[`${quick.id}Tumble`].keys.at(-1)!.pose.roll);
  expect(qRoll, '轻的人空中该翻得更多').toBeGreaterThan(hRoll);
  expect(MOTIONS[`${heavy.id}Tumble`].frames, '重的人翻一圈该更久').toBeGreaterThan(MOTIONS[`${quick.id}Tumble`].frames);

  const hHit = MOTIONS[`${heavy.id}Hit`].keys[0].pose;
  const qHit = MOTIONS[`${quick.id}Hit`].keys[0].pose;
  expect(Math.abs(qHit.lean), '轻的人被打得该更夸张').toBeGreaterThan(Math.abs(hHit.lean));
  expect(qHit.squash, '轻的人被压得更扁').toBeLessThan(hHit.squash);
});

test('每个角色的四套反应动作都齐全，腾空那套是循环的', () => {
  for (const c of CHARACTERS) {
    for (const suffix of ['Hit', 'HitAlt', 'Tumble', 'Fallen']) {
      expect(MOTIONS[`${c.id}${suffix}`], `${c.name} 缺 ${suffix}`).toBeDefined();
    }
    expect(MOTIONS[`${c.id}Tumble`].loop, `${c.name} 的翻滚必须循环`).toBe(true);
  }
});

// ── 形制真的画得出分别 ────────────────────────────────────────────────
// 上面那条只看数据（kind 字符串两两不同），而**画法**是另一回事：
// drawWeapon 最后一支是 else（钝重头的棍），新形制忘了加分支不会报任何错，
// 只会安静地画成一根棍子——数据上"九种兵器"，画面上还是那根棍。
// 这正是这批角色一开始的样子：九齿钉耙、黄金棍、混铁棍、戚(斧) 四个人共用 mace，
// 射日的后羿拿着 staff；名字在招式里写得清清楚楚，画面上认不出是什么。
//
// 所以这里拿一个只记调用的 ctx 把每种形制各画一遍，比对调用序列。
const CALLS = ['beginPath', 'moveTo', 'lineTo', 'quadraticCurveTo', 'arc', 'ellipse',
  'closePath', 'fill', 'stroke', 'save', 'restore'] as const;

function recorder() {
  const log: string[] = [];
  const ctx = new Proxy({} as Record<string, unknown>, {
    get(_t, k: string) {
      if (CALLS.includes(k as typeof CALLS[number])) {
        return (...a: number[]) => log.push(`${k}(${a.map(v => typeof v === 'number' ? v.toFixed(1) : v).join(',')})`);
      }
      return undefined;      // 属性赋值（strokeStyle/lineWidth…）走 set，不进日志
    },
    set() { return true; },
  }) as unknown as CanvasRenderingContext2D;
  return { ctx, log };
}

function strokeOf(kind: WeaponDef['kind']): string {
  const { ctx, log } = recorder();
  // 几何完全一样，只有形制不同——差异只可能来自画法本身
  drawWeapon(ctx, [100, 100], [140, 100], { kind, len: 90, grip: 0.3, shaft: '#112233', edge: '#445566' }, false);
  return log.join('|');
}

test('九种形制画出来两两不同——漏了分支就会安静地变回一根棍子', () => {
  const kinds: WeaponDef['kind'][] = ['spear', 'staff', 'glaive', 'mace', 'fan', 'bow', 'rake', 'axe', 'sword'];
  // 名册里用到的形制必须都在这张表里，否则这条守门会漏掉新加的那一种
  for (const c of CHARACTERS) {
    expect(kinds, `${c.name} 的形制 ${c.weapon!.kind} 没被这条测试覆盖`).toContain(c.weapon!.kind);
  }
  const seen = new Map<string, string>();
  for (const k of kinds) {
    const s = strokeOf(k);
    expect(s.length, `${k} 什么都没画`).toBeGreaterThan(0);
    expect(seen.has(s), `${k} 和 ${seen.get(s)} 画出来一模一样`).toBe(false);
    seen.set(s, k);
  }
});

test('各人最认得出的那件兵器，形制对得上名字', () => {
  const want: Record<string, WeaponDef['kind']> = {
    houyi: 'bow',        // 射日的人不能拿着一根棍
    bajie: 'rake',       // 九齿钉耙
    xingtian: 'axe',     // 干戚而舞
    zhongkui: 'sword',   // 判官剑
    wukong: 'staff',     // 如意金箍棒
    nezha: 'spear',      // 火尖枪
    tieshan: 'fan',      // 芭蕉扇
    erlang: 'glaive',    // 三尖两刃刀
  };
  for (const [id, kind] of Object.entries(want)) {
    const c = CHARACTERS.find(x => x.id === id)!;
    expect(c.weapon!.kind, `${c.name} 的兵器形制不该是 ${c.weapon!.kind}`).toBe(kind);
  }
});
