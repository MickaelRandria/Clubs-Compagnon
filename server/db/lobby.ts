import { sql } from 'drizzle-orm';
import type { LobbyMusic } from '../../shared/lobby.js';
import { fetchNowPlaying, refreshSpotifyToken, spotifyConfig, type SpotifyTokens } from '../spotify.js';
import { getDb } from './client.js';

// La musique du lobby (table lobby_music, drizzle/0028) : une seule ligne, l'hôte et ses jetons Spotify.

/** Le titre en cours, gardé 10 s : tous les visiteurs ne réveillent pas Spotify. */
let cache: { until: number; value: LobbyMusic } | null = null;

export async function saveSpotifyHost(accountId: number, tokens: SpotifyTokens) {
  await getDb().execute(sql`insert into lobby_music(id, account_id, refresh_token, access_token, expires_at, updated_at)
    values (1, ${accountId}, ${tokens.refreshToken}, ${tokens.accessToken}, ${tokens.expiresAt.toISOString()}, now())
    on conflict (id) do update set account_id = excluded.account_id, refresh_token = coalesce(excluded.refresh_token, lobby_music.refresh_token),
      access_token = excluded.access_token, expires_at = excluded.expires_at, updated_at = now()`);
  cache = null;
}

export async function saveJamUrl(url: string) {
  await getDb().execute(sql`insert into lobby_music(id, jam_url, updated_at) values (1, ${url || null}, now())
    on conflict (id) do update set jam_url = excluded.jam_url, updated_at = now()`);
  cache = null;
}

/** Ce qui joue dans le lobby. `origin` : pour la configuration Spotify (adresse de retour). */
export async function lobbyMusic(origin: string): Promise<LobbyMusic> {
  if (cache && cache.until > Date.now()) return cache.value;
  const rows = await getDb().execute(sql`select l.*, bets_player_name(l.account_id) as host from lobby_music l where id = 1`);
  const row = rows.rows[0];
  const base: LobbyMusic = { playing: null, next: null, host: row?.host ? String(row.host) : null,
    jamUrl: row?.jam_url ? String(row.jam_url) : null, connected: Boolean(row?.refresh_token) };
  const config = spotifyConfig(origin);
  let value = base;
  if (row?.refresh_token && config) {
    try {
      let accessToken = row.access_token ? String(row.access_token) : null;
      if (!accessToken || !row.expires_at || new Date(String(row.expires_at)).getTime() < Date.now()) {
        const fresh = await refreshSpotifyToken(config, String(row.refresh_token));
        await saveSpotifyHost(Number(row.account_id), fresh);
        accessToken = fresh.accessToken;
      }
      value = { ...base, ...await fetchNowPlaying(accessToken) };
    } catch (error) {
      // Spotify indisponible ou accès retiré : la carte disparaît, le site continue.
      console.error('[lobby] Spotify :', error);
    }
  }
  cache = { until: Date.now() + 10_000, value };
  return value;
}
