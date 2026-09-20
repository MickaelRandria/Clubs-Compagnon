import { accountStore } from '../../server/db/accounts.js';
import { createAuthHandlers } from '../../server/auth-http.js';
export const POST = createAuthHandlers(accountStore).logout;
