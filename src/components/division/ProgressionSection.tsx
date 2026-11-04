import { useState } from 'react';
import { Link } from 'react-router';
import { matchesToPromotion, promotionPaths } from '../../../shared/division-progress';
import { divisionLabel } from '../../../shared/division';
import { SR_DIVISIONS } from '../../../shared/skill-rating';
import type { Club, DivisionEvent, DivisionProgress, Match } from '../../../shared/types';
import { useIsAdmin } from '../../api/profile';
import { useDivisionStart } from '../../api/queries';
import { formatShortDate } from '../../lib/format';
import { ChanceShields, ResultChip, nextDivisionLabel } from './DivisionBits';
import { replayCelebration } from './PromotionCelebration';

/** Club › Progression : où on en est dans la division, ce qu'il manque, nos chances et le parcours. */
export function ProgressionSection({ club, matches }: { club: Club; matches: Match[] }) {
  const p = club.progress ?? null;
  const events = club.divisionEvents ?? [];
  if (!p) return null;
  return (
    <section id="progression" className="fc-club-section" aria-label="Progression en division">
      <h2 className="fc-section-head">Progression <small>{divisionLabel(p.division)} · saison EA</small></h2>
      {p.division <= 1 ? (
        <div className="fc-block fc-marine fc-dv-note"><p>On joue en Élite, la plus haute division : il n'y a plus de montée, seulement des chances à garder.</p></div>
      ) : p.status === 'calibrating' ? (
        <Calibrating progress={p} matches={matches} />
      ) : (
        <Tracking club={club} progress={p} />
      )}
      {events.length > 0 && <Journey events={events} />}
    </section>
  );
}

function Tracking({ club, progress: p }: { club: Club; progress: DivisionProgress }) {
  const remaining = Math.max(0, p.target - p.points);
  const paths = promotionPaths(remaining, p.chances);
  const pace = matchesToPromotion(remaining, p.pointsPerMatch);
  const nextSr = SR_DIVISIONS.find((d) => d.division === p.division - 1)?.sr ?? null;
  return (
    <>
      <div className="fc-block fc-dv-hero">
        <span className="fc-dv-hero-head">
          <span className="fc-dv-label">Objectif montée</span>
          <span>{divisionLabel(p.division)} → {nextDivisionLabel(p.division)}</span>
        </span>
        <span className="fc-dv-hero-num"><b>{p.points}</b> / {p.target} pts</span>
        <span className="fc-dv-ticks" role="img" aria-label={`${p.points} points sur ${p.target}, un trait par point`}>
          {Array.from({ length: p.target }, (_, i) => (
            <i key={i} className={i < p.points ? 'is-on' : i < p.points + 3 && remaining > 0 ? 'is-next' : ''} />
          ))}
        </span>
        <span className="fc-dv-hero-foot">
          <span>{p.record.wins} V · {p.record.draws} N · {p.record.losses} D dans la division</span>
          <span>{p.targetSource === 'observed' ? 'Seuil vu à la dernière montée' : 'Seuil à confirmer'}</span>
        </span>
      </div>

      {p.missingMatches > 0 && (
        <div className="fc-block fc-dv-missing" role="status">
          <b>{p.missingMatches} match{p.missingMatches > 1 ? 's' : ''} manquant{p.missingMatches > 1 ? 's' : ''}.</b> EA en compte plus que l'app n'en a reçu
          depuis le {formatShortDate(p.verifiedSince!)} : points et chances sont peut-être faux.
        </div>
      )}

      {p.relegationMatchNext ? (
        <div className="fc-block fc-dv-missing" role="status"><b>Match de relégation au prochain match.</b> Une victoire ou un nul et on reste ; une défaite et on redescend.</div>
      ) : (
        <div className="fc-dv-kpis">
          <span className="fc-dv-kpi"><b>{remaining} pts</b><span>à prendre</span></span>
          <span className="fc-dv-kpi"><b>{Math.ceil(remaining / 3)} V</b><span>au plus court</span></span>
          <span className="fc-dv-kpi"><b>{pace === null ? '—' : `≈ ${pace}`}</b><span>matchs à ce rythme</span></span>
        </div>
      )}

      {paths.length > 0 && !p.relegationMatchNext && (
        <div className="fc-block fc-marine fc-dv-paths">
          <h3 className="fc-dv-subhead">Les chemins vers la montée</h3>
          {paths.map((path, i) => (
            <div key={i} className="fc-dv-path">
              <span className="fc-dv-chips">{path.results.map((r, j) => <ResultChip key={j} result={r} />)}</span>
              <span className="fc-dv-path-copy">
                <b>Montée en {path.results.length} match{path.results.length > 1 ? 's' : ''}</b>
                <small>{i === 0 ? 'le plus rapide' : path.chancesLeft < p.chances ? `mais il ne resterait que ${path.chancesLeft} chance${path.chancesLeft > 1 ? 's' : ''}` : 'sans perdre'}</small>
              </span>
            </div>
          ))}
          {p.pointsPerMatch !== null && (
            <p className="fc-dv-pace">Rythme des 10 derniers matchs : {String(p.pointsPerMatch).replace('.', ',')} pt par match{pace ? `, soit la montée dans environ ${pace} match${pace > 1 ? 's' : ''}` : ''}.</p>
          )}
        </div>
      )}

      <div className="fc-block fc-marine fc-dv-chance-block">
        <h3 className="fc-dv-subhead">Nos chances <span>{p.chances} / 3</span></h3>
        <span className="fc-dv-chance-big"><ChanceShields chances={p.chances} size={48} /></span>
        <p>Chaque défaite dans la division coûte une chance, une victoire n'en rend pas. À zéro, le match suivant devient un <b>match de relégation</b> :
          le perdre, c'est redescendre en {divisionLabel(p.division + 1)}.</p>
        {p.steps.length > 0 && (
          <span className="fc-dv-history">
            <span className="fc-dv-label">Dans la div.</span>
            {p.steps.slice(-12).map((s) => (
              <Link key={s.matchId} to={`/matchs/${s.matchId}`} aria-label={`Match ${s.matchId}`}><ResultChip result={s.result} /></Link>
            ))}
          </span>
        )}
      </div>

      {nextSr !== null && (
        <div className="fc-block fc-marine fc-dv-note">
          <p>Les points font monter, la note dit si on tiendra là-haut. Notre skill rating : <b>{club.skillRating}</b>,
            niveau typique de la {nextDivisionLabel(p.division)} : <b>~{nextSr}</b>.
            {club.skillRating >= nextSr ? ' On a déjà le niveau.' : ` Il nous manque environ ${Math.round((nextSr - club.skillRating) / 10) * 10} de note.`}</p>
        </div>
      )}
    </>
  );
}

