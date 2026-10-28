// Mode démo : la vraie app, servie avec les données de demo/fixtures/ (photo de la prod).
// Aucune base, aucun appel EA, aucun secret : marche hors ligne et en session cloud.
// `npm run demo` (visiteur non connecté) ou `npm run demo -- --connecte` (compte démo, Vestiaire ouvert).
//
// Pour maquetter une donnée que l'API ne renvoie pas encore, l'ajouter à la main dans les
// fixtures : le front l'affiche comme si le serveur la renvoyait déjà.
import { existsSync, readFileSync } from 'node:fs';
import react from '@vitejs/plugin-react';
import { createServer, type Plugin } from 'vite';
import type { MarketId, BetsState, BetsStatus } from '../shared/bets.js';
import { formReason, priceMarket, type FormMatch } from '../shared/bets-odds.js';
import type { Match, MatchDetail, Member } from '../shared/types.js';

const PORT = Number(process.env.DEMO_PORT ?? 5175);
const signedIn = process.argv.includes('--connecte');
const fixture = (name: string) => new URL(`./fixtures/${name}.json`, import.meta.url);
const read = <T>(name: string): T => JSON.parse(readFileSync(fixture(name), 'utf8'));

const members = read<Member[]>('members');
const matches = read<Match[]>('matches');
const me = members[0];

/** Une soirée Vestiaire en cours, cotée par le vrai calcul à partir des matchs de la photo. */
function betsState(): BetsState {
  const history: FormMatch[] = matches.map((m) => {
    const detail = existsSync(fixture(`matches/${m.id}`)) ? read<MatchDetail>(`matches/${m.id}`) : null;
    return { opponent: m.opponent, result: m.result, goalsFor: m.goalsFor, goalsAgainst: m.goalsAgainst, opponentQuit: m.opponentQuit,
      redCard: detail ? detail.players.some((p) => p.redCards > 0) : null,
      ratings: Object.fromEntries((detail?.players ?? []).flatMap((p) => {
        const member = members.find((x) => x.gamertag === p.gamertag);
        return member ? [[member.id, p.rating]] : [];
      })) };
  });
  const players = members.map((m) => ({ memberId: m.id, gamertag: m.gamertag, avgRating: m.avgRating }));
  const ids: MarketId[] = ['verdict', 'goals', 'crack', 'flop', 'cleansheet', 'red', 'ragequit'];
  const markets = ids.map((id) => priceMarket(id, history, players));
  const last = matches[0];
  return {
    isAdmin: false,
    myMemberId: me.id,
    wallet: { balance: 1250, canBailout: false, bankrupt: false },
    fixture: { id: 1, status: 'open', openedAt: new Date().toISOString(), lockedAt: null, context: { reason: formReason(history[0]) },
      markets, bettors: 4, mySlips: [] },
    votes: [],
    history: last ? [{ id: 0, status: 'settled', settledAt: last.playedAt, crack: [me.gamertag], flop: null, markets: [markets[0]],
      match: { id: last.id, opponent: last.opponent, goalsFor: last.goalsFor, goalsAgainst: last.goalsAgainst, result: last.result, playedAt: last.playedAt },
      mySlips: [{ id: 1, fixtureId: 0, market: 'verdict', option: last.result, stake: 100, odds: 2.1, status: 'won', payout: 210 }] }] : [],
    leaderboard: [
      { accountId: 1, name: me.gamertag, balance: 1250, me: true },
      ...members.slice(1, 5).map((m, i) => ({ accountId: i + 2, name: m.gamertag, balance: 1100 - i * 180, me: false })),
    ],
  };
}

/** Réponse de chaque route GET de /api. `undefined` : route inconnue en démo. */
function answer(path: string): [number, unknown] | undefined {
  if (path === '/api/club') return [200, read('club')];
  if (path === '/api/members') return [200, members];
  if (path === '/api/matches') return [200, matches];
  if (path === '/api/fc27') return [200, read('fc27')];
  if (path === '/api/fc27/report') return [200, { available: false, reason: 'not-configured' }];
  const detail = path.match(/^\/api\/matches\/(\d+)$/);
  if (detail) return existsSync(fixture(`matches/${detail[1]}`)) ? [200, read(`matches/${detail[1]}`)] : [404, { error: 'Match introuvable.' }];
  if (/^\/api\/matches\/\d+\/debrief$/.test(path)) return [200, { available: false, reason: signedIn ? 'not-configured' : 'sign-in' }];
  if (path === '/api/auth/me') {
    return [200, signedIn
      ? { signedIn: true, account: { id: 1, username: me.gamertag, displayName: me.gamertag, avatarUrl: null } }
      : { signedIn: false, canSignIn: true }];
  }
  if (path === '/api/profile') return [signedIn ? 404 : 401, { error: signedIn ? 'Profil indisponible en mode démo.' : 'Connecte-toi avec Discord pour retrouver ton joueur.' }];
  if (path === '/api/bets/status') return [200, { mode: 'on', access: signedIn ? 'open' : 'locked', canConfigure: false, live: 'open' } satisfies BetsStatus];
  if (path === '/api/bets/state') return signedIn ? [200, betsState()] : [401, { error: 'Connecte-toi pour parier.' }];
  return undefined;
}

const demoApi: Plugin = {
  name: 'demo-api',
  configureServer(vite) {
    vite.middlewares.use((req, res, next) => {
      if (!req.url?.startsWith('/api/')) return next();
      const path = new URL(req.url, 'http://localhost').pathname;
      const [status, body] = req.method === 'GET'
        ? answer(path) ?? [404, { error: `Route absente du mode démo : ${path}` }]
        : [409, { error: 'Mode démo : rien n’est enregistré.' }];
      res.statusCode = status;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify(body));
    });
  },
};

// Pas de service worker en démo : même module factice que tests/browser-server.ts.
const pwaStub: Plugin = {
  name: 'pwa-register-factice',
  resolveId: (id) => (id === 'virtual:pwa-register/react' ? ' virtual:pwa-register/react' : undefined),
  load: (id) => (id === ' virtual:pwa-register/react'
    ? 'export const useRegisterSW = () => ({ needRefresh: [false, () => {}], offlineReady: [false, () => {}], updateServiceWorker: async () => {} });'
    : undefined),
};

const server = await createServer({ configFile: false, optimizeDeps: { entries: ['index.html'] },
  server: { host: '127.0.0.1', port: PORT, strictPort: true }, plugins: [react(), pwaStub, demoApi] });
await server.listen();
console.log(`Mode démo${signedIn ? ' (connecté)' : ''} : http://127.0.0.1:${PORT}/`);
