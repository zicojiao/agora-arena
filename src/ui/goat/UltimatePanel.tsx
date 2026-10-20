import { useEffect, useRef } from 'react';
import { Flame, LoaderCircle, LockKeyhole, Mic, MicOff, RotateCcw, Waves, X, Zap } from 'lucide-react';
import './UltimatePanel.css';
import { t, tNodes } from '../../i18n';

/** idle: voice off / no mic · listening: recording · thinking: speech → text → move · error: try again or type */
export type VoiceState = 'idle' | 'connecting' | 'listening' | 'thinking' | 'error';

export function UltimatePanel({
  fighterName, opponentName, voice, voiceState, level, heard, text, error,
  onText, onSubmitText, onDone, onRetry, onCancel, onHoldStart,
}: {
  fighterName: string; opponentName: string;
  voice: boolean; voiceState: VoiceState;
  /** 0–1 live microphone level while listening. */
  level: number;
  heard: string; text: string; error: string;
  onText: (t: string) => void; onSubmitText: () => void;
  onHoldStart: () => void; onDone: () => void; onRetry: () => void; onCancel: () => void;
}) {
  const latest = useRef({ onCancel, onDone, voiceState, onHoldStart });
  latest.current = { onCancel, onDone, voiceState, onHoldStart };
  const panel = useRef<HTMLElement>(null);
  const microphone = useRef<HTMLButtonElement>(null);
  const input = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    if (voice) microphone.current?.focus(); else input.current?.focus();
    const outsideKey = (event: KeyboardEvent) => {
      if (voice && event.code === 'KeyF' && !(event.target instanceof HTMLTextAreaElement) && !(event.target instanceof HTMLInputElement)) {
        event.preventDefault(); event.stopImmediatePropagation();
        if (!event.repeat) latest.current.onHoldStart();
        return;
      }
      if (event.code === 'Escape') { event.preventDefault(); event.stopImmediatePropagation(); latest.current.onCancel(); }
      else if (!panel.current?.contains(event.target as Node)) {
        event.stopImmediatePropagation();
        if (event.key === 'Tab') { event.preventDefault(); panel.current?.querySelector<HTMLButtonElement>('button:not(:disabled)')?.focus(); }
        if (event.key === 'Enter' && latest.current.voiceState === 'listening') { event.preventDefault(); latest.current.onDone(); }
      }
    };
    window.addEventListener('keydown', outsideKey, true);
    return () => { window.removeEventListener('keydown', outsideKey, true); if (previous?.isConnected) previous.focus(); };
    // Preserve focus while live microphone levels update the panel.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const status = !voice ? t('ult.mic.unavailable')
    : voiceState === 'connecting' ? t('ult.mic.connecting')
    : voiceState === 'listening' ? t('ult.mic.listening')
    : voiceState === 'thinking' ? t('ult.mic.thinking')
    : voiceState === 'error' ? t('ult.mic.error') : t('ult.mic.idle');
  const bars = Array.from({ length: 14 }, (_, i) => Math.max(0.12, Math.min(1, level * 1.6 - Math.abs(i - 6.5) / 9)));
  return (
    <div className="ultimate-backdrop" onPointerDown={e => e.stopPropagation()}>
      <aside ref={panel} className="ultimate-panel ultimate-center" role="dialog" aria-modal="true" aria-label={t('ult.aria')} aria-describedby="ultimate-description"
        onKeyDown={e => {
          // Keep movement/attack shortcuts out of this dialog, including while typing.
          e.stopPropagation();
          if (e.key === 'Escape') { e.preventDefault(); onCancel(); }
          if (e.key === 'Enter' && e.target === microphone.current && voiceState === 'listening') { e.preventDefault(); onDone(); }
          if (e.key === 'Tab') {
            const items = Array.from(panel.current?.querySelectorAll<HTMLElement>('button:not(:disabled), textarea') ?? []);
            const first = items[0], last = items[items.length - 1];
            if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last?.focus(); }
            else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first?.focus(); }
          }
        }}>
        <button className="icon-button close" onClick={onCancel} aria-label={t('ult.cancel')}><X size={20} /></button>
        <header className="ultimate-heading">
          <h2>{t('ult.heading.before')}<i>{t('ult.heading.em')}</i></h2>
          <p id="ultimate-description">{t('ult.description')}</p>
        </header>
        <div className="ultimate-voice">
          <div className={`voice-orb ${voiceState === 'listening' && voice ? 'ready' : voiceState}`}>
            <button ref={microphone} disabled={!voice || voiceState === 'connecting' || voiceState === 'thinking'}
              onClick={voiceState === 'thinking' || voiceState === 'connecting' ? undefined : voiceState === 'listening' ? onDone : onRetry}
              aria-label={voiceState === 'thinking' ? t('ult.preparing') : voiceState === 'listening' ? t('ult.done') : t('ult.start')}>
              {voiceState === 'thinking' || voiceState === 'connecting' ? <LoaderCircle className="spin" /> : !voice ? <MicOff /> : voiceState === 'error' ? <RotateCcw /> : <Mic />}
            </button>
            <span role="status" aria-live="polite">{status}</span>
          </div>
          {voice && <div className="voice-meter" aria-hidden="true">{bars.map((h, i) => <i key={i} style={{ transform: `scaleY(${voiceState === 'listening' ? h : .12})` }} />)}</div>}
          {voice && <small className="speaking-hint">{voiceState === 'listening' ? t('ult.hint.listening') : voiceState === 'thinking' ? t('ult.hint.thinking') : t('ult.hint.idle')}</small>}
        </div>
        <div className="ultimate-content">
          <p className="director-intro">{tNodes('ult.intro', { fighter: <b>{fighterName}</b>, opponent: <b>{opponentName}</b> })}</p>
          <div className="ultimate-examples" aria-label={t('ult.ideas')}>
            <small>{t('ult.try')}</small>
            <div><span><Flame size={16} /> {t('ult.example.1')}</span><span><Waves size={16} /> {t('ult.example.2')}</span><span><Zap size={16} /> {t('ult.example.3')}</span></div>
          </div>
          {voice && heard && <div className="transcript"><p className="user"><b>{voiceState === 'listening' ? t('ult.live') : t('ult.said')}</b>{heard}</p></div>}
          <div className="ultimate-typed">
            <label className="move-input"><span>{voice ? t('ult.orType') : t('ult.type')}</span>
              <textarea ref={input} value={text} onChange={e => onText(e.target.value)} maxLength={300} placeholder={t('ult.placeholder')}
                onFocus={voiceState === 'listening' ? () => onText(text) : undefined}
                onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); if (text.trim() && voiceState !== 'thinking') onSubmitText(); } }} />
            </label>
            <button className="generate-button" onClick={onSubmitText} disabled={!text.trim() || voiceState === 'thinking'}><LockKeyhole size={16} /> {t('ult.lock')}</button>
          </div>
          {error && <p className="panel-error" role="alert">{error}</p>}
        </div>
      </aside>
    </div>
  );
}
