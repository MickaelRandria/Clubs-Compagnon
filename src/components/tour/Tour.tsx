import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useLocation, useNavigate, useSearchParams } from 'react-router';
import { TOUR_STEPS, type GuideStep } from '../../lib/tour';
import { placeBubble, useSpotlight, type Placement } from './useSpotlight';

/** Taille de repli de la bulle avant sa première mesure : évite un saut au premier rendu. */
const FALLBACK = { width: 340, height: 220 };

export function Tour({ onClose, steps = TOUR_STEPS, onStepChange }: {
  onClose: (outcome: 'done' | 'dismissed') => void;
  steps?: readonly GuideStep[];
  onStepChange?: (index: number) => void;
}) {
  const [index, setIndex] = useState(0);
  const navigate = useNavigate();
  const location = useLocation();
  const [params, setParams] = useSearchParams();
  const bubbleRef = useRef<HTMLDivElement>(null);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const bodyId = useId();
  const returnFocus = useRef<HTMLElement | null>(document.activeElement as HTMLElement);
  const [size, setSize] = useState(FALLBACK);
  const [viewport, setViewport] = useState(() => ({ width: window.innerWidth, height: window.innerHeight }));

  const step = steps[index];
  const isLast = index === steps.length - 1;
  const onRoute = !step.route || location.pathname === step.route;
  // Une cible facultative est souvent absente pour de bon (préparation archivée) : on tranche vite,
  // sinon l'utilisateur fixe une bulle qui ne montre rien. Une cible attendue a droit à plus de temps,
  // le rendu pouvant dépendre d'une route paresseuse et d'une requête.
  const wait = step.optional ? 1200 : 4000;
  // Tant qu'on n'est pas sur la bonne route, chercher la cible n'a aucun sens.
  const { rect, status } = useSpotlight(onRoute ? step.target : undefined, wait, viewport.width <= 767 ? size.height + 12 : 0);

  useEffect(() => {
    const resize = () => setViewport({ width: window.innerWidth, height: window.innerHeight });
    window.addEventListener('resize', resize);
    return () => window.removeEventListener('resize', resize);
  }, []);

  const finish = useCallback((outcome: 'done' | 'dismissed') => {
    onClose(outcome);
  }, [onClose]);

  /** Sens de la marche, pour qu'une étape sautée le soit dans la même direction. */
  const direction = useRef(1);

  const go = useCallback((delta: number) => {
    direction.current = delta < 0 ? -1 : 1;
    const next = index + delta;
    if (next < 0) return;
    if (next >= steps.length) { finish('done'); return; }
    setIndex(next);
  }, [index, finish, steps.length]);

  // Une vraie fenêtre modale reste au-dessus du formulaire et contient le focus clavier.
  useLayoutEffect(() => {
    const dialog = dialogRef.current!;
    dialog.showModal();
    return () => { dialog.close(); returnFocus.current?.focus?.({ preventScroll: true }); };
  }, []);

  useLayoutEffect(() => { onStepChange?.(index); }, [index, onStepChange]);

  // Le guide emmène l'utilisateur sur la bonne page tout seul.
  useEffect(() => {
    if (step.route && location.pathname !== step.route) navigate(step.route);
  }, [step.route, location.pathname, navigate]);

  // …puis ouvre la section qui contient la cible. Sur grand écran le paramètre est inoffensif :
  // toutes les sections y sont affichées.
  useEffect(() => {
    if (!step.section || (step.route && location.pathname !== step.route)) return;
    if (params.get('vue') === step.section) return;
    const next = new URLSearchParams(params);
    next.set('vue', step.section);
    setParams(next, { replace: true });
  }, [step.section, step.route, location.pathname, params, setParams]);

  // Une cible facultative introuvable (préparation archivée, tuile absente) ne doit pas bloquer.
  // On saute dans le sens où l'utilisateur allait : sinon « Retour » rebondirait aussitôt en avant.
  useEffect(() => {
    if (status !== 'missing' || !step.optional) return;
    // Rien avant la première étape : on repart en avant plutôt que de rester coincé.
    go(index === 0 ? 1 : direction.current);
  }, [status, step.optional, index, go]);

  // Mesure réelle de la bulle : son contenu change de hauteur d'une étape à l'autre.
  useLayoutEffect(() => {
    const el = bubbleRef.current;
    if (!el) return;
    const observer = new ResizeObserver(([entry]) => {
      const box = entry.target.getBoundingClientRect();
      setSize((previous) => (previous.width === box.width && previous.height === box.height
        ? previous : { width: box.width, height: box.height }));
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    bubbleRef.current?.focus({ preventScroll: true });
  }, [index]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Tab') {
        const buttons = bubbleRef.current?.querySelectorAll<HTMLButtonElement>('button:not(:disabled)');
        const first = buttons?.[0];
        const last = buttons?.[buttons.length - 1];
        if (event.shiftKey && (document.activeElement === first || document.activeElement === bubbleRef.current)) {
          event.preventDefault(); last?.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault(); first?.focus();
        }
      }
      if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); finish('dismissed'); }
      if (event.key === 'ArrowRight') { event.preventDefault(); go(1); }
      if (event.key === 'ArrowLeft') { event.preventDefault(); go(-1); }
    };
    const dialog = dialogRef.current!;
    dialog.addEventListener('keydown', onKey);
    return () => dialog.removeEventListener('keydown', onKey);
  }, [go, finish]);

  // Une étape ancrée dont la cible tarde : on montre la bulle centrée plutôt que d'attendre dans le vide.
  const spot = status === 'found' ? rect : null;
  const place: Placement = placeBubble(spot, size, step.placement, viewport);

  return createPortal(<dialog ref={dialogRef} className="tour" data-tour-target={step.target} aria-modal="true" aria-labelledby={titleId} aria-describedby={bodyId}
    onCancel={(event) => { event.preventDefault(); event.stopPropagation(); finish('dismissed'); }}>
    <div className="tour-veil" aria-hidden="true">
      {spot && <span className="tour-hole" style={{ top: spot.top, left: spot.left, width: spot.width, height: spot.height }} />}
    </div>

    <div ref={bubbleRef} className={`tour-bubble tour-bubble--${place.side}`} style={{ top: place.top, left: place.left }} tabIndex={-1}>
      <p className="tour-count">Étape {index + 1} sur {steps.length}</p>
      <h2 id={titleId} className="tour-title">{step.title}</h2>
      <p id={bodyId} className="tour-body">{step.body}</p>

      <ol className="tour-dots" aria-hidden="true">
        {steps.map((dot, i) => <li key={dot.id} className={i === index ? 'is-on' : i < index ? 'is-done' : undefined} />)}
      </ol>

      <div className="tour-actions">
        <button type="button" className="tour-skip" onClick={() => finish('dismissed')}>Passer le guide</button>
        {index > 0 && <button type="button" className="tour-back" onClick={() => go(-1)}>← Retour</button>}
        <button type="button" className="tour-next" onClick={() => go(1)}>
          {isLast ? 'Terminer' : 'Suivant →'}
        </button>
      </div>
    </div>
  </dialog>, document.body);
}
