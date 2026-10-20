import type { Fighter, Move } from '../engine/types';
import { alternateHurt, hurtKind, knockdownPhase } from './damageReaction';
export { DOWN_FALL_FRAMES, DOWN_RISE_FRAMES } from './damageReaction';

/**
 * Full-body action sprites (the footballers) only have six painted poses. The engine still runs the
 * skeleton-era moveset — low sweeps, launchers, air dives, projectiles — so picking a picture by
 * move *name* drew a head-height kick for a sweep that hits the ankles, a guard pose while being hit,
 * and a full-height guard while the hurtbox was crouched.
 *
 * This module picks the picture from what the move actually does (hitbox geometry, slot, motion) and
 * adds a rigid transform per attack phase: wind-up, lunge while the hitbox is live, ease back in
 * recovery. Pure and engine-only so it can be unit tested without a canvas.
 */

export type ActionPose = 'poseIdle' | 'poseRun' | 'posePunch' | 'poseKick' | 'poseBlock' | 'poseSuper';

export type AttackKind = 'super' | 'air' | 'low' | 'rise' | 'cast' | 'rush' | 'strike';

export interface SpriteAction {
  pose: ActionPose;
  /** Horizontal offset in the facing direction (px). */
  dx: number;
  /** Vertical offset, + is down (px). */
  dy: number;
  /** Rotation, + tips forward toward the facing side (radians). */
  rot: number;
  /** Rotation pivot: the hips for upper-body motion, the planted rear foot for kicks so it stays on the
   * floor, or the point between the feet for lying down. */
  pivot: 'hips' | 'feet' | 'base';
  /** Scale; the sprite stays anchored at the feet. */
  sx: number;
  sy: number;
}

/** A hitbox whose top is at or below this height (px above the feet) only reaches the legs. */
export const LOW_HIT_TOP = 62;
/** Crouch: the hurtbox drops to CROUCH_HEIGHT (68); the guard picture is squashed to read as crouched. */
export const CROUCH_SY = 0.72;
/** Knockdown: frames to hit the floor, frames to get back up before the stun ends, lie angle, and lift (px). */
export const DOWN_ANGLE = 1.45;
export const DOWN_LIFT = 38;
export const DOWN_SX = 0.6;

export function attackKind(move: Move, airborne: boolean): AttackKind {
  if (move.meterCost > 0) return 'super';
  if (airborne || move.slot === 'jA') return 'air';
  const top = move.hitbox.y + move.hitbox.h;
  if (move.guard === 'low' || top <= LOW_HIT_TOP) return 'low';
  if (move.motionId === 'cast') return 'cast';
  if (move.motionId === 'upthrust' || move.motionId === 'slam' || move.hitbox.h > move.hitbox.w * 1.15) return 'rise';
  if (move.motionId === 'rush' || (move.dash?.length ?? 0) > 0) return 'rush';
  return 'strike';
}

const base = (pose: ActionPose): SpriteAction => ({ pose, dx: 0, dy: 0, rot: 0, sx: 1, sy: 1, pivot: 'hips' });
const lerp = (a: number, b: number, k: number) => a + (b - a) * Math.max(0, Math.min(1, k));
const easeOut = (k: number) => 1 - (1 - Math.max(0, Math.min(1, k))) ** 2;

type Phase = { name: 'startup' | 'active' | 'recovery'; k: number };

function phaseOf(move: Move, frame: number): Phase {
  if (frame < move.startup) return { name: 'startup', k: move.startup ? frame / move.startup : 1 };
  if (frame < move.startup + move.active) return { name: 'active', k: (frame - move.startup) / Math.max(1, move.active) };
  return { name: 'recovery', k: (frame - move.startup - move.active) / Math.max(1, move.recovery) };
}

/** Per kind: the picture while the hit is live, its pose transform, and the wind-up picture. */
const STRIKES: Record<Exclude<AttackKind, 'super'>, { windup: ActionPose; hit: ActionPose; lunge: number; rot: number; dy: number; sy: number; windupSy: number; pivot: 'hips' | 'feet' }> = {
  // Jab / knuckle: a short step into the punch.
  strike: { windup: 'poseIdle', hit: 'posePunch', lunge: 10, rot: 0, dy: 0, sy: 1, windupSy: 1, pivot: 'hips' },
  // Dashing skills: sprint in, then the punch lands at the end of the dash.
  rush: { windup: 'poseRun', hit: 'posePunch', lunge: 16, rot: 0.04, dy: 0, sy: 1, windupSy: 1, pivot: 'hips' },
  // Sweep / slide: sink low and tip the kick over the planted foot so the boot travels along the floor.
  low: { windup: 'poseBlock', hit: 'poseKick', lunge: 12, rot: 0.3, dy: 0, sy: 0.7, windupSy: CROUCH_SY, pivot: 'feet' },
  // Launchers (bicycle kick, rising volley): crouch, then kick upward with a small hop.
  rise: { windup: 'poseBlock', hit: 'poseKick', lunge: 6, rot: -0.38, dy: -14, sy: 1.04, windupSy: 0.84, pivot: 'feet' },
  // Headers and diving volleys from the air: the kick tipped down toward the opponent.
  air: { windup: 'poseKick', hit: 'poseKick', lunge: 4, rot: 0.85, dy: 0, sy: 1, windupSy: 1, pivot: 'hips' },
  // Projectiles: gather in guard, then release with both hands forward.
  cast: { windup: 'poseBlock', hit: 'poseSuper', lunge: 6, rot: 0.03, dy: 0, sy: 1, windupSy: 0.92, pivot: 'hips' },
};

