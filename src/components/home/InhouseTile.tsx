import { PLAYOFF_NIGHT } from '../../content/playoffs';
import { SHIELD_PATH } from '../../lib/shield';
import { FC } from '../../lib/tokens';
import { Glyph } from '../ui/Glyph';
import { Tile } from '../ui/Tile';

/** B · Playoffs Inhouse — photo assombrie (équivalent « Pro Clubs »). */
export function InhouseTile() {
  const night = PLAYOFF_NIGHT;
  return (
    <Tile className="fc-clubs" to="/playoffs" delay={70}>
      <img src="/inhouse.jpg" alt="" />
      <span className="fc-clubs-tint" />
      <span className="fc-clubs-shade" />
      <svg className="fc-clubs-shards" viewBox="0 0 300 420" preserveAspectRatio="xMaxYMid slice" aria-hidden="true">
        <polygon points="180,-10 232,-10 122,430 70,430" fill={FC.glacier} opacity=".5" />
        <polygon points="252,-10 264,-10 162,430 150,430" fill={FC.craie} opacity=".75" />
        <polygon points="310,110 262,200 300,192 226,340 310,300" fill={FC.blue} />
      </svg>
      <span className="fc-clubs-copy">
        <span className="fc-title fc-title--lg">Playoffs Inhouse</span>
        <span className="fc-body">
          La nuit des Playoffs chez {night.host} : toute la squad en LAN pour la Division {night.division}.
        </span>
        <svg viewBox="0 0 96 106" width="80" height="88" aria-hidden="true">
          <path d={SHIELD_PATH} fill="none" stroke={FC.craie} strokeWidth="4" />
          <text
            x="48"
            y="38"
            textAnchor="middle"
            fill={FC.craie}
            fontFamily="'Barlow Condensed', sans-serif"
            fontWeight="700"
            fontSize="13"
            letterSpacing="2"
          >
            INHOUSE
          </text>
          <text
            x="48"
            y="82"
            textAnchor="middle"
            fill={FC.glacier}
            fontFamily="'Barlow Condensed', sans-serif"
            fontWeight="800"
            fontStyle="italic"
            fontSize="46"
          >
            D
          </text>
        </svg>
        <span className="fc-mention fc-mention--end">
          <Glyph name="trophy" />
          <span>
            {night.wins} victoires · {night.losses} défaite{night.losses > 1 ? 's' : ''}
          </span>
        </span>
      </span>
    </Tile>
  );
}
