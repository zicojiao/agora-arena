import type { Dir, InputFrame } from '../engine/types';
import { NULL_INPUT } from '../engine/types';

/**
 * Delay-based lockstep. The battle engine is deterministic (no randomness, no wall clock), so two clients
 * that feed it the same inputs in the same order stay identical; only inputs cross the network.
 *
 * Each client schedules the input it samples at tick t for tick t + delay and sends it; tick t runs only
 * when both players' inputs for t are present. The first `delay` ticks of every round are empty input.
 * Measured over Agora RTM between two browsers: ~135 ms round trip (p50), ~193 ms (p90), so 8 frames
 * (133 ms) of input delay covers a one-way trip plus a 2-frame send batch without stalling.
 */
export const INPUT_DELAY = 8;
/** Inputs are sent every BATCH_TICKS ticks; each message repeats the last REDUNDANCY ticks. */
export const BATCH_TICKS = 2;
export const REDUNDANCY = 10;

/** Extra per-tick flags that ride alongside the engine input: `ult` opens an ultimate, `cine` starts its clip. */
export interface NetInput { frame: InputFrame; ult: boolean; cine?: boolean }

const BITS: (keyof InputFrame)[] = ['jump', 'jumpHeld', 'attack', 'skill1', 'skill2', 'skill3', 'super', 'block', 'roll', 'blowback', 'crouch'];
const ULT_BIT = 1 << BITS.length;
const CINE_BIT = 1 << (BITS.length + 1);

/** Compact wire form: move in the low 2 bits ((move + 1)), button bits above. */
export function encodeInput(input: NetInput): number {
  let mask = 0;
  BITS.forEach((key, i) => { if (input.frame[key]) mask |= 1 << i; });
  if (input.ult) mask |= ULT_BIT;
  if (input.cine) mask |= CINE_BIT;
  return (mask << 2) | (input.frame.move + 1);
}

export function decodeInput(value: number): NetInput {
  const move = ((value & 3) - 1) as Dir;
  const mask = value >> 2;
  const frame = { ...NULL_INPUT, move } as InputFrame;
  BITS.forEach((key, i) => { (frame as unknown as Record<string, boolean>)[key] = (mask & (1 << i)) !== 0; });
  return { frame, ult: (mask & ULT_BIT) !== 0, cine: (mask & CINE_BIT) !== 0 };
}

const EMPTY = encodeInput({ frame: NULL_INPUT, ult: false });

export interface InputBatch { k: 'in'; m: number; r: number; f: number; d: number[] }

/** Input buffers for one round of one match. Side 0 is the host (P1, left), side 1 the guest. */
export class Lockstep {
  /** Next tick to simulate. */
  tick = 0;
  private inputs: [Map<number, number>, Map<number, number>] = [new Map(), new Map()];
  private sentUpTo = -1;

  constructor(readonly match: number, readonly round: number, readonly me: 0 | 1, readonly delay = INPUT_DELAY) {
    for (let t = 0; t < delay; t++) { this.inputs[0].set(t, EMPTY); this.inputs[1].set(t, EMPTY); }
  }

  /** Whether both players' inputs for the next tick have arrived. */
  ready(): boolean {
    return this.inputs[0].has(this.tick) && this.inputs[1].has(this.tick);
  }

  /** Record the local input sampled now; it takes effect `delay` ticks later. */
  schedule(input: NetInput) {
    this.inputs[this.me].set(this.tick + this.delay, encodeInput(input));
  }

  /** Inputs for the next tick (call only when ready()). Advances the tick counter. */
  take(): [NetInput, NetInput] {
    const t = this.tick++;
    const pair: [NetInput, NetInput] = [decodeInput(this.inputs[0].get(t)!), decodeInput(this.inputs[1].get(t)!)];
    // Keep a short tail for redundancy; drop anything older.
    this.inputs[0].delete(t - 120); this.inputs[1].delete(t - 120);
    return pair;
  }

  /** Peek at the inputs for the next tick without consuming them. */
  peek(): [NetInput, NetInput] | null {
    if (!this.ready()) return null;
    return [decodeInput(this.inputs[0].get(this.tick)!), decodeInput(this.inputs[1].get(this.tick)!)];
  }

  /** The batch to send now, or null when nothing new has been scheduled since the last one. */
  batch(force = false): InputBatch | null {
    const latest = this.tick + this.delay - 1;
    if (!force && latest - this.sentUpTo < BATCH_TICKS) return null;
    if (latest < this.delay) return null;
    const from = Math.max(this.delay, latest - REDUNDANCY + 1);
    const d: number[] = [];
    for (let t = from; t <= latest; t++) d.push(this.inputs[this.me].get(t) ?? EMPTY);
    this.sentUpTo = latest;
    return { k: 'in', m: this.match, r: this.round, f: from, d };
  }

  /** Apply a batch from the opponent (ignores other rounds and duplicates). */
  receive(batch: InputBatch) {
    if (batch.m !== this.match || batch.r !== this.round) return;
    const them = this.me === 0 ? 1 : 0;
    batch.d.forEach((value, i) => { const t = batch.f + i; if (t >= this.tick && !this.inputs[them].has(t)) this.inputs[them].set(t, value); });
  }
}

/** Cheap state fingerprint compared between peers to detect a desync. */
export function stateHash(b: { frame: number; p1: Fighterish; p2: Fighterish }): number {
  let h = b.frame | 0;
  for (const f of [b.p1, b.p2]) {
    for (const v of [f.x, f.y, f.vx, f.vy, f.hp, f.meter, f.stateFrame]) h = (Math.imul(h, 31) + Math.round(v * 100)) | 0;
    for (let i = 0; i < f.state.length; i++) h = (Math.imul(h, 31) + f.state.charCodeAt(i)) | 0;
  }
  return h;
}
type Fighterish = { x: number; y: number; vx: number; vy: number; hp: number; meter: number; stateFrame: number; state: string };
