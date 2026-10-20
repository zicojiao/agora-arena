import atlasJson from '../data/fighterAtlas.json';
import type { CharacterDef, Fighter, MoveSlot } from '../engine/types';
import type { PartImage } from './parts';
import { alternateHurt, hurtKind, knockdownPhase } from './damageReaction';
import { t } from '../i18n';

export type AtlasSheetName = 'movement' | 'combat' | 'reactions';
export interface AtlasFrame {
  x: number; y: number; w: number; h: number;
  anchorX: number; anchorY: number; flipX: boolean;
}
export interface AtlasSheet {
  url: string; width: number; height: number; referenceHeight: number; frames: AtlasFrame[];
}
export interface FighterAtlas {
  portraitUrl: string; sheets: Record<AtlasSheetName, AtlasSheet>;
}
export const FIGHTER_ATLASES: Record<string, FighterAtlas> = atlasJson.characters;
export const isOriginalFighter = (id: string): boolean => Object.hasOwn(FIGHTER_ATLASES, id);

export interface AtlasPose { sheet: AtlasSheetName; frame: number }
export interface AtlasAction extends AtlasPose {
  dx: number; dy: number; sx: number; sy: number; rot: number;
  /** Optional getup-to-idle blend; the source pose remains explicit drawn artwork. */
  next?: AtlasPose; blend?: number;
}
const action = (sheet: AtlasSheetName, frame: number, extra: Partial<AtlasAction> = {}): AtlasAction =>
  ({ sheet, frame, dx: 0, dy: 0, sx: 1, sy: 1, rot: 0, ...extra });
const clip = (v: number) => Math.max(0, Math.min(1, v));
const attackFrames: Record<MoveSlot, number> = { n1: 1, n2: 3, n3: 4, jA: 5, s1: 6, s2: 7, s3: 8, sp50: 9, sp100: 10 };

/** Explicit authored key poses. Physics and hitbox timing remain authoritative in Battle. */
export function originalAction(f: Fighter): AtlasAction {
  if (f.state === 'down') {
    const p = knockdownPhase(f);
    if (p.phase === 'fall') return action('reactions', p.progress < 0.65 ? 6 : 7);
    if (p.phase === 'lie') return action('reactions', 7);
    return action('reactions', 8, { next: { sheet: 'movement', frame: 0 }, blend: clip((p.progress - 0.45) / 0.55) });
  }
  if (f.victory > 0) return action('reactions', 10);
  if (f.state === 'attack' && f.move) {
    const m = f.move, frame = f.stateFrame;
    if (m.id.endsWith('_taunt')) return action('reactions', 9);
    if (frame < m.startup) {
      const k = clip(frame / Math.max(1, m.startup));
      if (m.meterCost > 0) return action('combat', 11, { sx: 1 - k * 0.025, sy: 1 - k * 0.025 });
      if (m.slot === 'n2') return action('movement', 7, { dx: -3 * k });
      if (m.slot === 'jA') return action('movement', 9);
      return action('combat', 0, { dx: -3 * k });
    }
    if (frame < m.startup + m.active) {
      const index = m.id.endsWith('_cd') ? 9 : attackFrames[m.slot];
      const beat = m.multiHit ? (frame - m.startup) % m.multiHit.interval : frame - m.startup;
      return action('combat', index, { dx: 3, sx: 1 + Math.max(0, 1 - beat / 5) * 0.025 });
    }
    const k = clip((frame - m.startup - m.active) / Math.max(1, m.recovery));
    if (m.slot === 'n1') return action('combat', 2, { next: { sheet: 'movement', frame: 0 }, blend: clip((k - 0.5) * 2) });
    return action('combat', attackFrames[m.slot], { dx: 3 * (1 - k),
      next: { sheet: 'movement', frame: f.y > 0 ? 10 : 0 }, blend: clip((k - 0.2) / 0.8) });
  }
  switch (f.state) {
    case 'hitstun': {
      const kind = hurtKind(f), alt = alternateHurt(f);
      if (kind === 'air') return action('reactions', 4);
      return action('reactions', kind === 'high' ? 2 : 3,
        { dx: alt ? -3 : -1, rot: alt ? -0.025 : 0, sy: kind === 'crouch' ? 0.7 : 1 });
    }
    case 'block': return action('reactions', f.lowGuard ? 1 : 0);
    case 'crouch': return action('movement', 7);
    case 'roll': return action('reactions', 5);
    case 'backstep': return action('movement', 6);
    case 'jump': return action('movement', f.vy > 0 ? 9 : 10);
    case 'walk': return action('movement', f.vx * f.facing < 0 ? 3 : 1 + Math.floor(f.stateFrame / 7) % 2);
    case 'run': return action('movement', 4 + Math.floor(f.stateFrame / 5) % 2);
    default:
      if (f.landStun > 0) return action('movement', 11);
      return action('movement', 0, { sy: 1 + Math.sin(f.stateFrame * 0.08) * 0.006 });
  }
}

