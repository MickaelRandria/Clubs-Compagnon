import { useId } from 'react';
import { UI_IMAGES } from '../../../shared/data/archetypes';

/**
 * Coup de pinceau du fond, en deux résolutions.
 *
 * La source fait 1024 px pour 226 Ko, alors que le motif est affiché à 289 px de large
 * sur un téléphone. Un `srcset` ne suffirait pas : à partir de DPR 2 le navigateur
 * choisirait quand même la grande, et il aurait arithmétiquement raison. On tranche
 * donc explicitement par media query — un décor flou à 30-55 % d'opacité n'a pas besoin
 * de la densité d'un écran Retina.
 */
function Brush({ place }: { place: 'top' | 'bottom' }) {
  const bas = place === 'bottom';
  return <picture>
    <source media="(max-width: 767px)" srcSet={UI_IMAGES.fifaPatternSmall} />
    <img className={`fc27-backdrop-brush fc27-backdrop-brush--${place}`} src={UI_IMAGES.fifaPattern}
      alt="" width={1024} height={1024} decoding="async" {...(bas ? { loading: 'lazy' as const } : {})} />
  </picture>;
}

/** Fond de l'onglet FC 27 : bleu nuit béton, coups de pinceau, trames et projections asymétriques (couvre le mur global). */
export function FC27Backdrop() {
  const id = useId();
  return <div className="fc27-backdrop" aria-hidden="true">
    <svg viewBox="0 0 1440 900" preserveAspectRatio="xMidYMid slice">
      <defs>
        <radialGradient id={`${id}-glow`} cx=".62" cy=".2" r=".8">
          <stop offset="0" stopColor="#12245A" />
          <stop offset=".55" stopColor="#0A1433" />
          <stop offset="1" stopColor="#050A1C" />
        </radialGradient>
        <pattern id={`${id}-dots`} width="10" height="10" patternUnits="userSpaceOnUse">
          <circle cx="5" cy="5" r="2" fill="#6FC8FF" />
        </pattern>
        <pattern id={`${id}-hatch`} width="14" height="14" patternUnits="userSpaceOnUse" patternTransform="rotate(-32)">
          <rect width="4" height="14" fill="#F2F4F8" />
        </pattern>
        <filter id={`${id}-concrete`}>
          <feTurbulence type="fractalNoise" baseFrequency=".75" numOctaves="3" stitchTiles="stitch" />
          <feColorMatrix values="0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  0 0 0 .6 0" />
        </filter>
      </defs>
      <rect width="1440" height="900" fill={`url(#${id}-glow)`} />
      {/* Projections : grands aplats biais qui traversent l'écran */}
      <polygon points="880,0 1180,0 700,900 400,900" fill="#1846F5" opacity=".13" />
      <polygon points="1220,0 1290,0 810,900 740,900" fill="#6FC8FF" opacity=".08" />
      <polygon points="-60,610 520,380 560,440 -60,760" fill="#1846F5" opacity=".2" />
      {/* Trames géométriques */}
      <polygon points="1440,520 1060,900 1440,900" fill={`url(#${id}-dots)`} opacity=".22" />
      <polygon points="0,0 360,0 0,260" fill={`url(#${id}-dots)`} opacity=".14" />
      <polygon points="1440,90 1270,330 1440,330" fill={`url(#${id}-hatch)`} opacity=".06" />
      {/* Éclats bruts, volontairement en retrait : même raison que le mur global. */}
      <g opacity=".45">
        <polygon points="-30,300 190,240 110,318 240,306 30,452 132,440 -30,540" fill="#1846F5" />
        <polygon points="-30,420 160,378 58,462 150,466 -30,590" fill="#FF4FA3" opacity=".85" />
        <polygon points="1470,610 1300,690 1380,700 1260,800 1470,770" fill="#6FC8FF" opacity=".75" />
      </g>
      <rect width="1440" height="900" filter={`url(#${id}-concrete)`} opacity=".07" />
    </svg>
    <Brush place="top" />
    <Brush place="bottom" />
  </div>;
}

