import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { createAuthHandlers } from '../server/auth-http.js';
import { createAuthRouter } from '../server/auth-router.js';
import { createBetsRouter } from '../server/bets-http.js';
import { createSpotifyHandlers } from '../server/spotify-http.js';
import { createToken } from '../server/session.js';
import {
  addSpotifyTrackToQueue, exchangeSpotifyCode, fetchNowPlaying, fetchSpotifyPlayback, refreshSpotifyToken,
  searchSpotifyTracks, sendSpotifyCommand, spotifyAuthorizeUrl, spotifyConfig,
  SpotifyUnavailable, type SpotifyTokens,
} from '../server/spotify.js';
import { jamUrlSchema, type LobbyMusic } from '../shared/lobby.js';

// Tous les échanges Spotify sont simulés : aucun réseau ni compte réel.
const previous = { SESSION_SECRET: process.env.SESSION_SECRET, SPOTIFY_CLIENT_ID: process.env.SPOTIFY_CLIENT_ID,
  SPOTIFY_CLIENT_SECRET: process.env.SPOTIFY_CLIENT_SECRET };
Object.assign(process.env, { SESSION_SECRET: 'spotify-tests-only-session-secret-over-32-characters',
  SPOTIFY_CLIENT_ID: 'identifiant-test', SPOTIFY_CLIENT_SECRET: 'secret-test' });
after(() => {
  for (const [key, value] of Object.entries(previous)) {
    if (value === undefined) delete process.env[key]; else process.env[key] = value;
  }
});

const origin = 'https://club.test';
const config = { clientId: 'identifiant-test', clientSecret: 'secret-test', redirectUri: `${origin}/api/auth/spotify-callback` };
const tokens: SpotifyTokens = { accessToken: 'acces-test', refreshToken: 'refresh-test', expiresAt: new Date(Date.now() + 3_600_000) };
const track = { type: 'track', name: 'Le morceau', artists: [{ name: 'Artiste' }], duration_ms: 198_000,
  album: { name: 'Album', images: [{ url: 'https://i.scdn.co/image/grande', width: 640 }, { url: 'https://i.scdn.co/image/petite', width: 64 },
    { url: 'https://i.scdn.co/image/moyenne', width: 300 }] }, external_urls: { spotify: 'https://open.spotify.com/track/abc123' } };
const playback = { is_playing: true, currently_playing_type: 'track', progress_ms: 84_000, item: track };
const session = (accountId = 1) => `dommage_session=${createToken(accountId)}`;
const request = (path: string, cookie = '') => new Request(`${origin}${path}`, { headers: { cookie } });

test('Spotify : configuration absente, portée minimale et adresse de retour exacte', () => {
  const current = process.env.SPOTIFY_CLIENT_ID;
  process.env.SPOTIFY_CLIENT_ID = '  ';
  assert.equal(spotifyConfig(origin), null);
  process.env.SPOTIFY_CLIENT_ID = current;
  assert.deepEqual(spotifyConfig(origin), config);
  assert.equal(spotifyConfig('http://127.0.0.1:5173')?.redirectUri, 'http://127.0.0.1:5173/api/auth/spotify-callback');
  const url = new URL(spotifyAuthorizeUrl(config, 'state-test'));
  assert.equal(url.origin, 'https://accounts.spotify.com');
  assert.equal(url.searchParams.get('state'), 'state-test');
  assert.equal(url.searchParams.get('redirect_uri'), config.redirectUri);
  assert.equal(url.searchParams.get('scope'), 'user-read-currently-playing user-read-playback-state user-modify-playback-state');
  assert.equal(url.searchParams.has('client_secret'), false);
});

