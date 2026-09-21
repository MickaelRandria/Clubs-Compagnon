import type { Match } from '../../../shared/types';
import { formatMatchDate } from '../../lib/format';
import { MATCH_TYPE_LABEL, RESULT } from '../../lib/labels';
import { Glyph } from '../ui/Glyph';
import { HeroShards } from '../ui/HeroShards';

/** Fiche d'un match — tile Bleu Dommage. */
export function MatchSheet({ match }: { match: Match }) {
  const r = RESULT[match.result];
  const kpis = [
    [match.possessionPct === null ? '—' : `${match.possessionPct}%`, 'Possession'],
    [match.shots === null ? '—' : String(match.shots), 'Tirs'],
  ];

  return (
    <div className="fc-block fc-hero fc-sheet">
      <div className="fc-hero-copy">
        <div className="fc-sheet-badges">
          <span className="fc-chip" style={{ background: r.bg, color: r.fg }}>
            {r.word}
          </span>
          <span className={`fc-sheet-type${match.type === 'playoff' ? ' fc-sheet-type--playoff' : ''}`}>
            {MATCH_TYPE_LABEL[match.type]}
          </span>
        </div>
        <span className="fc-title fc-title--xl fc-name">vs {match.opponent}</span>
        <span className="fc-mention">
          <Glyph name="clock" />
          <span>{formatMatchDate(match.playedAt)}</span>
        </span>
        <span className="fc-kpis">
          {kpis.map(([value, label]) => (
            <span key={label}>
              <span className="fc-kpi-value">{value}</span>
              <span className="fc-kpi-label">{label}</span>
            </span>
          ))}
        </span>
        {match.possessionPct !== null && (
          <div className="fc-sheet-possession">
            <div className="fc-sheet-poss-labels">
              <span>DOMMAGE FC {match.possessionPct}%</span>
              <span>{100 - match.possessionPct}% {match.opponent.toUpperCase()}</span>
            </div>
            <div
              className="fc-sheet-poss-bar"
              role="progressbar"
              aria-label="Possession du match"
              aria-valuenow={match.possessionPct}
              aria-valuemin={0}
              aria-valuemax={100}
            >
              <div className="fc-sheet-poss-fill" style={{ width: `${match.possessionPct}%` }} />
            </div>
          </div>
        )}
      </div>
      <div className="fc-hero-art">
        <HeroShards />
        <span className="fc-hero-trend">Score final</span>
        <span className="fc-hero-num">
          {match.goalsFor}
          <span className="sep">–</span>
          {match.goalsAgainst}
        </span>
      </div>
    </div>
  );
}
