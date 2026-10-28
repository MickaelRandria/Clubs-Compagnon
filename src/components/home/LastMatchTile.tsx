import { FEAT_LABEL, matchFeat, srText } from '../../../shared/skill-rating';
import type { Match, MatchPlayer } from '../../../shared/types';
import { useMatchDetail } from '../../api/queries';
import { timeAgo } from '../../lib/format';
import { MATCH_TYPE_LABEL, RESULT } from '../../lib/labels';
import { Tile } from '../ui/Tile';

const total = (players: MatchPlayer[], key: 'shots' | 'passesMade' | 'passAttempts') => players.reduce((sum, p) => sum + p[key], 0);
const passPct = (players: MatchPlayer[]) => {
  const attempts = total(players, 'passAttempts');
  return attempts > 0 ? Math.round((total(players, 'passesMade') / attempts) * 100) : null;
};

/** Ligne du mini-duel : nos chiffres à gauche, les leurs à droite, une barre partagée. */
function DuelLine({ label, ours, theirs, suffix = '' }: { label: string; ours: number; theirs: number; suffix?: string }) {
  return (
    <span className="fc-mini-duel">
      <b>{ours}{suffix}</b>
      <span>
        <small>{label}</small>
        <span className="fc-versus-bar" aria-hidden="true"><i style={{ flexGrow: ours || 1 }} /><i style={{ flexGrow: theirs || 1 }} /></span>
      </span>
      <b>{theirs}{suffix}</b>
    </span>
  );
}

/** B · Dernier match, avec le duel nous / eux quand EA a renvoyé les deux feuilles. */
export function LastMatchTile({ match }: { match: Match | undefined }) {
  const detail = useMatchDetail(match?.id ?? 0);
  if (!match) {
    return (
      <Tile className="fc-card fc-card--match" to="/matchs" delay={70}>
        <span className="fc-card-copy">
          <span className="fc-title fc-title--md">Dernier match</span>
          <span className="fc-card-sub">Aucun match enregistré</span>
        </span>
      </Tile>
    );
  }

  const r = RESULT[match.result];
  const feat = matchFeat(match);
  const ours = detail.data?.players ?? [];
  const theirs = detail.data?.opponent?.players ?? [];
  const oursPass = passPct(ours);
  const theirsPass = passPct(theirs);

  return (
    <Tile className="fc-card fc-card--last" to={`/matchs/${match.id}`} delay={70}>
      <span className="fc-last-head">
        <span className="fc-title fc-title--md">Dernier match</span>
        <span className="fc-muted">
          {[MATCH_TYPE_LABEL[match.type], timeAgo(match.playedAt),
            match.opponentSkillRating !== null && `SR adv. ${srText(match.opponentSkillRating, match.opponentSrEstimated)}`].filter(Boolean).join(' · ')}
        </span>
      </span>
      <span className="fc-last-score">
        <span>FoodBall</span>
        <span className="fc-score">{match.goalsFor}<span>–</span>{match.goalsAgainst}</span>
        <span>{match.opponent}</span>
      </span>
      <span className="fc-last-chips">
        <span className="fc-chip" style={{ background: r.bg, color: r.fg }}>{match.opponentQuit ? `${r.word} · abandon adverse` : r.word}</span>
        {feat && <span className={`fc-sheet-type fc-sheet-type--${feat}`}>{FEAT_LABEL[feat]}</span>}
      </span>
      {ours.length > 0 && theirs.length > 0 && (
        <span className="fc-last-duel">
          <DuelLine label="Tirs" ours={total(ours, 'shots')} theirs={total(theirs, 'shots')} />
          {oursPass !== null && theirsPass !== null && <DuelLine label="Passes réussies" ours={oursPass} theirs={theirsPass} suffix="%" />}
        </span>
      )}
    </Tile>
  );
}
