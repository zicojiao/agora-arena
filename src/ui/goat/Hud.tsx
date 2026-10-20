import { useEffect, useRef, useState } from 'react';
import { Keyboard, Pause, Sparkles, X } from 'lucide-react';
import { chargeLevel, pumpBonus } from '../../game/fasth3';
import { t } from '../../i18n';
import { setChargeLevel } from '../../render/renderer';
import type { H3State } from '../../h3-session';
import { GAUGE_MAX } from '../../game/fasth3';
import { ROUNDS_TO_WIN } from '../../game/setup';
import { CLUSTER_INSET } from '../TouchLayer';

/** The blue FastH3 gauge. Fills during the fight; when full it glows, shows a bubble, and is tappable. */
export function FastH3Gauge({ value, onTrigger, touch, live }: { value: number; onTrigger: () => void; touch: boolean; live: boolean }) {
  // Full but not usable (KO outro, round over): keep the full bar, drop the call to action.
  const ready = value >= GAUGE_MAX && live;
  const pct = Math.floor((value / GAUGE_MAX) * 100);
  return (
    <div className={`fasth3-gauge${ready ? ' ready' : ''}${touch ? ' touch' : ''}`}
      style={touch ? { ['--cluster-inset' as string]: `calc(${CLUSTER_INSET}px + env(safe-area-inset-right))` } : undefined}>
      {ready && (
        <div className="gauge-bubble" role="status">
          <b>{t('hud.ready')}</b>
          <span>{touch ? t('hud.readyTouch') : t('hud.readyKey', { key: 'F' })}</span>
        </div>
      )}
      <button className="gauge-body" onClick={onTrigger} disabled={!ready} aria-label={ready ? t('hud.unleash') : t('hud.gaugeAria', { pct })}>
        <span className="gauge-icon"><Sparkles size={16} /></span>
        <span className="gauge-copy">
          <b>{t('hud.gauge')}</b>
          <span className="gauge-track"><i style={{ width: `${pct}%` }} /></span>
        </span>
        <span className="gauge-key">{ready ? (touch ? t('hud.tap') : 'F') : pct >= 100 ? t('hud.wait') : `${pct}%`}</span>
      </button>
    </div>
  );
}

/** Round clock sits in the gap between the canvas health bars; round, stage and score sit under them. */
export function MatchHud({ round, wins, stageLabel, seconds, onPause, onControls, controlsDisabled = false }: {
  round: number; wins: [number, number]; stageLabel: string; seconds: number; onPause: () => void; onControls?: () => void; controlsDisabled?: boolean;
}) {
  const pips = (n: number) => Array.from({ length: ROUNDS_TO_WIN }, (_, i) => <i key={i} className={i < n ? 'active' : ''} />);
  return (
    <>
      <div className={`round-clock${seconds <= 10 ? ' low' : ''}`} aria-label={t('hud.secondsLeft', { n: seconds })}>{seconds}</div>
      <header className="game-topbar">
        <div className="match-meta">
          <small>{round > ROUNDS_TO_WIN * 2 - 2 ? t('hud.finalRound') : t('hud.round', { n: round })}</small>
          <strong>{stageLabel}</strong>
          <div className="score-pips"><span className="round-pips p1">{pips(wins[0])}</span><span className="round-pips p2">{pips(wins[1])}</span></div>
        </div>
      </header>
      {onControls && <button className="controls-button" onClick={onControls} disabled={controlsDisabled} aria-label={t('hud.controlsAria')}><Keyboard size={15} /><span>{t('hud.controls')}</span></button>}
      <button className="pause-button" onClick={onPause} aria-label={t('hud.pause')}><Pause size={15} /><span>{t('hud.pause')}</span></button>
    </>
  );
}

export function ControlsLegend() {
  const keys: [string, string][] = [['WASD', t('legend.move')], ['J', t('legend.attack')], ['U I O', t('legend.skills')], ['L', t('legend.guard')], ['F', 'FastH3'], ['Esc', t('legend.pause')]];
  return (
    <div className="controls-legend" aria-hidden>
      {keys.map(([k, v]) => <span key={k}><kbd>{k}</kbd>{v}</span>)}
    </div>
  );
}

export function RoundBanner({ round, final }: { round: number; final: boolean }) {
  return (
    <div className="round-banner" key={round}>
      <small>{final ? t('hud.finalRound') : t('hud.round', { n: round })}</small>
      <strong>{t('hud.fight')}</strong>
    </div>
  );
}

export function ImpactBanner({ name, damage }: { name: string; damage: number }) {
  return (
    <div className="impact-banner">
      <small>{t('hud.impact')}</small>
      <strong>{name}</strong>
      <b>-{damage}</b>
    </div>
  );
}

const CHARGE_STEPS = ['connecting', 'uploading', 'generating', 'playing'] as const;
const chargeStep = (state: H3State | null) => t(`charge.${CHARGE_STEPS.find(s => s === state) ?? 'generating'}` as 'charge.connecting');

/**
 * Shown while the fight continues and FastH3 renders. The bar advances through the real stages;
 * mashing F (or tapping the bar) pumps extra power into the hit.
 */
export function ChargingChip({ name, state, presses = 0, onPump, onCancel, who }: {
  /** The opponent's fighter name when watching their ultimate charge; omitted for your own. */
  name: string; state: H3State | null; presses?: number; onPump?: () => void; onCancel?: () => void; who?: string;
}) {
  const [now, setNow] = useState(() => performance.now());
  const stageStart = useRef({ state, at: performance.now() });
  if (stageStart.current.state !== state) stageStart.current = { state, at: performance.now() };
  useEffect(() => { const id = window.setInterval(() => setNow(performance.now()), 120); return () => clearInterval(id); }, []);
  const level = Math.round(chargeLevel(state, (now - stageStart.current.at) / 1000));
  useEffect(() => { setChargeLevel(level); }, [level]);
  const bonus = Math.round(pumpBonus(presses) * 100);
  return (
    <div className={`charging-chip${level >= 58 ? ' hot' : ''}`} role="status" onPointerDown={e => { if (onPump && !(e.target as HTMLElement).closest('button')) { e.preventDefault(); onPump(); } }}>
      <span className="charging-orb"><Sparkles size={16} /></span>
      <span className="charging-copy">
        <small>{who ? t('charge.their', { name: who }) : t('charge.your')} · {level}%{onPump ? ` · ${t('charge.power')} +${bonus}%` : ''}</small>
        <b>{name}</b>
        <span className="charging-track"><i style={{ width: `${level}%` }} /></span>
        {onPump && presses < 20 && <em>{t('charge.mash')}</em>}
        <span className="charging-credit">{chargeStep(state ?? 'connecting')} · Reactor FastH3 Omni</span>
      </span>
      {onCancel && <button onClick={onCancel} aria-label={t('charge.cancel')}><X size={14} /></button>}
    </div>
  );
}

/** The beat between charging and the clip: a flash and a slammed title instead of a hard cut. */
export function UltimateRelease({ name }: { name: string }) {
  return <div className="ult-release" aria-hidden><small>{t('release.title')}</small><strong>{name}</strong></div>;
}

/** Persistent credit in fights: who powers the voice and the video. */
export function PoweredBy() {
  return (
    <div className="powered-by" aria-label={t('powered.aria')}>
      <span className="powered-by-agora">{t('powered.by')} <img src={`${import.meta.env.BASE_URL}brand/agora-wordmark.webp`} alt="Agora" width="64" height="30" /></span><i aria-hidden="true" />
      <span>{t('powered.video')} <b>REACTOR FASTH3 OMNI</b></span>
    </div>
  );
}
