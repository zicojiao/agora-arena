import { expect, test } from 'vitest';
import { Battle } from '../src/engine/battle';
import { createAi, type AiProfile } from '../src/engine/ai';
import { Camera } from '../src/render/camera';
import { CHARACTERS } from '../src/data/characters';
import { STAGES } from '../src/data/stages';
import { NULL_INPUT } from '../src/engine/types';

// 三条长期挂账的遗留问题，每条都先用无头模拟量出来才动手（数字见各自注释）。

// ── 1. 冲刺穿过腾空的对手 ──────────────────────────────────────────────
// separate() 原来对腾空一方直接 return，牛魔王 sp100 冲进空中的对手时最小间距 -67px
// ——即整个人越到了对手另一侧；其余三人不越过但重叠 27-38px。
test('带冲刺的大招不会从腾空的对手身体里穿过去', () => {
  for (const c of CHARACTERS) {
    const b = new Battle(structuredClone(c), structuredClone(CHARACTERS[0]));
    b.p1.x = 300; b.p2.x = 420; b.p1.meter = 100;
    b.p2.y = 60; b.p2.vy = 8; b.p2.state = 'jump'; // 对手在空中且高度差 < AIR_CLEAR
    b.tick({ ...NULL_INPUT, super: true }, NULL_INPUT);
    let minGap = Infinity;
    for (let i = 0; i < 90; i++) {
      b.tick(NULL_INPUT, NULL_INPUT);
      minGap = Math.min(minGap, b.p2.x - b.p1.x);
    }
    expect(minGap, `${c.name} 的大招越到了对手另一侧`).toBeGreaterThan(0);
  }
});

test('高度差够大时仍可跳过对手（没把正常的跳跃换边一起推没）', () => {
  const b = new Battle(structuredClone(CHARACTERS[0]), structuredClone(CHARACTERS[0]));
  b.p1.x = 400; b.p2.x = 430;
  b.p1.y = 140; b.p1.vy = 2; b.p1.state = 'jump'; // 明显在对手头顶上（> AIR_CLEAR=100）
  const before = b.p2.x;
  b.tick(NULL_INPUT, NULL_INPUT);
  expect(b.p2.x, '高处跳跃时不应该把地面上的对手推开').toBe(before);
});

// ── 2. AI 选到当下放不出来的动作，白站一个决策窗 ────────────────────────
// 改前：boss 档出招按键 64% 落空（冷却中/气槽不足），lv2/lv3 为 25-27%。
test('AI 不会按下冷却中的技能或气槽不足的大招', () => {
  for (const st of STAGES) {
    const boss = CHARACTERS.find(c => c.id === st.bossId)!;
    const b = new Battle(structuredClone(CHARACTERS[0]), structuredClone(boss));
    const ai = createAi(st.ai, 7);
    const foe = createAi(STAGES[0].ai, 3);
    let wasted = 0;
    for (let i = 0; i < 3600 && b.winner === null; i++) {
      const inp = ai(b, 1);
      for (const [key, slot] of [['skill1', 's1'], ['skill2', 's2'], ['skill3', 's3']] as const) {
        if (inp[key] && b.p2.cooldowns[b.p2.def.moves[slot].id] > 0) wasted++;
      }
      // 大招键同按防御 = 蓄气（气不足时那是它唯一的用途，不是白按）。
      // 只有"想放大招却放不出来"才算浪费一个决策窗
      if (inp.super && !inp.block && b.p2.meter < 50) wasted++;
      b.tick(foe(b, 0), inp);
    }
    expect(wasted, `${st.ai.name} 按了 ${wasted} 次放不出来的招`).toBe(0);
  }
});

