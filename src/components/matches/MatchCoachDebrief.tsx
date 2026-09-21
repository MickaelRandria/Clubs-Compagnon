import { useMatchDebrief } from '../../api/match-debrief';
import { SignInButton } from '../fc27/SignIn';
import { CornerShardLg } from '../ui/CornerShardLg';
import { Glyph } from '../ui/Glyph';

export function MatchCoachDebrief({ matchId }: { matchId: number }) {
  const query = useMatchDebrief(matchId);

  if (query.isLoading) {
    return (
      <div className="fc-block fc-marine fc-coach-debrief fc-coach-debrief--loading" aria-live="polite">
        <div className="fc-coach-debrief-head">
          <span className="fc-coach-chip">
            <Glyph name="bolt" size={14} />
            <span>L'ŒIL DU COACH IA</span>
          </span>
          <span className="fc-coach-meta">Lecture du match en cours…</span>
        </div>
        <div className="fc-coach-skeleton-bar" />
        <div className="fc-coach-skeleton-bar fc-coach-skeleton-bar--short" />
      </div>
    );
  }

  const data = query.data;
  // Aucun débrief rédigé pour ce match : seul un compte connecté peut en demander un,
  // puisque c'est un appel facturé. Une fois écrit, il est lisible par tout le monde.
  if (data && !data.available && data.reason === 'sign-in') {
    return (
      <div className="fc-block fc-marine fc-coach-debrief fc-coach-debrief--locked">
        <div className="fc-coach-debrief-head">
          <span className="fc-coach-chip">
            <Glyph name="bolt" size={14} />
            <span>L'ŒIL DU COACH IA</span>
          </span>
        </div>
        <p className="fc-coach-summary">Pas encore de débrief pour ce match. Connecte-toi pour que le coach IA l’analyse.</p>
        <SignInButton className="fc-coach-notice-signin" />
      </div>
    );
  }
  if (!data?.available) return null;

  const { debrief } = data;

  return (
    <section className="fc-block fc-marine fc-coach-debrief" aria-labelledby="coach-debrief-title">
      <CornerShardLg />
      <div className="fc-coach-debrief-head">
        <span className="fc-coach-chip">
          <Glyph name="bolt" size={14} />
          <span>L'ŒIL DU COACH IA</span>
        </span>
        <span className="fc-coach-meta" title={`Débrief tactique produit par ${data.model}`}>
          Analyse tactique · {data.model}
        </span>
      </div>

      <h2 id="coach-debrief-title" className="fc-coach-headline">
        {debrief.headline}
      </h2>

      <p className="fc-coach-summary">{debrief.summary}</p>

      <div className="fc-coach-advice-box">
        <span className="fc-coach-advice-label">
          <Glyph name="cross" size={14} /> Le mot du coach
        </span>
        <p className="fc-coach-advice">{debrief.advice}</p>
      </div>

      {(debrief.suggestedTags.length > 0 || debrief.suggestedMotm) && (
        <div className="fc-coach-footer-pills">
          {debrief.suggestedMotm && (
            <span className="fc-coach-pill fc-coach-pill--motm" title="Homme du match suggéré par l'analyse">
              ★ MOTM suggéré : <strong>{debrief.suggestedMotm}</strong>
            </span>
          )}
          {debrief.suggestedTags.map((tag) => (
            <span key={tag} className="fc-coach-pill">
              #{tag}
            </span>
          ))}
        </div>
      )}
    </section>
  );
}

