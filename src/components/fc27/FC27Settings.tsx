import { useState } from 'react';
import { Link, useNavigate } from 'react-router';
import type { FC27Stage, FC27StageKind, FC27State } from '../../../shared/fc27';
import { openStage, planAdvance, STAGE_LABELS, type AdvancePlan, type TieGroup } from '../../../shared/fc27-bracket';
import { useFC27Action } from '../../api/fc27';
import { ActionFeedback, FC27Dialog } from './FC27Dialog';
import { useIsAdmin } from '../../api/profile';
import '../../styles/fc27-naming-stages.css';

type Name = (id: number) => string;
const CLOSE_TITLES: Record<FC27StageKind, string> = { qualif: 'le premier tour', repechage: 'le second tour', semis: 'les demi-finales', final: 'la finale', podium: 'le podium' };

/** Ce qui se passera à la clôture de l'étape, en une phrase. */
function nextStep(plan: AdvancePlan, name: Name): string {
  const list = plan.qualified.map(name);
  switch (plan.next) {
    case 'repechage': return `Second tour avec les ${list.length} noms qui ont reçu au moins une voix. Les autres quittent la course.`;
    case 'semis': return list.length === 4
      ? `Demi-finales : ${list[0]} contre ${list[3]}, ${list[1]} contre ${list[2]}.`
      : 'Demi-finales avec les quatre premiers, une fois l’égalité tranchée.';
    case 'podium': return `Podium entre ${list.join(', ')}. Une voix par compte, le premier gagne.`;
    case 'final': return list.length === 2 ? `Finale : ${list[0]} contre ${list[1]}.` : 'Finale entre les vainqueurs des deux duels.';
    case 'done': return plan.podium.length > 0 ? `${name(plan.podium[0])} devient le nom du club.` : 'Le vainqueur sera désigné une fois l’égalité tranchée.';
    default: return '';
  }
}

function tieLegend(tie: TieGroup, plan: AdvancePlan) {
  if (tie.duel) return `Égalité dans la demi-finale ${tie.duel} : qui va en finale ?`;
  if (plan.next === 'done') return 'Égalité en tête : choisis le vainqueur';
  return `Égalité pour la dernière place : choisis ${tie.need} nom${tie.need > 1 ? 's' : ''}`;
}

function StageAdvance({ stage, name, picks, onPicks }: { stage: FC27Stage; name: Name; picks: number[]; onPicks: (picks: number[]) => void }) {
  const plan = planAdvance(stage, picks);
  const votes = (id: number) => stage.entries.find((e) => e.proposal_id === id)?.votes ?? 0;
  function toggle(tie: TieGroup, id: number) {
    const others = picks.filter((x) => !tie.among.includes(x));
    const inGroup = picks.filter((x) => tie.among.includes(x));
    const next = tie.need === 1 ? [id] : inGroup.includes(id) ? inGroup.filter((x) => x !== id) : [...inGroup, id].slice(-tie.need);
    onPicks([...others, ...next]);
  }
  if (plan.empty) return <p>Aucune voix pour l’instant. Au moins un vote est nécessaire pour clôturer l’étape.</p>;
  return <>
    <p>{nextStep(plan, name)}</p>
    {plan.ties.map((tie) => <fieldset className="fc27-form fc27-tie" key={tie.among.join('-')}>
      <legend>{tieLegend(tie, plan)}</legend>
      {tie.among.map((id) => <label key={id} className="fc27-tie-option">
        <input type={tie.need === 1 ? 'radio' : 'checkbox'} name={`tie-${tie.among.join('-')}`} checked={picks.includes(id)} onChange={() => toggle(tie, id)} />
        {name(id)} · {votes(id)} vote(s)
      </label>)}
    </fieldset>)}
    {plan.ties.length > 0 && <p className="fc27-small">Le départage manuel sera mentionné dans le résultat.</p>}
  </>;
}

