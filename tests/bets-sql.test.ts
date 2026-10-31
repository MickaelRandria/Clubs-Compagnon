import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import type { BetsState } from '../shared/bets.js';

// Le cycle complet d'une session FoodBet, contre la vraie fonction SQL et une base en mémoire.
const db = new PGlite();
type Result = BetsState & { error?: string; status?: number };
const call = async (action: string, account: number, input: object = {}, admin = false) =>
  (await db.query<{ data: Result }>('select bets_dispatch($1, $2, $3::jsonb, $4) as data',
    [action, account, JSON.stringify(input), admin])).rows[0].data;
const one = async <T>(query: string, params: unknown[] = []) => (await db.query<T>(query, params)).rows[0];

let admin: number, alex: number, sam: number, fan: number;
let rina: number, chef: number, absent: number;

/** Un match de la soirée. Par défaut, Rina marque tous les buts (2 tirs ratés) et Chef rate 3 tirs. */
const playedMatch = async (minutesAgo: number, goalsFor: number, goalsAgainst: number,
  { red = 0, opponentQuit = null as boolean | null, stats = true } = {}) => {
  const result = goalsFor > goalsAgainst ? 'win' : goalsFor < goalsAgainst ? 'loss' : 'draw';
  const sheet = stats ? JSON.stringify([
    { gamertag: 'Rina', redCards: red, goals: goalsFor, shots: goalsFor + 2, assists: 0, rating: 8 },
    { gamertag: 'Chef', redCards: 0, goals: 0, shots: 3, assists: 1, rating: 6.5 },
  ]) : null;
  return (await one<{ id: number }>(`insert into matches(club_id, ea_match_id, played_at, match_type, opponent_name, goals_for, goals_against, result, player_stats, opponent_quit)
    values (1, $1, now() - $2::interval, 'league', 'Adversaire', $3, $4, $5, $6::jsonb, $7) returning id`,
  [`ea-${Math.random()}`, `${minutesAgo} minutes`, goalsFor, goalsAgainst, result, sheet, opponentQuit])).id;
};
const backdate = (minutes: number) => db.exec(`update bet_fixtures set opened_at = opened_at - interval '${minutes} minutes',
  locked_at = locked_at - interval '${minutes} minutes' where status in ('open', 'locked');
  update bet_slips set created_at = created_at - interval '${minutes} minutes' where status = 'pending'`);
const setSr = (sr: number) => db.query('update clubs set skill_rating = $1', [sr]);

const yesNo = [{ id: 'oui', label: 'Oui', odds: 2 }, { id: 'non', label: 'Non', odds: 2 }];
const players = () => [rina, chef, absent].map((id, i) => ({ id: String(id), label: ['Rina', 'Chef', 'Absent'][i], odds: 2 }));
/** Le ticket complet, toutes les cotes à 2 : une mise gagnante rapporte le double. */
const ticket = (bonus = 'streak') => [
  { id: 'bilan', options: [{ id: 'win', label: 'Plus de V', odds: 2 }, { id: 'even', label: 'Autant', odds: 2 }, { id: 'loss', label: 'Plus de D', odds: 2 }] },
  { id: 'attack', options: [{ id: 'lt2', label: 'Moins de 2', odds: 2 }, { id: '2-3', label: '2 à 3', odds: 2 }, { id: 'gt3', label: 'Plus de 3', odds: 2 }] },
  { id: 'scorer', options: players() }, { id: 'clumsy', options: players() }, { id: 'crack', options: players() },
  { id: 'sr', options: [{ id: 'up', label: 'En hausse', odds: 2 }, { id: 'down', label: 'En baisse', odds: 2 }] },
  { id: bonus, options: yesNo },
];
/** Nouvelle session : les matchs des tests précédents sont vieillis d'un jour pour ne pas compter. */
const open = async (markets: object[] = ticket()) => {
  await db.exec("update matches set played_at = played_at - interval '1 day'");
  return (await call('open', admin, { markets, context: { reason: null } }, true)).fixture!;
};
const balance = async (account: number) => (await call('state', account)).wallet.balance;
const statusOf = (slips: { market: string; status: string }[], market: string) => slips.find((s) => s.market === market)?.status;

