import { readdirSync, statSync } from 'node:fs';
import type { IncomingMessage } from 'node:http';
import { join, relative } from 'node:path';
import react from '@vitejs/plugin-react';
import { defineConfig, loadEnv, type Plugin } from 'vite';

/**
 * En local, sert les fonctions de /api (format Vercel : `export function GET(request)`)
 * directement depuis `npm run dev`. En production, Vercel exécute ces mêmes fichiers.
 */
function apiDevServer(): Plugin {
  type Route = { file: string; segments: string[] };

  function collectRoutes(dir: string, root: string): Route[] {
    return readdirSync(dir).flatMap((name) => {
      const full = join(dir, name);
      if (statSync(full).isDirectory()) return collectRoutes(full, root);
      if (!name.endsWith('.ts')) return [];
      const segments = relative(root, full).replace(/\\/g, '/').replace(/\.ts$/, '').split('/');
      if (segments.at(-1) === 'index') segments.pop();
      return [{ file: full, segments }];
    });
  }

  function match(routes: Route[], pathname: string) {
    const parts = pathname.replace(/^\/api\/?/, '').split('/').filter(Boolean);
    return routes.find(
      (r) => r.segments.length === parts.length && r.segments.every((s, i) => /^\[.+\]$/.test(s) || s === parts[i]),
    );
  }

  async function readBody(req: IncomingMessage) {
    const chunks: Buffer[] = [];
    for await (const chunk of req) chunks.push(chunk as Buffer);
    return Buffer.concat(chunks);
  }

  return {
    name: 'dommage-api-dev',
    configureServer(server) {
      const apiDir = join(server.config.root, 'api');
      server.middlewares.use(async (req, res, next) => {
        if (!req.url?.startsWith('/api/')) return next();
        const url = new URL(req.url, 'http://localhost');
        const route = match(collectRoutes(apiDir, apiDir), url.pathname);
        const send = (status: number, body: unknown) => {
          res.statusCode = status;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify(body));
        };
        if (!route) return send(404, { error: `Route API inconnue : ${url.pathname}` });

        try {
          const mod = await server.ssrLoadModule(route.file);
          const method = req.method ?? 'GET';
          const handler = mod[method];
          if (typeof handler !== 'function') return send(405, { error: `Méthode ${method} non autorisée.` });

          const headers = new Headers();
          for (const [key, value] of Object.entries(req.headers)) {
            if (typeof value === 'string') headers.set(key, value);
            else if (Array.isArray(value)) headers.set(key, value.join(', '));
          }
          const body = method === 'GET' || method === 'HEAD' ? undefined : await readBody(req);
          const response: Response = await handler(new Request(url, { method, headers, body }));

          res.statusCode = response.status;
          response.headers.forEach((value, key) => res.setHeader(key, value));
          res.end(Buffer.from(await response.arrayBuffer()));
        } catch (err) {
          server.ssrFixStacktrace(err as Error);
          console.error(err);
          send(500, { error: 'Erreur serveur (voir le terminal).' });
        }
      });
    },
  };
}

export default defineConfig(({ mode }) => {
  // Rend DATABASE_URL (.env.local) visible pour les fonctions /api en local.
  Object.assign(process.env, loadEnv(mode, process.cwd(), ''));
  return {
    plugins: [react(), apiDevServer()],
    optimizeDeps: { entries: ['index.html'] },
  };
});
