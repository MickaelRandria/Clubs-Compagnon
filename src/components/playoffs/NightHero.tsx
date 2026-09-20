import { PLAYOFF_NIGHT } from '../../content/playoffs';
import { FC } from '../../lib/tokens';
import { Glyph } from '../ui/Glyph';

/** Panneau Bleu Dommage + photo : la diagonale sert de frontière, rien ne passe sur l'image. */
export function NightHero() {
  const night = PLAYOFF_NIGHT;
  return (
    <div className="fc-block fc-night">
      <span className="fc-night-photo">
        <img src={night.photos[0].src} alt="Le salon de Rina transformé en LAN pour les Playoffs" />
        <span className="fc-night-tint" />
      </span>
      <span className="fc-night-edge" />
      <div className="fc-night-panel">
        <svg className="fc-night-shards" viewBox="0 0 130 150" aria-hidden="true">
          <polygon points="130,0 30,0 76,44 40,52 130,140" fill={FC.glacier} />
          <polygon points="130,0 96,0 130,26" fill={FC.craie} />
          <polygon points="58,0 76,0 30,96 12,96" fill={FC.marine} opacity=".35" />
        </svg>
        <span className="fc-badge">★ Playoffs Inhouse</span>
        <span className="fc-title fc-title--xl">Nuit des Playoffs</span>
        <span className="fc-body">
          Saison {night.season} · Division {night.division}
        </span>
        <span className="fc-mention fc-mention--end">
          <Glyph name="trophy" />
          <span>Chez {night.host} · EFC Pro Clubs</span>
        </span>
      </div>
    </div>
  );
}
