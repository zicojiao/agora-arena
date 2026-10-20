import { PREVIEW_LEFT_FIGHTERS, PREVIEW_RIGHT_FIGHTERS } from '../../data/previewLineup';

/** Static menu artwork. Every fighter's feet share one baseline, with clear space between sides. */
export function FighterLineup() {
  return (
    <div className="title-lineup" aria-hidden="true">
      {[PREVIEW_LEFT_FIGHTERS, PREVIEW_RIGHT_FIGHTERS].map((fighters, side) => (
        <div className={`title-lineup-team ${side === 0 ? 'left' : 'right'}`} key={side}>
          {fighters.map((id, rank) => <img key={id} className={`title-lineup-fighter rank-${rank}`}
            src={`${import.meta.env.BASE_URL}preview/${id}.webp`} alt="" width="340" height="340" />)}
        </div>
      ))}
      <span className="title-lineup-vs">VS</span>
    </div>
  );
}
