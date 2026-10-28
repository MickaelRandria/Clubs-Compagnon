import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import type { BetsState } from '../shared/bets.js';

// Le cycle complet d'une rencontre, contre la vraie fonction SQL et une base en mémoire.
const db = new PGlite();
type Result = BetsState & { error?: string; status?: number };
const call = async (action: string, account: number, input: object = {}, admin = false) =>
  (await db.query<{ data: Result }>('select bets_dispatch($1, $2, $3::jsonb, $4) as data',
    [action, account, JSON.stringify(input), admin])).rows[0].data;
const one = async <T>(query: string, params: unknown[] = []) => (await db.query<T>(query, params)).rows[0];

let admin: number, alex: number, sam: number, fan: number;
let rina: number, chef: number, absent: number;
const playerOdds = () => [rina, chef, absent].map((memberId, i) => ({
  memberId, gamertag: ['Rina', 'Chef', 'Absent'][i], crack: [1.8, 2.5, 6][i], flop: [6, 3, 1.5][i],
}));
const playedMatch = async (minutesAgo: number, goalsFor: number, goalsAgainst: number, red = 0, opponentQuit: boolean | null = null) => {
  const result = goalsFor > goalsAgainst ? 'win' : goalsFor < goalsAgainst ? 'loss' : 'draw';
  const stats = JSON.stringify([{ gamertag: 'Rina', redCards: red }, { gamertag: 'Chef', redCards: 0 }]);
  return (await one<{ id: number }>(`insert into matches(club_id, ea_match_id, played_at, match_type, opponent_name, goals_for, goals_against, result, player_stats, opponent_quit)
    values (1, $1, now() - $2::interval, 'league', 'Adversaire', $3, $4, $5, $6::jsonb, $7) returning id`,
  [`ea-${Math.random()}`, `${minutesAgo} minutes`, goalsFor, goalsAgainst, result, stats, opponentQuit])).id;
};
const backdate = (minutes: number) => db.exec(`update bet_fixtures set opened_at = opened_at - interval '${minutes} minutes',
  locked_at = locked_at - interval '${minutes} minutes'; update bet_slips set created_at = created_at - interval '${minutes} minutes'`);

before(async () => {
  const journal = JSON.parse(await readFile(new URL('../drizzle/meta/_journal.json', import.meta.url), 'utf8'));
  for (const entry of journal.entries) await db.exec(await readFile(new URL(`../drizzle/${entry.tag}.sql`, import.meta.url), 'utf8'));
  await db.exec("insert into clubs(name, region, reputation, skill_rating) values ('Club test', 'EU', 'Test', 1500)");
  const account = async (name: string) => (await one<{ id: number }>('insert into club_accounts(discord_id, username) values ($1, $1) returning id', [name])).id;
  [admin, alex, sam, fan] = [await account('admin'), await account('alex'), await account('sam'), await account('fan')];
  const member = async (tag: string) => (await one<{ id: number }>("insert into members(club_id, gamertag, position, ovr) values (1, $1, 'FW', 80) returning id", [tag])).id;
  [rina, chef, absent] = [await member('Rina'), await member('Chef'), await member('Absent')];
  // Alex est le joueur Rina : il ne pourra pas voter pour lui-même.
  await db.query("insert into club_player_claims(account_id, member_id, status, reviewed_at) values ($1, $2, 'approved', now())", [alex, rina]);
});
after(() => db.close());

test('chaque compte Discord reçoit 500 crédits à sa première visite, une seule fois', async () => {
  assert.equal((await call('state', fan)).wallet.balance, 500);
  assert.equal((await call('state', fan)).wallet.balance, 500);
  assert.equal((await one<{ n: number }>("select count(*)::int n from credit_ledger where account_id = $1 and reason = 'welcome'", [fan])).n, 1);
});

test('seul l’admin ouvre, verrouille ou annule', async () => {
  assert.equal((await call('open', alex, { playerOdds: playerOdds() })).status, 403);
  assert.equal((await call('lock', alex)).status, 403);
});

