import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

// Session signée, sans table ni dépendance.
//
// Le cookie contient l'identifiant du compte et une date d'expiration, suivis d'une
// signature HMAC. Le serveur n'a rien à stocker : si la signature tient, la session
// est valide. Impossible de forger un cookie sans le secret.

const COOKIE = 'dommage_session';
const STATE_COOKIE = 'dommage_oauth';
const RETURN_COOKIE = 'dommage_oauth_return';
/** Un mois : le club prépare une saison, personne n'a envie de se reconnecter chaque semaine. */
const MAX_AGE = 30 * 24 * 3600;

export class MissingSecret extends Error {}
export const sessionConfigured = () => (process.env.SESSION_SECRET?.length ?? 0) >= 32;

function secret(): string {
  const value = process.env.SESSION_SECRET;
  if (!value || value.length < 32) {
    throw new MissingSecret('SESSION_SECRET absente ou trop courte (32 caractères minimum).');
  }
  return value;
}

const sign = (payload: string, key: string) => createHmac('sha256', key).update(payload).digest('base64url');

/** Comparaison à temps constant : une comparaison naïve fuit la signature octet par octet. */
function sameSignature(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

export function createToken(accountId: number, now = Date.now(), key = secret()): string {
  const payload = `${accountId}.${Math.floor(now / 1000) + MAX_AGE}`;
  return `${payload}.${sign(payload, key)}`;
}

/** Identifiant du compte, ou null si le jeton est absent, malformé, falsifié ou expiré. */
export function readToken(token: string | undefined, now = Date.now(), key = secret()): number | null {
  if (!token) return null;
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  const [rawId, rawExpiry, signature] = parts;
  if (!sameSignature(sign(`${rawId}.${rawExpiry}`, key), signature)) return null;
  const expiry = Number(rawExpiry);
  const id = Number(rawId);
  if (!Number.isSafeInteger(expiry) || !Number.isSafeInteger(id) || id < 1) return null;
  return expiry * 1000 > now ? id : null;
}

// ---------------------------------------------------------------- Cookies

export function parseCookies(header: string | null): Record<string, string> {
  if (!header) return {};
  const jar: Record<string, string> = {};
  for (const part of header.split(';')) {
    const index = part.indexOf('=');
    if (index < 1) continue;
    try {
      jar[part.slice(0, index).trim()] = decodeURIComponent(part.slice(index + 1).trim());
    } catch { /* Un cookie mal encodé ne doit pas empêcher la lecture du site. */ }
  }
  return jar;
}

/**
 * `SameSite=Lax` et non `Strict` : au retour de Discord la navigation vient d'un autre
 * site, et un cookie `Strict` ne serait pas renvoyé — la session semblerait perdue.
 */
const attributes = (maxAge: number) =>
  `Path=/; HttpOnly; SameSite=Lax; Secure; Max-Age=${maxAge}`;

export const sessionCookie = (token: string) => `${COOKIE}=${token}; ${attributes(MAX_AGE)}`;
export const clearedSessionCookie = () => `${COOKIE}=; ${attributes(0)}`;
export const readSession = (request: Request) => {
  try {
    return readToken(parseCookies(request.headers.get('cookie'))[COOKIE]);
  } catch (error) {
    // Secret non configuré : personne n'est connecté, mais le site reste consultable.
    if (error instanceof MissingSecret) return null;
    throw error;
  }
};

// ---------------------------------------------------------------- Anti-CSRF du flux OAuth

/** `state` opaque, mémorisé côté navigateur, revérifié au retour de Discord. */
export const newState = () => randomBytes(16).toString('base64url');
export const stateCookie = (state: string) => `${STATE_COOKIE}=${state}; Path=/; HttpOnly; SameSite=Lax; Secure; Max-Age=600`;
export const clearedStateCookie = () => `${STATE_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Secure; Max-Age=0`;
export const readState = (request: Request) => parseCookies(request.headers.get('cookie'))[STATE_COOKIE];

/** Le retour reste sur une page FC 27 du site, jamais sur un domaine externe. */
export function safeReturnTo(value: string | null | undefined): string {
  if (!value || !/^\/fc27(?:[?#]|\/nom(?:[?#]|$)|$)/.test(value) || /[\\\u0000-\u001f]/.test(value)) return '/fc27';
  const url = new URL(value, 'https://local.invalid');
  if (url.origin !== 'https://local.invalid' || !['/fc27', '/fc27/nom'].includes(url.pathname)) return '/fc27';
  url.searchParams.delete('connexion');
  return url.pathname + url.search + url.hash;
}
export const returnCookie = (path: string) => `${RETURN_COOKIE}=${encodeURIComponent(safeReturnTo(path))}; ${attributes(600)}`;
export const clearedReturnCookie = () => `${RETURN_COOKIE}=; ${attributes(0)}`;
export const readReturnTo = (request: Request) => safeReturnTo(parseCookies(request.headers.get('cookie'))[RETURN_COOKIE]);

/** Le `state` reçu doit correspondre exactement à celui qu'on avait posé. */
export function stateMatches(received: string | null, expected: string | undefined): boolean {
  return Boolean(received && expected && received.length === expected.length && sameSignature(received, expected));
}
