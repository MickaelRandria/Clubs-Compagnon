import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createAuthHandlers } from '../server/auth-http.js';
import {
  createToken, parseCookies, readToken, newState, stateMatches, MissingSecret,
  sessionCookie, clearedSessionCookie,
  safeReturnTo,
} from '../server/session.js';
import { authorizeUrl, discordConfig, exchangeCode, DiscordUnavailable } from '../server/discord.js';

const KEY = 'un-secret-de-test-suffisamment-long-pour-passer';

test('un jeton signé se relit et rend le bon compte', () => {
  assert.equal(readToken(createToken(42, Date.now(), KEY), Date.now(), KEY), 42);
});

test('un jeton falsifié est rejeté', () => {
  const token = createToken(42, Date.now(), KEY);
  const [id, expiry, signature] = token.split('.');
  // Changer le compte sans refaire la signature : c'est l'attaque évidente.
  assert.equal(readToken(`99.${expiry}.${signature}`, Date.now(), KEY), null);
  // Repousser l'expiration.
  assert.equal(readToken(`${id}.${Number(expiry) + 99_999}.${signature}`, Date.now(), KEY), null);
  // Signature bricolée.
  assert.equal(readToken(`${id}.${expiry}.${'a'.repeat(signature.length)}`, Date.now(), KEY), null);
});

test('un jeton signé avec un autre secret est rejeté', () => {
  const token = createToken(7, Date.now(), 'un-autre-secret-tout-aussi-long-que-le-premier');
  assert.equal(readToken(token, Date.now(), KEY), null);
});

test('un jeton expiré est rejeté', () => {
  const token = createToken(7, Date.now(), KEY);
  const dansDeuxMois = Date.now() + 60 * 24 * 3600 * 1000;
  assert.equal(readToken(token, dansDeuxMois, KEY), null);
});

test('un jeton absent ou malformé ne fait pas planter', () => {
  for (const bad of [undefined, '', 'x', 'a.b', 'a.b.c.d', '..', 'nan.nan.nan']) {
    assert.equal(readToken(bad as string | undefined, Date.now(), KEY), null);
  }
});

test('un secret absent ou trop court est refusé', () => {
  const previous = process.env.SESSION_SECRET;
  try {
    delete process.env.SESSION_SECRET;
    assert.throws(() => createToken(1), MissingSecret);
    process.env.SESSION_SECRET = 'trop-court';
    assert.throws(() => createToken(1), MissingSecret);
  } finally {
    if (previous === undefined) delete process.env.SESSION_SECRET; else process.env.SESSION_SECRET = previous;
  }
});

test('le cookie de session est protégé', () => {
  const cookie = sessionCookie(createToken(1, Date.now(), KEY));
  for (const flag of ['HttpOnly', 'Secure', 'SameSite=Lax', 'Path=/']) {
    assert.match(cookie, new RegExp(flag), `le cookie doit porter ${flag}`);
  }
  // SameSite=Strict empêcherait le retour depuis Discord d'être authentifié.
  assert.doesNotMatch(cookie, /SameSite=Strict/);
  assert.match(clearedSessionCookie(), /Max-Age=0/);
});

test('les cookies se lisent, y compris avec des espaces et des valeurs encodées', () => {
  const jar = parseCookies('a=1; dommage_session=7.123.sig ; autre=%C3%A9t%C3%A9');
  assert.equal(jar.dommage_session, '7.123.sig');
  assert.equal(jar.autre, 'été');
  assert.deepEqual(parseCookies(null), {});
  assert.deepEqual(parseCookies('cassé'), {});
  assert.deepEqual(parseCookies('cassé=%ZZ; valide=oui'), { valide: 'oui' });
});

test('le retour de connexion reste dans FC 27', () => {
  assert.equal(safeReturnTo('/fc27/nom?campagne=7#arena-cards'), '/fc27/nom?campagne=7#arena-cards');
  assert.equal(safeReturnTo('/profil#validation'), '/profil#validation');
  assert.equal(safeReturnTo('/fc27?connexion=refus&onglet=fiche'), '/fc27?onglet=fiche');
  for (const value of ['https://ailleurs.fr', '//ailleurs.fr', '//%', '/\\ailleurs.fr', '/api/auth/logout', '/fc27/../api', '/fc27evil', '/fc27?x=\n']) {
    assert.equal(safeReturnTo(value), '/fc27');
  }
});

