import { Gallery } from '../components/playoffs/Gallery';
import { NightHero } from '../components/playoffs/NightHero';
import { StoryBlock } from '../components/playoffs/StoryBlock';
import { StatTile } from '../components/ui/StatTile';
import { PLAYOFF_NIGHT } from '../content/playoffs';
import { usePageTitle } from '../lib/hooks';

export function PlayoffsView() {
  usePageTitle('Playoffs');
  const night = PLAYOFF_NIGHT;
  const stats: Array<[string, string]> = [
    ['Victoires', String(night.wins)],
    ['Défaites', String(night.losses)],
    ['Série', `Div. ${night.division}`],
    ['MVP', night.mvp],
  ];

  return (
    <div className="fc-view">
      <NightHero />
      <div className="fc-night-row">
        <div className="fc-night-stats">
          {stats.map(([label, value], i) => (
            <StatTile key={label} label={label} value={value} text={value.length > 3} delay={70 + i * 50} />
          ))}
        </div>
        <StoryBlock />
      </div>
      <Gallery />
    </div>
  );
}
