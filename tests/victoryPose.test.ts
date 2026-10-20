import { expect, test } from 'vitest';
import canvasSrc from '../src/ui/GameCanvas.tsx?raw';
import sfxSrc from '../src/render/sfx.ts?raw';
import { Battle, KO_OUTRO } from '../src/engine/battle';
import { CHARACTERS } from '../src/data/characters';
import { MOTIONS, victoryQuoteFrame } from '../src/data/motions';
import { NULL_INPUT } from '../src/engine/types';

// KO 之后有 KO_OUTRO 帧的收尾，此前赢的那一位在这段时间里就站着发呆——
// 结算页已经在用 quotes.win 说台词，画面上却没有对应的动作。

/** 打到一方倒下，返回那一局的 battle。
 * 「够得着才出手，够不着就走」——第一版写成每 6 帧无条件按一次攻击，
 * 而 n1 要 15 帧，人全程卡在 attack 状态里、移动输入被吞，距离一直是 360，一下都没打到。 */
function fightToKo(): Battle {
  const b = new Battle(structuredClone(CHARACTERS[0]), structuredClone(CHARACTERS[1]));
  b.p2.hp = 1;
  for (let f = 0; f < 600 && b.winner === null; f++) {
    const near = Math.abs(b.p1.x - b.p2.x) <= 90;
    b.tick({ ...NULL_INPUT, attack: near, move: near ? 0 : 1 }, { ...NULL_INPUT });
  }
  return b;
}

test('赢家进入胜利姿势，输家不进', () => {
  const b = fightToKo();
  expect(b.winner, '用例没成立：没有分出胜负').toBe(0);
  expect(b.p1.victory, '赢家没有进入胜利姿势').toBeGreaterThan(0);
  expect(b.p2.victory, '输家也在摆胜利姿势').toBe(0);
});

test('胜利计时每逻辑帧恰好推进一次，且覆盖得住整段收尾', () => {
  const b = fightToKo();
  // 先把 KO 那一下的顿帧走完。顿帧期间 tick 会提前返回，整个世界（含这个计时）都冻着——
  // 那是对的，胜利姿势不该在定格里继续走。第一版没跳这一段，30 次 tick 只推进了 26。
  let guard = 0;
  while (b.hitstop > 0 && guard++ < 60) b.tick(NULL_INPUT, NULL_INPUT);
  expect(b.hitstop, '顿帧一直没散').toBe(0);
  const at = b.p1.victory;
  for (let i = 0; i < 30; i++) b.tick(NULL_INPUT, NULL_INPUT);
  expect(b.p1.victory - at, '胜利计时没有按逻辑帧推进（或一帧推进了多次）').toBe(30);
  // 动作时长要够长：走完之前收尾就该结束，否则最后会定在末帧——那正是想要的"摆住"，
  // 但如果动作比收尾还短很多，玩家看到的大半段是静止的
  expect(MOTIONS.victory.frames, '胜利动作比 KO 收尾短太多，大半段会是静止的')
    .toBeGreaterThan(KO_OUTRO * 0.6);
  expect(MOTIONS.victory.loop, '胜利姿势不该循环——末帧定住才是"摆住的那个造型"').toBe(false);
});

test('双 KO 平局时没有人摆胜利姿势', () => {
  const c = CHARACTERS[0];
  const b = new Battle(structuredClone(c), structuredClone(c));
  b.p1.hp = 1; b.p2.hp = 1;
  b.p1.x = 400; b.p2.x = 450;
  for (let f = 0; f < 120 && !b.doubleKo && b.winner === null; f++) {
    b.tick({ ...NULL_INPUT, attack: f % 5 === 0 }, { ...NULL_INPUT, attack: f % 5 === 0 });
  }
  if (b.doubleKo) {
    expect(b.p1.victory, '双 KO 平局却有人在摆胜利姿势').toBe(0);
    expect(b.p2.victory, '双 KO 平局却有人在摆胜利姿势').toBe(0);
  }
});

// 四个人赢了摆同一个造型，与当初"四人大招背光除了名字全一样"是同一类问题：
// 系统建好了、查找位留好了，却一个都没配，肉眼在代码里看不出来。

test('四个角色各有自己的胜利姿势，不是共用一套', () => {
  const missing = CHARACTERS.filter(c => !MOTIONS[`${c.id}Victory`]).map(c => c.name);
  expect(missing, `这些角色还在用通用胜利姿势：${missing.join('、')}`).toEqual([]);
});

test('四套胜利姿势彼此不同——不能是复制粘贴改个名', () => {
  // 比"定住的那一帧"：造型的差别全在这里，中间过程相近是可以的
  const holds = CHARACTERS.map(c => {
    const m = MOTIONS[`${c.id}Victory`];
    return { name: c.name, pose: JSON.stringify(m.keys[m.keys.length - 1].pose) };
  });
  const seen = new Map<string, string>();
  for (const h of holds) {
    const dup = seen.get(h.pose);
    expect(dup, `${h.name} 和 ${dup} 的定格姿势一模一样`).toBeUndefined();
    seen.set(h.pose, h.name);
  }
});