test('Spotify : échange du code côté serveur, délai borné et jeton rafraîchi sans rotation', async () => {
  const calls: { url: string; init: RequestInit }[] = [];
  const exchange: typeof fetch = async (input, init) => {
    calls.push({ url: String(input), init: init! });
    return Response.json({ access_token: 'acces', refresh_token: 'refresh', expires_in: 3600 });
  };
  const before = Date.now();
  const result = await exchangeSpotifyCode(config, 'code-test', exchange);
  assert.equal(calls[0].url, 'https://accounts.spotify.com/api/token');
  assert.equal(calls[0].init.method, 'POST');
  assert.ok(calls[0].init.signal instanceof AbortSignal);
  const body = new URLSearchParams(calls[0].init.body as URLSearchParams);
  assert.equal(body.get('code'), 'code-test');
  assert.equal(body.get('redirect_uri'), config.redirectUri);
  assert.equal(body.get('client_secret'), null);
  assert.equal(new Headers(calls[0].init.headers).get('authorization'), 'Basic ' + Buffer.from('identifiant-test:secret-test').toString('base64'));
  assert.ok(result.expiresAt.getTime() >= before + 3_540_000);
  const refreshed = await refreshSpotifyToken(config, 'refresh', async (_input, init) => {
    assert.equal(new URLSearchParams(init!.body as URLSearchParams).get('refresh_token'), 'refresh');
    return Response.json({ access_token: 'nouveau', expires_in: 3600 });
  });
  assert.equal(refreshed.accessToken, 'nouveau');
  assert.equal(refreshed.refreshToken, null);
});

test('Spotify : réponses de jeton invalides et erreurs réseau ne divulguent pas de secret', async () => {
  for (const response of [{ access_token: '', expires_in: 3600 }, { access_token: 'ok', expires_in: '3600' }, { access_token: 'ok', expires_in: -1 }]) {
    await assert.rejects(exchangeSpotifyCode(config, 'code', async () => Response.json(response)), SpotifyUnavailable);
  }
  await assert.rejects(exchangeSpotifyCode(config, 'code', async () => { throw new Error('secret-test acces-test'); }), (error: unknown) => {
    assert.ok(error instanceof SpotifyUnavailable);
    assert.doesNotMatch(error.message, /secret-test|acces-test/);
    return true;
  });
  await assert.rejects(refreshSpotifyToken(config, 'refresh', async () => Response.json({ error: 'invalid_grant', detail: 'secret-test' }, { status: 400 })),
    (error: unknown) => error instanceof SpotifyUnavailable && error.invalidGrant && !error.message.includes('secret-test'));
});

test('Spotify : titre, pochette, lien officiel et suivant ; progression bornée', async () => {
  const calls: string[] = [];
  const music = await fetchNowPlaying('acces', async (input, init) => {
    calls.push(String(input));
    assert.equal(new Headers(init?.headers).get('authorization'), 'Bearer acces');
    return Response.json(calls.length === 1 ? { ...playback, progress_ms: 999_999 } : { queue: [track] });
  });
  assert.equal(calls.length, 2);
  assert.equal(music.playing?.title, 'Le morceau');
  assert.equal(music.playing?.cover, 'https://i.scdn.co/image/moyenne');
  assert.equal(music.playing?.progressMs, 198_000);
  assert.equal(music.playing?.url, 'https://open.spotify.com/track/abc123');
  assert.deepEqual(music.next, { title: 'Le morceau', artist: 'Artiste', url: 'https://open.spotify.com/track/abc123' });
  assert.ok(Number.isFinite(Date.parse(music.playing!.at)));
});

test('Spotify : pause, absence de lecteur, podcast et publicité masquent la carte', async () => {
  for (const body of [{ ...playback, is_playing: false }, { ...playback, currently_playing_type: 'episode' },
    { ...playback, currently_playing_type: 'ad' }, { ...playback, item: null }, { ...playback, item: { ...track, type: 'episode' } }]) {
    let calls = 0;
    assert.deepEqual(await fetchNowPlaying('acces', async () => { calls++; return Response.json(body); }), { playing: null, next: null });
    assert.equal(calls, 1, 'la file ne se lit pas sans musique');
  }
  assert.deepEqual(await fetchNowPlaying('acces', async () => new Response(null, { status: 204 })), { playing: null, next: null });
});

test('Spotify : une file illisible ne masque pas le titre et les liens externes sont rejetés', async () => {
  for (const queue of [new Response('{', { status: 200 }), Response.json({ queue: [{ ...track, type: 'episode' }] }),
    new Response(null, { status: 403 })]) {
    let calls = 0;
    const result = await fetchNowPlaying('acces', async () => ++calls === 1
      ? Response.json({ ...playback, progress_ms: -20, item: { ...track, external_urls: { spotify: 'https://ailleurs.test/track/abc' } } }) : queue);
    assert.equal(result.playing?.title, 'Le morceau');
    assert.equal(result.playing?.url, null);
    assert.equal(result.playing?.progressMs, 0);
    assert.equal(result.next, null);
  }
});

