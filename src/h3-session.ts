import { FastH3OmniModel } from '@reactor-models/fast-h3-omni';
import { markUlt } from './game/timeline';

export const H3_MODEL = 'reactor/fast-h3-omni';
export type ClipSeconds = 5.875 | 8 | 10.125 | 12.25 | 14.375;
export const H3_CLIP_SECONDS: ClipSeconds = 8;
/** From "generate" to the clip starting to play. A normal run takes 10–20 s; measured stalls never recovered, so
 * give up well before a player would and let them retry with the gauge still full. */
export const H3_START_TIMEOUT_MS = 75_000;
export const H3_TIMEOUT_MESSAGE = 'FastH3 took too long to start the clip';

export type H3State = 'connecting' | 'uploading' | 'generating' | 'playing' | 'finished';

async function reactorJwt(signal: AbortSignal) {
  const response = await fetch('/api/reactor/token', { method: 'POST', cache: 'no-store', signal });
  const body = await response.json() as { jwt?: string; error?: string };
  if (!response.ok || !body.jwt) throw new Error(body.error || 'Could not start Reactor');
  return body.jwt;
}

export async function captureGameFrame(canvas: HTMLCanvasElement) {
  const output = document.createElement('canvas');
  output.width = 1344;
  output.height = 768;
  const context = output.getContext('2d', { alpha: false });
  if (!context) throw new Error('Canvas capture is unavailable');
  context.fillStyle = '#07101f';
  context.fillRect(0, 0, output.width, output.height);
  const sourceRatio = canvas.width / canvas.height;
  const targetRatio = output.width / output.height;
  let sx = 0, sy = 0, sw = canvas.width, sh = canvas.height;
  if (sourceRatio > targetRatio) { sw = canvas.height * targetRatio; sx = (canvas.width - sw) / 2; }
  else { sh = canvas.width / targetRatio; sy = (canvas.height - sh) / 2; }
  context.drawImage(canvas, sx, sy, sw, sh, 0, 0, output.width, output.height);
  const blob = await new Promise<Blob | null>((resolve) => output.toBlob(resolve, 'image/webp', .92));
  if (!blob) throw new Error('Could not capture the fight frame');
  return new File([blob], 'goat-clash-reference.webp', { type: 'image/webp' });
}

const SILENT: Events = { onState: () => undefined, onStream: () => undefined, onError: () => undefined };

type Events = {
  onState: (state: H3State) => void;
  onStream: (stream: MediaStream) => void;
  onError: (message: string) => void;
};

/**
 * One FastH3 Omni ultimate. Split in two so the slow part overlaps recording the spoken move:
 * `prepare` connects (≈16 s measured), configures and uploads the frozen fight frame the moment the
 * player opens the ultimate; `generate` only enqueues once the move is known (≈9 s for an 8 s clip).
 */
export class H3Session {
  private client: FastH3OmniModel | null = null;
  private stream = new MediaStream();
  private ready: Promise<unknown> | null = null;
  private connecting: Promise<FastH3OmniModel> | null = null;
  private readyAt: number | null = null;
  private closed = false;
  private startTimer: ReturnType<typeof setTimeout> | null = null;
  private endTimer: ReturnType<typeof setTimeout> | null = null;
  private finished = false;
  private playing = false;
  private failed = false;
  private tokenRequest = new AbortController();

  private finishOnce() {
    if (this.finished || this.closed || this.failed) return;
    this.finished = true;
    this.clearStartTimer();
    if (this.endTimer) clearTimeout(this.endTimer);
    this.events.onState('finished');
  }
  /** Events can be attached later: a pre-warmed session is created before the cast that will use it. */
  constructor(private events: Events = SILENT, private clipSeconds: ClipSeconds = H3_CLIP_SECONDS) {}

  attach(events: Events) {
    this.events = events;
    // A pre-warmed connection receives its output tracks while nothing is attached yet; hand them over now.
    if (this.stream.getTracks().length) events.onStream(this.stream);
  }

  /** True while the connection is still usable for a cast (not closed, failed or finished). */
  get usable() { return !this.closed && !this.failed && !this.finished; }

  /** performance.now() when the GPU became ready (billing starts there), or null before that. */
  get gpuReadyAt() { return this.readyAt; }

  /**
   * Token, connect and configure — everything that does not need the fight frame. Reactor's GPU assignment is
   * the slow part (~8 s measured), so the game calls this ahead of time when the gauge fills. Memoized.
   */
  connect(): Promise<FastH3OmniModel> {
    if (this.connecting) return this.connecting;
    this.connecting = (async () => {
      if (this.closed) throw new Error('closed');
      const client = new FastH3OmniModel();
      this.client = client;
      this.bind(client);
      try {
        markUlt('h3-prepare');
        const jwt = await reactorJwt(this.tokenRequest.signal);
        markUlt('h3-token');
        if (this.closed) throw new Error('closed');
        await client.connect(jwt, { autoResumeTracks: true });
        this.readyAt = performance.now();
        markUlt('h3-connected');
        if (this.closed) throw new Error('closed');
        const configured = await Promise.all([
          client.setCanvas({ aspect: '16:9' }),
          client.setClipSeconds({ seconds: this.clipSeconds }),
          client.setFlushOnClipEnd({ enabled: false }),
          client.setAutoplay({ enabled: true }),
        ]);
        if (this.closed) throw new Error('closed');
        if (configured.some(reply => !reply)) throw new Error(client.getLastError()?.message || 'FastH3 setup failed');
        markUlt('h3-configured');
        return client;
      } catch (error) {
        // close() can run before connect() finishes. Disconnect again after the pending
        // operation settles so a late connection cannot survive the cancelled cast.
        await client.disconnect().catch(() => undefined);
        if (this.client === client) this.client = null;
        throw error;
      }
    })();
    this.connecting.catch(() => undefined);
    return this.connecting;
  }

