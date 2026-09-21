import { Link } from 'react-router';
import type { Match } from '../../../shared/types';
import { timeAgo } from '../../lib/format';
import { MATCH_TYPE_LABEL, RESULT } from '../../lib/labels';
import { Glyph } from '../ui/Glyph';
import { Meter } from '../ui/Meter';

/** Une ligne de l'historique — complète sur desktop, compacte sur mobile. */
export function MatchRow({ match, mobile }: { match: Match; mobile: boolean }) {
  const r = RESULT[match.result];
  const type = MATCH_TYPE_LABEL[match.type];
  const res = (
    <span className="fc-res" style={{ background: r.bg, color: r.fg }} title={r.word}>
      {r.letter}
    </span>
  );
  const opponent = (
    <span className="fc-opp">
      <small>vs</small>
      <strong>{match.opponent}</strong>
      {mobile && (
        <span className={`fc-mtype-badge${match.type === 'playoff' ? ' fc-mtype-badge--playoff' : ''}`}>
          {type}
        </span>
      )}
    </span>
  );
  const score = (
    <span className="fc-mscore-wrap">
      <span className="fc-mscore">
        {match.goalsFor}
        <span>–</span>
        {match.goalsAgainst}
      </span>
      {mobile && <span className="fc-mscore-arrow" aria-hidden="true">›</span>}
    </span>
  );

  if (mobile) {
    const details = [
      timeAgo(match.playedAt),
      match.possessionPct !== null && `${match.possessionPct}% poss.`,
      match.shots !== null && `${match.shots} tirs`,
    ].filter(Boolean);
    return (
      <Link to={`/matchs/${match.id}`} className="fc-mrow fc-mrow--m">
        {res}
        <span style={{ display: 'block', minWidth: 0 }}>
          {opponent}
          <span className="fc-muted" style={{ display: 'block', marginTop: 5 }}>
            {details.join(' · ')}
          </span>
        </span>
        {score}
      </Link>
    );
  }

  return (
    <div className="fc-mrow">
      {res}
      {opponent}
      <span>
        <span className={`fc-pos${match.type === 'playoff' ? ' fc-pos--hot' : ''}`}>{type}</span>
      </span>
      {score}
      <span className="fc-poss">
        <Meter pct={match.possessionPct ?? 0} />
        <b>{match.possessionPct === null ? '—' : `${match.possessionPct}%`}</b>
      </span>
      <span className="fc-shots">
        <b>{match.shots ?? '—'}</b> <span className="fc-muted">tirs</span>
      </span>
      <span className="fc-when fc-muted">
        <Glyph name="clock" size={14} />
        {timeAgo(match.playedAt)}
      </span>
      <Link to={`/matchs/${match.id}`} className="fc-ghost">
        Détails
      </Link>
    </div>
  );
}
