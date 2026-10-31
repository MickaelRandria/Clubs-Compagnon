import { z } from 'zod';
import type { LobbyMusic } from '../shared/lobby.js';

// L'hôte relie son compte une fois ; les jetons et les appels Spotify restent sur le serveur.
const SCOPES = 'user-read-currently-playing user-read-playback-state';
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

export interface SpotifyTokens { accessToken: string; refreshToken: string | null; expiresAt: Date }

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
  return new SpotifyUnavailable(`Spotify ne répond pas (${response.status}).`, response.status,
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
    expiresAt: new Date(Date.now() + Math.max(1, data.expires_in - 60) * 1000) };
}

/** Retour de Spotify : le code contre les jetons. */
export const exchangeSpotifyCode = (config: SpotifyConfig, code: string, fetchImpl: typeof fetch = fetch) =>
  token(config, { grant_type: 'authorization_code', code, redirect_uri: config.redirectUri }, fetchImpl);

/** Spotify ne renvoie pas nécessairement un nouveau jeton de rafraîchissement. */
export const refreshSpotifyToken = (config: SpotifyConfig, refreshToken: string, fetchImpl: typeof fetch = fetch) =>
  token(config, { grant_type: 'refresh_token', refresh_token: refreshToken }, fetchImpl);

const trackSchema = z.object({
  type: z.literal('track').optional(), name: z.string(), artists: z.array(z.object({ name: z.string() })).optional(),
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
