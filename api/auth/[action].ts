import { accountStore, isAdminAccount } from '../../server/db/accounts.js';
import { saveSpotifyHost } from '../../server/db/lobby.js';
import { createAuthHandlers } from '../../server/auth-http.js';
import { createAuthRouter } from '../../server/auth-router.js';
import { createSpotifyHandlers } from '../../server/spotify-http.js';

// Une seule fonction Vercel pour les URL de connexion (Discord, et le Spotify de l'hôte du lobby).
export const { GET, POST } = createAuthRouter(createAuthHandlers(accountStore), createSpotifyHandlers(isAdminAccount, saveSpotifyHost));
