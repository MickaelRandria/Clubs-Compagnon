import { sql } from 'drizzle-orm';
import type { LobbyConsole, LobbyMusic, LobbyPlayback, LobbyTrack, SpotifyCommand } from '../../shared/lobby.js';
import { spotifyQueueSchema, spotifySearchSchema } from '../../shared/lobby.js';
import { HttpError } from '../http.js';
import { addSpotifyTrackToQueue, fetchNowPlaying, fetchSpotifyPlayback, refreshSpotifyToken, searchSpotifyTracks,
  sendSpotifyCommand, spotifyConfig, SpotifyUnavailable, type SpotifyConfig, type SpotifyTokens } from '../spotify.js';
import { getDb } from './client.js';

// Une seule ligne ; les jetons ne quittent jamais le serveur.
type HostRow = Record<string, unknown>;
const emptyMusic = (): LobbyMusic => ({ playing: null, next: null, host: null, jamUrl: null, connected: false });
const hostName = (row?: HostRow) => row?.host ? String(row.host) : null;
const jamUrl = (row?: HostRow) => row?.jam_url ? String(row.jam_url) : null;
const connection = (row?: HostRow) => JSON.stringify([row?.account_id, row?.refresh_token, row?.access_token]);
const sameConnection = (a?: HostRow, b?: HostRow) => connection(a) === connection(b);
const linked = (row: HostRow | undefined, origin: string) => Boolean(row?.account_id && row.refresh_token && spotifyConfig(origin));
const canModify = (row: HostRow) => String(row.spotify_scope ?? '').split(/\s+/).includes('user-modify-playback-state');
const readHost = async () => (await getDb().execute(sql`select l.account_id, l.refresh_token, l.access_token, l.expires_at,
  l.jam_url, l.visible, l.spotify_scope, bets_player_name(l.account_id) as host from lobby_music l where id = 1`)).rows[0];

let cache: { until: number; value: LobbyMusic; row: HostRow | undefined } | null = null;
let revision = 0;
let pending: { revision: number; key: string; promise: Promise<LobbyMusic> } | null = null;
const refreshes = new Map<string, Promise<HostRow | undefined>>();
type PrivateResult = { value: LobbyPlayback; row: HostRow };
let privateCache: { until: number; result: PrivateResult } | null = null;
let privatePending: { key: string; promise: Promise<PrivateResult> } | null = null;
let privateFailure: { key: string; until: number; error: SpotifyUnavailable } | null = null;
const invalidate = () => { revision++; cache = null; pending = null; privateCache = null; privatePending = null; privateFailure = null; };

export async function saveSpotifyHost(accountId: number, tokens: SpotifyTokens) {
  if (!tokens.refreshToken) throw new Error('Spotify n’a pas transmis de jeton de rafraîchissement. Recommence la connexion.');
  await getDb().execute(sql`insert into lobby_music(id, account_id, refresh_token, access_token, expires_at, spotify_scope, updated_at)
    values (1, ${accountId}, ${tokens.refreshToken}, ${tokens.accessToken}, ${tokens.expiresAt.toISOString()}, ${tokens.scope ?? null}, now())
    on conflict (id) do update set account_id = excluded.account_id, refresh_token = excluded.refresh_token,
      access_token = excluded.access_token, expires_at = excluded.expires_at, spotify_scope = excluded.spotify_scope, updated_at = now()`);
  invalidate();
}

export async function saveJamUrl(url: string) {
  await getDb().execute(sql`insert into lobby_music(id, jam_url, updated_at) values (1, ${url || null}, now())
    on conflict (id) do update set jam_url = excluded.jam_url, updated_at = now()`);
  invalidate();
}

/** Déconnecter supprime également les autorisations conservées du compte Spotify. */
export async function disconnectSpotifyHost() {
  await getDb().execute(sql`update lobby_music set account_id = null, refresh_token = null, access_token = null,
    expires_at = null, spotify_scope = null, updated_at = now() where id = 1`);
  invalidate();
}

/** Une rotation partagée, conditionnelle, n'écrase pas une reconnexion concurrente. */
async function refreshHost(config: SpotifyConfig, row: HostRow): Promise<HostRow | undefined> {
  const key = connection(row);
  const running = refreshes.get(key);
  if (running) return running;
  const promise = (async () => {
    const fresh = await refreshSpotifyToken(config, String(row.refresh_token));
    const updated = await getDb().execute(sql`update lobby_music set access_token = ${fresh.accessToken},
      refresh_token = ${fresh.refreshToken ?? String(row.refresh_token)}, expires_at = ${fresh.expiresAt.toISOString()},
      spotify_scope = ${fresh.scope ?? row.spotify_scope ?? null}, updated_at = now()
      where id = 1 and account_id = ${Number(row.account_id)} and refresh_token = ${String(row.refresh_token)}
        and access_token is not distinct from ${row.access_token ?? null} returning id`);
    if (!updated.rows.length) return undefined;
    const after = await readHost();
    return after && Number(after.account_id) === Number(row.account_id) && after.access_token === fresh.accessToken
      && after.refresh_token === (fresh.refreshToken ?? String(row.refresh_token)) ? after : undefined;
  })().finally(() => { if (refreshes.get(key) === promise) refreshes.delete(key); });
  refreshes.set(key, promise);
  return promise;
}