type ImageStatus = 'loading' | 'ready' | 'failed';
interface ImageEntry { img: HTMLImageElement; status: ImageStatus; promise: Promise<void> }
export const ATLAS_RETRY_MS = 3000;
const IMAGE_TIMEOUT_MS = 10000;
const sheetNames: AtlasSheetName[] = ['movement', 'combat', 'reactions'];
const assetUrl = (path: string) => `${import.meta.env.BASE_URL}${path.startsWith('/') ? path.slice(1) : path}`;

/** Failures settle preload, announce a visible fallback, and retry. No request stays pending forever.
 * Image construction is injectable so error/retry behavior can be tested without canvas or network. */
export class AtlasAssets {
  private entries = new Map<string, ImageEntry>();
  private listeners = new Set<() => void>();
  constructor(private makeImage: () => HTMLImageElement = () => new Image()) {}
  onChange(fn: () => void): () => void { this.listeners.add(fn); return () => this.listeners.delete(fn); }
  private ensure(path: string): ImageEntry {
    const prior = this.entries.get(path);
    if (prior) return prior;
    const img = this.makeImage();
    let settle!: () => void;
    const entry: ImageEntry = { img, status: 'loading', promise: new Promise<void>(resolve => { settle = resolve; }) };
    this.entries.set(path, entry);
    let timeout: ReturnType<typeof setTimeout>;
    const finish = (ok: boolean) => {
      if (entry.status !== 'loading') return;
      clearTimeout(timeout);
      img.onload = null; img.onerror = null;
      entry.status = ok && img.naturalWidth > 0 && img.naturalHeight > 0 ? 'ready' : 'failed';
      settle();
      if (entry.status === 'failed') setTimeout(() => {
        if (this.entries.get(path) !== entry) return;
        this.entries.delete(path);
        this.ensure(path);
      }, ATLAS_RETRY_MS);
      for (const fn of [...this.listeners]) fn();
    };
    img.onload = () => finish(true);
    img.onerror = () => finish(false);
    timeout = setTimeout(() => finish(false), IMAGE_TIMEOUT_MS);
    img.src = assetUrl(path);
    return entry;
  }
  preload(meta: FighterAtlas): Promise<void> {
    return Promise.all([...sheetNames.map(s => meta.sheets[s].url), meta.portraitUrl].map(p => this.ensure(p).promise)).then(() => undefined);
  }
  image(path: string): HTMLImageElement | null {
    const e = this.ensure(path);
    return e.status === 'ready' ? e.img : null;
  }
  ready(meta: FighterAtlas): boolean {
    return sheetNames.every(s => this.image(meta.sheets[s].url) !== null);
  }
  failed(meta: FighterAtlas): boolean {
    return sheetNames.some(s => this.entries.get(meta.sheets[s].url)?.status === 'failed');
  }
}
const assets = new AtlasAssets();
export const onOriginalAssetsLoaded = (fn: () => void) => assets.onChange(fn);
export function preloadOriginalFighter(id: string): Promise<void> {
  const meta = FIGHTER_ATLASES[id];
  return meta && typeof Image !== 'undefined' ? assets.preload(meta) : Promise.resolve();
}
export function originalFighterReady(id: string): boolean {
  const meta = FIGHTER_ATLASES[id];
  return !!meta && typeof Image !== 'undefined' && assets.ready(meta);
}

/** Fixed pixel-to-world scale per sheet, never per pose. A low kick/lying body stays low. */
export function atlasFrameGeometry(sheet: AtlasSheet, frame: AtlasFrame, targetHeight: number) {
  const scale = targetHeight / sheet.referenceHeight;
  return { x: (frame.x - frame.anchorX) * scale, y: (frame.y - frame.anchorY) * scale,
    width: frame.w * scale, height: frame.h * scale, scale };
}

