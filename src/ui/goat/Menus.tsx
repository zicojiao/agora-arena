import { useEffect, useRef, type ReactNode } from 'react';
import { ArrowLeft, Code2, Home, Languages, Mic, Play, Radio, RotateCcw, Settings as SettingsIcon, Sparkles, Swords, Users, Volume2, VolumeX, X, Zap, Keyboard } from 'lucide-react';
import { KeyboardDiagram } from './ControlsGuide';
import { AgoraBrand, AgoraTitleHeader } from './AgoraBrand';
import { FighterLineup } from './FighterLineup';
import { GOAT_DIFFICULTIES, GOAT_STAGES, ROUNDS_TO_WIN, difficultyLabel, fighterById, localizedRoster, stageById, stageLabel, withPlayer, type MatchSetup, type Settings } from '../../game/setup';
import { getLang, LANGS, setLang, t, type Lang } from '../../i18n';

const LANG_NAMES: Record<Lang, string> = { en: 'English', zh: '中文' };

/** One-tap language switch for the title screen; the full choice also lives in Settings. */
export function LanguageToggle() {
  const next: Lang = getLang() === 'zh' ? 'en' : 'zh';
  return <button className="ghost lang-toggle" onClick={() => setLang(next)} aria-label={t('lang.switchAria')}><Languages size={14} /> {t('lang.switch')}</button>;
}

/** Run `onKey` for the given key codes while mounted (menus are keyboard-navigable on desktop). */
export function useKeys(map: Record<string, () => void>, active = true) {
  useEffect(() => {
    if (!active) return;
    const down = (e: KeyboardEvent) => {
      const run = map[e.code];
      if (!run || e.repeat) return;
      if (e.target instanceof HTMLTextAreaElement || e.target instanceof HTMLInputElement) return;
      e.preventDefault();
      run();
    };
    window.addEventListener('keydown', down);
    return () => window.removeEventListener('keydown', down);
  });
}

export function TitleScreen({ onPlay, onOnline, onSettings, onHowTo, onTechnology }: { onPlay: () => void; onOnline: () => void; onSettings: () => void; onHowTo: () => void; onTechnology: () => void }) {
  useKeys({ Enter: onPlay, Space: onPlay });
  return (
    <div className="start-screen has-lineup">
      <AgoraTitleHeader />
      <FighterLineup />
      <div className="start-copy">
        <h1><span>AGORA</span> ARENA</h1>
        <p className="tagline">{t('title.tagline')}</p>
        <p>{t('title.body')}</p>
        <div className="menu-actions title-menu-actions">
          <div className="menu-action-row">
            <button className="primary" onClick={onPlay}>{t('title.play')} <span>→</span></button>
            <button className="primary online" onClick={onOnline}><Radio size={16} /> {t('title.online')}</button>
          </div>
          <div className="menu-action-row">
            <button className="ghost" onClick={onHowTo}><Keyboard size={15} /> {t('title.howto')}</button>
            <button className="ghost" onClick={onSettings}><SettingsIcon size={15} /> {t('title.settings')}</button>
            <LanguageToggle />
            <button className="ghost" onClick={onTechnology}><Code2 size={15} /> {t('tech.button')}</button>
          </div>
        </div>
      </div>
    </div>
  );
}

function FighterCard({ id, active, disabled, onClick, tag }: { id: string; active: boolean; disabled?: boolean; onClick: () => void; tag?: string }) {
  const f = fighterById(id);
  return (
    <button className={`fighter-card${active ? ' active' : ''}`} onClick={onClick} disabled={disabled} aria-pressed={active}>
      <img src={f.portraitUrl} alt="" />
      {tag && <em className="card-tag">{tag}</em>}
      <span>{f.name}</span>
      <small>{f.role}</small>
    </button>
  );
}

