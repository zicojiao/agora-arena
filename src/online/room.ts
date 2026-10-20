import type { IAgoraRTCClient, IAgoraRTCRemoteUser, ILocalAudioTrack, ILocalVideoTrack, IMicrophoneAudioTrack } from 'agora-rtc-sdk-ng';
import type { RTMClient } from 'agora-rtm';

/**
 * One online room = one Agora channel. Agora carries everything two players share:
 * - RTC audio: the players talk to each other, and the AI announcer joins the same channel for ultimates.
 * - RTC video: the FastH3 cinematic is rendered on the caster's machine and published into the channel,
 *   so the opponent watches the very same clip live.
 * - RTM: a separate `-game` message channel carries lockstep inputs, lobby state and match events.
 * The RTC channel's own RTM channel is left to the announcer's transcripts.
 */

export const ROOM_PREFIX = 'goat-clash-room-';
export function newRoomCode(): string {
  // Uniform six-digit numbers, without a leading zero that players might omit.
  const count = 900_000;
  const limit = Math.floor(2 ** 32 / count) * count;
  const value = new Uint32Array(1);
  do { crypto.getRandomValues(value); } while (value[0] >= limit);
  return String(100_000 + value[0] % count);
}

export function normalizeRoomCode(input: string): string | null {
  const code = input.trim().replace(/[\s-]/g, '');
  return /^\d{6}$/.test(code) ? code : null;
}

export type GameMessage = { k: string; [key: string]: unknown };

type RoomEvents = {
  onMessage: (message: GameMessage, from: string) => void;
  onPeerAudio?: (uid: string, speaking: boolean) => void;
  /** The opponent's relayed FastH3 clip (video only — its sound arrives mixed into their RTC audio). */
  onCinematic?: (track: MediaStreamTrack | null, uid: string) => void;
  /** RTM presence on the game channel: who is in the room right now. */
  onPresence?: (uid: string, here: boolean) => void;
  onState?: (state: 'connecting' | 'connected' | 'reconnecting' | 'disconnected') => void;
  onError?: (message: string) => void;
};

type TokenResponse = { appId: string; token: string; uid: string; channel: string };

async function json<T>(response: Response): Promise<T> {
  const body = await response.json() as T & { error?: string; detail?: string };
  if (!response.ok) throw new Error(body.detail || body.error || `Request failed (${response.status})`);
  return body;
}

export class OnlineRoom {
  readonly channel: string;
  readonly gameChannel: string;
  uid = '';
  appId = '';
  rtc: IAgoraRTCClient | null = null;
  rtm: RTMClient | null = null;
  private mic: IMicrophoneAudioTrack | null = null;
  private castTracks: (ILocalAudioTrack | ILocalVideoTrack)[] = [];
  private closed = false;
  private joinTask: Promise<void> | null = null;
  private leaveTask: Promise<void> | null = null;
  private renewal: Promise<void> | null = null;
  private agentUid = '900001';

  constructor(readonly code: string, private events: RoomEvents) {
    this.channel = `${ROOM_PREFIX}${code}`;
    this.gameChannel = `${this.channel}-game`;
  }

  /** Join RTC (voice) and RTM (game data). Voice is optional: a blocked mic still lets the match run. */
  join(withMic = true): Promise<void> {
    if (this.closed) return Promise.reject(new Error('Room closed'));
    if (this.joinTask) return this.joinTask;
    this.joinTask = this.joinNow(withMic).catch(async error => {
      this.closed = true;
      await this.releaseResources();
      this.rtc = null; this.rtm = null;
      throw error;
    });
    return this.joinTask;
  }

  private assertOpen() { if (this.closed) throw new Error('Room closed'); }

