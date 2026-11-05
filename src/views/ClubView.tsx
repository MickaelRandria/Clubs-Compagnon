import { useEffect } from 'react';
import { Link, Navigate, useLocation, useParams } from 'react-router';
import { divisionLabel } from '../../shared/division';
import { levelDivision, SR_DIVISIONS, SR_SURVEY_DATE, SR_TOP100, SR_WORLD_BEST, type Strength } from '../../shared/skill-rating';
import type { Club, Match } from '../../shared/types';
import { useClub, useMatches } from '../api/queries';
import { AveragesTile } from '../components/stats/AveragesTile';
import { ProgressionSection } from '../components/division/ProgressionSection';
import { CareerTile } from '../components/stats/CareerTile';
import { GoalsChart } from '../components/stats/GoalsChart';
import { DataGate } from '../components/ui/DataGate';
import { Skeleton } from '../components/ui/Skeleton';
import { StatTile } from '../components/ui/StatTile';
import { NEXT_NIGHT, PLAYOFF_NIGHT } from '../content/playoffs';
import { formatShortDate } from '../lib/format';
import { usePageTitle } from '../lib/hooks';

/** Sous-pages du club. Le sommaire (/club) les présente en tuiles ; chacune tient en peu d'écrans. */
export const CLUB_SECTIONS = [
  { id: 'progression', label: 'Progression' },
  { id: 'niveau', label: 'Niveau' },
  { id: 'bilan', label: 'Bilan' },
  { id: 'identite', label: 'Identité' },
] as const;
type SectionId = (typeof CLUB_SECTIONS)[number]['id'];

/** Anciennes ancres de la page unique (liens partagés, /stats) → sous-page qui les contient. */
const LEGACY: Record<string, SectionId> = {
  progression: 'progression', niveau: 'niveau', classement: 'niveau', adversaires: 'niveau',
  bilan: 'bilan', palmares: 'bilan', identite: 'identite',
};

/** Club : un sommaire en tuiles, puis une sous-page par thème (progression, niveau, bilan, identité). */
export function ClubView() {
  const { section } = useParams();
  const { hash } = useLocation();
  const club = useClub();
  const matches = useMatches();
  const current = CLUB_SECTIONS.find((s) => s.id === section);
  usePageTitle(current ? `Club · ${current.label}` : 'Club');

  // Une ancre dans la sous-page (#palmares) : on y descend une fois les données là.
  useEffect(() => {
    if (current && hash && club.data) document.getElementById(hash.slice(1))?.scrollIntoView();
  }, [current, hash, club.data]);

  const legacy = !section && hash ? LEGACY[hash.slice(1)] : undefined;
  if (legacy) return <Navigate to={`/club/${legacy}${hash === '#palmares' ? hash : ''}`} replace />;
  if (section && !current) return <Navigate to="/club" replace />;

  return (
    <DataGate queries={[club, matches]} skeleton={<Skeleton rows={[[[1, 1], 180], [[1, 1], 180]]} />}>
      {() => {
        const c = club.data!;
        if (!current) return <ClubHub club={c} />;
        return (
          <div className="fc-view">
            <nav className="fc-tabs fc-tabs--sm fc-club-tabs" aria-label="Sections du club">
              {CLUB_SECTIONS.filter((s) => s.id !== 'identite' || hasIdentity(c)).map((s) => (
                <Link key={s.id} to={`/club/${s.id}`} className={`fc-tab${s.id === current.id ? ' is-active' : ''}`}
                  aria-current={s.id === current.id ? 'page' : undefined}>{s.label}</Link>
              ))}
            </nav>
            {current.id === 'progression' && <ProgressionSection club={c} matches={matches.data!} />}
            {current.id === 'niveau' && <><Level club={c} /><Ranking club={c} /><Rivals club={c} /></>}
            {current.id === 'bilan' && <><Record club={c} matches={matches.data!} /><Honours club={c} /></>}
            {current.id === 'identite' && <Identity club={c} />}
          </div>
        );
      }}
    </DataGate>
  );
}

