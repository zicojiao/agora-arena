import { afterEach, describe, expect, it, vi } from 'vitest';
import { createFighter } from '../src/engine/battle';
import { CHARACTERS } from '../src/data/characters';
import type { Fighter, MoveSlot } from '../src/engine/types';
import { AtlasAssets, ATLAS_RETRY_MS, FIGHTER_ATLASES, atlasFrameGeometry,
  drawOriginalAction, isOriginalFighter, originalAction, preloadOriginalFighter } from '../src/render/originalAtlas';

const fighter = (over: Partial<Fighter> = {}): Fighter => ({
  ...createFighter({ ...CHARACTERS[0], id: 'emberpaw' }, 400, 1), ...over,
});
afterEach(() => { vi.clearAllTimers(); vi.useRealTimers(); vi.unstubAllGlobals(); });

describe('original authored action selection', () => {
  it('all nine slots have distinct contact art and separate anticipation/recovery', () => {
    const f = fighter({ state: 'attack' });
    const frames = new Set<number>();
    for (const slot of ['n1', 'n2', 'n3', 'jA', 's1', 's2', 's3', 'sp50', 'sp100'] as MoveSlot[]) {
      f.move = { ...f.def.moves[slot], startup: 10, active: 10, recovery: 10 };
      f.stateFrame = 0; const anticipation = originalAction(f);
      f.stateFrame = 12; const contact = originalAction(f);
      f.stateFrame = 30; const recovery = originalAction(f);
      expect(contact.sheet).toBe('combat');
      frames.add(contact.frame);
      expect(anticipation.frame).not.toBe(contact.frame);
      expect(recovery.next).toEqual({ sheet: 'movement', frame: 0 });
      expect(recovery.blend).toBe(1);
    }
    expect(frames.size).toBe(9);
  });

  it('locomotion uses drawn walk, run, jump, landing, crouch and roll poses', () => {
    expect(originalAction(fighter({ state: 'walk', vx: 3, stateFrame: 0 })).frame).toBe(1);
    expect(originalAction(fighter({ state: 'walk', vx: 3, stateFrame: 7 })).frame).toBe(2);
    expect(originalAction(fighter({ state: 'walk', vx: -3 })).frame).toBe(3);
    expect(originalAction(fighter({ state: 'run', stateFrame: 0 })).frame).toBe(4);
    expect(originalAction(fighter({ state: 'run', stateFrame: 5 })).frame).toBe(5);
    expect(originalAction(fighter({ state: 'jump', vy: 3 })).frame).toBe(9);
    expect(originalAction(fighter({ state: 'jump', vy: -3 })).frame).toBe(10);
    expect(originalAction(fighter({ landStun: 3 })).frame).toBe(11);
    expect(originalAction(fighter({ state: 'crouch' })).frame).toBe(7);
    expect(originalAction(fighter({ state: 'roll' }))).toMatchObject({ sheet: 'reactions', frame: 5 });
  });

  it('high/body/air damage, low guard, taunt and victory use the relevant reaction paintings', () => {
    expect(originalAction(fighter({ state: 'hitstun', hurtKind: 'high' }))).toMatchObject({ sheet: 'reactions', frame: 2 });
    expect(originalAction(fighter({ state: 'hitstun', hurtKind: 'body' }))).toMatchObject({ sheet: 'reactions', frame: 3 });
    expect(originalAction(fighter({ state: 'hitstun', hurtKind: 'crouch' })).sy).toBeLessThan(1);
    expect(originalAction(fighter({ state: 'hitstun', hurtKind: 'air', y: 20 }))).toMatchObject({ sheet: 'reactions', frame: 4 });
    expect(originalAction(fighter({ state: 'block', lowGuard: true }))).toMatchObject({ sheet: 'reactions', frame: 1 });
    const f = fighter({ state: 'attack' }); f.move = { ...f.def.moves.n1, id: 'emberpaw_taunt' };
    expect(originalAction(f)).toMatchObject({ sheet: 'reactions', frame: 9 });
    expect(originalAction(fighter({ victory: 1 }))).toMatchObject({ sheet: 'reactions', frame: 10 });
  });

  it('knockdown/KO uses real falling and lying art; tech gets up according to remaining stun', () => {
    expect(originalAction(fighter({ state: 'down', stateFrame: 2, stun: 50 }))).toMatchObject({ sheet: 'reactions', frame: 6, rot: 0 });
    expect(originalAction(fighter({ state: 'down', stateFrame: 20, stun: 32 }))).toMatchObject({ sheet: 'reactions', frame: 7, rot: 0 });
    const tech = originalAction(fighter({ state: 'down', stateFrame: 18, stun: 4 }));
    expect(tech).toMatchObject({ sheet: 'reactions', frame: 8, rot: 0 });
    expect(tech.blend).toBeGreaterThan(0);
    for (const elapsed of [10, 52, 100, 1000]) {
      const ko = originalAction(fighter({ state: 'down', hp: 0, stateFrame: elapsed, stun: -100 }));
      expect(ko).toMatchObject({ sheet: 'reactions', frame: 7, rot: 0 });
      expect(ko.next).toBeUndefined();
    }
  });
});

