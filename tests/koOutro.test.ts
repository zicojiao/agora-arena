import { expect, test } from 'vitest';
import { Battle, KO_OUTRO } from '../src/engine/battle';
import { CHARACTERS } from '../src/data/characters';
import { MOTIONS } from '../src/data/motions';
import { NULL_INPUT } from '../src/engine/types';

// 两条实测出来的毛病：
// ① KO 之后 tick 直接 return，整场瞬间冻住——frame 711→711，被击飞的人停在半空、倒地
//    动作根本不播，KO 慢镜慢放的是一张静止画面。
// ② 连打期间受击方的姿势钉死——hit 动作只有 14 帧且不循环，而 stateFrame 一路涨到
//    88/184/280/376，samplePose 钳在末帧，于是整整十秒同一个姿势。

const koRun = () => {
  const b = new Battle(structuredClone(CHARACTERS[0]), structuredClone(CHARACTERS[0]));
  b.p1.x = 380; b.p2.x = 440; b.p2.hp = 6; b.p1.meter = 100;
  b.tick({ ...NULL_INPUT, super: true }, NULL_INPUT);
  let koFrame = -1;
  const after: { d: number; state: string; y: number }[] = [];
  for (let i = 0; i < 1400; i++) {
    const was = b.winner;
    b.tick(NULL_INPUT, NULL_INPUT);
    if (was === null && b.winner !== null) koFrame = b.frame;
    if (koFrame > 0 && b.frame > koFrame) after.push({ d: b.frame - koFrame, state: b.p2.state, y: b.p2.y });
  }
  return { b, koFrame, after };
};

test('KO 在终结一击落地那一刻宣布，被击飞者正在腾空——不是等出招者收完势、人早已站定', () => {
  const { b, koFrame } = koRun();
  expect(koFrame, '应该宣布过 KO').toBeGreaterThan(0);
  expect(b.p1.hitCount, '终结一击必须已经落地').toBe(CHARACTERS[0].moves.sp100.multiHit!.hits);
});

test('KO 之后世界继续推进，被击飞者走完弧线、落地、进入倒地——不是整场冻住', () => {
  const { after } = koRun();
  expect(after.length, 'KO 后必须还有帧在推进').toBeGreaterThan(50);
  expect(Math.max(...after.map(s => s.y)), 'KO 后应该看得到滞空弧线').toBeGreaterThan(60);
  expect(after.some(s => s.state === 'down'), 'KO 后应该落地进入倒地').toBe(true);
});

test('落幕帧跑完之后才真正停住，且输家不再爬起来', () => {
  const { b, after } = koRun();
  expect(after.filter(s => s.d <= KO_OUTRO).length).toBeGreaterThan(0);
  expect(b.p2.state, '输家不该站回 idle——结算画面得看得出谁被打死了').toBe('down');
  const tail = after.filter(s => s.d > KO_OUTRO + 5);
  expect(tail.every(s => s.state === 'down'), '落幕帧之后应保持倒地').toBe(true);
});

test('连打期间受击方每一下都重新起反应，姿势不会钉死在末帧', () => {
  const b = new Battle(structuredClone(CHARACTERS[0]), structuredClone(CHARACTERS[0]));
  b.p1.x = 380; b.p2.x = 440; b.p2.hp = 6; b.p1.meter = 100;
  b.tick({ ...NULL_INPUT, super: true }, NULL_INPUT);
  let lastHits = 0;
  const framesAtHit: number[] = [];
  for (let i = 0; i < 900; i++) {
    b.tick(NULL_INPUT, NULL_INPUT);
    if (b.p1.hitCount > lastHits) { lastHits = b.p1.hitCount; framesAtHit.push(b.p2.stateFrame); }
  }
  expect(framesAtHit.length).toBeGreaterThan(20);
  // 每次命中当帧受击方的 stateFrame 都应回到 0 附近，而不是一路累加
  const worst = Math.max(...framesAtHit);
  expect(worst, `命中当帧受击方 stateFrame 最大到了 ${worst}，说明反应没有重放`).toBeLessThan(3);
});

test('挨打/腾空/倒地各有自己的动作，且腾空那套是循环的（滞空多久都不会停在一帧）', () => {
  for (const id of ['hit', 'hitAlt', 'tumble', 'fallen']) {
    expect(MOTIONS[id], `缺动作 ${id}`).toBeDefined();
  }
  expect(MOTIONS.tumble.loop, '腾空翻滚必须循环，否则滞空一长就钉死').toBe(true);
  // 两套挨打反应必须真的不同，否则交替等于没交替
  expect(MOTIONS.hitAlt.keys[0].pose).not.toEqual(MOTIONS.hit.keys[0].pose);
});
