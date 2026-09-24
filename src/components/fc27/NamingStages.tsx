import { useEffect, useState, type FormEvent, type ReactNode } from 'react';
import type { FC27Proposal, FC27Stage, FC27StageEntry, FC27StageResult, FC27State } from '../../../shared/fc27';
import { rankEntries, STAGE_LABELS } from '../../../shared/fc27-bracket';
import { useFC27Action } from '../../api/fc27';
import type { Account } from '../../../server/auth-http';
import { ActionFeedback } from './FC27Dialog';
import { NameCard, stagger } from './NameCard';
import { SignInButton } from './SignIn';
import '../../styles/fc27-naming-stages.css';

/** Accès aux propositions et à leur numéro de carte (ordre d'arrivée, stable d'une étape à l'autre). */
export function useLookup(state: FC27State) {
  const byId = new Map(state.proposals.map((p) => [p.id, p]));
  const number = (id: number) => state.proposals.findIndex((p) => p.id === id) + 1;
  return { get: (id: number) => byId.get(id)!, number };
}
type Lookup = ReturnType<typeof useLookup>;

const multiple = (stage: FC27Stage) => stage.kind === 'qualif' || stage.kind === 'repechage';
const names = (ids: number[], lookup: Lookup) => ids.map((id) => lookup.get(id).club_name);
const sameBallot = (a: number[], b: number[]) => a.length === b.length && a.every((id) => b.includes(id));

/** Titre, accroche et consigne de l'étape ouverte, pour l'en-tête de l'arène. */
export function stageIntro(stage: FC27Stage, lookup: Lookup): { kicker: string; title: ReactNode; description: string; help: string } {
  const ids = stage.entries.map((e) => e.proposal_id);
  switch (stage.kind) {
    case 'qualif': return {
      kicker: 'Premier tour · 3 choix',
      title: <>Un club.<br />Un nom.<br /><em>Notre choix.</em></>,
      description: 'Choisis jusqu’à trois noms. Tu peux modifier ton vote tant que l’étape est ouverte. Les noms sans voix quittent la course.',
      help: 'Sélectionne jusqu’à trois cartes, puis valide. Ton vote reste modifiable jusqu’à la clôture de l’étape.',
    };
    case 'repechage': return {
      kicker: 'Second tour · 3 choix',
      title: <>{ids.length} noms.<br />4 places.<br /><em>Le tri.</em></>,
      description: 'Seuls les noms qui ont reçu au moins une voix restent en course. Les quatre premiers iront en demi-finales.',
      help: 'Nouveau tour, nouveau vote : sélectionne jusqu’à trois cartes. Ton vote reste modifiable jusqu’à la clôture.',
    };
    case 'semis': return {
      kicker: 'Demi-finales · 1 choix par duel',
      title: <>Demi-finales.<br /><em>Deux duels.</em></>,
      description: 'Un nom par duel. Les deux vainqueurs se retrouvent en finale.',
      help: 'Choisis une carte dans chaque duel, puis valide. Tu peux changer d’avis jusqu’à la clôture.',
    };
    case 'final': return {
      kicker: 'Finale · 1 choix',
      title: <>La finale.<br /><em>Un seul nom.</em></>,
      description: `${names(ids, lookup).join(' contre ')}. Une voix par compte, modifiable jusqu’au coup de sifflet final.`,
      help: 'Choisis la carte qui portera nos couleurs sur FC 27.',
    };
    case 'podium': return {
      kicker: 'Podium · 1 choix',
      title: <>Le podium.<br /><em>Trois noms.</em></>,
      description: 'Une voix par compte. Le premier devient notre nom, les deux autres complètent le podium.',
      help: 'Choisis ta carte préférée parmi les trois. Tu peux changer d’avis jusqu’à la clôture.',
    };
  }
}