test('une configuration sans secret de session ne propose pas de connexion', async () => {
  await withEnv({ ...CONFIGURED, SESSION_SECRET: 'court' }, async () => {
    assert.deepEqual(await (await handlers().me(new Request('https://x/api/auth/me'))).json(), { signedIn: false, canSignIn: false });
    assert.equal((await handlers().start(new Request('https://x/api/auth/discord'))).status, 503);
  });
});

test('le retour OAuth conserve la page et la campagne, avec des cookies séparés', async () => {
  await withEnv({ ...CONFIGURED }, async () => {
    const back = '/fc27/nom?campagne=7#arena-cards';
    const ok = (async () => ({ discordId: '1', username: 'rina', displayName: null, avatarUrl: null })) as never;
    const auth = handlers(ok);
    const start = await auth.start(new Request(`https://x/api/auth/discord?returnTo=${encodeURIComponent(back)}`));
    assert.equal(start.headers.getSetCookie().length, 2);
    const cookie = start.headers.getSetCookie().map(c => c.split(';')[0]).join('; ');
    const state = new URL(start.headers.get('location')!).searchParams.get('state');
    const success = await auth.callback(new Request(`https://x/api/auth/callback?code=c&state=${state}`, { headers: { cookie } }));
    assert.equal(success.headers.get('location'), back);
    assert.equal(success.headers.getSetCookie().length, 3);
    const failure = await auth.callback(new Request('https://x/api/auth/callback?error=access_denied', { headers: { cookie } }));
    assert.equal(failure.headers.get('location'), '/fc27/nom?campagne=7&connexion=refus#arena-cards');
  });
});

test('le state OAuth ne valide que lui-même', () => {
  const state = newState();
  assert.ok(state.length >= 16);
  assert.equal(stateMatches(state, state), true);
  assert.equal(stateMatches(state, newState()), false);
  assert.equal(stateMatches(null, state), false);
  assert.equal(stateMatches(state, undefined), false);
  assert.equal(stateMatches('', ''), false, 'un state vide ne doit jamais valider');
});

// ---------------------------------------------------------------- Discord

test('sans identifiants Discord, aucune connexion n’est proposée', () => {
  const previous = [process.env.DISCORD_CLIENT_ID, process.env.DISCORD_CLIENT_SECRET];
  try {
    delete process.env.DISCORD_CLIENT_ID;
    delete process.env.DISCORD_CLIENT_SECRET;
    assert.equal(discordConfig('https://exemple.fr'), null);
  } finally {
    if (previous[0]) process.env.DISCORD_CLIENT_ID = previous[0];
    if (previous[1]) process.env.DISCORD_CLIENT_SECRET = previous[1];
  }
});

test('l’URL de retour suit le domaine appelant', () => {
  const previous = [process.env.DISCORD_CLIENT_ID, process.env.DISCORD_CLIENT_SECRET];
  try {
    process.env.DISCORD_CLIENT_ID = 'abc';
    process.env.DISCORD_CLIENT_SECRET = 'def';
    // La même application doit marcher en local et en production sans reconfiguration.
    assert.equal(discordConfig('http://localhost:5173')!.redirectUri, 'http://localhost:5173/api/auth/callback');
    assert.equal(discordConfig('https://clubs-compagnon.vercel.app')!.redirectUri, 'https://clubs-compagnon.vercel.app/api/auth/callback');
  } finally {
    if (previous[0]) process.env.DISCORD_CLIENT_ID = previous[0]; else delete process.env.DISCORD_CLIENT_ID;
    if (previous[1]) process.env.DISCORD_CLIENT_SECRET = previous[1]; else delete process.env.DISCORD_CLIENT_SECRET;
  }
});

const config = { clientId: 'abc', clientSecret: 'tres-secret-123456', redirectUri: 'https://x/api/auth/callback' };

test('l’URL d’autorisation ne demande que l’identité', () => {
  const url = new URL(authorizeUrl(config, 'etat-123'));
  assert.equal(url.origin + url.pathname, 'https://discord.com/oauth2/authorize');
  assert.equal(url.searchParams.get('scope'), 'identify');
  assert.equal(url.searchParams.get('state'), 'etat-123');
  assert.equal(url.searchParams.get('response_type'), 'code');
  assert.equal(url.searchParams.get('redirect_uri'), config.redirectUri);
  // Le secret client ne doit jamais partir dans une URL de navigateur.
  assert.ok(!url.search.includes(config.clientSecret));
});

