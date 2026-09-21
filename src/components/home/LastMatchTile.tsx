import type { Match } from '../../../shared/types';
import { timeAgo } from '../../lib/format';
import { MATCH_TYPE_LABEL, RESULT } from '../../lib/labels';
import { FC } from '../../lib/tokens';
import { Glyph } from '../ui/Glyph';
import { Tile } from '../ui/Tile';

/** C · Dernier match — tile moyen Blanc Craie. */
export function LastMatchTile({ match }: { match: Match | undefined }) {
  if (!match) {
    return (
      <Tile className="fc-card fc-card--match" to="/matchs" delay={140}>
        <span className="fc-card-copy">
          <span className="fc-title fc-title--md">Dernier match</span>
          <span className="fc-card-sub">Aucun match enregistré</span>
        </span>
      </Tile>
    );
  }

  const r = RESULT[match.result];
  const details = [
    timeAgo(match.playedAt),
    match.possessionPct !== null && `${match.possessionPct}% poss.`,
    match.shots !== null && `${match.shots} tirs`,
  ].filter(Boolean);

  return (
    <Tile className="fc-card fc-card--match" to={`/matchs/${match.id}`} delay={140}>
      <span className="fc-card-copy">
        <span className="fc-title fc-title--md">Dernier match</span>
        <span className="fc-card-sub">
          vs {match.opponent} · {MATCH_TYPE_LABEL[match.type]}
        </span>
        <span className="fc-mention fc-mention--end">
          <Glyph name="clock" />
          <span>{details.join(' · ')}</span>
        </span>
      </span>
      <span className="fc-card-art">
        <svg viewBox="0 0 200 196" preserveAspectRatio="xMaxYMid slice" aria-hidden="true">
          <polygon points="70,0 200,0 200,196 20,196 90,104 45,112" fill={FC.glacier} opacity=".35" />
          <polygon points="178,-4 192,-4 152,200 138,200" fill={FC.blue} />
          <polygon points="200,130 160,196 200,196" fill={FC.marine} opacity=".14" />
        </svg>
        <span className="fc-chip" style={{ background: r.bg, color: r.fg }}>
          {r.word}
        </span>
        <span className="fc-score">
          {match.goalsFor}
          <span>–</span>
          {match.goalsAgainst}
        </span>
      </span>
    </Tile>
  );
}
