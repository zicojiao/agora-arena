import type { Fighter, HurtKind } from '../engine/types';
import type { Motion, Pose } from './motion';
import { lerpPose, samplePose } from './motion';

/** Visual pacing only; combat recovery still uses the engine's unchanged stun/tech durations. */
export const DOWN_FALL_FRAMES = 10;
export const DOWN_RISE_FRAMES = 10;

type DownState = Pick<Fighter, 'stateFrame' | 'stun'> & Partial<Pick<Fighter, 'hp'>>;
export interface KnockdownPhase {
  phase: 'fall' | 'lie' | 'rise';
  progress: number;
}

/** Remaining stun is authoritative for getup: tech shortens it without resetting stateFrame.
 * Dead fighters never enter getup, even when stun becomes negative during the KO outro. */
export function knockdownPhase(f: DownState): KnockdownPhase {
  if (f.stateFrame < DOWN_FALL_FRAMES) {
    return { phase: 'fall', progress: Math.max(0, f.stateFrame / DOWN_FALL_FRAMES) };
  }
  if (!(f.hp !== undefined && f.hp <= 0) && f.stun < DOWN_RISE_FRAMES) {
    return { phase: 'rise', progress: Math.min(1, Math.max(0, 1 - f.stun / DOWN_RISE_FRAMES)) };
  }
  return { phase: 'lie', progress: 1 };
}

/** Sample the existing articulated fall, then rescale only its getup section to actual recovery.
 * Shared fallback fallen has no getup keys, so use an articulated kneeling bridge to idle. */
export function knockdownPose(f: DownState, fallen: Motion, idle: Pose, crouch: Pose): Pose {
  const phase = knockdownPhase(f);
  const flatKeys = fallen.keys.filter(k => Math.abs(k.pose.roll) >= 1.2);
  const settled = flatKeys[Math.min(1, flatKeys.length - 1)] ?? fallen.keys[fallen.keys.length - 1];
  const lie = settled.pose;
  if (phase.phase === 'fall') return samplePose(fallen, phase.progress * settled.t);
  if (phase.phase === 'lie') return lie;
  const k = phase.progress;
  const lastFlat = flatKeys[flatKeys.length - 1] ?? settled;
  let rising: Pose;
  if (lastFlat.t < fallen.frames) {
    const authored = samplePose(fallen, lastFlat.t + k * (fallen.frames - lastFlat.t));
    rising = lerpPose(lie, authored, Math.min(1, k * 5));
  } else {
    const kneel: Pose = { ...crouch, roll: -0.45, lean: 0.25,
      armF: [1.1, 1.2], armB: [-0.9, 1.1], legF: [0.9, -0.8], legB: [-0.7, 0.4] };
    rising = k < 0.55 ? lerpPose(lie, kneel, k / 0.55) : lerpPose(kneel, idle, (k - 0.55) / 0.45);
  }
  // End at the actual idle pose, rather than jumping from a partly crouched last source key.
  return lerpPose(rising, idle, Math.max(0, (k - 0.65) / 0.35));
}

type HurtState = Pick<Fighter, 'y'> & Partial<Pick<Fighter, 'hurtKind' | 'hurtCount'>>;
export function hurtKind(f: HurtState): HurtKind {
  return f.y > 0 ? 'air' : f.hurtKind ?? 'high';
}

export function alternateHurt(f: Pick<HurtState, 'hurtCount'>): boolean {
  return (f.hurtCount ?? 0) > 0 && (f.hurtCount ?? 0) % 2 === 0;
}

/** Preserve each fighter's authored recoil, and layer contact-specific body language onto it. */
export function groundedHurtPose(f: HurtState & Pick<Fighter, 'stateFrame' | 'vx' | 'facing'>, p: Pose, duck: Pose): Pose {
  const kind = hurtKind(f);
  const push = Math.min(Math.abs(f.vx) / 12, 1);
  // A reaction must already read on the contact frame, while hitstop holds stateFrame at zero.
  const impact = 1 - Math.min(1, f.stateFrame / 18) * 0.45;
  if (kind === 'crouch') {
    return { ...p, crouch: Math.max(duck.crouch, p.crouch), legF: duck.legF, legB: duck.legB,
      lean: 0.22 * impact, headTilt: 0.22 * impact, armF: [0.5, 1.3], armB: [0.25, 1.2] };
  }
  if (kind === 'body') {
    return { ...p, lean: (0.35 + push * 0.1) * impact, headTilt: 0.28 * impact,
      crouch: Math.max(8, p.crouch), armF: [0.4, 1.45], armB: [0.3, 1.3] };
  }
  return { ...p, lean: p.lean - push * 0.2,
    roll: p.roll - push * 0.1 * Math.sign(f.vx || 1) * f.facing };
}