test('un profil Discord complet est normalisé', async () => {
  const fake = (async (url: string) => {
    if (String(url).includes('token')) return new Response(JSON.stringify({ access_token: 'jeton' }), { status: 200 });
    return new Response(JSON.stringify({ id: '123', username: 'rina', global_name: 'Rina', avatar: 'abcdef' }), { status: 200 });
  }) as never;
  const user = await exchangeCode('code', config, fake);
  assert.deepEqual(user, {
    discordId: '123', username: 'rina', displayName: 'Rina',
    avatarUrl: 'https://cdn.discordapp.com/avatars/123/abcdef.png?size=128',
  });
});

test('un profil sans avatar ni nom affiché reste exploitable', async () => {
  const fake = (async (url: string) => (String(url).includes('token')
    ? new Response(JSON.stringify({ access_token: 'j' }), { status: 200 })
    : new Response(JSON.stringify({ id: '9', username: 'bob' }), { status: 200 }))) as never;
  const user = await exchangeCode('code', config, fake);
  assert.equal(user.displayName, null);
  assert.equal(user.avatarUrl, null);
});

test('une panne ou une réponse incomplète de Discord ne passe pas', async () => {
  const refus = (async () => new Response('bad code', { status: 400 })) as never;
  await assert.rejects(() => exchangeCode('c', config, refus), DiscordUnavailable);

  const sansJeton = (async () => new Response(JSON.stringify({}), { status: 200 })) as never;
  await assert.rejects(() => exchangeCode('c', config, sansJeton), DiscordUnavailable);

  const profilVide = (async (url: string) => (String(url).includes('token')
    ? new Response(JSON.stringify({ access_token: 'j' }), { status: 200 })
    : new Response(JSON.stringify({ id: 5 }), { status: 200 }))) as never;
  await assert.rejects(() => exchangeCode('c', config, profilVide), DiscordUnavailable);

  const coupe = (async () => { throw new Error('ECONNRESET'); }) as never;
  await assert.rejects(() => exchangeCode('c', config, coupe), DiscordUnavailable);
});

test('le secret client n’apparaît jamais dans une erreur', async () => {
  const fuite = (async () => new Response(`refus pour ${config.clientSecret}`, { status: 401 })) as never;
  const error = await exchangeCode('c', config, fuite).catch((e) => e as Error);
  assert.ok(!error.message.includes(config.clientSecret), 'le secret a fuité');
  assert.match(error.message, /secret masqué/);
});

// ---------------------------------------------------------------- Routes

const compte = { id: 3, username: 'rina', displayName: 'Rina', avatarUrl: null };
const store = {
  async upsert() { return compte; },
  async find(id: number) { return id === compte.id ? compte : undefined; },
};
const handlers = (exchange?: never) => createAuthHandlers(store, exchange ? { exchange } : {});
const withEnv = async (env: Record<string, string | undefined>, run: () => Promise<void>) => {
  const previous = Object.fromEntries(Object.keys(env).map((k) => [k, process.env[k]]));
  Object.entries(env).forEach(([k, v]) => { if (v === undefined) delete process.env[k]; else process.env[k] = v; });
  try { await run(); } finally {
    Object.entries(previous).forEach(([k, v]) => { if (v === undefined) delete process.env[k]; else process.env[k] = v; });
  }
};
const CONFIGURED = { DISCORD_CLIENT_ID: 'abc', DISCORD_CLIENT_SECRET: 'def-secret-long', SESSION_SECRET: KEY };

test('sans session, la route « moi » dit si la connexion est possible', async () => {
  await withEnv({ ...CONFIGURED }, async () => {
    const body = await (await handlers().me(new Request('https://x/api/auth/me'))).json();
    assert.deepEqual(body, { signedIn: false, canSignIn: true });
  });
  await withEnv({ DISCORD_CLIENT_ID: undefined, DISCORD_CLIENT_SECRET: undefined, SESSION_SECRET: KEY }, async () => {
    const body = await (await handlers().me(new Request('https://x/api/auth/me'))).json();
    assert.deepEqual(body, { signedIn: false, canSignIn: false });
  });
});

test('avec une session valide, la route « moi » rend le compte', async () => {
  await withEnv({ ...CONFIGURED }, async () => {
    const request = new Request('https://x/api/auth/me', { headers: { cookie: `dommage_session=${createToken(3, Date.now(), KEY)}` } });
    const body = await (await handlers().me(request)).json();
    assert.deepEqual(body, { signedIn: true, account: compte });
  });
});

test('une session pointant vers un compte disparu est effacée', async () => {
  await withEnv({ ...CONFIGURED }, async () => {
    const request = new Request('https://x/api/auth/me', { headers: { cookie: `dommage_session=${createToken(999, Date.now(), KEY)}` } });
    const response = await handlers().me(request);
    assert.deepEqual(await response.json(), { signedIn: false, canSignIn: true });
    assert.match(response.headers.get('set-cookie') ?? '', /Max-Age=0/);
  });
});

