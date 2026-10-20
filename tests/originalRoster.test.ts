import { afterEach, describe, expect, it, vi } from 'vitest';
import { GOAT_ROSTER, VERDANT_ARENA } from '../src/data/goats';
import { DEFAULT_SETUP, GOAT_STAGES, fighterById, loadSetup, normalizeSetup, withPlayer } from '../src/game/setup';
import { buttonView } from '../src/ui/TouchLayer';

afterEach(() => vi.unstubAllGlobals());

describe('original fighter release contract', () => {
  it('ships all ten approved identities with unique move IDs and original media', () => {
    expect(GOAT_ROSTER.map(f => f.id)).toEqual([
      'emberpaw', 'cloudhop', 'stoneguard', 'scrapclaw', 'stormhorn',
      'mossbite', 'pebblepop', 'puffvolt', 'cinderveil', 'tideknuckle',
    ]);
    const moveIds = GOAT_ROSTER.flatMap(f => Object.values(f.moves).map(m => m.id));
    expect(new Set(moveIds).size).toBe(90);
    for (const f of GOAT_ROSTER) {
      expect(f.portraitUrl).toBe(`${import.meta.env.BASE_URL}fighters/${f.id}/portrait.webp`);
      expect(f.footballKit).toBeUndefined();
      expect(f.weapon).toBeUndefined();
      expect(JSON.stringify([f.name, f.role, f.quotes, Object.values(f.moves).map(m => m.name)]))
        .not.toMatch(/ronaldo|mbapp|haaland|paris|football|[\u3400-\u9fff]/i);
      const button = buttonView({ key: 'super', slot: null, fallback: 'SUPER' }, { def: f, meter: 100, cooldowns: {} });
      expect(button.label).toBe('MAX SUPER');
    }
    expect(new Set(GOAT_ROSTER.map(f => `${f.hp}:${f.speed}:${f.jumpVel}:${f.grapple?.range}`)).size).toBeGreaterThan(5);
  });

  it('uses one original arena with three lighting presets', () => {
    expect(VERDANT_ARENA.artUrl).toBe(`${import.meta.env.BASE_URL}art/verdant-arena.webp`);
    expect(GOAT_STAGES).toHaveLength(3);
    expect(new Set(GOAT_STAGES.map(s => s.bg.artUrl)).size).toBe(1);
    expect(new Set(GOAT_STAGES.map(s => s.preview)).size).toBe(3);
  });

});

describe('persisted selection migration', () => {
  it('maps each previous identity to its original replacement', () => {
    expect(fighterById('ronaldo').id).toBe('emberpaw');
    expect(fighterById('mbappe').id).toBe('cloudhop');
    expect(fighterById('haaland').id).toBe('stoneguard');
    expect(normalizeSetup({ ...DEFAULT_SETUP, playerId: 'ronaldo', opponentId: 'mbappe' })).toEqual(DEFAULT_SETUP);
  });

  it('repairs unknown and duplicate IDs and invalid options before use', () => {
    const repaired = normalizeSetup({ playerId: 'removed', opponentId: 'ronaldo', stageId: 'missing', difficulty: 'missing' as never });
    expect(repaired).toEqual(DEFAULT_SETUP);
    for (const fighter of GOAT_ROSTER) {
      const setup = withPlayer({ ...DEFAULT_SETUP, opponentId: fighter.id }, fighter.id);
      expect(setup.playerId).toBe(fighter.id);
      expect(setup.opponentId).not.toBe(fighter.id);
      expect(GOAT_ROSTER.some(f => f.id === setup.opponentId)).toBe(true);
    }
  });

  it('rewrites saved legacy IDs and preserves a valid chosen stage and difficulty', () => {
    const saved = new Map([['goat-clash:setup', JSON.stringify({ playerId: 'haaland', opponentId: 'mbappe', stageId: 'golden', difficulty: 'legend' })]]);
    vi.stubGlobal('localStorage', { getItem: (k: string) => saved.get(k) ?? null, setItem: (k: string, value: string) => saved.set(k, value) });
    expect(loadSetup()).toEqual({ playerId: 'stoneguard', opponentId: 'cloudhop', stageId: 'golden', difficulty: 'legend' });
    expect(JSON.parse(saved.get('goat-clash:setup')!)).toEqual(loadSetup());
  });
});
