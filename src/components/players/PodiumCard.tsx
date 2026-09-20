import type { Member } from '../../../shared/types';
import { pad2 } from '../../lib/format';
import { POS_SHORT } from '../../lib/labels';
import { FC } from '../../lib/tokens';
import { formatStat, type SortKey } from './playerSort';

/** N°2 / N°3 du tri — tiles clairs. */
export function PodiumCard({
  player,
  rank,
  sortKey,
  sortLabel,
  delay,
}: {
  player: Member;
  rank: number;
  sortKey: SortKey;
  sortLabel: string;
  delay: number;
}) {
  return (
    <div className="fc-block fc-card" style={{ animationDelay: `${delay}ms` }}>
      <span className="fc-card-copy">
        <span className="fc-rank">{pad2(rank)}</span>
        <span className="fc-title fc-title--md fc-name">{player.gamertag}</span>
        <span className="fc-mention fc-mention--end">
          <span className={`fc-pos${player.position === 'FW' ? ' fc-pos--hot' : ''}`}>{POS_SHORT[player.position]}</span>
          <span>OVR {player.ovr}</span>
        </span>
      </span>
      <span className="fc-card-art">
        <svg viewBox="0 0 200 160" preserveAspectRatio="xMaxYMid slice" aria-hidden="true">
          <polygon points="60,0 200,0 200,160 10,160 80,86 30,94" fill={FC.glacier} opacity=".35" />
          <polygon points="176,-4 190,-4 150,164 136,164" fill={FC.blue} />
        </svg>
        <span className="fc-big">{formatStat(player, sortKey)}</span>
        <span className="fc-big-label">{sortLabel}</span>
      </span>
    </div>
  );
}
