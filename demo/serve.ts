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
import type { BetSession, BetsState, BetsStatus, MarketId } from '../shared/bets.js';
import { openSession, type FormMatch } from '../shared/bets-odds.js';
import type { Match, MatchDetail, Member } from '../shared/types.js';

const PORT = Number(process.env.DEMO_PORT ?? 5175);
const signedIn = process.argv.includes('--connecte');
const fixture = (name: string) => new URL(`./fixtures/${name}.json`, import.meta.url);
const read = <T>(name: string): T => JSON.parse(readFileSync(fixture(name), 'utf8'));

const members = read<Member[]>('members');
const matches = read<Match[]>('matches');
const me = members[0];

/** Étapes de FoodBet visibles en démo, choisies par `?scene=` dans l'URL de la page. */
const SCENES = ['parier', 'joue', 'session', 'guichet', 'vote', 'vote-fait', 'gagnants', 'rien'] as const;
type Scene = typeof SCENES[number];

const detailOf = (id: number) => (existsSync(fixture(`matches/${id}`)) ? read<MatchDetail>(`matches/${id}`) : null);
const memberId = (gamertag: string) => members.find((x) => x.gamertag === gamertag)?.id;

/** La session de la démo : les 4 derniers matchs de la photo, comme s'ils avaient été joués ce soir. */
function demoSession(): BetSession {
  const played = matches.slice(0, 4).reverse();
  const totals = new Map<number, BetSession['players'][number] & { ratings: number[] }>();
  let streak = 0, bestStreak = 0;
  for (const m of played) {
    streak = m.result === 'win' ? streak + 1 : 0; bestStreak = Math.max(bestStreak, streak);
    for (const p of detailOf(m.id)?.players ?? []) {
      const id = memberId(p.gamertag);
      if (id === undefined) continue;
      const row = totals.get(id) ?? { memberId: id, gamertag: p.gamertag, goals: 0, assists: 0, missed: 0, rating: null, played: 0, ratings: [] };
      row.goals += p.goals; row.assists += p.assists; row.missed += Math.max(0, p.shots - p.goals); row.played++; row.ratings.push(p.rating);
      totals.set(id, row);
    }
  }
  const last = played[played.length - 1];
  return {
    startedAt: new Date(Date.now() - 2 * 3_600_000).toISOString(), endedAt: null,
    matches: played.length, wins: played.filter((m) => m.result === 'win').length, draws: played.filter((m) => m.result === 'draw').length,
    losses: played.filter((m) => m.result === 'loss').length, goalsFor: played.reduce((a, m) => a + m.goalsFor, 0),
    goalsAgainst: played.reduce((a, m) => a + m.goalsAgainst, 0), cleanSheets: played.filter((m) => m.goalsAgainst === 0).length,
    withStats: played.length, reds: 0, ragequits: 0, quitKnown: played.length, bestStreak, srStart: 1640, srNow: 1663,
    last: { id: last.id, opponent: last.opponent, goalsFor: last.goalsFor, goalsAgainst: last.goalsAgainst, result: last.result, playedAt: last.playedAt },
    players: [...totals.values()].map(({ ratings, ...row }) => ({ ...row, rating: Math.round(ratings.reduce((a, b) => a + b, 0) / ratings.length * 10) / 10 }))
      .sort((a, b) => b.goals - a.goals || (b.rating ?? 0) - (a.rating ?? 0)),
  };
}

