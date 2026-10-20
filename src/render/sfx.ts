import type { BattleEvent } from '../engine/types';
type Kind = 'hit' | 'block' | 'whiff' | 'throw' | 'super' | 'ko' | 'escape' | 'victory' | 'taunt';

const MUTE_KEY = 'sxfight.muted';

// localStorage 在隐私模式下访问（哪怕只是读）就可能抛异常，key 不存在或被手改成非法值
// 也要兜底：任何异常/非 'true' 值一律按「未静音」处理，默认不静音
function readMuted(): boolean {
  try {
    return window.localStorage.getItem(MUTE_KEY) === 'true';
  } catch {
    return false;
  }
}

// try/catch inside readMuted also covers `window` itself not existing (SSR/node test env):
// referencing an undefined global throws a ReferenceError, which is caught the same way
let muted = readMuted();

export function isMuted(): boolean {
  return muted;
}

export function setMuted(b: boolean): void {
  muted = b;
  try {
    window.localStorage.setItem(MUTE_KEY, String(b));
  } catch {
    // 隐私模式等场景下写入会抛异常：静音状态仍在内存里生效，只是本次不跨刷新持久化
  }
}

let ac: AudioContext | null = null;

/** The shared AudioContext only if something already created it. Volume and stop calls use this so they never create
 * one before a user gesture (browsers block that and log a warning). */
export function existingAudioCtx(): AudioContext | null {
  return ac;
}

/** Shared by music and sound effects so iOS can unlock both with one gesture. */
export function audioCtx(): AudioContext | null {
  return ctx();
}

function ctx(): AudioContext | null {
  if (typeof window === 'undefined' || !('AudioContext' in window)) return null;
  if (!ac) ac = new AudioContext();
  // 'running' 以外的状态都要拉一把：iOS 来电/通知后是 'interrupted' 不是 'suspended'，
  // 只处理 suspended 会导致中断一次后音频永久哑掉；resume() 的 rejection 要接住，否则
  // 弹一条未处理 promise 错误
  if (ac.state !== 'running') ac.resume().catch(() => {});
  return ac;
}

/** 在真实用户手势（点击/触摸）里调用一次：WebKit 只允许在手势期间创建/恢复
 * AudioContext，第一次音效发生在 rAF 回调里往往已经太晚，整局都会哑掉 */
export function unlockAudio(): void {
  const a = ctx();
  if (a) loadSamples(a);
}

// Task 26：只有大招重击命中（ev.heavy）和 KO 这两处换真实采样，其余保留合成——见
// task-26-brief。采样加载失败绝不能让这两个音消失：fetch/decodeAudioData 任何一步
// 抛错都吞掉，buffer 留 null，sfx() 播放前判空，null 就落回下面原有的合成实现。
// 加载只发起一次（不是每次 unlockAudio() 调用都重新 fetch），且不看 isMuted()——
// 用户可能先静音再进入战斗，中途又在 MuteButton 上取消静音，若那时采样还没加载
// 就会在整局里都听不到采样、只能听到合成音兜底：虽不算「消失」（不违反硬性约束），
// 但没必要放弃这几十 KB 的免费加载窗口，因此总是发起加载，只在 sfx() 播放时判 muted
type SampleKey = 'heavyHit' | 'ko';
// 同 parts.ts 那条：走 BASE_URL，不写死开头的 /。这一路的失败也是静默的
// （拿不到采样就一直用合成兜底，听得出区别但不会报错）
const SAMPLE_URL: Record<SampleKey, string> = {
  heavyHit: `${import.meta.env.BASE_URL}sfx/impactPunch_heavy_002.ogg`,
  ko: `${import.meta.env.BASE_URL}sfx/impactBell_heavy_004.ogg`,
};
const samples: Record<SampleKey, AudioBuffer | null> = { heavyHit: null, ko: null };
let samplesRequested = false;

