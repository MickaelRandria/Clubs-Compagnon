import { FC } from '../../lib/tokens';

/** Éclats du tile principal (Bleu Dommage) : deux bandes en biais, comme la tuile active de FIFA 17. */
export function HeroShards() {
  return (
    <svg viewBox="0 0 400 420" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
      <polygon points="250,0 300,0 180,420 130,420" fill={FC.abysse} opacity=".24" />
      <polygon points="322,0 334,0 214,420 202,420" fill={FC.abysse} opacity=".16" />
    </svg>
  );
}
