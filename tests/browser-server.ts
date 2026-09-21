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
import { createAuthRouter } from '../server/auth-router.js';
import { createProfileHandlers, createProfileService } from '../server/profile-http.js';

// Identifiants factices, jamais ceux de l'application Discord du club.
process.env.SESSION_SECRET = 'isolated-browser-tests-secret-over-32-characters';
process.env.DISCORD_CLIENT_ID = 'browser-tests';
process.env.DISCORD_CLIENT_SECRET = 'browser-tests';
process.env.DISCORD_ADMIN_IDS = '777000000000000001';

const db = new PGlite();
const journal = JSON.parse(await readFile(new URL('../drizzle/meta/_journal.json', import.meta.url), 'utf8'));
for (const entry of journal.entries) await db.exec(await readFile(new URL(`../drizzle/${entry.tag}.sql`, import.meta.url), 'utf8'));
await db.exec("insert into clubs(name, region, reputation, skill_rating) values ('Test FC27', 'EU', 'Test', 1859)");
await db.exec(`insert into members(club_id, gamertag, position, ovr, matches_played, goals, assists, avg_rating, pass_pct) values
  (1, 'ButeurTest', 'FW', 87, 40, 62, 19, 8.1, 84),
  (1, 'MilieuTest', 'MF', 85, 35, 12, 31, 7.8, 91),
  (1, 'DebutantTest', 'GK', 70, 0, 0, 0, null, null)`);
const service = createFC27Service(async (name, payload, campaign) => {
  const result = await db.query<{ data: unknown }>('select fc27_dispatch($1, $2::jsonb, $3::integer) as data', [name, payload, campaign]);
  return result.rows[0].data;
});
const handlers = createFC27Handlers(service);
const profiles = createProfileHandlers(createProfileService(async (action, account, input, admins) => {
  const result = await db.query<{ data: unknown }>('select club_profile_dispatch($1, $2, $3::jsonb, $4::text[]) as data', [action, account, input, admins]);
  return result.rows[0].data;
}));
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
}, { exchange: async code => ({ discordId: code === 'AdminProfil' ? '777000000000000001' : `test-${code}`, username: code, displayName: code, avatarUrl: null }) });
const authRouter = createAuthRouter(auth);
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
      const isAuth = url.pathname.startsWith('/api/auth/');
      if (url.pathname !== '/api/fc27' && url.pathname !== '/api/profile' && !isAuth) { res.statusCode = 404; res.end('{}'); return; }
      const chunks: Buffer[] = []; for await (const chunk of req) chunks.push(chunk as Buffer);
      const body = req.method === 'POST' ? Buffer.concat(chunks).toString() : undefined;
      const headers = new Headers();
      for (const [key, value] of Object.entries(req.headers)) if (typeof value === 'string') headers.set(key, value);
      const request = new Request(url, { method: req.method, headers, body });
      const response = isAuth ? (req.method === 'POST' ? await authRouter.POST(request) : await authRouter.GET(request))
        : url.pathname === '/api/profile' ? (req.method === 'POST' ? await profiles.POST(request) : await profiles.GET(request))
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