before(async () => {
  const journal = JSON.parse(await readFile(new URL('../drizzle/meta/_journal.json', import.meta.url), 'utf8'));
  for (const entry of journal.entries) await db.exec(await readFile(new URL(`../drizzle/${entry.tag}.sql`, import.meta.url), 'utf8'));
  await db.exec("insert into clubs(name, region, reputation, skill_rating) values ('Club test', 'EU', 'Test', 1500)");
  const account = async (name: string) => (await one<{ id: number }>('insert into club_accounts(discord_id, username) values ($1, $1) returning id', [name])).id;
  [admin, alex, sam, fan] = [await account('admin'), await account('alex'), await account('sam'), await account('fan')];
  const member = async (tag: string) => (await one<{ id: number }>("insert into members(club_id, gamertag, position, ovr) values (1, $1, 'FW', 80) returning id", [tag])).id;
  [rina, chef, absent] = [await member('Rina'), await member('Chef'), await member('Absent')];
  // Alex est le joueur Rina : ni pari ni vote pour lui-même.
  await db.query("insert into club_player_claims(account_id, member_id, status, reviewed_at) values ($1, $2, 'approved', now())", [alex, rina]);
});
after(() => db.close());

test('chaque compte Discord reçoit 500 crédits à sa première visite, une seule fois', async () => {
  assert.equal((await call('state', fan)).wallet.balance, 500);
  assert.equal((await call('state', fan)).wallet.balance, 500);
  assert.equal((await one<{ n: number }>("select count(*)::int n from credit_ledger where account_id = $1 and reason = 'welcome'", [fan])).n, 1);
});

test('seul l’admin ouvre, lance, termine ou annule la session', async () => {
  assert.equal((await call('open', alex, { markets: ticket() })).status, 403);
  assert.equal((await call('lock', alex)).status, 403);
  assert.equal((await call('end-session', alex)).status, 403);
  assert.equal((await call('end-session', admin, {}, true)).status, 409, 'pas de session en cours');
});

test('session complète : ticket, coup d’envoi, matchs, fin de session, vote, clôture', async () => {
  const fixture = await open();
  assert.deepEqual(fixture.markets.map((m) => m.id), ['bilan', 'attack', 'scorer', 'clumsy', 'crack', 'sr', 'streak']);
  await balance(alex); await balance(sam);
  // Alex est Rina : jamais Maladroit sur lui-même (il pourrait rater exprès).
  assert.equal((await call('place', alex, { fixtureId: fixture.id, bets: [{ market: 'clumsy', option: String(rina), stake: 10 }] })).status, 403);
  await call('place', alex, { fixtureId: fixture.id, bets: [
    { market: 'bilan', option: 'win', stake: 100 }, { market: 'attack', option: '2-3', stake: 50 },
    { market: 'crack', option: String(chef), stake: 50 }, { market: 'clumsy', option: String(chef), stake: 20 },
    { market: 'scorer', option: String(chef), stake: 30 },
  ] });
  await call('place', sam, { fixtureId: fixture.id, bets: [
    { market: 'bilan', option: 'loss', stake: 50 }, { market: 'scorer', option: String(rina), stake: 50 },
    { market: 'sr', option: 'up', stake: 50 }, { market: 'streak', option: 'oui', stake: 40 }, { market: 'scorer', option: String(rina), stake: 50 },
  ] });
  assert.equal(await balance(alex), 500 - 250);
  assert.equal(await balance(sam), 500 - 190);

  // Coup d'envoi : plus aucune mise ; la session compte les matchs joués depuis.
  await call('lock', admin, {}, true);
  assert.equal((await call('place', fan, { fixtureId: fixture.id, bets: [{ market: 'bilan', option: 'win', stake: 50 }] })).status, 409);
  await playedMatch(0, 3, 1);
  await playedMatch(0, 2, 2);
  await playedMatch(0, 1, 0);
  await setSr(1540);
  const live = (await call('state', fan)).fixture!;
  assert.equal(live.status, 'locked');
  const s = live.session!;
  assert.deepEqual([s.matches, s.wins, s.draws, s.losses, s.goalsFor, s.goalsAgainst], [3, 2, 1, 0, 6, 3]);
  assert.deepEqual([s.srStart, s.srNow, s.bestStreak, s.cleanSheets], [1500, 1540, 1, 1]);
  assert.deepEqual(s.players.map((p) => [p.gamertag, p.goals, p.missed, p.played]), [['Rina', 6, 6, 3], ['Chef', 0, 9, 3]]);
  // Salle d'attente : qui a joué, jamais ses choix.
  const room = (await call('state', fan)).room;
  assert.deepEqual(room.filter((r) => r.played).map((r) => r.name).sort(), ['Rina', 'sam']);

  // Fin de session : tout se règle d'un coup, le vote s'ouvre.
  await call('end-session', admin, {}, true);
  let state = await call('state', alex);
  assert.equal(state.fixture, null);
  const vote = state.votes[0];
  assert.equal(vote.session.matches, 3);
  assert.deepEqual(vote.candidates.map((c) => c.gamertag), ['Chef', 'Rina'], 'les joueurs de la soirée');
  assert.equal(statusOf(vote.mySlips, 'bilan'), 'won');
  assert.equal(statusOf(vote.mySlips, 'attack'), 'won', '6 buts en 3 matchs : 2 par match');
  assert.equal(statusOf(vote.mySlips, 'clumsy'), 'won', 'Chef : 9 tirs ratés');
  assert.equal(statusOf(vote.mySlips, 'crack'), 'pending');
  assert.equal(statusOf(vote.mySlips, 'scorer'), 'refunded', 'Alex (Rina) meilleur buteur, il avait misé sur Chef : rendu');
  const sams = (await call('state', sam)).votes[0].mySlips;
  assert.equal(statusOf(sams, 'bilan'), 'lost');
  assert.equal(statusOf(sams, 'scorer'), 'won');
  assert.equal(statusOf(sams, 'sr'), 'won');
  assert.equal(statusOf(sams, 'streak'), 'lost', 'victoire, nul, victoire : pas 3 d’affilée');

  // Le vote : Rina (Alex) est élu ; son pari Crack sur Chef lui est rendu.
  assert.equal((await call('vote', alex, { fixtureId: vote.id, category: 'crack', memberId: rina })).status, 403);
  await call('vote', fan, { fixtureId: vote.id, category: 'crack', memberId: rina });
  await call('vote', sam, { fixtureId: vote.id, category: 'crack', memberId: rina });
  await call('vote', alex, { fixtureId: vote.id, category: 'crack', memberId: chef });
  assert.equal((await call('state', fan)).votes[0].picks!.length, 9, 'dévoilés à qui a voté ; le 2e Buteur de sam remplace le 1er');
  await call('close-vote', admin, { fixtureId: vote.id }, true);
  state = await call('state', alex);
  assert.equal(state.votes.length, 0);
  assert.equal(statusOf(state.history[0].mySlips, 'crack'), 'refunded');
  assert.equal(state.wallet.balance, 250 + 200 + 100 + 40 + 30 + 50);
  assert.equal(await balance(sam), 310 + 100 + 100);
  const item = (await call('state', fan)).history[0];
  assert.equal(item.session?.matches, 3);
  assert.deepEqual(item.ballots.map((b) => [b.gamertag, b.voter]), [['Chef', 'Rina'], ['Rina', 'fan'], ['Rina', 'sam']]);
});

