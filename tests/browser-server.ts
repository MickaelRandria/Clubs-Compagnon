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

const db = new PGlite();
const journal = JSON.parse(await readFile(new URL('../drizzle/meta/_journal.json', import.meta.url), 'utf8'));
for (const entry of journal.entries) await db.exec(await readFile(new URL(`../drizzle/${entry.tag}.sql`, import.meta.url), 'utf8'));
await db.exec("insert into clubs(name, region, reputation, skill_rating) values ('Test FC27', 'EU', 'Test', 1859)");
const service = createFC27Service(async (name, payload, campaign) => {
  const result = await db.query<{ data: unknown }>('select fc27_dispatch($1, $2::jsonb, $3::integer) as data', [name, payload, campaign]);
  return result.rows[0].data;
});
const handlers = createFC27Handlers(service);
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
      if (url.pathname !== '/api/fc27') { res.statusCode = 404; res.end('{}'); return; }
      const chunks: Buffer[] = []; for await (const chunk of req) chunks.push(chunk as Buffer);
      const body = req.method === 'POST' ? Buffer.concat(chunks).toString() : undefined;
      const request = new Request(url, { method: req.method, body });
      const response = req.method === 'POST' ? await handlers.POST(request) : await handlers.GET(request);
      res.statusCode = response.status; response.headers.forEach((value, key) => res.setHeader(key, value));
      res.end(await response.text());
    });
  },
}] });
await server.listen();
console.log('FC27 isolated browser test server: http://127.0.0.1:5174/fc27');
