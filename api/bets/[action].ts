import { isAdminAccount } from '../../server/db/accounts.js';
import { betsSettings } from '../../server/db/bets.js';
import { createBetsRouter } from '../../server/bets-http.js';

// Une seule fonction Vercel pour toutes les URL /api/bets/:action.
export const { GET, POST } = createBetsRouter(betsSettings, isAdminAccount);
