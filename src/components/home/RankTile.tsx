import { divisionLabel } from '../../../shared/division';
import type { Club } from '../../../shared/types';
import { Tile } from '../ui/Tile';

/** C · Classement de la saison EA, montées et descentes. */
export function RankTile({ club }: { club: Club }) {
  const season = club.season;
  const division = season?.division ?? club.bestDivision;
  return (
    <Tile className="fc-card fc-card--small" to="/club" delay={140}>
      <span className="fc-card-copy">
        <span className="fc-title fc-title--md">Classement</span>
        <span className="fc-big">{season?.rank != null ? `${season.rank}e` : division !== null ? divisionLabel(division) : '—'}</span>
        <span className="fc-mention">
          {season?.rank != null && division !== null && `${divisionLabel(division)} · `}
          {club.promotions} montée{club.promotions > 1 ? 's' : ''} · {club.relegations} descente{club.relegations > 1 ? 's' : ''}
        </span>
      </span>
    </Tile>
  );
}
