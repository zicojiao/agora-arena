import { describe, expect, it } from 'vitest';
import { Battle } from '../src/engine/battle';
import { GOAT_ROSTER } from '../src/data/goats';
import type { Dir, InputFrame } from '../src/engine/types';
import { NULL_INPUT } from '../src/engine/types';
import { INPUT_DELAY, Lockstep, decodeInput, encodeInput, stateHash, type InputBatch } from '../src/online/lockstep';

const rng = (seed: number) => () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 2 ** 32; };
function randomInput(r: () => number): InputFrame {
  return {
    ...NULL_INPUT, move: (Math.floor(r() * 3) - 1) as Dir,
    attack: r() < 0.25, jump: r() < 0.05, jumpHeld: r() < 0.1, block: r() < 0.15, crouch: r() < 0.1,
    skill1: r() < 0.03, skill2: r() < 0.03, skill3: r() < 0.03, super: r() < 0.02, blowback: r() < 0.01, roll: r() < 0.02,
  };
}

describe('lockstep input wire format', () => {
  it('round-trips every button, the move axis and the ultimate flag', () => {
    const r = rng(7);
    for (let i = 0; i < 500; i++) {
      const input = { frame: randomInput(r), ult: r() < 0.5, cine: r() < 0.5 };
      expect(decodeInput(encodeInput(input))).toEqual(input);
    }
  });
});

describe('two peers over a laggy, reordering network stay identical', () => {
  it('both simulations match frame for frame', () => {
    const r = rng(42);
    const peers = [0, 1].map(me => ({
      ls: new Lockstep(1, 1, me as 0 | 1),
      battle: new Battle(structuredClone(GOAT_ROSTER[0]), structuredClone(GOAT_ROSTER[1]), 285, 675),
      local: rng(100 + me),
      hashes: [] as number[],
    }));
    // Messages in flight: deliver after a random 2–14 tick delay, in any order.
    const wire: { at: number; to: number; batch: InputBatch }[] = [];
    let stalls = 0;
    for (let clock = 0; clock < 2400; clock++) {
      for (const [i, p] of peers.entries()) {
        for (const m of wire.filter(w => w.to === i && w.at <= clock)) { p.ls.receive(m.batch); wire.splice(wire.indexOf(m), 1); }
        if (!p.ls.ready()) { stalls++; continue; }
        p.ls.schedule({ frame: randomInput(p.local), ult: false });
        const [a, b] = p.ls.take();
        p.battle.tick(a.frame, b.frame);
        p.hashes.push(stateHash(p.battle));
        const batch = p.ls.batch();
        if (batch) wire.push({ at: clock + 2 + Math.floor(r() * 12), to: 1 - i, batch: structuredClone(batch) });
      }
    }
    const n = Math.min(peers[0].hashes.length, peers[1].hashes.length);
    expect(n).toBeGreaterThan(1500);
    expect(peers[0].hashes.slice(0, n)).toEqual(peers[1].hashes.slice(0, n));
    // The fight actually happened (not two idle fighters agreeing on nothing).
    expect(peers[0].battle.p1.hp + peers[0].battle.p2.hp).toBeLessThan(peers[0].battle.p1.def.hp + peers[0].battle.p2.def.hp);
    expect(stalls / 4800).toBeLessThan(0.25);
  });

  it('resends the final input tail after both peers stall and resumes identical battles', () => {
    const peers = [0, 1].map(me => ({
      ls: new Lockstep(1, 1, me as 0 | 1),
      battle: new Battle(structuredClone(GOAT_ROSTER[0]), structuredClone(GOAT_ROSTER[1]), 400, 500),
      local: rng(200 + me),
      hashes: [] as number[],
    }));
    const advance = (deliver: boolean) => {
      const wire: { to: number; batch: InputBatch }[] = [];
      for (const [i, p] of peers.entries()) {
        if (!p.ls.ready()) continue;
        p.ls.schedule({ frame: randomInput(p.local), ult: false });
        const [a, b] = p.ls.take();
        p.battle.tick(a.frame, b.frame);
        p.hashes.push(stateHash(p.battle));
        const batch = p.ls.batch();
        if (batch) wire.push({ to: 1 - i, batch });
      }
      if (deliver) for (const packet of wire) peers[packet.to].ls.receive(packet.batch);
    };
    for (let clock = 0; clock < 120; clock++) advance(true);
    // A brief outage loses the final batches, including their redundant copies. Both clients
    // eventually stop scheduling inputs, so ordinary batch() has nothing new to send.
    for (let clock = 0; clock < INPUT_DELAY * 3; clock++) advance(false);
    expect(peers.every(p => !p.ls.ready())).toBe(true);
    expect(peers.map(p => p.ls.batch())).toEqual([null, null]);
    const stalledTicks = peers.map(p => p.ls.tick);
    for (let clock = 0; clock < 30; clock++) advance(true);
    expect(peers.map(p => p.ls.tick)).toEqual(stalledTicks);

    // The production stalled-loop timer forces this same retry without advancing either tick.
    const retries = peers.map(p => p.ls.batch(true));
    expect(retries.every(Boolean)).toBe(true);
    peers[0].ls.receive(retries[1]!); peers[1].ls.receive(retries[0]!);
    expect(peers.every(p => p.ls.ready())).toBe(true);
    // Duplicate retries must not overwrite input that has already been received.
    peers[0].ls.receive(retries[1]!); peers[1].ls.receive(retries[0]!);
    for (let clock = 0; clock < 240; clock++) advance(true);
    expect(peers[0].ls.tick).toBe(stalledTicks[0] + 240);
    expect(peers[1].ls.tick).toBe(peers[0].ls.tick);
    expect(peers[0].hashes).toEqual(peers[1].hashes);
    expect(peers[0].battle.p1).toEqual(peers[1].battle.p1);
    expect(peers[0].battle.p2).toEqual(peers[1].battle.p2);
  });

  it('the first INPUT_DELAY ticks run without waiting for the network', () => {
    const ls = new Lockstep(1, 1, 0);
    for (let t = 0; t < INPUT_DELAY; t++) { expect(ls.ready()).toBe(true); ls.schedule({ frame: NULL_INPUT, ult: false }); ls.take(); }
    expect(ls.ready()).toBe(false);
  });

  it('ignores batches from another round or match', () => {
    const ls = new Lockstep(2, 3, 0);
    for (let t = 0; t < INPUT_DELAY; t++) { ls.schedule({ frame: NULL_INPUT, ult: false }); ls.take(); }
    ls.receive({ k: 'in', m: 2, r: 2, f: INPUT_DELAY, d: [1] });
    ls.receive({ k: 'in', m: 1, r: 3, f: INPUT_DELAY, d: [1] });
    expect(ls.ready()).toBe(false);
    ls.receive({ k: 'in', m: 2, r: 3, f: INPUT_DELAY, d: [1] });
    expect(ls.ready()).toBe(true);
  });
});
