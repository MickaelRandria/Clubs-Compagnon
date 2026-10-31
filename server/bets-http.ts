import {
  betsAccess, betsAdminActionSchema, betsModeSchema, betsPlayActionSchema,
  type BetsAdminAction, type BetsLive, type BetsMode, type BetsPlayAction, type BetsState, type BetsStatus,
} from '../shared/bets.js';
import { requestOrigin } from './discord.js';
import { handle, HttpError } from './http.js';
import { readSession } from './session.js';

export interface BetsSettings {
  mode: () => Promise<BetsMode>;
  setMode: (mode: BetsMode, accountId: number) => Promise<void>;
  /** Paris ouverts, match en cours ou vote ouvert. */
  live?: () => Promise<BetsLive>;
}

/** Jeu réel : bets_dispatch côté base. `null` dans les tests qui n'exercent que l'interrupteur. */
export interface BetsGame {
  /** `peek` : simple lecture (accueil), sans compter le joueur comme présent dans le salon FoodBet. */
  state: (accountId: number, isAdmin: boolean, peek?: boolean) => Promise<BetsState>;
  play: (accountId: number, action: BetsPlayAction) => Promise<BetsState>;
  admin: (accountId: number, action: BetsAdminAction) => Promise<BetsState>;
}

const headers = { 'Cache-Control': 'private, no-store' };

/**
 * Vestiaire Bets : une seule fonction Vercel pour toutes les URL /api/bets/:action
 * (le plan Hobby plafonne à 12 fonctions).
 *
 * `status` et `mode` pilotent l'interrupteur. Les actions de jeu (state, play, admin)
 * répondent 404 tant que le mode les ferme au visiteur, pour ne rien révéler avant le
 * lancement.
 */
export function createBetsRouter(settings: BetsSettings, isAdmin: (accountId: number) => Promise<boolean>, game?: BetsGame) {
  const status = async (request: Request): Promise<BetsStatus> => {
    const accountId = readSession(request);
    const [mode, admin] = await Promise.all([settings.mode(), accountId === null ? false : isAdmin(accountId)]);
    const access = betsAccess(mode, admin);
    const live = access === 'locked' || !settings.live ? null : await settings.live();
    return { mode, access, canConfigure: admin, live };
  };

  /** Compte connecté et autorisé par l'interrupteur, sinon la route n'existe pas pour lui. */
  const player = async (request: Request) => {
    if (!game) throw new HttpError(404, 'Route inconnue.');
    const accountId = readSession(request);
    const [mode, admin] = await Promise.all([settings.mode(), accountId === null ? false : isAdmin(accountId)]);
    if (betsAccess(mode, admin) === 'locked') throw new HttpError(404, 'Route inconnue.');
    if (accountId === null) throw new HttpError(401, 'Connecte-toi avec Discord pour parier.');
    if (request.method === 'POST') {
      const origin = request.headers.get('origin');
      if (origin && origin !== requestOrigin(request)) throw new HttpError(403, 'Cette action doit être envoyée depuis le site.');
    }
    return { accountId, admin, game };
  };
  const body = (request: Request) => request.json().catch(() => { throw new HttpError(400, 'JSON invalide.'); });

  const routes = new Map<string, { method: 'GET' | 'POST'; run: (request: Request) => Promise<Response> }>([
    ['state', { method: 'GET', run: async (request) => {
      const { accountId, admin, game } = await player(request);
      const peek = new URL(request.url).searchParams.has('peek');
      return Response.json(await game.state(accountId, admin, peek), { headers });
    } }],
    ['play', { method: 'POST', run: async (request) => {
      const { accountId, game } = await player(request);
      const parsed = betsPlayActionSchema.safeParse(await body(request));
      if (!parsed.success) throw new HttpError(400, 'Pari invalide.');
      return Response.json(await game.play(accountId, parsed.data), { headers });
    } }],
    ['admin', { method: 'POST', run: async (request) => {
      const { accountId, admin, game } = await player(request);
      if (!admin) throw new HttpError(403, 'Réservé à l’administrateur du club.');
      const parsed = betsAdminActionSchema.safeParse(await body(request));
      if (!parsed.success) throw new HttpError(400, 'Action inconnue.');
      return Response.json(await game.admin(accountId, parsed.data), { headers });
    } }],
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
