import { Link } from 'react-router';
import { divisionLabel } from '../../../shared/division';
import type { DivisionProgress } from '../../../shared/types';

const ECG = 'M0 30 H120 L132 30 L140 8 L150 54 L160 18 L168 30 H200 L210 30 L216 20 L222 30 H358';

/** Zone rouge de l'accueil : plus aucune chance, le prochain match décide du maintien. */
export function RelegationAlert({ progress }: { progress: DivisionProgress }) {
  return (
    <Link to="/club#progression" className="fc-dv-alert" aria-label={`Match de relégation : ne pas perdre pour rester en ${divisionLabel(progress.division)}`}>
      <span className="fc-dv-alert-top">
        <span>Prochain match</span>
        <span>0 / 3 chances</span>
      </span>
      <span className="fc-dv-alert-halo" aria-hidden="true" />
      <span className="fc-dv-alert-crest" aria-hidden="true">
        <span className="fc-dv-crest fc-dv-crest--grey">
          <span className="fc-dv-crest-in">
            <small>{progress.division <= 1 ? '' : 'Division'}</small>
            <b>{progress.division <= 1 ? 'É' : progress.division - 1}</b>
          </span>
        </span>
        <svg className="fc-dv-alert-cracks" viewBox="0 0 112 132">
          <path d="M56 0 L50 26 L62 46 L46 72 L58 96" /><path d="M50 26 L22 34" /><path d="M62 46 L92 40" /><path d="M46 72 L18 80" />
        </svg>
      </span>
      <svg className="fc-dv-ecg" viewBox="0 0 358 60" preserveAspectRatio="none" aria-hidden="true">
        <path className="fc-dv-ecg-base" d={ECG} /><path className="fc-dv-ecg-pulse" d={ECG} />
      </svg>
      <span className="fc-dv-alert-title">Match de relégation</span>
      <span className="fc-dv-alert-sub">Un match pour garder la {divisionLabel(progress.division)}</span>
      <span className="fc-dv-alert-stakes">
        <span className="is-safe"><b>V ou N</b>On reste en {divisionLabel(progress.division)}</span>
        <span className="is-down"><b>D</b>Retour en {divisionLabel(progress.division + 1)}</span>
      </span>
    </Link>
  );
}