test('Spotify : Retry-After est respecté pour le lecteur et la file', async () => {
  for (const rateLimitQueue of [false, true]) {
    let calls = 0;
    await assert.rejects(fetchNowPlaying('acces', async () => ++calls === 1 && rateLimitQueue ? Response.json(playback)
      : new Response(null, { status: 429, headers: { 'Retry-After': '120' } })),
    (error: unknown) => error instanceof SpotifyUnavailable && error.status === 429 && error.retryAfterMs === 120_000);
  }
});

test('Spotify : seules les portées réellement accordées sont conservées dans les jetons', async () => {
  const granted = await exchangeSpotifyCode(config, 'code', async () => Response.json({
    access_token: 'acces', refresh_token: 'refresh', expires_in: 3600, scope: 'user-read-playback-state',
  }));
  assert.equal(granted.scope, 'user-read-playback-state', 'ne pas déduire la portée de contrôle de la demande OAuth');
  const withoutScope = await refreshSpotifyToken(config, 'refresh', async () => Response.json({ access_token: 'neuf', expires_in: 3600 }));
  assert.equal(Object.hasOwn(withoutScope, 'scope'), false, 'l’absence de scope permet au store de conserver la portée précédente');
  const withScope = await refreshSpotifyToken(config, 'refresh', async () => Response.json({
    access_token: 'neuf', expires_in: 3600, scope: 'user-modify-playback-state',
  }));
  assert.equal(withScope.scope, 'user-modify-playback-state');
});

const catalogue = { ...track, uri: 'spotify:track:4uLU6hMCjMI75M1A2tKUQC',
  external_urls: { spotify: 'https://open.spotify.com/track/4uLU6hMCjMI75M1A2tKUQC' } };

test('Spotify : le lecteur privé conserve le morceau en pause et borne sa progression', async () => {
  for (const [value, expected] of [[-15, 0], [NaN, 0], [999_999, catalogue.duration_ms], [84_000, 84_000]]) {
    let calls = 0;
    const result = await fetchSpotifyPlayback('acces', async (input, init) => {
      calls++;
      assert.equal(String(input), 'https://api.spotify.com/v1/me/player/currently-playing');
      assert.equal(new Headers(init?.headers).get('authorization'), 'Bearer acces');
      assert.ok(init?.signal instanceof AbortSignal);
      return Response.json({ ...playback, is_playing: false, item: catalogue, progress_ms: value });
    });
    assert.equal(result.track?.uri, catalogue.uri);
    assert.equal(result.track?.title, 'Le morceau');
    assert.equal(result.track?.cover, 'https://i.scdn.co/image/moyenne');
    assert.equal(result.isPlaying, false);
    assert.equal(result.progressMs, expected);
    assert.ok(Number.isFinite(Date.parse(result.at)));
    assert.equal(calls, 1, 'la vue privée ne relit pas la file pour reprendre le morceau');
  }
});

test('Spotify : la vue privée ignore publicité, podcast, URI malformée et absence de lecteur', async () => {
  for (const response of [new Response(null, { status: 204 }), Response.json({ ...playback, currently_playing_type: 'ad' }),
    Response.json({ ...playback, currently_playing_type: 'episode' }), Response.json({ ...playback, item: track }),
    Response.json({ ...playback, item: { ...catalogue, uri: 'spotify:episode:4uLU6hMCjMI75M1A2tKUQC' } })]) {
    const result = await fetchSpotifyPlayback('acces', async () => response);
    assert.equal(result.track, null);
    assert.equal(result.isPlaying, false);
    assert.equal(result.progressMs, 0);
  }
});

