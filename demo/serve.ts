// Mode démo : la vraie app, servie avec les données de demo/fixtures/ (photo de la prod).
// Aucune base, aucun appel EA, aucun secret : marche hors ligne et en session cloud.
// `npm run demo` (visiteur non connecté) ou `npm run demo -- --connecte` (compte démo, FoodBet ouvert).
// FoodBet : l'étape se choisit dans l'URL, `/paris?scene=vote` (voir SCENES), `&admin` pour la vue admin.
//
// Pour maquetter une donnée que l'API ne renvoie pas encore, l'ajouter à la main dans les
// fixtures : le front l'affiche comme si le serveur la renvoyait déjà.
import { existsSync, readFileSync } from 'node:fs';
import react from '@vitejs/plugin-react';
import { createServer, type Plugin } from 'vite';
import type { BetsState, BetsStatus } from '../shared/bets.js';
import { formReason, priceMarket, type FormMatch } from '../shared/bets-odds.js';
import type { Match, MatchDetail, Member } from '../shared/types.js';

const PORT = Number(process.env.DEMO_PORT ?? 5175);
const signedIn = process.argv.includes('--connecte');
const fixture = (name: string) => new URL(`./fixtures/${name}.json`, import.meta.url);
const read = <T>(name: string): T => JSON.parse(readFileSync(fixture(name), 'utf8'));

const members = read<Member[]>('members');
const matches = read<Match[]>('matches');
const me = members[0];

/** Étapes de FoodBet visibles en démo, choisies par `?scene=` dans l'URL de la page. */
const SCENES = ['parier', 'joue', 'match', 'score', 'tard', 'vote', 'vote-fait', 'gagnants', 'rien'] as const;
type Scene = typeof SCENES[number];

