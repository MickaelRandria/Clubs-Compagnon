import { useState } from 'react';
import type { Match, MatchResult } from '../../../shared/types';
import { frNum } from '../../lib/format';
import { RESULT } from '../../lib/labels';

const BAR_HEIGHT = 170;
const LEGEND: MatchResult[] = ['win', 'draw', 'loss'];

/** Buts marqués par match (du plus ancien au plus récent) — bloc Marine. */
export function GoalsChart({ matches }: { matches: Match[] }) {
  const [hovered, setHovered] = useState<number | null>(null);
  const data = [...matches].reverse();
  // Échelle paire qui contient le meilleur score (6 avec les données actuelles).
  const max = Math.max(2, Math.ceil(Math.max(...data.map((m) => m.goalsFor), 0) / 2) * 2);
  const ticks = Array.from({ length: max / 2 + 1 }, (_, i) => i * 2);
  const y = (value: number) => (value / max) * BAR_HEIGHT;
  const avg = data.length ? data.reduce((s, m) => s + m.goalsFor, 0) / data.length : 0;

  return (
    <div className="fc-block fc-marine fc-chart-block" style={{ animationDelay: '140ms' }}>
      <div className="fc-chart-head">
        <span>
          <span className="fc-title fc-title--lg">Buts par match</span>
          <span className="fc-muted" style={{ display: 'block', marginTop: 6 }}>
            {data.length} derniers matchs, du plus ancien au plus récent
          </span>
        </span>
        <span className="fc-legend fc-legend--sm">
          {LEGEND.map((result) => (
            <span key={result} className="fc-legend-label">
              <i className="fc-swatch" style={{ background: RESULT[result].bg }} />
              {RESULT[result].word}
            </span>
          ))}
        </span>
      </div>

      <div className="fc-chart">
        <div className="fc-axis" aria-hidden="true">
          {ticks.map((v) => (
            <span key={v} style={{ bottom: y(v) }}>
              {v}
            </span>
          ))}
        </div>
        <div className="fc-plot">
          {ticks.map((v) => (
            <span key={v} className="fc-grid-line" style={{ bottom: y(v) }} />
          ))}
          <span className="fc-avg-line" style={{ bottom: y(avg) }}>
            <span className="fc-avg-tag">Moy. {frNum(avg, 1)}</span>
          </span>
          {data.map((m, i) => {
            const height = y(m.goalsFor);
            return (
              <div
                key={m.id}
                className="fc-col"
                tabIndex={0}
                role="img"
                aria-label={`${m.goalsFor}–${m.goalsAgainst} contre ${m.opponent}`}
                onMouseEnter={() => setHovered(m.id)}
                onMouseLeave={() => setHovered(null)}
                onFocus={() => setHovered(m.id)}
                onBlur={() => setHovered(null)}
              >
                {hovered === m.id && (
                  <span className="fc-tip" style={{ bottom: height + 30 }}>
                    {m.goalsFor}–{m.goalsAgainst} · {m.opponent}
                  </span>
                )}
                <span className="fc-col-value">{m.goalsFor}</span>
                <span
                  className="fc-col-bar"
                  style={{ height: Math.max(height, 3), background: RESULT[m.result].bg, animationDelay: `${i * 40}ms` }}
                />
              </div>
            );
          })}
        </div>
        <div className="fc-xlabels" aria-hidden="true">
          {data.map((m, i) => (
            <span key={m.id}>
              <span className="full">{m.opponent}</span>
              <span className="short">{i + 1}</span>
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}
