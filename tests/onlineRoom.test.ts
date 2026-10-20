import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { OnlineRoom, newRoomCode, normalizeRoomCode } from '../src/online/room';

describe('six-digit room codes', () => {
  it('creates shareable numeric codes without leading zeros', () => {
    for (let i = 0; i < 100; i++) expect(newRoomCode()).toMatch(/^[1-9]\d{5}$/);
  });

  it('accepts six digits and common copy formatting, but rejects letters and wrong lengths', () => {
    expect(normalizeRoomCode('123456')).toBe('123456');
    expect(normalizeRoomCode(' 123-456 ')).toBe('123456');
    for (const input of ['12345', '1234567', 'ABC123', 'ABC123456', '123.456', '']) {
      expect(normalizeRoomCode(input)).toBeNull();
    }
  });

  it('rejects random values outside the uniform range', () => {
    const random = vi.spyOn(crypto, 'getRandomValues');
    random.mockImplementationOnce(array => { (array as Uint32Array)[0] = 0xffffffff; return array; });
    random.mockImplementationOnce(array => { (array as Uint32Array)[0] = 0; return array; });
    try { expect(newRoomCode()).toBe('100000'); }
    finally { random.mockRestore(); }
  });
});

const mocks = vi.hoisted(() => {
  const rtcEvents: Record<string, (...args: any[]) => void> = {};
  const rtmEvents: Record<string, (...args: any[]) => void> = {};
  const rtc = { on: vi.fn((name, fn) => { rtcEvents[name] = fn; }), join: vi.fn(), leave: vi.fn(),
    publish: vi.fn(), unpublish: vi.fn(), subscribe: vi.fn(), renewToken: vi.fn(), enableAudioVolumeIndicator: vi.fn() };
  const rtm = { addEventListener: vi.fn((name, fn) => { rtmEvents[name] = fn; }), login: vi.fn(), logout: vi.fn(),
    subscribe: vi.fn(), publish: vi.fn(), renewToken: vi.fn() };
  const mic = { close: vi.fn(), getMediaStreamTrack: vi.fn(), setEnabled: vi.fn() };
  return { rtc, rtm, mic, rtcEvents, rtmEvents, makeRtc: vi.fn(() => rtc), makeMic: vi.fn() };
});
vi.mock('agora-rtc-sdk-ng', () => ({ default: { createClient: mocks.makeRtc, createMicrophoneAudioTrack: mocks.makeMic } }));
vi.mock('agora-rtm', () => ({ default: { RTM: class { constructor() { return mocks.rtm; } } } }));
const deferred = <T,>() => { let resolve!: (value: T) => void; const promise = new Promise<T>(r => { resolve = r; }); return { promise, resolve }; };
const token = () => new Response(JSON.stringify({ appId: 'app', token: 'token', uid: '123', channel: 'goat-clash-room-123456' }));
const flush = async () => { for (let i = 0; i < 20; i++) await Promise.resolve(); };
beforeEach(() => {
  vi.clearAllMocks();
  for (const fn of [mocks.rtc.join, mocks.rtc.leave, mocks.rtc.publish, mocks.rtc.unpublish, mocks.rtc.subscribe,
    mocks.rtc.renewToken, mocks.rtm.login, mocks.rtm.logout, mocks.rtm.subscribe, mocks.rtm.publish, mocks.rtm.renewToken]) fn.mockResolvedValue(undefined);
  mocks.makeMic.mockResolvedValue(mocks.mic);
  vi.stubGlobal('fetch', vi.fn().mockImplementation(async () => token()));
});
afterEach(() => vi.unstubAllGlobals());

