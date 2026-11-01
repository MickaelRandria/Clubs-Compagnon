import {
  betsAccess, betsAdminActionSchema, betsModeSchema, betsPlayActionSchema,
  type BetsAdminAction, type BetsLive, type BetsMode, type BetsPlayAction, type BetsState, type BetsStatus,
} from '../shared/bets.js';
import { jamUrlSchema, lobbyVisibilitySchema, spotifyCommandSchema, spotifyQueueSchema, spotifySearchSchema,
  type LobbyConsole, type LobbyMusic, type LobbyTrack, type SpotifyCommand } from '../shared/lobby.js';
import { requestOrigin } from './discord.js';
import { handle, HttpError } from './http.js';
import { readSession } from './session.js';
import { SpotifyUnavailable } from './spotify.js';

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

/** Photos des joueurs : la liste (pseudo → URL versionnée), l'image, et l'envoi par le joueur lui-même. */
export interface PhotoStore {
  list: () => Promise<Record<string, string>>;
  get: (memberId: number) => Promise<string | null>;
  save: (accountId: number, image: string) => Promise<void>;
}

/** La musique du lobby : le titre Spotify en cours chez l'hôte, et le lien de la Jam. */
export interface LobbyStore {
  now: (origin: string) => Promise<LobbyMusic>;
  saveJam: (url: string) => Promise<void>;
  disconnect?: () => Promise<void>;
  accountExists?: (accountId: number) => Promise<boolean>;
  console?: (origin: string, accountId: number) => Promise<LobbyConsole>;
  setVisibility?: (origin: string, accountId: number, visible: boolean) => Promise<LobbyConsole>;
  control?: (origin: string, accountId: number, action: SpotifyCommand) => Promise<LobbyConsole>;
  search?: (origin: string, accountId: number, query: string) => Promise<LobbyTrack[]>;
  queue?: (origin: string, accountId: number, uri: string) => Promise<void>;
}

/** Une photo envoyée : une image en data URL, 400 Ko au plus (l'app l'envoie en WebP de 420 px). */
const PHOTO = /^data:image\/(webp|jpeg|png);base64,([A-Za-z0-9+/=]+)$/;

const headers = { 'Cache-Control': 'private, no-store' };

/**
 * Vestiaire Bets : une seule fonction Vercel pour toutes les URL /api/bets/:action
 * (le plan Hobby plafonne à 12 fonctions).
 *
 * `status` et `mode` pilotent l'interrupteur. Les actions de jeu (state, play, admin)
 * répondent 404 tant que le mode les ferme au visiteur, pour ne rien révéler avant le
 * lancement.
 */