test('Spotify : recherche encodée, dix résultats maximum, métadonnées bornées aux morceaux', async () => {
  let calls = 0;
  const found = await searchSpotifyTracks('acces', '  Daft Punk & Nile  ', async (input, init) => {
    calls++;
    const url = new URL(String(input));
    assert.equal(url.origin + url.pathname, 'https://api.spotify.com/v1/search');
    assert.equal(url.searchParams.get('q'), 'Daft Punk & Nile');
    assert.equal(url.searchParams.get('type'), 'track');
    assert.equal(url.searchParams.get('limit'), '10');
    assert.equal(new Headers(init?.headers).get('authorization'), 'Bearer acces');
    assert.ok(init?.signal instanceof AbortSignal);
    return Response.json({ tracks: { items: [catalogue, null, { ...catalogue, type: 'episode' },
      ...Array.from({ length: 10 }, () => catalogue)] } });
  });
  assert.equal(calls, 1);
  assert.equal(found.length, 8, 'les dix premières entrées sont filtrées, pas les suivantes');
  assert.deepEqual(found[0], { uri: catalogue.uri, title: catalogue.name, artist: 'Artiste', album: 'Album',
    cover: 'https://i.scdn.co/image/moyenne', url: catalogue.external_urls.spotify, durationMs: catalogue.duration_ms });
  for (const query of ['', 'a', ' '.repeat(4), 'a'.repeat(101)]) {
    await assert.rejects(searchSpotifyTracks('acces', query, async () => { throw new Error('réseau interdit'); }),
      (error: unknown) => error instanceof SpotifyUnavailable && error.status === 400);
  }
  await assert.rejects(searchSpotifyTracks('acces', 'titre', async () => Response.json({ tracks: null })), SpotifyUnavailable);
});

test('Spotify : lecture, pause et sauts utilisent les méthodes et routes attendues, sans nouvelle lecture', async () => {
  const methods = { play: 'PUT', pause: 'PUT', next: 'POST', previous: 'POST' } as const;
  for (const action of ['play', 'pause', 'next', 'previous'] as const) {
    let calls = 0;
    await sendSpotifyCommand('acces', action, async (input, init) => {
      calls++;
      assert.equal(String(input), `https://api.spotify.com/v1/me/player/${action}`);
      assert.equal(init?.method, methods[action]);
      assert.equal(init?.body, undefined, 'reprendre ne remplace pas la file par une liste de titres');
      assert.equal(new Headers(init?.headers).get('authorization'), 'Bearer acces');
      assert.ok(init?.signal instanceof AbortSignal);
      return new Response(null, { status: 204 });
    });
    assert.equal(calls, 1);
  }
});

test('Spotify : l’ajout à la file encode uniquement une URI de morceau valide', async () => {
  let calls = 0;
  await addSpotifyTrackToQueue('acces', catalogue.uri, async (input, init) => {
    calls++;
    const url = new URL(String(input));
    assert.equal(url.origin + url.pathname, 'https://api.spotify.com/v1/me/player/queue');
    assert.deepEqual([...url.searchParams], [['uri', catalogue.uri]]);
    assert.equal(init?.method, 'POST');
    assert.equal(new Headers(init?.headers).get('authorization'), 'Bearer acces');
    assert.ok(init?.signal instanceof AbortSignal);
    return new Response(null, { status: 204 });
  });
  assert.equal(calls, 1);
  for (const uri of ['spotify:track:abc', 'spotify:episode:4uLU6hMCjMI75M1A2tKUQC',
    'https://open.spotify.com/track/4uLU6hMCjMI75M1A2tKUQC', `${catalogue.uri}&device_id=autre`, '__proto__']) {
    await assert.rejects(addSpotifyTrackToQueue('acces', uri, async () => { throw new Error('réseau interdit'); }),
      (error: unknown) => error instanceof SpotifyUnavailable && error.status === 400);
  }
});

test('Spotify : une mutation échouée ou incertaine ne part jamais deux fois et ne divulgue aucun secret', async () => {
  const actions = [
    (fetch: typeof globalThis.fetch) => sendSpotifyCommand('acces-secret', 'next', fetch),
    (fetch: typeof globalThis.fetch) => sendSpotifyCommand('acces-secret', 'previous', fetch),
    (fetch: typeof globalThis.fetch) => addSpotifyTrackToQueue('acces-secret', catalogue.uri, fetch),
  ];
  for (const action of actions) {
    for (const status of [401, 403, 404, 429, 500]) {
      let calls = 0;
      await assert.rejects(action(async () => {
        calls++;
        return Response.json({ error: 'acces-secret', detail: 'secret-test' }, { status, headers: { 'Retry-After': '45' } });
      }), (error: unknown) => {
        assert.ok(error instanceof SpotifyUnavailable);
        assert.equal(error.status, status);
        assert.doesNotMatch(error.message, /acces-secret|secret-test/);
        if (status === 403) assert.match(error.message, /autorisations.*Premium/);
        if (status === 404) assert.match(error.message, /lecteur Spotify actif/);
        if (status === 429) assert.equal(error.retryAfterMs, 45_000);
        return true;
      });
      assert.equal(calls, 1);
    }
    let calls = 0;
    await assert.rejects(action(async () => { calls++; throw new Error('secret-test acces-secret'); }),
      (error: unknown) => error instanceof SpotifyUnavailable && error.status === undefined && !error.message.includes('secret'));
    assert.equal(calls, 1);
  }
});

