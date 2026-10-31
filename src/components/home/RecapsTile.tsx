import { useNavigate } from 'react-router';
import { useMe } from '../../api/auth';
import { useBetsHistory, useBetsStatus } from '../../api/bets';
import { RecapRings, useNights } from '../bets/Recap';

/** Accueil : les récaps des soirées FoodBet en ronds de stories. Rien tant qu'aucune soirée n'est réglée. */
export function RecapsTile() {
  const me = useMe();
  const { status, ready } = useBetsStatus();
  const history = useBetsHistory(ready && status.access !== 'locked' && me.data?.signedIn === true);
  const navigate = useNavigate();
  const nights = useNights(history.data?.history);
  if (nights.length === 0) return null;
  return <div className="fc-recaps">
    <RecapRings nights={nights} title="Les soirées FoodBet" onOpen={(id) => navigate(`/paris?recap=${id}`)} />
  </div>;
}
