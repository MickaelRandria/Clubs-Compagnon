import assert from 'node:assert/strict';
import { after, before, beforeEach, test } from 'node:test';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { setDbForTests } from '../server/db/client.js';
import { controlLobbySpotify, disconnectSpotifyHost, lobbyConsole, lobbyMusic, queueLobbyTrack, saveJamUrl,
  saveSpotifyHost, searchLobbyTracks, setLobbyVisibility } from '../server/db/lobby.js';
import * as schema from '../server/db/schema.js';
import type { SpotifyTokens } from '../server/spotify.js';
import { createBetsRouter } from '../server/bets-http.js';
import { createToken } from '../server/session.js';

// Les vraies migrations et requêtes SQL s'exécutent uniquement dans une base en mémoire.
const pg = new PGlite();
const origin = 'https://club.test';
const previous = { SPOTIFY_CLIENT_ID: process.env.SPOTIFY_CLIENT_ID, SPOTIFY_CLIENT_SECRET: process.env.SPOTIFY_CLIENT_SECRET,
  SESSION_SECRET: process.env.SESSION_SECRET };
const track = { type: 'track', uri: 'spotify:track:2Foc5Q5nqNiosCNqttzHof', name: 'Le morceau', artists: [{ name: 'Artiste' }], duration_ms: 198_000,
  album: { name: 'Album', images: [] }, external_urls: { spotify: 'https://open.spotify.com/track/abc123' } };
const playback = { is_playing: true, currently_playing_type: 'track', progress_ms: 84_000, item: track };
const credentials = (suffix = 'ancien', expired = false): SpotifyTokens => ({ accessToken: `acces-${suffix}`, refreshToken: `refresh-${suffix}`,
  expiresAt: new Date(Date.now() + (expired ? -60_000 : 3_600_000)) });
const row = async () => (await pg.query<Record<string, unknown>>('select * from lobby_music where id = 1')).rows[0];

before(async () => {
  Object.assign(process.env, { SPOTIFY_CLIENT_ID: 'identifiant-test', SPOTIFY_CLIENT_SECRET: 'secret-test',
    SESSION_SECRET: 'secret-session-des-tests-spotify-assez-long' });
  const journal = JSON.parse(await readFile(new URL('../drizzle/meta/_journal.json', import.meta.url), 'utf8'));
  for (const entry of journal.entries) await pg.exec(await readFile(new URL(`../drizzle/${entry.tag}.sql`, import.meta.url), 'utf8'));
  setDbForTests(drizzle({ client: pg, schema }));
  await pg.exec("insert into club_accounts(discord_id, username) values ('hote-1', 'Premier'), ('hote-2', 'Deuxième'), ('hote-3', 'Supprimé')");
});
beforeEach(async () => {
  await pg.exec('delete from lobby_music');
  await saveJamUrl('');
});
after(async () => {
  for (const [key, value] of Object.entries(previous)) {
    if (value === undefined) delete process.env[key]; else process.env[key] = value;
  }
  await pg.close();
});

test('migration 0028 : une seule ligne et un compte hôte existant', async () => {
  await assert.rejects(pg.exec('insert into lobby_music(id) values (2)'), /check constraint/i);
  await assert.rejects(pg.exec('update lobby_music set account_id = 999'), /foreign key/i);
  assert.equal((await pg.query('select * from lobby_music')).rows.length, 1);
});

test('sans connexion Spotify, le lien Jam est lisible et aucun appel externe ne part', async (t) => {
  const fetch = t.mock.method(globalThis, 'fetch', async () => { throw new Error('réseau interdit'); });
  await saveJamUrl('https://spotify.link/soiree');
  assert.deepEqual(await lobbyMusic(origin), { playing: null, next: null, host: null, jamUrl: 'https://spotify.link/soiree', connected: false });
  assert.equal(fetch.mock.callCount(), 0);
  await saveJamUrl('');
  assert.equal((await lobbyMusic(origin)).jamUrl, null);
});

