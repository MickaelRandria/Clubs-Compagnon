import { useClub, useMatches, useMembers } from '../api/queries';
import { FormTile } from '../components/home/FormTile';
import { HeroTile } from '../components/home/HeroTile';
import { InhouseTile } from '../components/home/InhouseTile';
import { LastMatchTile } from '../components/home/LastMatchTile';
import { TopScorerTile } from '../components/home/TopScorerTile';
import { DataGate } from '../components/ui/DataGate';
import { Skeleton } from '../components/ui/Skeleton';
import { usePageTitle } from '../lib/hooks';

/** Grille FIFA 20 : [A grand | B large] / [C | D | E étroit]. */
export function HomeView() {
  usePageTitle();
  const club = useClub();
  const members = useMembers();
  const matches = useMatches();

  return (
    <DataGate
      queries={[club, members, matches]}
      skeleton={<Skeleton rows={[[[1.55, 1], 420], [[1, 1, 0.58], 196]]} />}
    >
      {() => (
        <div className="fc-grid">
          <div className="fc-row fc-row--top">
            <HeroTile club={club.data!} />
            <InhouseTile />
          </div>
          <div className="fc-row fc-row--bottom">
            <LastMatchTile match={matches.data![0]} />
            <TopScorerTile members={members.data!} />
            <FormTile matches={matches.data!} />
          </div>
        </div>
      )}
    </DataGate>
  );
}