export function createBetsRouter(settings: BetsSettings, isAdmin: (accountId: number) => Promise<boolean>, game?: BetsGame, photos?: PhotoStore, lobby?: LobbyStore) {
  const limits = new Map<string, { count: number; until: number }>();
  const limit = (accountId: number, action: string, maximum: number) => {
    const now = Date.now();
    for (const [key, value] of limits) if (value.until <= now) limits.delete(key);
    const key = `${accountId}:${action}`;
    const current = limits.get(key);
    if (current && current.count >= maximum) throw new HttpError(429, 'Trop de demandes. Réessaie dans une minute.');
    if (!current && limits.size >= 2_000) limits.delete(limits.keys().next().value!);
    limits.set(key, { count: (current?.count ?? 0) + 1, until: current?.until ?? now + 60_000 });
  };
  const musicMember = async (request: Request) => {
    if (!lobby) throw new HttpError(404, 'Route inconnue.');
    const accountId = readSession(request);
    if (accountId === null || !lobby.accountExists || !await lobby.accountExists(accountId)) {
      throw new HttpError(401, 'Connecte-toi avec ton compte Discord du club.');
    }
    const origin = request.headers.get('origin');
    if (request.method === 'POST' && origin && origin !== requestOrigin(request)) throw new HttpError(403, 'Cette action doit être envoyée depuis le site.');
    return { accountId, origin: requestOrigin(request) };
  };
  const musicResponse = async (run: () => Promise<unknown>) => {
    try { return Response.json(await run(), { headers }); }
    catch (error) {
      if (!(error instanceof SpotifyUnavailable)) throw error;
      const status = error.status === 429 ? 429 : error.status === 403 ? 403 : error.status === 404 ? 409 : error.status === 401 ? 409 : 503;
      return Response.json({ error: error.message }, { status, headers: { ...headers,
        ...(error.retryAfterMs ? { 'Retry-After': String(Math.ceil(error.retryAfterMs / 1_000)) } : {}) } });
    }
  };
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
    ['lobby', { method: 'GET', run: async (request) => {
      if (!lobby) throw new HttpError(404, 'Route inconnue.');
      const music = await lobby.now(requestOrigin(request));
      // Seuls les admins ont besoin de savoir si le compte Spotify est relié.
      const accountId = readSession(request);
      const admin = accountId !== null && await isAdmin(accountId);
      return Response.json({ ...music, connected: admin && music.connected }, { headers: { 'Cache-Control': 'no-store' } });
    } }],
    ['jam', { method: 'POST', run: async (request) => {
      if (!lobby) throw new HttpError(404, 'Route inconnue.');
      const accountId = readSession(request);
      if (accountId === null) throw new HttpError(401, 'Connecte-toi avec Discord.');
      const origin = request.headers.get('origin');
      if (origin && origin !== requestOrigin(request)) throw new HttpError(403, 'Cette action doit être envoyée depuis le site.');
      if (!await isAdmin(accountId)) throw new HttpError(403, 'Réservé aux admins du club.');
      const parsed = jamUrlSchema.safeParse(await body(request));
      if (!parsed.success) throw new HttpError(400, 'Colle le lien de partage de la Jam (spotify.link ou open.spotify.com).');
      await lobby.saveJam(parsed.data.url);
      return Response.json(await lobby.now(requestOrigin(request)), { headers });
    } }],
    ['lobby-console', { method: 'GET', run: async (request) => {
      if (!lobby?.console) throw new HttpError(404, 'Route inconnue.');
      const { accountId, origin } = await musicMember(request);
      return musicResponse(() => lobby.console!(origin, accountId));
    } }],
    ['lobby-visibility', { method: 'POST', run: async (request) => {
      if (!lobby?.setVisibility) throw new HttpError(404, 'Route inconnue.');
      const { accountId, origin } = await musicMember(request);
      const parsed = lobbyVisibilitySchema.safeParse(await body(request));
      if (!parsed.success) throw new HttpError(400, 'Visibilité invalide.');
      limit(accountId, 'control', 20);
      return musicResponse(() => lobby.setVisibility!(origin, accountId, parsed.data.visible));
    } }],
    ['spotify-control', { method: 'POST', run: async (request) => {
      if (!lobby?.control) throw new HttpError(404, 'Route inconnue.');
      const { accountId, origin } = await musicMember(request);
      const parsed = spotifyCommandSchema.safeParse(await body(request));
      if (!parsed.success) throw new HttpError(400, 'Commande Spotify inconnue.');
      limit(accountId, 'control', 20);
      return musicResponse(() => lobby.control!(origin, accountId, parsed.data.action));
    } }],
    ['spotify-search', { method: 'GET', run: async (request) => {
      if (!lobby?.search) throw new HttpError(404, 'Route inconnue.');
      const { accountId, origin } = await musicMember(request);
      const parsed = spotifySearchSchema.safeParse(new URL(request.url).searchParams.get('q'));
      if (!parsed.success) throw new HttpError(400, 'Recherche un titre ou un artiste avec 2 à 100 caractères.');
      limit(accountId, 'search', 12);
      return musicResponse(async () => ({ tracks: await lobby.search!(origin, accountId, parsed.data) }));
    } }],
    ['spotify-queue', { method: 'POST', run: async (request) => {
      if (!lobby?.queue) throw new HttpError(404, 'Route inconnue.');
      const { accountId, origin } = await musicMember(request);
      const parsed = spotifyQueueSchema.safeParse(await body(request));
      if (!parsed.success) throw new HttpError(400, 'Choisis un morceau Spotify valide.');
      limit(accountId, 'queue', 6);
      return musicResponse(async () => { await lobby.queue!(origin, accountId, parsed.data.uri); return { queued: true }; });
    } }],
    ['spotify-disconnect', { method: 'POST', run: async (request) => {
      if (!lobby?.disconnect) throw new HttpError(404, 'Route inconnue.');
      const accountId = readSession(request);
      if (accountId === null) throw new HttpError(401, 'Connecte-toi avec Discord.');
      const origin = request.headers.get('origin');
      if (origin && origin !== requestOrigin(request)) throw new HttpError(403, 'Cette action doit être envoyée depuis le site.');
      if (!await isAdmin(accountId)) throw new HttpError(403, 'Réservé aux admins du club.');
      await lobby.disconnect();
      return Response.json(await lobby.now(requestOrigin(request)), { headers });
    } }],
    ['photos', { method: 'GET', run: async () => {
      if (!photos) throw new HttpError(404, 'Route inconnue.');
      return Response.json(await photos.list(), { headers: { 'Cache-Control': 'public, max-age=60' } });
    } }],
    ['photo', { method: 'GET', run: async (request) => {
      const memberId = Number(new URL(request.url).searchParams.get('m'));
      const image = photos && Number.isInteger(memberId) ? await photos.get(memberId) : null;
      const parsed = image ? PHOTO.exec(image) : null;
      if (!parsed) throw new HttpError(404, 'Pas de photo.');
      // L'URL porte la version (?v=) : l'image peut rester en cache longtemps.
      return new Response(Buffer.from(parsed[2], 'base64'), { headers: { 'Content-Type': `image/${parsed[1]}`, 'Cache-Control': 'public, max-age=31536000, immutable' } });
    } }],
    ['photo-upload', { method: 'POST', run: async (request) => {
      if (!photos) throw new HttpError(404, 'Route inconnue.');
      const accountId = readSession(request);
      if (accountId === null) throw new HttpError(401, 'Connecte-toi avec Discord pour ajouter ta photo.');
      const origin = request.headers.get('origin');
      if (origin && origin !== requestOrigin(request)) throw new HttpError(403, 'Cette action doit être envoyée depuis le site.');
      const image = ((await body(request)) as { image?: unknown }).image;
      if (typeof image !== 'string' || image.length > 400_000 || !PHOTO.test(image)) throw new HttpError(400, 'Photo invalide ou trop lourde.');
      await photos.save(accountId, image);
      return Response.json(await photos.list(), { headers });
    } }],
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