/** Chaque opération vérifie encore l'hôte avant l'appel, puis ne réessaie qu'un 401 explicite. */
async function spotifyOperation<T>(origin: string, initial: HostRow, run: (accessToken: string) => Promise<T>, modify = false) {
  const config = spotifyConfig(origin);
  if (!config || !initial.account_id || !initial.refresh_token) throw new HttpError(409, 'Aucun compte Spotify n’est relié au lobby.');
  let row: HostRow | undefined = initial;
  let refreshed = false;
  try {
    if (!row.access_token || !row.expires_at || new Date(String(row.expires_at)).getTime() <= Date.now()) {
      row = await refreshHost(config, row);
      refreshed = true;
    }
    if (!row || Number(row.account_id) !== Number(initial.account_id)) throw new HttpError(409, 'La connexion Spotify a changé. Réessaie.');
    if (modify && !canModify(row)) throw new HttpError(409, 'L’hôte doit reconnecter Spotify pour autoriser les commandes et la file d’attente.');
    if (!sameConnection(row, await readHost())) throw new HttpError(409, 'La connexion Spotify a changé. Réessaie.');
    try {
      return { value: await run(String(row.access_token)), row };
    } catch (error) {
      if (!(error instanceof SpotifyUnavailable) || error.status !== 401 || refreshed) throw error;
      row = await refreshHost(config, row);
      if (!row || Number(row.account_id) !== Number(initial.account_id)) throw new HttpError(409, 'La connexion Spotify a changé. Réessaie.');
      if (modify && !canModify(row)) throw new HttpError(409, 'L’hôte doit reconnecter Spotify pour autoriser les commandes et la file d’attente.');
      if (!sameConnection(row, await readHost())) throw new HttpError(409, 'La connexion Spotify a changé. Réessaie.');
      return { value: await run(String(row.access_token)), row };
    }
  } catch (error) {
    if (error instanceof SpotifyUnavailable && error.invalidGrant) {
      await getDb().execute(sql`update lobby_music set refresh_token = null, access_token = null, expires_at = null, spotify_scope = null
        where id = 1 and refresh_token = ${String(initial.refresh_token)}`);
      invalidate();
    }
    throw error;
  }
}

async function readMusic(origin: string, row: HostRow | undefined) {
  const base: LobbyMusic = { ...emptyMusic(), host: hostName(row), jamUrl: jamUrl(row), connected: linked(row, origin) };
  let value = base;
  let ttl = 10_000;
  let source = row;
  if (row && base.connected) {
    try {
      const result = await spotifyOperation(origin, row, fetchNowPlaying);
      source = result.row;
      value = { ...base, ...result.value };
    } catch (error) {
      if (error instanceof SpotifyUnavailable) ttl = Math.max(ttl, error.retryAfterMs);
      console.error('[lobby] Spotify est momentanément indisponible.');
    }
  }
  return { value, ttl, source };
}

/** Le contrôle de visibilité contourne toujours le cache local, y compris après un appel distant. */
export async function lobbyMusic(origin: string): Promise<LobbyMusic> {
  const before = await readHost();
  if (before?.visible === false) return emptyMusic();
  let value: LobbyMusic;
  if (cache && cache.until > Date.now() && sameConnection(cache.row, before)) value = cache.value;
  else if (pending?.revision === revision && pending.key === connection(before)) value = await pending.promise;
  else {
    const startedAt = revision;
    const promise = readMusic(origin, before).then(async ({ value: result, ttl, source }) => {
      const after = await readHost();
      if (after?.visible === false) return emptyMusic();
      if (revision !== startedAt || !sameConnection(source, after)) return lobbyMusic(origin);
      const music = { ...result, host: hostName(after), jamUrl: jamUrl(after), connected: linked(after, origin) };
      cache = { until: Date.now() + ttl, value: music, row: after };
      return music;
    }).finally(() => { if (pending?.promise === promise) pending = null; });
    pending = { revision: startedAt, key: connection(before), promise };
    value = await promise;
  }
  const after = await readHost();
  if (after?.visible === false) return emptyMusic();
  if (!sameConnection(before, after) && (!cache || cache.value !== value || !sameConnection(cache.row, after))) return lobbyMusic(origin);
  return { ...value, host: hostName(after), jamUrl: jamUrl(after), connected: linked(after, origin) };
}

const requireHost = (row: HostRow | undefined, accountId: number) => {
  if (!row?.refresh_token || Number(row.account_id) !== accountId) throw new HttpError(403, 'Seul l’hôte Spotify peut modifier le lecteur.');
  return row;
};

