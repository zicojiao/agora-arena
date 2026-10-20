import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const sdk = vi.hoisted(() => ({ clients: [] as any[], connect: () => Promise.resolve(), upload: () => Promise.resolve({ id: 'frame' }) }));
vi.mock('@reactor-models/fast-h3-omni', () => ({
  FastH3OmniModel: class {
    handlers = new Map<string, (...args: any[]) => void>();
    connect = vi.fn(() => sdk.connect());
    disconnect = vi.fn(async () => undefined);
    setCanvas = vi.fn(async () => true);
    setClipSeconds = vi.fn(async () => true);
    setFlushOnClipEnd = vi.fn(async () => true);
    setAutoplay = vi.fn(async () => true);
    uploadFile = vi.fn(() => sdk.upload());
    enqueue = vi.fn(async () => true);
    getLastError = vi.fn(() => null);
    constructor() { sdk.clients.push(this); }
    on(name: string, handler: (...args: any[]) => void) { this.handlers.set(name, handler); }
    emit(name: string, ...args: any[]) { this.handlers.get(name)?.(...args); }
  },
}));
import { H3Session, H3_START_TIMEOUT_MS } from '../src/h3-session';

class FakeStream {
  tracks: MediaStreamTrack[] = [];
  getTracks() { return this.tracks; }
  addTrack(track: MediaStreamTrack) { this.tracks.push(track); }
  removeTrack(track: MediaStreamTrack) { this.tracks = this.tracks.filter(t => t !== track); }
}
const deferred = <T,>() => {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(r => { resolve = r; });
  return { promise, resolve };
};
const reference = { name: 'frame.webp' } as File;
const events = () => ({ onState: vi.fn(), onStream: vi.fn(), onError: vi.fn() });
const token = () => new Response(JSON.stringify({ jwt: 'test-token' }), { status: 200 });

