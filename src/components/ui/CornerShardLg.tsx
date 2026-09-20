import { FC } from '../../lib/tokens';

/** Grand éclat d'angle des blocs Marine. */
export function CornerShardLg() {
  return (
    <svg className="fc-corner-lg" viewBox="0 0 110 130" aria-hidden="true">
      <polygon points="110,0 26,0 110,96" fill={FC.blue} />
      <polygon points="98,0 112,0 50,130 36,130" fill={FC.glacier} opacity=".6" />
    </svg>
  );
}
