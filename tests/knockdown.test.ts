import { expect, test } from 'vitest';
import { Battle, THROW_RANGE, DOWN_STUN } from '../src/engine/battle';
import { CHARACTERS } from '../src/data/characters';
import { MOTIONS } from '../src/data/motions';
import { NULL_INPUT } from '../src/engine/types';

const press = (o: Partial<typeof NULL_INPUT> = {}) => ({ ...NULL_INPUT, ...o });

// 用户反馈两次"怎么打对方都不倒"。查出来三条原因叠在一起：
// ① 所有技能的 knockback.y 都 > 0，全走"击飞→落地"那条路，地面击倒分支一次都没触发过；
// ② 倒地只有 46 帧且没有起身过程，人从躺着瞬移到站着，读不出倒过；
// ③ 自己扔出去的投射物会在对手倒地途中把他打回站立硬直，把击倒取消掉。
// 一般格斗游戏的规矩是：击倒是**招式的属性**（收招/挑空/投技/技能），轻拳永远不倒；
// 倒地期间判定关闭（"压上去"指贴住等他起身，不是打地上的人）。

// 「技能必倒」这条规矩已经作废：曾经每人 9 招里 6 招都击倒，实测倒地占了对局 20.9% 的
// 时间（仅次于出招），一局约 16 次击倒、每 2 秒一次——五分之一的对局时间双方都够不到对方。
// 现在每个角色只留一记击倒必杀 + n3 收招 + 大招/投技/吹飞，其余必杀打完对手还站着，
// 攻势可以接着走（改后倒地降到 12.5%，平均连段 1.80→2.07）。
// 这条用例因此改成：轻击永远不倒，而**每个角色至少有一记击倒必杀**——
// 一记都没有的话，压制就没有起点了。
test('轻击永远不倒，而每个角色至少有一记击倒必杀', () => {
  for (const c of CHARACTERS) {
    let knockdownSkills = 0;
    for (const [slot, key] of [['n1', 'attack'], ['s1', 'skill1'], ['s2', 'skill2'], ['s3', 'skill3']] as const) {
      let downFrames = 0, landed = false;
      // 起手距离要避开这个角色的**抓取距离**：贴身按普攻会自动改投，而投技本来就击倒。
      // 70px 对所有人都够远——直到猪八戒把抓取距离改写到 78px，这条断言当场报
      // 「猪八戒 轻击不该击倒」，而真正击倒的是投技不是轻击。量招式就得先躲开投技。
      const grab = c.grapple?.range ?? THROW_RANGE;
      for (const gap of [Math.max(70, grab + 12), 200, 340]) {
        const b = new Battle(structuredClone(c), structuredClone(c), 400, 400 + gap);
        let n = 0;
        for (let i = 0; i < 220; i++) {
          b.tick(press(i === 0 ? { [key]: true } : {}), press());
          if (b.p2.state === 'down') n++;
        }
        if (c.hp - b.p2.hp > 0) { landed = true; downFrames = Math.max(downFrames, n); }
      }
      expect(landed, `${c.name} ${slot} 在任何距离都没打中，样本作废`).toBe(true);
      if (slot === 'n1') expect(downFrames, `${c.name} 轻击不该击倒`).toBe(0);
      else if (downFrames > DOWN_STUN * 0.8) knockdownSkills++;
    }
    expect(knockdownSkills, `${c.name} 三记必杀一个都打不倒人，压制没有起点`).toBeGreaterThanOrEqual(1);
  }
});

test('倒地够长且带起身过程——不是从躺着瞬移到站着', () => {
  for (const c of CHARACTERS) {
    const m = MOTIONS[`${c.id}Fallen`];
    expect(m, `${c.name} 缺倒地动作`).toBeDefined();
    // 与 DOWN_STUN 对齐，不写字面量——倒地时长从 72 收到 52（实测倒地曾占对局 22%，
    // 每 2.5 秒就有人躺一次）时，写死 72 的断言会误报
    expect(m.frames, '倒地动作要覆盖整个倒地时长').toBeGreaterThanOrEqual(DOWN_STUN);
    const lie = m.keys.find(k => Math.abs(k.t - m.frames * 0.3) < 6)!.pose;
    const rise = m.keys[m.keys.length - 1].pose;
    expect(Math.abs(lie.roll), '中段该是躺着的').toBeGreaterThan(1.2);
    expect(Math.abs(rise.roll), '末段该已经撑起来，接回站立不突兀').toBeLessThan(0.4);
  }
});

test('倒地期间打不到——否则自己的投射物会把击倒取消掉', () => {
  const c = CHARACTERS[0];
  const b = new Battle(structuredClone(c), structuredClone(c), 400, 470);
  for (let i = 0; i < 40; i++) b.tick(press(i === 0 ? { skill3: true } : {}), press());
  // 强制把对手放到倒地，再全力打
  b.p2.state = 'down'; b.p2.stun = 60; b.p2.stateFrame = 0;
  const hp = b.p2.hp;
  for (let i = 0; i < 40; i++) b.tick(press({ attack: i % 8 === 0 }), press());
  expect(b.p2.hp, '倒地期间不该继续掉血').toBe(hp);
});