beforeEach(() => {
  vi.useFakeTimers();
  sdk.clients.length = 0;
  sdk.connect = () => Promise.resolve();
  sdk.upload = () => Promise.resolve({ id: 'frame' });
  vi.stubGlobal('MediaStream', FakeStream);
  vi.stubGlobal('fetch', vi.fn(async () => token()));
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

describe('FastH3 cancellation and clip completion', () => {
  it('never connects when a token arrives after cancellation, even if fetch ignores abort', async () => {
    const pending = deferred<Response>();
    vi.stubGlobal('fetch', vi.fn(() => pending.promise));
    const session = new H3Session(events());
    const prepared = session.prepare(reference);
    const rejection = expect(prepared).rejects.toThrow('closed');
    const request = vi.mocked(fetch).mock.calls[0][1]!;
    await session.close();
    expect(request.signal?.aborted).toBe(true);
    pending.resolve(token());
    await rejection;
    expect(sdk.clients[0].connect).not.toHaveBeenCalled();
  });

  it('disconnects again when an in-flight connection completes after close', async () => {
    const pending = deferred<void>();
    sdk.connect = () => pending.promise;
    const session = new H3Session(events());
    const prepared = session.prepare(reference);
    const rejection = expect(prepared).rejects.toThrow('closed');
    await vi.waitFor(() => expect(sdk.clients[0].connect).toHaveBeenCalled());
    await session.close();
    pending.resolve();
    await rejection;
    expect(sdk.clients[0].disconnect).toHaveBeenCalledTimes(2);
    expect(sdk.clients[0].setCanvas).not.toHaveBeenCalled();
  });

  it('never enqueues a reference upload that finishes after cancellation', async () => {
    const pending = deferred<{ id: string }>();
    sdk.upload = () => pending.promise;
    const callbacks = events();
    const session = new H3Session(callbacks);
    const generated = session.generate('prompt', reference, 'Move');
    const rejection = expect(generated).rejects.toThrow('closed');
    await vi.waitFor(() => expect(sdk.clients[0].uploadFile).toHaveBeenCalled());
    await session.close();
    pending.resolve({ id: 'late-frame' });
    await rejection;
    expect(sdk.clients[0].enqueue).not.toHaveBeenCalled();
    expect(callbacks.onError).not.toHaveBeenCalled();
  });

  it('suppresses every late callback and stops tracks received after close', async () => {
    const callbacks = events();
    const session = new H3Session(callbacks);
    await session.prepare(reference);
    await session.close();
    const client = sdk.clients[0];
    const track = { kind: 'video', stop: vi.fn() };
    client.emit('trackReceived', 'main_video', track);
    client.emit('message', { type: 'clip_started' });
    client.emit('message', { type: 'clip_finished' });
    client.emit('error', new Error('late failure'));
    await vi.advanceTimersByTimeAsync(100_000);
    expect(track.stop).toHaveBeenCalledOnce();
    expect(callbacks.onStream).not.toHaveBeenCalled();
    expect(callbacks.onState).not.toHaveBeenCalled();
    expect(callbacks.onError).not.toHaveBeenCalled();
  });

  it('finishes once by video fallback despite duplicate start, finish and late errors', async () => {
    const callbacks = events();
    const session = new H3Session(callbacks, 8);
    await session.generate('prompt', reference, 'Move');
    const client = sdk.clients[0];
    client.emit('message', { type: 'clip_started' });
    await vi.advanceTimersByTimeAsync(5_000);
    client.emit('message', { type: 'clip_started' });
    await vi.advanceTimersByTimeAsync(6_000);
    client.emit('message', { type: 'clip_finished' });
    client.emit('message', { type: 'clip_started' });
    client.emit('error', new Error('connection ended'));
    await vi.advanceTimersByTimeAsync(100_000);
    expect(callbacks.onState.mock.calls.filter(([state]) => state === 'playing')).toHaveLength(1);
    expect(callbacks.onState.mock.calls.filter(([state]) => state === 'finished')).toHaveLength(1);
    expect(callbacks.onError).not.toHaveBeenCalled();
    await session.close();
  });

  it('does not finish twice when clip_finished wins the fallback race', async () => {
    const callbacks = events();
    const session = new H3Session(callbacks);
    await session.generate('prompt', reference, 'Move');
    sdk.clients[0].emit('message', { type: 'clip_started' });
    sdk.clients[0].emit('message', { type: 'clip_finished' });
    await vi.advanceTimersByTimeAsync(100_000);
    expect(callbacks.onState.mock.calls.filter(([state]) => state === 'finished')).toHaveLength(1);
    expect(callbacks.onError).not.toHaveBeenCalled();
    await session.close();
  });

  it('reports startup timeout only once and ignores a subsequently arriving clip', async () => {
    const callbacks = events();
    const session = new H3Session(callbacks);
    await session.generate('prompt', reference, 'Move');
    await vi.advanceTimersByTimeAsync(H3_START_TIMEOUT_MS);
    sdk.clients[0].emit('message', { type: 'clip_started' });
    sdk.clients[0].emit('error', new Error('late error'));
    expect(callbacks.onError).toHaveBeenCalledOnce();
    expect(callbacks.onState.mock.calls.some(([state]) => state === 'playing')).toBe(false);
    await session.close();
  });

  it('reuses a pre-warmed connection: connects once, hands over early tracks on attach, then only uploads', async () => {
    vi.stubGlobal('performance', { now: () => 1000, mark: () => undefined, getEntriesByType: () => [], clearMarks: () => undefined });
    const session = new H3Session();
    await session.connect();
    const client = sdk.clients[0];
    const video = { kind: 'video', stop: vi.fn() } as unknown as MediaStreamTrack;
    client.emit('trackReceived', 'main_video', video);
    expect(session.usable).toBe(true);
    expect(session.gpuReadyAt).toBe(1000);
    expect(client.uploadFile).not.toHaveBeenCalled();

    const handlers = events();
    session.attach(handlers);
    expect(handlers.onStream).toHaveBeenCalledOnce();
    expect((handlers.onStream.mock.calls[0][0] as unknown as FakeStream).getTracks()).toEqual([video]);

    await session.prepare(reference);
    expect(sdk.clients).toHaveLength(1);
    expect(client.connect).toHaveBeenCalledOnce();
    expect(client.uploadFile).toHaveBeenCalledOnce();
    await session.close();
  });
});
