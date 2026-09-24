import { betsAccess, betsModeSchema, type BetsMode, type BetsStatus } from '../shared/bets.js';
import { requestOrigin } from './discord.js';
import { handle, HttpError } from './http.js';
import { readSession } from './session.js';

export interface BetsSettings {
  mode: () => Promise<BetsMode>;
  setMode: (mode: BetsMode, accountId: number) => Promise<void>;
}

const headers = { 'Cache-Control': 'private, no-store' };

/**
 * Vestiaire Bets : une seule fonction Vercel pour toutes les URL /api/bets/:action
 * (le plan Hobby plafonne à 12 fonctions).
 *
 * Phase 1 : seuls `status` et `mode` existent. Les actions de jeu (state, place, vote,
 * admin) arrivent en phase 2 ; tant que le mode les ferme au visiteur, elles répondront
 * 404 comme une route inconnue, pour ne rien révéler avant le lancement.
 */
export function createBetsRouter(settings: BetsSettings, isAdmin: (accountId: number) => Promise<boolean>) {
  const status = async (request: Request): Promise<BetsStatus> => {
    const accountId = readSession(request);
    const [mode, admin] = await Promise.all([settings.mode(), accountId === null ? false : isAdmin(accountId)]);
    return { mode, access: betsAccess(mode, admin), canConfigure: admin };
  };

  const routes = new Map<string, { method: 'GET' | 'POST'; run: (request: Request) => Promise<Response> }>([
    ['status', { method: 'GET', run: async (request) => Response.json(await status(request), { headers }) }],
    ['mode', {
      method: 'POST',
      run: async (request) => {
        const accountId = readSession(request);
        if (accountId === null) throw new HttpError(401, 'Connecte-toi avec Discord.');
        const origin = request.headers.get('origin');
        if (origin && origin !== requestOrigin(request)) throw new HttpError(403, 'Cette action doit être envoyée depuis le site.');
        if (!await isAdmin(accountId)) throw new HttpError(403, 'Le lancement des paris est réservé à l’administrateur du club.');
        const parsed = betsModeSchema.safeParse(await request.json().catch(() => null));
        if (!parsed.success) throw new HttpError(400, 'Mode inconnu.');
        await settings.setMode(parsed.data.mode, accountId);
        return Response.json(await status(request), { headers });
      },
    }],
  ]);

  const dispatch = (request: Request) => handle(async () => {
    const action = /^\/api\/bets\/([^/]+)\/?$/.exec(new URL(request.url).pathname)?.[1];
    const route = action ? routes.get(action) : undefined;
    if (!route) throw new HttpError(404, 'Route inconnue.');
    if (request.method !== route.method) {
      return Response.json({ error: 'Méthode non autorisée.' }, { status: 405, headers: { ...headers, Allow: route.method } });
    }
    return route.run(request);
  });
  return { GET: dispatch, POST: dispatch };
}
