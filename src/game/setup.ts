import type { AiProfile } from '../engine/ai';
import type { CharacterDef } from '../engine/types';
import { GOAT_ROSTER, VERDANT_ARENA, isOriginalFighterId } from '../data/goats';
import { RUN_AI, STAGES, type StageBg } from '../data/stages';
import { getLang, t } from '../i18n';
import { localizeFighter } from '../i18n/fighters';

/** One painted arena, graded three ways. A CSS filter string is applied once to a cached copy of the art. */
export interface GoatStage { id: string; name: string; time: string; bg: StageBg; preview: string }

export const GOAT_STAGES: GoatStage[] = [
  {
    id: 'daylight', name: 'VERDANT ARENA', time: 'DAYLIGHT',
    bg: VERDANT_ARENA,
    preview: 'none',
  },
  {
    id: 'golden', name: 'VERDANT ARENA', time: 'GOLDEN HOUR',
    bg: {
      ...VERDANT_ARENA, seed: 2027, celestialColor: '#ffc06a',
      artFilter: 'sepia(.6) saturate(1.6) hue-rotate(-18deg) brightness(.86) contrast(1.08)',
      ambient: { kind: 'ember', color: '#ffc06a', count: 16 },
    },
    preview: 'sepia(.6) saturate(1.6) hue-rotate(-18deg) brightness(.86) contrast(1.08)',
  },
  {
    id: 'nightfall', name: 'VERDANT ARENA', time: 'NIGHTFALL',
    bg: {
      ...VERDANT_ARENA, seed: 2028, celestial: 'moon', celestialColor: '#cfe6ff',
      artFilter: 'brightness(.5) saturate(1.25) hue-rotate(12deg) contrast(1.12)',
      ambient: { kind: 'firefly', color: '#9fe8ff', count: 22 },
    },
    preview: 'brightness(.5) saturate(1.25) hue-rotate(12deg) contrast(1.12)',
  },
];

export type DifficultyId = 'rookie' | 'pro' | 'legend';

/** Rookie is a restricted sparring partner; Pro keeps the full move set with gentler reactions. */
export const GOAT_DIFFICULTIES: { id: DifficultyId; name: string; hint: string; ai: AiProfile; hpScale: number }[] = [
  { id: 'rookie', name: 'ROOKIE', hint: 'Very easy · basic attacks only', ai: {
    name: 'rookie', basicOnly: true, decideEvery: 150, react: 0, antiAir: 0, burst: 0, techRate: 0,
    near: { attack: 1 }, mid: { approach: 1 }, far: { approach: 1 },
  }, hpScale: 0.8 },
  { id: 'pro', name: 'PRO', hint: 'A fair fight', ai: {
    // Explicit antiAir also softens projectile reads; the shared controller otherwise defaults to 80%.
    ...STAGES[1].ai, name: 'pro', decideEvery: 32, react: 0.2, antiAir: 0.6,
  }, hpScale: 1 },
  { id: 'legend', name: 'LEGEND', hint: 'Reads your moves, takes a beating', ai: { ...RUN_AI[4], react: 0.6 }, hpScale: 1.05 },
];

/** Rounds needed to win the match (best of three). */
export const ROUNDS_TO_WIN = 2;

export interface MatchSetup { playerId: string; opponentId: string; stageId: string; difficulty: DifficultyId }

export const DEFAULT_SETUP: MatchSetup = { playerId: 'emberpaw', opponentId: 'cloudhop', stageId: 'nightfall', difficulty: 'rookie' };

const LEGACY_FIGHTERS: Record<string, string> = { ronaldo: 'emberpaw', mbappe: 'cloudhop', haaland: 'stoneguard' };
/** Migrate persisted selections while keeping every live roster ID canonical. */
export function normalizeFighterId(value: unknown, fallback = DEFAULT_SETUP.playerId): string {
  const id = typeof value === 'string' ? (LEGACY_FIGHTERS[value] ?? value) : '';
  return isOriginalFighterId(id) ? id : fallback;
}