  private bind(client: FastH3OmniModel) {
    client.on('trackReceived', (name: string, track: MediaStreamTrack) => {
      if (name !== 'main_video' && name !== 'main_audio') return;
      if (this.closed || this.finished || this.failed) { track.stop(); return; }
      this.stream.getTracks().filter(item => item.kind === track.kind).forEach(item => this.stream.removeTrack(item));
      this.stream.addTrack(track);
      this.events.onStream(this.stream);
    });
    client.on('message', (message: any) => {
      if (this.closed || this.finished || this.failed) return;
      const event = message?.data && typeof message.data === 'object' ? { ...message.data, type: message.type } : message;
      // FastH3 Omni connects its tracks with the session; frames only flow once a clip starts playing.
      if (event?.type === 'clip_generated') markUlt('h3-generated', { buildSeconds: event.clip?.build_seconds ?? null });
      if (event?.type === 'clip_started') {
        if (this.playing) return;
        markUlt('h3-started');
        this.playing = true;
        this.clearStartTimer();
        this.events.onState('playing');
        // clip_finished occasionally never arrives (measured: the game then waited ~40 s for the connection to
        // drop). The clip's own length plus a margin is the latest it can end.
        this.endTimer = setTimeout(() => this.finishOnce(), this.clipSeconds * 1000 + 3000);
      }
      if (event?.type === 'clip_finished') this.finishOnce();
      if (event?.type === 'clip_failed' || event?.type === 'command_error') this.fail(String(event.reason || 'FastH3 generation failed'));
    });
    client.on('error', (error: unknown) => this.fail(error instanceof Error ? error.message : String(error)));
  }

  private fail(message: string) {
    if (this.closed || this.finished || this.failed) return;
    this.failed = true;
    this.clearStartTimer();
    if (this.endTimer) clearTimeout(this.endTimer);
    this.events.onError(message);
  }

  /** Connect (or reuse a pre-warmed connection), then upload the reference frame. Safe to call once; errors
   * surface on generate. */
  prepare(reference: File) {
    if (this.ready) return this.ready;
    this.ready = (async () => {
      const client = await this.connect();
      if (this.closed) throw new Error('closed');
      markUlt('h3-upload-start');
      const image = await client.uploadFile(reference, { name: reference.name });
      markUlt('h3-uploaded', { bytes: reference.size });
      if (this.closed) throw new Error('closed');
      return { client, image };
    })();
    // Surface prepare failures through generate; an unobserved rejection here would be noise.
    this.ready.catch(() => undefined);
    return this.ready;
  }

  private clearStartTimer() {
    if (this.startTimer) clearTimeout(this.startTimer);
    this.startTimer = null;
  }

  /** `prompt` is the full FastH3 prompt (see buildUltimatePrompt); `move` is the move name, kept as metadata. */
  async generate(prompt: string, reference: File, move: string) {
    if (this.closed || this.finished || this.failed) return;
    // Covers a slow connect/upload as well as a build that never starts playing.
    this.clearStartTimer();
    this.startTimer = setTimeout(() => { this.startTimer = null; this.fail(H3_TIMEOUT_MESSAGE); }, H3_START_TIMEOUT_MS);
    try {
      this.events.onState(this.client ? 'uploading' : 'connecting');
      const { client, image } = await this.prepare(reference) as { client: FastH3OmniModel; image: any };
      if (this.closed || this.finished || this.failed) return;
      this.events.onState('generating');
      markUlt('h3-enqueue', { promptChars: prompt.length });
      const reply = await client.enqueue({
        prompt,
        reference_image: image,
        first_frame_image: image,
        seconds: this.clipSeconds,
        metadata: JSON.stringify({ demo: 'goat-clash', move }).slice(0, 2000),
      });
      if (!reply) throw new Error(client.getLastError()?.message || 'FastH3 did not accept the clip');
      markUlt('h3-queued');
    } catch (error) {
      this.clearStartTimer();
      this.fail(error instanceof Error ? error.message : String(error));
      throw error;
    }
  }

  async close() {
    this.closed = true;
    this.tokenRequest.abort();
    this.clearStartTimer();
    if (this.endTimer) clearTimeout(this.endTimer);
    const client = this.client;
    this.client = null;
    this.stream.getTracks().forEach(track => track.stop());
    this.stream = new MediaStream();
    if (client) await client.disconnect().catch(() => undefined);
  }
}
