import { useNavigate, useParams } from 'react-router';
import { ApiError } from '../api/client';
import { useMatchDetail, useMembers } from '../api/queries';
import { MatchCoachDebrief } from '../components/matches/MatchCoachDebrief';
import { MatchDuel } from '../components/matches/MatchDuel';
import { MatchLineup } from '../components/matches/MatchLineup';
import { MatchSheet } from '../components/matches/MatchSheet';
import { NoteForm } from '../components/matches/NoteForm';
import { NoteList } from '../components/matches/NoteList';
import { DataGate } from '../components/ui/DataGate';
import { Glyph } from '../components/ui/Glyph';
import { NotFoundBlock } from '../components/ui/NotFoundBlock';
import { Skeleton } from '../components/ui/Skeleton';
import { usePageTitle } from '../lib/hooks';

export function MatchDetailView() {
  const navigate = useNavigate();
  const matchId = Number(useParams().id);
  const detail = useMatchDetail(matchId);
  const members = useMembers();
  usePageTitle(detail.data ? `vs ${detail.data.match.opponent}` : 'Match');

  const handleBack = () => {
    if (window.history.length > 1) {
      navigate(-1);
    } else {
      navigate('/matchs');
    }
  };

  const unknown =
    !Number.isInteger(matchId) || matchId <= 0 || (detail.error instanceof ApiError && detail.error.status === 404);
  if (unknown) {
    return (
      <NotFoundBlock
        title="Match introuvable"
        text="Ce match n'existe pas ou n'est plus en base."
        to="/matchs"
        cta="Retour aux matchs"
      />
    );
  }

  return (
    <div className="fc-view">
      <button type="button" onClick={handleBack} className="fc-back">
        <Glyph name="back" /> Retour
      </button>
      <DataGate queries={[detail, members]} skeleton={<Skeleton rows={[[[1.55, 1], 300], [[1.55, 1], 260]]} />}>
        {() => {
          const { match, players, notes, opponent } = detail.data!;
          return (
            <div className="fc-detail">
              <MatchSheet match={match} minutes={opponent?.minutes ?? null} />
              <MatchDuel ours={players ?? []} theirs={opponent?.players ?? []} opponent={match.opponent} />
              <div className="fc-lineups">
                <MatchLineup players={players ?? []} />
                <MatchLineup players={opponent?.players ?? []} title={match.opponent} id="fc-lineup-opponent" />
              </div>
              <MatchCoachDebrief matchId={matchId} />
              <NoteForm matchId={matchId} members={members.data!} />
              <NoteList notes={notes} />
            </div>
          );
        }}
      </DataGate>
    </div>
  );
}
