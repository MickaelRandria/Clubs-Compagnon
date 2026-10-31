import assert from 'node:assert/strict';
import { after, before, beforeEach, test } from 'node:test';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { setDbForTests } from '../server/db/client.js';
import { disconnectSpotifyHost, lobbyMusic, saveJamUrl, saveSpotifyHost } from '../server/db/lobby.js';
import * as schema from '../server/db/schema.js';
import type { SpotifyTokens } from '../server/spotify.js';

// Les vraies migrations et requêtes SQL s'exécutent uniquement dans une base en mémoire.
const pg = new PGlite();
const origin = 'https://club.test';
const previous = { SPOTIFY_CLIENT_ID: process.env.SPOTIFY_CLIENT_ID, SPOTIFY_CLIENT_SECRET: process.env.SPOTIFY_CLIENT_SECRET };
const track = { type: 'track', name: 'Le morceau', artists: [{ name: 'Artiste' }], duration_ms: 198_000,
  album: { name: 'Album', images: [] }, external_urls: { spotify: 'https://open.spotify.com/track/abc123' } };
const playback = { is_playing: true, currently_playing_type: 'track', progress_ms: 84_000, item: track };
const credentials = (suffix = 'ancien', expired = false): SpotifyTokens => ({ accessToken: `acces-${suffix}`, refreshToken: `refresh-${suffix}`,
  expiresAt: new Date(Date.now() + (expired ? -60_000 : 3_600_000)) });
const row = async () => (await pg.query<Record<string, unknown>>('select * from lobby_music where id = 1')).rows[0];

before(async () => {
  Object.assign(process.env, { SPOTIFY_CLIENT_ID: 'identifiant-test', SPOTIFY_CLIENT_SECRET: 'secret-test' });
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