/** Les membres partagent la même mesure ; le masquage reste revérifié en base après celle-ci. */
async function privatePlayback(origin: string, row: HostRow): Promise<PrivateResult> {
  if (privateCache && privateCache.until > Date.now() && sameConnection(privateCache.result.row, row)) return privateCache.result;
  const key = connection(row);
  if (privateFailure?.key === key && privateFailure.until > Date.now()) throw privateFailure.error;
  if (privatePending?.key === key) return privatePending.promise;
  const startedAt = revision;
  const promise = spotifyOperation(origin, row, fetchSpotifyPlayback).then((result) => {
    if (startedAt === revision) privateCache = { until: Date.now() + 10_000, result };
    return result;
  }).catch((error: unknown) => {
    if (error instanceof SpotifyUnavailable) privateFailure = { key, until: Date.now() + Math.max(10_000, error.retryAfterMs), error };
    throw error;
  }).finally(() => { if (privatePending?.promise === promise) privatePending = null; });
  privatePending = { key, promise };
  return promise;
}

export async function lobbyConsole(origin: string, accountId: number): Promise<LobbyConsole> {
  const row = await readHost();
  const connected = linked(row, origin);
  const isHost = connected && Number(row?.account_id) === accountId;
  const visible = row?.visible !== false;
  const allowed = Boolean(connected && row && canModify(row));
  let playback: LobbyConsole['playback'] = null;
  if (row && connected && (isHost || visible)) {
    try {
      const result = await privatePlayback(origin, row);
      const after = await readHost();
      if (!sameConnection(result.row, after) || after?.visible !== row.visible) return lobbyConsole(origin, accountId);
      playback = result.value;
      // Une rotation peut aussi retirer une portée : les permissions viennent de la dernière ligne.
      return { ...consoleState(origin, accountId, after), playback };
    } catch (error) {
      if (!(error instanceof SpotifyUnavailable)) throw error;
      // Le réglage de confidentialité doit rester accessible quand Spotify est en panne.
      return consoleWithoutPlayback(origin, accountId);
    }
  }
  return { connected, visible, isHost, canControl: isHost && allowed, canSearch: connected, canQueue: allowed,
    needsReconnect: isHost && connected && !allowed, host: isHost || visible ? hostName(row) : null,
    jamUrl: isHost || visible ? jamUrl(row) : null, playback };
}

export async function setLobbyVisibility(origin: string, accountId: number, visible: boolean): Promise<LobbyConsole> {
  requireHost(await readHost(), accountId);
  const changed = await getDb().execute(sql`update lobby_music set visible = ${visible}, updated_at = now()
    where id = 1 and account_id = ${accountId} and refresh_token is not null returning id`);
  if (!changed.rows.length) throw new HttpError(403, 'Seul l’hôte Spotify peut modifier le lecteur.');
  invalidate();
  return lobbyConsole(origin, accountId).catch(async () => consoleWithoutPlayback(origin, accountId));
}

export async function controlLobbySpotify(origin: string, accountId: number, action: SpotifyCommand): Promise<LobbyConsole> {
  const row = requireHost(await readHost(), accountId);
  await spotifyOperation(origin, row, (token) => sendSpotifyCommand(token, action), true);
  invalidate();
  // La commande a réussi : une panne de la lecture suivante ne doit pas inciter à la renvoyer.
  return lobbyConsole(origin, accountId).catch(async () => consoleWithoutPlayback(origin, accountId));
}

async function consoleWithoutPlayback(origin: string, accountId: number): Promise<LobbyConsole> {
  return consoleState(origin, accountId, await readHost());
}

function consoleState(origin: string, accountId: number, row: HostRow | undefined): LobbyConsole {
  const connected = linked(row, origin);
  const isHost = connected && Number(row?.account_id) === accountId;
  const visible = row?.visible !== false;
  const allowed = Boolean(connected && row && canModify(row));
  return { connected, visible, isHost, canControl: isHost && allowed, canSearch: connected, canQueue: allowed,
    needsReconnect: isHost && connected && !allowed, host: isHost || visible ? hostName(row) : null,
    jamUrl: isHost || visible ? jamUrl(row) : null, playback: null };
}

export async function searchLobbyTracks(origin: string, _accountId: number, query: string): Promise<LobbyTrack[]> {
  const parsed = spotifySearchSchema.safeParse(query);
  if (!parsed.success) throw new HttpError(400, 'Recherche un titre ou un artiste avec 2 à 100 caractères.');
  const row = await readHost();
  if (!row) throw new HttpError(409, 'Aucun compte Spotify n’est relié au lobby.');
  return (await spotifyOperation(origin, row, (token) => searchSpotifyTracks(token, parsed.data))).value;
}

export async function queueLobbyTrack(origin: string, _accountId: number, uri: string): Promise<void> {
  const parsed = spotifyQueueSchema.safeParse({ uri });
  if (!parsed.success) throw new HttpError(400, 'Choisis un morceau Spotify valide.');
  const row = await readHost();
  if (!row) throw new HttpError(409, 'Aucun compte Spotify n’est relié au lobby.');
  await spotifyOperation(origin, row, (token) => addSpotifyTrackToQueue(token, parsed.data.uri), true);
  invalidate();
}
