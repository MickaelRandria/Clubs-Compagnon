import { NavLink } from 'react-router';
import { useClub } from '../../api/queries';
import { useFC27 } from '../../api/fc27';
import { FC } from '../../lib/tokens';

const TABS = [
  { to: '/', label: 'Dashboard', end: true },
  { to: '/joueurs', label: 'Joueurs', end: false },
  { to: '/matchs', label: 'Matchs', end: false },
  { to: '/stats', label: 'Stats', end: false },
  { to: '/playoffs', label: 'Playoffs', end: false },
];

/** Bande d'onglets (NavLink pose aria-current="page" sur l'onglet actif) + bandeau profil. */
export function TopNav() {
  const club = useClub();
  const preparation = useFC27();
  return (
    <header className="fc-top">
      <nav className="fc-tabs" aria-label="Sections">
        {TABS.map((tab) => (
          <NavLink key={tab.to} to={tab.to} end={tab.end} className="fc-tab">
            {tab.label}
          </NavLink>
        ))}
        {preparation.data?.campaign.status !== 'archived' && (
          <NavLink to="/fc27" className="fc-tab fc-tab--preparation">FC 27 <span>Prépa</span></NavLink>
        )}
      </nav>
      <div className="fc-profile">
        <span className="fc-avatar">RN</span>
        <span>
          <span className="fc-profile-name">Rina94JJG</span>
          <span className="fc-profile-role">Manager</span>
        </span>
        <span className="fc-profile-sr" title="Skill Rating">
          <svg width="14" height="14" viewBox="0 0 24 24" aria-hidden="true">
            <path d="M12 2l9 10-9 10-9-10z" fill={FC.blue} />
          </svg>
          {club.data?.skillRating ?? '—'}
        </span>
      </div>
    </header>
  );
}