const hasIdentity = (c: Club) => Boolean(c.kits || c.stadium);

/** Sommaire : une tuile par sous-page, avec le chiffre qui donne envie d'y aller. */
function ClubHub({ club: c }: { club: Club }) {
  const p = c.progress;
  const division = p?.division ?? c.season?.division ?? null;
  const progress = !p || p.status !== 'tracking' || p.division <= 1
    ? { value: division === null ? '—' : divisionLabel(division), sub: `${c.promotions} montées · ${c.relegations} descentes` }
    : p.seriesStarted
      ? { value: `${p.streak}/${p.streakNeeded}`, sub: `Série finale vers l'${divisionLabel(p.division - 1)}` }
      : { value: `${p.points}/${p.target} pts`, sub: `${divisionLabel(p.division)} → ${divisionLabel(p.division - 1)} · ${p.chances} chance${p.chances > 1 ? 's' : ''}` };
  const level = levelDivision(c.skillRating);
  const tiles = [
    { id: 'progression', label: 'Progression', ...progress },
    { id: 'niveau', label: 'Niveau', value: `${c.skillRating}`, sub: `Skill rating${level === null ? '' : ` · niveau ${divisionLabel(level)}`} · classement, adversaires` },
    { id: 'bilan', label: 'Bilan', value: `${c.gamesPlayed} matchs`, sub: `${c.wins} V · ${c.draws} N · ${c.losses} D · palmarès` },
    ...(hasIdentity(c) ? [{ id: 'identite', label: 'Identité', value: c.stadium ?? 'Maillots', sub: c.kits ? 'Stade et maillots' : 'Stade' }] : []),
  ];
  return (
    <div className="fc-view">
      <div className="fc-club-head">
        <h1 className="fc-title fc-title--lg">{c.name}</h1>
        <span className="fc-muted">{[c.region, c.reputation].filter(Boolean).join(' · ')}</span>
      </div>
      <nav className="fc-club-hub" aria-label="Sections du club">
        {tiles.map((t, i) => (
          <Link key={t.id} to={`/club/${t.id}`} className={`fc-block fc-club-hub-tile${i === 0 ? ' is-main' : ''}`}>
            <span className="fc-dv-label">{t.label}</span>
            <b>{t.value}</b>
            <small>{t.sub}</small>
            <span className="fc-club-hub-go" aria-hidden="true">→</span>
          </Link>
        ))}
      </nav>
    </div>
  );
}

function Record({ club: c, matches }: { club: Club; matches: Match[] }) {
  return (
    <section id="bilan" className="fc-club-section" aria-label="Bilan">
      <h2 className="fc-section-head">Bilan <small>{c.gamesPlayed} matchs</small></h2>
      <div className="fc-stats-top">
        <CareerTile club={c} />
        <AveragesTile club={c} />
      </div>
      <GoalsChart matches={matches} />
      <div className="fc-stats-bottom">
        <StatTile label="Ligue" value={c.leagueApps} sub="apparitions" delay={200} />
        <StatTile label="Playoff" value={c.playoffApps} sub="apparitions" delay={250} />
        <StatTile label="Réputation" value={c.reputation} text tone="discret" delay={300} />
      </div>
    </section>
  );
}

/** Ce que dit notre note par rapport à la division où l'on joue. */
function levelSentence(sr: number, division: number | null) {
  const level = levelDivision(sr);
  if (level === null) return 'Notre note est encore sous le niveau typique de la Division 5 : chaque victoire la fait grimper.';
  const levelName = divisionLabel(level);
  if (division === null) return `Notre note est celle d'un club de ${levelName}.`;
  if (level < division) return `On joue en ${divisionLabel(division)}, mais notre note est déjà celle d'un club de ${levelName} : on a le niveau pour monter.`;
  if (level === division) return `Notre note correspond pile à notre division, la ${levelName}.`;
  return `Notre note est celle d'un club de ${levelName}, un cran sous notre division actuelle : chaque victoire compte.`;
}

