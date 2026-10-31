import type { LobbyMusic } from '../shared/lobby.js';

// Spotify : l'hôte relie son compte une fois ; le serveur garde le jeton de rafraîchissement et
// demande le titre en cours à sa place. Rien de secret ne part vers le navigateur.

const SCOPES = 'user-read-currently-playing user-read-playback-state';

export interface SpotifyConfig { clientId: string; clientSecret: string; redirectUri: string }

/** Configuration Spotify pour ce site, ou null si les variables d'environnement manquent. */
export function spotifyConfig(origin: string): SpotifyConfig | null {
  const clientId = process.env.SPOTIFY_CLIENT_ID;
  const clientSecret = process.env.SPOTIFY_CLIENT_SECRET;
  if (!clientId || !clientSecret) return null;
  return { clientId, clientSecret, redirectUri: `${origin}/api/auth/spotify-callback` };
}

export const spotifyAuthorizeUrl = (config: SpotifyConfig, state: string) => 'https://accounts.spotify.com/authorize?' + new URLSearchParams({
  response_type: 'code', client_id: config.clientId, scope: SCOPES, redirect_uri: config.redirectUri, state,
});

export interface SpotifyTokens { accessToken: string; refreshToken: string | null; expiresAt: Date }

async function token(config: SpotifyConfig, body: Record<string, string>): Promise<SpotifyTokens> {
  const response = await fetch('https://accounts.spotify.com/api/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded',
      Authorization: 'Basic ' + Buffer.from(`${config.clientId}:${config.clientSecret}`).toString('base64') },
    body: new URLSearchParams(body),
  });
  if (!response.ok) throw new Error(`Spotify a refusé le jeton (${response.status}).`);
  const data = await response.json() as { access_token: string; refresh_token?: string; expires_in: number };
  return { accessToken: data.access_token, refreshToken: data.refresh_token ?? null, expiresAt: new Date(Date.now() + (data.expires_in - 60) * 1000) };
}

/** Retour de Spotify : le code contre les jetons. */
export const exchangeSpotifyCode = (config: SpotifyConfig, code: string) =>
  token(config, { grant_type: 'authorization_code', code, redirect_uri: config.redirectUri });

/** Un nouveau jeton d'accès (Spotify peut aussi renvoyer un nouveau jeton de rafraîchissement). */
export const refreshSpotifyToken = (config: SpotifyConfig, refreshToken: string) =>
  token(config, { grant_type: 'refresh_token', refresh_token: refreshToken });

interface Track { name: string; artists?: { name: string }[]; album?: { name: string; images?: { url: string; width: number }[] }; duration_ms: number }

const cover = (t: Track) => [...(t.album?.images ?? [])].sort((a, b) => a.width - b.width).find((i) => i.width >= 160)?.url ?? t.album?.images?.[0]?.url ?? null;

/** Le titre en cours chez l'hôte et le suivant dans sa file. `playing` null : rien ne joue. */
export async function fetchNowPlaying(accessToken: string): Promise<Pick<LobbyMusic, 'playing' | 'next'>> {
  const headers = { Authorization: `Bearer ${accessToken}` };
  const now = await fetch('https://api.spotify.com/v1/me/player/currently-playing', { headers });
  if (now.status === 204) return { playing: null, next: null };
  if (!now.ok) throw new Error(`Spotify ne répond pas (${now.status}).`);
  const data = await now.json() as { is_playing: boolean; progress_ms: number | null; item: Track | null; currently_playing_type: string };
  if (!data.item || !data.is_playing) return { playing: null, next: null };
  const item = data.item;
  let next: LobbyMusic['next'] = null;
  const queue = await fetch('https://api.spotify.com/v1/me/player/queue', { headers }).catch(() => null);
  if (queue?.ok) {
    const q = await queue.json() as { queue?: Track[] };
    const first = q.queue?.[0];
    if (first) next = { title: first.name, artist: first.artists?.map((a) => a.name).join(', ') ?? '' };
  }
  return {
    playing: { title: item.name, artist: item.artists?.map((a) => a.name).join(', ') ?? '', album: item.album?.name ?? '',
      cover: cover(item), progressMs: data.progress_ms ?? 0, durationMs: item.duration_ms, at: new Date().toISOString() },
    next,
  };
}
