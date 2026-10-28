import { Link } from 'react-router';
import { useClub, useMatches } from '../../api/queries';
import { RESULT } from '../../lib/labels';
import { StadiumCrowd } from './FC27Decor';

/**
 * Entrée de la saison FC 27 : remplace l'arène des noms, close depuis que le club
 * s'appelle FoodBall Club. Les chiffres viennent de la synchro EA (server/ea-sync.ts).
 */
export function SeasonTile() {
  const club = useClub();
  const matches = useMatches();
  const c = club.data;
  const last = (matches.data ?? []).slice(0, 5).reverse();

  return <Link className="fc27-arena-entry fc27-season-tile" to="/club">
    <div className="fc27-arena-visual" aria-hidden="true"><StadiumCrowd /><b className="fc27-arena-stamp">FC<br />27</b></div>
    <div className="fc27-arena-copy">
      <span className="fc27-tag">La saison est lancée · Stats EA</span>
      <h2 className="fc27-arena-title">FoodBall<br />Club.<br /><span>En jeu.</span></h2>
      {c ? <dl className="fc27-season-stats">
        <div><dt>Matchs</dt><dd>{c.gamesPlayed}</dd></div>
        <div><dt>Buts</dt><dd>{c.goalsFor}</dd></div>
        <div><dt>Skill rating</dt><dd>{c.skillRating}</dd></div>
      </dl> : <p>{club.isError ? 'Stats EA indisponibles pour le moment.' : 'Chargement des stats EA…'}</p>}
      {c && <span className="fc27-entry-status"><b>{c.wins}</b><span>V</span><b>{c.draws}</b><span>N</span><b>{c.losses}</b><span>D</span>
        {last.length > 0 && <i aria-label="Forme récente">{last.map((m) => RESULT[m.result].letter).join(' ')}</i>}</span>}
      <span className="fc27-cta">Toutes les stats <span aria-hidden="true">→</span></span>
    </div>
  </Link>;
}