test('changer d’hôte remplace ses deux jetons et conserve le lien Jam', async () => {
  await saveJamUrl('https://spotify.link/soiree');
  await saveSpotifyHost(1, credentials());
  await assert.rejects(saveSpotifyHost(2, { ...credentials('nouveau'), refreshToken: null }));
  assert.equal((await row()).account_id, 1);
  assert.equal((await row()).refresh_token, 'refresh-ancien');
  await saveSpotifyHost(2, credentials('nouveau'));
  const saved = await row();
  assert.equal(saved.account_id, 2);
  assert.equal(saved.access_token, 'acces-nouveau');
  assert.equal(saved.refresh_token, 'refresh-nouveau');
  assert.equal(saved.jam_url, 'https://spotify.link/soiree');
});

test('dix visiteurs simultanés partagent la lecture et une seule rotation de jetons', async (t) => {
  await saveSpotifyHost(1, credentials('ancien', true));
  const calls: string[] = [];
  t.mock.method(globalThis, 'fetch', async (input: string | URL | Request) => {
    const url = String(input); calls.push(url);
    if (url.includes('/api/token')) return Response.json({ access_token: 'acces-frais', refresh_token: 'refresh-frais', expires_in: 3600 });
    return Response.json(url.endsWith('/queue') ? { queue: [track] } : playback);
  });
  const results = await Promise.all(Array.from({ length: 10 }, () => lobbyMusic(origin)));
  assert.equal(calls.length, 3, 'un échange, une lecture du titre et une lecture de la file');
  assert.equal(results[0].host, 'Premier');
  assert.equal(results[0].playing?.title, 'Le morceau');
  for (const result of results) assert.deepEqual(result, results[0]);
  assert.equal((await row()).refresh_token, 'refresh-frais');
  await lobbyMusic(origin);
  assert.equal(calls.length, 3, 'une lecture suivante utilise le cache');
});

test('rafraîchir sans rotation conserve le jeton de rafraîchissement existant', async (t) => {
  await saveSpotifyHost(1, credentials('ancien', true));
  t.mock.method(globalThis, 'fetch', async (input: string | URL | Request) => String(input).includes('/api/token')
    ? Response.json({ access_token: 'acces-frais', expires_in: 3600 }) : new Response(null, { status: 204 }));
  assert.equal((await lobbyMusic(origin)).connected, true);
  assert.equal((await row()).refresh_token, 'refresh-ancien');
  assert.equal((await row()).access_token, 'acces-frais');
});

test('un accès refusé avant expiration déclenche une seule rotation puis un nouvel essai', async (t) => {
  await saveSpotifyHost(1, credentials());
  const authorizations: string[] = [];
  const fetch = t.mock.method(globalThis, 'fetch', async (input: string | URL | Request, init?: RequestInit) => {
    if (String(input).includes('/api/token')) return Response.json({ access_token: 'acces-frais', expires_in: 3600 });
    const authorization = new Headers(init?.headers).get('authorization')!;
    authorizations.push(authorization);
    return authorization === 'Bearer acces-ancien' ? new Response(null, { status: 401 }) : new Response(null, { status: 204 });
  });
  assert.equal((await lobbyMusic(origin)).connected, true);
  assert.equal(fetch.mock.callCount(), 3);
  assert.deepEqual(authorizations, ['Bearer acces-ancien', 'Bearer acces-frais']);
});

test('une connexion retirée est oubliée sans supprimer le lien Jam', async (t) => {
  t.mock.method(console, 'error', () => {});
  await saveJamUrl('https://spotify.link/soiree');
  await saveSpotifyHost(1, credentials('ancien', true));
  t.mock.method(globalThis, 'fetch', async () => Response.json({ error: 'invalid_grant' }, { status: 400 }));
  const music = await lobbyMusic(origin);
  assert.equal(music.connected, false);
  assert.equal(music.playing, null);
  assert.equal(music.jamUrl, 'https://spotify.link/soiree');
  assert.equal((await row()).refresh_token, null);
  assert.equal((await row()).access_token, null);
});

