import { NavLink, useLocation } from 'react-router';
import { useBetsStatus } from '../../api/bets';
import { useFC27 } from '../../api/fc27';
import { Glyph, type GlyphName } from '../ui/Glyph';

interface NavItem {
  to: string;
  label: string;
  glyph: GlyphName;
  end?: boolean;
}

const ITEMS: NavItem[] = [
  { to: '/', label: 'Accueil', glyph: 'home', end: true },
  { to: '/matchs', label: 'Matchs', glyph: 'ball' },
  { to: '/joueurs', label: 'Effectif', glyph: 'users' },
  { to: '/club', label: 'Club', glyph: 'shield' },
];

/**
 * Barre de navigation basse (Mobile First Companion App)
 * Optimisée pour la zone du pouce, avec icônes FIFA 20, retours tactiles et tap-to-top.
 */
export function BottomNav() {
  const location = useLocation();
  const preparation = useFC27();
  const showFC27 = preparation.data?.campaign.status !== 'archived';
  const bets = useBetsStatus().status;
  // FoodBet (paris et votes) n'apparaît qu'une fois les paris ouverts au visiteur.
  const items: NavItem[] = bets.access === 'locked' ? ITEMS : [...ITEMS, { to: '/paris', label: 'FoodBet', glyph: 'coin' }];

  const handleItemClick = (to: string) => {
    if (location.pathname === to) {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  return (
    <nav className="fc-bottom-nav" aria-label="Navigation principale mobile">
      {items.map((item) => (
        <NavLink
          key={item.to}
          to={item.to}
          end={item.end}
          onClick={() => handleItemClick(item.to)}
          className={({ isActive }) => `fc-bnav-item${isActive ? ' is-active' : ''}`}
        >
          <span className="fc-bnav-icon">
            <Glyph name={item.glyph} size={20} />
            {item.to === '/paris' && bets.live === 'open' && <span className="fc-bnav-live" aria-label="Paris ouverts" />}
          </span>
          <span className="fc-bnav-label">{item.label}</span>
        </NavLink>
      ))}
      {showFC27 && (
        <NavLink
          to="/fc27"
          onClick={() => handleItemClick('/fc27')}
          className={({ isActive }) => `fc-bnav-item fc-bnav-item--prepa${isActive ? ' is-active' : ''}`}
        >
          <span className="fc-bnav-icon">
            <Glyph name="bolt" size={20} />
          </span>
          <span className="fc-bnav-label">FC 27</span>
        </NavLink>
      )}
    </nav>
  );
}

