import { afterEach, describe, expect, it, vi } from 'vitest';
import { Battle } from '../src/engine/battle';
import { createAi } from '../src/engine/ai';
import { NULL_INPUT, type InputFrame } from '../src/engine/types';
import { GOAT_ROSTER } from '../src/data/goats';
import { DEFAULT_SETUP, difficultyById, loadSetup, opponentDef } from '../src/game/setup';

const rookie = difficultyById('rookie');
const forbidden = ['jump', 'jumpHeld', 'skill1', 'skill2', 'skill3', 'super', 'block', 'roll', 'blowback', 'crouch'] as const;
const cpuDef = (id: string) => opponentDef({ ...DEFAULT_SETUP, difficulty: 'rookie', opponentId: id });

afterEach(() => vi.unstubAllGlobals());

describe('beginner-friendly Rookie CPU', () => {
  it('starts new players on Rookie while preserving a saved Pro selection', () => {
    expect(DEFAULT_SETUP.difficulty).toBe('rookie');
    vi.stubGlobal('localStorage', { getItem: () => JSON.stringify({ ...DEFAULT_SETUP, difficulty: 'pro' }), setItem: vi.fn() });
    expect(loadSetup().difficulty).toBe('pro');
  });
  it('never emits advanced inputs even with full meter, a landed combo or aggressive character bias', () => {
    for (const fighter of GOAT_ROSTER) {
      const b = new Battle(structuredClone(GOAT_ROSTER[0]), cpuDef(fighter.id), 400, 480);
      b.p2.meter = 100;
      b.p2.def.aiBias = { near: { super: 999, skill1: 999, skill2: 999, skill3: 999, charge: 999 } };
      const ai = createAi(rookie.ai, 19);
      for (let f = 0; f < 600; f++) {
        // A confirmed skill or jab used to bypass the difficulty table and cancel into a super.
        b.p2.state = f % 3 === 0 ? 'attack' : 'idle';
        b.p2.move = b.p2.def.moves[f % 2 === 0 ? 'n1' : 's1'];
        b.p2.hitCount = 1;
        b.p2.hp = 1;
        const input = ai(b, 1);
        for (const key of forbidden) expect(input[key], `${fighter.id}: ${key}`).toBe(false);
      }
    }
  });

  it('only lands occasional single jabs, without throws, combos or supers', () => {
    const b = new Battle(structuredClone(GOAT_ROSTER[0]), cpuDef('stoneguard'), 400, 480);
    b.p1.def.hp = b.p1.hp = 9999;
    b.p2.meter = 100;
    const ai = createAi(rookie.ai, 3);
    const slots = new Set<string>(); let attacks = 0;
    for (let f = 0; f < 3600 && b.winner === null; f++) {
      const input = ai(b, 1); if (input.attack) attacks++;
      b.tick(NULL_INPUT, input);
      if (b.p2.state === 'attack' && b.p2.move) slots.add(b.p2.move.slot);
      expect(b.events.some(e => (e.type === 'super' && e.who === 1) || (e.type === 'throw' && e.attacker === 1))).toBe(false);
    }
    expect(slots).toEqual(new Set(['n1']));
    expect(attacks).toBeGreaterThan(0);
    expect(attacks).toBeLessThanOrEqual(24);
  });

  it('reduces Rookie HP, speed and damage without changing the roster, Pro or Legend', () => {
    for (const fighter of GOAT_ROSTER) {
      const easy = cpuDef(fighter.id);
      expect(easy.hp).toBeLessThan(fighter.hp);
      expect(easy.speed).toBeLessThanOrEqual(fighter.speed * .6);
      expect(easy.moves.n1.damage).toBeLessThanOrEqual(4);
      expect(easy.moves.n1.damage).toBeLessThan(fighter.moves.n1.damage);
      expect(easy.grapple?.range).toBe(0);
      for (const difficulty of ['pro', 'legend'] as const) {
        const normal = opponentDef({ ...DEFAULT_SETUP, opponentId: fighter.id, difficulty });
        expect(normal.speed).toBe(fighter.speed);
        expect(normal.moves).toEqual(fighter.moves);
        expect(normal.grapple).toEqual(fighter.grapple);
      }
    }
  });

  it('lets a beginner win every roster matchup using only walking and ordinary attacks', () => {
    const failures: string[] = [];
    for (const player of GOAT_ROSTER) for (const cpu of GOAT_ROSTER) {
      if (player.id === cpu.id) continue;
      for (const cadence of [1, 45]) {
        const b = new Battle(structuredClone(player), cpuDef(cpu.id), 285, 675);
        const ai = createAi(rookie.ai, 71 + cadence);
        for (let f = 0; f < 7200 && b.winner === null && !b.timeUp; f++) {
          const dist = Math.abs(b.p2.x - b.p1.x);
          const input: InputFrame = { ...NULL_INPUT, move: dist > 78 ? (b.p2.x > b.p1.x ? 1 : -1) : 0, attack: f % cadence === 0 };
          b.tick(input, ai(b, 1));
        }
        if (b.winner !== 0) failures.push(`${player.id} vs ${cpu.id}, attack every ${cadence} frames`);
      }
    }
    expect(failures).toEqual([]);
  }, 30_000);
});
