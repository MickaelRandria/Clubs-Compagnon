import { useState } from 'react';
import type { MatchDebrief } from '../../../shared/match-debrief';
import type { Match, MatchPlayer } from '../../../shared/types';
import { useMatchDebrief } from '../../api/match-debrief';
import { DebriefStory } from './DebriefStory';
import { SignInButton } from '../fc27/SignIn';
import { Glyph } from '../ui/Glyph';

export function MatchCoachDebrief({ match, players }: { match: Match; players: MatchPlayer[] }) {
  const matchId = match.id;
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

  return <DebriefTeaser debrief={data.debrief} match={match} players={players} />;
}

/** Carte courte dans la fiche match : le titre, puis la story plein écran au tap. */
function DebriefTeaser({ debrief, match, players }: { debrief: MatchDebrief; match: Match; players: MatchPlayer[] }) {
  const [open, setOpen] = useState(false);
  const screens = 2 + debrief.keys.length + (debrief.players.length > 0 ? 1 : 0);
  const writeNote = () => {
    setOpen(false);
    document.getElementById('note-form-title')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };
  return (
    <>
      <button type="button" className={`fc-block fc-story-teaser is-${match.result}`} onClick={() => setOpen(true)} aria-haspopup="dialog">
        <span className="fc-story-teaser-ring" aria-hidden="true">
          <svg viewBox="0 0 24 24"><path d="M8 5v14l11-7z" fill="currentColor" /></svg>
        </span>
        <span className="fc-story-teaser-copy">
          <span className="fc-coach-chip"><Glyph name="bolt" size={14} /><span>L'œil du coach IA</span></span>
          <b>{debrief.headline}</b>
          <small>{screens} écrans · environ {Math.round((screens * 8) / 10) * 10} s · touche pour lancer</small>
        </span>
      </button>
      {open && <DebriefStory debrief={debrief} match={match} players={players} onClose={() => setOpen(false)} onWriteNote={writeNote} />}
    </>
  );
}
