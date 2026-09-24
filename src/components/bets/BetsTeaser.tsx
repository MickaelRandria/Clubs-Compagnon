import { Link } from 'react-router';
import { BETS_MODES, type BetsMode } from '../../../shared/bets';
import { useBetsStatus, useSetBetsMode } from '../../api/bets';
import '../../styles/bets.css';

const MODE_LABELS: Record<BetsMode, string> = { off: 'Fermé', admins: 'Capitaines', on: 'Ouvert à tous' };

/**
 * Tuile « Vestiaire Bets » de la page FC 27. Grisée tant que l'interrupteur la ferme au
 * visiteur ; l'admin y trouve le sélecteur de mode, c'est lui qui déclenche le lancement.
 */
export function BetsTeaser() {
  const { status } = useBetsStatus();
  const setMode = useSetBetsMode();
  const locked = status.access === 'locked';

  const body = <>
    <div className="bets-teaser-coins" aria-hidden="true"><i /><i /><i /></div>
    <div className="bets-teaser-copy">
      <span className="fc27-tag">{locked ? 'Bientôt · Sessions FC 27' : status.access === 'preview' ? 'Aperçu capitaines' : 'Sessions Clubs Pro'}</span>
      <h2 className="bets-teaser-title">Vestiaire <span>Bets</span></h2>
      <p>Parie tes Dommage Coins avant le coup d’envoi, élis le Crack et la Casserole au coup de sifflet, puis le héros de la soirée.</p>
      <span className="bets-teaser-cta">{locked ? 'Ouvre avec les sessions FC 27' : <>Entrer au vestiaire <span aria-hidden="true">→</span></>}</span>
    </div>
  </>;

  return <section className={`bets-teaser${locked ? ' bets-teaser--locked' : ''}`} aria-label="Vestiaire Bets">
    {locked
      ? <div className="bets-teaser-card" aria-disabled="true">{body}</div>
      : <Link className="bets-teaser-card" to="/paris">{body}</Link>}
    {status.canConfigure && <div className="bets-teaser-admin" role="group" aria-label="Lancement des paris">
      <span>Lancement</span>
      {BETS_MODES.map((mode) => <button key={mode} type="button" aria-pressed={status.mode === mode}
        disabled={setMode.isPending} onClick={() => status.mode !== mode && setMode.mutate(mode)}>{MODE_LABELS[mode]}</button>)}
      {setMode.isError && <em role="alert">{setMode.error.message}</em>}
    </div>}
  </section>;
}
