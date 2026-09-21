import type { ReactNode } from 'react';
import { CornerShard } from './CornerShard';

/**
 * Tuile de résumé, en trois niveaux.
 *
 * Toutes les tuiles avaient le même poids : une rangée de quatre boîtes identiques
 * laissait l'œil décider seul de ce qui comptait. Le ton donne maintenant une échelle —
 * une seule tuile porte l'information principale, les autres se rangent derrière.
 *
 * - `principal` : aplat bleu, chiffre au maximum. Une par rangée, pas deux.
 * - défaut : fond clair, chiffre large. Le régime normal.
 * - `discret` : fond sourd, chiffre réduit. Pour ce qui qualifie sans être l'essentiel.
 */
export function StatTile({
  label,
  value,
  sub,
  text = false,
  tone,
  delay = 0,
}: {
  label: string;
  value: ReactNode;
  sub?: string;
  text?: boolean;
  tone?: 'principal' | 'discret';
  delay?: number;
}) {
  return (
    <div
      className={`fc-block fc-card fc-stat${tone ? ` fc-stat--${tone}` : ''}`}
      style={{ animationDelay: `${delay}ms` }}
    >
      <CornerShard />
      <span className="fc-title fc-title--md">{label}</span>
      <span className={`fc-stat-value${text ? ' fc-stat-value--text' : ''}`}>{value}</span>
      {sub && <span className="fc-mention">{sub}</span>}
    </div>
  );
}