export function SetupScreen({ setup, onChange, onFight, onBack }: {
  /** Functional updates: rapid picks across sections must not overwrite each other. */
  setup: MatchSetup; onChange: (update: (s: MatchSetup) => MatchSetup) => void; onFight: () => void; onBack: () => void;
}) {
  useKeys({ Enter: onFight, Escape: onBack });
  const player = fighterById(setup.playerId);
  const opponent = fighterById(setup.opponentId);
  return (
    <div className="setup-screen original-roster">
      <header className="setup-head">
        <button className="icon-button back" onClick={onBack} aria-label={t('setup.back')}><ArrowLeft size={18} /></button>
        <div><div className="eyebrow">{t('setup.eyebrow')}</div><h2>{t('setup.heading')}</h2></div>
        <AgoraBrand compact />
      </header>
      <div className="setup-grid">
        <section>
          <h3>{t('setup.fighter')}</h3>
          <div className="fighter-select">
            {localizedRoster().map(f => <FighterCard key={f.id} id={f.id} active={f.id === setup.playerId} tag={f.id === setup.playerId ? t('setup.tagP1') : undefined}
              onClick={() => onChange(s => withPlayer(s, f.id))} />)}
          </div>
        </section>
        <section>
          <h3>{t('setup.opponent')}</h3>
          <div className="fighter-select">
            {localizedRoster().map(f => <FighterCard key={f.id} id={f.id} active={f.id === setup.opponentId} disabled={f.id === setup.playerId}
              tag={f.id === setup.playerId ? t('setup.tagYou') : f.id === setup.opponentId ? t('setup.tagCpu') : undefined}
              onClick={() => onChange(s => ({ ...s, opponentId: f.id }))} />)}
          </div>
        </section>
        <section>
          <h3>{t('setup.stage')}</h3>
          <div className="stage-select">
            {GOAT_STAGES.map(st => (
              <button key={st.id} className={`stage-card${st.id === setup.stageId ? ' active' : ''}`} onClick={() => onChange(s => ({ ...s, stageId: st.id }))} aria-pressed={st.id === setup.stageId}>
                <img src={st.bg.artUrl} alt="" style={{ filter: st.preview }} />
                <span>{stageLabel(st).name}</span><small>{stageLabel(st).time}</small>
              </button>
            ))}
          </div>
        </section>
        <section>
          <h3>{t('setup.difficulty')}</h3>
          <div className="segmented">
            {GOAT_DIFFICULTIES.map(d => (
              <button key={d.id} className={d.id === setup.difficulty ? 'active' : ''} onClick={() => onChange(s => ({ ...s, difficulty: d.id }))} aria-pressed={d.id === setup.difficulty}>
                <b>{difficultyLabel(d.id).name}</b><small>{difficultyLabel(d.id).hint}</small>
              </button>
            ))}
          </div>
        </section>
      </div>
      <footer className="setup-foot">
        <div className="matchup-preview"><b>{player.name}</b><em>VS</em><b>{opponent.name}</b><i>·</i><span>{stageLabel(stageById(setup.stageId)).time}</span><i>·</i><span>{t('setup.bestOf', { n: ROUNDS_TO_WIN * 2 - 1 })}</span></div>
        <button className="primary" onClick={onFight}><Swords size={16} /> {t('setup.fight')} <span>→</span></button>
      </footer>
    </div>
  );
}