describe('atlas geometry and identity', () => {
  it('only metadata IDs use the original renderer, leaving procedural fixtures intact', () => {
    expect(isOriginalFighter('emberpaw')).toBe(true);
    expect(isOriginalFighter('nezha')).toBe(false);
    expect(isOriginalFighter('ronaldo')).toBe(false);
    expect(isOriginalFighter('toString')).toBe(false);
  });

  it('lying and low poses keep a fixed sheet scale instead of stretching to standing height', () => {
    const s = FIGHTER_ATLASES.pebblepop.sheets.reactions;
    const standing = atlasFrameGeometry(s, s.frames[0], 160);
    const lying = atlasFrameGeometry(s, s.frames[7], 160);
    expect(lying.scale).toBe(standing.scale);
    expect(lying.height).toBeLessThan(standing.height);
    expect(lying.height / standing.height).toBeCloseTo(s.frames[7].h / s.frames[0].h);
    expect(lying.y).toBeCloseTo((s.frames[7].y - s.frames[7].anchorY) * lying.scale);
  });
});

describe('asset failure and retries', () => {
  function loader() {
    const images: HTMLImageElement[] = [];
    const cache = new AtlasAssets(() => {
      const img = { naturalWidth: 1536, naturalHeight: 1024, onload: null, onerror: null, src: '' } as unknown as HTMLImageElement;
      images.push(img); return img;
    });
    return { images, cache };
  }

  it('loads each sheet once, settles failure, retries it and announces recovery', async () => {
    vi.useFakeTimers();
    const { cache, images } = loader(), meta = FIGHTER_ATLASES.emberpaw;
    const notify = vi.fn(); const off = cache.onChange(notify);
    const initial = cache.preload(meta);
    void cache.preload(meta);
    expect(images).toHaveLength(4);
    images[0].onerror?.call(images[0], new Event('error'));
    for (const img of images.slice(1)) img.onload?.call(img, new Event('load'));
    await initial;
    expect(cache.failed(meta)).toBe(true);
    expect(cache.ready(meta)).toBe(false);
    expect(notify).toHaveBeenCalledTimes(4);
    await vi.advanceTimersByTimeAsync(ATLAS_RETRY_MS);
    expect(images).toHaveLength(5);
    images[4].onload?.call(images[4], new Event('load'));
    expect(cache.ready(meta)).toBe(true);
    expect(cache.failed(meta)).toBe(false);
    expect(notify).toHaveBeenCalledTimes(5);
    off();
  });

  it('a request that never fires load/error times out instead of blocking the loading screen', async () => {
    vi.useFakeTimers();
    const { cache } = loader(), meta = FIGHTER_ATLASES.puffvolt;
    const load = cache.preload(meta);
    await vi.advanceTimersByTimeAsync(10000);
    await load;
    expect(cache.failed(meta)).toBe(true);
    expect(cache.ready(meta)).toBe(false);
  });

  it('draws the KO source crop with anchored geometry and no rotated standing substitute', async () => {
    vi.useFakeTimers();
    const images: HTMLImageElement[] = [];
    class FakeImage {
      naturalWidth = 1536; naturalHeight = 1024; src = '';
      onload: ((ev: Event) => void) | null = null;
      onerror: ((ev: Event) => void) | null = null;
      constructor() { images.push(this as unknown as HTMLImageElement); }
    }
    vi.stubGlobal('Image', FakeImage);
    const f = fighter({ state: 'down', hp: 0, stateFrame: 150, stun: -40 });
    const ready = preloadOriginalFighter(f.def.id);
    for (const img of images) img.onload?.call(img, new Event('load'));
    await ready;
    const ctx = { globalAlpha: 1, save: vi.fn(), restore: vi.fn(), translate: vi.fn(), scale: vi.fn(),
      rotate: vi.fn(), drawImage: vi.fn() } as unknown as CanvasRenderingContext2D;
    drawOriginalAction(ctx, f.def, originalAction(f), 400, 460, -1);
    const expected = FIGHTER_ATLASES.emberpaw.sheets.reactions.frames[7];
    expect(ctx.drawImage).toHaveBeenCalledTimes(1);
    expect(vi.mocked(ctx.drawImage).mock.calls[0].slice(1, 5)).toEqual([expected.x, expected.y, expected.w, expected.h]);
    expect(ctx.rotate).not.toHaveBeenCalled();
    expect(ctx.scale).toHaveBeenCalledWith(-1 * (expected.flipX ? -1 : 1), 1);
    expect(ctx.translate).toHaveBeenCalledWith(400, 460);
  });

  it('a missing reaction sheet shows a visible retry state instead of a standing KO or invisible fighter', async () => {
    vi.useFakeTimers();
    const images: HTMLImageElement[] = [];
    class FailedImage {
      naturalWidth = 1536; naturalHeight = 1024; src = '';
      onload: ((ev: Event) => void) | null = null;
      onerror: ((ev: Event) => void) | null = null;
      constructor() { images.push(this as unknown as HTMLImageElement); }
    }
    vi.stubGlobal('Image', FailedImage);
    const f = fighter({ def: { ...CHARACTERS[0], id: 'puffvolt', name: 'Puffvolt' },
      state: 'down', hp: 0, stateFrame: 50, stun: -10 });
    const settled = preloadOriginalFighter(f.def.id);
    for (const img of images) {
      if (img.src.includes('reactions')) img.onerror?.call(img, new Event('error'));
      else img.onload?.call(img, new Event('load'));
    }
    await settled;
    const ctx = { globalAlpha: 1, save: vi.fn(), restore: vi.fn(), fillRect: vi.fn(),
      strokeRect: vi.fn(), fillText: vi.fn(), drawImage: vi.fn() } as unknown as CanvasRenderingContext2D;
    drawOriginalAction(ctx, f.def, originalAction(f), 400, 460, 1);
    expect(ctx.drawImage).not.toHaveBeenCalled();
    expect(ctx.fillRect).toHaveBeenCalled();
    expect(ctx.fillText).toHaveBeenCalledWith('Retrying artwork…', 400, 453);
  });
});
