import { useEffect } from 'react';
import { Link, useLocation } from 'react-router';
import { divisionLabel } from '../../shared/division';
import type { Club } from '../../shared/types';
import { useClub, useMatches } from '../api/queries';
import { AveragesTile } from '../components/stats/AveragesTile';
import { CareerTile } from '../components/stats/CareerTile';
import { GoalsChart } from '../components/stats/GoalsChart';
import { DataGate } from '../components/ui/DataGate';
import { Skeleton } from '../components/ui/Skeleton';
import { StatTile } from '../components/ui/StatTile';
import { NEXT_NIGHT, PLAYOFF_NIGHT } from '../content/playoffs';
import { formatShortDate } from '../lib/format';
import { usePageTitle } from '../lib/hooks';

const SECTIONS = [
  ['classement', 'Classement'],
  ['palmares', 'Palmarès'],
  ['bilan', 'Bilan'],
  ['identite', 'Identité'],
] as const;

/** Club : classement EA, palmarès (nuits Inhouse et playoffs EA), bilan et identité. Remplace Stats et Playoffs. */
export function ClubView() {
  usePageTitle('Club');
  const club = useClub();
  const matches = useMatches();
  const { hash } = useLocation();

  // L'ancienne page Stats redirige vers #bilan : on y descend une fois la page chargée.
  useEffect(() => {
    if (hash && club.data) document.getElementById(hash.slice(1))?.scrollIntoView();
  }, [hash, club.data]);

  return (
    <DataGate queries={[club, matches]} skeleton={<Skeleton rows={[[[1.55, 1, 1, 1], 150], [[1], 260], [[1.55, 1], 380]]} />}>
      {() => {
        const c = club.data!;
        return (
          <div className="fc-view">
            <div className="fc-club-head">
              <h1 className="fc-title fc-title--lg">{c.name}</h1>
              <span className="fc-muted">{[c.region, c.reputation, c.stadium].filter(Boolean).join(' · ')}</span>
            </div>
            <nav className="fc-tabs fc-tabs--sm fc-club-tabs" aria-label="Sections du club">
              {SECTIONS.map(([id, label]) => (
                <a key={id} href={`#${id}`} className="fc-tab">{label}</a>
              ))}
            </nav>

            <Ranking club={c} />
            <Honours club={c} />

            <section id="bilan" className="fc-club-section" aria-label="Bilan">
              <h2 className="fc-section-head">Bilan <small>{c.gamesPlayed} matchs</small></h2>
              <div className="fc-stats-top">
                <CareerTile club={c} />
                <AveragesTile club={c} />
              </div>
              <GoalsChart matches={matches.data!} />
              <div className="fc-stats-bottom">
                <StatTile label="Ligue" value={c.leagueApps} sub="apparitions" delay={200} />
                <StatTile label="Playoff" value={c.playoffApps} sub="apparitions" delay={250} />
                <StatTile label="Réputation" value={c.reputation} text tone="discret" delay={300} />
              </div>
            </section>

            <Identity club={c} />
          </div>
        );
      }}
    </DataGate>
  );
}

function Ranking({ club }: { club: Club }) {
  const season = club.season;
  // EA ne publie pas toujours le rang : la division de la saison devient alors le chiffre principal.
  const rank = season?.rank != null ? `${season.rank}e` : null;
  const division = season?.division != null ? divisionLabel(season.division) : null;
  const points = season?.points != null ? `${season.points} pts` : null;
  return (
    <section id="classement" className="fc-club-section" aria-label="Classement">
      <h2 className="fc-section-head">Classement <small>Saison EA en cours</small></h2>
      <div className="fc-club-row">
        <StatTile label={rank ? 'Rang' : 'Division actuelle'} value={rank ?? division ?? '—'} text={!rank}
          sub={[rank && division, points].filter(Boolean).join(' · ') || 'En attente du classement EA'} tone="principal" />
        <StatTile label="Meilleure div." value={club.bestDivision === null ? '—' : divisionLabel(club.bestDivision)} text delay={60} />
        <StatTile label="Montées" value={club.promotions} delay={120} />
        <StatTile label="Descentes" value={club.relegations} tone="discret" delay={180} />
      </div>
    </section>
  );
}

function Honours({ club }: { club: Club }) {
  const nextPlayed = Date.parse(NEXT_NIGHT.date) < Date.now();
  return (
    <section id="palmares" className="fc-club-section" aria-label="Palmarès">
      <h2 className="fc-section-head">Palmarès <small>{club.playoffApps} matchs de playoffs</small></h2>
      <div className="fc-block fc-hero fc-night-next">
        <span className="fc-night-next-copy">
          <span className="fc-badge">{nextPlayed ? `Jouée le ${formatShortDate(NEXT_NIGHT.date)}` : `À venir · ${formatShortDate(NEXT_NIGHT.date)}`}</span>
          <span className="fc-title fc-title--md">Nuit Inhouse {NEXT_NIGHT.number}</span>
          <span className="fc-body">{NEXT_NIGHT.pitch}</span>
        </span>
      </div>
      <Link to="/playoffs" className="fc-block fc-marine fc-honour">
        <span>
          <span className="fc-honour-title">Nuit Inhouse 1</span>
          <span className="fc-muted">Chez {PLAYOFF_NIGHT.host} · Division {PLAYOFF_NIGHT.division}</span>
        </span>
        <span className="fc-honour-score">{PLAYOFF_NIGHT.wins} V · {PLAYOFF_NIGHT.losses} D</span>
      </Link>
      <div className="fc-block fc-marine fc-honours">
        {club.playoffHistory.length === 0 ? (
          <span className="fc-muted">EA n'a encore renvoyé aucune saison de playoffs.</span>
        ) : (
          club.playoffHistory.map((p) => (
            <div key={p.season} className="fc-honours-row">
              <span>{p.season}</span>
              <span className="fc-muted">{p.division === null ? '' : divisionLabel(p.division)}</span>
              <strong>{p.finish ?? '—'}</strong>
            </div>
          ))
        )}
      </div>
    </section>
  );
}

function Identity({ club }: { club: Club }) {
  if (!club.kits && !club.stadium) return null;
  const kits = club.kits ? ([['Domicile', club.kits.home], ['Extérieur', club.kits.away], ['Third', club.kits.third]] as const) : [];
  return (
    <section id="identite" className="fc-club-section" aria-label="Identité">
      <h2 className="fc-section-head">Identité <small>{club.stadium ?? ''}</small></h2>
      {kits.length > 0 && (
        <div className="fc-block fc-marine fc-kits">
          {kits.map(([label, colors]) => (
            <span key={label} className="fc-kit">
              <span className="fc-kit-swatch" aria-hidden="true">
                {colors.map((color, i) => <i key={i} style={{ background: color }} />)}
              </span>
              {label}
            </span>
          ))}
        </div>
      )}
    </section>
  );
}
