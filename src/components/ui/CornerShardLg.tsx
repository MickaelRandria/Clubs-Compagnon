import { FC } from '../../lib/tokens';

/** Grande bande en biais des blocs Marine. */
export function CornerShardLg() {
  return (
    <svg className="fc-corner-lg" viewBox="0 0 110 130" aria-hidden="true">
      <polygon points="72,0 110,0 110,20 60,130 22,130" fill={FC.craie} opacity=".05" />
      <polygon points="104,0 112,0 54,130 46,130" fill={FC.blue} opacity=".7" />
    </svg>
  );
}
