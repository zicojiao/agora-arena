import { expect, test } from 'vitest';
import gen from '../scripts/gen-parts.py?raw';
import doc from '../docs/art-pipeline.md?raw';

// docs/art-pipeline.md 第 3 节写死了约定：**所有部件图都按「角色面朝右」的姿势画**，
// 引擎按 facing 镜像，所以只画一份。可出图脚本里八处躯干提示词一直写着 "Front view"——
// 头三分侧面朝右、身子正对镜头，横版格斗里整个人本该是侧身站姿。
// 文档和脚本各说各的，谁都不会红，于是重出了两轮素材都把错的朝向烙得更深。
test('出图提示词不许和「面朝右」的约定打架', () => {
  expect(gen.includes('Front view'),
    'gen-parts.py 里还有 "Front view"——与 art-pipeline.md 第 3 节的「面朝右」约定矛盾').toBe(false);
  expect(doc.includes('面朝右'), 'art-pipeline.md 不再写「面朝右」，这条守门失去依据，请一并更新').toBe(true);
  // 每一条躯干提示词都要显式说明朝向，不能只靠共用的形状约束那一句
  const torsos = gen.split('\n').filter(l => l.includes("'torso'") && l.includes('Torso only'));
  expect(torsos.length, '找不到躯干提示词，选择器过期了').toBeGreaterThan(6);
  for (const t of torsos) {
    expect(t.includes('turned to the right'), `这条躯干提示词没写朝向：${t.slice(0, 70)}`).toBe(true);
  }
});
