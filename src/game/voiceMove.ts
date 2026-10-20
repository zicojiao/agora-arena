import { markUlt } from './timeline';
import { t, type Lang } from '../i18n';
/**
 * Submit confirmed live text (or typed input) for minimal move composition.
 * MoveRecorder and audio uploads remain available for compatibility; Arena uses LiveMoveTranscriber.
 */

export type ComposedMove = { transcript: string; name: string; description: string };

/** Speech ends after this much quiet once the player has started talking. */
const END_SILENCE_MS = 1100;
/** Give up waiting for the player to start talking. */
const NO_SPEECH_MS = 9000;
/** Hard cap on one recording (the transcription limit is far higher; this keeps the turn short). */
const MAX_MS = 10000;

/** `lang` is the language the player spoke or typed in; the server names the move in that language. */
export async function composeMove(input: Blob | string, attacker: string, opponent: string, lang: Lang, signal?: AbortSignal): Promise<ComposedMove> {
  const query = `?attacker=${encodeURIComponent(attacker)}&opponent=${encodeURIComponent(opponent)}&lang=${lang}`;
  markUlt('compose-start');
  const response = await fetch(`/api/ultimate/voice${query}`, typeof input === 'string'
    ? { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ text: input }), signal }
    : { method: 'POST', headers: { 'content-type': input.type || 'audio/webm' }, body: input, signal });
  const body = await response.json().catch(() => ({})) as Partial<ComposedMove> & { error?: string };
  if (!response.ok || !body.name || !body.description) throw new Error(body.error || t('err.readMove', { status: response.status }));
  markUlt('compose-end', { llm: (body as { composed?: boolean }).composed === true });
  return { transcript: body.transcript ?? '', name: body.name, description: body.description };
}

type RecorderEvents = { onLevel?: (level: number) => void; onSpeech?: () => void };

/**
 * Records one spoken move from a microphone track. Stops by itself shortly after the player stops talking
 * (simple energy-based voice activity detection), or when `finish()` is called. Resolves to null if nobody spoke.
 */
export class MoveRecorder {
  private recorder: MediaRecorder;
  private chunks: Blob[] = [];
  private ctx: AudioContext;
  private raf = 0;
  private done: Promise<Blob | null>;
  private resolve!: (blob: Blob | null) => void;
  private spoke = false;
  private forced = false;
  private stopped = false;
  private cancelled = false;

  constructor(track: MediaStreamTrack, private events: RecorderEvents = {}) {
    if (track.readyState === 'ended' || !track.enabled) throw new Error(t('err.liveMuted'));
    const stream = new MediaStream([track]);
    const mimeType = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4'].find(t => MediaRecorder.isTypeSupported(t));
    this.recorder = new MediaRecorder(stream, mimeType ? { mimeType, audioBitsPerSecond: 32000 } : undefined);
    this.recorder.ondataavailable = e => { if (e.data.size) this.chunks.push(e.data); };
    this.done = new Promise(resolve => { this.resolve = resolve; });
    this.recorder.onstop = () => {
      const type = (this.recorder.mimeType || 'audio/webm').split(';')[0];
      this.resolve(!this.cancelled && (this.spoke || this.forced) && this.chunks.length ? new Blob(this.chunks, { type }) : null);
    };
    this.ctx = new AudioContext();
    // Online capture starts after the network pause handshake, outside the original key event.
    // Explicitly resume analysis rather than classifying a suspended context as silence.
    void this.ctx.resume().catch(() => this.cancel());
    const source = this.ctx.createMediaStreamSource(stream);
    const analyser = this.ctx.createAnalyser();
    analyser.fftSize = 1024;
    source.connect(analyser);
    const samples = new Float32Array(analyser.fftSize);
    const started = performance.now();
    let floor = 0.005, loudSince = 0, quietSince = 0;
    const tick = () => {
      if (this.stopped) return;
      analyser.getFloatTimeDomainData(samples);
      let sum = 0;
      for (const v of samples) sum += v * v;
      const rms = Math.sqrt(sum / samples.length);
      const now = performance.now();
      // A published room mic may already contain speech when recording starts. Only quiet
      // samples may establish the noise floor; otherwise the player's voice becomes the threshold.
      if (now - started < 300 && rms < 0.012) floor = Math.max(floor, rms);
      const loud = rms > Math.max(0.02, floor * 2.5);
      this.events.onLevel?.(Math.min(1, rms * 8));
      if (loud) {
        quietSince = 0;
        if (!loudSince) loudSince = now;
        if (!this.spoke && now - loudSince > 250) { this.spoke = true; this.events.onSpeech?.(); }
      } else {
        loudSince = 0;
        if (!quietSince) quietSince = now;
      }
      if ((this.spoke && quietSince && now - quietSince > END_SILENCE_MS) || (!this.spoke && now - started > NO_SPEECH_MS) || now - started > MAX_MS) {
        this.finish();
        return;
      }
      this.raf = requestAnimationFrame(tick);
    };
    this.recorder.start(250);
    this.raf = requestAnimationFrame(tick);
  }

  /** The recording, or null when the player never spoke. */
  result() { return this.done; }

  /** Stop now (the player pressed Done / Enter). Counts as speech if anything was recorded. */
  finish(force = false) {
    if (this.stopped) return;
    if (force) this.forced = true;
    this.stopped = true;
    cancelAnimationFrame(this.raf);
    if (this.recorder.state !== 'inactive') this.recorder.stop();
    void this.ctx.close().catch(() => undefined);
  }

  cancel() {
    this.cancelled = true;
    this.spoke = false;
    this.forced = false;
    this.finish();
  }
}
