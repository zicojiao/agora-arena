// 纯 JS（不是 .ts）：这个测试要 import node:fs/node:path，而项目没装 @types/node
// （tsconfig 的 types 只列了 vite/client），写成 .ts 会被 tsc --noEmit 卡住——
// 同 offlineAssets.test.mjs / font-coverage.test.mjs 的理由。这条约定我刚踩过一次。
import { expect, test } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

// 上面 parts.test.ts 那几条全用假 Image，一个字节都不碰 public/——
// 而 docs/art-missing-parts.md 一直写着"跑一次 npm run verify（parts.test.ts 会检查挂载路径）"，
// 那句话此前是**假的**：素材名写错、放错目录、多出一件不被探测的部件，全都能安静通过。
// 这个文件把那句话变成真的。
//
// 尤其要守**多出来的部件**：探测列表收窄到 head/torso 之后，往 chars/<id>/ 放一张 armF.png
// 会被完全无视——没有 404、没有报错、画面上照旧是程序化的胳膊，加素材的人得不到任何反馈。
test('public/chars 里的每个文件都在探测列表内，且命名合规', () => {
  const PROBED = ['head', 'torso'];          // 与 src/render/parts.ts 的 NAMES 一致
  const root = 'public/chars';
  expect(fs.existsSync(root), 'public/chars 不见了').toBe(true);

  const stray = [];
  for (const id of fs.readdirSync(root).filter(n => !n.startsWith('.'))) {   // skip .DS_Store and other OS files
    const dir = path.join(root, id);
    if (!fs.statSync(dir).isDirectory()) { stray.push(`${id} 不是目录`); continue; }
    if (!/^[a-z]+$/.test(id)) stray.push(`${dir} 目录名不是全小写字母（渲染层按 def.id 拼路径）`);
    for (const f of fs.readdirSync(dir).filter(n => !n.startsWith('.'))) {
      const m = /^([a-zA-Z]+)\.png$/.exec(f);
      if (!m) { stray.push(`${dir}/${f} 不是 <部件名>.png`); continue; }
      if (!PROBED.includes(m[1])) {
        stray.push(`${dir}/${f} 的部件名不在探测列表 [${PROBED}] 内——它永远不会被加载，`
          + '要么改名，要么把这个名字加回 src/render/parts.ts 的 NAMES');
      }
    }
  }
  expect(stray, `public/chars 里有挂不上的素材：\n${stray.join('\n')}`).toEqual([]);
});
