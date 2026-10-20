#!/usr/bin/env node
// 重跑一条命令：node scripts/subset-font.mjs
//
// 生成 public/fonts/ShenxianSerif.woff2——Noto Serif SC 的子集，只收本项目真正会渲染
// 到屏幕上的字符（扫全部 src/**/*.{ts,tsx}，去掉注释，见 extract-chars.mjs），不是
// 整份 24MB 原字体。
//
// 加了新角色 / 新招式名 / 新关卡名 / 新界面文案之后（不管加在哪个文件里——extractRenderedChars
// 扫的是整个 src/，不是固定文件列表），重跑这个脚本就会把新字符收进子集。
// tests/font-coverage.test.mjs 用同一份提取逻辑核对 public/fonts/subset-chars.json 是否
// 和当前源码同步，忘记重跑这个脚本时测试会红，而不是上线后某个字悄悄变成黑体。
//
// 依赖：fonttools（pyftsubset）——本机已装，构建期工具，不是运行时依赖。
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { REPO_ROOT, extractRenderedChars, extractNaiveChars } from './extract-chars.mjs';

// 固定到 google/fonts 的一个具体 commit（而不是 main 分支头）：main 会一直往前走，几个月后
// 重跑这个脚本本该拿到跟今天一样的字节，用分支名做不到这一点——上游随时可能换一版字体文件，
// 脚本不会报错，只会悄悄产出一个跟今天不一样的子集。sha256 是这个 commit 下载到的原始 TTF
// 的校验和：commit 已经锁死了内容，理论上不会变，这道校验主要是防下载损坏/缓存被改过，
// 一旦对不上就直接报错退出，不静默接受一个校验和不对的原字体。
const SRC_COMMIT = '038b637da7b3fd956a4ed93ffc607c3d5e4ce172';
const SRC_TTF_SHA256 = '050080d9255a86808f2945bffac582b31ef32bc36411ce29563b4961670c66f9';
const SRC_TTF_URL = `https://raw.githubusercontent.com/google/fonts/${SRC_COMMIT}/ofl/notoserifsc/NotoSerifSC%5Bwght%5D.ttf`;
const SRC_OFL_URL = `https://raw.githubusercontent.com/google/fonts/${SRC_COMMIT}/ofl/notoserifsc/OFL.txt`;

// 24MB 原字体只是构建期输入，缓存在仓库之外的系统临时目录，绝不提交
const CACHE_DIR = path.join(os.tmpdir(), 'shenxian-font-src');
const SRC_TTF = path.join(CACHE_DIR, 'NotoSerifSC[wght].ttf');
const SRC_OFL = path.join(CACHE_DIR, 'OFL.txt');
const CHARS_FILE = path.join(CACHE_DIR, 'chars.txt');

const OUT_DIR = path.join(REPO_ROOT, 'public', 'fonts');
const OUT_WOFF2 = path.join(OUT_DIR, 'ShenxianSerif.woff2');
const OUT_OFL = path.join(OUT_DIR, 'OFL.txt');
const OUT_MANIFEST = path.join(OUT_DIR, 'subset-chars.json');

async function ensureCached(url, dest, minBytes) {
  if (fs.existsSync(dest) && fs.statSync(dest).size >= minBytes) {
    console.log(`[缓存命中] ${dest}`);
    return;
  }
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  console.log(`[下载] ${url}`);
  const res = await fetch(url);
  if (!res.ok) throw new Error(`下载失败 ${url}: HTTP ${res.status}`);
  fs.writeFileSync(dest, Buffer.from(await res.arrayBuffer()));
}

/** 不管是刚下载的还是缓存命中的，都核一遍 sha256——缓存目录是系统临时目录，谁都能写，
 * pin 住 commit 只保证"网络那头给的是对的"，本地缓存被改过/传输损坏这道检查照样能抓到。
 * 对不上直接抛错，不静默换一份原字体继续跑下去。 */
