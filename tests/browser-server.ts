// Real HTTP handlers and PostgreSQL workflow, with an isolated in-memory database.
// This test server never loads DATABASE_URL and cannot write to the club's database.
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import react from '@vitejs/plugin-react';
import { createServer } from 'vite';
import { createFC27Service } from '../server/fc27-service.js';
import { createFC27Handlers } from '../server/fc27-http.js';
import { createLookalikeHandler } from '../server/lookalike-http.js';
import { StaffUnavailable } from '../server/staff-mistral.js';
import { LOOKALIKES } from '../shared/data/lookalikes.js';
import { createAuthHandlers, type Account } from '../server/auth-http.js';

// Identifiants factices, jamais ceux de l'application Discord du club.
process.env.SESSION_SECRET = 'isolated-browser-tests-secret-over-32-characters';
process.env.DISCORD_CLIENT_ID = 'browser-tests';
process.env.DISCORD_CLIENT_SECRET = 'browser-tests';

const db = new PGlite();
const journal = JSON.parse(await readFile(new URL('../drizzle/meta/_journal.json', import.meta.url), 'utf8'));
for (const entry of journal.entries) await db.exec(await readFile(new URL(`../drizzle/${entry.tag}.sql`, import.meta.url), 'utf8'));
await db.exec("insert into clubs(name, region, reputation, skill_rating) values ('Test FC27', 'EU', 'Test', 1859)");
const service = createFC27Service(async (name, payload, campaign) => {
  const result = await db.query<{ data: unknown }>('select fc27_dispatch($1, $2::jsonb, $3::integer) as data', [name, payload, campaign]);
  return result.rows[0].data;
});
const handlers = createFC27Handlers(service);
const auth = createAuthHandlers({
  async upsert(user) {
    const result = await db.query<Account>(`insert into club_accounts(discord_id, username, display_name)
      values ($1, $2, $3) on conflict (discord_id) do update set username = excluded.username
      returning id, username, display_name as "displayName", avatar_url as "avatarUrl"`,
      [user.discordId, user.username, user.displayName]);
    return result.rows[0];
  },
  async find(id) {
    const result = await db.query<Account>('select id, username, display_name as "displayName", avatar_url as "avatarUrl" from club_accounts where id = $1', [id]);
    return result.rows[0];
  },
}, { exchange: async code => ({ discordId: `test-${code}`, username: code, displayName: code, avatarUrl: null }) });
// Seul le fournisseur est simulé : validation et handlers de production sont exercés.
const lookalikes = createLookalikeHandler({
  hasKey: () => true,
  call: async ({ user }) => {
    if (user.includes('Panne Test')) throw new StaffUnavailable('Panne simulée');
    const parsed = { ...LOOKALIKES.find((entry) => entry.id === 'zidane')!,
      name: 'Gianfranco Zola', heightCm: 168, known: user.includes('Gianfranco Zola') };
    return { parsed, raw: JSON.stringify(parsed), model: 'browser-fixture' };
  },
});
const server = await createServer({ configFile: false, optimizeDeps: { entries: ['index.html'] }, server: { host: '127.0.0.1', port: 5174, strictPort: true }, plugins: [react(), {
  name: 'isolated-fc27-tests',
  configureServer(vite) {
    vite.middlewares.use(async (req, res, next) => {
      if (!req.url?.startsWith('/api/')) return next();
      const url = new URL(req.url, 'http://localhost:5174');
      if (url.pathname === '/api/club') { res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify({ skillRating: 1859 })); return; }
      if (url.pathname === '/api/fc27/report') { res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify({ available: false, reason: 'not-configured' })); return; }
      if (url.pathname === '/api/fc27/lookalike') {
        const response = await lookalikes.GET(new Request(url));
        res.statusCode = response.status; response.headers.forEach((value, key) => res.setHeader(key, value));
        res.end(await response.text()); return;
      }
      const authRoutes: Record<string, (request: Request) => Promise<Response>> = {
        '/api/auth/me': auth.me, '/api/auth/discord': auth.start,
        '/api/auth/callback': auth.callback, '/api/auth/logout': auth.logout,
      };
      if (url.pathname !== '/api/fc27' && !authRoutes[url.pathname]) { res.statusCode = 404; res.end('{}'); return; }
      const chunks: Buffer[] = []; for await (const chunk of req) chunks.push(chunk as Buffer);
      const body = req.method === 'POST' ? Buffer.concat(chunks).toString() : undefined;
      const headers = new Headers();
      for (const [key, value] of Object.entries(req.headers)) if (typeof value === 'string') headers.set(key, value);
      const request = new Request(url, { method: req.method, headers, body });
      const response = authRoutes[url.pathname] ? await authRoutes[url.pathname](request)
        : req.method === 'POST' ? await handlers.POST(request) : await handlers.GET(request);
      res.statusCode = response.status;
      response.headers.forEach((value, key) => { if (key !== 'set-cookie') res.setHeader(key, value); });
      const cookies = response.headers.getSetCookie();
      if (cookies.length) res.setHeader('Set-Cookie', cookies);
      res.end(await response.text());
    });
  },
}] });
await server.listen();
console.log('FC27 isolated browser test server: http://127.0.0.1:5174/fc27');
