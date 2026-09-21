import { FC } from '../../lib/tokens';

/** Fond de page : éclats peints sur le mur (comme la capture FIFA 20). */
export function Wall() {
  return (
    <div className="fc-wall" aria-hidden="true">
      <svg viewBox="0 0 1440 900" preserveAspectRatio="xMidYMid slice">
        <defs>
          <radialGradient id="fc-glow" cx=".35" cy=".3" r=".75">
            <stop offset="0" stopColor="#13275E" />
            <stop offset="1" stopColor={FC.abysse} />
          </radialGradient>
          <pattern id="fc-wall-dots" width="12" height="12" patternUnits="userSpaceOnUse">
            <circle cx="6" cy="6" r="2.4" fill={FC.glacier} />
          </pattern>
          <filter id="fc-grain">
            <feTurbulence type="fractalNoise" baseFrequency=".85" numOctaves="2" stitchTiles="stitch" />
            <feColorMatrix values="0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  0 0 0 .55 0" />
          </filter>
        </defs>
        <rect width="1440" height="900" fill="url(#fc-glow)" />
        {/*
          Les éclats restent, mais en retrait. À pleine opacité ils occupaient les marges
          avec le même contraste que les tuiles : sur un écran large, l'œil ne savait plus
          où se poser en premier. Ce sont un décor de mur, pas du contenu — ils se lisent
          comme une texture et laissent la hiérarchie aux tuiles.
        */}
        <g opacity=".42">
          <polygon points="-40,300 210,250 120,330 260,320 40,470 150,450 -40,560" fill={FC.blue} />
          <polygon points="-40,420 180,380 60,470 170,470 -40,610" fill={FC.glacier} opacity=".85" />
          <polygon points="-20,520 120,500 30,560 110,565 -40,640" fill={FC.craie} opacity=".9" />
          <polygon points="0,640 150,600 150,700 0,740" fill="url(#fc-wall-dots)" opacity=".35" />
          <polygon points="1480,-20 1250,40 1360,70 1200,160 1480,120" fill={FC.blue} />
          <polygon points="1480,60 1320,130 1400,140 1290,220 1480,190" fill={FC.glacier} opacity=".7" />
          <polygon points="1480,760 1330,820 1400,830 1300,920 1480,920" fill={FC.blue} opacity=".8" />
        </g>
        <rect width="1440" height="900" filter="url(#fc-grain)" opacity=".05" />
      </svg>
    </div>
  );
}
