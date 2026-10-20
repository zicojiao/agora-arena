import { describe, expect, it } from 'vitest';
import { Battle, DOWN_STUN } from '../src/engine/battle';
import { NULL_INPUT } from '../src/engine/types';
import { GOAT_ROSTER } from '../src/data/goats';
import {
  GAUGE_MAX, GAUGE_PER_DEALT, GAUGE_PER_TAKEN, gaugeReady, latestUltimate, parseUltimate, stepGauge, ultimateBrief, ultimateComplete, ultimateDamage,
} from '../src/game/fasth3';
import { DEFAULT_SETUP, GOAT_STAGES, opponentDef, withPlayer } from '../src/game/setup';

const fresh = () => new Battle(structuredClone(GOAT_ROSTER[0]), structuredClone(GOAT_ROSTER[1]), 285, 675);

describe('FastH3 gauge', () => {
  it('fills from damage dealt, damage taken, and a slow passive trickle', () => {
    const idle = stepGauge(0, { p1Hp: 200, p2Hp: 200 }, { p1Hp: 200, p2Hp: 200 });
    expect(idle).toBeGreaterThan(0);
    expect(idle).toBeLessThan(0.1);
    const dealt = stepGauge(0, { p1Hp: 200, p2Hp: 200 }, { p1Hp: 200, p2Hp: 190 });
    const taken = stepGauge(0, { p1Hp: 200, p2Hp: 200 }, { p1Hp: 190, p2Hp: 200 });
    expect(dealt - idle).toBeCloseTo(10 * GAUGE_PER_DEALT);
    expect(taken - idle).toBeCloseTo(10 * GAUGE_PER_TAKEN);
    expect(dealt).toBeGreaterThan(taken);
  });

  it('caps at full and only then is ready', () => {
    expect(stepGauge(99, { p1Hp: 200, p2Hp: 200 }, { p1Hp: 200, p2Hp: 100 })).toBe(GAUGE_MAX);
    expect(gaugeReady(99.9)).toBe(false);
    expect(gaugeReady(GAUGE_MAX)).toBe(true);
  });

  it('fills within a typical round: ~70 damage dealt and ~30 taken over 30 seconds', () => {
    let g = 0;
    for (let t = 0; t < 30 * 60; t++) g = stepGauge(g, { p1Hp: 200, p2Hp: 200 }, { p1Hp: 200, p2Hp: 200 });
    g = stepGauge(g, { p1Hp: 200, p2Hp: 200 }, { p1Hp: 170, p2Hp: 130 });
    expect(g).toBe(GAUGE_MAX);
  });
});

describe('ULTIMATE line parsing', () => {
  it('splits name and description on an em dash, hyphen or colon', () => {
    expect(parseUltimate('Legendary! ULTIMATE: Golden Dragon Volley — Emberpaw kicks a ball that becomes a dragon.'))
      .toEqual({ name: 'Golden Dragon Volley', description: 'Emberpaw kicks a ball that becomes a dragon.' });
    expect(parseUltimate('ULTIMATE: Siu Nova - a tiny sun explodes over the goal')?.name).toBe('Siu Nova');
    expect(parseUltimate('ULTIMATE: Meteor Header: he heads a meteor into the net')?.name).toBe('Meteor Header');
  });

  it('falls back to the first words as the name and ignores text without the marker', () => {
    expect(parseUltimate('ULTIMATE: Thunder hammer volley shakes the stadium')?.name).toBe('Thunder hammer volley');
    expect(parseUltimate('What move should Emberpaw use?')).toBeNull();
  });

  it('reads the ULTIMATE line from the announcer, never from the player', () => {
    const line = 'ULTIMATE: Sun Kick — a sun is kicked.';
    expect(latestUltimate([{ role: 'user', text: line }])).toBeNull();
    expect(latestUltimate([{ role: 'assistant', text: 'Nice!' }, { role: 'assistant', text: line }])?.name).toBe('Sun Kick');
  });

  // Recorded from a real Agora session: the toolkit marked this turn as ended from its first word.
  it('treats a line still streaming in as incomplete', () => {
    const stream = [
      'The arena shakes as EMBERPAW unleashes it! ULTIMATE: Golden',
      'The arena shakes as EMBERPAW unleashes it! ULTIMATE: Golden Dragon Volley',
      'The arena shakes as EMBERPAW unleashes it! ULTIMATE: Golden Dragon Volley — Emberpaw erupts upward,',
    ];
    for (const text of stream) expect(ultimateComplete(parseUltimate(text)!), text).toBe(false);
    const done = parseUltimate(`${stream[2]} scissor-kicking a golden dragon into the net!`)!;
    expect(done.name).toBe('Golden Dragon Volley');
    expect(ultimateComplete(done)).toBe(true);
  });

  it('builds one renderable brief that names the move once', () => {
    expect(ultimateBrief({ name: 'Sun Kick', description: 'a sun is kicked' })).toBe('Sun Kick: a sun is kicked');
    expect(ultimateBrief({ name: 'Sun Kick', description: 'The Sun Kick melts the net' })).toBe('The Sun Kick melts the net');
  });
});

