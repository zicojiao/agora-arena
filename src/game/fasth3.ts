/**
 * The FastH3 ultimate gauge: a separate, slower meter from the in-engine super meter. It fills from the
 * fight itself — landing damage, taking damage, and a slow passive trickle — and survives across rounds.
 * When full, the player presses F (or taps the gauge) to speak an ultimate that FastH3 Omni renders; the
 * cinematic then lands as a real, unblockable hit.
 */

export const GAUGE_MAX = 100;
/** Gauge per HP of damage dealt. A typical round deals 60–90 damage, so dealing alone fills most of it. */
export const GAUGE_PER_DEALT = 0.9;
/** Gauge per HP of damage taken — a comeback mechanic, half the attacker's rate. */
export const GAUGE_PER_TAKEN = 0.45;
/** Passive fill per logic tick (60 Hz): one point per second, so an idle player still gets there. */
export const GAUGE_PER_TICK = 1 / 60;
/** The FastH3 ultimate removes this share of the opponent's maximum HP. */
export const ULTIMATE_DAMAGE_RATIO = 0.3;

export interface GaugeSample { p1Hp: number; p2Hp: number }

/** Advance the player's gauge by one logic tick, given both fighters' HP before and after the tick. */
export function stepGauge(gauge: number, before: GaugeSample, after: GaugeSample): number {
  const dealt = Math.max(0, before.p2Hp - after.p2Hp);
  const taken = Math.max(0, before.p1Hp - after.p1Hp);
  return Math.min(GAUGE_MAX, gauge + dealt * GAUGE_PER_DEALT + taken * GAUGE_PER_TAKEN + GAUGE_PER_TICK);
}

export const gaugeReady = (gauge: number) => gauge >= GAUGE_MAX;

/** Each F press while the ultimate charges pumps in a little extra power, capped at +10%. */
export const PUMP_BONUS_PER_PRESS = 0.005;
export const PUMP_BONUS_MAX = 0.1;
export const pumpBonus = (presses: number) => Math.min(PUMP_BONUS_MAX, Math.max(0, presses) * PUMP_BONUS_PER_PRESS);

export function ultimateDamage(opponentMaxHp: number, presses = 0): number {
  return Math.round(opponentMaxHp * ULTIMATE_DAMAGE_RATIO * (1 + pumpBonus(presses)));
}

/**
 * The charge meter shown while FastH3 renders. Each stage owns a slice of the bar and creeps toward its end with
 * an easing that never quite arrives, so the bar always moves but never claims "done" before the clip exists.
 * Measured stage lengths: connect ~10 s, upload ~2 s, render ~9 s.
 */
const CHARGE_STAGES: Record<string, [number, number, number]> = {
  connecting: [0, 45, 10], uploading: [45, 58, 2.5], generating: [58, 96, 10], playing: [100, 100, 1], finished: [100, 100, 1],
};
export function chargeLevel(state: string | null, secondsInState: number): number {
  const [from, to, typical] = CHARGE_STAGES[state ?? 'connecting'] ?? CHARGE_STAGES.connecting;
  return from + (to - from) * (1 - Math.exp(-secondsInState / (typical * 0.6)));
}

export interface ParsedUltimate { name: string; description: string }

/**
 * The voice director ends with `ULTIMATE: <Name> — <one cinematic sentence>`. Accepts an em dash, en dash,
 * hyphen or colon as the separator; without one, the first few words become the name.
 */
export function parseUltimate(text: string): ParsedUltimate | null {
  const idx = text.toUpperCase().lastIndexOf('ULTIMATE:');
  if (idx < 0) return null;
  const body = text.slice(idx + 'ULTIMATE:'.length).trim().replace(/^["“]|["”]$/g, '');
  if (!body) return null;
  const split = body.match(/^(.{2,48}?)\s*(?:—|–|-{1,2}|:)\s+(.+)$/s);
  if (split) return { name: split[1].trim().replace(/^["“]|["”]$/g, ''), description: split[2].trim() };
  const words = body.split(/\s+/);
  return { name: words.slice(0, 3).join(' '), description: body };
}

/** The newest announcer turn that carries an ULTIMATE line, complete or still streaming in. */
export function latestUltimate(turns: { role: 'user' | 'assistant'; text: string }[]): ParsedUltimate | null {
  for (let i = turns.length - 1; i >= 0; i--) {
    const turn = turns[i];
    if (turn.role !== 'assistant') continue;
    const parsed = parseUltimate(turn.text);
    if (parsed) return parsed;
  }
  return null;
}

/**
 * Whether the streamed ULTIMATE line is finished. The transcript's per-turn status cannot say: the Agora
 * toolkit reports the turn as ended from its first streamed word, which once locked the move in as just
 * "Golden". A finished line ends its description with a sentence mark.
 */
export function ultimateComplete(u: ParsedUltimate): boolean {
  const d = u.description.trim();
  return d.length >= 8 && d !== u.name && /[.!?…]["”')]?$/.test(d);
}

/** One line the video model can render, from the spoken name plus description. */
export function ultimateBrief(u: ParsedUltimate): string {
  return u.description.toLowerCase().includes(u.name.toLowerCase()) ? u.description : `${u.name}: ${u.description}`;
}