/** Une soirée FoodBet à l'étape demandée, cotée par le vrai calcul à partir des matchs de la photo. */
function betsState(scene: Scene, admin: boolean): BetsState {
  const history: FormMatch[] = matches.map((m) => {
    const detail = detailOf(m.id);
    const stats = Object.fromEntries((detail?.players ?? []).flatMap((p) => {
      const id = memberId(p.gamertag);
      return id === undefined ? [] : [[id, { goals: p.goals, missed: Math.max(0, p.shots - p.goals) }]];
    }));
    return { opponent: m.opponent, result: m.result, goalsFor: m.goalsFor, goalsAgainst: m.goalsAgainst, opponentQuit: m.opponentQuit,
      redCard: detail ? detail.players.some((p) => p.redCards > 0) : null,
      ratings: Object.fromEntries((detail?.players ?? []).flatMap((p) => { const id = memberId(p.gamertag); return id === undefined ? [] : [[id, p.rating]]; })),
      ...(detail ? { players: stats } : {}) };
  });
  const recent = new Set(history.slice(0, 10).flatMap((m) => Object.keys(m.ratings).map(Number)));
  const players = members.filter((m) => recent.has(m.id)).map((m) => ({ memberId: m.id, gamertag: m.gamertag, avgRating: m.avgRating }));
  let seed = 7;
  const opening = openSession(['red'], history, players, () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; });
  const markets = opening.markets;
  const session = demoSession();
  const others = members.filter((m) => m.id !== me.id && recent.has(m.id)).slice(0, 4);
  const top = session.players[0];
  const crack = members.find((m) => m.id === top?.memberId && m.id !== me.id) ?? others[0];
  const settled = scene === 'gagnants';
  const odds = (market: string, option: string) => markets.find((m) => m.id === market)!.options.find((o) => o.id === option)?.odds ?? 2;
  const pick = (name: string, mine: boolean, market: string, option: string, stake: number, won: boolean | null) =>
    ({ name, me: mine, market: market as MarketId, option, stake, odds: odds(market, option),
      status: won === null ? 'pending' as const : won ? 'won' as const : 'lost' as const,
      payout: won ? Math.floor(stake * odds(market, option)) : won === false ? 0 : null });
  const ended = !['parier', 'joue', 'session', 'rien'].includes(scene);
  const picks = [
    pick(me.gamertag, true, 'bilan', 'win', 100, ended ? true : null), pick(me.gamertag, true, 'attack', '2-3', 50, ended ? false : null),
    pick(me.gamertag, true, 'scorer', String(crack.id), 50, ended ? true : null), pick(me.gamertag, true, 'crack', String(crack.id), 50, settled ? true : null),
    pick(others[0].gamertag, false, 'bilan', 'win', 250, ended ? true : null), pick(others[0].gamertag, false, 'crack', String(others[1].id), 100, settled ? false : null),
    pick(others[1].gamertag, false, 'bilan', 'loss', 100, ended ? false : null), pick(others[2].gamertag, false, 'sr', 'up', 50, ended ? true : null),
  ];
  const mine = picks.filter((p) => p.me).map((p, i) => ({ id: i + 1, fixtureId: 1, market: p.market, option: p.option, stake: p.stake,
    odds: p.odds, status: p.status, payout: p.payout }));
  const before = scene === 'parier' || scene === 'joue' || scene === 'session' || scene === 'guichet';
  const fixtureSlips = scene === 'parier' ? [] : scene === 'joue' || scene === 'guichet' ? mine.slice(0, 2) : mine;
  return {
    isAdmin: admin,
    myMemberId: me.id,
    wallet: { balance: settled ? 1345 : 1100, canBailout: false, bankrupt: false },
    fixture: before ? { id: 1, status: scene === 'session' || scene === 'guichet' ? 'locked' : 'open', openedAt: new Date().toISOString(),
      lockedAt: scene === 'session' || scene === 'guichet' ? session.startedAt : null, context: opening.context,
      session: scene === 'session' || scene === 'guichet' ? session : null,
      window: scene === 'guichet' ? { until: new Date(Date.now() + 150_000).toISOString(), markets } : null,
      markets, bettors: 5, mySlips: fixtureSlips } : null,
    votes: scene === 'vote' || scene === 'vote-fait' ? [{ id: 1, openedAt: new Date().toISOString(), session: { ...session, endedAt: new Date().toISOString() },
      markets, mySlips: mine,
      candidates: session.players.map((p) => ({ memberId: p.memberId, gamertag: p.gamertag })).sort((x, y) => x.gamertag.localeCompare(y.gamertag)),
      tally: { crack: { [crack.id]: 3, [others[1].id]: 1 }, flop: {} },
      myVotes: { crack: scene === 'vote-fait' ? crack.id : null, flop: null }, voters: scene === 'vote-fait' ? 4 : 3,
      picks: scene === 'vote-fait' ? picks : null }] : [],
    history: settled ? [{ id: 1, status: 'settled', settledAt: new Date().toISOString(), match: null, session: { ...session, endedAt: new Date().toISOString() },
      crack: [crack.gamertag], flop: null, markets, mySlips: mine, results: picks, myVote: crack.id,
      ballots: [me, ...others].filter((m) => m.id !== crack.id).map((m, i) => {
        const pickFor = i === 3 ? others[1] : crack;
        return { voter: m.gamertag, me: m.id === me.id, memberId: pickFor.id, gamertag: pickFor.gamertag };
      }) },
      // Une soirée d'avant le format session : un pari Crack par match, sans bilan de soirée.
      ...[9, 7].map((k, n) => {
        const crackMarket = markets.find((m) => m.id === 'crack')!;
        const elected = others[n];
        const legacy = [pick(me.gamertag, true, 'crack', String(elected.id), 50, true), pick(others[2].gamertag, false, 'crack', String(me.id), 50, false)];
        return { id: 10 + n, status: 'settled' as const, settledAt: matches[k].playedAt, match: null, session: null, crack: [elected.gamertag], flop: null,
          markets: [crackMarket], mySlips: [], results: legacy, myVote: null,
          ballots: others.slice(0, 3).map((m) => ({ voter: m.gamertag, me: false, memberId: elected.id, gamertag: elected.gamertag })) };
      })] : [],
    leaderboard: [
      { accountId: 2, name: others[0].gamertag, balance: 1820, me: false },
      { accountId: 1, name: me.gamertag, balance: settled ? 1345 : 1100, me: true },
      ...others.slice(1).map((m, i) => ({ accountId: i + 3, name: m.gamertag, balance: 1020 - i * 230, me: false })),
    ],
    // Salle d'attente : trois présents, deux absents ; qui a joué et voté suit l'étape.
    room: [me, ...others].map((m, i) => ({
      name: m.gamertag, me: m.id === me.id, here: i < 3,
      played: scene !== 'parier' && scene !== 'rien' && i < 3,
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
    const live = scene === 'session' || scene === 'guichet' ? 'locked' : scene.startsWith('vote') ? 'voting' : scene === 'parier' || scene === 'joue' ? 'open' : null;
    return [200, { mode: 'on', access: signedIn ? 'open' : 'locked', canConfigure: false, live } satisfies BetsStatus];
  }
  if (path === '/api/bets/photos') return [200, {}];
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
