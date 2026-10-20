import { NULL_INPUT } from '../src/engine/types';
import type { CharacterDef, InputFrame, Move, MoveSlot } from '../src/engine/types';
import type { Battle } from '../src/engine/battle';
import { Battle as newBattle, carryOverMeter as carryMeter } from '../src/engine/battle';
/** Best-of-N round scoring (a time-up draw scores for both sides). Kept here for the engine tests. */
export function roundOutcome(
  wins: [number, number], winner: 0 | 1 | null, need: number,
): { done: true; playerWon: boolean } | { done: false; wins: [number, number] } {
  const next: [number, number] = [wins[0] + (winner !== 1 ? 1 : 0), wins[1] + (winner !== 0 ? 1 : 0)];
  if (next[0] >= need || next[1] >= need) return { done: true, playerWon: next[0] >= need };
  return { done: false, wins: next };
}
const outcome = roundOutcome;

export function mv(slot: MoveSlot, over: Partial<Move> = {}): Move {
  const isSkill = slot === 's1' || slot === 's2' || slot === 's3';
  return {
    id: `t_${slot}`, slot, name: slot, damage: 10,
    startup: 3, active: 3, recovery: 5, hitstun: 12,
    knockback: { x: 6, y: 0 },
    cooldown: isSkill ? 120 : 0,
    meterCost: slot === 'sp50' ? 50 : slot === 'sp100' ? 100 : 0,
    hitbox: { x: 20, y: 50, w: 60, h: 40 }, motionId: 'punch', fx: [],
    ...over,
  };
}

export function testChar(over: Partial<CharacterDef> = {}): CharacterDef {
  return {
    id: 'test', name: '木桩', role: '测试用', hp: 100, speed: 4, jumpVel: 16,
    quotes: { win: '木桩不倒。', lose: '木桩倒了。', taunt: '来啊。', intro: '站着不动。' }, ending: '测试结局',
    width: 60, height: 150, palette: { main: '#888888', accent: '#cccccc' },
    moves: {
      n1: mv('n1'), jA: mv('jA'), n2: mv('n2'), n3: mv('n3'),
      s1: mv('s1'), s2: mv('s2'), s3: mv('s3'),
      sp50: mv('sp50'), sp100: mv('sp100'),
    },
    ...over,
  };
}

export function press(over: Partial<InputFrame> = {}): InputFrame {
  return { ...NULL_INPUT, ...over };
}

/** 双方空输入跑 n 帧 */
export function run(b: Battle, n: number) {
  for (let i = 0; i < n; i++) b.tick(press(), press());
}

/**
 * 按 **App 实际的打法**跑一整场三局两胜，返回玩家有没有过关。
 *
 * 抽出来是因为这段模型此前写在四个测试里各一份（pickFairness / meterCarry /
 * comboDamage 的多回合部分 / 各种临时脚本），而引擎这几十轮加了不少跨回合的东西——
 * 最近一次就分家了：加了「气槽跨回合保留」之后，pickFairness 仍然每回合从 0 开始，
 * 它量的"闯关有多难"于是不再是真实难度（哪吒关4 因此被记成 5%，实际是 25%）。
 *
 * 与 App 对齐的三件事，改 App 时这里也要跟着改：
 *   ① 每回合新建 Battle（血量与位置复位）
 *   ② 气槽用 carryOverMeter 带过去
 *   ③ BOSS 按关卡缩放血量与伤害
 */
export function playMatch(opts: {
  me: CharacterDef;
  boss: CharacterDef;
  hpScale: number;
  dmgScale: number;
  myAi: (b: Battle, who: 0 | 1) => InputFrame;
  bossAi: (b: Battle, who: 0 | 1) => InputFrame;
  roundsToWin?: number;
  roundTime: number;
  /** 每个回合结束时回调，给需要逐回合统计的测试用 */
  onRound?: (b: Battle) => void;
}): boolean {
  const need = opts.roundsToWin ?? 2;
  let wins: [number, number] = [0, 0];
  let carry: [number, number] = [0, 0];
  for (let guard = 0; guard < need * 2 + 1; guard++) {
    const boss = structuredClone(opts.boss);
    boss.hp = Math.round(boss.hp * opts.hpScale);
    for (const m of Object.values(boss.moves)) m.damage = Math.round(m.damage * opts.dmgScale);
    const b = new newBattle(structuredClone(opts.me), boss);
    b.p1.meter = carryMeter(carry[0]);
    b.p2.meter = carryMeter(carry[1]);
    for (let f = 0; f < opts.roundTime && b.winner === null && !b.timeUp && !b.doubleKo; f++) {
      b.tick(opts.myAi(b, 0), opts.bossAi(b, 1));
    }
    opts.onRound?.(b);
    carry = [b.p1.meter, b.p2.meter];
    const r = outcome(wins, b.winner, need);
    if (r.done) return r.playerWon;
    wins = r.wins;
  }
  return false;
}


export type El = { type: unknown; props?: Record<string, unknown> };
const isEl = (n: unknown): n is El => typeof n === 'object' && n !== null && 'type' in n && 'props' in n;

/** 在 React 元素树里找出满足条件的节点。选人页那几条断言都要用，
 * 此前在两个测试文件里各有一份。 */
export function find(node: unknown, pred: (e: El) => boolean, out: El[] = []): El[] {
  if (node == null || typeof node === 'boolean') return out;
  if (Array.isArray(node)) { for (const n of node) find(n, pred, out); return out; }
  if (!isEl(node)) return out;
  if (pred(node)) out.push(node);
  find(node.props?.children, pred, out);
  return out;
}
