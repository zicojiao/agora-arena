// 纯 JS（不是 .ts）：这个测试要 import node:fs/node:path 和 scripts/extract-chars.mjs，
// 项目没装 @types/node（tsconfig 的 types 只列了 vite/client），写成 .ts 会被 tsc --noEmit
// 卡住——而 tsconfig 的 include 只认 .ts/.tsx（没开 allowJs），.mjs 测试文件不会被 tsc
// 碰到，vitest 照样能发现并跑它。
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { expect, test } from 'vitest';
// 复用生成脚本同一份提取逻辑——两边各写一份的话，提取规则一旦漂移，这个测试就只是在
// 跟自己的另一份实现对表，抓不到真正忘记重跑脚本的情况
import { extractRenderedChars, REPO_ROOT } from '../scripts/extract-chars.mjs';

const FONTS_DIR = path.join(REPO_ROOT, 'public', 'fonts');
const MANIFEST_PATH = path.join(FONTS_DIR, 'subset-chars.json');
const WOFF2_PATH = path.join(FONTS_DIR, 'ShenxianSerif.woff2');

test('宋体子集产物已生成：woff2 + 覆盖清单都在', () => {
  expect(existsSync(WOFF2_PATH)).toBe(true);
  expect(existsSync(MANIFEST_PATH)).toBe(true);
});

test('源码里当前会渲染的字符都在字体子集覆盖清单内——加了新角色/招式名/关卡名/界面文案后忘了重跑 node scripts/subset-font.mjs 时，这里应该报红', () => {
  const manifest = JSON.parse(readFileSync(MANIFEST_PATH, 'utf8'));
  const manifestChars = new Set(manifest.chars);
  const liveChars = extractRenderedChars();

  const missing = [...liveChars].filter(c => !manifestChars.has(c));
  expect(
    missing,
    `以下字符已在源码中使用，但不在字体子集覆盖清单里，说明加了新文案后没有重跑 ` +
    `node scripts/subset-font.mjs（否则这些字在 Android 上会静默回退成黑体）: ${missing.join(' ')}`,
  ).toEqual([]);
});