  private async joinNow(withMic: boolean) {
    this.events.onState?.('connecting');
    const token = await json<TokenResponse>(await fetch(`/api/agora/token?channel=${encodeURIComponent(this.channel)}`));
    this.assertOpen();
    this.uid = token.uid;
    this.appId = token.appId;
    const [{ default: AgoraRTC }, { default: AgoraRTM }] = await Promise.all([import('agora-rtc-sdk-ng'), import('agora-rtm')]);
    this.assertOpen();
    (AgoraRTC as unknown as { setLogLevel?: (n: number) => void }).setLogLevel?.(3);

    const rtm = new AgoraRTM.RTM(token.appId, token.uid, { logLevel: 'error' } as never);
    this.rtm = rtm;
    rtm.addEventListener('message', event => {
      if (this.closed || event.channelName !== this.gameChannel || event.publisher === this.uid) return;
      if (typeof event.message !== 'string') return;
      try { this.events.onMessage(JSON.parse(event.message) as GameMessage, event.publisher); } catch { /* not ours */ }
    });
    // Presence on the game channel tells us when the opponent joins, leaves or drops (same pattern as Draw & Guess).
    rtm.addEventListener('presence', (event: { channelName: string; eventType: string; publisher: string; snapshot?: { userId: string }[] | null }) => {
      if (event.channelName !== this.gameChannel || this.closed) return;
      if (event.eventType === 'SNAPSHOT') { for (const u of event.snapshot ?? []) if (u.userId !== this.uid) this.events.onPresence?.(u.userId, true); return; }
      if (!event.publisher || event.publisher === this.uid) return;
      if (event.eventType === 'REMOTE_JOIN') this.events.onPresence?.(event.publisher, true);
      if (event.eventType === 'REMOTE_LEAVE' || event.eventType === 'REMOTE_TIMEOUT') this.events.onPresence?.(event.publisher, false);
    });
    // After a network blip RTM may come back without our channels; subscribe them again.
    rtm.addEventListener('linkState', (event: { currentState: string; unrestoredChannels?: string[] }) => {
      if (this.closed || event.currentState !== 'CONNECTED') return;
      for (const name of event.unrestoredChannels ?? []) {
        if (name === this.gameChannel) void rtm.subscribe(name, { withMessage: true, withPresence: true }).catch(() => undefined);
        if (name === this.channel) void rtm.subscribe(name).catch(() => undefined);
      }
    });
    rtm.addEventListener('tokenPrivilegeWillExpire', () => this.refreshToken());
    await rtm.login({ token: token.token });
    this.assertOpen();
    await Promise.all([rtm.subscribe(this.gameChannel, { withMessage: true, withPresence: true }), rtm.subscribe(this.channel)]);

    this.assertOpen();
    const rtc = AgoraRTC.createClient({ mode: 'rtc', codec: 'vp8' });
    this.rtc = rtc;
    (AgoraRTC as unknown as { setParameter?: (key: string, value: unknown) => void }).setParameter?.('ENABLE_AUDIO_PTS', true);
    rtc.on('user-published', async (user: IAgoraRTCRemoteUser, mediaType: 'audio' | 'video' | 'datachannel') => {
      if (this.closed) return;
      try {
        if (mediaType !== 'audio' && mediaType !== 'video') return;
        await rtc.subscribe(user, mediaType);
        if (this.closed) return;
        if (mediaType === 'audio') user.audioTrack?.play();
        if (mediaType === 'video' && user.videoTrack) this.events.onCinematic?.(user.videoTrack.getMediaStreamTrack(), String(user.uid));
      } catch (error) {
        if (!this.closed) this.events.onError?.(error instanceof Error ? error.message : String(error));
      }
    });
    // RTC notices a peer leaving (or dropping) faster than RTM presence does.
    rtc.on('user-left', user => { if (!this.closed && !this.isAgent(String(user.uid))) this.events.onPresence?.(String(user.uid), false); });
    rtc.on('user-unpublished', (user, mediaType) => {
      if (!this.closed && mediaType === 'video') this.events.onCinematic?.(null, String(user.uid));
    });
    rtc.enableAudioVolumeIndicator();
    rtc.on('volume-indicator', (levels: { uid: string | number; level: number }[]) => {
      if (this.closed) return;
      for (const l of levels) this.events.onPeerAudio?.(String(l.uid) === this.uid ? 'me' : String(l.uid), l.level > 8);
    });
    rtc.on('connection-state-change', state => {
      if (this.closed) return;
      if (state === 'CONNECTED') this.events.onState?.('connected');
      if (state === 'RECONNECTING') this.events.onState?.('reconnecting');
      if (state === 'DISCONNECTED') this.events.onState?.('disconnected');
    });
    rtc.on('token-privilege-will-expire', () => this.refreshToken());
    rtc.on('token-privilege-did-expire', () => this.refreshToken());
    await rtc.join(token.appId, this.channel, token.token, Number(token.uid));

    this.assertOpen();
    if (withMic) {
      try {
        this.mic = await AgoraRTC.createMicrophoneAudioTrack({ encoderConfig: 'speech_standard', AEC: true, ANS: true, AGC: true });
        this.assertOpen();
        await rtc.publish(this.mic);
        this.assertOpen();
      } catch (error) {
        if (this.closed) throw error;
        this.mic?.close(); this.mic = null;
        this.events.onError?.(`Microphone unavailable — you can still play, but nobody will hear you. (${error instanceof Error ? error.message : String(error)})`);
      }
    }
    this.assertOpen();
    this.events.onState?.('connected');
  }

