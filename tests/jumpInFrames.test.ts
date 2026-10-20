import { expect, test } from 'vitest';
import { Battle } from '../src/engine/battle';
import { CHARACTERS } from '../src/data/characters';
import { NULL_INPUT, type InputFrame } from '../src/engine/types';

// 跳入在拳皇里的契约有两条，缺一条这个中段就不成立：
//   打中了 → 落地能接上地面连段（这是跳入的回报）
//   被挡下 → 落地比对手慢，对手可以反击（这是跳入的代价）
//
// 此前**着地硬直是 0**：落地当帧就能再动。第一条当然成立，第二条也成立（−8 帧），
// 但整个跳入循环仍然四关全线 64% 且不随关卡下坡——因为 AI 不防（挡下率 21%）。
// AI 那个 bug 修掉之后，缺的就只剩这条硬直了。
//
// 值是按这张表定的，不是按胜率拟合的（用胜率调这个杠杆是错的：实测从 0 到 4 帧
// 跳入就从 64% 塌到 29%，不是渐变，拟合不出有意义的中间值）：
//   着地硬直=0 → 命中 +8 / 被挡  −8
//   着地硬直=3 → 命中 +5 / 被挡 −11
//   着地硬直=5 → 命中 +3 / 被挡 −13
//   着地硬直=8 → 命中  0 / 被挡 −16   ← 命中优势归零，连段接不上，第一条契约破了
// 取 3：四个角色的命中优势（+4~+12）都还够得上自己 n1 的起手（4~6）。

const ACT = new Set(['idle', 'walk', 'crouch']);

/** 跳入打到对手身上，返回「守方能动的帧 − 攻方能动的帧」。
 * 正数 = 攻方先动（有利，能接连段），负数 = 守方先动（可以反击） */
function advantage(ci: number, blocked: boolean): number {
  const b = new Battle(structuredClone(CHARACTERS[ci]), structuredClone(CHARACTERS[(ci + 1) % 4]));
  b.p1.x = 380; b.p2.x = 460;
  let hitAt = -1, me = -1, foe = -1;
  for (let f = 0; f < 200; f++) {
    const i: InputFrame = { ...NULL_INPUT };
    if (f === 0) i.jump = true;
    if (b.p1.state === 'jump' && b.p1.stateFrame === 6) i.attack = true;
    i.move = b.p2.x >= b.p1.x ? 1 : -1;
    b.tick(i, { ...NULL_INPUT, block: blocked });   // 守方站防：jA 是中段，蹲防挡不住
    if (hitAt < 0 && b.events.some(e => e.type === 'hit')) hitAt = f;
    if (hitAt >= 0) {
      if (me < 0 && ACT.has(b.p1.state) && b.p1.landStun <= 0 && b.p1.y <= 0) me = f;
      if (foe < 0 && (ACT.has(b.p2.state) || (b.p2.state === 'block' && b.p2.stun <= 0))) foe = f;
      if (me >= 0 && foe >= 0) return foe - me;
    }
  }
  return NaN;
}

test('跳入打中之后接得上地面连段——这是它的回报', () => {
  for (let i = 0; i < CHARACTERS.length; i++) {
    const c = CHARACTERS[i], adv = advantage(i, false), su = c.moves.n1.startup;
    expect(adv, `${c.name} 跳入命中后只有 ${adv} 帧优势，接不上自己 ${su} 帧起手的 n1`)
      .toBeGreaterThanOrEqual(su);
  }
});

// 注意：下面这条**不依赖着地硬直**。把 LAND_STUN_ATK 改成 0 它照样过（被挡时是 −8 帧），
// 因为它记录的是 jA 自身的帧数，不是着地硬直。守着地硬直本身的是再下面那条。
test('跳入被挡下之后要挨打——这是它的代价', () => {
  for (let i = 0; i < CHARACTERS.length; i++) {
    const c = CHARACTERS[i], adv = advantage(i, true);
    expect(adv, `${c.name} 跳入被挡下仍有 ${adv} 帧，中段没有代价`).toBeLessThan(0);
  }
});

test('跳跃落地有硬直——空跳短、出过空中攻击的长', () => {
  // 直接量机制本身：落地那一帧起，隔多少帧才重新能动。
  // 两档要有区别，"空跳落地快、带攻击落地慢"是空跳能成为一个真选项的前提。
  const idle = (withAttack: boolean) => {
    const b = new Battle(structuredClone(CHARACTERS[0]), structuredClone(CHARACTERS[1]));
    b.p1.x = 300; b.p2.x = 900;          // 拉远，别让攻击真打到人身上
    let landed = -1;
    for (let f = 0; f < 200; f++) {
      const i: InputFrame = { ...NULL_INPUT };
      if (f === 0) i.jump = true;
      if (withAttack && b.p1.state === 'jump' && b.p1.stateFrame === 6) i.attack = true;
      const wasAir = b.p1.y > 0;
      b.tick(i, { ...NULL_INPUT });
      if (landed < 0 && wasAir && b.p1.y <= 0) landed = f;
      if (landed >= 0 && b.p1.landStun <= 0 && ACT.has(b.p1.state)) return f - landed;
    }
    return NaN;
  };
  const empty = idle(false), atk = idle(true);
  expect(empty, `空跳落地没有硬直（${empty} 帧）`).toBeGreaterThan(0);
  expect(atk, `出过空中攻击落地没有硬直（${atk} 帧）`).toBeGreaterThan(0);
  expect(atk, `带攻击落地(${atk} 帧)不比空跳落地(${empty} 帧)更久，空跳就不是一个选项了`)
    .toBeGreaterThan(empty);
});
