import { Link } from 'react-router';
import { useBetsStatus } from '../../api/bets';
import '../../styles/bets.css';

/** Bandeau d'accueil : il n'apparaît que lorsqu'il y a quelque chose à faire, parier ou voter. */
export function BetsLiveBanner() {
  const { status } = useBetsStatus();
  if (status.live !== 'open' && status.live !== 'voting') return null;
  const open = status.live === 'open';
  return <Link to="/paris" className={`bets-live-banner${open ? '' : ' bets-live-banner--vote'}`}>
    <i className="bets-coin" aria-hidden="true" />
    <span><b>{open ? 'FoodBet ouvert' : 'Place au vote'}</b> {open ? 'Parie avant le coup d’envoi, ça prend 10 secondes.' : 'Élis le crack du match et découvre les pronos du club.'}</span>
    <em>{open ? 'Parier' : 'Voter'} →</em>
  </Link>;
}