test('une limite Spotify suspend les appels pendant tout Retry-After', async (t) => {
  t.mock.method(console, 'error', () => {});
  let now = Date.now();
  t.mock.method(Date, 'now', () => now);
  await saveSpotifyHost(1, credentials());
  const fetch = t.mock.method(globalThis, 'fetch', async () => new Response(null, { status: 429, headers: { 'Retry-After': '120' } }));
  assert.equal((await lobbyMusic(origin)).playing, null);
  now += 11_000;
  await lobbyMusic(origin);
  assert.equal(fetch.mock.callCount(), 1, 'le cache de 10 s ne doit pas raccourcir Retry-After');
  now += 120_000;
  await lobbyMusic(origin);
  assert.equal(fetch.mock.callCount(), 2);
});

test('enregistrer la Jam pendant une lecture invalide aussi son futur résultat en cache', async (t) => {
  await saveSpotifyHost(1, credentials());
  let release!: () => void;
  let entered!: () => void;
  const gate = new Promise<void>((resolve) => { release = resolve; });
  const started = new Promise<void>((resolve) => { entered = resolve; });
  const fetch = t.mock.method(globalThis, 'fetch', async () => { entered(); await gate; return new Response(null, { status: 204 }); });
  const old = lobbyMusic(origin);
  await started;
  await saveJamUrl('https://spotify.link/nouvelle');
  release();
  await old;
  assert.equal((await lobbyMusic(origin)).jamUrl, 'https://spotify.link/nouvelle');
  assert.equal(fetch.mock.callCount(), 2);
});

test('une ancienne rotation ne remplace pas un hôte connecté pendant l’appel Spotify', async (t) => {
  await saveSpotifyHost(1, credentials('ancien', true));
  let release!: () => void;
  let entered!: () => void;
  const gate = new Promise<void>((resolve) => { release = resolve; });
  const started = new Promise<void>((resolve) => { entered = resolve; });
  const authorizations: string[] = [];
  t.mock.method(globalThis, 'fetch', async (input: string | URL | Request, init?: RequestInit) => {
    if (String(input).includes('/api/token')) {
      entered(); await gate;
      return Response.json({ access_token: 'acces-rotation-tardive', refresh_token: 'refresh-rotation-tardive', expires_in: 3600 });
    }
    authorizations.push(new Headers(init?.headers).get('authorization')!);
    return new Response(null, { status: 204 });
  });
  const old = lobbyMusic(origin);
  await started;
  await saveSpotifyHost(2, credentials('nouveau'));
  release();
  assert.equal((await old).host, 'Deuxième');
  assert.ok(authorizations.length > 0);
  assert.ok(authorizations.every((authorization) => authorization === 'Bearer acces-nouveau'));
  assert.equal((await row()).refresh_token, 'refresh-nouveau');
  assert.equal((await row()).account_id, 2);
});

test('déconnecter Spotify efface les données de l’hôte et le cache, en conservant la Jam', async (t) => {
  await saveJamUrl('https://spotify.link/soiree');
  await saveSpotifyHost(1, credentials());
  const fetch = t.mock.method(globalThis, 'fetch', async (input: string | URL | Request) =>
    Response.json(String(input).endsWith('/queue') ? { queue: [] } : playback));
  assert.equal((await lobbyMusic(origin)).playing?.title, 'Le morceau');
  assert.equal(fetch.mock.callCount(), 2);
  await disconnectSpotifyHost();
  const saved = await row();
  for (const key of ['account_id', 'refresh_token', 'access_token', 'expires_at']) assert.equal(saved[key], null, key);
  assert.equal(saved.jam_url, 'https://spotify.link/soiree');
  assert.deepEqual(await lobbyMusic(origin), { playing: null, next: null, host: null, jamUrl: 'https://spotify.link/soiree', connected: false });
  assert.equal(fetch.mock.callCount(), 2, 'la lecture déconnectée ne retourne pas sur Spotify');
});

