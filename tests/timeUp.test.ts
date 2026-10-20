import { expect, test } from 'vitest';
import { Battle } from '../src/engine/battle';
import { CHARACTERS } from '../src/data/characters';
import { NULL_INPUT } from '../src/engine/types';
import { BannerSystem } from '../src/render/banner';

// 读秒判胜这条路，AI 对局 474 个回合里**一次都没走到**（平均 29 秒结束，时限 60 秒）。
// 于是它一直保持着两个错的表演：
//   ① 发 ko 事件 —— 那套演出是兵器脱手扎地、震屏、慢镜、镜头怼脸，
//      而此刻"输家"正站着、血还剩一半，画面在说一件没发生的事
//   ② 不置 victory —— 赢家既没造型也没台词，靠时间赢下来和什么都没发生长得一样
// 玩家（会龟、会跑）比 AI 容易得多走到这里。

/** 把回合推到读秒结束，返回这一段里所有事件 */
function runToTimeUp(hpRatioP2: number) {
  const b = new Battle(structuredClone(CHARACTERS[0]), structuredClone(CHARACTERS[1]));
  b.p2.hp = Math.round(b.p2.def.hp * hpRatioP2);
  b.timeLeft = 3;
  const evs: string[] = [];
  for (let i = 0; i < 10; i++) {
    b.tick({ ...NULL_INPUT }, { ...NULL_INPUT });
    for (const ev of b.events) evs.push(ev.type);
  }
  return { b, evs };
}

test('读秒赢下的回合不走 KO 演出——没人被打倒', () => {
  const { b, evs } = runToTimeUp(0.5);
  expect(b.timeUp, '没到时间').toBe(true);
  expect(b.winner, '血多的那边没判赢').toBe(0);
  expect(b.p2.state, '输家被打倒了？读秒时他还站着').not.toBe('down');
  expect(evs, 'ko 事件驱动的是兵器脱手/震屏/慢镜那一整套死亡演出，读秒时它在骗人')
    .not.toContain('ko');
});

test('读秒赢下的回合照样摆胜利姿势', () => {
  const { b } = runToTimeUp(0.5);
  expect(b.p1.victory, '赢家没有起姿势——读秒赢和什么都没发生长得一样').toBeGreaterThan(0);
  expect(b.p2.victory, '输家也在庆祝').toBe(0);
});

test('读秒平局两边都不摆姿势', () => {
  const { b, evs } = runToTimeUp(1);   // 双方满血，比例相等
  expect(b.timeUp).toBe(true);
  expect(b.winner, '完全平局却判了胜负').toBe(null);
  expect(b.p1.victory + b.p2.victory, '平局还有人庆祝').toBe(0);
  expect(evs).not.toContain('ko');
});

// 读秒平局那一支此前根本没停手：winner 留 null、doubleKo 也是 false，
// 于是 tick 顶部那条「判完就不再收输入」的闸门一个都不成立，整场继续照打。
test('读秒判完就收手——平局之后不能再打出一个胜负', () => {
  const b = new Battle(structuredClone(CHARACTERS[0]), structuredClone(CHARACTERS[0]));
  b.p2.x = b.p1.x + 60;          // 贴脸
  b.p1.hp = 8; b.p2.hp = 8;      // 比例相等 = 平局，且一下就能打死
  b.timeLeft = 3;
  for (let i = 0; i < 5; i++) b.tick({ ...NULL_INPUT }, { ...NULL_INPUT });
  expect(b.timeUp).toBe(true);
  expect(b.winner, '用例没成立：这一局不是平局').toBe(null);

  const hp = b.p2.hp;
  for (let i = 0; i < 120; i++) {
    b.tick({ ...NULL_INPUT, attack: i % 12 < 2, move: 1 }, { ...NULL_INPUT });
  }
  expect(b.p2.hp, `平局判完之后又掉了 ${hp - b.p2.hp} 点血`).toBe(hp);
  expect(b.winner, '回合早已判为平局，四秒后又悄悄变成一方获胜').toBe(null);
});

// 横幅这一侧：判重必须用「报过没有」而不是「正在播没有」——
// 横幅 120 帧后自己熄灭，而 timeUp/doubleKo 状态位一直是真，只看 on 的话它会熄一次点一次。
test('判词只报一次，熄灭之后不会自己再点着', () => {
  const bn = new BannerSystem();
  expect(bn.showVerdict('时间到'), '第一次没点着').toBe(true);
  expect(bn.showVerdict('时间到'), '同一回合报了第二次').toBe(false);
  for (let i = 0; i < 200; i++) bn.tick();       // 远超横幅寿命
  expect(bn.verdictOn(), '横幅到点没熄').toBe(false);
  expect(bn.showVerdict('时间到'), '熄灭之后又点着了——调用方每帧都在调，这会无限循环').toBe(false);
});