test('决策帧恰好在硬直里时，这一击等到能动了再按，不整窗作废', () => {
  const P: AiProfile = { name: 't', decideEvery: 30, near: { attack: 1 }, mid: { attack: 1 }, far: { attack: 1 } };
  const b = new Battle(structuredClone(CHARACTERS[0]), structuredClone(CHARACTERS[0]));
  const ai = createAi(P, 5);
  b.p1.x = 400; b.p2.x = 480;
  // 把决策帧推到 AI 处于 hitstun 的那一帧上
  for (let i = 0; i < 29; i++) ai(b, 1);
  b.p2.state = 'hitstun'; b.p2.stun = 10;
  expect(ai(b, 1).attack, '硬直中不应该按（按了也会被吞）').toBe(false);
  b.p2.state = 'idle'; b.p2.stun = 0;
  expect(ai(b, 1).attack, '一恢复行动就该把这一击补上').toBe(true);
  expect(ai(b, 1).attack, '同一个决策窗内不重复按').toBe(false);
});

// ── 3. 大招演出期间镜头钉在发动瞬间的 x ────────────────────────────────
// 改前：出招者冲出 105-157px，镜头最大滞后 104-156px，焦点释放后又漂 168-210px。
test('演出焦点跟着出招者走，滞后与释放后的回漂都大幅收窄', () => {
  for (const c of CHARACTERS) {
    const b = new Battle(structuredClone(c), structuredClone(CHARACTERS[3]));
    b.p1.x = 260; b.p2.x = 440; b.p1.meter = 100;
    const cam = new Camera();
    for (let i = 0; i < 40; i++) { cam.tick(); cam.follow(b.p1.x, b.p2.x); b.tick(NULL_INPUT, NULL_INPUT); }
    b.tick({ ...NULL_INPUT, super: true }, NULL_INPUT);
    const startX = b.p1.x;
    cam.focus = { x: b.p1.x, zoom: 1.45 };
    const m = b.p1.def.moves.sp100;
    let maxLag = 0;
    for (let i = 0; i < m.startup + m.active + m.recovery; i++) {
      b.tick(NULL_INPUT, NULL_INPUT);
      cam.tick(); cam.follow(b.p1.x, b.p2.x, 0); // ← 焦点跟随出招者
      maxLag = Math.max(maxLag, Math.abs(b.p1.x - cam.x));
    }
    const atRelease = cam.x;
    cam.focus = null;
    for (let i = 0; i < 60; i++) { b.tick(NULL_INPUT, NULL_INPUT); cam.tick(); cam.follow(b.p1.x, b.p2.x); }
    // 阈值改成相对量：招式从 64 帧拉到 600 帧后，出招者位移大了几倍，固定的 px 阈值
    // 会把"跟得很好但走得远"误判成回归。真正要守的是"回漂只占位移的一小部分"。
    const travel = Math.abs(b.p1.x - startX);
    const drift = Math.abs(cam.x - atRelease);
    expect(maxLag, `${c.name} 演出期间镜头滞后 ${maxLag.toFixed(0)}px`).toBeLessThan(90);
    // 释放之后镜头**该**回到两人中点——真正要守的是"它停在该停的地方"，
    // 而不是"它没怎么动"。这两条在推开型角色身上会分家：铁扇公主的大招把对手往外推
    // （carry 0.5，全场最低），演出结束时两人隔得最远，镜头当然要走一段才框得住两个人。
    // 原来那条按"回漂 < 位移的三成"判，等于要求每个角色的大招都把对手拖着走——
    // 她回漂 127px、位移只有 93px，被判失败，而画面其实完全正确。
    const mid = (b.p1.x + b.p2.x) / 2;
    expect(Math.abs(cam.x - mid), `${c.name} 释放后镜头没回到两人中点（差 ${Math.abs(cam.x - mid).toFixed(0)}px，`
      + `回漂 ${drift.toFixed(0)}px / 位移 ${travel.toFixed(0)}px）`).toBeLessThan(60);
  }
});

test('KO 慢镜的焦点不跟随（focusWho 传 null 时钉住设定位置）', () => {
  const cam = new Camera();
  cam.focus = { x: 700, zoom: 1.35 };
  for (let i = 0; i < 30; i++) cam.follow(100, 200); // 双方都离焦点很远
  expect(cam.focus.x, 'KO 焦点被跟随逻辑改写了').toBe(700);
  expect(cam.x).toBeGreaterThan(600);
});
