import './AgoraBrand.css';
import { t } from '../../i18n';

/** Uses the same Agora wordmark as BarkBid, with its original color and proportions. */
export function AgoraBrand({ compact = false }: { compact?: boolean }) {
  return (
    <a className={`arena-agora-brand${compact ? ' compact' : ''}`} href="https://www.agora.io/en/?utm_source=agora-arena"
      target="_blank" rel="noopener noreferrer" aria-label={t('brand.agoraAria')}>
      <span className="arena-agora-powered">{t('brand.poweredBy')}</span>
      <img src={`${import.meta.env.BASE_URL}brand/agora-wordmark.webp`} alt="Agora" width="116" height="55" />
      <span className="arena-agora-rte"><abbr title={t('brand.rte')}>RTE</abbr></span>
    </a>
  );
}

export function AgoraTitleHeader() {
  return (
    <header className="arena-agora-header">
      <div className="arena-partners">
        <AgoraBrand />
        <a className="arena-reactor-brand" href="https://www.reactor.inc/?utm_source=agora-arena" target="_blank" rel="noopener noreferrer"
          aria-label={t('brand.reactorAria')}>
          <span className="arena-reactor-name">Reactor<span aria-hidden="true">↗</span></span>
          <span className="arena-reactor-model">FastH3 Omni</span>
        </a>
      </div>
      <a className="arena-agora-build" href="https://docs.agora.io/en/" target="_blank" rel="noopener noreferrer">
        {t('brand.build')} <span aria-hidden="true">↗</span>
      </a>
    </header>
  );
}
