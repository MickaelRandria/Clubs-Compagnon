import type { MatchPlayer } from '../../../shared/types';
import { frNum } from '../../lib/format';

interface Totals { shots: number; passPct: number | null; tacklePct: number | null; rating: number | null; saves: number; red: number }

const ratio = (made: number, attempts: number) => (attempts > 0 ? Math.round((made / attempts) * 100) : null);
const sum = (players: MatchPlayer[], key: keyof MatchPlayer) => players.reduce((total, p) => total + Number(p[key]), 0);

function totals(players: MatchPlayer[]): Totals {
  return {
    shots: sum(players, 'shots'),
    passPct: ratio(sum(players, 'passesMade'), sum(players, 'passAttempts')),
    tacklePct: ratio(sum(players, 'tacklesMade'), sum(players, 'tackleAttempts')),
    rating: players.length > 0 ? sum(players, 'rating') / players.length : null,
    saves: sum(players, 'saves'),
    red: sum(players, 'redCards'),
  };
}

const ROWS: [label: string, value: (t: Totals) => number | null, format: (n: number) => string][] = [
  ['Tirs', (t) => t.shots, String],
  ['Passes réussies', (t) => t.passPct, (n) => `${n}%`],
  ['Tacles réussis', (t) => t.tacklePct, (n) => `${n}%`],
  ['Note moyenne', (t) => t.rating, (n) => frNum(n, 1)],
  ['Arrêts', (t) => t.saves, String],
  ['Cartons rouges', (t) => t.red, String],
];

/** Duel « Nous contre eux » : les totaux des deux feuilles de match EA, ligne à ligne. */
export function MatchDuel({ ours, theirs, opponent }: { ours: MatchPlayer[]; theirs: MatchPlayer[]; opponent: string }) {
  if (ours.length === 0 || theirs.length === 0) return null;
  const a = totals(ours);
  const b = totals(theirs);
  return (
    <section className="fc-block fc-marine fc-versus" aria-labelledby="fc-versus-title">
      <h2 id="fc-versus-title" className="fc-section-head">Nous contre eux <small>{ours.length} joueurs contre {theirs.length}</small></h2>
      <div className="fc-versus-legend"><span>FoodBall</span><span>{opponent}</span></div>
      {ROWS.map(([label, value, format]) => {
        const x = value(a);
        const y = value(b);
        const total = (x ?? 0) + (y ?? 0);
        return (
          <div key={label} className="fc-versus-row">
            <span className="fc-versus-label">{label}</span>
            <span className="fc-versus-num">{x === null ? '—' : format(x)}</span>
            <span className="fc-versus-bar" aria-hidden="true">
              <i style={{ flexGrow: total > 0 ? x ?? 0 : 1 }} />
              <i style={{ flexGrow: total > 0 ? y ?? 0 : 1 }} />
            </span>
            <span className="fc-versus-num">{y === null ? '—' : format(y)}</span>
          </div>
        );
      })}
    </section>
  );
}
