import { z } from 'zod';
import type { LobbyMusic, LobbyPlayback, LobbyTrack, SpotifyCommand } from '../shared/lobby.js';

// L'hôte relie son compte une fois ; les jetons et les appels Spotify restent sur le serveur.
const SCOPES = 'user-read-currently-playing user-read-playback-state user-modify-playback-state';
const TIMEOUT_MS = 8_000;

export interface SpotifyConfig { clientId: string; clientSecret: string; redirectUri: string }

/** Configuration Spotify pour ce site, ou null si les variables d'environnement manquent. */
export function spotifyConfig(origin: string): SpotifyConfig | null {
  const clientId = process.env.SPOTIFY_CLIENT_ID?.trim();
  const clientSecret = process.env.SPOTIFY_CLIENT_SECRET?.trim();
  if (!clientId || !clientSecret) return null;
  return { clientId, clientSecret, redirectUri: `${origin}/api/auth/spotify-callback` };
}

export const spotifyAuthorizeUrl = (config: SpotifyConfig, state: string) => 'https://accounts.spotify.com/authorize?' + new URLSearchParams({
  response_type: 'code', client_id: config.clientId, scope: SCOPES, redirect_uri: config.redirectUri, state,
});

export interface SpotifyTokens { accessToken: string; refreshToken: string | null; expiresAt: Date; scope?: string }

/** Une erreur sans contenu distant ni jeton, donc sans secret dans les journaux. */
export class SpotifyUnavailable extends Error {
  constructor(message: string, readonly status?: number, readonly retryAfterMs = 0, readonly invalidGrant = false) {
    super(message);
  }
}

async function unavailable(response: Response, tokenRequest = false): Promise<SpotifyUnavailable> {
  const retry = response.headers.get('retry-after');
  const delay = retry && /^\d+(?:\.\d+)?$/.test(retry) ? Number(retry) * 1000 : retry ? Date.parse(retry) - Date.now() : 60_000;
  const data = tokenRequest ? await response.json().catch(() => null) as { error?: unknown } | null : null;
  const message = response.status === 401 ? 'La connexion Spotify doit être renouvelée.'
    : response.status === 403 ? 'Spotify a refusé cette action. Vérifie les autorisations et le compte Premium de l’hôte.'
      : response.status === 404 ? 'Aucun lecteur Spotify actif. Ouvre Spotify et lance un morceau sur un appareil.'
        : response.status === 429 ? 'Spotify reçoit trop de demandes. Réessaie dans quelques instants.'
          : `Spotify ne répond pas (${response.status}).`;
  return new SpotifyUnavailable(message, response.status,
    response.status === 429 ? Math.max(10_000, Number.isFinite(delay) ? delay : 60_000) : 0,
    data?.error === 'invalid_grant');
}

async function request(url: string, init: RequestInit, fetchImpl: typeof fetch): Promise<Response> {
  try {
    return await fetchImpl(url, { ...init, signal: AbortSignal.timeout(TIMEOUT_MS) });
  } catch {
    throw new SpotifyUnavailable('Spotify est momentanément injoignable.');
  }
}

const tokenSchema = z.object({
  access_token: z.string().min(1), refresh_token: z.string().min(1).optional(), expires_in: z.number().positive().finite(),
  scope: z.string().optional(),
});

async function token(config: SpotifyConfig, body: Record<string, string>, fetchImpl: typeof fetch): Promise<SpotifyTokens> {
  const response = await request('https://accounts.spotify.com/api/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded',
      Authorization: 'Basic ' + Buffer.from(`${config.clientId}:${config.clientSecret}`).toString('base64') },
    body: new URLSearchParams(body),
  }, fetchImpl);
  if (!response.ok) throw await unavailable(response, true);
  const parsed = tokenSchema.safeParse(await response.json().catch(() => null));
  if (!parsed.success) throw new SpotifyUnavailable('Réponse Spotify sans jeton valide.');
  const data = parsed.data;
  return { accessToken: data.access_token, refreshToken: data.refresh_token ?? null,
    expiresAt: new Date(Date.now() + Math.max(1, data.expires_in - 60) * 1000),
    ...(data.scope !== undefined ? { scope: data.scope } : {}) };
}

