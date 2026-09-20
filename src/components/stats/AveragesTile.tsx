import type { Club } from '../../../shared/types';
import { frNum } from '../../lib/format';
import { FC } from '../../lib/tokens';
import { CornerShardLg } from '../ui/CornerShardLg';

/** Moyennes par match — bloc Marine. */
export function AveragesTile({ club }: { club: Club }) {
  const games = Math.max(club.gamesPlayed, 1);
  const scored = club.goalsFor / games;
  const conceded = club.goalsAgainst / games;
  const diff = scored - conceded;
  const share = scored + conceded > 0 ? (scored / (scored + conceded)) * 100 : 50;

  return (
    <div className="fc-block fc-marine fc-avg" style={{ animationDelay: '70ms' }}>
      <CornerShardLg />
      <span className="fc-title fc-title--lg">Moyennes par match</span>
      <span className="fc-avg-row">
        <span className="fc-avg-value" style={{ color: FC.glacier }}>
          {frNum(scored)}
        </span>
        <span className="fc-avg-label">buts marqués</span>
      </span>
      <span className="fc-avg-row">
        <span className="fc-avg-value">{frNum(conceded)}</span>
        <span className="fc-avg-label">buts encaissés</span>
      </span>
      <span className="fc-duel" role="img" aria-label="Part des buts marqués et encaissés">
        <i style={{ width: `${share}%`, background: FC.glacier }} />
        <i style={{ flex: 1, background: FC.acier }} />
      </span>
      <span className="fc-muted">
        Différence : {diff > 0 ? '+' : ''}
        {frNum(diff)} but par match
      </span>
    </div>
  );
}
