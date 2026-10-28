import type { MatchPlayer } from '../../../shared/types';
import { frNum } from '../../lib/format';
import { POS_SHORT, posColorClass } from '../../lib/labels';

const pct = (made: number, attempts: number) => (attempts > 0 ? `${Math.round((made / attempts) * 100)}%` : '—');

/** Note EA : verte dès 7,5, rouge sous 6 — le reste reste neutre. */
const ratingTone = (rating: number) => (rating >= 7.5 ? 'is-high' : rating < 6 ? 'is-low' : '');

/** Feuille de match EA — une ligne par joueur, du mieux noté au moins bien noté. La nôtre par défaut, ou celle de l'adversaire. */
export function MatchLineup({ players, title = 'Feuille de match', id = 'fc-lineup-title' }: { players: MatchPlayer[]; title?: string; id?: string }) {
  if (players.length === 0) return null;
  return (
    <section className="fc-block fc-marine fc-lineup" aria-labelledby={id}>
      <div className="fc-lineup-head">
        <h2 id={id} className="fc-title fc-title--md">{title}</h2>
        <span className="fc-muted">Stats EA · {players.length} joueur{players.length > 1 ? 's' : ''}</span>
      </div>
      <div className="fc-lineup-table" role="table" aria-label="Stats des joueurs sur ce match">
        <div className="fc-lineup-row fc-lineup-row--head" role="row">
          <span role="columnheader">Joueur</span>
          <span role="columnheader">Note</span>
          <span role="columnheader" title="Buts">B</span>
          <span role="columnheader" title="Passes décisives">PD</span>
          <span role="columnheader">Tirs</span>
          <span role="columnheader" className="fc-lineup-extra">Passes</span>
          <span role="columnheader" className="fc-lineup-extra">Tacles</span>
        </div>
        {players.map((p) => (
          <div key={p.gamertag} className="fc-lineup-row" role="row">
            <span role="cell" className="fc-lineup-player">
              <span className={`fc-pos ${posColorClass(p.position)}`}>{POS_SHORT[p.position]}</span>
              <strong>{p.gamertag}</strong>
              {p.motm && <span className="fc-lineup-motm" title="Homme du match">★ HDM</span>}
              {p.redCards > 0 && <span className="fc-lineup-red" title="Carton rouge" aria-label="Carton rouge" />}
              {p.leftEarly && <span className="fc-lineup-left" title="A quitté le match bien avant la fin">Parti</span>}
            </span>
            <span role="cell" className={`fc-lineup-rating ${ratingTone(p.rating)}`}>{frNum(p.rating, 1)}</span>
            <span role="cell" className={p.goals > 0 ? 'is-on' : undefined}>{p.goals}</span>
            <span role="cell" className={p.assists > 0 ? 'is-on' : undefined}>{p.assists}</span>
            <span role="cell">{p.shots}</span>
            <span role="cell" className="fc-lineup-extra">{p.passesMade}/{p.passAttempts} <small>{pct(p.passesMade, p.passAttempts)}</small></span>
            <span role="cell" className="fc-lineup-extra">{p.tacklesMade}/{p.tackleAttempts}</span>
          </div>
        ))}
      </div>
    </section>
  );
}
