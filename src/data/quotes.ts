import type { CharacterDef } from '../engine/types';

/**
 * 对手专属台词的取法，**只此一处**。
 *
 * 胜者那句在摆造型时说（GameCanvas），败者这句在结算页说（App）——两处分别内联
 * `?? 回落` 的话，就是同一条规则写了两份；而结算页那两条分支（玩家赢／玩家输）
 * 又各写一遍，等于四份。本项目在规则漂移上栽过五次，不添第六次。
 *
 * 顺带把守门也变简单了：断言直接调这两个函数，不必去源码里扫锚点——
 * 扫锚点这件事本会话已经吃过两次亏（锚点不唯一时，守的是另一行代码）。
 */
export function winQuote(me: CharacterDef, foeId: string): string {
  return me.vs?.[foeId] ?? me.quotes.win;
}

export function loseQuote(me: CharacterDef, foeId: string): string {
  return me.vsLose?.[foeId] ?? me.quotes.lose;
}

/** 开场那一句（关卡横幅第四行），由**对手**对着玩家说。与上面两条同一个回落约定。 */
export function introQuote(me: CharacterDef, foeId: string): string {
  return me.vsIntro?.[foeId] ?? me.quotes.intro;
}

/**
 * 挑衅那一句（头顶浮字）。与上面三条同一个回落约定，但**用法不同**：
 * 它是招式的 name，而挑衅招是按 def 缓存的（tauntMove 里的 `_taunt`）。
 * 所以调用方必须在每次发招时用它**覆盖**缓存对象的 name——
 * 照搬另外三条"取一次就显示"的用法，会让台词锁死在第一个对手身上。
 */
export function tauntQuote(me: CharacterDef, foeId: string): string {
  return me.vsTaunt?.[foeId] ?? me.quotes.taunt;
}