function oauth() {
  const writes: { accountId: number; tokens: SpotifyTokens }[] = [];
  let admin = true;
  let exchanges = 0;
  const handlers = createSpotifyHandlers(async () => admin, async (accountId, value) => { writes.push({ accountId, tokens: value }); }, {
    exchange: async (given, code) => { assert.deepEqual(given, config); assert.equal(code, 'code'); exchanges++; return tokens; },
  });
  return { handlers, writes, admin: (value: boolean) => { admin = value; }, exchanges: () => exchanges };
}

test('OAuth Spotify : seuls les admins démarrent ; cookie distinct du flux Discord', async () => {
  const flow = oauth();
  assert.equal((await flow.handlers.start(request('/api/auth/spotify'))).status, 401);
  flow.admin(false);
  assert.equal((await flow.handlers.start(request('/api/auth/spotify', session()))).status, 403);
  flow.admin(true);
  const response = await flow.handlers.start(request('/api/auth/spotify', session()));
  assert.equal(response.status, 302);
  assert.equal(response.headers.get('cache-control'), 'no-store');
  assert.match(response.headers.get('set-cookie')!, /^dommage_spotify_oauth=1\./);
  for (const flag of ['HttpOnly', 'SameSite=Lax', 'Secure', 'Max-Age=600', 'Path=/api/auth']) assert.ok(response.headers.get('set-cookie')!.includes(flag));
  assert.doesNotMatch(response.headers.get('set-cookie')!, /dommage_oauth=/);
});

test('OAuth Spotify : un retour valide relie le bon admin et efface son cookie', async () => {
  const flow = oauth();
  const start = await flow.handlers.start(request('/api/auth/spotify', session()));
  const state = new URL(start.headers.get('location')!).searchParams.get('state');
  const cookie = `${session()}; ${start.headers.get('set-cookie')!.split(';')[0]}`;
  const response = await flow.handlers.callback(request(`/api/auth/spotify-callback?code=code&state=${state}`, cookie));
  assert.equal(response.headers.get('location'), '/profil?spotify=ok');
  assert.match(response.headers.get('set-cookie')!, /Max-Age=0/);
  assert.deepEqual(flow.writes, [{ accountId: 1, tokens }]);
  assert.equal(flow.exchanges(), 1);
});

test('OAuth Spotify : refus d’un state erroné, d’un autre compte et d’un rôle admin retiré', async () => {
  const flow = oauth();
  const start = await flow.handlers.start(request('/api/auth/spotify', session()));
  const state = new URL(start.headers.get('location')!).searchParams.get('state');
  const stateCookie = start.headers.get('set-cookie')!.split(';')[0];
  for (const [query, cookie] of [[`code=code&state=invalide`, `${session()}; ${stateCookie}`],
    [`code=code&state=${state}`, session()], [`code=code&state=${state}`, `${session(2)}; ${stateCookie}`]]) {
    assert.equal((await flow.handlers.callback(request(`/api/auth/spotify-callback?${query}`, cookie))).headers.get('location'), '/profil?spotify=etat');
  }
  flow.admin(false);
  assert.equal((await flow.handlers.callback(request(`/api/auth/spotify-callback?code=code&state=${state}`, `${session()}; ${stateCookie}`))).headers.get('location'), '/profil?spotify=refus');
  assert.equal(flow.exchanges(), 0);
  assert.deepEqual(flow.writes, []);
});

test('le routeur de connexion conserve les méthodes des deux nouvelles URL Spotify', async () => {
  const flow = oauth();
  const auth = createAuthHandlers({ find: async () => undefined, upsert: async () => { throw new Error('inutilisé'); } });
  const router = createAuthRouter(auth, flow.handlers);
  assert.equal((await router.GET(request('/api/auth/spotify', session()))).status, 302);
  const wrong = await router.POST(new Request(`${origin}/api/auth/spotify-callback`, { method: 'POST' }));
  assert.equal(wrong.status, 405);
  assert.equal(wrong.headers.get('allow'), 'GET');
});

