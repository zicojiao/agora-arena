import { describe, expect, it } from 'vitest';
import { GOAT_ROSTER } from '../src/data/goats';
import { Battle } from '../src/engine/battle';
import { NULL_INPUT } from '../src/engine/types';
import { DEFAULT_SETUP, opponentDef } from '../src/game/setup';
import { gaugeReady, stepGauge } from '../src/game/fasth3';

// Previous full health, checked against the original definitions before the change.
const previousHp: Record<string, number> = {
  emberpaw: 200, cloudhop: 200, stoneguard: 215, scrapclaw: 196, stormhorn: 195,
  mossbite: 210, pebblepop: 205, puffvolt: 195, cinderveil: 190, tideknuckle: 195,
};

describe('longer Arena fights', () => {
  it('lets both sides survive the amount of damage that previously knocked out every fighter', () => {
    for (const fighter of GOAT_ROSTER) {
      const cpu = opponentDef({ ...DEFAULT_SETUP, opponentId: fighter.id, difficulty: 'pro' });
      const battle = new Battle(structuredClone(fighter), cpu);
      const oldFullHealth = previousHp[fighter.id];
      battle.queueStrike(0, oldFullHealth); battle.tick(NULL_INPUT, NULL_INPUT);
      expect(battle.p2.hp, fighter.id).toBe(oldFullHealth);
      expect(battle.winner).toBeNull();
      battle.queueStrike(1, oldFullHealth); battle.tick(NULL_INPUT, NULL_INPUT);
      expect(battle.p1.hp, fighter.id).toBe(oldFullHealth);
      expect(battle.winner).toBeNull();
    }
  });
  it('can charge the H3 gauge while the opponent still has more than half its health', () => {
    const battle = new Battle(structuredClone(GOAT_ROSTER[0]), structuredClone(GOAT_ROSTER[1]));
    const before = { p1Hp: battle.p1.hp, p2Hp: battle.p2.hp };
    battle.queueStrike(0, 120); battle.tick(NULL_INPUT, NULL_INPUT);
    const gauge = stepGauge(0, before, { p1Hp: battle.p1.hp, p2Hp: battle.p2.hp });
    expect(gaugeReady(gauge)).toBe(true);
    expect(battle.p2.hp).toBeGreaterThan(battle.p2.def.hp / 2);
  });
});
