import { divisionLabel } from '../../../shared/division';
import type { Club } from '../../../shared/types';
import { ChanceShields, DivisionGauge, SeriesPips, nextDivisionLabel, promotionGap, winsLabel } from '../division/DivisionBits';
import { Tile } from '../ui/Tile';

/** C · Division EA et progression : points vers la montée, chances avant le match de relégation. */
export function RankTile({ club }: { club: Club }) {
  const p = club.progress ?? null;
  const division = p?.division ?? club.season?.division ?? club.bestDivision;
  if (!p || p.status === 'calibrating' || p.division <= 1) {
    return (
      <Tile className="fc-card fc-card--small fc-card--rank" to="/club/progression" delay={140}>
        <span className="fc-card-copy">
          <span className="fc-title fc-title--md">Classement</span>
          <span className="fc-big">{division != null ? divisionLabel(division) : '—'}</span>
          <span className="fc-mention">
            {p?.status === 'calibrating' && p.division > 1
              ? 'Suivi des points à démarrer depuis la page Club.'
              : `${club.promotions} montée${club.promotions > 1 ? 's' : ''} · ${club.relegations} descente${club.relegations > 1 ? 's' : ''}`}
          </span>
        </span>
      </Tile>
    );
  }

  const gap = promotionGap(p);
  const remaining = gap.points;
  const then = p.streakNeeded > 0 ? `, puis ${p.streakNeeded} victoires d'affilée` : " et c'est la montée";
  return (
    <Tile className="fc-card fc-card--small fc-card--rank fc-dv-tile" to="/club/progression" delay={140}>
      <span className="fc-dv-shine" aria-hidden="true" />
      <span className="fc-dv-tile-copy">
        <span className="fc-dv-tile-head">
          <span>
            <span className="fc-dv-label">Classement · saison EA</span>
            <span className="fc-dv-division">{divisionLabel(p.division)}</span>
            <span className="fc-dv-goal">Objectif {nextDivisionLabel(p.division)}</span>
          </span>
          <span className="fc-dv-score">
            <b>{p.points}</b><small>/{p.target}</small>
            <span className="fc-dv-label">points</span>
          </span>
        </span>
        {p.seriesStarted ? <SeriesPips streak={p.streak} needed={p.streakNeeded} /> : <DivisionGauge points={p.points} target={p.target} />}
        <span className="fc-dv-line">
          {p.relegationMatchNext ? <><b>Match de relégation.</b> Ne pas perdre le prochain match.</>
            : p.targetReached ? <><b>Objectif atteint.</b> La montée arrive à la prochaine synchro EA.</>
              : p.seriesStarted ? <><b>Série finale : {p.streak}/{p.streakNeeded}.</b> Encore {winsLabel(gap.seriesWins)} d'affilée pour la {nextDivisionLabel(p.division)}.</>
                : <><b>Encore {remaining} pt{remaining > 1 ? 's' : ''}.</b> {winsLabel(Math.ceil(remaining / 3))}{then}.</>}
        </span>
        <span className="fc-dv-chances">
          <ChanceShields chances={p.chances} />
          <span>{p.chances === 0 ? 'Plus aucune chance' : `${p.chances} chance${p.chances > 1 ? 's' : ''} avant le match de relégation`}</span>
        </span>
        {p.missingMatches > 0 && (
          <span className="fc-dv-warn">{p.missingMatches} match{p.missingMatches > 1 ? 's' : ''} manquant{p.missingMatches > 1 ? 's' : ''} : chiffres à confirmer</span>
        )}
      </span>
    </Tile>
  );
}