/** Retour de Spotify : le code contre les jetons. */
export const exchangeSpotifyCode = (config: SpotifyConfig, code: string, fetchImpl: typeof fetch = fetch) =>
  token(config, { grant_type: 'authorization_code', code, redirect_uri: config.redirectUri }, fetchImpl);

/** Spotify ne renvoie pas nécessairement un nouveau jeton de rafraîchissement. */
export const refreshSpotifyToken = (config: SpotifyConfig, refreshToken: string, fetchImpl: typeof fetch = fetch) =>
  token(config, { grant_type: 'refresh_token', refresh_token: refreshToken }, fetchImpl);

const trackSchema = z.object({
  type: z.literal('track').optional(), uri: z.string().optional(), name: z.string(), artists: z.array(z.object({ name: z.string() })).optional(),
  album: z.object({ name: z.string(), images: z.array(z.object({ url: z.string(), width: z.number().nullable() })).optional() }).optional(),
  duration_ms: z.number().positive().finite(), external_urls: z.object({ spotify: z.string().optional() }).optional(),
});
type Track = z.infer<typeof trackSchema>;

/** L'attribution renvoie toujours vers un morceau Spotify, jamais vers une URL fournie librement. */
const trackUrl = (track: Track): string | null => {
  try {
    const url = new URL(track.external_urls?.spotify ?? '');
    return url.protocol === 'https:' && url.hostname === 'open.spotify.com' && !url.username && !url.password && !url.port
      && /^\/track\/[a-zA-Z0-9]+\/?$/.test(url.pathname) ? url.href : null;
  } catch { return null; }
};

const cover = (track: Track) => {
  const images = [...(track.album?.images ?? [])].filter((image) => image.url.startsWith('https://'));
  return images.sort((a, b) => (a.width ?? Infinity) - (b.width ?? Infinity)).find((image) => (image.width ?? 0) >= 160)?.url
    ?? images[0]?.url ?? null;
};

const TRACK_URI = /^spotify:track:[a-zA-Z0-9]{22}$/;
const artist = (track: Track) => track.artists?.map((value) => value.name).join(', ') ?? '';
const progress = (value: unknown, duration: number) => Math.min(duration, Math.max(0,
  typeof value === 'number' && Number.isFinite(value) ? value : 0));

/** Les identifiants de morceaux servent uniquement aux routes Spotify prévues par le serveur. */
const catalogueTrack = (value: unknown): LobbyTrack | null => {
  const parsed = trackSchema.safeParse(value);
  if (!parsed.success || !parsed.data.uri || !TRACK_URI.test(parsed.data.uri)) return null;
  const track = parsed.data;
  return { uri: track.uri!, title: track.name, artist: artist(track), album: track.album?.name ?? '',
    cover: cover(track), url: trackUrl(track), durationMs: track.duration_ms };
};

/** Vue privée du lecteur : le morceau reste disponible pendant une pause, sans lire la file. */
export async function fetchSpotifyPlayback(accessToken: string, fetchImpl: typeof fetch = fetch): Promise<LobbyPlayback> {
  const response = await request('https://api.spotify.com/v1/me/player/currently-playing', {
    headers: { Authorization: `Bearer ${accessToken}` },
  }, fetchImpl);
  const at = new Date().toISOString();
  const empty: LobbyPlayback = { track: null, isPlaying: false, progressMs: 0, at };
  if (response.status === 204) return empty;
  if (!response.ok) throw await unavailable(response);
  const data = await response.json().catch(() => null) as
    { item?: unknown; is_playing?: unknown; progress_ms?: unknown; currently_playing_type?: unknown } | null;
  if (data?.currently_playing_type !== 'track') return empty;
  const track = catalogueTrack(data.item);
  if (!track) return empty;
  return { track, isPlaying: data.is_playing === true, progressMs: progress(data.progress_ms, track.durationMs), at };
}

