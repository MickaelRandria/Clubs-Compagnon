import { handle, HttpError } from './http.js';
import {
  clearedSessionCookie, clearedStateCookie, createToken, newState, readSession,
  readState, sessionCookie, stateCookie, stateMatches, MissingSecret,
  sessionConfigured, returnCookie, clearedReturnCookie, readReturnTo, safeReturnTo,
} from './session.js';
import { DiscordUnavailable, authorizeUrl, discordConfig, exchangeCode, requestOrigin } from './discord.js';
import type { DiscordUser } from './discord.js';

// Routes de connexion. Le collectif reste consultable sans compte : seule l'écriture
// et toutes les actions demandent un compte. Une configuration incomplète ne casse jamais le site,
// elle retire simplement le bouton de connexion.

export interface Account {
  id: number; username: string; displayName: string | null; avatarUrl: string | null;
}

export interface AccountStore {
  upsert: (user: DiscordUser) => Promise<Account>;
  find: (id: number) => Promise<Account | undefined>;
}

export type MeResponse =
  | { signedIn: false; canSignIn: boolean }
  | { signedIn: true; account: Account };

/** Le retour de Discord se fait dans le navigateur : on redirige, on n'affiche pas de JSON. */
const redirect = (to: string, cookies: string[]) => {
  const headers = new Headers({ Location: to, 'Cache-Control': 'no-store' });
  for (const cookie of cookies) headers.append('Set-Cookie', cookie);
  return new Response(null, { status: 302, headers });
};

const origin = requestOrigin;
const canSignIn = (request: Request) => sessionConfigured() && discordConfig(origin(request)) !== null;

export function createAuthHandlers(store: AccountStore, options: { exchange?: typeof exchangeCode } = {}) {
  const exchange = options.exchange ?? exchangeCode;

  return {
    /** Qui est connecté, et la connexion est-elle même possible ? */
    me: (request: Request) => handle(async () => {
      const id = readSession(request);
      const account = id === null ? undefined : await store.find(id);
      const body: MeResponse = account
        ? { signedIn: true, account }
        : { signedIn: false, canSignIn: canSignIn(request) };
      // Une session pointant vers un compte disparu doit être effacée, pas subie.
      const headers = new Headers({ 'Cache-Control': 'no-store' });
      if (id !== null && !account) headers.append('Set-Cookie', clearedSessionCookie());
      return Response.json(body, { headers });
    }),

    /** Départ vers Discord, avec un `state` à usage unique posé en cookie. */
    start: (request: Request) => handle(async () => {
      const config = discordConfig(origin(request));
      if (!config || !sessionConfigured()) throw new HttpError(503, 'La connexion Discord n’est pas configurée sur ce site.');
      const state = newState();
      const back = safeReturnTo(new URL(request.url).searchParams.get('returnTo'));
      return redirect(authorizeUrl(config, state), [stateCookie(state), returnCookie(back)]);
    }),

    /** Retour de Discord : on vérifie le `state`, on échange le code, on ouvre la session. */
    callback: (request: Request) => handle(async () => {
      const url = new URL(request.url);
      // Même origine qu'au départ, sinon Discord refuse l'échange du code.
      const config = discordConfig(requestOrigin(request));
      const returnTo = readReturnTo(request);
      const cleared = [clearedStateCookie(), clearedReturnCookie()];
      const back = (error: string) => {
        const target = new URL(returnTo, 'https://local.invalid');
        target.searchParams.set('connexion', error);
        return redirect(target.pathname + target.search + target.hash, cleared);
      };

      if (!config || !sessionConfigured()) return back('indisponible');
      // L'utilisateur a refusé sur l'écran Discord : ce n'est pas une panne.
      if (url.searchParams.get('error')) return back('refus');
      if (!stateMatches(url.searchParams.get('state'), readState(request))) return back('etat');
      const code = url.searchParams.get('code');
      if (!code) return back('code');

      try {
        const user = await exchange(code, config);
        const account = await store.upsert(user);
        return redirect(returnTo, [...cleared, sessionCookie(createToken(account.id))]);
      } catch (error) {
        if (error instanceof DiscordUnavailable) {
          console.warn('[auth] échec Discord :', error.message);
          return back('discord');
        }
        if (error instanceof MissingSecret) {
          console.warn('[auth] SESSION_SECRET absente : impossible d’ouvrir une session.');
          return back('indisponible');
        }
        throw error;
      }
    }),

    logout: (request: Request) => handle(async () => {
      return Response.json({ signedIn: false, canSignIn: canSignIn(request) } satisfies MeResponse, {
        headers: new Headers({ 'Cache-Control': 'no-store', 'Set-Cookie': clearedSessionCookie() }),
      });
    }),
  };
}
