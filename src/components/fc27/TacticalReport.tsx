import { useMemo } from 'react';
import type { FC27Player } from '../../../shared/fc27';
import { profileFromPlayer } from '../../../shared/fc27-player';
import { squadFingerprint } from '../../../shared/staff-report';
import { analyzeSquad } from '../../../shared/tacticalAdvisor';
import { useStaffReport } from '../../api/fc27';
import { PlayerPhoto } from './PlayersPreparation';
import { Fold } from './sections';

/** Horodatage court : « il y a 2 h », « hier ». Le staff n'a pas besoin de la seconde près. */
function since(iso: string): string {
  const minutes = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60_000));
  if (minutes < 2) return 'à l’instant';
  if (minutes < 60) return `il y a ${minutes} min`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `il y a ${hours} h`;
  const days = Math.round(hours / 24);
  return days === 1 ? 'hier' : `il y a ${days} j`;
}

/**
 * Analyse rédigée, posée sur les faits du moteur déterministe.
 * Absente tant qu'elle n'est pas disponible : le rapport chiffré se suffit à lui-même,
 * et un bandeau d'erreur technique n'apporterait rien au vestiaire.
 */
function StaffReading({ query }: { query: ReturnType<typeof useStaffReport> }) {
  if (query.isLoading) {
    return <div className="fc27-staff fc27-staff--loading" aria-live="polite">
      <p className="fc27-report-label">Lecture du staff</p>
      <p className="fc27-staff-wait">Le staff relit la composition…</p>
    </div>;
  }
  const data = query.data;
  if (!data?.available) return null;
  const { report } = data;

  return <section className="fc27-staff" aria-labelledby="fc27-staff-title">
    <div className="fc27-staff-head">
      <p className="fc27-report-label" id="fc27-staff-title">Lecture du staff</p>
      <span className="fc27-staff-meta" title={`Analyse rédigée par ${data.model}, à partir des chiffres du moteur.`}>
        {data.cached ? 'Analyse en cache' : 'Analyse fraîche'} · {since(data.generatedAt)}
      </span>
    </div>
    <p className="fc27-staff-headline">{report.headline}</p>
    <p className="fc27-staff-reading">{report.reading}</p>

    <Fold title="Ce qu’il manque, par urgence" count={report.priorities.length}>
    <div className="fc27-staff-needs">
      <ol>
        {report.priorities.map((priority, index) => <li key={priority.need}>
          <span className="fc27-staff-rank">{index + 1}</span>
          <span>
            <strong>{priority.need}</strong>
            <em>{priority.why}</em>
            {priority.stopgap && <b>En attendant : {priority.stopgap}</b>}
          </span>
        </li>)}
      </ol>
    </div>
    </Fold>
  </section>;
}

/** Paliers de la note : ambre à construire, vert solide, bleu glacier élite. */
function tierOf(score: number) {
  if (score >= 75) return { key: 'elite', label: 'Synergie élite' };
  if (score >= 45) return { key: 'solid', label: 'Bonne base' };
  return { key: 'build', label: 'À construire' };
}

