// 字体子集要用到的"真正会渲染的字符集"提取逻辑。scripts/subset-font.mjs（生成子集）
// 和 tests/font-coverage.test.mjs（覆盖率回归测试）共用这一份实现——两边各写一份的话，
// 一旦提取规则漂移，测试就只是在跟自己的另一份逻辑对表，抓不到真正的漏重跑。
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const REPO_ROOT = path.resolve(__dirname, '..');

/** 递归收集 dir 下所有 .ts/.tsx 文件的绝对路径。之前这里是一份"会渲染文案的文件白名单"，
 * fix round 1 撤掉了——白名单会漏掉"新加一个文件、里面有中文渲染文案"这种情形：生成脚本
 * 和覆盖率测试用的是同一份白名单，两边会一起漏看同一个文件，测试永远不会红，但那个字在
 * Android 上是真的缺。扫全部 src/ 不需要白名单来"保持准确"——真正做这件事的是下面的
 * stripComments：注释里的中文本来就不该算，去掉注释之后再扫全目录跟扫白名单一样准，
 * 还多了"新文件自动覆盖"这个免费的正确性。 */
function listSourceFiles(dir) {
  const out = [];
  const walk = d => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) walk(p);
      else if (/\.(ts|tsx)$/.test(e.name)) out.push(p);
    }
  };
  walk(dir);
  return out;
}

/** 去掉行注释 // 和块注释 /* *\/，字符串/模板字面量原样保留（含其中出现的 // 或 /*，
 * 只要是在引号里就不算注释开头）。简单状态机，不处理正则字面量、模板字符串里再嵌套
 * ${...} 表达式的边界情形——这个项目里没有这种写法，不需要为不存在的情形多写解析器。 */
export function stripComments(src) {
  let out = '';
  let i = 0;
  const n = src.length;
  let state = 'code'; // 'code' | 'line' | 'block' | 'string'
  let quote = '';
  while (i < n) {
    const c = src[i];
    const c2 = src[i + 1];
    if (state === 'code') {
      if (c === '/' && c2 === '/') { state = 'line'; i += 2; continue; }
      if (c === '/' && c2 === '*') { state = 'block'; i += 2; continue; }
      if (c === '"' || c === "'" || c === '`') { quote = c; state = 'string'; out += c; i++; continue; }
      out += c; i++; continue;
    }
    if (state === 'line') {
      if (c === '\n') { state = 'code'; out += c; }
      i++; continue;
    }
    if (state === 'block') {
      if (c === '*' && c2 === '/') { state = 'code'; i += 2; continue; }
      i++; continue;
    }
    // state === 'string'
    out += c;
    if (c === '\\') { out += c2 ?? ''; i += 2; continue; }
    if (c === quote) state = 'code';
    i++;
  }
  return out;
}

/** 只留下会被当"排印文字"处理的字符：中文（基本区 + 扩展 A-G/兼容表意文字）、CJK 标点、
 * 全角/半角形式、间隔号 ·（"如意棒·击"这类招式名大量使用，编码上不在 CJK 区块内，得单独收）。
 * 扩展 B 及以后都是增补表意平面（U+20000 起）的生僻字，这个项目目前只会用到基本区常用字，
 * 但连带收进来的成本是几行 range 判断，不是新解析逻辑——按"宁可多收不可漏收"的原则一并加上。
 * 表情符号（🔇🔊📱）、箭头（↺）这类不属于"古籍宋体"排印方向的字符主动排除——回退栈本来就
 * 接得住这些，硬塞进宋体子集的覆盖要求只会让测试对着表情符号永远报红。 */
export function isTypesetChar(ch) {
  const cp = ch.codePointAt(0);
  if (cp === 0x00b7) return true; // 间隔号 ·
  if (cp >= 0x3400 && cp <= 0x4dbf) return true; // CJK 扩展 A
  if (cp >= 0x4e00 && cp <= 0x9fff) return true; // CJK 统一表意文字（基本区）
  if (cp >= 0x3000 && cp <= 0x303f) return true; // CJK 符号和标点
  if (cp >= 0xff00 && cp <= 0xffef) return true; // 全角/半角形式（！全角标点等）
  if (cp >= 0xf900 && cp <= 0xfaff) return true; // CJK 兼容表意文字
  if (cp >= 0x20000 && cp <= 0x2fffd) return true; // 增补表意平面：扩展 B-F + 兼容表意文字补充
  if (cp >= 0x30000 && cp <= 0x3fffd) return true; // 第三表意平面：扩展 G 及以后
  return false;
}

export const ASCII_PRINTABLE = (() => {
  let s = '';
  for (let cp = 0x20; cp <= 0x7e; cp++) s += String.fromCodePoint(cp);
  return s;
})();

/** 扫全部 src/**\/*.{ts,tsx}，去注释后提取真正会渲染的字符 + ASCII 可见字符（数字/字母/
 * 常用符号，无论源码里有没有用到都固定收进来——这块很小，收进来能兜住万一某处直接拼
 * 英文/数字）。这是生成字体子集和覆盖率测试共用的"真值"。 */
export function extractRenderedChars(repoRoot = REPO_ROOT, dir = 'src') {
  const set = new Set(ASCII_PRINTABLE);
  for (const file of listSourceFiles(path.join(repoRoot, dir))) {
    const stripped = stripComments(fs.readFileSync(file, 'utf8'));
    for (const ch of stripped) if (isTypesetChar(ch)) set.add(ch);
  }
  return set;
}

/** 对照组：不去注释。只用来在生成报告里证明"排除注释"这一步确实把字表砍下来了，
 * 不用于生成字体子集，也不被测试引用。 */
export function extractNaiveChars(repoRoot = REPO_ROOT, dir = 'src') {
  const set = new Set(ASCII_PRINTABLE);
  for (const file of listSourceFiles(path.join(repoRoot, dir))) {
    const src = fs.readFileSync(file, 'utf8');
    for (const ch of src) if (isTypesetChar(ch)) set.add(ch);
  }
  return set;
}
