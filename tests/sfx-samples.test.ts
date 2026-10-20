import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { __resetSamplesForTest, __setSampleForTest, setMuted, sfx } from '../src/render/sfx';

// sfx.ts 的 ctx() 只在 window.AudioContext 存在时才创建真实节点；vitest 默认跑在无 window
// 的 node 环境（见 tests/sfx.test.ts），所以这里搭一个最小假 AudioContext 挂到全局上，
// 好让 tone()/noise()/playSample() 里的 createOscillator/createBufferSource 调用有地方落地，
// 从而能用「有没有创建振荡器节点」区分「走了合成音」还是「走了采样播放」这两条路径。
const createOscillator = vi.fn(() => ({
  type: 'sine',
  frequency: { setValueAtTime: vi.fn(), exponentialRampToValueAtTime: vi.fn() },
  connect: vi.fn().mockReturnThis(),
  start: vi.fn(),
  stop: vi.fn(),
}));
const createGain = vi.fn(() => ({
  gain: { setValueAtTime: vi.fn(), exponentialRampToValueAtTime: vi.fn(), value: 1 },
  connect: vi.fn().mockReturnThis(),
}));
const createBufferSource = vi.fn(() => ({
  buffer: null as unknown,
  connect: vi.fn().mockReturnThis(),
  start: vi.fn(),
}));
const createBuffer = vi.fn((_ch: number, length: number) => ({
  getChannelData: () => new Float32Array(length),
}));

class FakeAudioContext {
  state = 'running';
  currentTime = 0;
  sampleRate = 44100;
  destination = {};
  resume = vi.fn().mockResolvedValue(undefined);
  createOscillator = createOscillator;
  createGain = createGain;
  createBufferSource = createBufferSource;
  createBuffer = createBuffer;
}

// sfx.ts 内部用的是裸标识符 `window` 和 `AudioContext`（浏览器里两者本就是同一个全局对象上
// 的属性），node 环境下要把两处都塞上假实现，ctx() 里 `'AudioContext' in window` 和
// `new AudioContext()` 才都能通过
(globalThis as unknown as { window: unknown }).window = { AudioContext: FakeAudioContext };
(globalThis as unknown as { AudioContext: unknown }).AudioContext = FakeAudioContext;

const fakeBuffer = {} as AudioBuffer; // playSample() 只做 src.buffer = buf，不需要真实 AudioBuffer

beforeEach(() => {
  vi.clearAllMocks();
  __resetSamplesForTest();
  setMuted(false);
});
afterEach(() => {
  __resetSamplesForTest();
  setMuted(false);
});

test('重击命中：采样已就绪时播放采样，不触发合成振荡器', () => {
  __setSampleForTest('heavyHit', fakeBuffer);
  sfx('hit', true);
  expect(createOscillator).not.toHaveBeenCalled();
  expect(createBufferSource).toHaveBeenCalledTimes(1);
  expect(createBufferSource.mock.results[0].value.buffer).toBe(fakeBuffer);
});

test('重击命中：采样未就绪时回退到合成音（振荡器仍被创建）', () => {
  // __resetSamplesForTest() 已在 beforeEach 跑过，heavyHit 保持 null——模拟采样加载失败/未完成
  sfx('hit', true);
  expect(createOscillator).toHaveBeenCalled(); // tone() 落地了，证明真的在走合成兜底
});

test('KO：采样已就绪时播放采样，不触发合成振荡器', () => {
  __setSampleForTest('ko', fakeBuffer);
  sfx('ko');
  expect(createOscillator).not.toHaveBeenCalled();
  expect(createBufferSource).toHaveBeenCalledTimes(1);
  expect(createBufferSource.mock.results[0].value.buffer).toBe(fakeBuffer);
});

test('静音时：即使采样已就绪，重击命中和 KO 都不播放任何音频节点', () => {
  __setSampleForTest('heavyHit', fakeBuffer);
  __setSampleForTest('ko', fakeBuffer);
  setMuted(true);
  sfx('hit', true);
  sfx('ko');
  expect(createOscillator).not.toHaveBeenCalled();
  expect(createBufferSource).not.toHaveBeenCalled();
  expect(createBuffer).not.toHaveBeenCalled();
});
