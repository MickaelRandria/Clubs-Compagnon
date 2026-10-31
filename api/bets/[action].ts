import { isAdminAccount } from '../../server/db/accounts.js';
import { betsGame, betsSettings, photoStore } from '../../server/db/bets.js';
import { createBetsRouter } from '../../server/bets-http.js';
import { disconnectSpotifyHost, lobbyMusic, saveJamUrl } from '../../server/db/lobby.js';

// Une seule fonction Vercel pour toutes les URL /api/bets/:action.
export const { GET, POST } = createBetsRouter(betsSettings, isAdminAccount, betsGame, photoStore, {
  now: lobbyMusic, saveJam: saveJamUrl, disconnect: disconnectSpotifyHost,
});
