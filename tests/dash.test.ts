import { expect, test } from 'vitest';
import { Battle } from '../src/engine/battle';
import { ARENA_MAX, ARENA_MIN } from '../src/engine/types';
import { NEZHA } from '../src/data/characters/nezha';
import { WUKONG } from '../src/data/characters/wukong';
import { NIUMO } from '../src/data/characters/niumo';
import { mv, press, run, testChar } from './helpers';

test('带 dash 的招式在指定帧后前进；不带 dash 的招式原地不动', () => {
  const moves = testChar().moves;
  const c = testChar({ moves: { ...moves, s1: mv('s1', { dash: [{ frame: 2, vx: 10 }] }) } });
  const b = new Battle(c, testChar(), 300, 800); // 拉开距离，不触发命中/分离
  const x0 = b.p1.x;
  b.tick(press({ skill1: true }), press()); // 起手，stateFrame=0
  run(b, 2); // stateFrame -> 2，dash 触发但本帧尚未积分新速度
  expect(b.p1.x).toBe(x0);
  run(b, 1); // stateFrame -> 3，积分上一帧设下的 vx
  expect(b.p1.x).toBeGreaterThan(x0);

  // 玩家最常见的输入序列：走两步再出招，不能让走路的残留速度漏进不带 dash 的招式
  const b2 = new Battle(testChar(), testChar(), 300, 800);
  b2.tick(press({ move: 1 }), press());
  b2.tick(press({ move: 1 }), press());
  b2.tick(press({ move: 1 }), press());
  expect(b2.p1.state).toBe('walk');
  b2.tick(press({ attack: true }), press()); // tryAttack 先于本帧的 vx 重新赋值执行，此刻 f.vx 还是上一帧走路留下的值
  expect(b2.p1.state).toBe('attack');
  const x2 = b2.p1.x;
  for (let i = 0; i < 15; i++) { // 15 > n1 的 startup3+active3+recovery5=11，覆盖整招
    b2.tick(press(), press());
    expect(b2.p1.x).toBe(x2);
  }
});

test('面朝左时冲刺方向相反', () => {
  const moves = testChar().moves;
  const c = testChar({ moves: { ...moves, s1: mv('s1', { dash: [{ frame: 2, vx: 10 }] }) } });
  const b = new Battle(c, testChar(), 800, 300); // 对手在左侧，p1 面朝左
  const x0 = b.p1.x;
  b.tick(press({ skill1: true }), press());
  expect(b.p1.facing).toBe(-1);
  run(b, 3);
  expect(b.p1.x).toBeLessThan(x0);
});

test('冲刺被场地边界钳制，不会冲出 ARENA_MAX', () => {
  const moves = testChar().moves;
  const c = testChar({ moves: { ...moves, s1: mv('s1', { dash: [{ frame: 2, vx: 50 }] }) } });
  const b = new Battle(c, testChar(), ARENA_MAX - 5, ARENA_MIN + 5);
  b.tick(press({ skill1: true }), press());
  run(b, 30);
  expect(b.p1.x).toBeLessThanOrEqual(ARENA_MAX);
});

test('招式结束的瞬间 vx 归零，不残留进下一帧的 idle', () => {
  const moves = testChar().moves;
  const c = testChar({ moves: { ...moves, s1: mv('s1', { dash: [{ frame: 2, vx: 10 }] }) } });
  const b = new Battle(c, testChar(), 300, 800);
  b.tick(press({ skill1: true }), press());
  // 只跑到「离开 attack 的那一帧」为止就停手——idle 分支下一帧会用
  // f.vx = input.move*speed 无条件重写 vx，走完那一帧再检查就看不出重置有没有发生了
  while (b.p1.state === 'attack') b.tick(press(), press());
  expect(b.p1.state).toBe('idle');
  expect(b.p1.vx).toBe(0);
});

