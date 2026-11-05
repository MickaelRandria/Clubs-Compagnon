import { useCallback, useEffect, useRef, useState, type PointerEvent, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import type { MatchDebrief } from '../../../shared/match-debrief';
import type { Match, MatchPlayer } from '../../../shared/types';

// Débrief du coach en story plein écran : un écran par idée, au lieu d'un long bloc dans la fiche.
// Avance seule (barre de progression en CSS : onAnimationEnd passe à l'écran suivant), tap à gauche
// pour revenir, à droite pour avancer, appui long pour mettre en pause, flèches et Échap au clavier.

const SLIDE_S = 8;

/** Premier chiffre d'un texte (« 19 », « 22 % », « 7,4 ») : affiché en grand sur l'écran d'une clé. */
export function leadNumber(text: string): string | null {
  const m = text.match(/\d+(?:[.,]\d+)?(?:\s?%)?/);
  return m ? m[0].replace(/\s%/, ' %') : null;
}

type Slide = { id: string; label: string; tone?: 'win' | 'loss' | 'draw' | 'warn'; body: ReactNode };

interface Props {
  debrief: MatchDebrief;
  match: Match;
  players: MatchPlayer[];
  onClose: () => void;
  onWriteNote: () => void;
}

const RESULT: Record<Match['result'], string> = { win: 'Victoire', draw: 'Nul', loss: 'Défaite' };

export function DebriefStory({ debrief, match, players, onClose, onWriteNote }: Props) {
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const holdTimer = useRef<number | null>(null);
  const held = useRef(false);
  const rating = (gamertag: string) => players.find((p) => p.gamertag === gamertag)?.rating ?? null;

  const slides: Slide[] = [
    {
      id: 'cover', label: 'Le match', tone: match.result,
      body: (
        <>
          <span className={`fc-story-tag is-${match.result}`}>{RESULT[match.result]}</span>
          <span className="fc-story-score" aria-label={`${match.goalsFor} à ${match.goalsAgainst}`}>
            <b>{match.goalsFor}</b><i>–</i><b className="is-them">{match.goalsAgainst}</b>
          </span>
          <h2 className="fc-story-title">{debrief.headline}</h2>
          <p className="fc-story-text">{debrief.lede}</p>
        </>
      ),
    },
    ...debrief.keys.map((k, i): Slide => {
      const figure = leadNumber(k.text);
      const last = i === debrief.keys.length - 1 && match.result !== 'win';
      return {
        id: `key-${i}`, label: `Clé ${i + 1}`, tone: last ? 'warn' : undefined,
        body: (
          <>
            <span className="fc-story-ghost" aria-hidden="true">{String(i + 1).padStart(2, '0')}</span>
            <span className={`fc-story-tag${last ? ' is-loss' : ''}`}>Clé {i + 1} sur {debrief.keys.length}</span>
            <h2 className="fc-story-title">{k.title}</h2>
            {figure && <span className="fc-story-figure">{figure}</span>}
            <p className="fc-story-text">{k.text}</p>
          </>
        ),
      };
    }),
    ...(debrief.players.length > 0 ? [{
      id: 'players', label: 'Les notes',
      body: (
        <>
          <span className="fc-story-tag">Les notes du consultant</span>
          <ul className="fc-story-players">
            {debrief.players.map((p) => {
              const r = rating(p.gamertag);
              const motm = p.gamertag === debrief.suggestedMotm;
              return (
                <li key={p.gamertag} className={motm ? 'is-motm' : undefined}>
                  <span className="fc-story-rating">{r === null ? '—' : r.toFixed(1).replace('.', ',')}</span>
                  <span><b>{p.gamertag}{motm && <small> ★ Homme du match</small>}</b><span>{p.verdict}</span></span>
                </li>
              );
            })}
          </ul>
        </>
      ),
    } satisfies Slide] : []),
    {
      id: 'coach', label: 'Le mot du coach',
      body: (
        <>
          <span className="fc-story-tag">Le mot du coach</span>
          <p className="fc-story-quote">« {debrief.advice} »</p>
          <div className="fc-story-end">
            <button type="button" className="fc-story-cta" onClick={onWriteNote}>Écrire la note du match</button>
            <button type="button" className="fc-story-ghostbtn" onClick={() => setIndex(0)}>Revoir depuis le début</button>
          </div>
        </>
      ),
    },
  ];

  const last = slides.length - 1;
  const next = useCallback(() => setIndex((i) => Math.min(i + 1, last)), [last]);
  const prev = useCallback(() => setIndex((i) => Math.max(i - 1, 0)), []);

  useEffect(() => {
    document.body.classList.add('fc-celeb-open');
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      else if (e.key === 'ArrowRight') next();
      else if (e.key === 'ArrowLeft') prev();
    };
    window.addEventListener('keydown', onKey);
    return () => { document.body.classList.remove('fc-celeb-open'); window.removeEventListener('keydown', onKey); };
  }, [next, prev, onClose]);

  // Appui long = pause ; un tap court navigue (zone gauche : retour).
  const down = () => {
    held.current = false;
    holdTimer.current = window.setTimeout(() => { held.current = true; setPaused(true); }, 220);
  };
  const up = (e: PointerEvent<HTMLDivElement>) => {
    if (holdTimer.current) window.clearTimeout(holdTimer.current);
    if (held.current) { setPaused(false); return; }
    if ((e.target as HTMLElement).closest('button, a')) return;
    const box = e.currentTarget.getBoundingClientRect();
    if (e.clientX - box.left < box.width * 0.3) prev(); else next();
  };

  const slide = slides[index];
  return createPortal(
    <div className={`fc-story${slide.tone ? ` is-${slide.tone}` : ''}`} role="dialog" aria-modal="true" aria-label={`Débrief du match contre ${match.opponent}`}>
      <div className="fc-story-frame">
        <div className="fc-story-bars" aria-hidden="true">
          {slides.map((s, i) => (
            <i key={s.id} className={i < index ? 'is-done' : ''}>
              {i === index && (
                <b key={index} style={{ animationDuration: `${SLIDE_S}s`, animationPlayState: paused || index === last ? 'paused' : 'running' }}
                  className={index === last ? 'is-full' : ''} onAnimationEnd={next} />
              )}
            </i>
          ))}
        </div>
        <div className="fc-story-top">
          <span>Débrief · {match.goalsFor}–{match.goalsAgainst} vs {match.opponent}</span>
          <button type="button" className="fc-story-close" onClick={onClose} aria-label="Fermer le débrief">
            <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true"><path d="M5 5l14 14M19 5L5 19" stroke="currentColor" strokeWidth="2" /></svg>
          </button>
        </div>
        <div className="fc-story-stage" onPointerDown={down} onPointerUp={up} onPointerCancel={() => setPaused(false)}>
          <div key={slide.id} className="fc-story-slide" aria-live="polite" aria-label={`${slide.label}, écran ${index + 1} sur ${slides.length}`}>
            {slide.body}
          </div>
        </div>
        <div className="fc-story-nav">
          <button type="button" onClick={prev} disabled={index === 0}>Précédent</button>
          <span>{index + 1} / {slides.length}</span>
          <button type="button" onClick={index === last ? onClose : next}>{index === last ? 'Fermer' : 'Suivant →'}</button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