/** Rapport tactique calculé en direct à partir des fiches de l'effectif (shared/tacticalAdvisor.ts). */
export function TacticalReport({ players, campaignId }: { players: FC27Player[]; campaignId: number }) {
  const analysis = useMemo(() => analyzeSquad(players.map(profileFromPlayer)), [players]);
  const { synergyScore: score, playstyleIdentity: identity, squadDeficits: deficits, playerTips: tips } = analysis;
  const hash = useMemo(() => squadFingerprint(players), [players]);
  const staff = useStaffReport(campaignId, hash, players.length >= 3);
  /** Conseil rédigé par le staff quand il existe ; sinon celui du moteur. Un seul par joueur. */
  const staffAdvice = useMemo(() => {
    const data = staff.data;
    if (!data?.available) return new Map<string, string>();
    return new Map(data.report.players.map((entry) => [entry.pseudo, entry.advice]));
  }, [staff.data]);
  const tier = tierOf(score);
  const empty = players.length === 0;

  return <section className="fc-block fc27-report" aria-labelledby="fc27-report-title">
    <div className="fc27-section-head">
      <div><p className="fc27-eyebrow">Le staff analyse le vestiaire</p><h2 id="fc27-report-title" className="fc27-section-title">Rapport tactique & synergie</h2></div>
      <span className="fc27-report-meta">{empty ? 'En attente des premières fiches' : `Basé sur ${players.length} fiche${players.length > 1 ? 's' : ''} · En direct`}</span>
    </div>

    <div className="fc27-report-grid">
      <div className={`fc27-report-card fc27-rating fc27-rating--${tier.key}`}>
        <p className="fc27-report-label">Note du club</p>
        <div className="fc27-crest" role="img" aria-label={`Synergie ${score} sur 100 : ${tier.label}`}>
          <svg viewBox="0 0 160 184" aria-hidden="true">
            <path className="fc27-crest-shape" d="M80 4 152 26v70c0 44-30 72-72 84C38 168 8 140 8 96V26Z" />
            <path className="fc27-crest-band" d="M8 128h144v-10H8Z" />
          </svg>
          <strong aria-hidden="true">{score}</strong>
          <span aria-hidden="true">Synergie</span>
        </div>
        <span className="fc27-rating-tier">{tier.label}</span>
        <span className="fc27-rating-scale" aria-hidden="true"><i style={{ width: `${score}%` }} /></span>
      </div>

      <div className="fc27-report-card fc27-identity">
        <p className="fc27-report-label">Style de jeu recommandé</p>
        <div className="fc27-formation-row"><span className="fc27-formation" title="Formation conseillée">{identity.recommendedFormation}</span><span>Formation<br />conseillée</span></div>
        <h3>{identity.title}</h3>
        <p>{identity.description}</p>
      </div>

      <div className="fc27-report-card fc27-deficits">
        <Fold title="Points d’attention" count={empty ? undefined : deficits.length}>
          <p className="fc27-report-label fc27-report-label--desktop">Points d’attention {!empty && <b>{deficits.length}</b>}</p>
          {deficits.length === 0 ? <p className="fc27-ok"><span className="fc27-alert-icon" aria-hidden="true">✓</span>Aucun manque majeur détecté. Gardez cet équilibre.</p>
            : <ul>{deficits.map((deficit) => <li key={deficit}><span className="fc27-alert-icon" aria-hidden="true">!</span><span>{deficit}</span></li>)}</ul>}
        </Fold>
      </div>
    </div>

    <StaffReading query={staff} />

    <div className="fc27-tips">
      <Fold title="Conseils joueur par joueur" count={tips.length || undefined}>
      <div className="fc27-tips-head fc27-tips-head--desktop"><h3 className="fc27-report-label">Conseils joueur par joueur</h3>{tips.length > 2 && <span aria-hidden="true">Faire défiler →</span>}</div>
      {tips.length === 0 ? <p className="fc27-section-hint">Les consignes individuelles apparaîtront avec les premières fiches.</p>
        : <div className="fc27-tips-scroller" role="region" aria-label="Conseils joueur par joueur" tabIndex={0}>
          <ul className="fc27-tips-list">
            {tips.map((tip) => {
              const player = players.find((p) => String(p.id) === tip.playerId);
              return <li className="fc27-tip" key={tip.playerId}>
                <div className="fc27-tip-visual">
                  {player && <PlayerPhoto player={player} className="fc27-tip-photo" />}
                  {player?.kit_number != null && <span className="fc27-tip-number">#{player.kit_number}</span>}
                  <span className="fc27-tip-role">{player?.primary_position}</span>
                </div>
                <strong><bdi>{tip.playerName}</bdi></strong>
                <p>{(player && staffAdvice.get(player.pseudo)) ?? tip.roleAdvice}</p>
              </li>;
            })}
          </ul>
        </div>}
      </Fold>
    </div>
  </section>;
}
