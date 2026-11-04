import { POINTS } from '../../../shared/division-progress';
import { divisionLabel } from '../../../shared/division';
import { useClub } from '../../api/queries';
import { DivisionGauge, nextDivisionLabel } from './DivisionBits';

/** Fiche match : ce que ce match a changé dans la division (points, chances), s'il compte dans la division en cours. */
export function DivisionImpact({ matchId }: { matchId: number }) {
  const club = useClub();
  const p = club.data?.progress;
  // Le match décisif d'une montée ou d'une descente appartient à la division quittée.
  const decisive = club.data?.divisionEvents?.find((e) => e.match?.id === matchId && (e.kind === 'promotion' || e.kind === 'relegation'));
  if (decisive && decisive.fromDivision !== null) {
    const up = decisive.kind === 'promotion';
    return (
      <section className={`fc-block fc-dv-impact${up ? '' : ' is-loss'}`} aria-label="Impact sur la division">
        <span className="fc-dv-impact-head">
          <span className="fc-dv-label">{up ? 'Le match de la montée' : 'Le match de la descente'}</span>
          <span>{divisionLabel(decisive.fromDivision)} → {divisionLabel(decisive.toDivision)}</span>
        </span>
        <p>{up ? `Ce match nous a fait monter en ${divisionLabel(decisive.toDivision)}` : `Ce match nous a renvoyés en ${divisionLabel(decisive.toDivision)}`}
          {decisive.points !== null ? `, avec ${decisive.points} points` : ''}.{decisive.exact ? '' : ' (Match déduit : plusieurs matchs entre deux synchros.)'}</p>
      </section>
    );
  }
  if (!p || p.status !== 'tracking') return null;
  const index = p.steps.findIndex((s) => s.matchId === matchId);
  if (index < 0) return null;
  const step = p.steps[index];
  const before = index > 0 ? p.steps[index - 1] : { points: 0, chances: 3 };
  const gained = POINTS[step.result];
  const remaining = Math.max(0, p.target - step.points);
  const isLatest = index === p.steps.length - 1;

  let line: string;
  if (step.relegationMatch) {
    line = step.result === 'loss' ? `Match de relégation perdu : retour en ${divisionLabel(p.division + 1)}.`
      : 'Match de relégation tenu : maintien assuré, les 3 chances reviennent.';
  } else if (step.points >= p.target) {
    line = `Objectif atteint : montée en ${nextDivisionLabel(p.division)}.`;
  } else if (step.result === 'loss') {
    line = step.chances === 0 ? 'Plus aucune chance : le match suivant est un match de relégation.'
      : `Une chance perdue, il en reste ${step.chances}.`;
  } else {
    line = `Plus que ${remaining} pt${remaining > 1 ? 's' : ''} pour la ${nextDivisionLabel(p.division)}.`;
  }

  return (
    <section className={`fc-block fc-dv-impact${step.result === 'loss' ? ' is-loss' : ''}`} aria-label="Impact sur la division">
      <span className="fc-dv-impact-head">
        <span className="fc-dv-label">Impact division</span>
        <span>{divisionLabel(p.division)}</span>
      </span>
      <span className="fc-dv-impact-nums">
        <b className="fc-dv-plus">+{gained}</b>
        <span><b>{step.points}</b> / {p.target} pts</span>
      </span>
      <DivisionGauge points={step.points} target={p.target} fresh={step.points - before.points} />
      <p>{line}</p>
      {isLatest && !step.relegationMatch && remaining > 0 && remaining <= 3 && step.chances > 0 && (
        <span className="fc-dv-ball"><b>Balle de montée</b> Une victoire au prochain match et c'est la {nextDivisionLabel(p.division)}.</span>
      )}
    </section>
  );
}
