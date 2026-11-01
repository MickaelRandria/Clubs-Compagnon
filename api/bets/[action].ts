import { accountStore, isAdminAccount } from '../../server/db/accounts.js';
import { betsGame, betsSettings, photoStore } from '../../server/db/bets.js';
import { createBetsRouter } from '../../server/bets-http.js';
import { controlLobbySpotify, disconnectSpotifyHost, lobbyConsole, lobbyMusic, queueLobbyTrack, saveJamUrl,
  searchLobbyTracks, setLobbyVisibility } from '../../server/db/lobby.js';

// Une seule fonction Vercel pour toutes les URL /api/bets/:action.
export const { GET, POST } = createBetsRouter(betsSettings, isAdminAccount, betsGame, photoStore, {
  now: lobbyMusic, saveJam: saveJamUrl, disconnect: disconnectSpotifyHost,
  accountExists: async (accountId) => Boolean(await accountStore.find(accountId)),
  console: lobbyConsole, setVisibility: setLobbyVisibility, control: controlLobbySpotify,
  search: searchLobbyTracks, queue: queueLobbyTrack,
});
