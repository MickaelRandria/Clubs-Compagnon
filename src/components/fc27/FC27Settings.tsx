import { useState } from 'react';
import { Link, useNavigate } from 'react-router';
import type { FC27State } from '../../../shared/fc27';
import { useFC27Action } from '../../api/fc27';
import { ActionFeedback, FC27Dialog } from './FC27Dialog';
import { useMe } from '../../api/auth';
import { SignInButton } from './SignIn';

export function FC27Settings({ state, onClose }: { state: FC27State; onClose: () => void }) {
  const mutation = useFC27Action();
  const me = useMe();
  const signedIn = me.data?.signedIn === true;
  const navigate = useNavigate();
  const [confirm, setConfirm] = useState<'archive' | 'reset' | 'start' | 'close' | null>(null);
  const [winnerId, setWinnerId] = useState<number | null>(null);
  const archived = state.campaign.status === 'archived';
  const phase = state.election.phase;
  const total = state.proposals.reduce((sum, p) => sum + p.votes, 0);
  const maximum = Math.max(0, ...state.proposals.map((p) => p.votes));
  const leaders = state.proposals.filter((p) => p.votes === maximum);
  const tie = total > 0 && leaders.length > 1;
  const chosenIsValid = winnerId !== null && leaders.some((p) => p.id === winnerId);
  const titles = { start: 'Ouvrir le vote ?', close: 'Clôturer le vote ?', archive: 'Terminer cette préparation ?', reset: 'Recommencer à zéro ?' };
  const descriptions = {
    start: 'La liste des noms sera figée. Chaque compte pourra voter une seule fois, jusqu’à ta clôture manuelle.',
    close: 'Les scores seront définitifs et le nom gagnant sera annoncé. Aucun vote ne pourra être ajouté ensuite.',
    archive: 'Les fiches et le résultat passeront en lecture seule. L’onglet disparaîtra de la navigation ; le lien de l’archive restera accessible.',
    reset: 'La campagne actuelle sera archivée sans effacer ses données. La nouvelle préparation repartira sans proposition, vote ni fiche joueur.',
  };
  function request(action: typeof confirm) { mutation.reset(); setConfirm(action); setWinnerId(null); }
  function confirmAction() {
    if (!confirm) return;
    mutation.mutate({ action: confirm, campaignId: state.campaign.id,
      ...(confirm === 'close' && tie && chosenIsValid ? { winnerProposalId: winnerId! } : {}),
    }, { onSuccess: (result) => {
      if (confirm === 'reset') navigate('/fc27');
      if (confirm === 'archive') navigate(`/fc27?campagne=${result.campaign.id}`);
      onClose();
    } });
  }
  return <FC27Dialog title="Réglages FC 27" onClose={onClose}>
    <p className="fc27-muted">Le lancement et la clôture du vote se décident ici. Ces commandes sont accessibles aux membres connectés avec Discord, sur la confiance.</p>
    {!signedIn && <SignInButton />}
    {signedIn && <div className="fc27-settings-actions">
      {!archived && phase === 'proposing' && <>
        <button className="fc27-button" disabled={mutation.isPending || state.proposals.length === 0} onClick={() => request('start')}>Lancer le vote</button>
        <p className="fc27-small">{state.proposals.length} proposition(s). Au moins une proposition est nécessaire.</p>
      </>}
      {!archived && phase === 'voting' && <>
        <button className="fc27-button" disabled={mutation.isPending || total === 0} onClick={() => request('close')}>Clôturer le vote</button>
        <p className="fc27-small">{total} vote(s) reçu(s). {total === 0 ? 'Au moins un vote est nécessaire pour désigner un gagnant.' : 'Le nom avec le plus de voix gagne.'}</p>
      </>}
      {phase === 'closed' && <p>Vote clos · <strong>{state.winner?.club_name}</strong></p>}
      {!archived && <button className="fc27-button fc27-button--outline" disabled={mutation.isPending || phase === 'voting'} onClick={() => request('archive')}>Terminer la préparation</button>}
      {!archived && phase === 'voting' && <p className="fc27-small">Clôture le vote avant de terminer la préparation.</p>}
      <button className="fc27-button fc27-button--outline" disabled={mutation.isPending} onClick={() => request('reset')}>Recommencer la préparation</button>
    </div>}
    {signedIn && confirm && <div className="fc27-confirm" role="group" aria-label="Confirmation">
      <strong>{titles[confirm]}</strong><p>{descriptions[confirm]}</p>
      {confirm === 'close' && tie && <div className="fc27-form"><label>Égalité : choisir le gagnant
        <select value={chosenIsValid ? winnerId! : ''} onChange={(event) => setWinnerId(Number(event.target.value))}>
          <option value="" disabled>Choisir parmi les ex æquo</option>
          {leaders.map((p) => <option value={p.id} key={p.id}>{p.club_name} · {p.votes} vote(s)</option>)}
        </select></label><p className="fc27-small">Le départage manuel sera mentionné dans le résultat.</p></div>}
      {confirm === 'close' && !tie && total > 0 && <p>En tête : <strong>{leaders[0]?.club_name}</strong> · {maximum} vote(s)</p>}
      <div className="fc27-button-row"><button className="fc27-button" disabled={mutation.isPending || (confirm === 'close' && (total === 0 || (tie && !chosenIsValid)))} onClick={confirmAction}>{mutation.isPending ? 'En cours…' : 'Confirmer'}</button><button className="fc27-button fc27-button--outline" disabled={mutation.isPending} onClick={() => setConfirm(null)}>Annuler</button></div>
    </div>}
    <ActionFeedback error={mutation.error} />
    {state.archives.length > 0 && <div className="fc27-archives"><h3>Préparations archivées</h3>{state.archives.map((archive) => <Link key={archive.id} to={`/fc27?campagne=${archive.id}`} onClick={onClose}>Campagne {archive.id} · {new Date(archive.archived_at).toLocaleDateString('fr-FR')} ↗</Link>)}</div>}
  </FC27Dialog>;
}