test('les liens Jam refusent les domaines trompeurs, identifiants, protocoles et valeurs malformées', () => {
  for (const url of ['', 'https://spotify.link/une-jam', 'https://open.spotify.com/jam/abc?si=123']) {
    assert.equal(jamUrlSchema.safeParse({ url }).success, true, url);
  }
  for (const url of ['cassé', 'https://spotify.link.evil.test/x', 'https://spotify.link@evil.test/x', 'https://user:pass@spotify.link/x',
    'http://spotify.link/x', 'https://spotify.link:444/x', 'https://spotify.link/', 'javascript:alert(1)', 'https://spotify.link/x\n']) {
    assert.equal(jamUrlSchema.safeParse({ url }).success, false, url);
  }
});

test('la lecture publique du lobby fonctionne FoodBet fermé, sans état de connexion admin', async () => {
  const music: LobbyMusic = { playing: null, next: null, host: 'Hôte', jamUrl: 'https://spotify.link/jam', connected: true };
  const router = createBetsRouter({ mode: async () => 'off', setMode: async () => {} }, async (id) => id === 1,
    undefined, undefined, { now: async () => music, saveJam: async () => {} });
  for (const [cookie, connected] of [['', false], [session(2), false], [session(), true]] as const) {
    const response = await router.GET(request('/api/bets/lobby', cookie));
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('cache-control'), 'no-store');
    assert.deepEqual(await response.json(), { ...music, connected });
  }
  assert.equal(music.connected, true, 'la réponse publique ne doit pas altérer le cache partagé');
});

test('seul un admin du même site enregistre ou retire un lien Jam validé', async () => {
  const writes: string[] = [];
  const music: LobbyMusic = { playing: null, next: null, host: null, jamUrl: null, connected: true };
  const router = createBetsRouter({ mode: async () => 'off', setMode: async () => {} }, async (id) => id === 1,
    undefined, undefined, { now: async () => music, saveJam: async (url) => { writes.push(url); } });
  const post = (cookie: string, url: string, from = origin) => router.POST(new Request(`${origin}/api/bets/jam`, {
    method: 'POST', headers: { cookie, origin: from, 'Content-Type': 'application/json' }, body: JSON.stringify({ url }),
  }));
  assert.equal((await post('', 'https://spotify.link/jam')).status, 401);
  assert.equal((await post(session(2), 'https://spotify.link/jam')).status, 403);
  assert.equal((await post(session(), 'https://spotify.link/jam', 'https://ailleurs.test')).status, 403);
  assert.equal((await post(session(), 'https://ailleurs.test/jam')).status, 400);
  assert.deepEqual(writes, []);
  assert.equal((await post(session(), 'https://spotify.link/jam')).status, 200);
  assert.equal((await post(session(), '')).status, 200);
  assert.deepEqual(writes, ['https://spotify.link/jam', '']);
  assert.equal((await router.GET(request('/api/bets/jam', session()))).status, 405);
});

test('seul un admin du même site déconnecte Spotify, via POST', async () => {
  let disconnected = 0;
  const music: LobbyMusic = { playing: null, next: null, host: null, jamUrl: 'https://spotify.link/jam', connected: false };
  const router = createBetsRouter({ mode: async () => 'off', setMode: async () => {} }, async (id) => id === 1,
    undefined, undefined, { now: async () => music, saveJam: async () => {}, disconnect: async () => { disconnected++; } });
  const post = (cookie: string, from = origin) => router.POST(new Request(`${origin}/api/bets/spotify-disconnect`, {
    method: 'POST', headers: { cookie, origin: from },
  }));
  assert.equal((await post('')).status, 401);
  assert.equal((await post(session(2))).status, 403);
  assert.equal((await post(session(), 'https://ailleurs.test')).status, 403);
  assert.equal(disconnected, 0);
  const response = await post(session());
  assert.equal(response.status, 200);
  assert.match(response.headers.get('cache-control')!, /no-store/);
  assert.deepEqual(await response.json(), music);
  assert.equal(disconnected, 1);
  assert.equal((await router.GET(request('/api/bets/spotify-disconnect', session()))).status, 405);
});
