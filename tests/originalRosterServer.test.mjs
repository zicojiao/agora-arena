import { expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { GOAT_ROSTER } from '../src/data/goats';

it('keeps the announcer allowlist in sync with every selectable fighter', () => {
  const worker = readFileSync(new URL('../server/index.js', import.meta.url), 'utf8');
  const list = worker.match(/const ALLOWED_FIGHTERS = new Set\(\[(.*?)\]\)/)[1];
  const names = [...list.matchAll(/'([^']+)'/g)].map(m => m[1]);
  expect(names).toEqual(GOAT_ROSTER.map(f => f.name));
  expect(worker).not.toMatch(/football fighting|RONALDO|MBAPPÉ|HAALAND/);
});
