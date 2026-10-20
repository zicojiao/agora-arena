import { expect, test } from 'vitest';
import { readFileSync, statSync } from 'node:fs';
import { resolve } from 'node:path';
import atlas from '../src/data/fighterAtlas.json';

test('every original fighter ships all 36 valid drawn action frames and a portrait', () => {
  expect(Object.keys(atlas.characters)).toHaveLength(10);
  for (const [id, character] of Object.entries(atlas.characters)) {
    expect(statSync(resolve('public', character.portraitUrl)).size, id).toBeGreaterThan(1000);
    for (const [kind, sheet] of Object.entries(character.sheets)) {
      const bytes = readFileSync(resolve('public', sheet.url));
      expect(bytes.subarray(8, 12).toString(), `${id}/${kind}`).toBe('WEBP');
      expect(sheet.frames).toHaveLength(12);
      expect(sheet.referenceHeight).toBeGreaterThan(100);
      for (const frame of sheet.frames) {
        expect(frame.w).toBeGreaterThan(30);
        expect(frame.h).toBeGreaterThan(30);
        expect(frame.x).toBeGreaterThanOrEqual(0);
        expect(frame.y).toBeGreaterThanOrEqual(0);
        expect(frame.x + frame.w).toBeLessThanOrEqual(sheet.width);
        expect(frame.y + frame.h).toBeLessThanOrEqual(sheet.height);
        expect(frame.anchorX).toBeGreaterThanOrEqual(frame.x);
        expect(frame.anchorX).toBeLessThanOrEqual(frame.x + frame.w);
        expect(frame.anchorY).toBeGreaterThanOrEqual(frame.y);
        expect(frame.anchorY).toBeLessThanOrEqual(frame.y + frame.h);
      }
    }
    const lying = character.sheets.reactions.frames[7];
    expect(lying.w / lying.h, `${id}: KO uses a horizontal drawing`).toBeGreaterThan(1.5);
  }
});
