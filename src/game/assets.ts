import { GOAT_ROSTER } from '../data/goats';
import { fighterReady, onPartsLoaded, preloadParts } from '../render/renderer';
import { GOAT_STAGES } from './setup';
import { isOriginalFighter, preloadOriginalFighter } from '../render/originalAtlas';

/** Give up waiting after this long and show the game anyway; the renderer keeps retrying sprites. */
const PRELOAD_TIMEOUT_MS = 15_000;

function loadImage(url: string): Promise<void> {
  return new Promise(resolve => {
    const img = new Image();
    img.onload = () => resolve();
    img.onerror = () => resolve();
    img.src = url;
  });
}

function fighterSprites(id: string): Promise<void> {
  if (isOriginalFighter(id)) return preloadOriginalFighter(id);
  const def = GOAT_ROSTER.find(f => f.id === id)!;
  if (fighterReady(def)) return Promise.resolve();
  return new Promise(resolve => {
    const off = onPartsLoaded(() => { if (fighterReady(def)) { off(); resolve(); } });
    preloadParts(id);
  });
}

/** Load the full sprite sheets of the fighters about to fight; resolves early after `timeoutMs` so a slow sheet never
 * blocks the match (the renderer shows a "Loading artwork" stand-in until it lands). */
export function preloadFighters(ids: string[], timeoutMs = 6_000): Promise<void> {
  const all = Promise.all([...new Set(ids)].map(fighterSprites)).then(() => undefined);
  return Promise.race([all, new Promise<void>(resolve => setTimeout(resolve, timeoutMs))]);
}

/**
 * What the title and setup screens draw, plus the two fighters of the saved matchup: stage art, every portrait
 * (~46 KB each) and only those two fighters' sprite sheets (~1 MB each). The other eight load when picked —
 * preloading all ten made phones download ~12 MB before the title appeared.
 */
export function preloadGameAssets(fighterIds: string[], onProgress: (done: number, total: number) => void): Promise<void> {
  const tasks = [
    ...[...new Set(fighterIds)].map(fighterSprites),
    ...GOAT_ROSTER.flatMap(f => (f.portraitUrl ? [loadImage(f.portraitUrl)] : [])),
    ...[...new Set(GOAT_STAGES.map(s => s.bg.artUrl!))].map(loadImage),
  ];
  let done = 0;
  let finished = false;
  onProgress(0, tasks.length);
  // After the timeout the game is already showing; a late asset must not report progress again (that put the
  // loading screen back over the running game).
  const all = Promise.all(tasks.map(t => t.then(() => { if (!finished) onProgress(++done, tasks.length); }))).then(() => undefined);
  return Promise.race([all, new Promise<void>(resolve => setTimeout(resolve, PRELOAD_TIMEOUT_MS))]).then(() => { finished = true; });
}