describe('FastH3 ultimate lands as a real engine hit', () => {
  it('queued damage lands on the next tick as an unblockable knockdown with a heavy hit event', () => {
    const b = fresh();
    const dmg = ultimateDamage(b.p2.def.hp);
    b.p2.state = 'block';
    b.queueStrike(0, dmg);
    expect(b.p2.hp).toBe(b.p2.def.hp); // nothing until the fight resumes
    b.tick(NULL_INPUT, NULL_INPUT);
    expect(b.p2.hp).toBe(b.p2.def.hp - dmg);
    expect(b.p2.state).toBe('down');
    expect(b.p2.stun).toBe(DOWN_STUN);
    expect(b.events).toContainEqual(expect.objectContaining({ type: 'hit', attacker: 0, damage: dmg, heavy: true, blocked: false }));
  });

  it('a lethal ultimate wins the round through the normal KO path', () => {
    const b = fresh();
    b.p2.hp = 20;
    b.queueStrike(0, 60);
    for (let i = 0; i < 20 && b.winner === null; i++) b.tick(NULL_INPUT, NULL_INPUT);
    expect(b.p2.hp).toBe(0);
    expect(b.winner).toBe(0);
  });

  it('does nothing once the round is already decided', () => {
    const b = fresh();
    b.winner = 1;
    b.queueStrike(0, 60);
    b.tick(NULL_INPUT, NULL_INPUT);
    expect(b.p2.hp).toBe(b.p2.def.hp);
  });
});

describe('match setup', () => {
  it('never pits a fighter against itself', () => {
    const s = withPlayer({ ...DEFAULT_SETUP, playerId: 'emberpaw', opponentId: 'cloudhop' }, 'cloudhop');
    expect(s.playerId).toBe('cloudhop');
    expect(s.opponentId).not.toBe('cloudhop');
  });

  it('difficulty scales the opponent HP without touching the roster definition', () => {
    const base = GOAT_ROSTER.find(f => f.id === DEFAULT_SETUP.opponentId)!.hp;
    expect(opponentDef({ ...DEFAULT_SETUP, difficulty: 'legend' }).hp).toBeGreaterThan(base);
    expect(opponentDef({ ...DEFAULT_SETUP, difficulty: 'rookie' }).hp).toBeLessThan(base);
    expect(GOAT_ROSTER.find(f => f.id === DEFAULT_SETUP.opponentId)!.hp).toBe(base);
  });

  it('every stage grades the same painted arena', () => {
    expect(new Set(GOAT_STAGES.map(s => s.id)).size).toBe(GOAT_STAGES.length);
    for (const s of GOAT_STAGES) expect(s.bg.artUrl).toBe(`${import.meta.env.BASE_URL}art/verdant-arena.webp`);
  });
});
