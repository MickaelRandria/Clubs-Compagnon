import { useState, type FormEvent } from 'react';
import { Link, useSearchParams } from 'react-router';
import type { FC27Proposal, FC27State } from '../../shared/fc27';
import { useFC27, useFC27Action } from '../api/fc27';
import { ActionFeedback, FC27Dialog } from '../components/fc27/FC27Dialog';
import { FC27Settings } from '../components/fc27/FC27Settings';
import { usePageTitle } from '../lib/hooks';
import '../styles/fc27-naming.css';

function ClubCrest({ className = '' }: { className?: string }) {
  return <svg className={className} viewBox="0 0 100 118" fill="none" aria-hidden="true">
    <path d="M50 4 94 20v43c0 24-26 42-44 51C32 105 6 87 6 63V20Z" fill="currentColor" fillOpacity=".06" stroke="currentColor" strokeWidth="1.5" />
    <path d="m50 12 36 13v38c0 18-20 34-36 43-16-9-36-25-36-43V25Z" stroke="currentColor" strokeOpacity=".4" />
    <path d="m20 72 60-36v14L20 86Z" fill="currentColor" fillOpacity=".12" />
    <text x="50" y="74" textAnchor="middle" fill="currentColor" fontFamily="Barlow Condensed, Arial Narrow, sans-serif" fontSize="44" fontWeight="800" fontStyle="italic">27</text>
    <path d="m50 20 2 5 5 .4-4 3 1.4 5-4.4-3-4.4 3 1.4-5-4-3 5-.4Z" fill="currentColor" />
  </svg>;
}

function NameCard({ proposal, number, winner = false }: { proposal: FC27Proposal; number: number; winner?: boolean }) {
  return <div className={`name-card${winner ? ' name-card--winner' : ''}`}>
    <div className="name-card-surface">
      <div className="name-card-top"><span className="name-card-score"><strong>{proposal.votes}</strong><small>vote{proposal.votes > 1 ? 's' : ''}</small></span><span className="name-card-edition">FC<span>27</span></span></div>
      <ClubCrest className="name-card-crest" />
      <span className="name-card-category">{winner ? '★ Le nom du collectif' : 'Identité du club'}</span>
      <h3>{proposal.club_name}</h3>
      <div className="name-card-author"><span>Proposé par</span><strong><bdi>{proposal.author_pseudo}</bdi></strong></div>
      <div className="name-card-bottom"><span>DOMMAGE · NOUVELLE ÈRE</span><span>{String(number).padStart(2, '0')}</span></div>
    </div>
  </div>;
}

function ProposalDialog({ state, onClose }: { state: FC27State; onClose: () => void }) {
  const mutation = useFC27Action();
  const [pseudo, setPseudo] = useState('');
  const [name, setName] = useState('');
  function submit(event: FormEvent) {
    event.preventDefault();
    mutation.mutate({ action: 'propose', campaignId: state.campaign.id, pseudo, name }, { onSuccess: onClose });
  }
  return <FC27Dialog title="Le prochain nom, c’est le tien ?" onClose={onClose}>
    <p className="fc27-muted">Une idée, une carte. Propose autant de noms que tu veux.</p>
    <form className="fc27-form" onSubmit={submit}>
      <label>Ton pseudo<input required autoFocus maxLength={40} autoComplete="off" value={pseudo} onChange={(e) => setPseudo(e.target.value)} /></label>
      <label>Nom du club proposé<input required maxLength={60} placeholder="Un nom qui résonne dans le stade" value={name} onChange={(e) => setName(e.target.value)} /></label>
      <ActionFeedback error={mutation.error} />
      <button className="fc27-button" disabled={mutation.isPending || !pseudo.trim() || !name.trim()}>{mutation.isPending ? 'Création de la carte…' : 'Ajouter ma proposition ↗'}</button>
    </form>
  </FC27Dialog>;
}

