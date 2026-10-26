import { useState } from 'react';
import { Link, useNavigate } from 'react-router';
import type { FC27State } from '../../../shared/fc27';
import { useFC27Action } from '../../api/fc27';
import { ActionFeedback, FC27Dialog } from './FC27Dialog';
import { useIsAdmin } from '../../api/profile';

// Le vote du nom est terminé (le club s'appelle FoodBall Club) : il ne reste ici que
// le cycle de vie de la préparation.
export function FC27Settings({ state, onClose }: { state: FC27State; onClose: () => void }) {
  const mutation = useFC27Action();
  const isAdmin = useIsAdmin();
  const navigate = useNavigate();
  const [confirm, setConfirm] = useState<'archive' | 'reset' | null>(null);
  const archived = state.campaign.status === 'archived';
  const titles = { archive: 'Terminer cette préparation ?', reset: 'Recommencer à zéro ?' };
  const descriptions = {
    archive: 'Les fiches passeront en lecture seule. L’onglet disparaîtra de la navigation ; le lien de l’archive restera accessible.',
    reset: 'La campagne actuelle sera archivée sans effacer ses données. La nouvelle préparation repartira sans fiche joueur.',
  };
  function request(action: typeof confirm) { mutation.reset(); setConfirm(action); }
  function confirmAction() {
    if (!isAdmin || !confirm) return;
    mutation.mutate({ action: confirm, campaignId: state.campaign.id }, { onSuccess: (result) => {
      if (confirm === 'reset') navigate('/fc27');
      if (confirm === 'archive') navigate(`/fc27?campagne=${result.campaign.id}`);
      onClose();
    } });
  }
  if (!isAdmin) return null;
  return <FC27Dialog title="Réglages FC 27" onClose={onClose}>
    <p className="fc27-muted">Ces commandes sont réservées à l’administrateur du club.</p>
    <div className="fc27-settings-actions">
      {!archived && <button className="fc27-button fc27-button--outline" disabled={mutation.isPending} onClick={() => request('archive')}>Terminer la préparation</button>}
      <button className="fc27-button fc27-button--outline" disabled={mutation.isPending} onClick={() => request('reset')}>Recommencer la préparation</button>
    </div>
    {confirm && <div className="fc27-confirm" role="group" aria-label="Confirmation">
      <strong>{titles[confirm]}</strong><p>{descriptions[confirm]}</p>
      <div className="fc27-button-row"><button className="fc27-button" disabled={mutation.isPending} onClick={confirmAction}>{mutation.isPending ? 'En cours…' : 'Confirmer'}</button><button className="fc27-button fc27-button--outline" disabled={mutation.isPending} onClick={() => setConfirm(null)}>Annuler</button></div>
    </div>}
    <ActionFeedback error={mutation.error} />
    {state.archives.length > 0 && <div className="fc27-archives"><h3>Préparations archivées</h3>{state.archives.map((archive) => <Link key={archive.id} to={`/fc27?campagne=${archive.id}`} onClick={onClose}>Campagne {archive.id} · {new Date(archive.archived_at).toLocaleDateString('fr-FR')} ↗</Link>)}</div>}
  </FC27Dialog>;
}
