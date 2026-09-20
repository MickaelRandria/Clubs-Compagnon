import { FC } from '../../lib/tokens';

/** Éclats du tile principal (Bleu Dommage), réutilisés sur chaque vue. */
export function HeroShards() {
  return (
    <svg viewBox="0 0 400 420" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
      <defs>
        <pattern id="fc-dots" width="10" height="10" patternUnits="userSpaceOnUse">
          <circle cx="5" cy="5" r="2.1" fill={FC.marine} />
        </pattern>
      </defs>
      <polygon points="70,0 400,0 400,420 250,420 215,300 160,318 140,170 60,188" fill={FC.marine} opacity=".32" />
      <polygon points="250,230 400,190 400,420 290,420" fill="url(#fc-dots)" opacity=".5" />
      <polygon points="150,-10 250,-10 205,110 290,96 175,330 200,170 120,188" fill={FC.glacier} />
      <polygon points="320,20 430,-10 350,160 400,150 270,380 315,200 270,212" fill={FC.craie} />
      <polygon points="20,330 110,300 75,360 130,350 10,440" fill={FC.craie} opacity=".85" />
    </svg>
  );
}
