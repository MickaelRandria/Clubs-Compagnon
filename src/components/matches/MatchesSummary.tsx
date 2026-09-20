import type { Match } from '../../../shared/types';
import { average, frNum } from '../../lib/format';
import { RESULT } from '../../lib/labels';
import { Glyph } from '../ui/Glyph';
import { HeroShards } from '../ui/HeroShards';
import { Spill } from '../ui/Spill';
import { StatTile } from '../ui/StatTile';

/** Bilan des derniers matchs (tile bleu) + 3 tiles de résumé clairs. */
export function MatchesSummary({ matches }: { matches: Match[] }) {
  const n = matches.length;
  const count = (result: Match['result']) => matches.filter((m) => m.result === result).length;
  const wins = count('win');
  const scored = matches.reduce((s, m) => s + m.goalsFor, 0);
  const conceded = matches.reduce((s, m) => s + m.goalsAgainst, 0);
  const possession = average(matches.map((m) => m.possessionPct));
  const shots = average(matches.map((m) => m.shots));

  return (
    <div className="fc-matches-top">
      <div className="fc-block fc-hero fc-hero--compact">
        <div className="fc-hero-copy">
          <span className="fc-title fc-title--lg">{n} derniers matchs</span>
          <span className="fc-mention">
            <Glyph name="bars" />
            <span>{Math.round((wins / n) * 100)}% de victoires</span>
          </span>
          <span className="fc-streak" title="Du plus ancien au plus récent">
            {[...matches].reverse().map((m) => {
              const r = RESULT[m.result];
              return (
                <span key={m.id} style={{ background: r.bg, color: r.fg }} title={`${m.goalsFor}–${m.goalsAgainst} vs ${m.opponent}`}>
                  {r.letter}
                </span>
              );
            })}
          </span>
        </div>
        <div className="fc-hero-art">
          <HeroShards />
          <span className="fc-hero-trend">V · N · D</span>
          <span className="fc-hero-num">
            {wins}
            <span className="sep">-</span>
            {count('draw')}
            <span className="sep">-</span>
            {count('loss')}
          </span>
        </div>
        <Spill at="side" />
      </div>
      <StatTile label="Buts pour" value={scored} sub={`${frNum(scored / n, 1)} par match`} delay={70} />
      <StatTile label="Buts contre" value={conceded} sub={`${frNum(conceded / n, 1)} par match`} delay={130} />
      <StatTile
        label="Possession"
        value={possession === null ? '—' : `${Math.round(possession)}%`}
        sub={shots === null ? undefined : `${frNum(shots, 1)} tirs par match`}
        delay={190}
      />
    </div>
  );
}