export function normalizeSetup(value: Partial<MatchSetup>): MatchSetup {
  const playerId = normalizeFighterId(value.playerId);
  let opponentId = normalizeFighterId(value.opponentId, DEFAULT_SETUP.opponentId);
  if (playerId === opponentId) opponentId = GOAT_ROSTER.find(f => f.id !== playerId)!.id;
  return {
    playerId, opponentId,
    stageId: GOAT_STAGES.some(s => s.id === value.stageId) ? value.stageId! : DEFAULT_SETUP.stageId,
    difficulty: GOAT_DIFFICULTIES.some(d => d.id === value.difficulty) ? value.difficulty! : DEFAULT_SETUP.difficulty,
  };
}

/** The fighter in the current interface language (names, move names and lines are translated). */
export const fighterById = (id: string): CharacterDef => localizeFighter(GOAT_ROSTER.find(f => f.id === normalizeFighterId(id))!, getLang());
/** The full roster in the current interface language. */
export const localizedRoster = (): CharacterDef[] => GOAT_ROSTER.map(f => localizeFighter(f, getLang()));
/** Display labels for a stage and a difficulty in the current language. */
export const stageLabel = (stage: GoatStage) => ({ name: t('stage.verdant'), time: t(`stage.${stage.id}` as 'stage.daylight') });
export const difficultyLabel = (id: DifficultyId) => ({ name: t(`difficulty.${id}`), hint: t(`difficulty.${id}.hint`) });
export const stageById = (id: string): GoatStage => GOAT_STAGES.find(s => s.id === id) ?? GOAT_STAGES[0];
export const difficultyById = (id: DifficultyId) => GOAT_DIFFICULTIES.find(d => d.id === id) ?? GOAT_DIFFICULTIES[1];

/** Picking your fighter never leaves you facing yourself: the opponent moves to the next free fighter. */
export function withPlayer(setup: MatchSetup, playerId: string): MatchSetup {
  return normalizeSetup({ ...setup, playerId });
}

/** A fighter definition for the opponent, with the difficulty's HP scale applied. */
export function opponentDef(setup: MatchSetup): CharacterDef {
  const def = structuredClone(fighterById(setup.opponentId));
  def.hp = Math.round(def.hp * difficultyById(setup.difficulty).hpScale);
  if (setup.difficulty === 'rookie') {
    def.speed *= 0.55;
    for (const move of Object.values(def.moves)) move.damage = Math.max(1, Math.min(4, Math.round(move.damage * 0.3)));
    // A normal attack at point-blank range becomes a throw in the engine. Disable that
    // conversion for Rookie so even a grappling character can only land gentle jabs.
    def.grapple = { range: 0, power: 1, cd: def.grapple?.cd ?? 72 };
  }
  return def;
}

export interface Settings {
  sound: boolean;
  /** Use the live Agora voice director; off means type the ultimate instead. */
  voice: boolean;
  clipSeconds: 5.875 | 8 | 10.125;
  showControls: boolean;
}

export const DEFAULT_SETTINGS: Settings = { sound: true, voice: true, clipSeconds: 8, showControls: true };
const SETTINGS_KEY = 'goat-clash:settings';
const SETUP_KEY = 'goat-clash:setup';

function load<T extends object>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? { ...fallback, ...JSON.parse(raw) } : fallback;
  } catch { return fallback; }
}
function save(key: string, value: unknown) {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* private mode: settings just don't persist */ }
}

export const loadSettings = () => load(SETTINGS_KEY, DEFAULT_SETTINGS);
export const saveSettings = (s: Settings) => save(SETTINGS_KEY, s);
export function loadSetup(): MatchSetup {
  const s = normalizeSetup(load(SETUP_KEY, DEFAULT_SETUP));
  save(SETUP_KEY, s);
  return s;
}
export const saveSetup = (s: MatchSetup) => save(SETUP_KEY, normalizeSetup(s));
