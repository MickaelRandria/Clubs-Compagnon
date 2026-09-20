import { FC } from '../../lib/tokens';

/**
 * Éclat qui déborde du tile principal : « bottom » vers le bloc du dessous,
 * « edge » / « side » vers le tile voisin de droite (en haut / à mi-hauteur).
 */
export function Spill({ at }: { at: 'bottom' | 'edge' | 'side' }) {
  if (at === 'bottom') {
    return (
      <svg className="fc-spill fc-spill--bottom" viewBox="0 0 120 44" aria-hidden="true">
        <polygon points="0,6 120,0 70,20 112,22 8,44" fill={FC.glacier} />
      </svg>
    );
  }
  return (
    <svg className={`fc-spill fc-spill--${at}`} viewBox="0 0 50 110" aria-hidden="true">
      <polygon points="28,0 50,4 32,46 44,44 6,110 20,58 4,62" fill={FC.craie} />
    </svg>
  );
}