async function loadSample(a: AudioContext, key: SampleKey) {
  try {
    const res = await fetch(SAMPLE_URL[key]);
    if (!res.ok) return; // 404 等：samples[key] 保持 null，sfx() 落回合成
    const bytes = await res.arrayBuffer();
    samples[key] = await a.decodeAudioData(bytes);
  } catch {
    // fetch 失败（离线/网络错误）或 decodeAudioData 失败（响应损坏/编码不支持）：
    // 保持 null 即可，两个事件的音效由 sfx() 落回合成，绝不会因此静默
  }
}

function loadSamples(a: AudioContext): void {
  if (samplesRequested) return;
  samplesRequested = true;
  loadSample(a, 'heavyHit');
  loadSample(a, 'ko');
}

function playSample(buf: AudioBuffer) {
  const a = ctx();
  if (!a) return;
  const src = a.createBufferSource();
  src.buffer = buf;
  src.connect(a.destination);
  src.start();
}

/** 简易合成：方波/噪声 + 短包络。参数：起始频率、结束频率、时长、音量 */
/** delay：延后多少秒起音。用 AudioContext 的时间轴排，不用 setTimeout——
 * 后者会被主线程卡顿推着走，几个音之间的间隔就散了（bgm 的排程同理，见那边的注释）。 */
function tone(type: OscillatorType, f0: number, f1: number, dur: number, vol: number, delay = 0) {
  const a = ctx();
  if (!a) return;
  const t0 = a.currentTime + delay;
  const osc = a.createOscillator();
  const g = a.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(f0, t0);
  osc.frequency.exponentialRampToValueAtTime(Math.max(f1, 1), t0 + dur);
  g.gain.setValueAtTime(0, t0);
  g.gain.setValueAtTime(vol, t0 + 0.001);
  g.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
  osc.connect(g).connect(a.destination);
  osc.start(t0);
  osc.stop(t0 + dur + 0.02);
}