function Choice({ proposal, entry, number, index, type, group, checked, saved, full, disabled, onToggle }: {
  proposal: FC27Proposal; entry: FC27StageEntry; number: number; index: number; type: 'checkbox' | 'radio'; group: string;
  checked: boolean; saved: boolean; full: boolean; disabled: boolean; onToggle: () => void;
}) {
  const prompt = checked ? (saved ? '✓ Dans ton vote' : '✓ Sélectionnée') : full ? '3 choix maximum' : 'Choisir ce nom';
  return <label className={`arena-card-slot${checked ? ' is-selected' : ''}${full && !checked ? ' is-full' : ''}`} style={stagger(index)}>
    <input className="arena-card-radio" type={type} name={group} value={proposal.id} checked={checked}
      onChange={onToggle} aria-label={proposal.club_name} disabled={disabled || (full && !checked)} />
    <NameCard proposal={proposal} votes={entry.votes} number={number} />
    {checked && <span className="arena-card-check" aria-hidden="true">✓</span>}
    <span className="arena-card-prompt">{prompt}</span>
  </label>;
}

/** Bulletin de l'étape ouverte : choix en cours, enregistrement, modification. Inerte sans étape ouverte. */
export function useBallot(state: FC27State, stage: FC27Stage | null) {
  const mutation = useFC27Action();
  // `null` = suivre le bulletin enregistré ; un brouillon n'existe que pendant une modification.
  const [draft, setDraft] = useState<number[] | null>(null);
  const saved = state.my_ballot;
  const selected = draft ?? saved;
  const many = stage !== null && multiple(stage);
  const full = stage !== null && many && selected.length >= stage.max_choices;
  const dirty = !sameBallot(selected, saved);
  function toggle(entry: FC27StageEntry) {
    if (!stage) return;
    mutation.reset();
    const id = entry.proposal_id;
    let next: number[];
    if (many) next = selected.includes(id) ? selected.filter((x) => x !== id) : [...selected, id].slice(0, stage.max_choices);
    // Demi-finales : un nom par duel, le nouveau choix remplace celui du même duel.
    else if (stage.kind === 'semis') next = [...selected.filter((x) => stage.entries.find((e) => e.proposal_id === x)?.duel !== entry.duel), id];
    else next = [id];
    setDraft(next);
  }
  function submit(event: FormEvent) {
    event.preventDefault();
    if (!dirty || !stage) return;
    mutation.mutate({ action: 'vote', campaignId: state.campaign.id, proposalIds: selected }, { onSuccess: () => setDraft(null) });
  }
  return { mutation, saved, selected, many, full, dirty, toggle, submit };
}
type Ballot = ReturnType<typeof useBallot>;

/** Cartes de l'étape ouverte : grille (tours), duels (demi-finales, finale) ou trio (podium). */
export function StageCards({ state, stage, lookup, ballot }: { state: FC27State; stage: FC27Stage; lookup: Lookup; ballot: Ballot }) {
  const { selected, saved, many, full, mutation, toggle } = ballot;
  const entries = stage.entries;
  const choice = (entry: FC27StageEntry, index: number, group: string) => <Choice key={entry.proposal_id}
    proposal={lookup.get(entry.proposal_id)} entry={entry} number={lookup.number(entry.proposal_id)} index={index}
    type={many ? 'checkbox' : 'radio'} group={group} checked={selected.includes(entry.proposal_id)}
    saved={saved.includes(entry.proposal_id)} full={full} disabled={mutation.isPending} onToggle={() => toggle(entry)} />;

  let body: ReactNode;
  if (stage.kind === 'semis' || stage.kind === 'final') {
    const duels = stage.kind === 'semis' ? [1, 2] as const : [null];
    body = <div className={`arena-duels${stage.kind === 'final' ? ' arena-duels--final' : ''}`}>
      {duels.map((duel, d) => {
        const pair = entries.filter((e) => e.duel === duel);
        const label = duel ? `Demi-finale ${duel}` : 'La finale';
        return <fieldset className="arena-duel" key={label} style={stagger(d * 2)}>
          <legend className="arena-duel-title"><span>{label}</span></legend>
          <div className="arena-duel-side arena-duel-side--left">{choice(pair[0], d * 2, `duel-${duel ?? 'final'}`)}</div>
          <span className="arena-vs" aria-hidden="true"><span>VS</span></span>
          <div className="arena-duel-side arena-duel-side--right">{choice(pair[1], d * 2 + 1, `duel-${duel ?? 'final'}`)}</div>
        </fieldset>;
      })}
    </div>;
  } else {
    const out = state.proposals.filter((p) => !entries.some((e) => e.proposal_id === p.id));
    body = <>
      <div className={`arena-card-grid${stage.kind === 'podium' ? ' arena-card-grid--three' : ''}`} role="group" aria-label="Choix du nom du club" aria-describedby="arena-choice-help">
        {entries.map((entry, index) => choice(entry, index, 'club-name'))}
      </div>
      {out.length > 0 && <p className="arena-out"><span>Hors course</span>{out.map((p) => <s key={p.id}>{p.club_name}</s>)}</p>}
    </>;
  }
  return <section id="arena-cards" className="arena-collection" aria-labelledby="arena-collection-title">
    <div className="arena-collection-head">
      <div><p className="arena-kicker">{STAGE_LABELS[stage.kind]} · étape {String(stage.number).padStart(2, '0')}</p>
        <h2 id="arena-collection-title">{stage.kind === 'semis' ? 'Les duels' : stage.kind === 'final' ? 'Le duel final' : stage.kind === 'podium' ? 'Le podium en jeu' : 'Les noms en jeu'}<span> / {String(entries.length).padStart(2, '0')}</span></h2></div>
      <span className="arena-total"><strong>{stage.voters}</strong> votant{stage.voters > 1 ? 's' : ''}</span>
    </div>
    <p className="arena-collection-help" id="arena-choice-help">{stageIntro(stage, lookup).help}</p>
    {body}
  </section>;
}

