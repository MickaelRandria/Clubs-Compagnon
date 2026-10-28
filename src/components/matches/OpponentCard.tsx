import { Link } from 'react-router';
import { divisionLabel } from '../../../shared/division';
import { levelDivision, opponentStrength, srText } from '../../../shared/skill-rating';
import type { Match, MatchDetail } from '../../../shared/types';
import { formatShortDate } from '../../lib/format';
import { RESULT } from '../../lib/labels';

/** Ce que l'écart de niveau dit du résultat, en une phrase. */
function verdict(match: Match): string | null {
  const { ourSkillRating: ours, opponentSkillRating: theirs } = match;
  const strength = opponentStrength(ours, theirs);
  if (!strength || ours === null || theirs === null) return null;
  const gap = Math.abs(theirs - ours);
  if (strength === 'even') return `Même niveau que nous (${gap} points d'écart) : un match ouvert sur le papier.`;
  if (strength === 'stronger') {
    return `Mieux noté que nous de ${gap} points. ${match.result === 'win' ? 'Cette victoire est un exploit : elle rapporte gros.'
      : match.result === 'draw' ? 'Un nul contre plus fort, ça se prend.' : 'Une défaite contre plus fort coûte peu de points.'}`;
  }
  return `Moins bien noté que nous de ${gap} points. ${match.result === 'win' ? 'Victoire attendue : elle rapporte peu de points.'
    : match.result === 'draw' ? 'Un nul contre plus faible coûte des points.' : 'Défaite contre plus faible : elle coûte cher.'}`;
}

/** Fiche du club adverse (skill rating comparé au nôtre, bilan EA) et nos confrontations avec lui. */
export function OpponentCard({ detail }: { detail: MatchDetail }) {
  const { match, opponentClub: club, headToHead } = detail;
  const ours = match.ourSkillRating;
  const theirs = match.opponentSkillRating;
  const level = theirs === null ? null : levelDivision(theirs);
  const line = verdict(match);

  return (
    <section className="fc-block fc-marine fc-rival" aria-labelledby="fc-rival-title">
      <h2 id="fc-rival-title" className="fc-section-head">
        L'adversaire <small>{club ? `fiche EA du ${formatShortDate(club.fetchedAt)}` : 'fiche EA pas encore lue'}</small>
      </h2>

      {theirs !== null && (
        <div className="fc-rival-sr">
          <span className="fc-rival-side">
            <small>Nous</small>
            <b>{ours ?? '—'}</b>
          </span>
          <span className="fc-rival-mid">
            <small>Skill rating le jour du match</small>
            <span className="fc-versus-bar" aria-hidden="true"><i style={{ flexGrow: ours ?? 1 }} /><i style={{ flexGrow: theirs }} /></span>
            {level !== null && <span>Eux : niveau {divisionLabel(level)}</span>}
          </span>
          <span className="fc-rival-side">
            <small>Eux</small>
            <b>{srText(theirs, match.opponentSrEstimated)}</b>
          </span>
        </div>
      )}
      {line && <p className="fc-rival-line">{line}</p>}
      {match.opponentSrEstimated && <p className="fc-muted fc-rival-note">~ : note relevée après le match, elle a pu bouger depuis.</p>}

      {club && (
        <div className="fc-rival-facts">
          <span><b>{club.wins}-{club.draws}-{club.losses}</b>Bilan V-N-D</span>
          <span><b>{club.gamesPlayed}</b>Matchs joués</span>
          <span><b>{club.winStreak >= 2 ? `${club.winStreak} V` : club.unbeatenStreak}</b>{club.winStreak >= 2 ? 'Victoires de suite' : 'Série sans défaite'}</span>
          <span><b>{club.bestDivision === null ? '—' : divisionLabel(club.bestDivision)}</b>Meilleure division</span>
        </div>
      )}

      <h3 className="fc-pro-section">
        Nos confrontations <small>{headToHead.length === 1 ? 'première rencontre' : `${headToHead.length} matchs`}</small>
      </h3>
      {headToHead.length > 1 && (
        <p className="fc-rival-line">
          {(['win', 'draw', 'loss'] as const).map((r) => `${headToHead.filter((m) => m.result === r).length} ${RESULT[r].letter}`).join(' · ')}
          {' '}contre {match.opponent}
        </p>
      )}
      <div className="fc-rival-h2h">
        {headToHead.map((m) => (
          <Link key={m.id} to={`/matchs/${m.id}`} className={m.id === match.id ? 'is-active' : undefined}
            aria-current={m.id === match.id ? 'page' : undefined}>
            <span className="fc-res" style={{ background: RESULT[m.result].bg, color: RESULT[m.result].fg }}>{RESULT[m.result].letter}</span>
            <span>{formatShortDate(m.playedAt)}</span>
            <b>{m.goalsFor}–{m.goalsAgainst}</b>
          </Link>
        ))}
      </div>
    </section>
  );
}
