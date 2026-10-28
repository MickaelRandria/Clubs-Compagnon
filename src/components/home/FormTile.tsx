import type { Match } from '../../../shared/types';
import { RESULT } from '../../lib/labels';
import { Tile } from '../ui/Tile';

/** E · Forme — tile étroit Blanc Craie (équivalent « Tournaments »). */
export function FormTile({ matches }: { matches: Match[] }) {
  const chronological = [...matches].reverse();
  const count = (result: Match['result']) => matches.filter((m) => m.result === result).length;

  return (
    <Tile className="fc-card fc-card--form" to="/matchs" delay={280}>
      <span className="fc-form">
        <span className="fc-form-grid">
          {chronological.map((m) => {
            const r = RESULT[m.result];
            return (
              <span
                key={m.id}
                className="fc-form-cell"
                style={{ background: r.bg, color: r.fg }}
                title={`${m.goalsFor}–${m.goalsAgainst} vs ${m.opponent}`}
              >
                {r.letter}
              </span>
            );
          })}
        </span>
        <span className="fc-form-label">Forme</span>
        <span className="fc-form-sub">
          {count('win')} V · {count('draw')} N · {count('loss')} D
        </span>
      </span>
      <span className="fc-dots" aria-hidden="true">
        <i />
        <i />
      </span>
    </Tile>
  );
}