test('dash 数组里的多次冲量都生效：3 次冲量的总位移大于只有其中 1 次', () => {
  const moves = testChar().moves;
  const frames: [number, number, number] = [20, 5, 10]; // 足够长，装得下 frame 2/8/14 三次冲量
  const single = testChar({ moves: { ...moves, s1: mv('s1', { startup: frames[0], active: frames[1], recovery: frames[2], dash: [{ frame: 2, vx: 8 }] }) } });
  const triple = testChar({
    moves: {
      ...moves,
      s1: mv('s1', {
        startup: frames[0], active: frames[1], recovery: frames[2],
        dash: [{ frame: 2, vx: 8 }, { frame: 8, vx: 8 }, { frame: 14, vx: 8 }],
      }),
    },
  });
  const totalFrames = frames[0] + frames[1] + frames[2];
  const runDisp = (c: ReturnType<typeof testChar>) => {
    const b = new Battle(c, testChar(), 300, 900); // 拉开距离，不触发命中/击退/separate 干扰纯位移对比
    const x0 = b.p1.x;
    b.tick(press({ skill1: true }), press());
    run(b, totalFrames);
    return b.p1.x - x0;
  };
  expect(runDisp(triple)).toBeGreaterThan(runDisp(single));
});

test('四个旧突进技迁移成单元素 dash 数组后，逐帧位移与迁移前（单个 dash 对象）完全一致——结构迁移，不是数值调整', () => {
  // 迁移前（Task 35 之前）这四招的 dash 分别是单个 { frame, vx } 对象，数值如下——硬编码在
  // 这里而不是直接读 def.moves[slot].dash[0]，是为了让这条测试真正锁住「数值没有随迁移改变」：
  // 如果只跟数据里现在的值自己对表，改错数值也会跟着「验证通过」，测试形同虚设
  const cases: { def: typeof NEZHA; slot: 's1' | 's2'; input: 'skill1' | 'skill2'; frame: number; vx: number }[] = [
    { def: NEZHA, slot: 's1', input: 'skill1', frame: 4, vx: 13 },
    { def: WUKONG, slot: 's1', input: 'skill1', frame: 3, vx: 10 },
    { def: WUKONG, slot: 's2', input: 'skill2', frame: 2, vx: 16 },
    { def: NIUMO, slot: 's1', input: 'skill1', frame: 4, vx: 15 },
  ];
  for (const { def, slot, input, frame, vx: expectedVx } of cases) {
    const m = def.moves[slot];
    expect(m.dash, `${def.id}.${slot} 应该带 dash`).toBeDefined();
    // 迁移前这里是单个 { frame, vx } 对象；迁移后必须仍是恰好 1 个元素的数组——
    // 元素数变了就不是「结构迁移」，是行为改动
    expect(m.dash!.length, `${def.id}.${slot} 迁移前是单次冲量`).toBe(1);
    const dash = m.dash![0];
    // 数值本身也必须跟迁移前完全一样，不只是数组形状对
    expect(dash, `${def.id}.${slot} 的 dash 数值不应在迁移中被改动`).toEqual({ frame, vx: expectedVx });
    const total = m.startup + m.active + m.recovery;

    const b = new Battle(def, testChar(), 300, 900);
    const x0 = b.p1.x;
    b.tick(press({ [input]: true }), press());
    run(b, total);
    const actual = b.p1.x - x0;

    // 按迁移前「单个对象」的语义手算同一组数字：p1 默认面朝右（facing=1），跟 battle.ts
    // attack 状态里的 x+=vx / vx*=0.88 / 命中 dash.frame 时 vx=dash.vx*facing 逐帧重演一遍
    let x = 0, vx = 0;
    for (let sf = 1; sf <= total; sf++) {
      x += vx;
      vx *= 0.88;
      if (sf === dash.frame) vx = dash.vx * 1;
    }
    expect(actual, `${def.id}.${slot}`).toBeCloseTo(x, 6);
  }
});
