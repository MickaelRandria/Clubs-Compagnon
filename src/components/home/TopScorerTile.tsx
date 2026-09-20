import type { Member } from '../../../shared/types';
import { FC } from '../../lib/tokens';
import { Glyph } from '../ui/Glyph';
import { Tile } from '../ui/Tile';

/** D · Top buteur — tile moyen Blanc Craie. */
export function TopScorerTile({ members }: { members: Member[] }) {
  const top = members.reduce<Member | undefined>((best, m) => (!best || m.goals > best.goals ? m : best), undefined);

  return (
    <Tile className="fc-card fc-card--trophy" to="/joueurs" delay={210}>
      <span className="fc-card-copy">
        <span className="fc-title fc-title--md">Top buteur</span>
        <span className="fc-card-sub">{top?.gamertag ?? 'Aucun joueur'}</span>
        {top && (
          <span className="fc-mention fc-mention--end">
            <Glyph name="ball" />
            <span>
              {top.goals} buts · {top.assists} passes D.
            </span>
          </span>
        )}
      </span>
      <span className="fc-card-art">
        <svg viewBox="0 0 200 196" preserveAspectRatio="xMaxYMid slice" aria-hidden="true">
          <polygon points="40,0 200,0 200,196 90,196 140,96 60,110" fill={FC.glacier} opacity=".35" />
          <polygon points="200,138 146,196 200,196" fill={FC.blue} />
        </svg>
        <svg viewBox="0 0 96 96" width="92" height="92" aria-hidden="true">
          <path d="M30 14h36v18c0 14-8 26-18 26S30 46 30 32z" fill={FC.blue} />
          <path
            d="M30 21H18c0 12 5 18 13 19M66 21h12c0 12-5 18-13 19"
            fill="none"
            stroke={FC.marine}
            strokeWidth="4"
            strokeLinecap="round"
          />
          <path d="M48 58v12" stroke={FC.marine} strokeWidth="5" />
          <rect x="33" y="70" width="30" height="8" fill={FC.marine} />
          <rect x="27" y="78" width="42" height="8" fill={FC.marine} />
          <path d="M40 21l-3 20" stroke={FC.glacier} strokeWidth="3" strokeLinecap="round" />
        </svg>
      </span>
    </Tile>
  );
}