test('cycle complet : mises, changement d’avis, coup d’envoi, règlement EA, vote, clôture', async () => {
  const opened = await call('open', admin, { playerOdds: playerOdds() }, true);
  const fixture = opened.fixture!;
  assert.equal(fixture.status, 'open');
  assert.deepEqual(fixture.markets.map((m) => m.id), ['crack', 'flop', 'verdict', 'goals', 'cleansheet', 'red']);
  assert.equal((await call('open', admin, { playerOdds: playerOdds() }, true)).status, 409, 'une seule rencontre à la fois');

  // Alex mise 100 sur la victoire, puis change d'avis : la première mise est rendue.
  await call('place', alex, { fixtureId: fixture.id, bets: [{ market: 'verdict', option: 'win', stake: 100 }] });
  let state = await call('place', alex, { fixtureId: fixture.id, bets: [
    { market: 'verdict', option: 'loss', stake: 50 }, { market: 'goals', option: '2-3', stake: 50 }, { market: 'crack', option: String(chef), stake: 50 },
  ] });
  assert.equal(state.wallet.balance, 350);
  assert.deepEqual(state.fixture!.mySlips.map((s) => [s.market, s.option, s.stake]),
    [['verdict', 'loss', 50], ['goals', '2-3', 50], ['crack', String(chef), 50]]);

  // Un lot avec un pari inconnu est refusé en entier.
  const bad = await call('place', sam, { fixtureId: fixture.id, bets: [{ market: 'verdict', option: 'win', stake: 50 }, { market: 'verdict', option: 'triche', stake: 50 }] });
  assert.equal(bad.status, 400);
  assert.equal((await call('state', sam)).wallet.balance, 500);
  assert.equal((await call('place', sam, { fixtureId: fixture.id, bets: [{ market: 'verdict', option: 'win', stake: 600 }] })).status, 409);
  await call('place', sam, { fixtureId: fixture.id, bets: [
    { market: 'verdict', option: 'win', stake: 100 }, { market: 'crack', option: String(absent), stake: 40 }, { market: 'flop', option: String(chef), stake: 60 },
  ] });

  // Coup d'envoi : plus aucune mise.
  await call('lock', admin, {}, true);
  assert.equal((await call('place', fan, { fixtureId: fixture.id, bets: [{ market: 'verdict', option: 'win', stake: 50 }] })).status, 409);

  // Le match EA arrive : défaite 1-3. Verdict et buts sont réglés, le vote s'ouvre.
  await backdate(30);
  await playedMatch(5, 1, 3);
  state = await call('state', alex);
  assert.equal(state.fixture, null);
  assert.equal(state.votes.length, 1);
  const vote = state.votes[0];
  assert.deepEqual([vote.match.goalsFor, vote.match.goalsAgainst], [1, 3]);
  assert.deepEqual(vote.candidates.map((c) => c.gamertag), ['Chef', 'Rina'], 'seuls les joueurs du match sont candidats');
  const status = (slips: typeof vote.mySlips, market: string) => slips.find((s) => s.market === market)?.status;
  assert.equal(status(vote.mySlips, 'verdict'), 'won');
  assert.equal(status(vote.mySlips, 'goals'), 'lost');
  assert.equal(status(vote.mySlips, 'crack'), 'pending');
  assert.equal(state.wallet.balance, 350 + 100, 'défaite à 2.00 : 50 → 100');
  const samState = await call('state', sam);
  assert.equal(status(samState.votes[0].mySlips, 'crack'), 'refunded', 'Crack sur un joueur absent du match : remboursé');

  // Votes : interdit pour soi, modifiable, puis clôture par l'admin.
  assert.equal((await call('vote', alex, { fixtureId: vote.id, category: 'crack', memberId: rina })).status, 403);
  await call('vote', alex, { fixtureId: vote.id, category: 'crack', memberId: chef });
  await call('vote', sam, { fixtureId: vote.id, category: 'crack', memberId: rina });
  await call('vote', sam, { fixtureId: vote.id, category: 'crack', memberId: chef });
  await call('vote', fan, { fixtureId: vote.id, category: 'flop', memberId: rina });
  assert.deepEqual((await call('state', fan)).votes[0].tally.crack, { [chef]: 2 });
  await call('close-vote', admin, { fixtureId: vote.id }, true);

  state = await call('state', alex);
  assert.equal(state.votes.length, 0);
  assert.equal(state.wallet.balance, 450 + 125, 'Crack Chef à 2.50 : 50 → 125');
  assert.equal(state.history[0].crack?.[0], 'Chef');
  const sams = (await call('state', sam)).history[0].mySlips;
  assert.equal(status(sams, 'flop'), 'lost', 'la Casserole élue est Rina');
  assert.equal((await call('state', sam)).wallet.balance, 500 - 100 - 60, 'victoire perdue, Casserole perdue, Crack remboursé');
});