export function attackAction(move: Move, frame: number, airborne: boolean): SpriteAction {
  const kind = attackKind(move, airborne);
  const phase = phaseOf(move, frame);
  if (kind === 'super') {
    // Supers keep their painted release pose; a gather-down then a forward surge sells the charge.
    const a = base('poseSuper');
    if (phase.name === 'startup') { a.sy = lerp(1, 0.94, phase.k); a.dx = lerp(0, -4, phase.k); }
    else if (phase.name === 'active') { a.sx = 1.04; a.dx = 8; }
    else { a.dx = lerp(8, 0, easeOut(phase.k)); }
    return a;
  }
  const s = STRIKES[kind];
  if (phase.name === 'startup') {
    // Anticipation: lean away from the target and sink into the wind-up picture.
    const a = base(s.windup);
    a.dx = lerp(0, -5, phase.k);
    a.rot = kind === 'air' ? lerp(0.2, s.rot * 0.6, phase.k) : lerp(0, -0.08, phase.k);
    a.sy = lerp(1, s.windupSy, phase.k);
    a.sx = 1 / Math.sqrt(a.sy);
    return a;
  }
  if (phase.name === 'active') {
    // Contact: snap to the hit picture, lunge, slight stretch along the strike.
    const a = base(s.hit);
    const snap = easeOut(Math.min(1, phase.k * 3));
    a.dx = lerp(-5, s.lunge, snap);
    a.rot = s.rot;
    a.dy = s.dy * snap;
    a.sy = s.sy;
    // Kicks stretch along the leg rather than bulking up, so no volume compensation when squashed.
    a.sx = s.pivot === 'feet' ? 1.04 : 1.04 / Math.sqrt(s.sy);
    a.pivot = s.pivot;
    return a;
  }
  // Recovery: hold the follow-through briefly, then settle back to guard.
  const settle = easeOut(Math.max(0, (phase.k - 0.35) / 0.65));
  const a = base(phase.k < 0.6 ? s.hit : 'poseIdle');
  a.dx = lerp(s.lunge, 0, settle);
  a.rot = lerp(s.rot, 0, settle);
  a.dy = lerp(s.dy, 0, settle);
  a.sy = lerp(s.sy, 1, settle);
  a.sx = s.pivot === 'feet' ? 1 : 1 / Math.sqrt(a.sy);
  a.pivot = s.pivot;
  return a;
}

export function spriteAction(f: Pick<Fighter, 'state' | 'stateFrame' | 'stun' | 'move' | 'airborne' | 'vx' | 'vy' | 'y' | 'facing' | 'lowGuard' | 'victory'> & Partial<Pick<Fighter, 'hp' | 'hurtCount' | 'hurtKind'>>): SpriteAction {
  if (f.victory > 0) return base('poseSuper');
  switch (f.state) {
    case 'attack':
      return f.move ? attackAction(f.move, f.stateFrame, f.airborne) : base('poseIdle');
    case 'crouch': {
      const a = base('poseBlock'); a.sy = CROUCH_SY; a.sx = 1.08; return a;
    }
    case 'block': {
      const a = base('poseBlock');
      if (f.lowGuard) { a.sy = CROUCH_SY; a.sx = 1.08; }
      return a;
    }
    case 'hitstun': {
      // Recoil: knocked back away from the attacker, upper body snapping back first.
      const a = base('poseIdle');
      const k = 1 - easeOut(Math.min(1, f.stateFrame / 18)) * 0.35;
      const alt = alternateHurt(f) ? 1.15 : 1;
      const kind = hurtKind(f);
      a.rot = (kind === 'body' || kind === 'crouch' ? 0.25 : kind === 'air' ? -0.62 : -0.34) * k * alt;
      a.dx = -8 * k * alt;
      a.sx = 0.97;
      if (kind === 'crouch') { a.sy = CROUCH_SY; a.sx = 1.08; }
      else if (kind === 'body') a.sy = 0.91;
      return a;
    }
    case 'down': {
      // Fall backward over the heels onto the floor, lie flat, and tip back up as the stun runs out.
      // The lift keeps the rotated picture's back on the floor instead of sinking half of it below.
      const phase = knockdownPhase(f);
      const k = phase.phase === 'fall' ? easeOut(phase.progress)
        : phase.phase === 'rise' ? 1 - easeOut(phase.progress) : 1;
      // The painted stance is wide; narrowing it while lying keeps the front leg from sticking up.
      const a = base('poseIdle');
      a.pivot = 'base';
      a.rot = -DOWN_ANGLE * k;
      a.sx = lerp(1, DOWN_SX, k);
      a.dy = -DOWN_LIFT * Math.sin(DOWN_ANGLE * k);
      a.dx = -10 * k;
      return a;
    }
    case 'jump': {
      const a = base('poseRun');
      a.rot = f.vy > 0 ? -0.1 : 0.12;
      return a;
    }
    case 'backstep': {
      const a = base('poseBlock'); a.rot = -0.12; return a;
    }
    case 'roll': {
      const a = base('poseBlock'); a.sy = 0.8; a.sx = 1.1; return a;
    }
    case 'walk':
      // Backing away in a full sprint pose read as a moonwalk; retreat in guard instead.
      return base(f.vx * f.facing < 0 ? 'poseBlock' : 'poseRun');
    case 'run':
      return base('poseRun');
    default:
      return base('poseIdle');
  }
}
