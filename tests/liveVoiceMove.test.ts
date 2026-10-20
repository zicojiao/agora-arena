import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LiveMoveTranscriber } from '../src/game/liveVoiceMove';

// Only the external browser transport/audio APIs are faked; transcription lifecycle is real.
let peer: FakePeer;
let clone: { enabled: boolean; stop: ReturnType<typeof vi.fn> };
const source = { readyState: 'live', enabled: true, stop: vi.fn(), clone: () => (clone = { enabled: true, stop: vi.fn() }) } as unknown as MediaStreamTrack;
class FakeChannel {
  readyState = 'connecting';
  onopen?: () => void; onmessage?: (event: { data: string }) => void; onclose?: () => void;
  send = vi.fn(); close = vi.fn();
  open() { this.readyState = 'open'; this.onopen?.(); }
  event(type: string, data = {}) { this.onmessage?.({ data: JSON.stringify({ type, ...data }) }); }
}
class FakePeer {
  channel = new FakeChannel(); connectionState = 'new'; onconnectionstatechange?: () => void;
  close = vi.fn(); sender = { replaceTrack: vi.fn(async () => undefined) };
  constructor() { peer = this; }
  addTrack() { return this.sender; }
  createDataChannel() { return this.channel; }
  createOffer = async () => ({ type: 'offer', sdp: 'v=0\r\nm=audio' });
  setLocalDescription = async () => undefined;
  setRemoteDescription = async () => undefined;
}
async function connected(events = {}) {
  const transcriber = new LiveMoveTranscriber(source, 'en', events);
  await vi.waitFor(() => expect(fetch).toHaveBeenCalled());
  peer.channel.open();
  return transcriber;
}
beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal('RTCPeerConnection', FakePeer);
  vi.stubGlobal('MediaStream', class { constructor(_tracks: unknown[]) {} });
  vi.stubGlobal('AudioContext', class {
    resume = async () => undefined; close = vi.fn(async () => undefined);
    createMediaStreamSource = () => ({ connect: vi.fn() });
    createAnalyser = () => ({ fftSize: 1024, getFloatTimeDomainData: (data: Float32Array) => data.fill(0.1) });
  });
  vi.stubGlobal('requestAnimationFrame', () => 1); vi.stubGlobal('cancelAnimationFrame', vi.fn());
  vi.stubGlobal('fetch', vi.fn(async () => new Response('v=0\r\ns=answer')));
  vi.mocked(source.stop).mockClear();
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });
describe('live move transcription', () => {
  it('opens the session in the interface language', async () => {
    const transcriber = new LiveMoveTranscriber(source, 'zh');
    await vi.waitFor(() => expect(fetch).toHaveBeenCalled());
    expect(String(vi.mocked(fetch).mock.calls[0][0])).toBe('/api/ultimate/session?lang=zh');
    transcriber.cancel();
  });
  it('shows partial text but resolves only the committed final transcript', async () => {
    const onText = vi.fn(), onReady = vi.fn();
    const t = await connected({ onText, onReady });
    let settled = false; void t.result().then(() => { settled = true; });
    peer.channel.event('conversation.item.input_audio_transcription.delta', { item_id: 'one', delta: 'Fire ' });
    peer.channel.event('conversation.item.input_audio_transcription.delta', { item_id: 'one', delta: 'Dragon' });
    expect(onText).toHaveBeenLastCalledWith('Fire Dragon');
    expect(settled).toBe(false);
    t.finish(); t.finish();
    await vi.advanceTimersByTimeAsync(250);
    expect(peer.channel.send).toHaveBeenCalledTimes(1);
    expect(JSON.parse(peer.channel.send.mock.calls[0][0])).toEqual({ type: 'input_audio_buffer.commit' });
    peer.channel.event('conversation.item.input_audio_transcription.completed', { item_id: 'one', transcript: 'Fire Dragon: a fire dragon strikes the opponent.' });
    expect(await t.result()).toBe('Fire Dragon: a fire dragon strikes the opponent.');
    expect(onReady).toHaveBeenCalledOnce();
    expect(clone.stop).toHaveBeenCalledOnce(); expect(source.stop).not.toHaveBeenCalled();
    expect(peer.close).toHaveBeenCalledOnce();
  });
  it('cancels a release before connection and never starts streaming later', async () => {
    const t = new LiveMoveTranscriber(source, 'en');
    t.finish();
    expect(await t.result()).toBeNull();
    await Promise.resolve(); peer.channel.open();
    expect(clone.enabled).toBe(false); expect(clone.stop).toHaveBeenCalledOnce();
    expect(peer.channel.send).not.toHaveBeenCalled();
    expect(source.stop).not.toHaveBeenCalled();
  });
  it('ignores late partial/final events after typing or cancelling', async () => {
    const onText = vi.fn(); const t = await connected({ onText });
    t.cancel();
    peer.channel.event('conversation.item.input_audio_transcription.delta', { delta: 'late text' });
    peer.channel.event('conversation.item.input_audio_transcription.completed', { transcript: 'late text' });
    expect(await t.result()).toBeNull(); expect(onText).not.toHaveBeenCalled();
    expect(source.stop).not.toHaveBeenCalled();
  });
  it('fails recoverably when final transcription never arrives', async () => {
    const t = await connected();
    const result = expect(t.result()).rejects.toThrow(/timed out/i);
    t.finish(); await vi.advanceTimersByTimeAsync(21_000);
    await result; expect(peer.close).toHaveBeenCalledOnce();
  });
  it('closes an interrupted peer without stopping the Agora microphone', async () => {
    const t = await connected(); const result = expect(t.result()).rejects.toThrow(/connect|lost/i);
    peer.connectionState = 'failed'; peer.onconnectionstatechange?.();
    await result; expect(clone.stop).toHaveBeenCalledOnce(); expect(source.stop).not.toHaveBeenCalled();
  });
});