test('déconnecter pendant une rotation interdit le retour des anciens jetons et de la musique', async (t) => {
  await saveSpotifyHost(1, credentials('ancien', true));
  let release!: () => void;
  let entered!: () => void;
  const gate = new Promise<void>((resolve) => { release = resolve; });
  const started = new Promise<void>((resolve) => { entered = resolve; });
  const fetch = t.mock.method(globalThis, 'fetch', async () => {
    entered(); await gate;
    return Response.json({ access_token: 'acces-tardif', refresh_token: 'refresh-tardif', expires_in: 3600 });
  });
  const pending = lobbyMusic(origin);
  await started;
  await disconnectSpotifyHost();
  release();
  assert.equal((await pending).connected, false);
  assert.equal((await row()).access_token, null);
  assert.equal((await row()).refresh_token, null);
  assert.equal((await lobbyMusic(origin)).playing, null);
  assert.equal(fetch.mock.callCount(), 1, 'la rotation tardive ne doit pas relancer le lecteur');
});

test('déconnecter pendant la lecture remplace même la réponse déjà en vol', async (t) => {
  await saveSpotifyHost(1, credentials());
  let release!: () => void;
  let entered!: () => void;
  const gate = new Promise<void>((resolve) => { release = resolve; });
  const started = new Promise<void>((resolve) => { entered = resolve; });
  t.mock.method(globalThis, 'fetch', async (input: string | URL | Request) => {
    if (String(input).endsWith('/queue')) return Response.json({ queue: [] });
    entered(); await gate; return Response.json(playback);
  });
  const pending = lobbyMusic(origin);
  await started;
  await disconnectSpotifyHost();
  release();
  const music = await pending;
  assert.equal(music.connected, false);
  assert.equal(music.host, null);
  assert.equal(music.playing, null);
});

test('supprimer le compte hôte coupe la lecture sans appeler Spotify', async (t) => {
  await saveSpotifyHost(3, credentials());
  await pg.exec('delete from club_accounts where id = 3');
  const fetch = t.mock.method(globalThis, 'fetch', async () => { throw new Error('réseau interdit'); });
  assert.equal((await lobbyMusic(origin)).connected, false);
  assert.equal(fetch.mock.callCount(), 0);
});

const authorized = (expired = false): SpotifyTokens => ({ ...credentials('hote', expired),
  scope: 'user-read-currently-playing user-read-playback-state user-modify-playback-state' });

test('migration 0029 : lecteur visible par défaut et aucune portée inventée', async () => {
  assert.equal((await row()).visible, true);
  assert.equal((await row()).spotify_scope, null);
  await saveSpotifyHost(1, authorized());
  assert.match(String((await row()).spotify_scope), /user-modify-playback-state/);
  await saveSpotifyHost(2, credentials('autre'));
  assert.equal((await row()).spotify_scope, null, 'un nouvel OAuth remplace entièrement les portées');
});

test('un masquage sur une autre instance interdit même les métadonnées déjà en cache', async (t) => {
  await saveJamUrl('https://spotify.link/privee');
  await saveSpotifyHost(1, authorized());
  const fetch = t.mock.method(globalThis, 'fetch', async (input: string | URL | Request) =>
    Response.json(String(input).endsWith('/queue') ? { queue: [] } : playback));
  assert.equal((await lobbyMusic(origin)).playing?.title, 'Le morceau');
  const calls = fetch.mock.callCount();
  await pg.exec('update lobby_music set visible = false where id = 1');
  assert.deepEqual(await lobbyMusic(origin), { playing: null, next: null, host: null, jamUrl: null, connected: false });
  const member = await lobbyConsole(origin, 2);
  assert.equal(member.playback, null); assert.equal(member.host, null); assert.equal(member.jamUrl, null);
  assert.equal(member.canSearch, true); assert.equal(member.canQueue, true); assert.equal(member.canControl, false);
  assert.equal(fetch.mock.callCount(), calls, 'aucun appel Spotify pour le lecteur masqué des membres');
});

