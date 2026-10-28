// Photographie l'API publique de la prod dans demo/fixtures/ : exactement ce qu'un visiteur
// non connecté voit sur clubs-compagnon.vercel.app (aucun compte, aucun pari, aucun secret).
// À lancer depuis une machine qui a du réseau : `npm run demo:snapshot`.
import { mkdir, writeFile } from 'node:fs/promises';

const BASE = process.env.DEMO_SOURCE ?? 'https://clubs-compagnon.vercel.app';
const dir = new URL('./fixtures/', import.meta.url);

async function get(path: string) {
  const response = await fetch(`${BASE}${path}`);
  if (!response.ok) throw new Error(`${path} : HTTP ${response.status}`);
  return response.json();
}

async function save(name: string, data: unknown) {
  await writeFile(new URL(`${name}.json`, dir), `${JSON.stringify(data, null, 2)}\n`);
  console.log(`demo/fixtures/${name}.json`);
}

await mkdir(new URL('./matches/', dir), { recursive: true });
const [club, members, matches, fc27] = await Promise.all([get('/api/club'), get('/api/members'), get('/api/matches?limit=50'), get('/api/fc27')]);
await save('club', club);
await save('members', members);
await save('matches', matches);
await save('fc27', fc27);
for (const match of matches as { id: number }[]) await save(`matches/${match.id}`, await get(`/api/matches/${match.id}`));
