// Connexion Discord (OAuth 2.0, « Authorization Code »).
// Le club vit déjà sur Discord : un clic, aucun mot de passe à gérer, et le pseudo
// correspond à la personne réelle — personne ne peut prendre l'identité d'un autre.

const AUTHORIZE = 'https://discord.com/oauth2/authorize';
const TOKEN = 'https://discord.com/api/oauth2/token';
const ME = 'https://discord.com/api/users/@me';

/** `identify` seul : on ne demande ni e-mail, ni serveurs, ni rien d'autre. */
const SCOPE = 'identify';

export class DiscordUnavailable extends Error {}

export interface DiscordConfig { clientId: string; clientSecret: string; redirectUri: string }

/**
 * Origine réellement vue par le navigateur.
 *
 * `new URL(request.url).origin` ne suffit pas : derrière un proxy (Vercel) ou dans le
 * serveur de dev Vite, l'URL interne perd le port et parfois le protocole — on obtenait
 * `http://localhost/api/auth/callback` au lieu de `http://localhost:5173/...`, que Discord
 * rejette puisque l'URL de retour déclarée ne correspond plus.
 */
export function requestOrigin(request: Request): string {
  const headers = request.headers;
  const host = headers.get('x-forwarded-host') ?? headers.get('host');
  if (!host) return new URL(request.url).origin;
  const forwarded = headers.get('x-forwarded-proto')?.split(',')[0]?.trim();
  // Un hôte local reste en clair ; tout le reste est servi en HTTPS.
  const local = /^(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/.test(host);
  const protocol = forwarded || (local ? 'http' : 'https');
  return `${protocol}://${host}`;
}

/** Configuration lue à l'appel : sans elle, le bouton de connexion n'est pas proposé. */
export function discordConfig(origin: string): DiscordConfig | null {
  const clientId = process.env.DISCORD_CLIENT_ID?.trim();
  const clientSecret = process.env.DISCORD_CLIENT_SECRET?.trim();
  if (!clientId || !clientSecret) return null;
  // L'URL de retour suit le domaine appelant : la même app fonctionne en local,
  // en préproduction Vercel et en production sans reconfiguration.
  return { clientId, clientSecret, redirectUri: `${origin}/api/auth/callback` };
}

export function authorizeUrl(config: DiscordConfig, state: string): string {
  const params = new URLSearchParams({
    client_id: config.clientId,
    redirect_uri: config.redirectUri,
    response_type: 'code',
    scope: SCOPE,
    state,
    prompt: 'none',
  });
  return `${AUTHORIZE}?${params}`;
}

export interface DiscordUser {
  discordId: string;
  username: string;
  displayName: string | null;
  avatarUrl: string | null;
}

/** Ne jamais laisser le secret client fuir dans un message d'erreur. */
const scrub = (message: string, secret: string) =>
  (secret.length > 6 ? message.split(secret).join('[secret masqué]') : message);

export async function exchangeCode(code: string, config: DiscordConfig, fetchImpl: typeof fetch = fetch): Promise<DiscordUser> {
  let tokenResponse: Response;
  try {
    tokenResponse = await fetchImpl(TOKEN, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: config.clientId,
        client_secret: config.clientSecret,
        grant_type: 'authorization_code',
        code,
        redirect_uri: config.redirectUri,
      }),
      signal: AbortSignal.timeout(15_000),
    });
  } catch (error) {
    throw new DiscordUnavailable(scrub(`Discord injoignable : ${(error as Error).message}`, config.clientSecret));
  }
  if (!tokenResponse.ok) {
    const detail = await tokenResponse.text().catch(() => '');
    throw new DiscordUnavailable(scrub(`Échange du code refusé (${tokenResponse.status}). ${detail.slice(0, 200)}`, config.clientSecret));
  }

  const token = await tokenResponse.json().catch(() => null) as { access_token?: unknown } | null;
  if (typeof token?.access_token !== 'string') throw new DiscordUnavailable('Réponse de Discord sans jeton.');

  const meResponse = await fetchImpl(ME, {
    headers: { Authorization: `Bearer ${token.access_token}` },
    signal: AbortSignal.timeout(15_000),
  }).catch((error: Error) => { throw new DiscordUnavailable(`Profil Discord illisible : ${error.message}`); });
  if (!meResponse.ok) throw new DiscordUnavailable(`Profil Discord refusé (${meResponse.status}).`);

  const me = await meResponse.json().catch(() => null) as
    { id?: unknown; username?: unknown; global_name?: unknown; avatar?: unknown } | null;
  if (typeof me?.id !== 'string' || typeof me.username !== 'string') {
    throw new DiscordUnavailable('Profil Discord incomplet.');
  }

  return {
    discordId: me.id,
    username: me.username.slice(0, 60),
    displayName: typeof me.global_name === 'string' ? me.global_name.slice(0, 60) : null,
    avatarUrl: typeof me.avatar === 'string'
      ? `https://cdn.discordapp.com/avatars/${me.id}/${me.avatar}.png?size=128`
      : null,
  };
}
