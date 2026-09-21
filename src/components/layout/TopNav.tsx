import { Link, NavLink } from 'react-router';
import { useMe } from '../../api/auth';
import { useProfile } from '../../api/profile';
import { useFC27 } from '../../api/fc27';
import { useIsMobile } from '../../lib/hooks';

// `court` sert uniquement sur mobile : les six onglets y tiennent sur une seule rangée,
// sans défilement horizontal. Auparavant « Playoffs » et « FC 27 » débordaient de 183 px,
// hors écran et sans rien qui signale qu'on pouvait faire défiler — la préparation FC 27,
// qui est le cœur de l'app, était donc invisible sur téléphone.
const TABS = [
  { to: '/', label: 'Dashboard', court: 'Accueil', end: true },
  { to: '/joueurs', label: 'Joueurs', court: 'Joueurs', end: false },
  { to: '/matchs', label: 'Matchs', court: 'Matchs', end: false },
  { to: '/stats', label: 'Stats', court: 'Stats', end: false },
  { to: '/playoffs', label: 'Playoffs', court: 'Playoffs', end: false },
];

/** Bande d'onglets (NavLink pose aria-current="page" sur l'onglet actif) + bandeau profil. */
export function TopNav() {
  const me = useMe();
  const profile = useProfile();
  const account = me.data?.signedIn ? me.data.account : null;
  const player = account ? profile.data?.player : null;
  const label = player?.gamertag ?? (account ? account.displayName || account.username : 'Mon profil');
  const pending = profile.data?.request?.status === 'pending';
  const role = !account ? 'Connexion Discord' : profile.data?.isAdmin ? 'Administrateur · Mon profil'
    : player ? 'Mes statistiques Club Pro' : pending ? 'Validation en attente' : 'Choisir mon joueur';
  const preparation = useFC27();
  const isMobile = useIsMobile();
  return (
    <header className="fc-top">
      <nav className="fc-tabs" aria-label="Sections">
        {TABS.map((tab) => (
          <NavLink key={tab.to} to={tab.to} end={tab.end} className="fc-tab">
            {isMobile ? tab.court : tab.label}
          </NavLink>
        ))}
        {preparation.data?.campaign.status !== 'archived' && (
          <NavLink to="/fc27" className="fc-tab fc-tab--preparation">FC 27{!isMobile && <> <span>Prépa</span></>}</NavLink>
        )}
      </nav>
      <Link to="/profil" className="fc-profile" aria-label={`${label} · ${role}`}>
        <span className="fc-avatar">{account?.avatarUrl ? <img src={account.avatarUrl} alt="" width={34} height={34} /> : account ? label.slice(0, 2).toUpperCase() : '→'}</span>
        <span>
          <span className="fc-profile-name"><bdi>{label}</bdi></span>
          <span className="fc-profile-role">{role}</span>
        </span>
        {player && <span className="fc-profile-sr" title="OVR de ton joueur">{player.ovr}</span>}
      </Link>
    </header>
  );
}
