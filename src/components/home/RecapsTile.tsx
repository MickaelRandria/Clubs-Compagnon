import { useNavigate } from 'react-router';
import { useMe } from '../../api/auth';
import { useBetsHistory, useBetsStatus } from '../../api/bets';
import { RecapRings } from '../bets/Recap';

/** Accueil : les récaps des soirées FoodBet en ronds de stories. Rien tant qu'aucune soirée n'est réglée. */
export function RecapsTile() {
  const me = useMe();
  const { status, ready } = useBetsStatus();
  const history = useBetsHistory(ready && status.access !== 'locked' && me.data?.signedIn === true);
  const navigate = useNavigate();
  if (!history.data?.history.some((h) => h.session)) return null;
  return <div className="fc-recaps">
    <RecapRings history={history.data.history} title="Les soirées FoodBet" onOpen={(id) => navigate(`/paris?recap=${id}`)} />
  </div>;
}