/** Barre collante de validation du vote. */
export function VoteDock({ stage, lookup, ballot, account }: { stage: FC27Stage; lookup: Lookup; ballot: Ballot; account: Account | null }) {
  const { selected, saved, many, dirty, mutation, submit } = ballot;
  const summary = stage.kind === 'semis'
    ? ([1, 2] as const).map((duel) => `Demi ${duel} : ${names(selected.filter((id) => stage.entries.find((e) => e.proposal_id === id)?.duel === duel), lookup)[0] ?? '—'}`).join(' · ')
    : names(selected, lookup).join(' · ');
  const label = mutation.isPending ? 'Enregistrement…'
    : !dirty && saved.length > 0 ? 'Vote enregistré'
      : selected.length === 0 && saved.length > 0 ? 'Retirer mon vote'
        : saved.length > 0 ? 'Modifier mon vote' : 'Valider mon vote';
  return <form className="arena-vote-dock" onSubmit={submit}>
    <div className="arena-vote-dock-inner">
      <div className="arena-selection"><span>{many ? `Tes choix · ${selected.length}/${stage.max_choices}` : 'Ta sélection'}</span>
        <strong>{selected.length > 0 || stage.kind === 'semis' ? summary : many ? 'Choisis jusqu’à 3 cartes' : 'Choisis une carte au-dessus'}</strong></div>
      {account
        ? <span className="arena-voter"><span>Tu votes en tant que</span><strong><bdi>{account.displayName || account.username}</bdi></strong></span>
        : <span className="arena-voter"><span>Un vote par compte</span><strong>Connexion requise</strong></span>}
      {account
        ? <button className="arena-primary" disabled={mutation.isPending || !dirty}>{label} <span aria-hidden="true">{dirty ? '↗' : '✓'}</span></button>
        : <SignInButton className="arena-primary" />}
      <div className="arena-vote-feedback"><ActionFeedback error={mutation.error} success={mutation.isSuccess && (saved.length > 0
        ? 'Ton vote est enregistré. Tu peux le modifier jusqu’à la clôture de l’étape.' : 'Ton vote est retiré.')} /></div>
    </div>
  </form>;
}

const RESULT_LABELS: Record<FC27StageResult, string> = {
  advanced: 'Qualifié', eliminated: 'Éliminé', winner: 'Vainqueur', runner_up: '2e', third: '3e',
};

