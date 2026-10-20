import { useEffect, useRef, useState } from 'react';
import { ArrowRight, Code2, ExternalLink, Mic, Radio, Sparkles, X } from 'lucide-react';
import { t, type StringKey } from '../../i18n';
import './TechnologyModal.css';

const SECTIONS = ['architecture', 'pipeline', 'latency', 'docs'] as const;
type Section = typeof SECTIONS[number];

/** Official entry points checked against the providers' current documentation indexes. */
const RESOURCES = [
  { key: 'rtc', name: 'Agora RTC', url: 'https://docs.agora.io/en/realtime-media/rtc' },
  { key: 'rtm', name: 'Agora Signaling / RTM', url: 'https://docs.agora.io/en/realtime-media/rtm/quickstart/web' },
  { key: 'model', name: 'Reactor · FastH3 Omni', url: 'https://www.reactor.inc/models/fast-h3-omni/info' },
  { key: 'api', name: 'FastH3 Omni API', url: 'https://docs.reactor.inc/model-api-reference/fast-h3-omni/overview' },
  { key: 'prompt', name: 'FastH3 Omni Prompt Guide', url: 'https://docs.reactor.inc/model-api-reference/fast-h3-omni/prompt-guide' },
  { key: 'stt', name: 'OpenAI · Realtime Transcription', url: 'https://developers.openai.com/api/docs/guides/realtime-transcription' },
] as const;

function DocLink({ url, children }: { url: string; children: React.ReactNode }) {
  return <a href={`${url}?utm_source=agora-arena`} target="_blank" rel="noopener noreferrer">{children}<ExternalLink size={14} aria-hidden="true" /></a>;
}

export function TechnologyModal({ onClose }: { onClose: () => void }) {
  const [section, setSection] = useState<Section>('architecture');
  const dialog = useRef<HTMLDivElement>(null);
  const close = useRef<HTMLButtonElement>(null);
  const body = useRef<HTMLDivElement>(null);
  const exit = useRef(onClose);
  exit.current = onClose;

  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    close.current?.focus();
    const keydown = (event: KeyboardEvent) => {
      // The title's Enter/Space shortcuts must not launch a match behind this guide.
      event.stopImmediatePropagation();
      if (event.key === 'Escape') { event.preventDefault(); exit.current(); }
      if (event.key === 'Tab') {
        const items = [...dialog.current!.querySelectorAll<HTMLElement>('button, a[href]')];
        const first = items[0], last = items[items.length - 1];
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
      }
    };
    window.addEventListener('keydown', keydown, true);
    return () => {
      window.removeEventListener('keydown', keydown, true);
      if (previous?.isConnected) previous.focus();
    };
  }, []);

  const select = (next: Section) => { setSection(next); body.current?.scrollTo(0, 0); };
  const text = (key: string) => t(`tech.${key}` as StringKey);

  return <div className="modal-backdrop tech-backdrop" onPointerDown={event => { if (event.target === event.currentTarget) onClose(); }}>
    <div ref={dialog} className="tech-dialog" role="dialog" aria-modal="true" aria-labelledby="technology-title" aria-describedby="technology-intro">
      <header className="tech-header">
        <div><div className="tech-eyebrow"><Code2 size={14} /> AGORA ARENA / DEVELOPER GUIDE</div>
          <h2 id="technology-title">{text('title')}</h2>
          <p id="technology-intro">{text('intro')}</p>
        </div>
        <button ref={close} className="icon-button" onClick={onClose} aria-label={t('modal.close')}><X size={20} /></button>
      </header>
      <nav className="tech-nav" aria-label={text('navigation')}>
        {SECTIONS.map(item => <button key={item} aria-pressed={item === section} onClick={() => select(item)}>{text(`tab.${item}`)}</button>)}
      </nav>
      <div ref={body} className="tech-body">
        {section === 'architecture' && <>
          <div className="tech-intro"><Radio size={24} /><div><h3>{text('architecture.title')}</h3><p>{text('architecture.body')}</p></div></div>
          <div className="tech-stack">
            {(['rtc', 'rtm', 'engine', 'server'] as const).map(key => <article key={key}>
              <span className="tech-tag">{text(`${key}.tag`)}</span><h3>{text(`${key}.title`)}</h3><p>{text(`${key}.body`)}</p>
            </article>)}
          </div>
          <p className="tech-note">{text('architecture.solo')}</p>
        </>}
        {section === 'pipeline' && <>
          <div className="tech-intro"><Sparkles size={24} /><div><h3>{text('pipeline.title')}</h3><p>{text('pipeline.body')}</p></div></div>
          <ol className="tech-flow">
            {(['speak', 'transcribe', 'prompt', 'generate', 'impact'] as const).map((key, i) => <li key={key}>
              <span className="tech-step">{i + 1}</span><div><h3>{text(`step.${key}.title`)}</h3><p>{text(`step.${key}.body`)}</p></div>
            </li>)}
          </ol>
          <div className="tech-model-spec"><b>FastH3 Omni</b><span>1344 × 768 · 24 fps</span><span>{text('model.duration')}</span></div>
          <p className="tech-note">{text('model.scope')}</p>
          <DocLink url={RESOURCES[3].url}>{text('model.link')}</DocLink>
        </>}
        {section === 'latency' && <>
          <div className="tech-intro"><Mic size={24} /><div><h3>{text('latency.title')}</h3><p>{text('latency.body')}</p></div></div>
          <div className="tech-timings">
            <div><strong>16–21 s</strong><span>{text('latency.open')}</span></div>
            <div><strong>11–15 s</strong><span>{text('latency.release')}</span></div>
          </div>
          <p className="tech-note">{text('latency.sample')}</p>
          <table className="tech-table"><caption>{text('latency.table')}</caption><thead><tr><th>{text('latency.stage')}</th><th>{text('latency.time')}</th></tr></thead>
            <tbody>{(['stt', 'connect', 'upload', 'model'] as const).map((key, i) => <tr key={key}><td>{text(`latency.${key}`)}</td><td>{['0.8–1.3 s', '7–8 s', '2.8–3.1 s', '8.3–8.4 s'][i]}</td></tr>)}</tbody>
          </table>
          <p className="tech-note">{text('latency.overlap')}</p>
          <h3>{text('latency.speedTitle')}</h3><p>{text('latency.speedBody')}</p>
          <p>{text('latency.streaming')}</p>
          <h3>{text('latency.optimizationTitle')}</h3><p>{text('latency.optimizationBody')}</p>
          <DocLink url={RESOURCES[2].url}>{text('latency.source')}</DocLink>
        </>}
        {section === 'docs' && <>
          <h3>{text('docs.title')}</h3><p>{text('docs.body')}</p>
          <div className="tech-resources">{RESOURCES.map(resource => <DocLink key={resource.key} url={resource.url}>
            <span><b>{resource.name}</b><small>{text(`docs.${resource.key}`)}</small></span>
          </DocLink>)}</div>
        </>}
      </div>
      <footer className="tech-footer"><span>AGORA RTC + RTM <ArrowRight size={13} /> FASTH3 OMNI</span><button className="ghost" onClick={onClose}>{text('back')}</button></footer>
    </div>
  </div>;
}
