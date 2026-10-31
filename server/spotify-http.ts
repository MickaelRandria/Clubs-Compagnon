import { requestOrigin } from './discord.js';
import { handle, HttpError } from './http.js';
import { clearedStateCookie, newState, readSession, readState, stateCookie, stateMatches } from './session.js';
import { exchangeSpotifyCode, spotifyAuthorizeUrl, spotifyConfig, type SpotifyTokens } from './spotify.js';

// Relier le compte Spotify de l'hôte (un admin) : départ vers Spotify, puis retour sur la page Profil.

const redirect = (to: string, cookies: string[] = []) => {
  const headers = new Headers({ Location: to, 'Cache-Control': 'no-store' });
  for (const cookie of cookies) headers.append('Set-Cookie', cookie);
  return new Response(null, { status: 302, headers });
};

export function createSpotifyHandlers(isAdmin: (accountId: number) => Promise<boolean>,
  saveHost: (accountId: number, tokens: SpotifyTokens) => Promise<void>,
  options: { exchange?: typeof exchangeSpotifyCode } = {}) {
  const exchange = options.exchange ?? exchangeSpotifyCode;
  return {
    start: (request: Request) => handle(async () => {
      const accountId = readSession(request);
      if (accountId === null) throw new HttpError(401, 'Connecte-toi avec Discord d’abord.');
      if (!await isAdmin(accountId)) throw new HttpError(403, 'Réservé aux admins du club.');
      const config = spotifyConfig(requestOrigin(request));
      if (!config) throw new HttpError(503, 'Spotify n’est pas configuré sur ce site (SPOTIFY_CLIENT_ID / SPOTIFY_CLIENT_SECRET).');
      const state = newState();
      return redirect(spotifyAuthorizeUrl(config, state), [stateCookie(state)]);
    }),
    callback: (request: Request) => handle(async () => {
      const url = new URL(request.url);
      const back = (result: string) => redirect(`/profil?spotify=${result}`, [clearedStateCookie()]);
      const accountId = readSession(request);
      const config = spotifyConfig(requestOrigin(request));
      if (accountId === null || !config) return back('indisponible');
      if (url.searchParams.get('error')) return back('refus');
      if (!stateMatches(url.searchParams.get('state'), readState(request))) return back('etat');
      const code = url.searchParams.get('code');
      if (!code) return back('refus');
      try {
        await saveHost(accountId, await exchange(config, code));
      } catch (error) {
        console.error('[spotify] échange du code :', error);
        return back('erreur');
      }
      return back('ok');
    }),
  };
}