function Modal({ title, kicker, onClose, children }: { title: string; kicker: string; onClose: () => void; children: ReactNode }) {
  useKeys({ Escape: onClose });
  return (
    <div className="modal-backdrop" onPointerDown={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal-card" role="dialog" aria-label={title}>
        <button className="icon-button close" onClick={onClose} aria-label={t('modal.close')}><X size={16} /></button>
        <div className="director-kicker">{kicker}</div>
        <h2>{title}</h2>
        {children}
      </div>
    </div>
  );
}

function Toggle({ label, hint, on, onToggle, icon }: { label: string; hint: string; on: boolean; onToggle: () => void; icon?: ReactNode }) {
  return (
    <button className={`setting-row${on ? ' on' : ''}`} onClick={onToggle} role="switch" aria-checked={on}>
      <span className="setting-icon">{icon}</span>
      <span className="setting-copy"><b>{label}</b><small>{hint}</small></span>
      <i className="switch"><i /></i>
    </button>
  );
}

export function SettingsModal({ settings, onChange, onClose, difficulty, onDifficulty }: {
  /** Functional updates: two toggles flipped in quick succession must not overwrite each other. */
  settings: Settings; onChange: (update: (s: Settings) => Settings) => void; onClose: () => void;
  difficulty?: MatchSetup['difficulty']; onDifficulty?: (d: MatchSetup['difficulty']) => void;
}) {
  return (
    <Modal title={t('settings.title')} kicker={t('settings.kicker')} onClose={onClose}>
      <div className="settings-list">
        <div className="setting-row static">
          <span className="setting-icon"><Languages size={16} /></span>
          <span className="setting-copy"><b>{t('lang.label')}</b><small>{t('lang.hint')}</small></span>
          <div className="segmented mini">
            {LANGS.map(lang => (
              <button key={lang} className={getLang() === lang ? 'active' : ''} onClick={() => setLang(lang)} aria-pressed={getLang() === lang}>{LANG_NAMES[lang]}</button>
            ))}
          </div>
        </div>
        <Toggle label={t('settings.sound')} hint={t('settings.sound.hint')} on={settings.sound} icon={settings.sound ? <Volume2 size={16} /> : <VolumeX size={16} />}
          onToggle={() => onChange(s => ({ ...s, sound: !s.sound }))} />
        <Toggle label={t('settings.voice')} hint={t('settings.voice.hint')} on={settings.voice} icon={<Mic size={16} />}
          onToggle={() => onChange(s => ({ ...s, voice: !s.voice }))} />
        <Toggle label={t('settings.controls')} hint={t('settings.controls.hint')} on={settings.showControls} icon={<Keyboard size={16} />}
          onToggle={() => onChange(s => ({ ...s, showControls: !s.showControls }))} />
        <div className="setting-row static">
          <span className="setting-icon"><Sparkles size={16} /></span>
          <span className="setting-copy"><b>{t('settings.length')}</b><small>{t('settings.length.hint')}</small></span>
          <div className="segmented mini">
            {([5.875, 8, 10.125] as const).map(sec => (
              <button key={sec} className={settings.clipSeconds === sec ? 'active' : ''} onClick={() => onChange(s => ({ ...s, clipSeconds: sec }))}>{Math.round(sec)}s</button>
            ))}
          </div>
        </div>
        {difficulty && onDifficulty && (
          <div className="setting-row static">
            <span className="setting-icon"><Zap size={16} /></span>
            <span className="setting-copy"><b>{t('settings.difficulty')}</b><small>{t('settings.difficulty.hint')}</small></span>
            <div className="segmented mini">
              {GOAT_DIFFICULTIES.map(d => (
                <button key={d.id} className={difficulty === d.id ? 'active' : ''} onClick={() => onDifficulty(d.id)}>{difficultyLabel(d.id).name}</button>
              ))}
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
}

export function HowToModal({ onClose }: { onClose: () => void }) {
  const rows: [string, string][] = [
    ['A / D', t('howto.move')], ['W', t('howto.jump')], ['S', t('howto.crouch')],
    ['J', t('howto.attack')], ['U · I · O', t('howto.skills')],
    ['L', t('howto.guard')], ['F', t('howto.ultimate')], ['Esc / P', t('howto.pause')],
  ];
  const hud: [string, 'hp' | 'clock' | 'pips' | 'gauge'][] = [['hp', 'hp'], ['clock', 'clock'], ['pips', 'pips'], ['gauge', 'gauge']];
  return (
    <Modal title={t('howto.title')} kicker={t('howto.kicker')} onClose={onClose}>
      <KeyboardDiagram />
      <div className="howto-grid">
        {rows.map(([k, v]) => <div key={k}><kbd>{k}</kbd><span>{v}</span></div>)}
      </div>
      <div className="howto-hud">
        <b>{t('howto.screen')}</b>
        <ul>
          {hud.map(([swatch, key]) => (
            <li key={key}><i className={`swatch ${swatch}`} /><span><em>{t(`howto.${key}.name`)}</em> {t(`howto.${key}`)}</span></li>
          ))}
        </ul>
      </div>
      <div className="howto-ultimate">
        <b><Sparkles size={14} /> {t('howto.ult.title')}</b>
        <ol>
          <li>{t('howto.ult.1')}</li>
          <li>{t('howto.ult.2')}</li>
          <li>{t('howto.ult.3')}</li>
          <li>{t('howto.ult.4')}</li>
        </ol>
        <small>{t('howto.phone')}</small>
      </div>
    </Modal>
  );
}

export function PauseMenu({ onResume, onRestart, onSettings, onSetup, onQuit, onHowTo }: {
  onResume: () => void; onRestart: () => void; onSettings: () => void; onSetup: () => void; onQuit: () => void; onHowTo: () => void;
}) {
  useKeys({ Escape: onResume, KeyP: onResume });
  return (
    <div className="modal-backdrop pause">
      <div className="pause-menu" role="dialog" aria-label={t('pause.title')}>
        <h2>{t('pause.title')}</h2>
        <button className="primary" onClick={onResume}><Play size={16} /> {t('pause.resume')}</button>
        <button onClick={onRestart}><RotateCcw size={15} /> {t('pause.restart')}</button>
        <button onClick={onSetup}><Users size={15} /> {t('pause.setup')}</button>
        <button onClick={onSettings}><SettingsIcon size={15} /> {t('title.settings')}</button>
        <button onClick={onHowTo}><Keyboard size={15} /> {t('title.howto')}</button>
        <button onClick={onQuit}><Home size={15} /> {t('pause.quit')}</button>
      </div>
    </div>
  );
}

export function ResultScreen({ winnerName, score, playerWon, ultimates, onRematch, onSetup, onQuit }: {
  winnerName: string; score: [number, number]; playerWon: boolean; ultimates: number;
  onRematch: () => void; onSetup: () => void; onQuit: () => void;
}) {
  useKeys({ Enter: onRematch, Escape: onQuit });
  return (
    <div className="result-screen">
      <small>{playerWon ? t('result.victory') : t('result.defeat')}</small>
      <h2>{t('result.wins', { name: winnerName })}</h2>
      <div className="result-score"><b>{score[0]}</b><i>–</i><b>{score[1]}</b></div>
      <p>{ultimates > 1 ? t('result.ultimates.many', { n: ultimates }) : ultimates === 1 ? t('result.ultimates.one') : t('result.ultimates.none')}</p>
      <div className="menu-actions">
        <button className="primary" onClick={onRematch}><RotateCcw size={15} /> {t('result.rematch')}</button>
        <button className="ghost" onClick={onSetup}><Users size={15} /> {t('result.setup')}</button>
        <button className="ghost" onClick={onQuit}><Home size={15} /> {t('result.quit')}</button>
      </div>
    </div>
  );
}

export function LoadingScreen({ done, total }: { done: number; total: number }) {
  const pct = total ? Math.round((done / total) * 100) : 0;
  return (
    <div className="loading-screen" role="status" aria-label={t('loading.label', { pct })}>
      <h1><span>AGORA</span> ARENA</h1>
      <div className="loading-track"><i style={{ width: `${pct}%` }} /></div>
      <small>{t('loading.status', { pct })}</small>
    </div>
  );
}

/** In-game confirmation for leaving a match or room (the browser's own prompt covers closing the tab). */
export function ConfirmDialog({ title, body, confirm, onConfirm, onCancel }: {
  title: string; body: string; confirm: string; onConfirm: () => void; onCancel: () => void;
}) {
  useKeys({ Escape: onCancel, Enter: onConfirm });
  return (
    <div className="modal-backdrop confirm" onPointerDown={e => { if (e.target === e.currentTarget) onCancel(); }}>
      <div className="modal-card confirm-card" role="alertdialog" aria-label={title}>
        <h2>{title}</h2>
        <p>{body}</p>
        <div className="menu-actions">
          <button className="ghost" onClick={onCancel} autoFocus>{t('confirm.keepPlaying')}</button>
          <button className="primary danger" onClick={onConfirm}>{confirm}</button>
        </div>
      </div>
    </div>
  );
}

/**
 * While a match, room or ultimate is live: ask before the tab closes, reloads or navigates away, and release
 * everything (Agora room, microphone, FastH3 session) when the page really goes.
 */
export function useLeaveGuard(active: boolean, onPageExit: () => void) {
  const exitRef = useRef(onPageExit);
  exitRef.current = onPageExit;
  useEffect(() => {
    if (!active) return;
    const beforeUnload = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ''; };
    window.addEventListener('beforeunload', beforeUnload);
    return () => window.removeEventListener('beforeunload', beforeUnload);
  }, [active]);
  useEffect(() => {
    const pageHide = () => exitRef.current();
    window.addEventListener('pagehide', pageHide);
    return () => window.removeEventListener('pagehide', pageHide);
  }, []);
}
