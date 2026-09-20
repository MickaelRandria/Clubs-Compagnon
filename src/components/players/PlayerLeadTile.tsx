import type { Member } from '../../../shared/types';
import { frNum } from '../../lib/format';
import { POS_LABEL, POS_SHORT } from '../../lib/labels';
import { Glyph } from '../ui/Glyph';
import { HeroShards } from '../ui/HeroShards';
import { Spill } from '../ui/Spill';
import { formatStat, type SortKey } from './playerSort';

/** N°1 du tri — tile Bleu Dommage. */
export function PlayerLeadTile({
  player,
  sortKey,
  sortLabel,
  spill,
}: {
  player: Member;
  sortKey: SortKey;
  sortLabel: string;
  spill: boolean;
}) {
  const kpis = [
    [String(player.ovr), 'OVR'],
    [player.avgRating === null ? '—' : frNum(player.avgRating, 1), 'Note'],
    [player.passPct === null ? '—' : `${player.passPct}%`, 'Passes réussies'],
  ];

  return (
    <div className="fc-block fc-hero">
      <div className="fc-hero-copy">
        <span className="fc-rank">01</span>
        <span className="fc-title fc-title--xl fc-name">{player.gamertag}</span>
        <span className="fc-meta">
          <span className="fc-pos fc-pos--solid">{POS_SHORT[player.position]}</span>
          <span>
            {POS_LABEL[player.position]} · {player.matchesPlayed} matchs
          </span>
        </span>
        <span className="fc-mention">
          <Glyph name="ball" />
          <span>
            {player.goals} buts · {player.assists} passes D.
          </span>
        </span>
        <span className="fc-kpis">
          {kpis.map(([value, label]) => (
            <span key={label}>
              <span className="fc-kpi-value">{value}</span>
              <span className="fc-kpi-label">{label}</span>
            </span>
          ))}
        </span>
      </div>
      <div className="fc-hero-art">
        <HeroShards />
        <span className="fc-hero-trend">Tri · {sortLabel}</span>
        <span className="fc-hero-num">{formatStat(player, sortKey)}</span>
      </div>
      {spill && <Spill at="bottom" />}
    </div>
  );
}
