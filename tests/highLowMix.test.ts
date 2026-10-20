import { expect, test } from 'vitest';
import { Battle, jaReach } from '../src/engine/battle';
import { createAi } from '../src/engine/ai';
import { CHARACTERS } from '../src/data/characters';
import { STAGES } from '../src/data/stages';

/**
 * 上下段是这个游戏的读心本体：招式表里的 `guard: 'low' | 'overhead'`、
 * 白骨精"必杀也分上下段"的整套定位、提示条那句「站防才挡得住跳跃攻击」，
 * 全建在"两边都会来"这个前提上。
 *
 * 而中段只有一个来源——跳跃攻击（jA）。它一旦不出现，玩家一路蹲防就没有输的道理，
 * 整套读心塌成单边。此前实测正是如此：**下段 3.8~4.1 次/回合、中段 0.23~0.29，约 15:1**。
 * 病因是 AI 判"够不够得着"用了写死的 70，而十二个人的 jA 实际前伸 96~112——
 * 打得到的那一段里它不出手。
 */

function mix(si: number) {
  let rounds = 0, high = 0, low = 0;
  for (let a = 0; a < CHARACTERS.length; a++) for (let b = 0; b < CHARACTERS.length; b++) {
    if (a === b) continue;
    const bt = new Battle(structuredClone(CHARACTERS[a]), structuredClone(CHARACTERS[b]));
    const a1 = createAi(STAGES[si].ai, a * 13 + b * 7 + 1);
    const a2 = createAi(STAGES[si].ai, a * 31 + b * 5 + 3);
    rounds++;
    for (let f = 0; f < 60 * 120 && bt.winner === null; f++) {
      bt.tick(a1(bt, 0), a2(bt, 1));
      for (const e of bt.events) {
        if (e.type !== 'moveStart') continue;
        // 只数**跳跃攻击**，不数所有带 overhead 标记的招：白骨精的骨刺升也是中段，
        // 把它算进来会把 jA 的变化稀释掉——实测按 guard 数，写死 70 与修好之后是
        // 9:1 与 7:1，两者分不开；只数 jA 则是 0.23~0.29 与 0.39~0.52，一眼分得清。
        // 断言要贴着**这个改动实际管得着的那一件事**，不能贴在它的近邻上。
        if (e.move.slot === 'jA') high++;
        else if (e.move.guard === 'low') low++;
      }
    }
  }
  return { high: high / rounds, low: low / rounds };
}

test('中段真的会来——不然蹲防到底就没有输的道理', () => {
  // 取**两档的平均**而不是逐档判：逐档时两种状态挨得太近（修好后关4 是 0.34，
  // 而写死 70 时关1 就有 0.29），阈值只能夹在 6% 的缝里，那种线一有噪声就翻脸。
  // 平均之后分得开：修好 0.40 / 写死 0.26，比例 11.6 / 17.7。
  const s = [0, 3].map(mix);
  const high = (s[0].high + s[1].high) / 2;
  const ratio = (s[0].low / s[0].high + s[1].low / s[1].high) / 2;
  // 阈值按红检定：写死 70 是 0.26，改成按各自攻程判（×0.75）是 0.40，线放 0.32
  expect(high, `跳跃攻击平均只有 ${high.toFixed(2)} 次/回合，玩家不必站防`
    + `（逐档 ${s.map(x => x.high.toFixed(2)).join(' / ')}）`).toBeGreaterThan(0.32);
  // 下段本来就该更多（更快更安全），但不能多到"另一边等于不存在"。
  // 写死 70 是 17.7 倍，修好之后 11.6 倍，线放 14
  expect(ratio, `下段平均是跳跃攻击的 ${ratio.toFixed(1)} 倍，上下段塌成了单边`)
    .toBeLessThan(14);
});

test('AI 按自己的攻程判够不够得着，不是一个写死的数', () => {
  // 十二个人的 jA 前伸 96~112，写死一个数必然对一半人太紧、对另一半太松
  const reaches = CHARACTERS.map(c => jaReach(c, CHARACTERS[0]));
  expect(Math.max(...reaches) - Math.min(...reaches),
    '十二个人的跳跃攻击攻程完全一样？那写死一个数本来也无妨——这条断言失去意义')
    .toBeGreaterThan(10);
});
