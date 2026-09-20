import { useCallback, useMemo, useRef, useState } from 'react';
import { PLAYER_TOUR_KEY, PLAYER_TOUR_STEPS, playerTourSteps } from '../../lib/player-tour';
import { markTourSeen, tourSeen } from '../../lib/tour';
import { Tour } from '../tour/Tour';

export function PlayerGuide({ page, advancedOpen, hasArchetype, invite, onPageChange, onAdvancedChange, onActiveChange }: {
  page: number; advancedOpen: boolean; hasArchetype: boolean; invite: boolean;
  onPageChange: (page: number) => void; onAdvancedChange: (open: boolean) => void;
  onActiveChange: (active: boolean) => void;
}) {
  const [invited, setInvited] = useState(() => invite && !tourSeen(PLAYER_TOUR_KEY));
  const [returnTo, setReturnTo] = useState<{ page: number; advancedOpen: boolean; scroll: number } | null>(null);
  const replayRef = useRef<HTMLButtonElement>(null);
  const steps = useMemo(() => playerTourSteps(hasArchetype), [hasArchetype]);

  function start() {
    setReturnTo({ page, advancedOpen, scroll: replayRef.current?.closest('dialog')?.scrollTop ?? 0 });
    setInvited(false);
    onActiveChange(true);
  }

  const prepare = useCallback((index: number) => {
    const step = PLAYER_TOUR_STEPS[index];
    onPageChange(step.page);
    onAdvancedChange(step.advanced ?? false);
  }, [onPageChange, onAdvancedChange]);

  function finish(outcome: 'done' | 'dismissed') {
    markTourSeen(outcome, PLAYER_TOUR_KEY);
    if (returnTo) {
      onPageChange(returnTo.page);
      onAdvancedChange(returnTo.advancedOpen);
    }
    setReturnTo(null);
    onActiveChange(false);
    requestAnimationFrame(() => {
      const dialog = replayRef.current?.closest('dialog');
      if (dialog && returnTo) dialog.scrollTop = returnTo.scroll;
      replayRef.current?.focus({ preventScroll: true });
    });
  }

  return <div className={`fc27-player-guide${returnTo ? ' fc27-player-guide--running' : ''}`}>
    {invited && <aside className="tour-invite" aria-label="Guide de création du joueur">
      <p><b>Ta première fiche ?</b><span>On te montre où choisir ton poste et construire ton joueur.</span></p>
      <button type="button" className="tour-invite-go" onClick={start}>Me guider</button>
      <button type="button" className="tour-invite-close" aria-label="Masquer le guide de création" onClick={() => {
        setInvited(false); markTourSeen('dismissed', PLAYER_TOUR_KEY);
      }}>✕</button>
    </aside>}
    <button ref={replayRef} type="button" className="tour-replay" onClick={start} disabled={returnTo !== null}>
      <span aria-hidden="true">?</span> Guide de création
    </button>
    {returnTo && <Tour steps={steps} onStepChange={prepare} onClose={finish} />}
  </div>;
}
