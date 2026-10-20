import type { CharacterDef, MoveSlot } from '../engine/types';
import type { StageBg } from './stages';
import { NEZHA, NIUMO, WUKONG, ERLANG, HONGHAIER, TIESHAN, BAJIE, LEIZHEN, ZHONGKUI, BAIGU } from './characters';

const asset = (path: string) => `${import.meta.env.BASE_URL}${path}`;
const SLOTS: MoveSlot[] = ['jA', 'n1', 'n2', 'n3', 's1', 's2', 's3', 'sp50', 'sp100'];

interface FighterConcept {
  id: string; name: string; role: string; source: CharacterDef;
  main: string; accent: string;
  moves: string[];
  quotes: CharacterDef['quotes'];
}

function originalFighter(c: FighterConcept): CharacterDef {
  const source = structuredClone(c.source);
  const moves = source.moves;
  SLOTS.forEach((slot, index) => {
    moves[slot].id = `arena_${c.id}_${slot}`;
    moves[slot].name = c.moves[index];
  });
  return {
    ...source, id: c.id, name: c.name, role: c.role, moves,
    // More time to charge and render an H3 ultimate before ordinary attacks end the round.
    hp: source.hp * 2,
    portraitUrl: asset(`fighters/${c.id}/portrait.webp`),
    artUrl: undefined, footballKit: undefined, weapon: undefined, crown: undefined, headless: false,
    vs: undefined, vsLose: undefined, vsIntro: undefined, vsTaunt: undefined,
    palette: { main: c.main, accent: c.accent },
    adorn: { aura: c.accent, dust: c.main },
    superGlow: [c.accent, c.main],
    quotes: c.quotes,
    ending: `${c.name} leaves the floating arena with a new story and a stronger fighting spirit.`,
    endingHard: `The arena lights fade. ${c.name} is already preparing for the next challenge.`,
  };
}

