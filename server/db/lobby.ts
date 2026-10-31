import { sql } from 'drizzle-orm';
import type { LobbyMusic } from '../../shared/lobby.js';
import { fetchNowPlaying, refreshSpotifyToken, spotifyConfig, SpotifyUnavailable, type SpotifyConfig, type SpotifyTokens } from '../spotify.js';
import { getDb } from './client.js';

// La musique du lobby (table lobby_music, drizzle/0028) : une seule ligne, l'hôte et ses jetons Spotify.

/** Le titre en cours, gardé 10 s : tous les visiteurs ne réveillent pas Spotify. */
let cache: { until: number; value: LobbyMusic } | null = null;
let revision = 0;
let pending: { revision: number; promise: Promise<LobbyMusic> } | null = null;

const invalidate = () => { revision++; cache = null; pending = null; };

export async function saveSpotifyHost(accountId: number, tokens: SpotifyTokens) {
  // Une nouvelle connexion remplace intégralement l'ancien hôte, jamais son seul jeton d'accès.
  if (!tokens.refreshToken) throw new Error('Spotify n’a pas transmis de jeton de rafraîchissement. Recommence la connexion.');
  await getDb().execute(sql`insert into lobby_music(id, account_id, refresh_token, access_token, expires_at, updated_at)
    values (1, ${accountId}, ${tokens.refreshToken}, ${tokens.accessToken}, ${tokens.expiresAt.toISOString()}, now())
    on conflict (id) do update set account_id = excluded.account_id, refresh_token = excluded.refresh_token,
      access_token = excluded.access_token, expires_at = excluded.expires_at, updated_at = now()`);
  invalidate();
}

export async function saveJamUrl(url: string) {
  await getDb().execute(sql`insert into lobby_music(id, jam_url, updated_at) values (1, ${url || null}, now())
    on conflict (id) do update set jam_url = excluded.jam_url, updated_at = now()`);
  invalidate();
}

/** À la demande d'un admin, supprimer la connexion et les données Spotify de l'hôte. */
export async function disconnectSpotifyHost() {
  await getDb().execute(sql`update lobby_music set account_id = null, refresh_token = null, access_token = null,
    expires_at = null, updated_at = now() where id = 1`);
  invalidate();
}

/** Rotation des jetons, sans écraser un hôte reconnecté pendant l'appel à Spotify. */
async function refreshHost(config: SpotifyConfig, row: Record<string, unknown>) {
  const fresh = await refreshSpotifyToken(config, String(row.refresh_token));
  const updated = await getDb().execute(sql`update lobby_music set access_token = ${fresh.accessToken},
    refresh_token = ${fresh.refreshToken ?? String(row.refresh_token)}, expires_at = ${fresh.expiresAt.toISOString()}, updated_at = now()
    where id = 1 and account_id = ${Number(row.account_id)} and refresh_token = ${String(row.refresh_token)} returning id`);
  return updated.rows.length ? fresh.accessToken : null;
}

async function readMusic(origin: string, retryConflict = true): Promise<{ value: LobbyMusic; ttl: number }> {
  const rows = await getDb().execute(sql`select l.*, bets_player_name(l.account_id) as host from lobby_music l where id = 1`);
  const row = rows.rows[0];
  const config = spotifyConfig(origin);
  const base: LobbyMusic = { playing: null, next: null, host: row?.host ? String(row.host) : null,
    jamUrl: row?.jam_url ? String(row.jam_url) : null, connected: Boolean(row?.refresh_token && row.account_id && config) };
  let value = base;
  let ttl = 10_000;
  if (row?.refresh_token && row.account_id && config) {
    try {
      let accessToken = row.access_token ? String(row.access_token) : null;
      let refreshed = false;
      if (!accessToken || !row.expires_at || new Date(String(row.expires_at)).getTime() <= Date.now()) {
        accessToken = await refreshHost(config, row);
        refreshed = true;
      }
      if (!accessToken) return retryConflict ? readMusic(origin, false) : { value: base, ttl };
      try {
        value = { ...base, ...await fetchNowPlaying(accessToken) };
      } catch (error) {
        // Le jeton peut être révoqué avant son expiration : un seul nouvel essai après rotation.
        if (!(error instanceof SpotifyUnavailable) || error.status !== 401 || refreshed) throw error;
        accessToken = await refreshHost(config, row);
        if (!accessToken) return retryConflict ? readMusic(origin, false) : { value: base, ttl };
        value = { ...base, ...await fetchNowPlaying(accessToken) };
      }
    } catch (error) {
      // Spotify indisponible ou accès retiré : la carte disparaît, le site continue.
      if (error instanceof SpotifyUnavailable) {
        ttl = Math.max(ttl, error.retryAfterMs);
        if (error.invalidGrant) {
          // Ne pas continuer à rafraîchir une connexion explicitement retirée par l'hôte.
          await getDb().execute(sql`update lobby_music set refresh_token = null, access_token = null, expires_at = null
            where id = 1 and refresh_token = ${String(row.refresh_token)}`);
          value = { ...base, connected: false };
        }
      }
      console.error('[lobby] Spotify est momentanément indisponible.');
    }
  }
  return { value, ttl };
}

/** Un seul appel Spotify partagé par les visiteurs simultanés dans cette instance serveur. */
export async function lobbyMusic(origin: string): Promise<LobbyMusic> {
  if (cache && cache.until > Date.now()) return cache.value;
  if (pending?.revision === revision) return pending.promise;
  const startedAt = revision;
  const promise = readMusic(origin).then(({ value, ttl }) => {
    // Même la réponse déjà en vol doit tenir compte d'une déconnexion ou d'un changement d'hôte.
    if (revision !== startedAt) return lobbyMusic(origin);
    cache = { until: Date.now() + ttl, value };
    return value;
  }).finally(() => { if (pending?.promise === promise) pending = null; });
  pending = { revision: startedAt, promise };
  return promise;
}
