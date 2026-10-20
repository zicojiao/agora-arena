import type { Dir, InputFrame } from '../engine/types';

/** 取按下边沿的那几个键。方向/防御是持续状态，按住多久就是多久，不需要锁存 */
export type TapKey = 'jump' | 'attack' | 'skill1' | 'skill2' | 'skill3' | 'super' | 'blowback';

export interface Held {
  left: boolean; right: boolean; jump: boolean; crouch: boolean;
  attack: boolean; skill1: boolean; skill2: boolean; skill3: boolean;
  super: boolean; block: boolean; blowback: boolean;
  /** 两帧之间发生过的"按下"。
   *
   * 边沿是每个逻辑帧采样一次 held 算出来的：pointerdown 与 pointerup 若都落在同一个
   * 逻辑帧的间隙里，两次采样都是 false，这一下就彻底消失了——连引擎那层的先行入力也救不了，
   * 因为它压根没收到。掉帧时更糟：累加器会在一次 rAF 里连跑好几个 tick，读的是同一份
   * held 快照，间隙相应变宽。
   *
   * 这个字段把"按下过"这件事锁住，直到某一帧把它兑现掉。 */
  tap: Partial<Record<TapKey, boolean>>;
}

export function createHeld(): Held {
  return {
    left: false, right: false, jump: false, crouch: false,
    attack: false, skill1: false, skill2: false, skill3: false,
    super: false, block: false, blowback: false,
    tap: {},
  };
}

/** 全部松开：按住的键与锁存的按下一起清掉。
 * alt-tab / 切窗口时 keyup 不会送达，held 里的标志会卡在 true 上（角色回来后还在走）；
 * tap 也必须一起清——否则切回来的瞬间会把切走前那一下补放出来。 */
export function clearHeld(held: Held): void {
  for (const k of Object.keys(held) as (keyof Held)[]) {
    if (k !== 'tap') (held as unknown as Record<string, boolean>)[k] = false;
  }
  held.tap = {};
}

/** 按下一个键：同时置位 held 与 tap。所有输入源都该走这里，否则极短点按会漏 */
export function press(held: Held, k: keyof Held): void {
  if (k === 'tap') return;
  held[k] = true;
  if (k !== 'left' && k !== 'right' && k !== 'crouch' && k !== 'block') held.tap[k as TapKey] = true;
}

export const KEYMAP: Record<string, keyof Held> = {
  KeyA: 'left', KeyD: 'right', KeyW: 'jump', KeyS: 'crouch',
  KeyJ: 'attack', KeyU: 'skill1', KeyI: 'skill2', KeyO: 'skill3',
  KeyK: 'super', KeyL: 'block', KeyH: 'blowback',
};

export function keyboardBind(held: Held, advancedCombat = true): () => void {
  const binding = (code: string) => !advancedCombat && (code === 'KeyK' || code === 'KeyH') ? undefined : KEYMAP[code];
  const down = (e: KeyboardEvent) => { const k = binding(e.code); if (k) { press(held, k); e.preventDefault(); } };
  const up = (e: KeyboardEvent) => { const k = binding(e.code); if (k) held[k] = false; };
  // alt-tab/切窗口时按键的 keyup 不会送达，held 里的标志会卡在 true 上，角色回来后还在走
  const blur = () => clearHeld(held);
  window.addEventListener('keydown', down);
  window.addEventListener('keyup', up);
  window.addEventListener('blur', blur);
  return () => {
    window.removeEventListener('keydown', down);
    window.removeEventListener('keyup', up);
    window.removeEventListener('blur', blur);
  };
}

/** held → 本帧 InputFrame；jump/attack/skill/super 取按下边沿，调用后把 prev 更新为当前值 */
export function toInputFrame(held: Held, prev: Held): InputFrame {
  const edge = (k: TapKey) => (held[k] && !prev[k]) || held.tap[k] === true;
  const i: InputFrame = {
    move: ((held.right ? 1 : 0) - (held.left ? 1 : 0)) as Dir,
    jump: edge('jump'),
    jumpHeld: held.jump,
    attack: edge('attack'),
    skill1: edge('skill1'), skill2: edge('skill2'), skill3: edge('skill3'),
    super: edge('super'),
    block: held.block,
    // 紧急回避 = 防御 + **新按下**的方向。取边沿而不是按住：防御时压着后方向是最常见的
    // 防守握法，看"按住"的话玩家一挡就连滚不止（防御取消·回避那条早就栽过同一个坑）
    roll: held.block && ((held.left && !prev.left) || (held.right && !prev.right)),
    blowback: held.blowback || held.tap.blowback === true,
    crouch: held.crouch,
  };
  // 兑现即清空：一次按下只产生一个边沿
  held.tap = {};
  Object.assign(prev, held);
  prev.tap = {};
  return i;
}
