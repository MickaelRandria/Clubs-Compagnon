import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  MAX_ODDS, MIN_ODDS, betsAccess, canVoteFor, payout, playerOdds, resolveStake, tally, type BetsMode,
} from '../shared/bets.js';
import { createBetsRouter } from '../server/bets-http.js';
import { createToken } from '../server/session.js';

process.env.SESSION_SECRET = 'bets-unit-tests-only-secret-over-32-characters';

// ---------- Interrupteur ----------

test('l’interrupteur ferme tout sur off, ouvre aux admins, puis à tous', () => {
  assert.equal(betsAccess('off', true), 'locked');
  assert.equal(betsAccess('off', false), 'locked');
  assert.equal(betsAccess('admins', true), 'preview');
  assert.equal(betsAccess('admins', false), 'locked');
  assert.equal(betsAccess('on', false), 'open');
});

const ADMIN = 1;
const PLAYER = 2;
function router(initial: BetsMode = 'off') {
  const state = { mode: initial, writes: [] as [BetsMode, number][] };
  const handlers = createBetsRouter({
    mode: async () => state.mode,
    setMode: async (mode, accountId) => { state.mode = mode; state.writes.push([mode, accountId]); },
  }, async (id) => id === ADMIN);
  return { state, handlers };
}
const as = (accountId: number | null, init: RequestInit = {}) => ({
  ...init, headers: { ...(accountId === null ? {} : { cookie: `dommage_session=${createToken(accountId)}` }), ...init.headers as Record<string, string> },
});
const statusOf = async (handlers: ReturnType<typeof router>['handlers'], accountId: number | null) =>
  (await handlers.GET(new Request('http://localhost/api/bets/status', as(accountId)))).json();

test('status : chaque visiteur voit l’accès que lui donne le mode', async () => {
  const { handlers, state } = router('admins');
  assert.deepEqual(await statusOf(handlers, null), { mode: 'admins', access: 'locked', canConfigure: false });
  assert.deepEqual(await statusOf(handlers, PLAYER), { mode: 'admins', access: 'locked', canConfigure: false });
  assert.deepEqual(await statusOf(handlers, ADMIN), { mode: 'admins', access: 'preview', canConfigure: true });
  state.mode = 'on';
  assert.equal((await statusOf(handlers, null)).access, 'open');
});

test('mode : seul l’admin lance, depuis le site, avec un mode connu', async () => {
  const { handlers, state } = router();
  const post = (accountId: number | null, body: unknown, origin = 'http://localhost') =>
    handlers.POST(new Request('http://localhost/api/bets/mode', as(accountId, { method: 'POST', body: JSON.stringify(body), headers: { origin } })));
  assert.equal((await post(null, { mode: 'on' })).status, 401);
  assert.equal((await post(PLAYER, { mode: 'on' })).status, 403);
  assert.equal((await post(ADMIN, { mode: 'on' }, 'https://ailleurs.fr')).status, 403);
  assert.equal((await post(ADMIN, { mode: 'partout' })).status, 400);
  assert.equal(state.mode, 'off');
  const ok = await post(ADMIN, { mode: 'admins' });
  assert.equal(ok.status, 200);
  assert.deepEqual(state.writes, [['admins', ADMIN]]);
  assert.equal((await ok.json()).access, 'preview');
});

test('routes inconnues et mauvaises méthodes', async () => {
  const { handlers } = router('on');
  assert.equal((await handlers.GET(new Request('http://localhost/api/bets/place'))).status, 404);
  assert.equal((await handlers.POST(new Request('http://localhost/api/bets/status', { method: 'POST' }))).status, 405);
  assert.equal((await handlers.GET(new Request('http://localhost/api/bets/mode'))).status, 405);
});

// ---------- Économie ----------

test('gain arrondi à l’inférieur, mise comprise', () => {
  assert.equal(payout(50, 2.2), 110);
  assert.equal(payout(25, 1.35), 33);
});

test('une mise doit être couverte par le solde ; MAX = tapis', () => {
  assert.equal(resolveStake(50, 500), 50);
  assert.equal(resolveStake(100, 60), null);
  assert.equal(resolveStake('max', 60), 60);
  assert.equal(resolveStake('max', 0), null);
  assert.equal(resolveStake(12.5, 100), null);
});

test('cotes Crack : le mieux noté est favori, la Casserole l’inverse, toujours dans les bornes', () => {
  const players = [{ memberId: 1, avgRating: 8.4 }, { memberId: 2, avgRating: 6.9 }, { memberId: 3, avgRating: 6.1 }, { memberId: 4, avgRating: null }];
  const crack = playerOdds(players, 'crack');
  const flop = playerOdds(players, 'flop');
  assert.ok(crack.get(1)! < crack.get(3)!);
  assert.ok(flop.get(1)! > flop.get(3)!);
  for (const odds of [...crack.values(), ...flop.values()]) {
    assert.ok(odds >= MIN_ODDS && odds <= MAX_ODDS);
    assert.equal(Math.round(odds * 20), odds * 20, 'arrondi à 0.05');
  }
});

test('la marge garde l’espérance sous la mise quand les cotes ne sont pas bornées', () => {
  const players = [6.8, 7.1, 7.4, 6.6, 7.0].map((avgRating, i) => ({ memberId: i + 1, avgRating }));
  const implied = [...playerOdds(players, 'crack').values()].reduce((sum, odds) => sum + 1 / odds, 0);
  assert.ok(implied > 1, `somme des probabilités implicites ${implied}`);
});

// ---------- Votes ----------

test('interdit de voter pour soi, et un compte non lié ne vote pas', () => {
  assert.equal(canVoteFor(7, 7), false);
  assert.equal(canVoteFor(7, 8), true);
  assert.equal(canVoteFor(null, 8), false);
});

test('dépouillement : leader unique, égalité, aucun vote', () => {
  assert.deepEqual(tally([3, 3, 1]).leaders, [3]);
  assert.deepEqual(tally([4, 1, 4, 1]).leaders, [1, 4]);
  const empty = tally([]);
  assert.deepEqual(empty.leaders, []);
  assert.equal(empty.total, 0);
});
