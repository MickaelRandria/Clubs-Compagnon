import { useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import type { ClubProfile } from '../../shared/profile';
import type { Account } from '../../server/auth-http';
import { useMe } from '../api/auth';
import { useProfile, useProfileAction } from '../api/profile';
import { AccountChip, SignInButton, SignInNotice } from '../components/fc27/SignIn';
import { ActionFeedback } from '../components/fc27/FC27Dialog';
import { MyPlayerCard } from '../components/players/MyPlayerCard';
import { PlayerClaimAdmin } from '../components/players/PlayerClaimAdmin';
import { usePageTitle } from '../lib/hooks';
import { POS_LABEL } from '../lib/labels';
import '../styles/profile.css';

function ProfileContent({ profile, account }: { profile: ClubProfile; account: Account }) {
  const [memberId, setMemberId] = useState('');
  const [search, setSearch] = useState('');
  const mutation = useProfileAction();
  const request = profile.request;
  const pending = request?.status === 'pending';
  const canChoose = !pending && !profile.player;
  const filtered = profile.availablePlayers.filter(player => player.gamertag.toLocaleLowerCase('fr').includes(search.trim().toLocaleLowerCase('fr')));
  const selected = profile.availablePlayers.find(player => String(player.id) === memberId);
  const notices = { rejected: 'La demande a été refusée.', revoked: 'Le rattachement a été retiré par un administrateur.', cancelled: 'Tu as annulé ta demande.' };
  return <>
    {profile.player ? <MyPlayerCard player={profile.player} account={account} clubName={profile.club.name} /> : <section className="profile-panel" aria-labelledby="profile-link-title">
      <p className="profile-eyebrow">{profile.club.name} · Ton identité dans le club</p>
      <ol className="profile-steps" aria-label="Rattacher mon joueur"><li>1 · Discord connecté</li><li aria-current={canChoose ? 'step' : undefined}>2 · Choisir mon joueur</li><li aria-current={pending ? 'step' : undefined}>3 · Validation admin</li></ol>
      <h2 id="profile-link-title">{pending ? 'Ta demande est en attente' : 'Quel joueur es-tu dans le club ?'}</h2>
      {pending ? <div className="profile-pending" role="status"><strong><bdi>{request.gamertag}</bdi></strong><p>Ta demande a bien été envoyée. Un administrateur doit confirmer la correspondance avec ton compte Discord. Ta carte et tes statistiques apparaîtront ici après validation.</p>
        <p className="profile-muted">Demandé le {new Date(request.createdAt).toLocaleDateString('fr-FR')} · Tu peux continuer à parcourir le club.</p>
        <button className="profile-button profile-button--secondary" disabled={mutation.isPending} onClick={() => mutation.mutate({ action: 'cancel', requestId: request.id })}>Annuler ma demande</button>
      </div> : <>
        {request && request.status in notices && <div className="profile-notice" role="status"><strong>{notices[request.status as keyof typeof notices]}</strong>{request.reviewNote && <p>{request.reviewNote}</p>}<p>Tu peux envoyer une nouvelle demande ci-dessous.</p></div>}
        <p>Choisis ton pseudo Club Pro dans l’effectif. Après validation par un administrateur, tu retrouveras ici ta carte, tes buts, tes passes décisives et tes autres statistiques.</p>
        {profile.availablePlayers.length ? <form className="profile-form" onSubmit={event => {
          event.preventDefault(); if (!selected) return;
          mutation.mutate({ action: 'request', memberId: selected.id });
        }}>
          <label>Rechercher mon joueur<input type="search" value={search} onChange={event => setSearch(event.target.value)} placeholder="Ton pseudo dans le club" /></label>
          <fieldset><legend>Joueurs disponibles</legend><div className="profile-player-options">{filtered.map(player => <label className={`profile-player-option${memberId === String(player.id) ? ' is-selected' : ''}`} key={player.id}>
            <input type="radio" name="club-player" value={player.id} checked={memberId === String(player.id)} onChange={() => { setMemberId(String(player.id)); mutation.reset(); }} />
            <span><strong><bdi>{player.gamertag}</bdi></strong><small>{POS_LABEL[player.position]}</small></span><b>{player.ovr}<small>OVR</small></b>
          </label>)}</div>{!filtered.length && <p role="status">Aucun joueur ne correspond à ta recherche.</p>}</fieldset>
          {selected && <p>Ta sélection : <strong><bdi>{selected.gamertag}</bdi></strong></p>}
          <button className="profile-button" disabled={mutation.isPending || !selected}>{mutation.isPending ? 'Envoi…' : 'Demander le rattachement'}</button>
          <p className="profile-muted">Ton joueur manque ou est déjà rattaché ? Contacte un administrateur sur Discord.</p>
        </form> : <p className="profile-notice">Aucun joueur disponible pour le moment. Contacte un administrateur sur Discord si ton pseudo manque.</p>}
      </>}
      <ActionFeedback error={mutation.error} />
    </section>}
    <div className="profile-shortcuts"><Link to="/joueurs">L’effectif et ses statistiques ↗</Link><Link to="/fc27?vue=fiche">Préparer mon joueur FC 27 ↗</Link></div>
    {profile.isAdmin && <PlayerClaimAdmin claims={profile.adminClaims} />}
  </>;
}

export function ProfileView() {
  usePageTitle('Mon profil');
  const me = useMe();
  const profile = useProfile();
  const [params] = useSearchParams();
  const account = me.data?.signedIn ? me.data.account : null;
  return <div className="fc-view profile-view"><header className="profile-heading"><div><p className="profile-eyebrow">Le club, à ton nom</p><h1 className="fc-title">Mon profil</h1></div><AccountChip /></header>
    <SignInNotice reason={params.get('connexion')} />
    {me.isLoading ? <p role="status">Chargement de ton compte…</p> : !account ? <section className="profile-panel"><h2>Retrouve ton joueur Club Pro</h2><p>Connecte-toi avec Discord, choisis ton joueur et fais valider la correspondance par un administrateur.</p><SignInButton /></section>
      : !profile.data ? <section className="profile-panel">{profile.isError ? <><p role="alert">{profile.error.message}</p><button className="profile-button" onClick={() => void profile.refetch()}>Réessayer</button></> : <p role="status">Chargement de ton profil…</p>}</section>
        : <>{profile.isError && <p className="profile-notice" role="alert">Actualisation impossible. Les dernières informations restent affichées.</p>}<ProfileContent key={account.id} profile={profile.data} account={account} /></>}
  </div>;
}
