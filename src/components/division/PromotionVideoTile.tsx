import { useState } from 'react';
import { divisionLabel } from '../../../shared/division';
import type { Club } from '../../../shared/types';
import { SHARE_LABEL, shareVideo } from '../../lib/share-video';
import { cinematicFor } from './CinematicCelebration';
import { replayCelebration } from './PromotionCelebration';

/** Une montée reste sur l'accueil un mois ; ensuite on la retrouve dans Club › Progression. */
const ON_HOME_MS = 30 * 24 * 3_600_000;

/** Accueil : la vidéo de la dernière montée, à revoir ou à partager en un tap. */
export function PromotionVideoTile({ club }: { club: Club }) {
  const [label, setLabel] = useState<string | null>(null);
  const last = (club.divisionEvents ?? []).find((e) => e.kind === 'promotion');
  const video = last ? cinematicFor(last)?.video : undefined;
  if (!last || !video || Date.now() - Date.parse(last.at) > ON_HOME_MS) return null;
  const to = divisionLabel(last.toDivision);
  const share = async () => {
    setLabel('Préparation…');
    setLabel(SHARE_LABEL[await shareVideo(video, { title: 'Promus !', text: `Le ${club.name} monte en ${to} !` })]);
  };
  return (
    <section className="fc-promo-video" aria-label={`Vidéo de la montée en ${to}`}>
      <button type="button" className="fc-promo-video-play" onClick={() => replayCelebration(last.id)}>
        <span className="fc-promo-video-ring" aria-hidden="true">
          <svg viewBox="0 0 24 24"><path d="M8 5v14l11-7z" fill="currentColor" /></svg>
        </span>
        <span className="fc-promo-video-copy">
          <small>Promus · le film</small>
          <b>La montée en {to}</b>
          <span>Revoir la vidéo avec le son</span>
        </span>
      </button>
      <button type="button" className="fc-promo-video-share" onClick={() => void share()} aria-live="polite">
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3v12M7 8l5-5 5 5M5 13v7h14v-7" fill="none" stroke="currentColor" strokeWidth="2" /></svg>
        <span>{label ?? 'Partager'}</span>
      </button>
    </section>
  );
}
