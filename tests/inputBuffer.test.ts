import { expect, test } from 'vitest';
import { Battle } from '../src/engine/battle';
import { CHARACTERS } from '../src/data/characters';
import { NULL_INPUT } from '../src/engine/types';

// 先行入力。没有它的时候，在硬直/收招里点的键会被直接丢掉——实测单帧轻点只有
// 14% 能出招，手感就是"我按了但没反应"，触屏上尤其明显。拳皇量级是 3-8 帧。

/** 在 press 帧点一下拳，看这一下最终有没有兑现成招 */
function tap(setup: (b: Battle) => void, press: number): boolean {
  const c = CHARACTERS[0];
  const b = new Battle(structuredClone(c), structuredClone(c));
  b.p2.x = b.p1.x + 200;   // 拉远：近身按拳会变成投技，测的就不是出招了
  setup(b);
  for (let f = 0; f < 40; f++) {
    b.tick({ ...NULL_INPUT, attack: f === press }, { ...NULL_INPUT });
    if (b.p1.state === 'attack' && b.p1.move?.slot === 'n1') return true;
  }
  return false;
}

const inHitstun = (b: Battle) => { b.p1.state = 'hitstun'; b.p1.stun = 12; b.p1.stateFrame = 0; };
const inBlockstun = (b: Battle) => { b.p1.state = 'block'; b.p1.stun = 8; b.p1.stateFrame = 0; };

test('硬直里点的键会被记住——解除硬直时兑现出来', () => {
  // 硬直 12 帧、缓冲 6 帧：第 6 帧之后点的都该兑现
  const late = [7, 8, 9, 10, 11].filter(p => tap(inHitstun, p));
  expect(late.length, `硬直末段点的拳仍然被吞（兑现 ${late.length}/5）`).toBe(5);
});

test('按太早不算——缓冲是几帧，不是无限记忆', () => {
  // 第 0 帧点、硬直还有 12 帧：早过了窗口，不该在十几帧后突然冒出来
  expect(tap(inHitstun, 0), '半秒前的手滑不该突然出招').toBe(false);
});

test('格挡硬直里点的键同样记得住', () => {
  const ok = [4, 5, 6, 7].filter(p => tap(inBlockstun, p));
  expect(ok.length, `格挡硬直末段点的拳被吞（兑现 ${ok.length}/4）`).toBe(4);
});

test('一次点击只兑现一招——不能在连续几帧里反复出招', () => {
  const c = CHARACTERS[0];
  const b = new Battle(structuredClone(c), structuredClone(c));
  b.p2.x = b.p1.x + 200;
  let starts = 0, prev = '';
  for (let f = 0; f < 60; f++) {
    b.tick({ ...NULL_INPUT, attack: f === 0 }, { ...NULL_INPUT });
    const id = b.p1.state === 'attack' ? (b.p1.move?.id ?? '') : '';
    if (id && id !== prev) starts++;
    prev = id;
  }
  expect(starts, `一次点击出了 ${starts} 招`).toBe(1);
});

test('按住不放不会把缓冲堆满——解除硬直时不该连喷', () => {
  const c = CHARACTERS[0];
  const b = new Battle(structuredClone(c), structuredClone(c));
  b.p2.x = b.p1.x + 200;
  inHitstun(b);
  let starts = 0, prev = '';
  for (let f = 0; f < 60; f++) {
    b.tick({ ...NULL_INPUT, attack: true }, { ...NULL_INPUT });   // 全程按住
    const id = b.p1.state === 'attack' ? (b.p1.move?.id ?? '') : '';
    if (id && id !== prev) starts++;
    prev = id;
  }
  // 按住不放本来就该连续出招（那是连打），但要和"缓冲堆积后一瞬间喷完"区分开：
  // 60 帧里 n1 全长 15 帧，最多四五次；一瞬间连喷会远超这个数
  expect(starts, `按住 60 帧出了 ${starts} 招，缓冲堆积了`).toBeLessThanOrEqual(6);
});