test('四套都不循环、都盖得住 KO 收尾', () => {
  for (const c of CHARACTERS) {
    const m = MOTIONS[`${c.id}Victory`];
    expect(m.loop, `${c.name} 的胜利姿势在循环——末帧定住才是"摆住的那个造型"`).toBe(false);
    expect(m.frames, `${c.name} 的胜利姿势比 KO 收尾短太多，大半段是静止的`)
      .toBeGreaterThan(KO_OUTRO * 0.6);
    // 首帧要接得住"刚打完"的收势，不能一上来就是定格
    expect(JSON.stringify(m.keys[0].pose), `${c.name} 的胜利姿势第一帧就是定格，没有起势`)
      .not.toBe(JSON.stringify(m.keys[m.keys.length - 1].pose));
  }
});

// 胜利台词：quotes.win 早就写好了，却只在结算页出现，摆造型那 120 帧一个字都没有。
// 拳皇里胜利姿势是带话的，台词该落在造型定住的那一刻。

test('台词触发帧落在造型定住之后，不是抡到一半', () => {
  for (const c of CHARACTERS) {
    const m = MOTIONS[`${c.id}Victory`];
    const keys = m.keys;
    const holdStart = keys[keys.length - 2].t;
    expect(JSON.stringify(keys[keys.length - 1].pose),
      `${c.name} 的胜利动作末段不是定格，"说话时已经摆定"这件事无从谈起`)
      .toBe(JSON.stringify(keys[keys.length - 2].pose));
    const at = victoryQuoteFrame(c.id);
    expect(at, `${c.name} 的造型 ${holdStart} 帧才定住，台词却在第 ${at} 帧就说了，会盖在半途上`)
      .toBeGreaterThanOrEqual(holdStart);
    // 也不能说得太晚：KO 收尾一共 KO_OUTRO 帧，说完总得留时间看见
    expect(KO_OUTRO - at, `${c.name} 的台词说得太晚，还没显示完结算页就接手了`).toBeGreaterThan(40);
  }
});

test('四套动作的收势时刻本来就不一样——所以这个帧数必须推导，不能写死', () => {
  // 第一版把触发帧写死成 58，牛魔王要 66 才定住，他会在抡到一半时开口。
  // 这条把"它们确实不一致"这件事钉住：一旦有人把 victoryQuoteFrame 改回常量，
  // 上面那条会对其中几个角色报红。
  const ats = CHARACTERS.map(c => victoryQuoteFrame(c.id));
  expect(new Set(ats).size, `四套胜利动作的收势帧全一样（${ats.join('/')}），这条测试失去意义`)
    .toBeGreaterThan(1);
});

// KO 之后那 120 帧此前是**全静**的：实测每局只有 0.08 次发声，
// 而对局本身的声音密度一路上扬（每十分之一段 6.9 → 10.7 次）——
// 最热的那一下之后突然掉到零，收尾没有落点。
test('胜利定音和台词落在同一帧，且合成器认得这一档', () => {
  expect(canvasSrc.includes("sfx('victory')"), 'GameCanvas 没有在胜利时发声').toBe(true);
  // 与台词在**同一个 if 块**里触发。第一版按字符距离判（相隔 200 字符内），
  // 红检把定音挪到别处时它没报——挪去的位置恰好还在阈值内。
  // 距离不是结构：挡得住"删掉"，挡不住"挪走"。这里改成真的取出那个块来看。
  const head = canvasSrc.indexOf('if (f.victory === victoryQuoteFrame');
  expect(head, '触发条件的锚点变了，这条断言失效').toBeGreaterThan(0);
  const open = canvasSrc.indexOf('{', head);
  let depth = 0, end = open;
  for (let k = open; k < canvasSrc.length; k++) {
    if (canvasSrc[k] === '{') depth++;
    else if (canvasSrc[k] === '}') { depth--; if (depth === 0) { end = k; break; } }
  }
  const block = canvasSrc.slice(open, end + 1);
  expect(block.includes('showWinQuote'), '台词不在这个块里，锚点错了').toBe(true);
  expect(block.includes("sfx('victory')"),
    '胜利定音不在触发台词的那个块里——两者会走散（一个改了另一个不会跟着动）').toBe(true);
  // 合成器里真有这一档，不是落到 switch 的末尾什么都不响
  expect(sfxSrc.includes("case 'victory':"), 'sfx 里没有 victory 这一档，按了不会响').toBe(true);
});

test('延时音符用 AudioContext 的时间轴排，不用 setTimeout', () => {
  // setTimeout 会被主线程卡顿推着走，几个音之间的间隔就散了（bgm 的排程同理）
  const i = sfxSrc.indexOf("case 'victory':");
  const seg = sfxSrc.slice(i, i + 400);
  expect(seg.includes('setTimeout'), '胜利定音用了 setTimeout 排延时音符').toBe(false);
});
