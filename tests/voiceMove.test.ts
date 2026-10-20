import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MoveRecorder, composeMove } from '../src/game/voiceMove';

let now = 0, rms = 0;
let frames = new Map<number, FrameRequestCallback>(), next = 0;
const contexts: FakeContext[] = [];
let initialState = 'running';
class FakeContext {
  state = initialState;
  resume = vi.fn(async () => { this.state = 'running'; });
  close = vi.fn(async () => { this.state = 'closed'; });
  constructor() { contexts.push(this); }
  createMediaStreamSource() { return { connect: vi.fn() }; }
  createAnalyser() { return { fftSize: 1024, getFloatTimeDomainData: (samples: Float32Array) => samples.fill(this.state === 'running' ? rms : 0) }; }
}
class FakeRecorder {
  static isTypeSupported = () => true;
  state = 'inactive'; mimeType = 'audio/webm';
  ondataavailable?: (e: { data: Blob }) => void;
  onstop?: () => void;
  start() { this.state = 'recording'; }
  stop() { this.state = 'inactive'; this.ondataavailable?.({ data: new Blob(['recorded audio']) }); this.onstop?.(); }
}
const track = { readyState: 'live', enabled: true, stop: vi.fn() } as unknown as MediaStreamTrack;
async function run(ms: number, energy: number) {
  rms = energy;
  for (let elapsed = 0; elapsed < ms; elapsed += 50) {
    now += 50;
    const current = [...frames.values()]; frames.clear();
    current.forEach(cb => cb(now));
    await Promise.resolve();
  }
}
beforeEach(() => {
  now = 0; rms = 0; frames = new Map(); next = 0; contexts.length = 0; initialState = 'running';
  vi.spyOn(performance, 'now').mockImplementation(() => now);
  vi.stubGlobal('MediaStream', class { constructor(_tracks: unknown[]) {} });
  vi.stubGlobal('MediaRecorder', FakeRecorder);
  vi.stubGlobal('AudioContext', FakeContext);
  vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => { frames.set(++next, cb); return next; });
  vi.stubGlobal('cancelAnimationFrame', (id: number) => frames.delete(id));
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe('spoken ultimate recording', () => {
  it('detects speech already in progress when a room starts recording', async () => {
    const spoken = vi.fn(), recorder = new MoveRecorder(track, { onSpeech: spoken });
    await run(1200, 0.12); await run(1600, 0);
    expect(spoken).toHaveBeenCalledOnce();
    expect(await recorder.result()).toBeInstanceOf(Blob);
    expect(track.stop).not.toHaveBeenCalled();
  });
  it('resumes a suspended analysis context before deciding there is no speech', async () => {
    initialState = 'suspended';
    const recorder = new MoveRecorder(track);
    await run(600, 0); await run(1200, 0.08); await run(1600, 0);
    expect(contexts[0].resume).toHaveBeenCalled();
    expect(await recorder.result()).toBeInstanceOf(Blob);
  });
  it('returns null for silence and releases analysis without stopping the shared room mic', async () => {
    const recorder = new MoveRecorder(track);
    await run(9500, 0);
    expect(await recorder.result()).toBeNull();
    expect(contexts[0].close).toHaveBeenCalledOnce();
    expect(track.stop).not.toHaveBeenCalled();
  });
  it('cancels without sending partial speech', async () => {
    const recorder = new MoveRecorder(track);
    await run(600, 0); await run(700, 0.1); recorder.cancel();
    expect(await recorder.result()).toBeNull();
  });
  it('surfaces transcription failures without exposing provider details', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ error: 'Transcription unavailable' }), { status: 502 })));
    await expect(composeMove('Flame Punch: strike the rabbit', 'EMBERPAW', 'CLOUDHOP', 'en')).rejects.toThrow('Transcription unavailable');
  });
});