/** Le parcours : chaque étape close, ses scores figés et le sort de chaque nom. */
export function StageHistory({ stages, lookup }: { stages: FC27Stage[]; lookup: Lookup }) {
  const closed = stages.filter((s) => s.closed_at !== null).reverse();
  if (closed.length === 0) return null;
  return <section className="arena-history" aria-labelledby="arena-history-title">
    <div className="arena-collection-head"><div><p className="arena-kicker">Étape par étape</p><h2 id="arena-history-title">Le parcours</h2></div></div>
    <ol className="arena-history-list">
      {closed.map((stage) => {
        const top = Math.max(1, ...stage.entries.map((e) => e.votes));
        const groups = stage.kind === 'semis' ? [1, 2] as const : [null];
        return <li className="arena-history-stage" key={stage.id}>
          <h3><b>{String(stage.number).padStart(2, '0')}</b>{STAGE_LABELS[stage.kind]}<small>{stage.voters} votant{stage.voters > 1 ? 's' : ''}{stage.tie_break_applied ? ' · égalité départagée par l’admin' : ''}</small></h3>
          {groups.map((duel) => <ul key={duel ?? 'all'} className="arena-history-rows" aria-label={duel ? `Demi-finale ${duel}` : undefined}>
            {rankEntries(stage.entries.filter((e) => e.duel === duel)).map((entry, index) => <li key={entry.proposal_id} className={`arena-history-row is-${entry.result ?? 'open'}`} style={stagger(index)}>
              <span className="arena-history-name">{lookup.get(entry.proposal_id).club_name}</span>
              <span className="arena-bar" aria-hidden="true"><span className="arena-bar-fill" style={{ width: `${(entry.votes / top) * 100}%` }} /></span>
              <span className="arena-history-votes">{entry.votes}<small> vote{entry.votes > 1 ? 's' : ''}</small></span>
              {entry.result && <span className="arena-history-tag">{RESULT_LABELS[entry.result]}</span>}
            </li>)}
          </ul>)}
        </li>;
      })}
    </ol>
  </section>;
}

/** Podium final : 2e à gauche, vainqueur au centre, 3e (ou les demi-finalistes) à droite. */
export function PodiumResult({ stages, lookup }: { stages: FC27Stage[]; lookup: Lookup }) {
  const last = stages.at(-1);
  if (!last) return null;
  const find = (result: FC27StageResult) => last.entries.filter((e) => e.result === result).map((e) => e.proposal_id);
  const semis = stages.find((s) => s.kind === 'semis');
  const third = last.kind === 'final' && semis ? semis.entries.filter((e) => e.result === 'eliminated').map((e) => e.proposal_id) : find('third');
  const places = [
    { place: 2, label: 'Finaliste', ids: find('runner_up') },
    { place: 1, label: 'Vainqueur', ids: find('winner') },
    { place: 3, label: third.length > 1 ? 'Demi-finalistes' : 'Troisième', ids: third },
  ].filter((p) => p.ids.length > 0);
  if (places.length < 2) return null;
  return <section className="arena-podium-section" aria-labelledby="arena-podium-title">
    <div className="arena-collection-head"><div><p className="arena-kicker">Le verdict</p><h2 id="arena-podium-title">Le podium</h2></div></div>
    <ol className="arena-podium">
      {places.map(({ place, label, ids }) => <li key={place} className={`arena-podium-step arena-podium-step--${place}`}>
        <div className="arena-podium-names">{ids.map((id) => <strong key={id}>{lookup.get(id).club_name}<small>{lookup.get(id).author_pseudo}</small></strong>)}</div>
        <div className="arena-podium-block"><b>{place}</b><span>{label}</span></div>
      </li>)}
    </ol>
  </section>;
}

/**
 * Rideau de transition entre deux étapes : affiché une fois par étape et par appareil, à
 * l'arrivée sur une nouvelle étape (après la clôture par l'admin ou au rafraîchissement).
 */
export function StageCurtain({ marker, kicker, title, detail }: { marker: string; kicker: string; title: string; detail: string }) {
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const key = 'fc27-stage-seen';
    try {
      if (localStorage.getItem(key) === marker) return;
      localStorage.setItem(key, marker);
    } catch { return; }
    setVisible(true);
    const timer = window.setTimeout(() => setVisible(false), 2400);
    return () => window.clearTimeout(timer);
  }, [marker]);
  if (!visible) return null;
  return <div className="arena-curtain" aria-hidden="true" onClick={() => setVisible(false)}>
    <div className="arena-curtain-sweep" />
    <div className="arena-curtain-copy"><span>{kicker}</span><strong>{title}</strong><em>{detail}</em></div>
  </div>;
}