describe('OnlineRoom lifetime boundaries', () => {
  it('uses the same numeric code for voice, game messages and token requests', async () => {
    const room = new OnlineRoom('123456', { onMessage: vi.fn() });
    await room.join(false);
    expect(fetch).toHaveBeenCalledWith('/api/agora/token?channel=goat-clash-room-123456');
    expect(mocks.rtc.join).toHaveBeenCalledWith('app', 'goat-clash-room-123456', 'token', 123);
    expect(room.gameChannel).toBe('goat-clash-room-123456-game');
    await room.leave();
  });
  it('leaving during token fetch prevents SDK connection and connected callbacks', async () => {
    const pending = deferred<Response>(); vi.mocked(fetch).mockReturnValueOnce(pending.promise);
    const onState = vi.fn(); const room = new OnlineRoom('123456', { onMessage: vi.fn(), onState });
    const joined = room.join().catch(e => e); const left = room.leave();
    pending.resolve(token()); await joined; await left;
    expect(mocks.rtm.login).not.toHaveBeenCalled(); expect(mocks.makeRtc).not.toHaveBeenCalled();
    expect(onState).not.toHaveBeenCalledWith('connected');
  });
  it('closes a microphone acquired after leaving without publishing it', async () => {
    const pending = deferred<typeof mocks.mic>(); mocks.makeMic.mockReturnValueOnce(pending.promise);
    const onState = vi.fn(); const room = new OnlineRoom('123456', { onMessage: vi.fn(), onState });
    const joined = room.join().catch(e => e);
    await vi.waitFor(() => expect(mocks.makeMic).toHaveBeenCalled());
    const left = room.leave(); pending.resolve(mocks.mic); await joined; await left;
    expect(mocks.mic.close).toHaveBeenCalled(); expect(mocks.rtc.publish).not.toHaveBeenCalled();
    expect(onState).not.toHaveBeenCalledWith('connected');
    expect(room.rtc).toBeNull(); expect(room.rtm).toBeNull();
  });
  it('releases failed joins and ignores late incoming callbacks after leave', async () => {
    mocks.rtc.join.mockRejectedValueOnce(new Error('join failed'));
    const onMessage = vi.fn(); const room = new OnlineRoom('123456', { onMessage });
    await expect(room.join()).rejects.toThrow('join failed');
    expect(mocks.rtm.logout).toHaveBeenCalled();
    await room.leave();
    mocks.rtmEvents.message({ channelName: room.gameChannel, publisher: '456', message: '{"k":"start"}' });
    expect(onMessage).not.toHaveBeenCalled();
  });
  it('cleans a join that completes after exit, and repeated leave shares cleanup', async () => {
    const pending = deferred<void>(); mocks.rtc.join.mockReturnValueOnce(pending.promise);
    const room = new OnlineRoom('123456', { onMessage: vi.fn() });
    const joined = room.join().catch(e => e);
    await vi.waitFor(() => expect(mocks.rtc.join).toHaveBeenCalled());
    const left = room.leave(); expect(room.leave()).toBe(left);
    pending.resolve(); await joined; await left;
    expect(mocks.makeMic).not.toHaveBeenCalled();
    expect(mocks.rtc.leave).toHaveBeenCalled(); expect(mocks.rtm.logout).toHaveBeenCalled();
    expect(room.rtc).toBeNull(); expect(room.rtm).toBeNull();
  });
  it('keeps a voice-optional room usable when publishing the microphone fails', async () => {
    mocks.rtc.publish.mockRejectedValueOnce(new Error('device lost'));
    const onError = vi.fn(); const onState = vi.fn();
    const room = new OnlineRoom('123456', { onMessage: vi.fn(), onError, onState });
    await room.join();
    expect(room.hasMic).toBe(false); expect(mocks.mic.close).toHaveBeenCalled();
    expect(onState).toHaveBeenCalledWith('connected'); expect(onError).toHaveBeenCalledOnce();
    await room.leave();
  });
  it('starts resource cleanup without waiting for a stuck goodbye publish', async () => {
    const room = new OnlineRoom('123456', { onMessage: vi.fn() }); await room.join();
    mocks.rtm.publish.mockReturnValueOnce(new Promise(() => undefined));
    const left = room.leave(); await flush();
    expect(mocks.mic.close).toHaveBeenCalled(); expect(mocks.rtc.leave).toHaveBeenCalled();
    await left;
  });
});

describe('room token renewal', () => {
  it('renews RTC and RTM with the same identity and coalesces expiry notifications', async () => {
    const room = new OnlineRoom('123456', { onMessage: vi.fn() }); await room.join(false);
    const pending = deferred<Response>(); vi.mocked(fetch).mockReturnValueOnce(pending.promise);
    mocks.rtcEvents['token-privilege-will-expire'](); mocks.rtmEvents.tokenPrivilegeWillExpire('');
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(vi.mocked(fetch).mock.calls[1][0]).toContain('uid=123');
    pending.resolve(token()); await flush();
    expect(mocks.rtc.renewToken).toHaveBeenCalledWith('token'); expect(mocks.rtm.renewToken).toHaveBeenCalledWith('token');
    await room.leave();
  });
  it('reports renewal failure and allows a later expiry event to retry', async () => {
    const onError = vi.fn(); const room = new OnlineRoom('123456', { onMessage: vi.fn(), onError });
    await room.join(false);
    vi.mocked(fetch).mockRejectedValueOnce(new Error('offline'));
    mocks.rtcEvents['token-privilege-will-expire'](); await flush();
    expect(onError).toHaveBeenCalledWith(expect.stringContaining('renewal failed'));
    mocks.rtcEvents['token-privilege-did-expire'](); await flush();
    expect(mocks.rtc.renewToken).toHaveBeenCalledWith('token');
    await room.leave();
  });
  it('does not renew disconnected SDK clients when token fetch finishes after leave', async () => {
    const room = new OnlineRoom('123456', { onMessage: vi.fn() }); await room.join(false);
    const pending = deferred<Response>(); vi.mocked(fetch).mockReturnValueOnce(pending.promise);
    mocks.rtcEvents['token-privilege-will-expire'](); await room.leave(); pending.resolve(token()); await flush();
    expect(mocks.rtc.renewToken).not.toHaveBeenCalled(); expect(mocks.rtm.renewToken).not.toHaveBeenCalled();
  });
});
