import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { markTourSeen, stepsFor, tourSeen } from '../../lib/tour';
import { useMe } from '../../api/auth';
import { Tour } from './Tour';

interface TourApi { start: () => void; running: boolean }
const TourContext = createContext<TourApi>({ start: () => {}, running: false });

/** Permet à n'importe quel écran de relancer le guide (bouton du pied de page). */
export const useTour = () => useContext(TourContext);

/**
 * Porte le guide pour toute l'app : l'invitation de première visite, le guide lui-même,
 * et le moyen de le relancer. L'invitation ne s'impose jamais — elle se ferme et ne revient plus.
 */
export function TourHost({ children }: { children: ReactNode }) {
  const me = useMe();
  const steps = stepsFor(me.data?.signedIn === true);
  const [running, setRunning] = useState(false);
  const [invited, setInvited] = useState(false);

  // Lu après le montage : le premier rendu ne doit pas dépendre du stockage du navigateur.
  useEffect(() => { setInvited(!tourSeen()); }, []);

  const start = useCallback(() => { setInvited(false); setRunning(true); }, []);
  const dismiss = useCallback(() => { setInvited(false); markTourSeen('dismissed'); }, []);

  return <TourContext.Provider value={{ start, running }}>
    {invited && !running && <aside className="tour-invite">
      <p>
        <b>Première fois ici ?</b>
        <span>Fais le tour en une minute : où tout se trouve, et ce qui t’attend avant FC 27.</span>
      </p>
      <button type="button" className="tour-invite-go" onClick={start}>Me guider</button>
      <button type="button" className="tour-invite-close" onClick={dismiss} aria-label="Masquer l’invitation">✕</button>
    </aside>}
    {children}
    {running && <Tour steps={steps} onClose={(outcome) => { markTourSeen(outcome); setRunning(false); }} />}
  </TourContext.Provider>;
}

/** Relance du guide, posée dans le pied de page. */
export function TourReplay() {
  const { start, running } = useTour();
  return <button type="button" className="tour-replay" onClick={start} disabled={running}>
    <span aria-hidden="true">?</span> Revoir le guide
  </button>;
}
