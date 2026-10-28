import type { Member } from '../../../shared/types';
import { Glyph } from '../ui/Glyph';
import { Tile } from '../ui/Tile';

/** D · Top buteur — tile moyen Blanc Craie. */
export function TopScorerTile({ members }: { members: Member[] }) {
  const top = members.reduce<Member | undefined>((best, m) => (!best || m.goals > best.goals ? m : best), undefined);

  return (
    <Tile className="fc-card fc-card--trophy" to="/joueurs?tri=buts" delay={210}>
      <span className="fc-card-copy">
        <span className="fc-title fc-title--md">Top buteur</span>
        <span className="fc-card-sub">{top?.gamertag ?? 'Aucun joueur'}</span>
        {top && (
          <span className="fc-mention">
            <Glyph name="ball" />
            <span>
              {top.goals} buts · {top.assists} passes D.
            </span>
          </span>
        )}
      </span>
      <span className="fc-card-art fc-card-art--scorer">
        <img
          src="/images/ui/player-cutout.webp"
          alt=""
          className="fc-scorer-cutout"
          width={180}
          height={212}
          loading="lazy"
        />
        {top && (
          <span className="fc-scorer-stat">
            <span className="fc-scorer-num">{top.goals}</span>
            <span className="fc-scorer-lbl">BUTS</span>
          </span>
        )}
      </span>
    </Tile>
  );
}
