import { useClub, useMatches } from '../api/queries';
import { AveragesTile } from '../components/stats/AveragesTile';
import { CareerTile } from '../components/stats/CareerTile';
import { GoalsChart } from '../components/stats/GoalsChart';
import { DataGate } from '../components/ui/DataGate';
import { Skeleton } from '../components/ui/Skeleton';
import { StatTile } from '../components/ui/StatTile';
import { usePageTitle } from '../lib/hooks';

export function StatsView() {
  usePageTitle('Stats');
  const club = useClub();
  const matches = useMatches();

  return (
    <DataGate
      queries={[club, matches]}
      skeleton={<Skeleton rows={[[[1.55, 1], 380], [[1], 340], [[1, 1, 1, 1], 148]]} />}
    >
      {() => {
        const c = club.data!;
        return (
          <div className="fc-view">
            <div className="fc-stats-top">
              <CareerTile club={c} />
              <AveragesTile club={c} />
            </div>

            <GoalsChart matches={matches.data!} />

            <div className="fc-stats-bottom">
              <StatTile label="Ligue" value={c.leagueApps} sub="apparitions" delay={200} />
              <StatTile label="Playoff" value={c.playoffApps} sub="apparitions" delay={250} />
              <StatTile label="Meilleure div." value={c.bestDivision === null ? '—' : `Div. ${c.bestDivision}`} text delay={300} />
              <StatTile label="Réputation" value={c.reputation} text delay={350} />
            </div>
          </div>
        );
      }}
    </DataGate>
  );
}