/** Recherche dix morceaux au maximum ; aucune préécoute audio n'est intégrée à l'app. */
export async function searchSpotifyTracks(accessToken: string, query: string, fetchImpl: typeof fetch = fetch): Promise<LobbyTrack[]> {
  const search = query.trim();
  if (search.length < 2 || search.length > 100) throw new SpotifyUnavailable('Recherche un titre ou un artiste avec 2 à 100 caractères.', 400);
  const params = new URLSearchParams({ q: search, type: 'track', limit: '10' });
  const response = await request(`https://api.spotify.com/v1/search?${params}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  }, fetchImpl);
  if (!response.ok) throw await unavailable(response);
  const data = await response.json().catch(() => null) as { tracks?: { items?: unknown } } | null;
  if (!Array.isArray(data?.tracks?.items)) throw new SpotifyUnavailable('La recherche Spotify a renvoyé une réponse inattendue.');
  return data.tracks.items.slice(0, 10).flatMap((item) => {
    const track = catalogueTrack(item);
    return track ? [track] : [];
  });
}

/** Une seule commande envoyée : le serveur décide si un 401 explicite autorise un nouvel essai. */
export async function sendSpotifyCommand(accessToken: string, action: SpotifyCommand, fetchImpl: typeof fetch = fetch): Promise<void> {
  const methods: Record<SpotifyCommand, 'PUT' | 'POST'> = { play: 'PUT', pause: 'PUT', next: 'POST', previous: 'POST' };
  if (!Object.hasOwn(methods, action)) throw new SpotifyUnavailable('Commande Spotify inconnue.', 400);
  const response = await request(`https://api.spotify.com/v1/me/player/${action}`, {
    method: methods[action], headers: { Authorization: `Bearer ${accessToken}` },
  }, fetchImpl);
  if (!response.ok) throw await unavailable(response);
}

/** Ajoute un morceau à la file de l'appareil actif ; jamais de répétition après un délai réseau. */
export async function addSpotifyTrackToQueue(accessToken: string, uri: string, fetchImpl: typeof fetch = fetch): Promise<void> {
  if (!TRACK_URI.test(uri)) throw new SpotifyUnavailable('Choisis un morceau Spotify valide.', 400);
  const params = new URLSearchParams({ uri });
  const response = await request(`https://api.spotify.com/v1/me/player/queue?${params}`, {
    method: 'POST', headers: { Authorization: `Bearer ${accessToken}` },
  }, fetchImpl);
  if (!response.ok) throw await unavailable(response);
}

/** Le titre en cours et le suivant. Une pause, un podcast ou une publicité masquent la carte. */
export async function fetchNowPlaying(accessToken: string, fetchImpl: typeof fetch = fetch): Promise<Pick<LobbyMusic, 'playing' | 'next'>> {
  const headers = { Authorization: `Bearer ${accessToken}` };
  const now = await request('https://api.spotify.com/v1/me/player/currently-playing', { headers }, fetchImpl);
  if (now.status === 204) return { playing: null, next: null };
  if (!now.ok) throw await unavailable(now);
  const data = await now.json().catch(() => null) as
    { is_playing?: boolean; progress_ms?: number | null; item?: unknown; currently_playing_type?: string } | null;
  if (!data?.is_playing || data.currently_playing_type !== 'track') return { playing: null, next: null };
  const parsed = trackSchema.safeParse(data.item);
  if (!parsed.success) return { playing: null, next: null };
  const item = parsed.data;
  // La file peut mettre du temps à répondre : l'heure de mesure reste celle du morceau en cours.
  const at = new Date().toISOString();
  let next: LobbyMusic['next'] = null;
  const queue = await request('https://api.spotify.com/v1/me/player/queue', { headers }, fetchImpl).catch(() => null);
  if (queue?.status === 429) throw await unavailable(queue);
  if (queue?.ok) {
    const q = await queue.json().catch(() => null) as { queue?: unknown[] } | null;
    const first = trackSchema.safeParse(q?.queue?.[0]);
    if (first.success) next = { title: first.data.name, artist: first.data.artists?.map((artist) => artist.name).join(', ') ?? '', url: trackUrl(first.data) };
  }
  return {
    playing: { title: item.name, artist: item.artists?.map((artist) => artist.name).join(', ') ?? '', album: item.album?.name ?? '',
      cover: cover(item), url: trackUrl(item), progressMs: Math.min(item.duration_ms, Math.max(0, Number.isFinite(data.progress_ms) ? data.progress_ms! : 0)),
      durationMs: item.duration_ms, at },
    next,
  };
}