test('un masquage interinstance pendant la lecture supprime la réponse déjà en vol', async (t) => {
  await saveSpotifyHost(1, authorized());
  let release!: () => void; let entered!: () => void;
  const gate = new Promise<void>((resolve) => { release = resolve; });
  const started = new Promise<void>((resolve) => { entered = resolve; });
  t.mock.method(globalThis, 'fetch', async (input: string | URL | Request) => {
    if (String(input).endsWith('/queue')) return Response.json({ queue: [] });
    entered(); await gate; return Response.json(playback);
  });
  const pending = lobbyMusic(origin);
  await started; await pg.exec('update lobby_music set visible = false where id = 1'); release();
  assert.deepEqual(await pending, { playing: null, next: null, host: null, jamUrl: null, connected: false });
});

test('l’hôte garde son morceau en pause et son lecteur privé ; un autre admin ne peut pas le piloter', async (t) => {
  await saveSpotifyHost(1, authorized());
  t.mock.method(globalThis, 'fetch', async () => Response.json({ ...playback, is_playing: false }));
  const hidden = await setLobbyVisibility(origin, 1, false);
  assert.equal(hidden.isHost, true); assert.equal(hidden.canControl, true); assert.equal(hidden.playback?.isPlaying, false);
  assert.equal(hidden.playback?.track?.title, 'Le morceau');
  await assert.rejects(setLobbyVisibility(origin, 2, true), { status: 403 });
  await assert.rejects(controlLobbySpotify(origin, 2, 'pause'), { status: 403 });
  assert.equal((await row()).visible, false);
});

test('dix membres partagent une mesure privée et le masquage reste vérifié hors cache', async (t) => {
  await saveSpotifyHost(1, authorized());
  const fetch = t.mock.method(globalThis, 'fetch', async () => Response.json(playback));
  const values = await Promise.all(Array.from({ length: 10 }, () => lobbyConsole(origin, 2)));
  assert.equal(fetch.mock.callCount(), 1);
  assert.equal(values[0].playback?.track?.title, 'Le morceau');
  await pg.exec('update lobby_music set visible = false where id = 1');
  assert.equal((await lobbyConsole(origin, 2)).playback, null);
  assert.equal(fetch.mock.callCount(), 1);
});

test('le masquage pendant la mesure privée ne transmet ni morceau ni hôte au membre', async (t) => {
  await saveSpotifyHost(1, authorized());
  let release!: () => void; let entered!: () => void;
  const gate = new Promise<void>((resolve) => { release = resolve; });
  const started = new Promise<void>((resolve) => { entered = resolve; });
  t.mock.method(globalThis, 'fetch', async () => { entered(); await gate; return Response.json(playback); });
  const pending = lobbyConsole(origin, 2);
  await started; await pg.exec('update lobby_music set visible = false where id = 1'); release();
  const value = await pending;
  assert.equal(value.playback, null); assert.equal(value.host, null); assert.equal(value.jamUrl, null);
});

test('une ancienne connexion doit être réautorisée avant commandes et ajout, mais la recherche reste ouverte', async (t) => {
  await saveSpotifyHost(1, credentials());
  const fetch = t.mock.method(globalThis, 'fetch', async (input: string | URL | Request) =>
    String(input).includes('/search?') ? Response.json({ tracks: { items: [track] } }) : Response.json(playback));
  const console = await lobbyConsole(origin, 1);
  assert.equal(console.needsReconnect, true); assert.equal(console.canControl, false); assert.equal(console.canQueue, false);
  const calls = fetch.mock.callCount();
  await assert.rejects(controlLobbySpotify(origin, 1, 'next'), { status: 409 });
  await assert.rejects(queueLobbyTrack(origin, 2, track.uri), { status: 409 });
  assert.equal(fetch.mock.callCount(), calls, 'aucune mutation ne part sans portée de modification');
  assert.equal((await searchLobbyTracks(origin, 2, 'Artiste'))[0].title, 'Le morceau');
});