/** Une soirée FoodBet à l'étape demandée, cotée par le vrai calcul à partir des matchs de la photo. */
function betsState(scene: Scene, admin: boolean): BetsState {
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
  const markets = [priceMarket('goals', history, players), priceMarket('crack', history, players)];
  const odds = (market: number, option: string) => markets[market].options.find((o) => o.id === option)!.odds;
  // Le match de la démo : la victoire 3-0 contre LaEsquina, crack élu Chef695046.
  const played = matches.find((m) => m.opponent === 'LaEsquina') ?? matches[0];
  const match = { id: played.id, opponent: played.opponent, goalsFor: played.goalsFor, goalsAgainst: played.goalsAgainst, result: played.result, playedAt: played.playedAt };
  const crack = members.find((m) => m.gamertag === 'Chef695046') ?? members[1];
  const others = members.filter((m) => m.id !== me.id).slice(0, 4);
  const settled = scene === 'gagnants';
  const pick = (name: string, mine: boolean, market: 0 | 1, option: string, stake: number) => {
    const won = settled && (market === 0 ? option === '2-3' : option === String(crack.id));
    return { name, me: mine, market: markets[market].id, option, stake, odds: odds(market, option),
      status: settled ? (won ? 'won' : 'lost') : market === 0 ? (option === '2-3' ? 'won' : 'lost') : 'pending',
      payout: won || (!settled && market === 0 && option === '2-3') ? Math.floor(stake * odds(market, option)) : null } as const;
  };
  const picks = [
    pick(me.gamertag, true, 0, '2-3', 100), pick(me.gamertag, true, 1, String(crack.id), 50),
    pick(others[0].gamertag, false, 0, '2-3', 250), pick(others[0].gamertag, false, 1, String(others[0].id === crack.id ? others[1].id : crack.id), 100),
    pick(others[1].gamertag, false, 0, '4+', 100), pick(others[1].gamertag, false, 1, String(others[2].id), 50),
    pick(others[2].gamertag, false, 0, '2-3', 50),
    pick(others[3].gamertag, false, 0, '0-1', 100),
  ];
  const mine = picks.filter((p) => p.me).map((p, i) => ({ id: i + 1, fixtureId: 1, market: p.market, option: p.option, stake: p.stake,
    odds: p.odds, status: scene === 'parier' || scene === 'joue' || scene === 'match' ? 'pending' as const : p.status, payout: p.payout }));
  const before = scene === 'parier' || scene === 'joue' || scene === 'match' || scene === 'score' || scene === 'tard';
  const fixtureSlips = scene === 'parier' || scene === 'tard' ? [] : mine;
  return {
    isAdmin: admin,
    myMemberId: me.id,
    wallet: { balance: settled ? 1345 : 1100, canBailout: false, bankrupt: false },
    fixture: before ? { id: 1, status: scene === 'match' || scene === 'score' || scene === 'tard' ? 'locked' : 'open', openedAt: new Date().toISOString(),
      lockedAt: null, context: { reason: formReason(history[0]) }, match: scene === 'score' ? match : null, markets, bettors: 5, mySlips: fixtureSlips } : null,
    votes: scene === 'vote' || scene === 'vote-fait' ? [{ id: 1, openedAt: match.playedAt, match, markets, mySlips: mine,
      candidates: [...others, me].map((m) => ({ memberId: m.id, gamertag: m.gamertag })).sort((x, y) => x.gamertag.localeCompare(y.gamertag)),
      tally: { crack: { [crack.id]: 3, [others[0].id]: 1 }, flop: {} },
      myVotes: { crack: scene === 'vote-fait' ? crack.id : null, flop: null }, voters: scene === 'vote-fait' ? 4 : 3,
      picks: scene === 'vote-fait' ? picks : null }] : [],
    history: settled ? [{ id: 1, status: 'settled', settledAt: new Date().toISOString(), match, crack: [crack.gamertag], flop: null, markets,
      mySlips: mine, results: picks, myVote: crack.id }] : [],
    leaderboard: [
      { accountId: 2, name: others[0].gamertag, balance: 1820, me: false },
      { accountId: 1, name: me.gamertag, balance: settled ? 1345 : 1100, me: true },
      ...others.slice(1).map((m, i) => ({ accountId: i + 3, name: m.gamertag, balance: 1020 - i * 230, me: false })),
    ],
    // Salle d'attente : trois présents, deux absents ; qui a joué et voté suit l'étape.
    room: [me, ...others].map((m, i) => ({
      name: m.gamertag, me: m.id === me.id, here: i < 3,
      played: scene !== 'parier' && scene !== 'rien' && (i === 0 ? scene !== 'tard' : i < 3),
      voted: scene === 'vote-fait' ? i < 3 : scene === 'vote' ? i === 1 || i === 2 : false,
    })),
  };
}

/** Réponse de chaque route GET de /api. `undefined` : route inconnue en démo. */
function answer(path: string, scene: Scene, admin: boolean): [number, unknown] | undefined {
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
  if (path === '/api/bets/status') {
    const live = scene === 'match' || scene === 'score' || scene === 'tard' ? 'locked' : scene.startsWith('vote') ? 'voting' : scene === 'parier' || scene === 'joue' ? 'open' : null;
    return [200, { mode: 'on', access: signedIn ? 'open' : 'locked', canConfigure: false, live,
      ...(admin && scene === 'score' ? { scoreIn: true as const } : {}) } satisfies BetsStatus];
  }
  if (path === '/api/bets/state') return signedIn ? [200, betsState(scene, admin)] : [401, { error: 'Connecte-toi pour parier.' }];
  return undefined;
}

const demoApi: Plugin = {
  name: 'demo-api',
  configureServer(vite) {
    vite.middlewares.use((req, res, next) => {
      if (!req.url?.startsWith('/api/')) return next();
      const path = new URL(req.url, 'http://localhost').pathname;
      // L'étape FoodBet suit l'URL de la page qui appelle l'API (`/paris?scene=vote`).
      // `&admin` : la même étape vue par un admin (panneau de la phase suivante).
      let page = new URLSearchParams();
      try { page = new URL(req.headers.referer ?? '').searchParams; } catch { /* pas de page d'origine */ }
      const scene: Scene = SCENES.find((s) => s === page.get('scene')) ?? 'parier';
      const admin = page.has('admin');
      const [status, body] = req.method === 'GET'
        ? answer(path, scene, admin) ?? [404, { error: `Route absente du mode démo : ${path}` }]
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
