import { describe, expect, it } from 'vitest';
import { Battle, createFighter, DOWN_STUN, TECH_WINDOW, GC_COST } from '../src/engine/battle';
import { CHARACTERS } from '../src/data/characters';
import { GOAT_ROSTER } from '../src/data/goats';
import { NULL_INPUT, type Fighter, type Move } from '../src/engine/types';
import { poseForFighter as poseFor } from '../src/render/renderer';
import { spriteAction } from '../src/render/spriteAction';

const mk = () => new Battle(structuredClone(GOAT_ROSTER[0]), structuredClone(GOAT_ROSTER[1]), 400, 480);
const strike = (b: Battle, options: Partial<Move> = {}) => {
  b.hitstop = 0;
  b.p1.x = 400; b.p2.x = 480; b.p1.facing = 1; b.p2.facing = -1;
  b.p1.state = 'attack';
  b.p1.move = { ...b.p1.def.moves.n1, startup: 0, active: 2, recovery: 1, damage: 1,
    knockback: { x: 0, y: 0 }, hitbox: { x: 30, y: 85, w: 100, h: 35 }, ...options };
  b.p1.stateFrame = 0; b.p1.hitCount = 0;
  b.tick(NULL_INPUT, NULL_INPUT);
};
const down = (hp = 100, frame = 30, stun = 22): Fighter => ({
  ...createFighter(CHARACTERS[0], 400, 1), state: 'down', hp, stateFrame: frame, stun,
});

describe('received damage owns the reaction, independent of outgoing attacks', () => {
  it('successive incoming hits alternate the visible pose even when the victim never attacks', () => {
    const b = mk();
    strike(b);
    const first = poseFor(b.p2);
    strike(b);
    expect(b.p2.state).toBe('hitstun');
    expect(b.p2.stateFrame).toBe(0);
    expect(b.p2.hitCount).toBe(0);
    expect(b.p2.hurtCount).toBe(2);
    expect(poseFor(b.p2)).not.toEqual(first);
    const incoming = poseFor(b.p2);
    b.p2.hitCount = 7;
    expect(poseFor(b.p2)).toEqual(incoming);
    const stop = b.hitstop;
    expect(stop).toBeGreaterThan(0);
    b.tick(NULL_INPUT, NULL_INPUT);
    expect(b.hitstop).toBe(stop - 1);
    expect(b.p2.hurtCount).toBe(2);
    expect(poseFor(b.p2)).toEqual(incoming);
  });

  it('grounded high, body and crouched hits and airborne hits have distinct reactions', () => {
    const high = mk(), body = mk(), crouch = mk(), air = mk();
    air.p2.y = 20; air.p2.state = 'jump'; air.p2.vy = 0;
    strike(high);
    strike(body, { hitbox: { x: 30, y: 40, w: 100, h: 30 } });
    // Keep crouch held while receiving a contact below the crouched hurtbox's top.
    crouch.p2.state = 'crouch';
    crouch.p1.state = 'attack'; crouch.p1.move = { ...crouch.p1.def.moves.n1, startup: 0, active: 2,
      damage: 1, knockback: { x: 0, y: 0 }, hitbox: { x: 30, y: 10, w: 100, h: 30 } };
    crouch.tick(NULL_INPUT, { ...NULL_INPUT, crouch: true });
    strike(air);
    expect([high, body, crouch, air].map(b => b.p2.hurtKind)).toEqual(['high', 'body', 'crouch', 'air']);
    const poses = [high, body, crouch, air].map(b => poseFor(b.p2));
    expect(new Set(poses.map(p => JSON.stringify(p))).size).toBe(4);
    const sprites = [high, body, crouch, air].map(b => spriteAction(b.p2));
    expect(new Set(sprites.map(p => JSON.stringify(p))).size).toBe(4);
  });

  it('successful blocks and armored hits do not replace the previous hurt context or restart animation', () => {
    for (const mode of ['block', 'armor'] as const) {
      const b = mk();
      b.p2.hurtCount = 4; b.p2.hurtKind = 'crouch'; b.p2.stateFrame = 7;
      if (mode === 'block') { b.p2.state = 'block'; b.p2.stun = 10; }
      else {
        b.p2.state = 'attack'; b.p2.armorLeft = 1;
        b.p2.move = { ...b.p2.def.moves.n1, startup: 100, armor: 1 };
      }
      const hp = b.p2.hp;
      strike(b, { damage: 10 });
      expect(b.p2.hp).toBeLessThan(hp);
      expect(b.p2.state).toBe(mode === 'block' ? 'block' : 'attack');
      expect(b.p2.stateFrame).toBe(8);
      expect(b.p2.hurtCount).toBe(4);
      expect(b.p2.hurtKind).toBe('crouch');
    }
  });

  it('projectile hits record a reaction; projectile blocks preserve the current guard', () => {
    for (const blocked of [false, true]) {
      const b = mk();
      if (blocked) { b.p2.state = 'block'; b.p2.stun = 10; }
      b.projectiles.push({ owner: 0, x: b.p2.x, y: 50, vx: 0, age: 0, life: 20,
        facing: 1, hit: false, def: { spawnFrame: 0, vx: 0, life: 20, damage: 10,
          hitstun: 14, knockback: { x: 0, y: 0 }, w: 30, h: 30, y: 50, kind: 'beam', color: '#fff' } });
      b.tick(NULL_INPUT, NULL_INPUT);
      expect(b.p2.hp).toBeLessThan(b.p2.def.hp);
      expect(b.p2.hurtCount).toBe(blocked ? 0 : 1);
      expect(b.p2.state).toBe(blocked ? 'block' : 'hitstun');
      if (!blocked) expect(b.p2.hurtKind).toBe('body');
    }
  });

  it('throws, queued ultimates and guard-cancel pushes record the incoming reaction once', () => {
    const thrown = mk();
    thrown.p2.x = 440;
    thrown.tick({ ...NULL_INPUT, attack: true }, NULL_INPUT);
    expect(thrown.events.some(e => e.type === 'throw')).toBe(true);
    expect(thrown.p2.hurtCount).toBe(1);
    expect(thrown.p2.state).toBe('down');

    const queued = mk();
    queued.queueStrike(0, 20); queued.tick(NULL_INPUT, NULL_INPUT);
    expect(queued.p2.hurtCount).toBe(1);
    expect(queued.p2.state).toBe('down');

    const cancelled = mk();
    cancelled.p1.state = 'block'; cancelled.p1.stun = 10; cancelled.p1.meter = GC_COST;
    cancelled.tick({ ...NULL_INPUT, block: true, attack: true }, NULL_INPUT);
    expect(cancelled.events.some(e => e.type === 'guardCancel')).toBe(true);
    expect(cancelled.p2.hurtCount).toBe(1);
    expect(cancelled.p2.hurtKind).toBe('body');
  });
});