const HOW = [
  ['Une note qui bouge à chaque match', 'Après chaque match de ligue ou de playoffs, EA ajuste la note du club : elle monte quand on gagne, elle baisse quand on perd. Les amicaux ne comptent pas.'],
  ['Battre plus fort rapporte plus', 'C’est le principe du classement Elo, celui des échecs. Avant chaque match, EA compare notre note à celle de l’adversaire. Battre un club mieux noté rapporte beaucoup ; battre un club moins bien noté rapporte peu. Et dans l’autre sens : perdre contre plus faible coûte cher, perdre contre plus fort coûte peu.'],
  ['Le score et les playoffs comptent', 'Une large victoire rapporte plus qu’un petit 1-0, et les matchs de playoffs font bouger la note plus fort que la ligue.'],
  ['Elle ne choisit pas nos adversaires', 'EA nous fait jouer contre des clubs de notre division, quelle que soit leur note. On peut tomber sur bien plus fort… ou bien plus faible. C’est pour ça que l’app affiche la note de chaque adversaire sur les matchs.'],
] as const;

/** Le skill rating expliqué à ceux qui n'ont jamais entendu parler d'Elo : où on en est, comment ça bouge. */
function Level({ club }: { club: Club }) {
  const rows = [
    { label: 'N°1 mondial', sr: SR_WORLD_BEST, world: true },
    { label: 'Top 100 mondial', sr: SR_TOP100, world: true },
    ...[...SR_DIVISIONS].reverse().map((d) => ({ label: divisionLabel(d.division), sr: d.sr, world: false })),
  ];
  // Notre ligne s'insère sous le premier repère qu'on n'atteint pas.
  const at = rows.findIndex((r) => club.skillRating >= r.sr);
  const cut = at < 0 ? rows.length : at;
  const ladder = [...rows.slice(0, cut), null, ...rows.slice(cut)];
  return (
    <section id="niveau" className="fc-club-section" aria-label="Niveau du club">
      <h2 className="fc-section-head">Skill rating <small>la note de niveau du club</small></h2>
      <div className="fc-level">
        <div className="fc-block fc-hero fc-level-now">
          <span className="fc-badge">Notre note · EA</span>
          <span className="fc-level-num">{club.skillRating}</span>
          <span className="fc-body">{levelSentence(club.skillRating, club.season?.division ?? null)}</span>
        </div>
        <div className="fc-block fc-marine fc-level-ladder" role="list" aria-label="Note typique par division">
          {ladder.map((r) => r === null ? (
            <div key="nous" role="listitem" className="fc-level-row is-active"><span>{club.name}</span><span>{club.skillRating}</span></div>
          ) : (
            <div key={r.label} role="listitem" className={`fc-level-row${r.world ? ' is-world' : ''}`}>
              <span>{r.label}</span><span>{r.world ? r.sr : `~${r.sr}`}</span>
            </div>
          ))}
        </div>
      </div>
      <details className="fc-block fc-marine fc-fold">
        <summary>Comment marche le skill rating ?</summary>
        <div className="fc-level-how">
          {HOW.map(([title, text]) => (
            <div key={title} className="fc-block fc-marine"><h3>{title}</h3><p>{text}</p></div>
          ))}
        </div>
      <div className="fc-block fc-marine fc-level-glossary">
        <p><span className="fc-mtype-badge fc-mtype-badge--exploit">Exploit</span>Victoire contre un club noté plus de 50 points au-dessus de nous.</p>
        <p><span className="fc-mtype-badge fc-mtype-badge--upset">Contre-perf</span>Défaite contre un club noté au moins 100 points en dessous.</p>
        <p><strong>~1650</strong> : note de l’adversaire relevée après le match, elle a pu bouger depuis.</p>
      </div>
        <p className="fc-muted fc-level-source">
        Repères : note médiane des clubs de chaque division parmi les 100 meilleurs de la saison, classements EA du {SR_SURVEY_DATE}.
        EA ne publie pas sa formule exacte.
        </p>
      </details>
    </section>
  );
}

