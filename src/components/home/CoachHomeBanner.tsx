import { useCoach } from '../coach/CoachContext';
import { Glyph } from '../ui/Glyph';

export function CoachHomeBanner() {
  const { openCoach } = useCoach();

  return (
    <div className="fc-coach-home-banner" style={{ animationDelay: '200ms' }}>
      <div className="fc-coach-hb-left">
        <div className="fc-coach-hb-icon">
          <Glyph name="bolt" size={18} />
        </div>
        <div className="fc-coach-hb-text">
          <span className="fc-coach-hb-title">LE COACH IA EST À TON SERVICE</span>
          <span className="fc-coach-hb-sub">
            Besoin d'aide pour lier ton compte Discord, voter pour FC 27 ou explorer les statistiques ?
          </span>
        </div>
      </div>

      <div className="fc-coach-hb-chips">
        <button
          type="button"
          onClick={() => openCoach('Comment lier mon compte Discord ?')}
          className="fc-coach-hb-chip"
        >
          🔗 Lier mon compte
        </button>
        <button
          type="button"
          onClick={() => openCoach('Comment voter pour le nom FC 27 ?')}
          className="fc-coach-hb-chip"
        >
          🗳️ Voter FC 27
        </button>
        <button
          type="button"
          onClick={() => openCoach('Qui est notre meilleur buteur ?')}
          className="fc-coach-hb-chip"
        >
          ⚽ Meilleurs buteurs
        </button>
        <button type="button" onClick={() => openCoach()} className="fc-coach-hb-btn">
          <span>Ouvrir le Coach</span>
          <Glyph name="forward" size={14} />
        </button>
      </div>
    </div>
  );
}