function Arena({ state }: { state: FC27State }) {
  const [dialog, setDialog] = useState<'propose' | 'settings' | null>(null);
  const [selected, setSelected] = useState<number | null>(null);
  const [pseudo, setPseudo] = useState('');
  const mutation = useFC27Action();
  const phase = state.election.phase;
  const active = state.campaign.status === 'preparation';
  const canVote = active && phase === 'voting';
  const canPropose = active && phase === 'proposing';
  const total = state.proposals.reduce((sum, p) => sum + p.votes, 0);
  const proposals = phase === 'closed' || phase === 'cancelled' ? [...state.proposals].sort((a, b) => b.votes - a.votes || a.id - b.id) : state.proposals;
  const selectedProposal = proposals.find((p) => p.id === selected);
  const phaseLabel = phase === 'proposing' ? 'Propositions ouvertes' : phase === 'voting' ? 'Le vote est ouvert' : phase === 'closed' ? 'Le collectif a choisi' : 'Préparation archivée';
  function vote(event: FormEvent) {
    event.preventDefault();
    if (!selectedProposal || !canVote) return;
    mutation.mutate({ action: 'vote', campaignId: state.campaign.id, proposalId: selectedProposal.id, pseudo }, { onSuccess: () => { setPseudo(''); setSelected(null); } });
  }
  return <div className={`naming-arena${canVote ? ' naming-arena--voting' : ''}${state.winner ? ' naming-arena--result' : ''}`}>
    <div className="arena-stadium" aria-hidden="true"><div className="arena-beam arena-beam--left" /><div className="arena-beam arena-beam--right" /><div className="arena-floodlights arena-floodlights--left" /><div className="arena-floodlights arena-floodlights--right" /><div className="arena-stands" /><div className="arena-pitch" /></div>
    <header className="arena-header">
      <Link className="arena-back" to={`/fc27?campagne=${state.campaign.id}`}><span aria-hidden="true">←</span> Retour à FC 27</Link>
      <div className="arena-wordmark">DOMMAGE<span>LE PROCHAIN CHAPITRE</span></div>
      <button className="arena-settings" onClick={() => setDialog('settings')}>Réglages FC 27 <span aria-hidden="true">↗</span></button>
    </header>
    <main className="arena-main">
      <nav className="arena-phases" aria-label="Étapes du choix du nom">
        {(['proposing', 'voting', 'closed'] as const).map((step, index) => <span key={step} aria-current={phase === step ? 'step' : undefined}><b>{String(index + 1).padStart(2, '0')}</b>{['Les idées', 'Le vote', 'Le verdict'][index]}</span>)}
      </nav>
      <section className={`arena-intro${state.winner ? ' arena-intro--winner' : ''}`} aria-labelledby="arena-title">
        <div className="arena-intro-copy"><p className="arena-kicker"><span /> {phaseLabel}</p>
          <h1 id="arena-title">{state.winner ? <><span className="arena-winner-pretitle">Notre nom pour FC 27</span>{state.winner.club_name}<em>Une nouvelle ère.</em></> : phase === 'cancelled' ? <>Les noms de<br /><em>notre histoire.</em></> : <>Un club.<br />Un nom.<br /><em>Notre choix.</em></>}</h1>
          <p className="arena-description">{state.winner ? `Proposé par ${state.winner.author_pseudo}. Porté par ${state.winner.votes} voix sur ${total}. Le prochain chapitre peut commencer.` : canPropose ? 'Avant le premier coup de sifflet, écrivons notre identité. Le prochain nom du club commence avec ton idée.' : canVote ? 'Un pseudo. Une voix. Choisis la carte qui portera nos couleurs sur FC 27.' : 'Les propositions et leurs scores sont conservés ici, en mémoire du collectif.'}</p>
          {canPropose && <button className="arena-primary" onClick={() => setDialog('propose')}>Proposer un nom <span aria-hidden="true">↗</span></button>}
          {canVote && <a className="arena-primary" href="#arena-cards">Choisir ma carte <span aria-hidden="true">↓</span></a>}
          {state.winner && <>
            <p className="arena-result-note">Vote clos le {new Date(state.election.closed_at!).toLocaleString('fr-FR')}{state.election.tie_break_applied ? ' · Égalité départagée manuellement parmi les premiers.' : ''}</p>
            <a className="arena-primary" href="#arena-cards">Voir tous les résultats <span aria-hidden="true">↓</span></a>
          </>}
        </div>
        {state.winner ? <div className="arena-winning-card"><span className="arena-laurel" aria-hidden="true">★</span><NameCard proposal={state.winner} number={state.proposals.findIndex((p) => p.id === state.winner!.id) + 1} winner /></div> : <div className="arena-emblem" aria-hidden="true"><span className="arena-orbit" /><ClubCrest /><span className="arena-emblem-label">L’IDENTITÉ SE JOUE ICI</span></div>}
      </section>
      <section id="arena-cards" className="arena-collection" aria-labelledby="arena-collection-title">
        <div className="arena-collection-head"><div><p className="arena-kicker">{phase === 'closed' ? 'Le vote, pour mémoire' : 'La collection du collectif'}</p><h2 id="arena-collection-title">{phase === 'closed' ? 'Le classement final' : phase === 'cancelled' ? 'Les propositions archivées' : 'Les noms en jeu'}<span> / {String(proposals.length).padStart(2, '0')}</span></h2></div>
          <span className="arena-total"><strong>{total}</strong> vote{total > 1 ? 's' : ''} {phase === 'closed' ? 'au total' : 'exprimé(s)'}</span>
        </div>
        {canVote && <p className="arena-collection-help" id="arena-choice-help">Sélectionne une carte, puis saisis ton pseudo pour confirmer ton vote définitif.</p>}
        {proposals.length === 0 ? <div className="arena-empty"><ClubCrest /><h3>La première carte est à écrire.</h3><p>Un nom, une idée, une nouvelle histoire pour le club.</p>{canPropose && <button className="arena-secondary" onClick={() => setDialog('propose')}>Créer la première carte ↗</button>}</div> : <div className="arena-card-grid" role={canVote ? 'radiogroup' : undefined} aria-label={canVote ? 'Choix du nom du club' : undefined} aria-describedby={canVote ? 'arena-choice-help' : undefined}>
          {proposals.map((proposal, index) => canVote ? <label className={`arena-card-slot${selected === proposal.id ? ' is-selected' : ''}`} key={proposal.id}>
            <input className="arena-card-radio" type="radio" name="club-name" value={proposal.id} checked={selected === proposal.id} onChange={() => { setSelected(proposal.id); mutation.reset(); }} aria-label={proposal.club_name} disabled={mutation.isPending} />
            <NameCard proposal={proposal} number={index + 1} />
            <span className="arena-card-prompt">{selected === proposal.id ? '✓ Carte sélectionnée' : 'Choisir ce nom'}</span>
          </label> : <article className="arena-card-slot" key={proposal.id}><NameCard proposal={proposal} number={index + 1} winner={state.winner?.id === proposal.id} /><span className="arena-card-prompt">{state.winner?.id === proposal.id ? '★ Nom gagnant' : phase === 'proposing' ? 'En attente du vote' : `${proposal.votes} vote(s) · Score final`}</span></article>)}
        </div>}
      </section>
      <footer className="arena-footer"><span>FC 27 · Phase de préparation</span><span>{canPropose ? 'Toutes les idées ont leur place.' : canVote ? 'Un vote par pseudo exact · Clôture manuelle' : 'Les choix du collectif, conservés.'}</span></footer>
    </main>
    {canVote && <form className="arena-vote-dock" onSubmit={vote}>
      <div className="arena-vote-dock-inner"><div className="arena-selection"><span>Ta sélection</span><strong>{selectedProposal?.club_name ?? 'Choisis une carte au-dessus'}</strong></div>
        <label className="arena-pseudo">Ton pseudo<input required maxLength={40} autoComplete="off" placeholder="Pseudo exact" value={pseudo} onChange={(event) => setPseudo(event.target.value)} /></label>
        <button className="arena-primary" disabled={mutation.isPending || !selectedProposal || !pseudo.trim()}>{mutation.isPending ? 'Enregistrement…' : 'Confirmer mon vote'} <span aria-hidden="true">↗</span></button>
        <div className="arena-vote-feedback"><ActionFeedback error={mutation.error} success={mutation.isSuccess && 'Ton vote est enregistré. Rendez-vous au verdict !'} /></div>
      </div>
    </form>}
    {dialog === 'settings' && <FC27Settings state={state} onClose={() => setDialog(null)} />}
    {dialog === 'propose' && canPropose && <ProposalDialog state={state} onClose={() => setDialog(null)} />}
  </div>;
}

export function FC27NamingView() {
  usePageTitle('L’arène des noms · FC 27');
  const [params] = useSearchParams();
  const campaignId = params.has('campagne') ? Number(params.get('campagne')) : undefined;
  const query = useFC27(campaignId);
  if (!query.data) return <main className="naming-arena arena-loading"><Link className="arena-back" to="/fc27">← Retour à FC 27</Link>
    {query.isError ? <div role="alert"><h1>Le stade n’est pas encore prêt.</h1><p>{query.error.message}</p><button className="arena-primary" onClick={() => void query.refetch()}>Réessayer</button></div> : <p role="status">Les projecteurs s’allument…</p>}
  </main>;
  return <>{query.isError && <div className="arena-connection-error" role="alert">Connexion interrompue. Les derniers résultats restent affichés. <button onClick={() => void query.refetch()}>Réessayer</button></div>}<Arena key={`${query.data.campaign.id}:${query.data.election.phase}`} state={query.data} /></>;
}