export const ORIGINAL_ROSTER: readonly CharacterDef[] = [
  {
    id: 'emberpaw', name: 'EMBERPAW', role: 'FIRE · COMBOS', source: NEZHA, main: '#df683d', accent: '#ffd08b',
    moves: ['Ember Drop', 'Warmup Jab', 'Cinder Sweep', 'Rising Spark', 'Fire Palm', 'Ember Spiral', 'Blazing Step', 'Sunflare', 'Heart of the Flame'],
    quotes: { intro: 'Small paws. Big spark.', win: 'That warmed me up!', lose: 'Still glowing.', taunt: 'Too toasty?' },
  },
  {
    id: 'cloudhop', name: 'CLOUDHOP', role: 'WIND · SPEED', source: WUKONG, main: '#b6a3db', accent: '#b9efd8',
    moves: ['Cloud Drop', 'Breeze Jab', 'Tailwind Sweep', 'Skyward Kick', 'Gust Step', 'Wind Rush', 'Cyclone Palm', 'Cloudburst', 'Dance of the Sky'],
    quotes: { intro: 'Try to keep up!', win: 'Light on my feet!', lose: 'Just a little turbulence.', taunt: 'Over here!' },
  },
  {
    id: 'stoneguard', name: 'STONEGUARD', role: 'EARTH · POWER', source: NIUMO, main: '#a9764f', accent: '#f1bb5d',
    moves: ['Boulder Drop', 'Stone Jab', 'Gravel Sweep', 'Quarry Uppercut', 'Bedrock Charge', 'Fault Line', 'Stone Pulse', 'Mountain Break', 'The Mountain Wakes'],
    quotes: { intro: 'Take a breath. Then we begin.', win: 'Steady wins.', lose: 'Even mountains move.', taunt: 'No rush.' },
  },
  {
    id: 'scrapclaw', name: 'SCRAPCLAW', role: 'TRICKS · PRESSURE', source: BAIGU, main: '#679798', accent: '#e4b17b',
    moves: ['Scrap Dive', 'Quick Jab', 'Sneaky Sweep', 'Pop Uppercut', 'Scrap Rush', 'Spring Trap', 'Spark Toss', 'Junkyard Jam', 'Brilliant Bad Idea'],
    quotes: { intro: 'I made this up on the way here.', win: 'Perfectly planned. Mostly.', lose: 'Needs one more bolt.', taunt: 'Watch this!' },
  },
  {
    id: 'stormhorn', name: 'STORMHORN', role: 'THUNDER · REACH', source: ERLANG, main: '#4c5c91', accent: '#e4bd6e',
    moves: ['Thunder Drop', 'Static Jab', 'Storm Sweep', 'Bolt Uppercut', 'Thunder Dash', 'Arc Pulse', 'Storm Ring', 'Rolling Thunder', 'Eye of the Storm'],
    quotes: { intro: 'Hear the storm coming.', win: 'The skies are clear.', lose: 'Thunder returns.', taunt: 'Your move.' },
  },
  {
    id: 'mossbite', name: 'MOSSBITE', role: 'NATURE · GRAPPLE', source: BAJIE, main: '#719250', accent: '#e6d19b',
    moves: ['Moss Drop', 'Bud Jab', 'Root Sweep', 'Sprout Uppercut', 'Vine Rush', 'Root Catch', 'Earth Puff', 'Forest Rumble', 'The Garden Roars'],
    quotes: { intro: 'Friendly face. Firm grip.', win: 'Want a hug now?', lose: 'Time to grow stronger.', taunt: 'Come closer!' },
  },
  {
    id: 'pebblepop', name: 'PEBBLEPOP', role: 'STONE · DEFENSE', source: ZHONGKUI, main: '#8c9b91', accent: '#c6e99d',
    moves: ['Pebble Drop', 'Tap Jab', 'Dust Sweep', 'Rock Uppercut', 'Pebble Rush', 'Stone Wall', 'Rubble Pulse', 'Rockslide', 'Tiny Giant'],
    quotes: { intro: 'Little rock, big heart!', win: 'Rock solid!', lose: 'Just a small crack.', taunt: 'Boop!' },
  },
  {
    id: 'puffvolt', name: 'PUFFVOLT', role: 'SPARK · AIR', source: LEIZHEN, main: '#a7addf', accent: '#ffe486',
    moves: ['Spark Drop', 'Zap Jab', 'Static Sweep', 'Voltage Rise', 'Flash Rush', 'Spark Volley', 'Cloud Spark', 'Thunder Puff', 'Overcharged'],
    quotes: { intro: 'A tiny spark is all it takes.', win: 'Fully charged!', lose: 'Recharging...', taunt: 'Bzzzt!' },
  },
  {
    id: 'cinderveil', name: 'CINDERVEIL', role: 'EMBER · PRESSURE', source: HONGHAIER, main: '#c96751', accent: '#e4ba73',
    moves: ['Cinder Dive', 'Palm Jab', 'Ash Sweep', 'Ember Uppercut', 'Cinder Rush', 'Searing Palm', 'Heat Wave', 'Ember Veil', 'Furnace Heart'],
    quotes: { intro: 'Make every strike count.', win: 'Focus beats fury.', lose: 'I will find the opening.', taunt: 'Stay focused.' },
  },
  {
    id: 'tideknuckle', name: 'TIDEKNUCKLE', role: 'WATER · CONTROL', source: TIESHAN, main: '#68a9dd', accent: '#f29f9e',
    moves: ['Bubble Drop', 'Splash Jab', 'Ripple Sweep', 'Tide Uppercut', 'Water Rush', 'Pressure Wave', 'Bubble Burst', 'High Tide', 'Ocean in a Fist'],
    quotes: { intro: 'Ready to make a splash?', win: 'Wave goodbye!', lose: 'Still swimming.', taunt: 'Splish splash!' },
  },
].map(originalFighter);

/** Public API retained for current menus and game flow. */
export const GOAT_ROSTER = ORIGINAL_ROSTER;
export const ORIGINAL_FIGHTER_IDS = new Set(ORIGINAL_ROSTER.map(f => f.id));
export const isOriginalFighterId = (id: string) => ORIGINAL_FIGHTER_IDS.has(id);


export const VERDANT_ARENA: StageBg = {
  artUrl: asset('art/verdant-arena.webp'),
  artFloorY: 775 / 1024,
  sky: ['#234653', '#a9d2bf'], ground: '#304640', silhouette: '#193834',
  seed: 2026, celestial: 'sun', celestialColor: '#fff0ae',
  ambient: { kind: 'spark', color: '#d3f6bb', count: 18 },
};
/** Source compatibility only; no old arena media is referenced. */
export const PARIS_ARENA = VERDANT_ARENA;
