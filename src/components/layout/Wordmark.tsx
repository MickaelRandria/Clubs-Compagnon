import { SHIELD_PATH } from '../../lib/shield';
import { FC } from '../../lib/tokens';

export function Wordmark() {
  return (
    <span className="fc-mark">
      <svg viewBox="0 0 96 106" width="36" height="40" aria-hidden="true">
        <path d={SHIELD_PATH} fill={FC.blue} stroke={FC.craie} strokeWidth="5" />
        <text
          x="48"
          y="76"
          textAnchor="middle"
          fill={FC.craie}
          fontFamily="'Barlow Condensed', sans-serif"
          fontWeight="800"
          fontStyle="italic"
          fontSize="58"
        >
          D
        </text>
      </svg>
      <span className="fc-mark-name">
        Dommage<span>BJ FC</span>
      </span>
    </span>
  );
}
