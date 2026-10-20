import { markUlt } from './timeline';
import { t, type Lang } from '../i18n';
type LiveEvents = {
  onReady?: () => void;
  onText?: (text: string) => void;
  onLevel?: (level: number) => void;
  onFinalizing?: () => void;
};

/** One manually committed turn in one language. Owns a clone, never the room's original microphone. */
export class LiveMoveTranscriber {
  private peer: RTCPeerConnection;
  private channel: RTCDataChannel;
  private track: MediaStreamTrack;
  private sender: RTCRtpSender;
  private controller = new AbortController();
  private done: Promise<string | null>;
  private resolve!: (text: string | null) => void;
  private reject!: (error: Error) => void;
  private closed = false;
  private ready = false;
  private finishing = false;
  private committed = false;
  private partial = '';
  private deadline: ReturnType<typeof setTimeout> | undefined;
  private commitTimer: ReturnType<typeof setTimeout> | undefined;
  private context: AudioContext | null = null;
  private raf = 0;

  constructor(source: MediaStreamTrack, private lang: Lang, private events: LiveEvents = {}) {
    if (source.readyState === 'ended' || !source.enabled) throw new Error(t('err.liveMuted'));
    this.done = new Promise((resolve, reject) => { this.resolve = resolve; this.reject = reject; });
    this.track = source.clone();
    this.track.enabled = false;
    this.peer = new RTCPeerConnection();
    this.sender = this.peer.addTrack(this.track, new MediaStream([this.track]));
    this.channel = this.peer.createDataChannel('oai-events');
    this.channel.onopen = () => {
      if (this.closed) return;
      this.ready = true;
      this.track.enabled = true;
      markUlt('voice-connected');
      clearTimeout(this.deadline);
      // Explicit submission only; pauses in speech never end the turn.
      this.deadline = setTimeout(() => this.finish(), 30_000);
      this.startMeter();
      this.events.onReady?.();
    };
    this.channel.onmessage = event => this.message(event.data);
    this.channel.onclose = () => this.fail(t('err.liveLost'));
    this.peer.onconnectionstatechange = () => {
      if (this.peer.connectionState === 'failed' || this.peer.connectionState === 'closed') this.fail(t('err.liveLost'));
    };
    this.deadline = setTimeout(() => this.fail(t('err.liveTimeout')), 20_000);
    void this.connect().catch(() => this.fail(t('err.liveConnect')));
  }

  private async connect() {
    markUlt('voice-connect-start');
    const offer = await this.peer.createOffer();
    if (this.closed) return;
    await this.peer.setLocalDescription(offer);
    if (this.closed) return;
    const response = await fetch(`/api/ultimate/session?lang=${this.lang}`, {
      method: 'POST', headers: { 'content-type': 'application/sdp' }, body: offer.sdp,
      signal: this.controller.signal,
    });
    if (!response.ok) throw new Error('Live transcription unavailable');
    const sdp = await response.text();
    markUlt('voice-sdp-answer');
    if (!this.closed) await this.peer.setRemoteDescription({ type: 'answer', sdp });
  }

  private message(raw: string) {
    if (this.closed) return;
    let event;
    try { event = JSON.parse(raw); } catch { return; }
    if (event.type === 'conversation.item.input_audio_transcription.delta' && typeof event.delta === 'string') {
      if (!this.partial) markUlt('voice-first-text');
      this.partial += event.delta;
      this.events.onText?.(this.partial);
    }
    if (event.type === 'conversation.item.input_audio_transcription.completed' && this.committed) {
      markUlt('voice-final');
      const text = typeof event.transcript === 'string' ? event.transcript.trim() : '';
      this.events.onText?.(text);
      this.settle(text || null);
    }
    if (event.type === 'error' || event.type === 'conversation.item.input_audio_transcription.failed') {
      this.fail(t('err.liveFailed'));
    }
  }

  private startMeter() {
    try {
      const context = new AudioContext(); this.context = context;
      void context.resume().catch(() => undefined);
      const analyser = context.createAnalyser(); analyser.fftSize = 1024;
      context.createMediaStreamSource(new MediaStream([this.track])).connect(analyser);
      const samples = new Float32Array(analyser.fftSize);
      const tick = () => {
        if (this.closed || this.finishing) return;
        analyser.getFloatTimeDomainData(samples);
        const rms = Math.sqrt(samples.reduce((sum, x) => sum + x * x, 0) / samples.length);
        this.events.onLevel?.(Math.min(1, rms * 8));
        this.raf = requestAnimationFrame(tick);
      };
      this.raf = requestAnimationFrame(tick);
    } catch { /* A level meter failure must not block working WebRTC audio. */ }
  }

  result() { return this.done; }

  finish() {
    if (this.closed || this.finishing) return;
    if (!this.ready) { this.settle(null); return; }
    this.finishing = true;
    this.track.enabled = false;
    void this.sender.replaceTrack(null).catch(() => undefined);
    markUlt('voice-release');
    this.events.onFinalizing?.();
    this.events.onLevel?.(0);
    cancelAnimationFrame(this.raf);
    clearTimeout(this.deadline);
    this.deadline = setTimeout(() => this.fail(t('err.finalTimeout')), 20_000);
    // Media and the data channel have independent delivery. Allow the RTP tail to arrive before commit.
    this.commitTimer = setTimeout(() => {
      if (this.closed) return;
      try {
        this.committed = true;
        this.channel.send(JSON.stringify({ type: 'input_audio_buffer.commit' }));
        markUlt('voice-commit');
      } catch { this.fail(t('err.liveLost')); }
    }, 200);
  }

  cancel() { this.settle(null); }

  private settle(text: string | null) {
    if (this.closed) return;
    this.cleanup();
    this.resolve(text);
  }

  private fail(message: string) {
    if (this.closed) return;
    this.cleanup();
    this.reject(new Error(message));
  }

  private cleanup() {
    this.closed = true;
    clearTimeout(this.deadline); clearTimeout(this.commitTimer);
    this.controller.abort();
    cancelAnimationFrame(this.raf);
    this.track.enabled = false; this.track.stop();
    this.channel.close(); this.peer.close();
    void this.context?.close().catch(() => undefined);
  }
}
