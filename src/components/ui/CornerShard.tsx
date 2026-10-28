import { FC } from '../../lib/tokens';

/** Bande en biais discrète dans l'angle des tiles. */
export function CornerShard() {
  return (
    <svg className="fc-corner" viewBox="0 0 48 56" aria-hidden="true">
      <polygon points="30,0 48,0 48,8 22,56 4,56" fill={FC.craie} opacity=".06" />
    </svg>
  );
}
