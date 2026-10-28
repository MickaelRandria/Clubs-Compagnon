import type { Member } from '../../../shared/types';
import { Tile } from '../ui/Tile';

/** D · Hommes du match : le leader et son premier poursuivant. */
export function MotmTile({ members }: { members: Member[] }) {
  const [first, second] = [...members].sort((a, b) => b.motm - a.motm);
  return (
    <Tile className="fc-card fc-card--small" to={first ? `/joueurs/${first.id}` : '/joueurs'} delay={210}>
      <span className="fc-card-copy">
        <span className="fc-title fc-title--md">Hommes du match</span>
        <span className="fc-big">{first?.motm ?? 0}</span>
        <span className="fc-mention">
          {first ? `${first.gamertag}${second && second.motm > 0 ? `, devant ${second.gamertag} (${second.motm})` : ''}` : 'Aucun joueur'}
        </span>
      </span>
    </Tile>
  );
}