export function FC27Settings({ state, onClose }: { state: FC27State; onClose: () => void }) {
  const mutation = useFC27Action();
  const isAdmin = useIsAdmin();
  const navigate = useNavigate();
  const [confirm, setConfirm] = useState<'archive' | 'reset' | 'start' | 'advance' | null>(null);
  const [picks, setPicks] = useState<number[]>([]);
  const archived = state.campaign.status === 'archived';
  const phase = state.election.phase;
  const stage = phase === 'voting' ? openStage(state.stages) : null;
  const name: Name = (id) => state.proposals.find((p) => p.id === id)?.club_name ?? '';
  // Les voix peuvent bouger pendant que la fenêtre est ouverte : un choix devenu hors égalité est ignoré.
  const ties = stage ? planAdvance(stage).ties : [];
  const validPicks = picks.filter((id) => ties.some((tie) => tie.among.includes(id)));
  const plan = stage ? planAdvance(stage, validPicks) : null;
  const titles = { start: 'Ouvrir le vote ?', advance: `Clôturer ${stage ? CLOSE_TITLES[stage.kind] : 'l’étape'} ?`, archive: 'Terminer cette préparation ?', reset: 'Recommencer à zéro ?' };
  const descriptions = {
    start: 'La liste des noms sera figée. Premier tour : chaque compte choisit jusqu’à trois noms et peut modifier son vote jusqu’à ta clôture.',
    advance: 'Les scores de l’étape seront figés. Plus aucun vote ne pourra y être ajouté ou modifié.',
    archive: 'Les fiches et le résultat passeront en lecture seule. L’onglet disparaîtra de la navigation ; le lien de l’archive restera accessible.',
    reset: 'La campagne actuelle sera archivée sans effacer ses données. La nouvelle préparation repartira sans proposition, vote ni fiche joueur.',
  };
  function request(action: typeof confirm) { mutation.reset(); setConfirm(action); setPicks([]); }
  function confirmAction() {
    if (!isAdmin || !confirm) return;
    const action = confirm === 'advance' ? { action: 'advance' as const, campaignId: state.campaign.id, picks: validPicks } : { action: confirm, campaignId: state.campaign.id };
    mutation.mutate(action, { onSuccess: (result) => {
      if (confirm === 'reset') navigate('/fc27');
      if (confirm === 'archive') navigate(`/fc27?campagne=${result.campaign.id}`);
      onClose();
    } });
  }
  if (!isAdmin) return null;
  return <FC27Dialog title="Réglages FC 27" onClose={onClose}>
    <p className="fc27-muted">Le lancement du vote et le passage d’une étape à l’autre se décident ici. Ces commandes sont réservées à l’administrateur du club.</p>
    <div className="fc27-settings-actions">
      {!archived && phase === 'proposing' && <>
        <button className="fc27-button" disabled={mutation.isPending || state.proposals.length === 0} onClick={() => request('start')}>Lancer le vote</button>
        <p className="fc27-small">{state.proposals.length} proposition(s). Au moins une proposition est nécessaire.</p>
      </>}
      {!archived && stage && <>
        <p><strong>{STAGE_LABELS[stage.kind]}</strong> en cours · {stage.voters} votant(s)</p>
        <button className="fc27-button" disabled={mutation.isPending || plan?.empty} onClick={() => request('advance')}>Clôturer l’étape et passer à la suite</button>
        <p className="fc27-small">{plan?.empty ? 'Au moins un vote est nécessaire pour clôturer l’étape.' : 'Tu verras la suite avant de confirmer.'}</p>
      </>}
      {phase === 'closed' && <p>Vote clos · <strong>{state.winner?.club_name}</strong></p>}
      {!archived && <button className="fc27-button fc27-button--outline" disabled={mutation.isPending || phase === 'voting'} onClick={() => request('archive')}>Terminer la préparation</button>}
      {!archived && phase === 'voting' && <p className="fc27-small">Termine le vote avant de terminer la préparation.</p>}
      <button className="fc27-button fc27-button--outline" disabled={mutation.isPending} onClick={() => request('reset')}>Recommencer la préparation</button>
    </div>
    {confirm && <div className="fc27-confirm" role="group" aria-label="Confirmation">
      <strong>{titles[confirm]}</strong><p>{descriptions[confirm]}</p>
      {confirm === 'advance' && stage && <StageAdvance stage={stage} name={name} picks={validPicks} onPicks={setPicks} />}
      <div className="fc27-button-row"><button className="fc27-button" disabled={mutation.isPending || (confirm === 'advance' && !plan?.ready)} onClick={confirmAction}>{mutation.isPending ? 'En cours…' : 'Confirmer'}</button><button className="fc27-button fc27-button--outline" disabled={mutation.isPending} onClick={() => setConfirm(null)}>Annuler</button></div>
    </div>}
    <ActionFeedback error={mutation.error} />
    {state.archives.length > 0 && <div className="fc27-archives"><h3>Préparations archivées</h3>{state.archives.map((archive) => <Link key={archive.id} to={`/fc27?campagne=${archive.id}`} onClick={onClose}>Campagne {archive.id} · {new Date(archive.archived_at).toLocaleDateString('fr-FR')} ↗</Link>)}</div>}
  </FC27Dialog>;
}