  /** RTC and RTM share the combined token; retain the UID so renewal never creates a new player. */
  private refreshToken() {
    if (this.closed || this.renewal || !this.uid) return;
    this.renewal = (async () => {
      const token = await json<TokenResponse>(await fetch(`/api/agora/token?channel=${encodeURIComponent(this.channel)}&uid=${encodeURIComponent(this.uid)}`));
      if (this.closed) return;
      if (token.uid !== this.uid || token.appId !== this.appId) throw new Error('Token renewal changed room identity');
      await Promise.all([this.rtc?.renewToken(token.token), this.rtm?.renewToken(token.token)]);
    })().catch(error => {
      if (!this.closed) this.events.onError?.(`Room token renewal failed: ${error instanceof Error ? error.message : String(error)}`);
    }).finally(() => { this.renewal = null; });
  }

  get hasMic() { return !!this.mic; }

  /** The microphone track already published to the room — recording it for the ultimate keeps the opponent hearing it live. */
  get micTrack(): MediaStreamTrack | null { return this.mic?.getMediaStreamTrack() ?? null; }

  setMuted(muted: boolean) { void this.mic?.setEnabled(!muted); }

  send(message: GameMessage) {
    if (!this.rtm || this.closed) return Promise.resolve();
    return this.rtm.publish(this.gameChannel, JSON.stringify(message)).then(() => undefined).catch(error => {
      if (!this.closed) this.events.onError?.(`Agora RTM: ${error instanceof Error ? error.message : String(error)}`);
    });
  }

  private castQueue: Promise<unknown> = Promise.resolve();

  /** Publish the FastH3 cinematic (video + its soundtrack) into the room so the opponent sees it live.
   * Serialized: two overlapping publishes would hit Agora's one-video-track-per-client limit. */
  castStream(stream: MediaStream) {
    const run = this.castQueue.then(() => this.castNow(stream));
    this.castQueue = run.catch(() => undefined);
    return run;
  }

  private async castNow(stream: MediaStream) {
    if (!this.rtc || this.closed) return;
    await this.stopCastNow();
    if (this.closed) return;
    const { default: AgoraRTC } = await import('agora-rtc-sdk-ng');
    if (this.closed || !this.rtc) return;
    const video = stream.getVideoTracks()[0];
    const audio = stream.getAudioTracks()[0];
    const tracks: (ILocalAudioTrack | ILocalVideoTrack)[] = [];
    if (video) tracks.push(AgoraRTC.createCustomVideoTrack({ mediaStreamTrack: video, bitrateMax: 2500, optimizationMode: 'motion' }));
    if (audio) tracks.push(AgoraRTC.createCustomAudioTrack({ mediaStreamTrack: audio }));
    this.castTracks = tracks;
    if (tracks.length) await this.rtc.publish(tracks);
  }

  stopCast() {
    const run = this.castQueue.then(() => this.stopCastNow());
    this.castQueue = run.catch(() => undefined);
    return run;
  }

  private async stopCastNow() {
    const tracks = this.castTracks;
    this.castTracks = [];
    if (!tracks.length || !this.rtc) return;
    await this.rtc.unpublish(tracks).catch(() => undefined);
    tracks.forEach(track => track.close());
  }

  /** Start the AI announcer in this room, listening only to the player calling the ultimate. */
  async startAnnouncer(fighterOne: string, fighterTwo: string) {
    const response = await fetch('/api/agora/agent/start', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ requester_id: this.uid, channel_name: this.channel, fighter_one: fighterOne, fighter_two: fighterTwo }),
    });
    return (await json<{ agent_id: string }>(response)).agent_id;
  }

  async stopAnnouncer(agentId: string) {
    await fetch('/api/agora/agent/stop', {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ agent_id: agentId }),
    }).catch(() => undefined);
  }

  isAgent(uid: string) { return uid === this.agentUid; }

  leave(): Promise<void> {
    if (this.leaveTask) return this.leaveTask;
    // Best effort only: a stalled RTM publish must not hold the microphone open.
    void this.send({ k: 'bye' });
    this.closed = true;
    this.leaveTask = (async () => {
      await this.releaseResources();
      // A device prompt or SDK join already in flight may settle after the initial cleanup.
      // joinNow checks closed at every boundary; its catch releases any late resource too.
      await this.joinTask?.catch(() => undefined);
      await this.releaseResources();
      this.rtc = null; this.rtm = null;
    })();
    return this.leaveTask;
  }

  private async releaseResources() {
    this.mic?.close(); this.mic = null;
    const cast = this.stopCast();
    await Promise.allSettled([cast, this.rtc?.leave(), this.rtm?.logout()]);
  }
}