test('rotation sans portée renvoyée conserve les droits, déconnexion les efface', async (t) => {
  await saveSpotifyHost(1, authorized(true));
  t.mock.method(globalThis, 'fetch', async (input: string | URL | Request) => String(input).includes('/api/token')
    ? Response.json({ access_token: 'frais', expires_in: 3600 }) : Response.json(playback));
  assert.equal((await lobbyConsole(origin, 1)).canControl, true);
  assert.match(String((await row()).spotify_scope), /user-modify-playback-state/);
  await disconnectSpotifyHost();
  assert.equal((await row()).spotify_scope, null);
});

test('une rotation qui retire les droits est prise en compte immédiatement', async (t) => {
  await saveSpotifyHost(1, authorized(true));
  t.mock.method(globalThis, 'fetch', async (input: string | URL | Request) => String(input).includes('/api/token')
    ? Response.json({ access_token: 'frais', expires_in: 3600, scope: 'user-read-currently-playing' }) : Response.json(playback));
  const console = await lobbyConsole(origin, 1);
  assert.equal(console.canControl, false); assert.equal(console.canQueue, false); assert.equal(console.needsReconnect, true);
});

test('une commande réussie reste réussie quand la lecture de confirmation échoue', async (t) => {
  await saveSpotifyHost(1, authorized());
  const mutations: string[] = [];
  t.mock.method(globalThis, 'fetch', async (input: string | URL | Request, init?: RequestInit) => {
    if (init?.method === 'POST') { mutations.push(String(input)); return new Response(null, { status: 204 }); }
    return new Response(null, { status: 503 });
  });
  const result = await controlLobbySpotify(origin, 1, 'next');
  assert.equal(result.isHost, true); assert.equal(result.playback, null); assert.equal(mutations.length, 1);
  assert.equal((await setLobbyVisibility(origin, 1, false)).visible, false);
});

test('une panne du lecteur laisse le réglage de visibilité accessible et respecte Retry-After', async (t) => {
  let now = Date.now(); t.mock.method(Date, 'now', () => now);
  await saveSpotifyHost(1, authorized());
  const fetch = t.mock.method(globalThis, 'fetch', async () => new Response(null, { status: 429, headers: { 'Retry-After': '120' } }));
  assert.equal((await lobbyConsole(origin, 1)).isHost, true);
  now += 11_000;
  assert.equal((await lobbyConsole(origin, 1)).playback, null);
  assert.equal(fetch.mock.callCount(), 1);
});

test('les mutations ne sont jamais répétées après une panne réseau ou une réponse 5xx', async (t) => {
  await saveSpotifyHost(1, authorized());
  const fetch = t.mock.method(globalThis, 'fetch', async () => { throw new Error('réseau coupé'); });
  await assert.rejects(controlLobbySpotify(origin, 1, 'next'));
  assert.equal(fetch.mock.callCount(), 1);
  fetch.mock.mockImplementation(async () => new Response(null, { status: 503 }));
  await assert.rejects(queueLobbyTrack(origin, 2, track.uri));
  assert.equal(fetch.mock.callCount(), 2);
});

test('un 401 explicite sur l’ajout autorise une seule rotation et un nouvel essai', async (t) => {
  await saveSpotifyHost(1, authorized());
  const authorizations: string[] = [];
  t.mock.method(globalThis, 'fetch', async (input: string | URL | Request, init?: RequestInit) => {
    if (String(input).includes('/api/token')) return Response.json({ access_token: 'frais', expires_in: 3600 });
    const authorization = new Headers(init?.headers).get('authorization')!;
    authorizations.push(authorization);
    return new Response(null, { status: authorization === 'Bearer frais' ? 204 : 401 });
  });
  await queueLobbyTrack(origin, 2, track.uri);
  assert.deepEqual(authorizations, ['Bearer acces-hote', 'Bearer frais']);
});