const STRENGTHS: [Strength, string][] = [['stronger', 'Contre plus fort'], ['even', 'À niveau'], ['weaker', 'Contre plus faible']];

/** Le niveau des clubs qu'EA nous a donnés à jouer, et nos résultats selon l'écart. */
function Rivals({ club }: { club: Club }) {
  const { averageSr, sample, record } = club.opponents;
  const gap = averageSr === null ? 0 : averageSr - club.skillRating;
  return (
    <section id="adversaires" className="fc-club-section" aria-label="Adversaires">
      <h2 className="fc-section-head">Adversaires <small>leur skill rating le jour du match</small></h2>
      {averageSr === null ? (
        <div className="fc-block fc-marine"><p className="fc-rivals-line">Le niveau des adversaires se remplit au fil des synchros EA.</p></div>
      ) : (
        <>
          <div className="fc-club-row">
            <StatTile label="Note moyenne" value={averageSr} sub={`${sample} derniers adversaires · nous ${club.skillRating}`} tone="principal" />
            {STRENGTHS.map(([key, label], i) => (
              <StatTile key={key} label={label} value={`${record[key].wins}-${record[key].draws}-${record[key].losses}`} text sub="V-N-D" delay={60 * (i + 1)} />
            ))}
          </div>
          <div className="fc-block fc-marine">
            <p className="fc-rivals-line">
              {Math.abs(gap) <= 50 ? `On affronte en moyenne des clubs de notre niveau (${gap > 0 ? '+' : ''}${gap} points).`
                : gap > 0 ? `On affronte en moyenne des clubs mieux notés que nous (+${gap} points) : chaque victoire rapporte gros.`
                  : `On affronte en moyenne des clubs moins bien notés que nous (${gap} points) : ces victoires rapportent peu, les défaites coûtent cher.`}
              {' '}« À niveau » : moins de 50 points d’écart.
            </p>
          </div>
        </>
      )}
    </section>
  );
}

function Ranking({ club }: { club: Club }) {
  const season = club.season;
  // EA ne publie pas toujours le rang : la division de la saison devient alors le chiffre principal.
  const rank = season?.rank != null ? `${season.rank}e` : null;
  const division = season?.division != null ? divisionLabel(season.division) : null;
  const points = season?.points != null ? `${season.points} pts` : null;
  const record = season ? `${season.wins} V · ${season.draws} N · ${season.losses} D` : null;
  return (
    <section id="classement" className="fc-club-section" aria-label="Classement">
      <h2 className="fc-section-head">Classement <small>Saison EA en cours</small></h2>
      <div className="fc-club-row">
        <StatTile label={rank ? 'Rang' : 'Division actuelle'} value={rank ?? division ?? '—'} text={!rank}
          sub={[rank && division, points, record].filter(Boolean).join(' · ') || 'En attente du classement EA'} tone="principal" />
        <StatTile label="Meilleure div." value={club.bestDivision === null ? '—' : divisionLabel(club.bestDivision)} text delay={60} />
        <StatTile label="Montées" value={club.promotions} delay={120} />
        <StatTile label="Descentes" value={club.relegations} tone="discret" delay={180} />
      </div>
      {season && (
        <div className="fc-stats-bottom">
          <StatTile label="Buts saison" value={season.goalsFor} sub={`${season.goalsAgainst} encaissés`} delay={200} />
          <StatTile label="Clean sheets" value={season.cleanSheets} sub="cette saison" delay={250} />
        </div>
      )}
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
