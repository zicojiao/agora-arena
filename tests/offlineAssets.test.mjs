// 纯 JS（不是 .ts）：这个测试要 import node:fs/node:path，而项目没装 @types/node
// （tsconfig 的 types 只列了 vite/client），写成 .ts 会被 tsc --noEmit 卡住——
// 同 font-coverage.test.mjs 的理由。
import { expect, test } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const viteSrc = fs.readFileSync('vite.config.ts', 'utf8');

/**
 * 「离线可玩」是标题页上写着的承诺，而它靠 sw.js 的 precache 清单兑现。
 *
 * 清单由 workbox 的 globPatterns 决定，而那串扩展名是**手写**的——
 * public/ 里新增一种资源却忘了往里加，文件进得了 dist/、进不了 precache：
 * 在线一切正常，只有断网才看得出来。这个坑这个项目踩过两次（字体 woff2、音效 ogg，
 * 见 vite.config 里那段注释），第三次是角色立绘 png 与骨骼 json——
 * 断网时最早那四个人会悄悄退回没有立绘的程序化画法。
 *
 * 所以这条不查"某几个文件在不在"，查的是**public/ 里出现的每一种扩展名，
 * globPatterns 都覆盖到了**——加新资源时自动提醒。
 */

/** public/ 下所有文件的扩展名 */
function extsUnderPublic(dir = 'public', out = new Set()) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) extsUnderPublic(p, out);
    else {
      const ext = path.extname(e.name).slice(1).toLowerCase();
      if (ext) out.add(ext);
    }
  }
  return out;
}

/** vite.config 里 globPatterns 那一串扩展名 */
function globExts() {
  const m = /globPatterns:\s*\['\*\*\/\*\.\{([^}]+)\}'\]/.exec(viteSrc);
  expect(m, 'vite.config 里找不到 globPatterns——这条断言的前提没了').not.toBeNull();
  return new Set(m[1].split(',').map(s => s.trim()));
}

/** 不需要进 precache 的：纯文档/许可，运行时不 fetch */
const NOT_SHIPPED = new Set(['md', 'txt']);

test('豁免名单不会悄悄长大', () => {
  // 名单是这条断言唯一的漏洞：往里塞扩展名就能让上面那条闭嘴
  expect([...NOT_SHIPPED].sort()).toEqual(['md', 'txt']);
});

// skipIf 而不是函数体里 `return`：没构建过时要在报告里**显示成 skipped**。
// 写成 return 的话它伪装成 passed——而这正好是常态：dist 在 .gitignore 里，CI 是全新
// checkout；`npm run verify` 里 vitest 也排在 vite build **之前**（查的是上一次的产物）。
// 于是这条唯一把"离线可玩"这个承诺和真实产物对上的断言，看着一直绿、其实一次没跑。
// CI 已改成先 build 再 test，本地要验就 `npx vite build && npx vitest run tests/offlineAssets.test.mjs`。
test.skipIf(!fs.existsSync('dist/sw.js'))('构建产物里，角色立绘与骨骼动画确实进了 precache', () => {
  const sw = 'dist/sw.js';
  const src = fs.readFileSync(sw, 'utf8');
  expect(/url:"chars\/[a-z]+\/head\.png"/.test(src), 'sw.js 的 precache 里没有角色立绘').toBe(true);
  expect(/url:"skel\/[a-z]+\.json"/.test(src), 'sw.js 的 precache 里没有骨骼动画').toBe(true);
});

// 运行时拼出来的资源路径必须走 import.meta.env.BASE_URL，不能以字面量 / 开头。
//
// 理由和上面几条是同一类——**坏得没有声音**。base 是 './'（见 vite.config：同一份 gh-pages
// 产物既由 EdgeOne 挂在根域，又被 GitHub Pages 挂在子路径），而 vite 只重写 index.html 里的
// 引用，运行时拼的字符串它一概不管。写死 '/chars/...' 时：EdgeOne 上照常，GitHub Pages 子路径
// 上全部 404，而三条取资源的路全是静默兜底——立绘拿不到退回骨骼火柴人、采样音效退回合成、
// 骨骼 json 本来就是可选。控制台一句错都没有，只是人全变成了火柴人。
//
// 判据从 public/ 的顶层目录名自动推导，加新资源目录不用回来改这里。
// **必须先去掉注释再查**：本仓库的注释里到处写着 `/chars/...` 这样的路径举例（正是为了
// 说明这条规则），连注释一起扫会一直误报。复用生成字体子集那份 stripComments，
// 免得这里再写一份会漂移的。
test('运行时的资源路径都走 BASE_URL，没有写死的根路径', async () => {
  const { stripComments } = await import('../scripts/extract-chars.mjs');
  const dirs = fs.readdirSync('public', { withFileTypes: true })
    .filter(e => e.isDirectory()).map(e => e.name);
  expect(dirs.length, 'public/ 下一个目录都没有，这条断言的前提没了').toBeGreaterThan(0);

  const files = [];
  (function walk(d) {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) walk(p);
      else if (/\.(ts|tsx)$/.test(e.name)) files.push(p);
    }
  })('src');

  const bad = [];
  for (const f of files) {
    const code = stripComments(fs.readFileSync(f, 'utf8'));
    for (const d of dirs) {
      if (new RegExp(`["'\`]/${d}/`).test(code)) bad.push(`${f} 里写死了 /${d}/`);
    }
  }
  expect(bad, `这些地方写死了根路径，子路径部署时会 404 且静默兜底：\n${bad.join('\n')}\n` +
    '改法：`${import.meta.env.BASE_URL}chars/...`').toEqual([]);
});
