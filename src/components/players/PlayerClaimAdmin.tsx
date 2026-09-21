import { useState } from 'react';
import type { AdminClaim } from '../../../shared/profile';
import { useProfileAction } from '../../api/profile';
import { ActionFeedback, FC27Dialog } from '../fc27/FC27Dialog';

type Decision = { claim: AdminClaim; action: 'approve' | 'reject' | 'revoke' };
export function PlayerClaimAdmin({ claims }: { claims: AdminClaim[] }) {
  const mutation = useProfileAction();
  const [decision, setDecision] = useState<Decision | null>(null);
  const [note, setNote] = useState('');
  const pending = claims.filter(claim => claim.status === 'pending');
  const approved = claims.filter(claim => claim.status === 'approved');
  function choose(claim: AdminClaim, action: Decision['action']) { mutation.reset(); setNote(''); setDecision({ claim, action }); }
  const labels = { approve: 'Valider la correspondance', reject: 'Refuser la demande', revoke: 'Retirer la correspondance' };
  const renderClaim = (claim: AdminClaim) => <article className="profile-admin-row" key={claim.id}>
    <div><h3><bdi>{claim.gamertag}</bdi></h3><p><bdi>{claim.displayName || claim.username}</bdi> <span className="profile-muted">(@{claim.username})</span></p>
      <p className="profile-muted">Discord : <code>{claim.discordId}</code></p><small>Demandé le {new Date(claim.createdAt).toLocaleDateString('fr-FR')}</small></div>
    <div className="profile-actions">{claim.status === 'pending' ? <>
      <button className="profile-button" onClick={() => choose(claim, 'approve')}>Valider</button>
      <button className="profile-button profile-button--secondary" onClick={() => choose(claim, 'reject')}>Refuser</button>
    </> : <button className="profile-button profile-button--secondary" onClick={() => choose(claim, 'revoke')}>Retirer le rattachement</button>}</div>
  </article>;
  return <section className="profile-panel profile-admin" id="validation" aria-labelledby="profile-admin-title">
    <p className="profile-eyebrow">Administration du club</p><h2 id="profile-admin-title">Correspondances Discord → joueur</h2>
    <p>Vérifie l’identité sur Discord avant de valider. Chaque joueur peut être rattaché à un seul compte.</p>
    <h3>En attente · {pending.length}</h3>
    {pending.length ? pending.map(renderClaim) : <p className="profile-muted">Aucune demande en attente.</p>}
    <details className="profile-approved"><summary>Correspondances validées · {approved.length}</summary>{approved.map(renderClaim)}</details>
    {decision && <FC27Dialog title={labels[decision.action]} onClose={() => { if (!mutation.isPending) setDecision(null); }}>
      <form className="fc27-form" onSubmit={event => {
        event.preventDefault();
        const action = decision.action === 'approve'
          ? { action: 'approve' as const, requestId: decision.claim.id }
          : { action: decision.action, requestId: decision.claim.id, note };
        mutation.mutate(action, { onSuccess: () => setDecision(null) });
      }}>
        <p><strong><bdi>{decision.claim.displayName || decision.claim.username}</bdi></strong> ↔ <strong><bdi>{decision.claim.gamertag}</bdi></strong></p>
        <p>Identifiant Discord : <code>{decision.claim.discordId}</code></p>
        <p>{decision.action === 'approve' ? 'Sa carte personnelle affichera les statistiques de ce joueur. Les autres demandes pour ce joueur seront refusées.'
          : decision.action === 'revoke' ? 'Le compte devra refaire une demande. Les statistiques du joueur restent conservées.' : 'Le membre pourra choisir un autre joueur et refaire une demande.'}</p>
        {decision.action !== 'approve' && <label>Motif pour le membre (facultatif)<textarea maxLength={240} value={note} onChange={event => setNote(event.target.value)} /></label>}
        <ActionFeedback error={mutation.error} />
        <button className="fc27-button" disabled={mutation.isPending}>{mutation.isPending ? 'Enregistrement…' : 'Confirmer'}</button>
      </form>
    </FC27Dialog>}
  </section>;
}