function drawPose(ctx: CanvasRenderingContext2D, meta: FighterAtlas, pose: AtlasPose, height: number, facing: number): boolean {
  const sheet = meta.sheets[pose.sheet], frame = sheet.frames[pose.frame], img = assets.image(sheet.url);
  if (!img || !frame) return false;
  const rect = atlasFrameGeometry(sheet, frame, height);
  ctx.save();
  ctx.scale(facing * (frame.flipX ? -1 : 1), 1);
  ctx.drawImage(img, frame.x, frame.y, frame.w, frame.h, rect.x, rect.y, rect.width, rect.height);
  ctx.restore();
  return true;
}
function drawMissing(ctx: CanvasRenderingContext2D, def: CharacterDef, x: number, feetY: number, down = false) {
  const h = down ? 36 : Math.max(60, def.height * 0.65), w = Math.max(80, def.width * 1.4);
  ctx.save();
  ctx.fillStyle = '#18202f'; ctx.strokeStyle = def.palette.accent; ctx.lineWidth = 2;
  ctx.fillRect(x - w / 2, feetY - h, w, h); ctx.strokeRect(x - w / 2, feetY - h, w, h);
  ctx.fillStyle = '#ffffff'; ctx.textAlign = 'center'; ctx.font = 'bold 11px sans-serif';
  ctx.fillText(def.name, x, feetY - h + 15);
  ctx.font = '10px sans-serif';
  ctx.fillText(t(assets.failed(FIGHTER_ATLASES[def.id]) ? 'canvas.retryingArt' : 'canvas.loadingArt'), x, feetY - h + 29);
  ctx.restore();
}

/** Canvas entry point shared by live fighters and afterimages. No procedural or celebrity fallback. */
export function drawOriginalAction(ctx: CanvasRenderingContext2D, def: CharacterDef, pose: AtlasAction,
  x: number, feetY: number, facing: number, white = false): void {
  const meta = FIGHTER_ATLASES[def.id];
  if (!meta || typeof Image === 'undefined') return;
  void preloadOriginalFighter(def.id);
  const wanted = assets.image(meta.sheets[pose.sheet].url);
  if (!wanted) {
    // Never replace a down/KO picture with standing art during a network failure.
    if (pose.sheet === 'reactions' && [6, 7, 8].includes(pose.frame)) {
      drawMissing(ctx, def, x, feetY, true); return;
    }
    if (!assets.image(meta.sheets.movement.url)) { drawMissing(ctx, def, x, feetY); return; }
    pose = action('movement', 0);
  }
  const height = def.height * 1.15;
  ctx.save();
  ctx.translate(x + pose.dx * facing, feetY + pose.dy);
  ctx.scale(pose.sx, pose.sy);
  if (pose.rot) ctx.rotate(pose.rot * facing);
  if (white) ctx.filter = 'brightness(2.4) saturate(0.25)';
  const nextReady = pose.next && assets.image(meta.sheets[pose.next.sheet].url);
  const blend = nextReady ? clip(pose.blend ?? 0) : 0;
  const alpha = ctx.globalAlpha;
  ctx.globalAlpha = alpha * (1 - blend);
  drawPose(ctx, meta, pose, height, facing);
  if (pose.next && blend > 0) {
    ctx.globalAlpha = alpha * blend;
    drawPose(ctx, meta, pose.next, height, facing);
  }
  ctx.restore();
}

export function drawOriginalPortrait(ctx: CanvasRenderingContext2D, def: CharacterDef, w: number, h: number): void {
  const meta = FIGHTER_ATLASES[def.id];
  if (!meta || typeof Image === 'undefined') return;
  void preloadOriginalFighter(def.id);
  const img = assets.image(meta.portraitUrl);
  if (!img) {
    const fit = Math.min(h * 0.88 / (def.height * 1.15), w * 0.9 / (def.height * 1.15));
    ctx.save(); ctx.translate(w / 2, h * 0.96); ctx.scale(fit, fit);
    drawOriginalAction(ctx, def, action('movement', 0), 0, 0, 1);
    ctx.restore(); return;
  }
  const scale = Math.min(w * 0.92 / img.naturalWidth, h * 0.92 / img.naturalHeight);
  ctx.drawImage(img, (w - img.naturalWidth * scale) / 2, h * 0.96 - img.naturalHeight * scale,
    img.naturalWidth * scale, img.naturalHeight * scale);
}
export function originalHeadPart(id: string): PartImage | null {
  const meta = FIGHTER_ATLASES[id];
  if (!meta || typeof Image === 'undefined') return null;
  const img = assets.image(meta.portraitUrl);
  return img ? { img, left: 0, top: 0, right: img.naturalWidth, bottom: img.naturalHeight } : null;
}
