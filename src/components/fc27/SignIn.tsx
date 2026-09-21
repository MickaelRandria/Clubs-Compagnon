import type { FC27Player } from '../../../shared/fc27';
import { Link, useLocation } from 'react-router';
import { useLogout, useMe } from '../../api/auth';

/** Fiche du compte connecté, si elle existe déjà dans cette campagne. */
export function useMyProfile(players: FC27Player[]) {
  const me = useMe();
  const account = me.data?.signedIn ? me.data.account : null;
  return {
    loading: me.isLoading,
    account,
    canSignIn: me.data?.signedIn === false && me.data.canSignIn,
    profile: account ? players.find((p) => p.account_id === account.id) ?? null : null,
  };
}

/** Bouton de connexion. Une navigation complète, pas un fetch : Discord répond par une redirection. */
export function SignInButton({ className = 'fc27-pad fc27-pad--primary' }: { className?: string }) {
  const location = useLocation();
  const me = useMe();
  if (me.isLoading) return <span role="status">Vérification de la connexion…</span>;
  if (me.isError) return <button type="button" className={className} onClick={() => void me.refetch()}>Réessayer la connexion</button>;
  if (!me.data || (me.data.signedIn === false && !me.data.canSignIn)) return <span role="status">Connexion indisponible pour le moment.</span>;
  const returnTo = location.pathname + location.search + location.hash;
  // `fc27-signin` est une accroche stable pour le guide : la classe de style, elle, change selon le contexte.
  return <a className={`fc27-signin ${className}`} href={`/api/auth/discord?returnTo=${encodeURIComponent(returnTo)}`}>
    <DiscordMark /> Se connecter avec Discord
  </a>;
}

/** Compte connecté, avec sa déconnexion. */
export function AccountChip() {
  const location = useLocation();
  const me = useMe();
  const logout = useLogout();
  if (!me.data?.signedIn) return null;
  const { account } = me.data;
  return <span className="fc27-account">
    <Avatar account={account} size={26} />
    <span>
      <span className="fc27-account-label">Connecté</span>
      <span className="fc27-account-name"><bdi>{account.displayName || account.username}</bdi></span>
    </span>
    {location.pathname !== '/profil' && <Link className="fc27-account-profile" to="/profil">Mon profil ↗</Link>}
    <button type="button" onClick={() => logout.mutate()} disabled={logout.isPending}>
      {logout.isPending ? '…' : 'Se déconnecter'}
    </button>
    {logout.isError && <span role="alert">Déconnexion impossible. Réessaie.</span>}
  </span>;
}

/** Avatar Discord, ou les initiales quand le compte n'en a pas. */
function Avatar({ account, size }: { account: { username: string; displayName: string | null; avatarUrl: string | null }; size: number }) {
  if (account.avatarUrl) return <img src={account.avatarUrl} alt="" width={size} height={size} loading="lazy" decoding="async" />;
  return <b aria-hidden="true">{(account.displayName || account.username).slice(0, 2).toUpperCase()}</b>;
}

/** Rappel du compte dans la tuile « Ton joueur » : c'est là que l'action se fait. */
export function SignedInAs() {
  const me = useMe();
  if (!me.data?.signedIn) return null;
  const { account } = me.data;
  return <p className="fc27-player-signed">
    <Avatar account={account} size={22} />
    <span>Ta fiche, <strong><bdi>{account.displayName || account.username}</bdi></strong></span>
  </p>;
}

/** Message de retour quand la connexion a échoué, lu depuis `?connexion=`. */
export function SignInNotice({ reason }: { reason: string | null }) {
  if (!reason) return null;
  const messages: Record<string, string> = {
    refus: 'Connexion annulée : tu as refusé sur l’écran Discord.',
    etat: 'La connexion a expiré en route. Relance-la.',
    code: 'Discord n’a pas renvoyé de code. Réessaie.',
    discord: 'Discord n’a pas répondu. Réessaie dans un instant.',
    indisponible: 'La connexion n’est pas disponible sur ce site pour le moment.',
  };
  return <p className="fc27-signin-notice" role="alert">{messages[reason] ?? 'La connexion a échoué. Réessaie.'}</p>;
}

function DiscordMark() {
  return <svg viewBox="0 0 24 18" width="20" height="15" aria-hidden="true" focusable="false">
    <path fill="currentColor" d="M20.3 1.6A19.8 19.8 0 0 0 15.4.1l-.3.5c1.6.4 3 1 4.4 1.8a16.8 16.8 0 0 0-14.9 0C6 1.6 7.4 1 9 .6L8.7.1a19.8 19.8 0 0 0-5 1.5C.7 6.1-.2 10.5.3 14.9a20 20 0 0 0 6 3l1.2-1.7c-.9-.3-1.8-.8-2.6-1.3l.6-.5a14.3 14.3 0 0 0 12.2 0l.6.5c-.8.5-1.7 1-2.6 1.3l1.2 1.7a20 20 0 0 0 6-3c.6-5.1-.8-9.5-3.6-13.3ZM8 12.2c-1.2 0-2.1-1.1-2.1-2.4S6.8 7.4 8 7.4s2.2 1.1 2.2 2.4-1 2.4-2.2 2.4Zm8 0c-1.2 0-2.1-1.1-2.1-2.4s.9-2.4 2.1-2.4 2.2 1.1 2.2 2.4-1 2.4-2.2 2.4Z" />
  </svg>;
}