describe('knockdown drawing follows actual recovery and KO state', () => {
  it('a KO never visually gets up, even after all stun frames have elapsed', () => {
    for (const def of [CHARACTERS[0], GOAT_ROSTER[0]]) {
      for (const frame of [30, DOWN_STUN, 120, 300]) {
        const f = { ...down(0, frame, DOWN_STUN - frame), def };
        expect(poseFor(f).roll).toBeLessThan(-1.2);
        expect(spriteAction(f).rot).toBeLessThan(-1.2);
      }
    }
  });

  it('early and late tech recover visually before the actual idle transition', () => {
    for (const def of [CHARACTERS[0], GOAT_ROSTER[0]]) {
      for (const techAt of [1, TECH_WINDOW]) {
        const b = mk();
        Object.assign(b.p2, down(100, 0, DOWN_STUN), { def });
        let previousRoll = poseFor(b.p2).roll;
        let lastDownRoll = previousRoll;
        let lastSprite = 0;
        let sawLying = false, sawTech = false;
        for (let tick = 1; tick < 100; tick++) {
          b.tick(NULL_INPUT, { ...NULL_INPUT, block: tick === techAt });
          if (b.events.some(e => e.type === 'tech')) sawTech = true;
          const p = poseFor(b.p2), a = spriteAction(b.p2);
          expect(Math.abs(p.roll - previousRoll)).toBeLessThan(0.55);
          if (b.p2.state !== 'down') break;
          sawLying ||= p.roll < -1.2;
          previousRoll = p.roll; lastDownRoll = p.roll; lastSprite = a.rot;
        }
        expect(sawTech).toBe(true);
        expect(sawLying).toBe(true);
        expect(b.p2.state).toBe('idle');
        expect(Math.abs(lastDownRoll)).toBeLessThan(0.2);
        expect(Math.abs(lastSprite)).toBeLessThan(0.2);
      }
    }
  });

  it('double KO bodies cannot recover when winner is null', () => {
    const b = mk();
    Object.assign(b.p1, down(0, 40, 1));
    Object.assign(b.p2, down(0, 40, 1));
    b.doubleKo = true;
    b.tick(NULL_INPUT, NULL_INPUT);
    expect(b.p1.state).toBe('down');
    expect(b.p2.state).toBe('down');
  });

  it('a lethal grounded jab ends on the floor rather than returning to idle', () => {
    const b = mk();
    b.p2.hp = 1;
    strike(b);
    for (let i = 0; i < 180; i++) b.tick(NULL_INPUT, NULL_INPUT);
    expect(b.winner).toBe(0);
    expect(b.p2.state).toBe('down');
    expect(poseFor(b.p2).roll).toBeLessThan(-1.2);
  });
});
