import { describe, expect, it } from 'vitest';
import { GOAT_ROSTER } from '../src/data/goats';
import { FIGHTER_LOOKS, buildUltimatePrompt } from '../src/game/ultimatePrompt';

const byId = (id: string) => GOAT_ROSTER.find(f => f.id === id)!;
const move = { name: 'Golden Dragon Volley', description: 'a roaring golden dragon bursts from the fist and slams the opponent' };

describe('FastH3 ultimate prompt', () => {
  it('describes every playable fighter', () => {
    for (const f of GOAT_ROSTER) expect(FIGHTER_LOOKS[f.id], f.id).toBeTruthy();
  });

  it('names the attacker, the target, their sides and the hit', () => {
    const p = buildUltimatePrompt({ caster: byId('emberpaw'), target: byId('cloudhop'), casterSide: 'left', move });
    expect(p).toContain('<Subject 1> is Emberpaw, the attacker on the left');
    expect(p).toContain('<Subject 2> is Cloudhop, the target on the right');
    expect(p).toContain('red panda');
    expect(p).toContain('rabbit');
    expect(p).toMatch(/directs the attack to the right, straight at <Subject 2>/);
    expect(p).toMatch(/hits <Subject 2> squarely; <Subject 2> is blasted back to the right/);
    expect(p).toContain('"Golden Dragon Volley"');
  });

  it('mirrors directions when the attacker stands on the right', () => {
    const p = buildUltimatePrompt({ caster: byId('stormhorn'), target: byId('tideknuckle'), casterSide: 'right', move });
    expect(p).toContain('the attacker on the right');
    expect(p).toContain('the target on the left');
    expect(p).toMatch(/to the left, straight at <Subject 2>/);
    expect(p).toMatch(/blasted back to the left/);
  });

  it('stays well inside a prompt budget and never mentions real people or the old theme', () => {
    for (const a of GOAT_ROSTER) for (const b of GOAT_ROSTER) {
      if (a === b) continue;
      const p = buildUltimatePrompt({ caster: a, target: b, casterSide: 'left', move });
      expect(p.length).toBeLessThan(2700);
      expect(p).not.toMatch(/football|ronaldo|mbapp|haaland|paris|superstar/i);
    }
  });
});

describe('universal ultimate direction', () => {
  const requests = [
    'Summon a fire dragon!', 'Summon an ice dragon!', 'Summon a giant burning phoenix!',
    'Summon a tornado!', 'Call down a comet!', 'Create a colossal clockwork octopus!',
  ];
  it.each(requests)('preserves the literal request with the same full-form, scale and impact direction: %s', description => {
    const p = buildUltimatePrompt({ caster: byId('emberpaw'), target: byId('cloudhop'), casterSide: 'left', move: { name: 'Custom Ultimate', description } });
    expect(p).toContain(description);
    expect(p).toContain('Show the complete recognizable form before impact');
    expect(p).toContain('The requested power overrides the caster\'s usual element');
    expect(p).toContain('monumental scale');
    expect(p).toContain('the entire creation and both fighters');
    expect(p).toContain('the attack hits <Subject 2> squarely');
    expect(p).toMatch(/Summoned creatures, objects and environmental phenomena are allowed attack effects/);
    expect(p).not.toMatch(/only these two characters|extra characters|dazed but unhurt|glowing fire and embers/);
  });
  it('uses identical direction for every entity without adding hard-coded creatures or elements', () => {
    const template = requests.map(description => buildUltimatePrompt({ caster: byId('emberpaw'), target: byId('cloudhop'), casterSide: 'left', move: { name: 'Custom Ultimate', description } }).replace(description, '<PLAYER REQUEST>'));
    expect(new Set(template).size).toBe(1);
    const plain = buildUltimatePrompt({ caster: byId('emberpaw'), target: byId('cloudhop'), casterSide: 'right', move: { name: 'Fire Breath', description: 'Breathe fire, no dragons.' } });
    expect(plain).not.toContain('The dragon lunges');
    expect(plain).toContain('to the left, straight at <Subject 2>');
    expect(plain).toContain('blasted back to the left');
  });
});

it('passes the original request through so composition cannot silently replace a requested entity', () => {
  const move = { name: 'Cosmic Strike', description: 'A fiery impact strikes the opponent.', transcript: 'Call down a giant icy comet with a glowing blue tail!' };
  const p = buildUltimatePrompt({ caster: byId('emberpaw'), target: byId('cloudhop'), casterSide: 'left', move });
  expect(p).toContain("Player's original request: Call down a giant icy comet with a glowing blue tail!");
  expect(p).toContain('The original request has priority');
});