test('coup d’envoi oublié : la session part de l’ouverture, les mises tardives sont remboursées', async () => {
  const fixture = await open();
  const start = await balance(fan);
  await call('place', fan, { fixtureId: fixture.id, bets: [{ market: 'bilan', option: 'win', stake: 50 }] });
  await backdate(60);
  await call('place', fan, { fixtureId: fixture.id, bets: [{ market: 'attack', option: 'gt3', stake: 50 }] });
  await playedMatch(2, 5, 0);
  const state = await call('state', fan);
  assert.equal(state.fixture?.status, 'locked', 'verrouillé d’office');
  assert.equal(state.fixture!.session?.matches, 1);
  assert.equal(statusOf(state.fixture!.mySlips, 'attack'), 'refunded');
  await call('end-session', admin, {}, true);
  assert.equal(statusOf((await call('state', fan)).votes[0].mySlips, 'bilan'), 'won');
  assert.equal(await balance(fan), start - 50 + 100);
});

test('ouvrir la session suivante clôt le vote précédent ; sans vote, le Crack est remboursé', async () => {
  assert.equal((await call('state', sam)).votes.length, 1);
  await open();
  const after = await call('state', sam);
  assert.equal(after.votes.length, 0);
  assert.ok(after.fixture);
  await call('cancel', admin, { fixtureId: after.fixture!.id }, true);
  assert.equal((await call('state', sam)).fixture, null);
});

test('fin de session sans aucun match : tout est remboursé', async () => {
  const fixture = await open();
  const start = await balance(fan);
  await call('place', fan, { fixtureId: fixture.id, bets: [{ market: 'bilan', option: 'win', stake: 50 }] });
  await call('lock', admin, {}, true);
  await call('end-session', admin, {}, true);
  const state = await call('state', fan);
  assert.equal(state.fixture, null);
  assert.equal(state.votes.length, 0);
  assert.equal(state.history[0].status, 'cancelled');
  assert.equal(await balance(fan), start);
});

test('sans Crack au ticket, la session se règle sans vote ; skill rating inchangé : remboursé', async () => {
  const markets = ticket().filter((m) => m.id === 'attack' || m.id === 'sr');
  const fixture = await open(markets);
  const start = await balance(fan);
  await call('place', fan, { fixtureId: fixture.id, bets: [{ market: 'attack', option: 'gt3', stake: 50 }, { market: 'sr', option: 'up', stake: 50 }] });
  await call('lock', admin, {}, true);
  await playedMatch(0, 4, 0);
  await call('end-session', admin, {}, true);
  const state = await call('state', fan);
  assert.equal(state.votes.length, 0);
  assert.equal(state.history[0].status, 'settled');
  assert.equal(statusOf(state.history[0].mySlips, 'attack'), 'won');
  assert.equal(statusOf(state.history[0].mySlips, 'sr'), 'refunded');
  assert.equal(await balance(fan), start - 100 + 100 + 50 + 25, 'ticket complet (2 paris sur 2) : +25');
});

