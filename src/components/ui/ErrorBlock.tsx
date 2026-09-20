import { CornerShardLg } from './CornerShardLg';

export function ErrorBlock({ message, onRetry }: { message?: string; onRetry: () => void }) {
  return (
    <div className="fc-block fc-marine fc-error" role="alert">
      <CornerShardLg />
      <span className="fc-title fc-title--lg">Impossible de charger les données</span>
      <span className="fc-body">{message ?? 'Le serveur ne répond pas.'} Réessaie dans un instant.</span>
      <button type="button" className="fc-cta" onClick={onRetry}>
        Réessayer
      </button>
    </div>
  );
}
