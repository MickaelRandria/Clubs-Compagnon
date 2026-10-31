import { useClub, useMatches, useMembers } from '../api/queries';
import { BetsLiveBanner } from '../components/bets/BetsLiveBanner';
import { LastMatchTile } from '../components/home/LastMatchTile';
import { LobbyMusic } from '../components/home/LobbyMusic';
import { MotmTile } from '../components/home/MotmTile';
import { NextNightTile } from '../components/home/NextNightTile';
import { RecapsTile } from '../components/home/RecapsTile';
import { RankTile } from '../components/home/RankTile';
import { StreakTile } from '../components/home/StreakTile';
import { DataGate } from '../components/ui/DataGate';
import { Skeleton } from '../components/ui/Skeleton';
import { usePageTitle } from '../lib/hooks';

/** Accueil « où on en est » : série en cours, dernier match, classement, hommes du match, prochaine nuit. */
export function HomeView() {
  usePageTitle();
  const club = useClub();
  const members = useMembers();
  const matches = useMatches();

  return (
    <DataGate
      queries={[club, members, matches]}
      skeleton={<Skeleton rows={[[[1.55, 1], 300], [[1, 1, 1], 150]]} />}
    >
      {() => (
        <div className="fc-grid">
          <LobbyMusic />
          <BetsLiveBanner />
          <RecapsTile />
          <div className="fc-row fc-row--top">
            <StreakTile club={club.data!} last={matches.data![0]} />
            <LastMatchTile match={matches.data![0]} />
          </div>
          <div className="fc-row fc-row--bottom">
            <RankTile club={club.data!} />
            <MotmTile members={members.data!} />
            <NextNightTile />
          </div>
        </div>
      )}
    </DataGate>
  );
}