function verifyChecksum(file, expectedSha256) {
  const actual = createHash('sha256').update(fs.readFileSync(file)).digest('hex');
  if (actual !== expectedSha256) {
    throw new Error(
      `${file} 的 sha256 对不上：期望 ${expectedSha256}，实际 ${actual}。\n` +
      `可能是缓存被改过，或者 pin 住的 commit 内容变了（理论上不该发生）。删掉缓存目录` +
      `重跑，如果还是不一致，去 https://github.com/google/fonts/commit/${SRC_COMMIT} 核实。`,
    );
  }
}

function runPyftsubset(args) {
  let r = spawnSync('pyftsubset', args, { stdio: 'inherit' });
  if (r.error && r.error.code === 'ENOENT') {
    r = spawnSync('python', ['-m', 'fontTools.subset', ...args], { stdio: 'inherit' });
  }
  if (r.status !== 0) throw new Error('pyftsubset 执行失败（见上方输出）');
}

/** 生成后核实：用 fontTools 直接读 woff2 的 cmap，逐字核对是否都真的进去了。pyftsubset
 * 对源字体没有的码点默认是静默丢弃（--ignore-missing-unicodes），不检查的话子集有可能
 * 悄悄缺字而脚本还打印"成功"。这一步核实失败就整个脚本非零退出，不能让不完整的产物
 * 蒙混过关。 */
function verifyCoverage(woff2Path, required) {
  fs.writeFileSync(CHARS_FILE, [...required].join(''), 'utf8');
  const py = `
import sys
from fontTools.ttLib import TTFont
font = TTFont(sys.argv[1])
cmap = font.getBestCmap()
with open(sys.argv[2], encoding='utf-8') as f:
    text = f.read()
missing = sorted(set(ch for ch in text if ord(ch) not in cmap))
if missing:
    print('MISSING:', ' '.join(f'{ch}(U+{ord(ch):04X})' for ch in missing))
    sys.exit(1)
print(f'OK glyphs-checked={len(set(text))}')
`;
  const r = spawnSync('python', ['-c', py, woff2Path, CHARS_FILE], { encoding: 'utf8' });
  if (r.status !== 0) {
    console.error(r.stdout, r.stderr);
    throw new Error('子集覆盖率核实失败：产物缺字，见上方 MISSING 列表');
  }
  console.log(`[核实] ${r.stdout.trim()}`);
}

async function main() {
  const naive = extractNaiveChars();
  const rendered = extractRenderedChars();
  console.log(`naive（整个 src/，含注释）唯一字符数: ${naive.size}`);
  console.log(`filtered（整个 src/，已去注释）唯一字符数: ${rendered.size}`);

  await ensureCached(SRC_TTF_URL, SRC_TTF, 20 * 1024 * 1024);
  await ensureCached(SRC_OFL_URL, SRC_OFL, 1024);
  verifyChecksum(SRC_TTF, SRC_TTF_SHA256);

  fs.mkdirSync(OUT_DIR, { recursive: true });
  fs.writeFileSync(CHARS_FILE, [...rendered].join(''), 'utf8');

  // 方案：保留可变字重轴（wght 200–900），单文件输出。字重方案的比选见
  // .superpowers/sdd/2026-08-10-shenxian-fight/task-25-report.md ——实测比"实例化
  // 400/700 两个静态字重"更小（子集后 glyf 表本身很小，可变字重的 gvar 增量开销
  // 反而低于两份静态文件重复的表头+hmtx+glyf 开销）。
  runPyftsubset([
    SRC_TTF,
    `--text-file=${CHARS_FILE}`,
    '--flavor=woff2',
    '--layout-features=*',
    `--output-file=${OUT_WOFF2}`,
  ]);

  verifyCoverage(OUT_WOFF2, rendered);

  fs.copyFileSync(SRC_OFL, OUT_OFL);
  fs.writeFileSync(
    OUT_MANIFEST,
    JSON.stringify({ chars: [...rendered].sort(), count: rendered.size }, null, 2) + '\n',
  );

  const size = fs.statSync(OUT_WOFF2).size;
  console.log(`产物: ${OUT_WOFF2}`);
  console.log(`体积: ${size} bytes (${(size / 1024).toFixed(1)} KiB)`);
  console.log(`glyph 数（含 ASCII）: ${rendered.size}`);
}

main().catch(err => { console.error(err); process.exit(1); });
