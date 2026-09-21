import { accountStore } from '../../server/db/accounts.js';
import { createAuthHandlers } from '../../server/auth-http.js';
import { createAuthRouter } from '../../server/auth-router.js';

// Une seule fonction Vercel pour les quatre URL publiques de connexion.
export const { GET, POST } = createAuthRouter(createAuthHandlers(accountStore));
