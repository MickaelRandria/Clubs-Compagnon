import { NEXT_NIGHT } from '../../content/playoffs';
import { formatShortDate } from '../../lib/format';
import { Tile } from '../ui/Tile';

const DAY = 86_400_000;

/** E · Compte à rebours de la prochaine nuit Inhouse ; disparaît une fois la soirée passée. */
export function NextNightTile() {
  const start = Date.parse(NEXT_NIGHT.date);
  const now = Date.now();
  // Le lendemain de la soirée, la nuit quitte l'accueil et vit dans Club › Palmarès.
  if (now > start + DAY / 2) return null;
  const days = Math.ceil((start - now) / DAY);
  const when = days <= 0 ? 'Ce soir' : `J-${days}`;

  return (
    <Tile className="fc-card fc-card--night" to="/club#palmares" delay={280}>
      <span className="fc-card-copy">
        <span className="fc-title fc-title--md">Nuit Inhouse {NEXT_NIGHT.number}</span>
        <span className="fc-mention">{formatShortDate(NEXT_NIGHT.date)} · toute la squad en LAN</span>
      </span>
      <span className="fc-night-count">{when}</span>
    </Tile>
  );
}
