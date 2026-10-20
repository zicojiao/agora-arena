// 把某个角色实际会播的全部动作，从代码里的 MOTIONS 导出成外部骨骼文件
// （public/skel/<id>.json）。
//
// 用途有两个：
//   1. 迁移起点——美术拿到的不是空文件，而是现有动作的完整导出，可以在工具里打开、改，
//      再放回来。从零 K 一遍 8 招 × 600 帧不现实。
//   2. 往返验证——导出再导入必须逐帧等价（tests/skeletonRoundTrip.test.ts），
//      不等价就说明这套映射有信息损失，那甲这条路就是假的。
//
// 用法: node scripts/export-skeleton.mjs nezha
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const require = createRequire(import.meta.url);

// Pose 通道 → 骨名（BONE_MAP 的逆表）。成对通道拆成上下两根骨。
const CHANNEL_BONE = {
  lean: 'torso', crouch: 'hips', roll: 'root', squash: 'body', headTilt: 'head',
  armF: ['armF', 'armFLower'], armB: ['armB', 'armBLower'],
  legF: ['legF', 'legFLower'], legB: ['legB', 'legBLower'],
};

/** 一个角色实际会播到的动作 id 全集 */
function motionIdsFor(charId, char, MOTIONS) {
  const ids = new Set([
    'idle', 'walk', 'jump', 'block', 'crouch',                 // 状态动作（全角色共用）
    ...['Hit', 'HitAlt', 'Tumble', 'Fallen'].map(s => charId + s), // 受击反应（各角色专属）
  ]);
  for (const mv of Object.values(char.moves)) {
    ids.add(mv.motionId);
    for (const seg of mv.motionSeq ?? []) ids.add(seg.motionId);
    for (const seg of mv.brief?.motionSeq ?? []) ids.add(seg.motionId);
  }
  return [...ids].filter(id => MOTIONS[id]);
}

function exportMotion(m) {
  const bones = {};
  const put = (bone, t, v, ease) => {
    (bones[bone] ??= []).push(ease && ease !== 'linear' ? { t, v, ease } : { t, v });
  };
  for (const k of m.keys) {
    for (const [channel, bone] of Object.entries(CHANNEL_BONE)) {
      const val = k.pose[channel];
      if (Array.isArray(bone)) {
        put(bone[0], k.t, val[0], k.ease);
        put(bone[1], k.t, val[1], k.ease);
      } else {
        put(bone, k.t, val, k.ease);
      }
    }
  }
  return { duration: m.frames, ...(m.loop ? { loop: true } : {}), bones };
}

const charId = process.argv[2];
if (!charId) { console.error('用法: node scripts/export-skeleton.mjs <charId>'); process.exit(1); }

// 用 tsx/vite 之外的最省事办法：让 vitest 的解析器不参与，直接读编译产物不现实，
// 所以这里走一次 esbuild-register 式的动态 import（vite 已在依赖里）
const { createServer } = require('vite');
const server = await createServer({ root: ROOT, server: { middlewareMode: true }, logLevel: 'error' });
const { MOTIONS } = await server.ssrLoadModule('/src/data/motions.ts');
const { CHARACTERS } = await server.ssrLoadModule('/src/data/characters/index.ts');
await server.close();

const char = CHARACTERS.find(c => c.id === charId);
if (!char) { console.error(`没有角色 ${charId}`); process.exit(1); }

const ids = motionIdsFor(charId, char, MOTIONS);
const animations = {};
for (const id of ids) animations[id] = exportMotion(MOTIONS[id]);

// fps 用 60：这是从代码导出的，本来就是本项目的帧率，不做无谓换算
const doc = { _comment: `由 scripts/export-skeleton.mjs 从 MOTIONS 导出。骨名遵循 src/render/poseSource.ts 的 BONE_MAP 约定。`, fps: 60, animations };
const out = path.join(ROOT, 'public', 'skel', `${charId}.json`);
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, JSON.stringify(doc, null, 1));

const keyCount = Object.values(animations).reduce((n, a) =>
  n + Object.values(a.bones).reduce((m, t) => m + t.length, 0), 0);
console.log(`导出 ${charId}: ${ids.length} 个动作, ${keyCount} 条骨骼关键帧, ${(fs.statSync(out).size / 1024).toFixed(0)} KB`);
console.log(`  → ${path.relative(ROOT, out)}`);
