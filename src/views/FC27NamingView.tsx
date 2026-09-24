import { useState, type FormEvent } from 'react';
import { Link, useSearchParams } from 'react-router';
import type { FC27State } from '../../shared/fc27';
import { openStage, STAGE_LABELS } from '../../shared/fc27-bracket';
import { useFC27, useFC27Action } from '../api/fc27';
import { useMe } from '../api/auth';
import { useIsAdmin } from '../api/profile';
import { AccountChip, SignInButton, SignInNotice } from '../components/fc27/SignIn';
import { ActionFeedback, FC27Dialog } from '../components/fc27/FC27Dialog';
import { FC27Settings } from '../components/fc27/FC27Settings';
import { ClubCrest, NameCard, stagger } from '../components/fc27/NameCard';
import { PodiumResult, StageCards, StageCurtain, StageHistory, stageIntro, useBallot, useLookup, VoteDock } from '../components/fc27/NamingStages';
import { usePageTitle } from '../lib/hooks';
import '../styles/fc27-naming.css';

/** Nombre de propositions qu'un compte peut porter. Doit rester aligné sur `fc27_dispatch`. */
const MAX_PROPOSALS = 3;
const pad = (n: number) => String(n).padStart(2, '0');

function ProposalDialog({ state, mine, onClose }: { state: FC27State; mine: number; onClose: () => void }) {
  const mutation = useFC27Action();
  const [name, setName] = useState('');
  const full = mine >= MAX_PROPOSALS;
  function submit(event: FormEvent) {
    event.preventDefault();
    mutation.mutate({ action: 'propose', campaignId: state.campaign.id, name }, { onSuccess: onClose });
  }
  return <FC27Dialog title="Le prochain nom, c’est le tien ?" onClose={onClose}>
    <p className="fc27-muted">
      Ton nom d’auteur vient de ton compte Discord. {full
        ? `Tu portes déjà ${MAX_PROPOSALS} propositions, le maximum.`
        : `Il te reste ${MAX_PROPOSALS - mine} proposition${MAX_PROPOSALS - mine > 1 ? 's' : ''} sur ${MAX_PROPOSALS}.`}
    </p>
    <form className="fc27-form" onSubmit={submit}>
      <label>Nom du club proposé<input required autoFocus maxLength={60} disabled={full}
        placeholder="Un nom qui résonne dans le stade" value={name} onChange={(e) => setName(e.target.value)} /></label>
      <ActionFeedback error={mutation.error} />
      <button className="fc27-button" disabled={mutation.isPending || full || !name.trim()}>
        {mutation.isPending ? 'Création de la carte…' : 'Ajouter ma proposition ↗'}
      </button>
    </form>
  </FC27Dialog>;
}

