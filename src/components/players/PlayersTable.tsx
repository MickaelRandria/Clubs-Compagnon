import type { Member } from '../../../shared/types';
import { frNum, pad2 } from '../../lib/format';
import { useIsMobile } from '../../lib/hooks';
import { POS_SHORT } from '../../lib/labels';
import { Meter } from '../ui/Meter';
import { OvrBadge } from '../ui/OvrBadge';
import { formatStat, statValue, type SortKey } from './playerSort';

const COLUMNS = [
  ['goals', 'Buts'],
  ['assists', 'Passes D.'],
  ['matchesPlayed', 'MJ'],
  ['avgRating', 'Note'],
] as const;

/** Classement à partir du 4e — bloc Marine (tableau sur desktop, lignes compactes sur mobile). */
export function PlayersTable({
  players,
  firstRank,
  sortKey,
  sortLabel,
  maxValue,
}: {
  players: Member[];
  firstRank: number;
  sortKey: SortKey;
  sortLabel: string;
  maxValue: number;
}) {
  const isMobile = useIsMobile();
  const sorted = (key: SortKey) => (sortKey === key ? 'is-sorted' : undefined);
  const posClass = (p: Member) => `fc-pos${p.position === 'FW' ? ' fc-pos--hot' : ''}`;
  const meter = (p: Member) => <Meter pct={(statValue(p, sortKey) / maxValue) * 100} />;

  return (
    <div className="fc-block fc-marine fc-table" style={{ animationDelay: '180ms' }}>
      {!isMobile && (
        <div className="fc-table-head">
          <span>#</span>
          <span>Joueur</span>
          <span>Poste</span>
          <span className={sorted('ovr')}>OVR</span>
          {COLUMNS.map(([key, label]) => (
            <span key={key} className={sorted(key)}>
              {label}
            </span>
          ))}
          <span className="is-sorted">{sortLabel}</span>
        </div>
      )}

      {players.map((p, i) =>
        isMobile ? (
          <div key={p.id} className="fc-prow fc-prow--m">
            <span className="fc-rank">{pad2(firstRank + i)}</span>
            <span style={{ display: 'block', minWidth: 0 }}>
              <span className="fc-player">
                <span className="fc-player-name">{p.gamertag}</span>
                <span className={posClass(p)}>{POS_SHORT[p.position]}</span>
              </span>
              <span className="fc-prow-stats">
                <span>
                  <b>{p.goals}</b> buts
                </span>
                <span>
                  <b>{p.assists}</b> PD
                </span>
                <span>
                  <b>{p.matchesPlayed}</b> MJ
                </span>
                <span>
                  <b>{p.avgRating === null ? '—' : frNum(p.avgRating, 1)}</b> note
                </span>
              </span>
              {meter(p)}
            </span>
            <OvrBadge ovr={p.ovr} />
          </div>
        ) : (
          <div key={p.id} className="fc-prow">
            <span className="fc-rank">{pad2(firstRank + i)}</span>
            <span className="fc-player">
              <span className="fc-initials">{p.gamertag.slice(0, 2).toUpperCase()}</span>
              <span className="fc-player-name">{p.gamertag}</span>
            </span>
            <span>
              <span className={posClass(p)}>{POS_SHORT[p.position]}</span>
            </span>
            <span>
              <OvrBadge ovr={p.ovr} />
            </span>
            {COLUMNS.map(([key]) => (
              <span key={key} className={`fc-num${sortKey === key ? ' is-sorted' : ''}`}>
                {formatStat(p, key)}
              </span>
            ))}
            {meter(p)}
          </div>
        ),
      )}
    </div>
  );
}
