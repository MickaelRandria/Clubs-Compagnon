import { Link, NavLink } from 'react-router';
import { useMe } from '../../api/auth';
import { useProfile } from '../../api/profile';
import { useBetsStatus } from '../../api/bets';
import { useFC27 } from '../../api/fc27';
import { useClub } from '../../api/queries';
import { SHIELD_PATH } from '../../lib/shield';
import { FC } from '../../lib/tokens';
import { Glyph } from '../ui/Glyph';
import { useCoach } from '../coach/CoachContext';

const TABS = [
  { to: '/', label: 'Accueil', end: true },
  { to: '/matchs', label: 'Matchs', end: false },
  { to: '/joueurs', label: 'Effectif', end: false },
  { to: '/club', label: 'Club', end: false },
];

/** Bandeau haut : sur desktop onglets + profil, sur mobile identité club + profil. */
export function TopNav() {
  const { openCoach } = useCoach();
  const me = useMe();
  const profile = useProfile();
  const account = me.data?.signedIn ? me.data.account : null;
  const player = account ? profile.data?.player : null;
  const label = player?.gamertag ?? (account ? account.displayName || account.username : 'Mon profil');
  const pending = profile.data?.request?.status === 'pending';
  const role = !account ? 'Connexion Discord' : profile.data?.isAdmin ? 'Admin · Profil'
    : player ? 'Statistiques Club Pro' : pending ? 'Validation en attente' : 'Choisir mon joueur';
  const preparation = useFC27();
  const bets = useBetsStatus().status;
  const club = useClub();

  return (
    <header className="fc-top">
      {/* Sur mobile : marque du club à gauche, et le skill rating qui mène à son explication */}
      <div className="fc-top-brand">
        <Link to="/" className="fc-top-brand-home" aria-label="Accueil FoodBall Club">
          <svg viewBox="0 0 96 106" width="28" height="31" aria-hidden="true">
            <path d={SHIELD_PATH} fill={FC.blue} stroke={FC.craie} strokeWidth="5" />
            <text
              x="48"
              y="76"
              textAnchor="middle"
              fill={FC.craie}
              fontFamily="'Barlow Condensed', sans-serif"
              fontWeight="800"
              fontStyle="italic"
              fontSize="58"
            >
              F
            </text>
          </svg>
          <span className="fc-top-brand-text">
            FOODBALL<span>CLUB</span>
          </span>
        </Link>
        {club.data && (
          <Link to="/club#niveau" className="fc-top-brand-sr" aria-label={`Skill rating du club : ${club.data.skillRating}. C'est quoi ?`}>
            {club.data.skillRating}
            <small>SR</small>
          </Link>
        )}
      </div>

      {/* Sur desktop : bande d'onglets */}
      <nav className="fc-tabs" aria-label="Sections">
        {TABS.map((tab) => (
          <NavLink key={tab.to} to={tab.to} end={tab.end} className="fc-tab">
            {tab.label}
          </NavLink>
        ))}
        {preparation.data?.campaign.status !== 'archived' && (
          <NavLink to="/fc27" className="fc-tab fc-tab--preparation">FC 27</NavLink>
        )}
        {bets.access !== 'locked' && (
          <NavLink to="/paris" className="fc-tab fc-tab--bets">
            Vestiaire{bets.live === 'open' && <span className="fc-tab-live">Ouverts</span>}
          </NavLink>
        )}
      </nav>

      {/* Bouton Coach IA */}
      <button
        type="button"
        onClick={() => openCoach()}
        className="fc-coach-nav-trigger"
        aria-label="Ouvrir le Coach IA"
        title="Poser une question au Coach IA de FoodBall Club"
      >
        <Glyph name="bolt" size={14} />
        <span>Coach IA</span>
      </button>

      {/* Profil joueur / compte */}
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

