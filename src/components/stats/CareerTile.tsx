import type { Club, MatchResult } from '../../../shared/types';
import { RESULT } from '../../lib/labels';
import { HeroShards } from '../ui/HeroShards';
import { Spill } from '../ui/Spill';

/** Bilan carrière — tile Bleu Dommage avec barre V/N/D biseautée. */
export function CareerTile({ club }: { club: Club }) {
  const games = Math.max(club.gamesPlayed, 1);
  const winPct = Math.round((club.wins / games) * 100);
  const drawPct = Math.round((club.draws / games) * 100);
  const lossPct = 100 - winPct - drawPct;
  const split: Array<[MatchResult, number, number, string]> = [
    ['win', winPct, club.wins, 'Victoires'],
    ['draw', drawPct, club.draws, 'Nuls'],
    ['loss', lossPct, club.losses, 'Défaites'],
  ];

  return (
    <div className="fc-block fc-hero fc-career">
      <div className="fc-hero-copy">
        <span className="fc-title fc-title--xl">Bilan carrière</span>
        <span className="fc-body">
          {club.goalsFor} buts marqués et {club.goalsAgainst} encaissés en Pro Clubs, région {club.region}.
        </span>
      </div>
      <div className="fc-hero-art">
        <HeroShards />
        <span className="fc-hero-trend">Matchs joués</span>
        <span className="fc-hero-num">{club.gamesPlayed}</span>
      </div>
      <div className="fc-split-wrap">
        <div
          className="fc-split"
          role="img"
          aria-label={`${winPct}% de victoires, ${drawPct}% de nuls, ${lossPct}% de défaites`}
        >
          {split.map(([result, pct]) => (
            <i key={result} style={{ width: `${pct}%`, background: RESULT[result].bg }} />
          ))}
        </div>
        <div className="fc-legend">
          {split.map(([result, pct, count, label]) => (
            <span key={result} className="fc-legend-item">
              <span
                className="fc-legend-value"
                style={{
                  color:
                    result === 'win'
                      ? 'var(--fc-glacier)'
                      : result === 'loss'
                        ? 'var(--fc-rouge)'
                        : 'var(--fc-acier)',
                }}
              >
                {pct}%
              </span>
              <span className="fc-legend-label">
                <i className="fc-swatch" style={{ background: RESULT[result].bg }} />
                {label} · {count}
              </span>
            </span>
          ))}
        </div>
      </div>
      <Spill at="bottom" />
    </div>
  );
}
