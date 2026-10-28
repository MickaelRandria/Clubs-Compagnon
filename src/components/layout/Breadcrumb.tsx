import { Link, useLocation } from 'react-router';

interface Crumb {
  label: string;
  to?: string;
}

/** Fil d'Ariane façon FIFA 17 (« PLAY › NEW CAREER »), déduit de l'adresse. */
function crumbsFor(pathname: string): Crumb[] {
  if (/^\/matchs\/[^/]+/.test(pathname)) return [{ label: 'Matchs', to: '/matchs' }, { label: 'Fiche du match' }];
  switch (pathname) {
    case '/': return [{ label: 'Accueil' }];
    case '/joueurs': return [{ label: 'Club', to: '/' }, { label: 'Joueurs' }];
    case '/matchs': return [{ label: 'Club', to: '/' }, { label: 'Matchs' }];
    case '/stats': return [{ label: 'Club', to: '/' }, { label: 'Stats' }];
    case '/playoffs': return [{ label: 'Club', to: '/' }, { label: 'Playoffs' }];
    case '/profil': return [{ label: 'Mon profil' }];
    case '/paris': return [{ label: 'Vestiaire' }, { label: 'Paris' }];
    case '/fc27': return [{ label: 'Saison' }, { label: 'FC 27' }];
    default: return [];
  }
}

export function Breadcrumb() {
  const crumbs = crumbsFor(useLocation().pathname);
  if (crumbs.length === 0) return null;

  return (
    <nav className="fc-crumb" aria-label="Fil d'Ariane">
      {crumbs.map((crumb, i) => (
        <span key={crumb.label} className="fc-crumb-item">
          {i > 0 && <span className="fc-crumb-sep" aria-hidden="true">›</span>}
          {crumb.to ? <Link to={crumb.to}>{crumb.label}</Link> : <span aria-current={i === crumbs.length - 1 ? 'page' : undefined}>{crumb.label}</span>}
        </span>
      ))}
    </nav>
  );
}
