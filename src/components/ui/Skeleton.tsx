import type { CSSProperties } from 'react';

/** Squelette de chargement : chaque rangée = [fractions des colonnes, hauteur en px]. */
export function Skeleton({ rows }: { rows: Array<[number[], number]> }) {
  return (
    <div className="fc-skel" aria-busy="true" aria-label="Chargement">
      {rows.map(([fractions, height], i) => (
        <div
          key={i}
          className="fc-skel-row"
          style={{ '--cols': fractions.map((f) => `minmax(0, ${f}fr)`).join(' ') } as CSSProperties}
        >
          {fractions.map((_, j) => (
            <div key={j} className="fc-skel-cell" style={{ height }} />
          ))}
        </div>
      ))}
    </div>
  );
}