function musicRouter() {
  return createBetsRouter({ mode: async () => 'off', setMode: async () => {} }, async (id) => id === 2,
    undefined, undefined, { now: lobbyMusic, saveJam: saveJamUrl, disconnect: disconnectSpotifyHost,
      accountExists: async (id) => Boolean((await pg.query('select id from club_accounts where id = $1', [id])).rows[0]),
      console: lobbyConsole, setVisibility: setLobbyVisibility, control: controlLobbySpotify, search: searchLobbyTracks, queue: queueLobbyTrack });
}
function musicRequest(route: string, id: number | null, body?: unknown, source = origin) {
  return new Request(`${origin}/api/bets/${route}`, { method: body === undefined ? 'GET' : 'POST',
    headers: { ...(id === null ? {} : { cookie: `dommage_session=${createToken(id)}` }), origin: source },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
}

test('HTTP : compte existant requis, recherche et ajout permis au membre, commandes réservées à l’hôte', async (t) => {
  await saveSpotifyHost(1, authorized());
  t.mock.method(globalThis, 'fetch', async (input: string | URL | Request, init?: RequestInit) => {
    if (init?.method) return new Response(null, { status: 204 });
    return String(input).includes('/search?') ? Response.json({ tracks: { items: [track] } }) : Response.json(playback);
  });
  const router = musicRouter();
  for (const id of [null, 999]) assert.equal((await router.GET(musicRequest('lobby-console', id))).status, 401);
  assert.equal((await router.GET(musicRequest('spotify-search?q=Artiste', 2))).status, 200);
  assert.equal((await router.POST(musicRequest('spotify-queue', 2, { uri: track.uri }))).status, 200);
  assert.equal((await router.POST(musicRequest('spotify-control', 2, { action: 'pause' }))).status, 403, 'admin non hôte refusé');
  assert.equal((await router.POST(musicRequest('lobby-visibility', 2, { visible: false }))).status, 403);
  assert.equal((await router.POST(musicRequest('spotify-control', 1, { action: 'pause' }))).status, 200, 'hôte non admin accepté');
  assert.equal((await router.POST(musicRequest('lobby-visibility', 1, { visible: false }))).status, 200);
  const hidden = await router.GET(musicRequest('lobby-console', 2));
  assert.match(hidden.headers.get('cache-control')!, /no-store/);
  const data = await hidden.json(); assert.equal(data.playback, null); assert.equal(data.host, null);
  assert.ok(!JSON.stringify(data).includes('acces-hote'));
});

test('HTTP : origine, schémas et limites sont vérifiés avant les appels Spotify', async (t) => {
  await saveSpotifyHost(1, authorized());
  const fetch = t.mock.method(globalThis, 'fetch', async () => new Response(null, { status: 204 }));
  const router = musicRouter();
  assert.equal((await router.POST(musicRequest('spotify-queue', 2, { uri: track.uri }, 'https://autre.test'))).status, 403);
  assert.equal((await router.POST(musicRequest('spotify-queue', 2, { uri: 'https://intrus.test' }))).status, 400);
  assert.equal((await router.POST(musicRequest('spotify-control', 1, { action: 'volume' }))).status, 400);
  assert.equal((await router.POST(musicRequest('lobby-visibility', 1, { visible: 'false' }))).status, 400);
  assert.equal((await router.GET(musicRequest('spotify-search?q=x', 2))).status, 400);
  assert.equal(fetch.mock.callCount(), 0);
  for (let i = 0; i < 6; i++) assert.equal((await router.POST(musicRequest('spotify-queue', 2, { uri: track.uri }))).status, 200);
  assert.equal((await router.POST(musicRequest('spotify-queue', 2, { uri: track.uri }))).status, 429);
  assert.equal(fetch.mock.callCount(), 6);
});