function noise(dur: number, vol: number) {
  const a = ctx();
  if (!a) return;
  const len = a.sampleRate * dur;
  const buf = a.createBuffer(1, len, a.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
  const src = a.createBufferSource();
  const g = a.createGain();
  g.gain.value = vol;
  src.buffer = buf;
  src.connect(g).connect(a.destination);
  src.start();
}

/** heavy: 仅对 'hit' 有意义（对应 ev.heavy，大招命中）；采样就绪就播采样，否则合成兜底。
 * 加了默认值，其余五个调用点（block/whiff/throw/super/ko 的 kind 本身）不用改。 */
/** 一条战斗事件该放哪种声音。抽成纯函数是为了能按真实对局统计每种声音的出现率——
 * 合成器里写了一种声音、却没有任何事件会触发它，那就是死代码，肉眼看不出来。
 * 返回 null 表示这条事件不发声。 */
export function sfxForEvent(ev: BattleEvent): { kind: Kind; heavy: boolean } | null {
  switch (ev.type) {
    case 'hit': return { kind: ev.blocked ? 'block' : 'hit', heavy: ev.heavy };
    case 'throw': return { kind: 'throw', heavy: false };
    case 'super': case 'maxMode': return { kind: 'super', heavy: false };
    case 'ko': return { kind: 'ko', heavy: false };
    // 这三条以前落到 default 里被静静丢掉——正是这个函数的注释里说的那种"肉眼看不出来"的死角
    case 'guardCancel': return { kind: 'escape', heavy: true };
    case 'tech': case 'throwEscape': return { kind: 'escape', heavy: false };
    case 'moveStart':
      // 大招的发动声由 super 事件负责，这里不重复
      if (ev.move.meterCost > 0) return null;

      // 挑衅借了 s1 的槽位（见 battle 的 tauntMove），照下面那条规则会被当成必杀，
      // 发出一记沉重的兵器破空声——而它是个**空手的嘲讽动作**，没有判定框、伤害为 0。
      // AI 现在每回合会挑衅 0.3 次，这声不对就一直不对。
      if (ev.move.id.endsWith('_taunt')) return { kind: 'taunt', heavy: false };
      // 普攻轻挥、必杀与吹飞重挥：后者起手 8-12 帧、收招 14-24 帧，是"对手交出身体"的
      // 信号，听得见才谈得上读招
      return { kind: 'whiff', heavy: !ev.move.slot.startsWith('n') };
    default: return null;
  }
}

export function sfx(kind: Kind, heavy = false) {
  if (muted) return;
  switch (kind) {
    case 'hit':
      if (heavy && samples.heavyHit) playSample(samples.heavyHit);
      else { tone('square', 180, 40, 0.12, 0.25); noise(0.08, 0.2); }
      break;
    case 'block': tone('triangle', 500, 200, 0.08, 0.15); break;
    // 挥空声分两档。轻档给普攻（起手 3-6 帧，声音要短到不拖节奏）；
    // 重档给必杀与吹飞：那些招起手 8-12 帧、收招 14-24 帧，是"对手交出身体"的信号，
    // 听得见才谈得上读招。改之前只有普攻会响，一记打空的必杀完全无声，
    // 而实测空挥率有 46%——近一半的攻击既没有画面反馈也没有声音。
    case 'whiff':
      if (heavy) { tone('sine', 190, 60, 0.16, 0.13); noise(0.05, 0.05); }
      else tone('sine', 300, 100, 0.06, 0.08);
      break;
    case 'throw': tone('square', 120, 30, 0.2, 0.3); noise(0.15, 0.25); break;
    case 'super': tone('sawtooth', 80, 600, 0.5, 0.3); break;
    // 守方翻盘（受身 / 投技解脱 / 防御取消）：金属脆响 + 一点推开的低频。
    // 这三件事此前一个声音都没有——而它们恰好是全套系统里仅有的三个"你脱出来了"的瞬间，
    // 听不见就学不会，等于这三套机制对玩家不存在。
    // heavy 档留给防御取消：它要花 50 气，是三者里最贵的一次翻盘。
    case 'escape':
      tone('triangle', heavy ? 880 : 700, heavy ? 260 : 320, heavy ? 0.16 : 0.1, heavy ? 0.22 : 0.14);
      if (heavy) tone('square', 150, 60, 0.14, 0.16);
      noise(0.06, heavy ? 0.16 : 0.1);
      break;
    // 胜利定音：落在造型摆定、台词出现的那一帧。
    // 实测 KO 之后那 120 帧（2 秒）每局只有 0.08 次发声——赢家在摆造型、在说话，
    // 而声音上是全静的；而对局本身的声音密度是一路上扬的（每十分之一段 6.9 → 10.7 次），
    // 最热的那一下之后突然掉到零，收尾等于没有落点。
    // 两声上行的三度 + 一点余韵，与「超必杀」的锯齿扫频、「KO」的噪声炸裂都分得开。
    // 挑衅：两声**下行**的短音，正好是 victory 那串上行琶音的反面——
    // 一个是"我赢了"，一个是"就这？"。短，因为它每回合都会响
    case 'taunt':
      tone('triangle', 523, 392, 0.22, 0.13);
      tone('triangle', 392, 311, 0.20, 0.10, 0.10);
      break;
    case 'victory':
      tone('triangle', 392, 392, 0.5, 0.16);
      tone('triangle', 523, 523, 0.7, 0.18, 0.11);
      tone('sine', 784, 784, 0.9, 0.08, 0.24);
      break;
    case 'ko':
      if (samples.ko) playSample(samples.ko);
      else { tone('square', 400, 30, 0.6, 0.35); noise(0.4, 0.3); }
      break;
  }
}

// 测试专用：注入/重置采样状态，绕开真实网络加载去验证「采样就绪时播采样、未就绪时落回合成、
// 静音时两者都不播」这几条兜底路径。不导出到生产代码路径之外的地方使用。
export function __setSampleForTest(key: SampleKey, buf: AudioBuffer | null): void {
  samples[key] = buf;
}
export function __resetSamplesForTest(): void {
  samples.heavyHit = null;
  samples.ko = null;
  samplesRequested = false;
}