/** Pas encore de point de départ : un admin indique le premier match joué dans la division. */
function Calibrating({ progress: p, matches }: { progress: DivisionProgress; matches: Match[] }) {
  const isAdmin = useIsAdmin();
  const start = useDivisionStart();
  const [open, setOpen] = useState(false);
  const league = matches.filter((m) => m.type === 'league').slice(0, 15);
  return (
    <div className="fc-block fc-marine fc-dv-note">
      <p><b>Suivi à démarrer.</b> EA nous dit qu'on joue en {divisionLabel(p.division)}, mais pas depuis quel match : impossible de compter
        les points ({p.target} pour monter) et les chances sans ce point de départ. Le suivi démarre tout seul à la prochaine montée ou descente.</p>
      {isAdmin && (
        <>
          <button type="button" className="fc-cta fc-dv-start" onClick={() => setOpen((v) => !v)} aria-expanded={open}>
            Indiquer le premier match en {divisionLabel(p.division)}
          </button>
          {open && (
            <div className="fc-dv-pick">
              <button type="button" disabled={start.isPending} onClick={() => start.mutate(null)}>Aucun encore : on vient d'y arriver</button>
              {league.map((m) => (
                <button key={m.id} type="button" disabled={start.isPending} onClick={() => start.mutate(m.id)}>
                  <ResultChip result={m.result} />
                  <span>{m.goalsFor}–{m.goalsAgainst} contre {m.opponent}</span>
                  <small>{formatShortDate(m.playedAt)}</small>
                </button>
              ))}
              {start.isError && <p className="fc-dv-error" role="alert">{start.error.message}</p>}
            </div>
          )}
        </>
      )}
    </div>
  );
}

const EVENT_TITLE: Record<DivisionEvent['kind'], string> = { promotion: 'Montée', relegation: 'Descente', anchor: 'Début du suivi', season: 'Nouvelle saison' };

function Journey({ events }: { events: DivisionEvent[] }) {
  const lastPromotion = events.find((e) => e.kind === 'promotion');
  return (
    <div className="fc-block fc-marine fc-dv-journey">
      <h3 className="fc-dv-subhead">Parcours du club</h3>
      <ol>
        {events.map((e) => (
          <li key={e.id} className={`is-${e.kind}`}>
            <span className="fc-dv-journey-dot" aria-hidden="true" />
            <span>
              <b>{EVENT_TITLE[e.kind]} · {e.fromDivision === null ? divisionLabel(e.toDivision) : `${divisionLabel(e.fromDivision)} → ${divisionLabel(e.toDivision)}`}</b>
              <small>
                {formatShortDate(e.at)}
                {e.match && <> · {e.kind === 'anchor' ? 'premier match' : 'après'} {e.match.goalsFor}–{e.match.goalsAgainst} contre {e.match.opponent}</>}
                {e.record && <> · {e.record.wins} V {e.record.draws} N {e.record.losses} D</>}
                {!e.exact && e.kind !== 'anchor' && ' · match déduit'}
              </small>
            </span>
          </li>
        ))}
      </ol>
      {lastPromotion && (
        <button type="button" className="fc-dv-replay" onClick={() => replayCelebration(lastPromotion.id)}>Revoir la célébration de la dernière montée</button>
      )}
    </div>
  );
}