function Arena({ state }: { state: FC27State }) {
  const [params] = useSearchParams();
  const [dialog, setDialog] = useState<'propose' | 'settings' | null>(null);
  const me = useMe();
  const account = me.data?.signedIn ? me.data.account : null;
  const isAdmin = useIsAdmin();
  const lookup = useLookup(state);
  // Propositions déjà portées par ce compte : la limite s'affiche avant de cliquer.
  const mine = account ? state.proposals.filter((p) => p.author_account_id === account.id).length : 0;
  const phase = state.election.phase;
  const active = state.campaign.status === 'preparation';
  const canPropose = active && phase === 'proposing';
  const stage = active && phase === 'voting' ? openStage(state.stages) : null;
  const ballot = useBallot(state, stage);
  // Campagnes d'avant les étapes (migration 0014) : un seul vote, affiché comme autrefois.
  const staged = state.stages.length > 0;
  const lastStage = state.stages.at(-1);
  const intro = stage ? stageIntro(stage, lookup) : null;
  const total = state.proposals.reduce((sum, p) => sum + p.votes, 0);
  const proposals = phase === 'closed' || phase === 'cancelled' ? [...state.proposals].sort((a, b) => b.votes - a.votes || a.id - b.id) : state.proposals;
  const phaseLabel = phase === 'proposing' ? 'Propositions ouvertes' : phase === 'voting' ? intro?.kicker ?? 'Le vote est ouvert' : phase === 'closed' ? 'Le collectif a choisi' : 'Préparation archivée';
  const steps = [
    { label: 'Les idées', current: phase === 'proposing' },
    ...(staged ? state.stages.map((s) => ({ label: STAGE_LABELS[s.kind], current: s.id === stage?.id })) : [{ label: 'Le vote', current: phase === 'voting' }]),
    { label: 'Le verdict', current: phase === 'closed' },
  ];
  // Rideau de transition à l'arrivée sur une nouvelle étape, puis sur le verdict.
  const curtain = stage && stage.number > 1 ? {
    marker: `${state.campaign.id}:${stage.id}`, kicker: `Étape ${pad(stage.number)}`, title: STAGE_LABELS[stage.kind],
    detail: stage.kind === 'repechage' ? `${stage.entries.length} noms pour 4 places`
      : stage.kind === 'semis' ? '4 noms · 2 duels'
        : stage.kind === 'podium' ? '3 noms · 1 voix'
          : stage.entries.map((e) => lookup.get(e.proposal_id).club_name).join(' contre '),
  } : state.winner && staged ? { marker: `${state.campaign.id}:verdict`, kicker: 'Le verdict', title: state.winner.club_name, detail: 'Notre nom pour FC 27' } : null;
  const winnerText = !state.winner ? '' : staged && lastStage
    ? `Proposé par ${state.winner.author_pseudo}. ${state.winner.votes} voix ${lastStage.kind === 'final' ? 'en finale' : lastStage.kind === 'podium' ? 'au podium' : 'au dernier tour'}. Le prochain chapitre peut commencer.`
    : `Proposé par ${state.winner.author_pseudo}. Porté par ${state.winner.votes} voix sur ${total}. Le prochain chapitre peut commencer.`;

  return <div className={`naming-arena${stage ? ' naming-arena--voting' : ''}${state.winner ? ' naming-arena--result' : ''}`}>
    <div className="arena-stadium" aria-hidden="true"><div className="arena-beam arena-beam--left" /><div className="arena-beam arena-beam--right" /><div className="arena-floodlights arena-floodlights--left" /><div className="arena-floodlights arena-floodlights--right" /><div className="arena-stands" /><div className="arena-pitch" /></div>
    {curtain && <StageCurtain {...curtain} />}
    <header className="arena-header">
      <Link className="arena-back" to={`/fc27?campagne=${state.campaign.id}`}><span aria-hidden="true">←</span> Retour à FC 27</Link>
      <div className="arena-wordmark">DOMMAGE<span>LE PROCHAIN CHAPITRE</span></div>
      {isAdmin && <button className="arena-settings" onClick={() => setDialog('settings')}>Réglages FC 27 <span aria-hidden="true">↗</span></button>}
    </header>
    <main className="arena-main">
      <AccountChip />
      <SignInNotice reason={params.get('connexion')} />
      <nav className="arena-phases" aria-label="Étapes du choix du nom">
        {steps.map((step, index) => <span key={index} aria-current={step.current ? 'step' : undefined}><b>{pad(index + 1)}</b><i>{step.label}</i></span>)}
      </nav>
      <section className={`arena-intro${state.winner ? ' arena-intro--winner' : ''}`} aria-labelledby="arena-title">
        <div className="arena-intro-copy"><p className="arena-kicker"><span /> {phaseLabel}</p>
          <h1 id="arena-title">{state.winner ? <><span className="arena-winner-pretitle">Notre nom pour FC 27</span>{state.winner.club_name}<em>Une nouvelle ère.</em></> : phase === 'cancelled' ? <>Les noms de<br /><em>notre histoire.</em></> : intro ? intro.title : <>Un club.<br />Un nom.<br /><em>Notre choix.</em></>}</h1>
          <p className="arena-description">{state.winner ? winnerText
            : canPropose ? 'Avant le premier coup de sifflet, écrivons notre identité. Le prochain nom du club commence avec ton idée.'
              : intro ? intro.description : 'Les propositions et leurs scores sont conservés ici, en mémoire du collectif.'}</p>
          {canPropose && (account
            ? <button className="arena-primary" disabled={mine >= MAX_PROPOSALS} onClick={() => setDialog('propose')}>{mine >= MAX_PROPOSALS ? 'Tes 3 noms sont proposés' : 'Proposer un nom'} <span aria-hidden="true">↗</span></button>
            : <SignInButton className="arena-primary" />)}
          {canPropose && <p className="fc27-small">{account ? `${mine} / ${MAX_PROPOSALS} noms proposés` : 'Trois propositions maximum par compte Discord.'}</p>}
          {stage && <a className="arena-primary" href="#arena-cards">{state.my_ballot.length > 0 ? 'Revoir mon vote' : 'Voter'} <span aria-hidden="true">↓</span></a>}
          {stage && isAdmin && <button className="arena-admin" onClick={() => setDialog('settings')}><span>Admin</span>Clôturer l’étape et passer à la suite <b aria-hidden="true">↗</b></button>}
          {state.winner && <>
            <p className="arena-result-note">Vote clos le {new Date(state.election.closed_at!).toLocaleString('fr-FR')}{state.election.tie_break_applied ? ' · Égalité départagée manuellement.' : ''}</p>
            <a className="arena-primary" href={staged ? '#arena-verdict' : '#arena-cards'}>Voir tous les résultats <span aria-hidden="true">↓</span></a>
          </>}
        </div>
        {state.winner ? <div className="arena-winning-card"><span className="arena-laurel" aria-hidden="true">★</span><NameCard proposal={state.winner} number={lookup.number(state.winner.id)} winner /></div> : <div className="arena-emblem" aria-hidden="true"><span className="arena-orbit" /><ClubCrest /><span className="arena-emblem-label">L’IDENTITÉ SE JOUE ICI</span></div>}
      </section>
      {stage && <StageCards state={state} stage={stage} lookup={lookup} ballot={ballot} />}
      {staged && !stage && <div id="arena-verdict">{state.winner && <PodiumResult stages={state.stages} lookup={lookup} />}</div>}
      <StageHistory stages={state.stages} lookup={lookup} />
      {!stage && <section id="arena-cards" className="arena-collection" aria-labelledby="arena-collection-title">
        <div className="arena-collection-head"><div><p className="arena-kicker">{phase === 'closed' ? (staged ? 'Toutes les propositions' : 'Le vote, pour mémoire') : 'La collection du collectif'}</p><h2 id="arena-collection-title">{phase === 'closed' ? (staged ? 'Le premier tour' : 'Le classement final') : phase === 'cancelled' ? 'Les propositions archivées' : 'Les noms en jeu'}<span> / {pad(proposals.length)}</span></h2></div>
          <span className="arena-total"><strong>{total}</strong> vote{total > 1 ? 's' : ''} {phase === 'closed' ? (staged ? 'au premier tour' : 'au total') : 'exprimé(s)'}</span>
        </div>
        {proposals.length === 0 ? <div className="arena-empty"><ClubCrest /><h3>La première carte est à écrire.</h3><p>Un nom, une idée, une nouvelle histoire pour le club.</p>{canPropose && (account
          ? <button className="arena-secondary" onClick={() => setDialog('propose')}>Créer la première carte ↗</button>
          : <SignInButton className="arena-secondary" />)}</div> : <div className="arena-card-grid">
          {proposals.map((proposal, index) => <article className="arena-card-slot" key={proposal.id} style={stagger(index)}>
            <NameCard proposal={proposal} number={lookup.number(proposal.id)} winner={state.winner?.id === proposal.id} />
            <span className="arena-card-prompt">{state.winner?.id === proposal.id ? '★ Nom gagnant' : phase === 'proposing' ? 'En attente du vote' : `${proposal.votes} vote(s) · ${staged ? 'Premier tour' : 'Score final'}`}</span>
          </article>)}
        </div>}
      </section>}
      <footer className="arena-footer"><span>FC 27 · Phase de préparation</span><span>{canPropose ? 'Toutes les idées ont leur place.' : stage ? 'Vote modifiable jusqu’à la clôture · Étapes closes par l’admin' : 'Les choix du collectif, conservés.'}</span></footer>
    </main>
    {stage && <VoteDock stage={stage} lookup={lookup} ballot={ballot} account={account} />}
    {isAdmin && dialog === 'settings' && <FC27Settings state={state} onClose={() => setDialog(null)} />}
    {dialog === 'propose' && canPropose && account && <ProposalDialog state={state} mine={mine} onClose={() => setDialog(null)} />}
  </div>;
}

export function FC27NamingView() {
  usePageTitle('L’arène des noms · FC 27');
  const [params] = useSearchParams();
  const campaignId = params.has('campagne') ? Number(params.get('campagne')) : undefined;
  const query = useFC27(campaignId, { live: true });
  if (!query.data) return <main className="naming-arena arena-loading"><Link className="arena-back" to="/fc27">← Retour à FC 27</Link>
    {query.isError ? <div role="alert"><h1>Le stade n’est pas encore prêt.</h1><p>{query.error.message}</p><button className="arena-primary" onClick={() => void query.refetch()}>Réessayer</button></div> : <p role="status">Les projecteurs s’allument…</p>}
  </main>;
  // La clé suit l'étape : à chaque nouvelle étape l'arène se remonte, les cartes sont redistribuées
  // (animation d'entrée) et le brouillon de vote repart du bulletin enregistré.
  const stageKey = openStage(query.data.stages)?.id ?? 'aucune';
  return <>{query.isError && <div className="arena-connection-error" role="alert">Connexion interrompue. Les derniers résultats restent affichés. <button onClick={() => void query.refetch()}>Réessayer</button></div>}<Arena key={`${query.data.campaign.id}:${query.data.election.phase}:${stageKey}`} state={query.data} /></>;
}
