import { describe, expect, it } from 'vitest';
import { Battle } from '../src/engine/battle';
import { createAi, type AiProfile } from '../src/engine/ai';
import { GOAT_ROSTER } from '../src/data/goats';
import { DEFAULT_SETUP, difficultyById, opponentDef } from '../src/game/setup';

// Freeze the previous Pro as a reference player, so changing the difficulty cannot move the ruler.
const PREVIOUS_PRO: AiProfile = {
  name: 'previous-pro', decideEvery: 26, react: .26,
  near: { attack: 5, block: 2, retreat: 4, skill2: 1, backstep: 2, super: 1 },
  mid: { approach: 3, skill1: 2, skill3: 1, jump: 1, dash: 2, retreat: 2, super: 1 },
  far: { approach: 2, skill1: 4, dash: 3, charge: 2 },
};
function benchmark(profile: AiProfile, difficulty: 'rookie' | 'pro' | 'legend') {
  let wins = 0, matches = 0, skills = 0, supers = 0;
  for (const player of GOAT_ROSTER) for (const cpu of GOAT_ROSTER) {
    if (player.id === cpu.id) continue;
    for (let seed = 1; seed <= 3; seed++) {
      const battle = new Battle(structuredClone(player), opponentDef({ ...DEFAULT_SETUP, opponentId: cpu.id, difficulty }), 285, 675);
      const reference = createAi(PREVIOUS_PRO, seed * 31), opponent = createAi(profile, seed * 73);
      for (let frame = 0; frame < 7200 && battle.winner === null && !battle.timeUp; frame++) {
        const input = opponent(battle, 1);
        if (input.skill1 || input.skill2 || input.skill3) skills++;
        if (input.super && !input.block) supers++;
        battle.tick(reference(battle, 0), input);
      }
      if (battle.winner === 0) wins++;
      matches++;
    }
  }
  return { rate: wins / matches, wins, matches, skills, supers };
}

describe('Pro difficulty tuning', () => {
  it('retains full fighter stats and moves on Pro', () => {
    for (const fighter of GOAT_ROSTER) {
      const cpu = opponentDef({ ...DEFAULT_SETUP, opponentId: fighter.id, difficulty: 'pro' });
      expect(cpu).toEqual(fighter);
    }
  });
  it('is more forgiving than previous Pro while staying between Rookie and Legend', () => {
    const old = benchmark(PREVIOUS_PRO, 'pro');
    const pro = benchmark(difficultyById('pro').ai, 'pro');
    const rookie = benchmark(difficultyById('rookie').ai, 'rookie');
    const legend = benchmark(difficultyById('legend').ai, 'legend');
    console.info('Difficulty reference-player win rates', { old, pro, rookie, legend });
    expect(pro.rate).toBeGreaterThan(old.rate);
    expect(pro.rate).toBeLessThan(old.rate + .15);
    expect(pro.rate).toBeLessThan(rookie.rate - .2);
    expect(pro.rate).toBeGreaterThan(legend.rate);
    expect(pro.skills).toBeGreaterThan(0);
    expect(pro.supers).toBeGreaterThan(0);
  }, 30_000);
});