/** Visuel de la tuile « Un club. Un nom. » : tribunes de supporters sous les projecteurs, découpées en diagonale. */
export function StadiumCrowd() {
  const id = useId();
  // Trois tribunes en perspective : chaque rang de supporters est une frise de silhouettes (tête + épaules).
  const tiers = [
    { y: 188, rows: 4, scale: .72, shade: '#1B3A8F' },
    { y: 292, rows: 4, scale: .9, shade: '#16307A' },
    { y: 410, rows: 5, scale: 1.1, shade: '#10265F' },
  ];
  return <svg className="fc27-stadium" viewBox="0 0 520 620" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
    <defs>
      <linearGradient id={`${id}-sky`} x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor="#020617" />
        <stop offset=".45" stopColor="#0A1A4A" />
        <stop offset="1" stopColor="#081233" />
      </linearGradient>
      <radialGradient id={`${id}-flood`} cx=".5" cy=".5" r=".5">
        <stop offset="0" stopColor="#FFFFFF" />
        <stop offset=".18" stopColor="#CFE9FF" stopOpacity=".95" />
        <stop offset="1" stopColor="#6FC8FF" stopOpacity="0" />
      </radialGradient>
      <linearGradient id={`${id}-beam`} x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor="#DDF1FF" stopOpacity=".5" />
        <stop offset="1" stopColor="#6FC8FF" stopOpacity="0" />
      </linearGradient>
      {tiers.map((tier, index) => (
        <pattern key={index} id={`${id}-fans-${index}`} width={26 * tier.scale} height={26 * tier.scale} patternUnits="userSpaceOnUse" patternTransform={`translate(${index * 9} 0)`}>
          <circle cx={13 * tier.scale} cy={8 * tier.scale} r={4.6 * tier.scale} fill={tier.shade} />
          <path d={`M${3 * tier.scale} ${26 * tier.scale} Q${3 * tier.scale} ${14 * tier.scale} ${13 * tier.scale} ${14 * tier.scale} Q${23 * tier.scale} ${14 * tier.scale} ${23 * tier.scale} ${26 * tier.scale}Z`} fill={tier.shade} />
          <circle cx={13 * tier.scale} cy={8 * tier.scale} r={4.6 * tier.scale} fill="#6FC8FF" opacity=".16" />
        </pattern>
      ))}
      <pattern id={`${id}-halftone`} width="9" height="9" patternUnits="userSpaceOnUse">
        <circle cx="4.5" cy="4.5" r="1.7" fill="#F2F4F8" />
      </pattern>
    </defs>
    <rect width="520" height="620" fill={`url(#${id}-sky)`} />
    {/* Faisceaux des projecteurs */}
    <polygon points="92,58 124,58 300,620 -40,620" fill={`url(#${id}-beam)`} opacity=".35" />
    <polygon points="420,40 452,40 580,620 250,620" fill={`url(#${id}-beam)`} opacity=".3" />
    {/* Toit et tribunes */}
    <polygon points="0,150 520,112 520,136 0,176" fill="#030817" />
    {tiers.map((tier, index) => {
      const height = tier.rows * 26 * tier.scale;
      return <g key={index}>
        <rect x="0" y={tier.y} width="520" height={height} fill="#081538" />
        <rect x="0" y={tier.y} width="520" height={height} fill={`url(#${id}-fans-${index})`} />
        <rect x="0" y={tier.y + height} width="520" height="7" fill="#1846F5" opacity=".8" />
      </g>;
    })}
    {/* Écharpes et tifos : quelques touches claires */}
    <rect x="46" y="300" width="84" height="9" fill="#F2F4F8" opacity=".85" transform="rotate(-6 88 304)" />
    <rect x="268" y="420" width="120" height="10" fill="#FF4FA3" opacity=".8" transform="rotate(5 328 425)" />
    <rect x="360" y="196" width="70" height="8" fill="#6FC8FF" opacity=".75" transform="rotate(-4 395 200)" />
    <rect x="0" y="560" width="520" height="60" fill="#050B1F" />
    {/* Trame demi-teinte et projecteurs */}
    <polygon points="520,300 520,620 240,620" fill={`url(#${id}-halftone)`} opacity=".12" />
    <circle cx="108" cy="58" r="58" fill={`url(#${id}-flood)`} />
    <circle cx="436" cy="40" r="66" fill={`url(#${id}-flood)`} />
  </svg>;
}
