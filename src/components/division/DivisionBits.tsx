import { CHANCES } from '../../../shared/division-progress';
import { divisionLabel } from '../../../shared/division';
import type { MatchResult } from '../../../shared/types';

/** Jauge de la division : une case = 3 points, soit une victoire. `fresh` : points pris au dernier match, qui s'allument. */
export function DivisionGauge({ points, target, fresh = 0 }: { points: number; target: number; fresh?: number }) {
  const cells = Math.max(1, Math.ceil(target / 3));
  const before = points - fresh;
  return (
    <span className="fc-dv-gauge" role="img" aria-label={`${points} points sur ${target}`}
      style={{ gridTemplateColumns: `repeat(${cells}, minmax(0, 1fr))` }}>
      {Array.from({ length: cells }, (_, i) => {
        const size = Math.min(3, target - 3 * i);
        const fill = Math.min(1, Math.max(0, (points - 3 * i) / size));
        const isNew = fresh > 0 && points > 3 * i && before < 3 * i + size;
        const isNext = !isNew && fill < 1 && (i === 0 || points >= 3 * i);
        return (
          <span key={i} className={`fc-dv-seg${isNew ? ' is-new' : ''}${isNext ? ' is-next' : ''}`}>
            <i style={{ width: `${fill * 100}%` }} />
          </span>
        );
      })}
    </span>
  );
}

const SHIELD = 'M11 1 L21 5 V12 C21 19 16 23 11 25 C6 23 1 19 1 12 V5 Z';

/** Les 3 chances de la division en écussons : intacts en Glacier, perdus fissurés en rouge. */
export function ChanceShields({ chances, size = 20 }: { chances: number; size?: number }) {
  return (
    <span className="fc-dv-shields" role="img" aria-label={`${chances} chance${chances > 1 ? 's' : ''} sur ${CHANCES}`}>
      {Array.from({ length: CHANCES }, (_, i) => i < chances ? (
        <svg key={i} width={size} height={size * 1.18} viewBox="0 0 22 26" aria-hidden="true"><path d={SHIELD} fill="var(--fc-glacier)" /></svg>
      ) : (
        <svg key={i} width={size} height={size * 1.18} viewBox="0 0 22 26" aria-hidden="true" className="is-lost">
          <path d={SHIELD} fill="rgba(255,77,94,.08)" stroke="var(--fc-rouge)" strokeWidth="1.6" />
          <path d="M10 5 L13 11 L9 15 L12 21" fill="none" stroke="var(--fc-rouge)" strokeWidth="1.6" />
        </svg>
      ))}
    </span>
  );
}

const LETTER: Record<MatchResult, string> = { win: 'V', draw: 'N', loss: 'D' };

export function ResultChip({ result }: { result: MatchResult }) {
  return <span className={`fc-dv-chip fc-dv-chip--${result}`}>{LETTER[result]}</span>;
}

/** Division visée par une montée (numérotation EA : la suivante est la plus petite). */
export const nextDivisionLabel = (division: number) => divisionLabel(division - 1);

/** « 2 victoires », « 1 victoire ». */
export const winsLabel = (n: number) => `${n} victoire${n > 1 ? 's' : ''}`;

/** Série finale (Élite) : une case par victoire d'affilée exigée, les victoires déjà enchaînées allumées. */
export function SeriesPips({ streak, needed, size = 'md', locked = false }: { streak: number; needed: number; size?: 'md' | 'lg'; locked?: boolean }) {
  return (
    <span className={`fc-dv-series fc-dv-series--${size}`} role="img" aria-label={`${streak} victoire${streak > 1 ? 's' : ''} d'affilée sur ${needed}`}>
      {Array.from({ length: needed }, (_, i) => (
        <i key={i} className={i < streak ? 'is-on' : i === streak && !locked ? 'is-next' : ''}>{i < streak ? 'V' : i + 1}</i>
      ))}
    </span>
  );
}

/** Ce qu'il reste pour monter : points jusqu'au seuil, puis victoires d'affilée de la série finale. */
export function promotionGap(p: { target: number; points: number; streakNeeded: number; streak: number; seriesStarted: boolean }) {
  const points = Math.max(0, p.target - p.points);
  const seriesWins = p.streakNeeded > 0 ? p.streakNeeded - (p.seriesStarted ? p.streak : 0) : 0;
  return { points, seriesWins, fastestWins: Math.ceil(points / 3) + seriesWins };
}
