import { describe, expect, it } from 'vitest';
import { stageArtPlacement } from '../src/render/renderer';
import { Camera } from '../src/render/camera';
import { FLOOR_Y, LOGIC_H, LOGIC_W } from '../src/engine/types';
import { VERDANT_ARENA } from '../src/data/goats';

describe('painted arena grounding', () => {
  it.each([[960, 540], [844, 390], [1200, 760], [568, 320]])('keeps the floor under feet and covers a %sx%s screen through zoom', (w, h) => {
    const uiScale = Math.min(w / LOGIC_W, h / LOGIC_H);
    const vw = w / uiScale, vh = h / uiScale;
    const ox = (vw - LOGIC_W) / 2, oy = (vh - LOGIC_H) / 2;
    const camera = new Camera();
    for (const zoom of [0.85, 1, 1.15, 1.4]) {
      camera.zoom = zoom;
      const floor = camera.screenY(FLOOR_Y);
      const rect = stageArtPlacement(1536, 1024, vw, vh, VERDANT_ARENA.artFloorY, floor);
      expect(rect.y + rect.height * VERDANT_ARENA.artFloorY!).toBeCloseTo(floor);
      expect(rect.x).toBeLessThanOrEqual(-ox + 1e-6);
      expect(rect.x + rect.width).toBeGreaterThanOrEqual(LOGIC_W + ox - 1e-6);
      expect(rect.y).toBeLessThanOrEqual(-oy + 1e-6);
      expect(rect.y + rect.height).toBeGreaterThanOrEqual(LOGIC_H + oy - 1e-6);
    }
  });
});
