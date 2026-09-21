import type { Member } from '../../../shared/types';
import { frNum } from '../../lib/format';
import { POS_LABEL, POS_SHORT, posColorClass } from '../../lib/labels';
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

  // Statistique complémentaire sans duplication avec le tri principal
  const renderMention = () => {
    const ratio = (val: number) => (player.matchesPlayed > 0 ? frNum(val / player.matchesPlayed, 2) : '—');
    if (sortKey === 'goals') {
      return (
        <span>
          {player.assists} passes D. · {ratio(player.goals)} but/m
        </span>
      );
    }
    if (sortKey === 'assists') {
      return (
        <span>
          {player.goals} buts · {ratio(player.assists)} PD/m
        </span>
      );
    }
    if (sortKey === 'matchesPlayed') {
      return (
        <span>
          {player.goals} buts · {player.assists} passes D.
        </span>
      );
    }
    return (
      <span>
        {player.goals} buts · {player.assists} passes D. · {player.matchesPlayed} MJ
      </span>
    );
  };

  return (
    <div className="fc-block fc-hero">
      <div className="fc-hero-copy">
        <div className="fc-hero-lead-header">
          <span className="fc-rank">01</span>
          <span className="fc-lead-badge">N°1 · {sortLabel.toUpperCase()}</span>
        </div>
        <span className="fc-title fc-title--xl fc-name">{player.gamertag}</span>
        <span className="fc-meta">
          <span className={`fc-pos ${posColorClass(player.position)}`}>{POS_SHORT[player.position]}</span>
          <span>
            {POS_LABEL[player.position]} · {player.matchesPlayed} matchs
          </span>
        </span>
        <span className="fc-mention">
          <Glyph name="ball" />
          {renderMention()}
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
