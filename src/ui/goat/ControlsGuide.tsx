import { useEffect, useRef } from 'react';
import { Keyboard, X } from 'lucide-react';
import { t } from '../../i18n';

/** A code-drawn keyboard stays sharp on phones and matches the actual bindings. */
export function KeyboardDiagram({ touch = false }: { touch?: boolean }) {
  if (touch) return <TouchDiagram />;
  return <div className="keyboard-guide">
    <div className="keyboard-layout" aria-label={t('guide.keyboardAria')}>
      <section className="movement-keys"><h3>{t('guide.move')}</h3>
        <div className="wasd-grid">
          <div className="key-up"><kbd>W <i>↑</i></kbd><span>{t('guide.jump')}</span></div>
          <div className="key-left"><kbd>A <i>←</i></kbd><span>{t('guide.left')}</span></div>
          <div className="key-down"><kbd>S <i>↓</i></kbd><span>{t('guide.crouch')}</span></div>
          <div className="key-right"><kbd>D <i>→</i></kbd><span>{t('guide.right')}</span></div>
        </div>
        <small>{t('guide.moveHint')}</small>
      </section>
      <section className="action-keys"><h3>{t('guide.fight')}</h3>
        <div className="main-action"><kbd>J</kbd><div><b>{t('guide.attack')}</b><span>{t('guide.attackHint')}</span></div></div>
        <div className="main-action"><kbd>L</kbd><div><b>{t('guide.guard')}</b><span>{t('guide.guardHint')}</span></div></div>
        <div className="main-action ultimate-key"><kbd>F</kbd><div><b>{t('guide.ultimate')}</b><span>{t('guide.ultimateHint')}</span></div></div>
      </section>
    </div>
    <div className="extra-keys"><span><kbd>U</kbd><kbd>I</kbd><kbd>O</kbd> {t('guide.skills')}</span><span><kbd>Esc</kbd> {t('guide.menu')}</span></div>
  </div>;
}

/** Phones have no keyboard: describe the on-screen joystick and buttons instead of W/A/S/D. */
function TouchDiagram() {
  return <div className="keyboard-guide">
    <div className="keyboard-layout touch-layout" aria-label={t('guide.touchAria')}>
      <section className="movement-keys"><h3>{t('guide.move')}</h3>
        <div className="main-action"><kbd>◀ ▶</kbd><div><b>{t('guide.drag')}</b><span>{t('guide.dragHint')}</span></div></div>
      </section>
      <section className="action-keys"><h3>{t('guide.fight')}</h3>
        <div className="main-action"><kbd>{t('guide.jab')}</kbd><div><b>{t('guide.attack')}</b><span>{t('guide.attackHint')}</span></div></div>
        <div className="main-action"><kbd>{t('guide.guardKey')}</kbd><div><b>{t('guide.guard')}</b><span>{t('guide.guardHint')}</span></div></div>
        <div className="main-action ultimate-key"><kbd>FASTH3</kbd><div><b>{t('guide.ultimate')}</b><span>{t('guide.touchUltimateHint')}</span></div></div>
      </section>
    </div>
    <div className="extra-keys"><span><kbd>{t('guide.skillKey')}</kbd> {t('guide.skills')}</span><span><kbd>II</kbd> {t('guide.menu')}</span></div>
  </div>;
}

export function ControlsGuide({ touch, beforeMatch = false, online = false, onClose, onStart }: {
  touch: boolean; beforeMatch?: boolean; online?: boolean; onClose: () => void; onStart?: () => void;
}) {
  const close = useRef(onClose);
  close.current = onClose;
  const panel = useRef<HTMLDivElement>(null);
  const primary = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    primary.current?.focus();
    const down = (event: KeyboardEvent) => {
      // Reading the guide must not send attacks, menu shortcuts or held movement to the game.
      event.stopImmediatePropagation();
      if (event.code === 'Escape') { event.preventDefault(); close.current(); }
      if (event.key === 'Tab') {
        const buttons = Array.from(panel.current?.querySelectorAll<HTMLButtonElement>('button') ?? []);
        const first = buttons[0], last = buttons[buttons.length - 1];
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
      }
    };
    window.addEventListener('keydown', down, true);
    return () => { window.removeEventListener('keydown', down, true); if (previous?.isConnected) previous.focus(); };
  }, []);
  return <div className="modal-backdrop controls-backdrop">
    <div ref={panel} className="modal-card controls-card" role="dialog" aria-modal="true" aria-labelledby="controls-heading" aria-describedby="controls-note">
      <button className="icon-button close" aria-label={t('guide.close')} onClick={onClose}><X size={18} /></button>
      <div className="director-kicker"><Keyboard size={14} /> {beforeMatch ? t('guide.before') : t('guide.controls')}</div>
      <h2 id="controls-heading">{t('guide.heading')}</h2>
      <p id="controls-note" className="controls-note">{beforeMatch ? t('guide.noteBefore') : online ? t('guide.noteOnline') : t('guide.notePaused')}</p>
      <KeyboardDiagram touch={touch} />
      <footer className="controls-footer"><span>{beforeMatch ? t('guide.footBefore') : t('guide.footDuring')}</span><button ref={primary} className="primary" onClick={beforeMatch ? onStart : onClose}>{beforeMatch ? (online ? t('guide.toLobby') : t('guide.start')) : t('guide.back')} <span>→</span></button></footer>
    </div>
  </div>;
}
