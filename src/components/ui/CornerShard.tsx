import { FC } from '../../lib/tokens';

/** Petit éclat d'angle des tiles clairs. */
export function CornerShard() {
  return (
    <svg className="fc-corner" viewBox="0 0 48 56" aria-hidden="true">
      <polygon points="48,0 6,0 48,40" fill={FC.glacier} opacity=".55" />
      <polygon points="48,46 26,24 38,56 48,56" fill={FC.blue} />
    </svg>
  );
}
