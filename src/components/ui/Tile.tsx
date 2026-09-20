import type { ReactNode } from 'react';
import { Link } from 'react-router';

/** Tile cliquable du Dashboard : lien plein cadre, entrée en glissé décalé. */
export function Tile({ className, to, delay = 0, children }: { className: string; to: string; delay?: number; children: ReactNode }) {
  return (
    <Link to={to} className={`fc-tile ${className}`} style={{ animationDelay: `${delay}ms` }}>
      {children}
    </Link>
  );
}
