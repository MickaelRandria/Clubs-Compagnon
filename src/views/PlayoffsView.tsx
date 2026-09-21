import { Gallery } from '../components/playoffs/Gallery';
import { NightHero } from '../components/playoffs/NightHero';
import { StoryBlock } from '../components/playoffs/StoryBlock';
import { StatTile } from '../components/ui/StatTile';
import { PLAYOFF_NIGHT } from '../content/playoffs';
import { usePageTitle } from '../lib/hooks';

export function PlayoffsView() {
  usePageTitle('Playoffs');
  const night = PLAYOFF_NIGHT;
  // L'histoire de la nuit, c'est le bilan. Victoires et défaites étaient deux boîtes
  // identiques à côté de la division et du MVP : quatre faits au même niveau, dont aucun
  // ne ressortait. Elles sont réunies en une tuile principale, le reste passe derrière.
  const secondaires: Array<[string, string]> = [
    ['Série', `Div. ${night.division}`],
    ['MVP', night.mvp],
  ];

  return (
    <div className="fc-view">
      <NightHero />
      <div className="fc-night-row">
        <div className="fc-night-stats">
          <StatTile
            label="Bilan de la nuit"
            value={`${night.wins} – ${night.losses}`}
            sub={`${night.wins} victoires · ${night.losses === 1 ? '1 défaite' : `${night.losses} défaites`}`}
            tone="principal"
            delay={70}
          />
          {secondaires.map(([label, value], i) => (
            <StatTile key={label} label={label} value={value} text tone="discret" delay={120 + i * 50} />
          ))}
        </div>
        <StoryBlock />
      </div>
      <Gallery />
    </div>
  );
}
