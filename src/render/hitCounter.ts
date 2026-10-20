import { FLOOR_Y } from '../engine/types';
import type { Battle } from '../engine/battle';
import { INK } from './palette';
import { t as tr } from '../i18n';

/**
 * HIT 计数：跟 tickDamageTrail（renderer.ts）同一套做法——状态放渲染层，不进 src/engine/；
 * 消费 battle.events 的 hit 事件累加，一段时间无命中就归零；命中瞬间弹一下（缩放脉冲）。
 * 双方攻击者各记一路：谁在打谁的数字才涨，不看受害者是谁。
 *
 * 推进必须挂在逻辑 tick 上、紧跟 battle.tick() 之后调用（battle.events 只在这一帧有效，
 * 跟 GameCanvas 消费同一份数组生成火花/音效的循环读的是同一份东西）。用 Battle 实例引用
 * 而不是计时器/随机数判断"新一局"，同 tickDamageTrail：每场 Fight 都是 new Battle()，
 * 引用一变就说明是新的一局，计数必须清零，否则上一局的 HIT 数会漏进下一局第一帧。
 */
/**
 * 打完之后数字还留多久（纯显示）。**它不是"连段算不算断"的判据**——
 * 那一条看的是受击方有没有脱离受控（见 stepSide 的 closed）。
 * 早先这两件事是同一个数：无命中满 24 tick 才归零，于是"对手已经缓过来、
 * 你隔 0.3 秒又打中一下"会接着上一段往下数，明明是两次独立的命中却显示成连段。
 * 实测虚报 35/6996（0.5%），最多把 1 段显示成 3 段——不多，但计数器一旦会撒谎，
 * 它教给玩家的东西就是错的（连段计数的意义正是"对手中间没机会动"）。
 */
const HOLD_TICKS = 24;
const PULSE_TICKS = 8;  // 命中瞬间的缩放脉冲时长
/** 「反击」字样停留的 tick 数。0.6 秒——够读完两个字，又不会拖到下一次交手 */
const COUNTER_TICKS = 36;

interface Side { count: number; sinceHit: number; pulse: number; counter: number; closed: boolean }
const noSide = (): Side => ({ count: 0, sinceHit: 0, pulse: 0, counter: 0, closed: false });

interface HitCounterState { battle: Battle | null; p1: Side; p2: Side }
const state: HitCounterState = { battle: null, p1: noSide(), p2: noSide() };

function resetIfNewBattle(b: Battle): void {
  if (state.battle !== b) { state.battle = b; state.p1 = noSide(); state.p2 = noSide(); }
}

/**
 * @param locked 受击方这一帧还在不在受控（hitstun/倒地）里。连段的定义就是这一条：
 *   对手中间起得来，后面再打中的就是新的一段，不该接着上一段数。
 */
function stepSide(s: Side, hit: boolean, counter: boolean, locked: boolean): void {
  if (counter) s.counter = COUNTER_TICKS;
  else if (s.counter > 0) s.counter--;
  if (hit) {
    // 上一段已经收了口，这一下是新的开始——从 1 数起，而不是接着往上加
    if (s.closed) { s.count = 0; s.closed = false; }
    s.count++; s.sinceHit = 0; s.pulse = PULSE_TICKS;
    return;
  }
  // 对手缓过来了：这一段到此为止。数字**不立刻抹掉**（末段太短会一闪而过，读不到），
  // 只是封口——再有命中就重新计数
  if (!locked) s.closed = true;
  s.sinceHit++;
  if (s.sinceHit >= HOLD_TICKS) { s.count = 0; s.closed = false; }
  if (s.pulse > 0) s.pulse--;
}

/** 每逻辑 tick 调一次，紧跟 battle.tick() 之后（同 tickDamageTrail 的调用位置）。只数
 * 没被格挡的命中——格挡不该往连段数上累计，符合这类计数器的通行读法。 */
export function tickHitCounter(b: Battle): void {
  resetIfNewBattle(b);
  const hitP1 = b.events.some(e => e.type === 'hit' && e.attacker === 0 && !e.blocked);
  const hitP2 = b.events.some(e => e.type === 'hit' && e.attacker === 1 && !e.blocked);
  const ctP1 = b.events.some(e => e.type === 'hit' && e.attacker === 0 && e.counter === true);
  const ctP2 = b.events.some(e => e.type === 'hit' && e.attacker === 1 && e.counter === true);
  // 受击方是对面那个：p1 打人时，判"连没连上"要看 p2 起没起得来
  const lockedP2 = b.p2.state === 'hitstun' || b.p2.state === 'down';
  const lockedP1 = b.p1.state === 'hitstun' || b.p1.state === 'down';
  stepSide(state.p1, hitP1, ctP1, lockedP2);
  stepSide(state.p2, hitP2, ctP2, lockedP1);
}

export function getHitCounter(attacker: 0 | 1): { count: number; pulse: number; counter: number } {
  const s = attacker === 0 ? state.p1 : state.p2;
  return { count: s.count, pulse: s.pulse, counter: s.counter };
}

const HEAD_Y = 170; // 贴在受击者头顶上方——比技能名(190)矮一点，两者同时出现时不重叠

/** 世界空间：贴在受击者（不是攻击者）头顶，画在哪个连段正在往哪个人身上打就跟着走。
 * 必须画在 cam.apply/restore 之内，同 banner.drawSkill 的道理。 */
export function drawHitCounter(ctx: CanvasRenderingContext2D, attacker: 0 | 1, victimX: number, victimY: number) {
  const s = attacker === 0 ? state.p1 : state.p2;
  // 「反击」要能单独出现：反击命中常常就是一发，此时 count 还是 1、连段计数没什么可看的，
  // 但这一下值 1.2 倍伤害和 6 帧额外硬直——玩家必须看得见自己读对了招。
  if (s.count <= 0 && s.counter <= 0) return;
  const scale = 1 + (s.pulse / PULSE_TICKS) * 0.5;
  const y = FLOOR_Y - victimY - HEAD_Y;
  if (s.count > 0) {
  ctx.save();
  ctx.translate(victimX, y);
  ctx.scale(scale, scale);
  ctx.textAlign = 'center';
  ctx.lineWidth = 3;
  ctx.strokeStyle = INK.ink;
  ctx.fillStyle = INK.gamboge;
  ctx.font = 'bold 30px sans-serif';
  ctx.textBaseline = 'alphabetic';
  ctx.strokeText(String(s.count), 0, 0);
  ctx.fillText(String(s.count), 0, 0);
  ctx.font = 'bold 13px sans-serif';
  ctx.fillStyle = INK.cinnab;
  ctx.strokeText(tr('canvas.hits'), 0, 16);
  ctx.fillText(tr('canvas.hits'), 0, 16);
  ctx.restore();
  }

  if (s.counter > 0) {
    // 单独一层，压在连段数上方；末段淡出，不做位移——位移会和 HIT 数的缩放脉冲打架
    const t = s.counter / COUNTER_TICKS;
    ctx.save();
    ctx.globalAlpha = Math.min(1, t * 3);
    ctx.translate(victimX, y - 34);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'alphabetic';
    ctx.lineWidth = 3;
    ctx.strokeStyle = INK.ink;
    ctx.fillStyle = INK.cinnab;
    ctx.font = 'bold 22px sans-serif';
    ctx.strokeText(tr('canvas.counter'), 0, 0);
    ctx.fillText(tr('canvas.counter'), 0, 0);
    ctx.restore();
  }
}