test('le départ vers Discord pose un state et redirige', async () => {
  await withEnv({ ...CONFIGURED }, async () => {
    const response = await handlers().start(new Request('https://x/api/auth/discord'));
    assert.equal(response.status, 302);
    assert.match(response.headers.get('location') ?? '', /^https:\/\/discord\.com\/oauth2\/authorize\?/);
    assert.match(response.headers.get('set-cookie') ?? '', /dommage_oauth=/);
  });
});

test('un retour sans state valide est refusé sans appeler Discord', async () => {
  await withEnv({ ...CONFIGURED }, async () => {
    const jamais = (async () => { throw new Error('ne doit pas être appelé'); }) as never;
    // state absent
    let r = await handlers(jamais).callback(new Request('https://x/api/auth/callback?code=c'));
    assert.match(r.headers.get('location') ?? '', /connexion=etat/);
    // state qui ne correspond pas au cookie
    r = await handlers(jamais).callback(new Request('https://x/api/auth/callback?code=c&state=pirate',
      { headers: { cookie: 'dommage_oauth=legitime' } }));
    assert.match(r.headers.get('location') ?? '', /connexion=etat/);
  });
});

test('un refus sur l’écran Discord revient proprement', async () => {
  await withEnv({ ...CONFIGURED }, async () => {
    const jamais = (async () => { throw new Error('ne doit pas être appelé'); }) as never;
    const r = await handlers(jamais).callback(new Request('https://x/api/auth/callback?error=access_denied'));
    assert.match(r.headers.get('location') ?? '', /connexion=refus/);
  });
});

test('un retour valide ouvre la session', async () => {
  await withEnv({ ...CONFIGURED }, async () => {
    const ok = (async () => ({ discordId: '1', username: 'rina', displayName: null, avatarUrl: null })) as never;
    const r = await handlers(ok).callback(new Request('https://x/api/auth/callback?code=c&state=jeton',
      { headers: { cookie: 'dommage_oauth=jeton' } }));
    assert.equal(r.status, 302);
    assert.equal(r.headers.get('location'), '/fc27');
    const cookies = r.headers.getSetCookie().join(' ');
    assert.match(cookies, /dommage_session=/);
    assert.match(cookies, /dommage_oauth=; .*Max-Age=0/);
  });
});

test('une panne Discord renvoie l’utilisateur avec un motif, sans planter', async () => {
  await withEnv({ ...CONFIGURED }, async () => {
    const { DiscordUnavailable } = await import('../server/discord.js');
    const casse = (async () => { throw new DiscordUnavailable('503'); }) as never;
    const r = await handlers(casse).callback(new Request('https://x/api/auth/callback?code=c&state=j',
      { headers: { cookie: 'dommage_oauth=j' } }));
    assert.match(r.headers.get('location') ?? '', /connexion=discord/);
  });
});

test('la déconnexion efface le cookie', async () => {
  const r = await handlers().logout(new Request('https://x/api/auth/logout', { method: 'POST' }));
  assert.match(r.headers.get('set-cookie') ?? '', /dommage_session=; .*Max-Age=0/);
});

test('l’origine suit les en-têtes du navigateur, pas l’URL interne', async () => {
  const { requestOrigin } = await import('../server/discord.js');
  // Serveur de dev Vite : l'URL interne perd le port, l'en-tête Host le garde.
  assert.equal(requestOrigin(new Request('http://localhost/api/auth/discord',
    { headers: { host: 'localhost:5173' } })), 'http://localhost:5173');
  // Vercel : le proxy annonce l'hôte et le protocole publics.
  assert.equal(requestOrigin(new Request('http://interne/api/auth/discord',
    { headers: { 'x-forwarded-host': 'clubs-compagnon.vercel.app', 'x-forwarded-proto': 'https' } })),
    'https://clubs-compagnon.vercel.app');
  // Plusieurs protocoles chaînés par des proxies successifs : on prend le premier.
  assert.equal(requestOrigin(new Request('http://interne/x',
    { headers: { host: 'exemple.fr', 'x-forwarded-proto': 'https,http' } })), 'https://exemple.fr');
  // Un domaine public sans en-tête de protocole est servi en HTTPS.
  assert.equal(requestOrigin(new Request('http://interne/x', { headers: { host: 'exemple.fr' } })), 'https://exemple.fr');
  // Sans en-tête du tout, on retombe sur l'URL de la requête.
  assert.equal(requestOrigin(new Request('https://secours.fr/x')), 'https://secours.fr');
});
