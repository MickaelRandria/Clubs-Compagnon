import { useEffect, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router';
import { ApiError } from '../api/client';
import { useMatchDetail, useMembers } from '../api/queries';
import { DivisionImpact } from '../components/division/DivisionImpact';
import { MatchCoachDebrief, WRITE_NOTE_EVENT } from '../components/matches/MatchCoachDebrief';
import { MatchDuel } from '../components/matches/MatchDuel';
import { MatchLineup } from '../components/matches/MatchLineup';
import { MatchSheet } from '../components/matches/MatchSheet';
import { NoteForm } from '../components/matches/NoteForm';
import { NoteList } from '../components/matches/NoteList';
import { OpponentCard } from '../components/matches/OpponentCard';
import { DataGate } from '../components/ui/DataGate';
import { Glyph } from '../components/ui/Glyph';
import { NotFoundBlock } from '../components/ui/NotFoundBlock';
import { Skeleton } from '../components/ui/Skeleton';
import { usePageTitle } from '../lib/hooks';

// Fiche match : l'essentiel en haut (score, débrief en story, impact division), puis le détail
// rangé en onglets au lieu de quatre écrans de défilement. L'onglet est dans l'adresse (?onglet=).
const TABS = [
  { id: 'notes', label: 'Notes' },
  { id: 'compos', label: 'Compos' },
  { id: 'adversaire', label: 'Adversaire' },
] as const;
type Tab = (typeof TABS)[number]['id'];

export function MatchDetailView() {
  const navigate = useNavigate();
  const matchId = Number(useParams().id);
  const detail = useMatchDetail(matchId);
  const members = useMembers();
  const [params, setParams] = useSearchParams();
  const tab: Tab = TABS.find((t) => t.id === params.get('onglet'))?.id ?? 'notes';
  const [writing, setWriting] = useState(false);
  const [side, setSide] = useState<'ours' | 'theirs'>('ours');
  usePageTitle(detail.data ? `vs ${detail.data.match.opponent}` : 'Match');

  const showTab = (id: Tab) => setParams((p) => { const next = new URLSearchParams(p); if (id === 'notes') next.delete('onglet'); else next.set('onglet', id); return next; }, { replace: true });

  // « Écrire la note du match » depuis la story : onglet Notes, formulaire ouvert.
  useEffect(() => {
    const open = () => {
      showTab('notes');
      setWriting(true);
      window.setTimeout(() => document.getElementById('note-form-title')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 60);
    };
    window.addEventListener(WRITE_NOTE_EVENT, open);
    return () => window.removeEventListener(WRITE_NOTE_EVENT, open);
  });

  const handleBack = () => {
    if (window.history.length > 1) navigate(-1);
    else navigate('/matchs');
  };

  const unknown =
    !Number.isInteger(matchId) || matchId <= 0 || (detail.error instanceof ApiError && detail.error.status === 404);
  if (unknown) {
    return <NotFoundBlock title="Match introuvable" text="Ce match n'existe pas ou n'est plus en base." to="/matchs" cta="Retour aux matchs" />;
  }

  return (
    <div className="fc-view">
      <button type="button" onClick={handleBack} className="fc-back">
        <Glyph name="back" /> Retour
      </button>
      <DataGate queries={[detail, members]} skeleton={<Skeleton rows={[[[1], 300], [[1], 120]]} />}>
        {() => {
          const { match, players, notes, opponent } = detail.data!;
          const counts: Partial<Record<Tab, number>> = { notes: notes.length };
          return (
            <div className="fc-detail fc-detail--tabs">
              <MatchSheet match={match} minutes={opponent?.minutes ?? null} />
              <MatchCoachDebrief match={match} players={players ?? []} />
              <DivisionImpact matchId={match.id} />

              <nav className="fc-tabs fc-tabs--sm fc-detail-tabs" aria-label="Détail du match">
                {TABS.map((t) => (
                  <button key={t.id} type="button" className="fc-tab" aria-pressed={t.id === tab} onClick={() => showTab(t.id)}>
                    {t.label}{counts[t.id] ? <span className="fc-tab-count">{counts[t.id]}</span> : null}
                  </button>
                ))}
              </nav>

              <div className="fc-detail-panel">
                {tab === 'notes' && (
                  <>
                    {writing ? (
                      <NoteForm matchId={matchId} members={members.data!} />
                    ) : (
                      <button type="button" className="fc-cta fc-detail-write" onClick={() => setWriting(true)}>
                        <span aria-hidden="true">+</span> Ajouter une note
                      </button>
                    )}
                    <NoteList notes={notes} />
                  </>
                )}
                {tab === 'compos' && (
                  <>
                    <MatchDuel ours={players ?? []} theirs={opponent?.players ?? []} opponent={match.opponent} color={opponent?.kitColor} />
                    {(opponent?.players.length ?? 0) > 0 && (
                      <div className="fc-tabs fc-tabs--sm fc-lineup-switch" role="group" aria-label="Feuille de match affichée">
                        <button type="button" className="fc-tab" aria-pressed={side === 'ours'} onClick={() => setSide('ours')}>FoodBall Club</button>
                        <button type="button" className="fc-tab" aria-pressed={side === 'theirs'} onClick={() => setSide('theirs')}>{match.opponent}</button>
                      </div>
                    )}
                    <div className="fc-lineups">
                      {side === 'ours' || !opponent?.players.length
                        ? <MatchLineup players={players ?? []} />
                        : <MatchLineup players={opponent.players} title={match.opponent} id="fc-lineup-opponent" />}
                    </div>
                  </>
                )}
                {tab === 'adversaire' && <OpponentCard detail={detail.data!} />}
              </div>
            </div>
          );
        }}
      </DataGate>
    </div>
  );
}