test('bonus rage-quit : un abandon suffit, une issue inconnue rembourse, sinon perdu', async () => {
  const play = async (quits: (boolean | null)[]) => {
    const fixture = await open(ticket('ragequit').filter((m) => m.id === 'ragequit'));
    await call('place', fan, { fixtureId: fixture.id, bets: [{ market: 'ragequit', option: 'oui', stake: 50 }] });
    await call('lock', admin, {}, true);
    for (const opponentQuit of quits) await playedMatch(0, 3, 0, { opponentQuit });
    await call('end-session', admin, {}, true);
    return statusOf((await call('state', fan)).history[0].mySlips, 'ragequit');
  };
  assert.equal(await play([false, true]), 'won');
  assert.equal(await play([false, null]), 'refunded');
  assert.equal(await play([false, false]), 'lost');
});

test('sans feuille de match, Buteur et Maladroit sont remboursés', async () => {
  const fixture = await open(ticket().filter((m) => m.id === 'scorer' || m.id === 'clumsy'));
  await call('place', fan, { fixtureId: fixture.id, bets: [{ market: 'scorer', option: String(chef), stake: 20 }, { market: 'clumsy', option: String(chef), stake: 20 }] });
  await call('lock', admin, {}, true);
  await playedMatch(0, 2, 1, { stats: false });
  await call('end-session', admin, {}, true);
  const slips = (await call('state', fan)).history[0].mySlips;
  assert.deepEqual(slips.map((s) => s.status), ['refunded', 'refunded']);
});

test('prêt de 100 crédits seulement à sec, une fois par 24 h', async () => {
  assert.equal((await call('bailout', sam)).status, 409);
  await db.query('update credit_wallets set balance = 0 where account_id = $1', [sam]);
  const state = await call('bailout', sam);
  assert.equal(state.wallet.balance, 100);
  assert.equal(state.wallet.bankrupt, true);
  await db.query('update credit_wallets set balance = 0 where account_id = $1', [sam]);
  assert.equal((await call('bailout', sam)).status, 409);
});

test('le classement liste les soldes, le mien signalé', async () => {
  const board = (await call('state', alex)).leaderboard;
  assert.ok(board.length >= 3);
  assert.ok(board.every((row, i) => i === 0 || board[i - 1].balance >= row.balance));
  assert.equal(board.filter((row) => row.me).length, 1);
});

test('miser sur soi au Crack : élu, on gagne', async () => {
  await db.query("insert into club_player_claims(account_id, member_id, status, reviewed_at) values ($1, $2, 'approved', now())", [sam, chef]);
  await db.query('update credit_wallets set balance = 500 where account_id = $1', [sam]);
  const fixture = await open();
  const start = await balance(sam);
  await call('place', sam, { fixtureId: fixture.id, bets: [{ market: 'crack', option: String(chef), stake: 40 }] });
  await call('lock', admin, {}, true);
  await playedMatch(0, 2, 0);
  await call('end-session', admin, {}, true);
  const vote = (await call('state', sam)).votes[0];
  await call('vote', alex, { fixtureId: vote.id, category: 'crack', memberId: chef });
  await call('close-vote', admin, { fixtureId: vote.id }, true);
  assert.equal(statusOf((await call('state', sam)).history[0].mySlips, 'crack'), 'won');
  assert.equal(await balance(sam), start - 40 + 80);
});

test('mise max : la moitié du solde par pari ; ticket complet : +25 une seule fois', async () => {
  await db.query('update credit_wallets set balance = 400 where account_id = $1', [fan]);
  const markets = ticket().filter((m) => m.id === 'bilan' || m.id === 'attack');
  const fixture = await open(markets);
  assert.equal((await call('place', fan, { fixtureId: fixture.id, bets: [{ market: 'bilan', option: 'win', stake: 201 }] })).status, 409);
  await call('place', fan, { fixtureId: fixture.id, bets: [{ market: 'bilan', option: 'win', stake: 200 }] });
  assert.equal(await balance(fan), 200);
  await call('place', fan, { fixtureId: fixture.id, bets: [{ market: 'attack', option: 'gt3', stake: 50 }] });
  assert.equal(await balance(fan), 150 + 25, 'ticket complet');
  await call('place', fan, { fixtureId: fixture.id, bets: [{ market: 'attack', option: 'lt2', stake: 50 }] });
  assert.equal(await balance(fan), 175, 'changer un pari ne redonne pas le bonus');
  await call('cancel', admin, { fixtureId: fixture.id }, true);
});
