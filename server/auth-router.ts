import type { createAuthHandlers } from './auth-http.js';

/** Préserve les URL OAuth et leurs méthodes en partageant une seule fonction serveur. */
export function createAuthRouter(auth: ReturnType<typeof createAuthHandlers>) {
  const routes = new Map([
    ['me', { method: 'GET', handler: auth.me }],
    ['discord', { method: 'GET', handler: auth.start }],
    ['callback', { method: 'GET', handler: auth.callback }],
    ['logout', { method: 'POST', handler: auth.logout }],
  ]);
  const dispatch = (request: Request) => {
    const action = /^\/api\/auth\/([^/]+)\/?$/.exec(new URL(request.url).pathname)?.[1];
    const route = action ? routes.get(action) : undefined;
    if (!route) return Response.json({ error: 'Route de connexion inconnue.' }, { status: 404, headers: { 'Cache-Control': 'no-store' } });
    if (request.method !== route.method) return Response.json({ error: 'Méthode non autorisée.' }, {
      status: 405, headers: { Allow: route.method, 'Cache-Control': 'no-store' },
    });
    return route.handler(request);
  };
  return { GET: dispatch, POST: dispatch };
}