test('coup d’envoi oublié : les mises faites pendant le match sont remboursées', async () => {
  const fixture = (await call('open', admin, { playerOdds: playerOdds() }, true)).fixture!;
  await call('place', fan, { fixtureId: fixture.id, bets: [{ market: 'verdict', option: 'win', stake: 50 }] });
  await backdate(60);
  await call('place', fan, { fixtureId: fixture.id, bets: [{ market: 'goals', option: '4+', stake: 50 }] });
  await playedMatch(2, 5, 0);
  const state = await call('state', fan);
  const slips = state.votes[0].mySlips;
  assert.equal(slips.find((s) => s.market === 'verdict')?.status, 'won');
  assert.equal(slips.find((s) => s.market === 'goals')?.status, 'refunded');
  assert.equal(state.wallet.balance, 500 - 50 + 100);
});

test('ouvrir le match suivant clôt le vote précédent ; sans vote, Crack et Casserole sont remboursés', async () => {
  const before = await call('state', sam);
  assert.equal(before.votes.length, 1);
  await call('open', admin, { playerOdds: playerOdds() }, true);
  const after = await call('state', sam);
  assert.equal(after.votes.length, 0);
  assert.ok(after.fixture);
  await call('cancel', admin, { fixtureId: after.fixture!.id }, true);
  assert.equal((await call('state', sam)).fixture, null);
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

test('pari unique tiré au sort : seul ce pari est jouable, réglé sans vote par le score', async () => {
  const markets = [{ id: 'goals', options: [{ id: '0-1', label: '0 ou 1', odds: 3.3, trend: 0.2 }, { id: '2-3', label: '2 ou 3', odds: 2.2, trend: 0 }, { id: '4+', label: '4 et plus', odds: 2.6, trend: -0.15 }] }];
  const opened = await call('open', admin, { markets, context: { reason: 'Après la victoire 5-0 contre Adversaire' } }, true);
  const fixture = opened.fixture!;
  assert.deepEqual(fixture.markets.map((m) => m.id), ['goals']);
  assert.equal(fixture.context?.reason, 'Après la victoire 5-0 contre Adversaire');
  assert.equal((await call('place', fan, { fixtureId: fixture.id, bets: [{ market: 'verdict', option: 'win', stake: 50 }] })).status, 400,
    'un pari qui n’a pas été tiré est refusé');
  const before = (await call('state', fan)).wallet.balance;
  await call('place', fan, { fixtureId: fixture.id, bets: [{ market: 'goals', option: '2-3', stake: 100 }] });
  await call('lock', admin, {}, true);
  await backdate(30);
  await playedMatch(3, 3, 1);
  const state = await call('state', fan);
  assert.equal(state.votes.length, 0, 'pas de vote pour un pari réglé par le score');
  assert.equal(state.history[0].mySlips[0].status, 'won');
  assert.equal(state.wallet.balance, before - 100 + 220);
});

test('rage-quit : réglé par l’abandon EA, remboursé si l’abandon est inconnu', async () => {
  const markets = [{ id: 'ragequit', options: [{ id: 'oui', label: 'Oui', odds: 4, trend: 0 }, { id: 'non', label: 'Non', odds: 1.2, trend: 0 }] }];
  const play = async (opponentQuit: boolean | null) => {
    const fixture = (await call('open', admin, { markets, context: { reason: null } }, true)).fixture!;
    await call('place', fan, { fixtureId: fixture.id, bets: [{ market: 'ragequit', option: 'oui', stake: 50 }] });
    await call('lock', admin, {}, true);
    await backdate(30);
    await playedMatch(3, 3, 0, 0, opponentQuit);
    return (await call('state', fan)).history[0].mySlips[0];
  };
  const before = (await call('state', fan)).wallet.balance;
  assert.equal((await play(true)).status, 'won');
  assert.equal((await play(null)).status, 'refunded');
  assert.equal((await play(false)).status, 'lost');
  assert.equal((await call('state', fan)).wallet.balance, before + 200 - 50 - 50, 'abandon à 4.00 : 50 → 200');
});
