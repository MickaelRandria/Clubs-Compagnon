import type { ReactNode } from 'react';
import { CornerShard } from './CornerShard';

/** Petit tile de résumé clair (accent ponctuel). */
export function StatTile({
  label,
  value,
  sub,
  text = false,
  delay = 0,
}: {
  label: string;
  value: ReactNode;
  sub?: string;
  text?: boolean;
  delay?: number;
}) {
  return (
    <div className="fc-block fc-card fc-stat" style={{ animationDelay: `${delay}ms` }}>
      <CornerShard />
      <span className="fc-title fc-title--md">{label}</span>
      <span className={`fc-stat-value${text ? ' fc-stat-value--text' : ''}`}>{value}</span>
      {sub && <span className="fc-mention">{sub}</span>}
    </div>
  );
}
