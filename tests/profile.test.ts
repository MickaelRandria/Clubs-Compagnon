import assert from 'node:assert/strict';
import { before, after, test } from 'node:test';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import type { ClubProfile } from '../shared/profile.js';
import { createProfileService, createProfileHandlers } from '../server/profile-http.js';
import { createToken } from '../server/session.js';

const db = new PGlite();
const ADMIN = '100000000000000001';
process.env.DISCORD_ADMIN_IDS = ADMIN;
process.env.SESSION_SECRET = 'profile-test-secret-at-least-32-characters';
let adminId: number;
let sequence = 1;
const call = async (action: string, account: number, input: object = {}, admins = [ADMIN]) => {
  const result = await db.query<{ data: ClubProfile & { error?: string; status?: number } }>(
    'select club_profile_dispatch($1, $2, $3::jsonb, $4::text[]) as data', [action, account, JSON.stringify(input), admins]);
  return result.rows[0].data;
};
const service = createProfileService(async (action, account, input, admins) => {
  return (await db.query<{ data: unknown }>('select club_profile_dispatch($1, $2, $3::jsonb, $4::text[]) as data', [action, account, input, admins])).rows[0].data;
});
const handlers = createProfileHandlers(service);
const request = (account?: number, data?: object, origin = 'http://localhost') => new Request('http://localhost/api/profile', {
  method: data ? 'POST' : 'GET', headers: { origin, cookie: account ? `dommage_session=${createToken(account)}` : '' },
  ...(data ? { body: JSON.stringify(data) } : {}),
});
async function fixture() {
  const n = ++sequence;
  const account = (await db.query<{ id: number }>('insert into club_accounts(discord_id, username) values ($1, $2) returning id', [`1000000000000000${String(n).padStart(2, '0')}`, `compte${n}`])).rows[0].id;
  const member = (await db.query<{ id: number }>("insert into members(club_id, gamertag, position, ovr, matches_played, goals, assists, avg_rating, pass_pct) values (1, $1, 'FW', 87, 10, 15, 4, 7.8, 82) returning id", [`Joueur${n}`])).rows[0].id;
  return { account, member };
}
before(async () => {
  const journal = JSON.parse(await readFile(new URL('../drizzle/meta/_journal.json', import.meta.url), 'utf8'));
  for (const entry of journal.entries) await db.exec(await readFile(new URL(`../drizzle/${entry.tag}.sql`, import.meta.url), 'utf8'));
  await db.exec("insert into clubs(name, region, reputation, skill_rating) values ('Club test', 'EU', 'Test', 1859), ('Autre club', 'EU', 'Test', 1)");
  adminId = (await db.query<{ id: number }>('insert into club_accounts(discord_id, username) values ($1, $2) returning id', [ADMIN, 'Admin'])).rows[0].id;
});
after(() => db.close());

test('profil privé : les invités et sessions inexistantes sont refusés', async () => {
  const response = await handlers.GET(request());
  assert.equal(response.status, 401);
  assert.equal(response.headers.get('cache-control'), 'private, no-store');
  assert.equal((await handlers.POST(request(undefined, { action: 'request', memberId: 1 }))).status, 401);
  assert.equal((await handlers.GET(request(99999))).status, 401);
});
test('demande, validation admin et carte issue des statistiques du club', async () => {
  const { account, member } = await fixture();
  const state = await call('request', account, { memberId: member });
  assert.equal(state.request?.status, 'pending');
  assert.equal(state.player, null);
  assert.deepEqual(state.adminClaims, []);
  const queue = await call('state', adminId);
  assert.ok(queue.adminClaims.some(claim => claim.id === state.request?.id && claim.accountId === account));
  assert.equal((await call('approve', account, { requestId: state.request!.id, isAdmin: true })).status, 403);
  assert.ok(!(await call('approve', adminId, { requestId: state.request!.id })).error);
  const approved = await call('state', account);
  assert.equal(approved.player?.id, member);
  assert.deepEqual([approved.player?.matchesPlayed, approved.player?.goals, approved.player?.assists, approved.player?.avgRating, approved.player?.passPct], [10, 15, 4, 7.8, 82]);
  await db.query('update members set goals = 17 where id = $1', [member]);
  assert.equal((await call('state', account)).player?.goals, 17, 'les stats ne sont pas figées au moment du rattachement');
  assert.equal((await call('request', account, { memberId: member })).status, 409);
  assert.equal((await call('cancel', account, { requestId: state.request!.id })).status, 409);
});
test('aucun rattachement implicite et aucune attribution concurrente en double', async () => {
  const a = await fixture(); const b = await fixture();
  await db.query('update club_accounts set display_name = (select gamertag from members where id = $1) where id = $2', [a.member, a.account]);
  assert.equal((await call('state', a.account)).player, null);
  const [first, other] = await Promise.all([call('request', a.account, { memberId: a.member }), call('request', b.account, { memberId: a.member })]);
  const approvals = await Promise.all([call('approve', adminId, { requestId: first.request!.id }), call('approve', adminId, { requestId: other.request!.id })]);
  assert.equal(approvals.filter(r => !r.error).length, 1);
  const states = await Promise.all([call('state', a.account), call('state', b.account)]);
  assert.equal(states.filter(r => r.player !== null).length, 1);
  const refused = states.find(r => r.request?.status === 'rejected')!;
  assert.match(refused.request!.reviewNote!, /autre compte/);
  const count = await db.query<{ n: number }>("select count(*)::int n from club_player_claims where member_id = $1 and status = 'approved'", [a.member]);
  assert.equal(count.rows[0].n, 1);
});
test('annulation personnelle, refus et nouvelle demande, retrait admin traçable', async () => {
  const a = await fixture(); const b = await fixture();
  const first = await call('request', a.account, { memberId: a.member });
  assert.equal((await call('cancel', b.account, { requestId: first.request!.id })).status, 404);
  assert.equal((await call('cancel', a.account, { requestId: first.request!.id })).request?.status, 'cancelled');
  const second = await call('request', a.account, { memberId: a.member });
  await call('reject', adminId, { requestId: second.request!.id, note: 'Mauvais pseudo' });
  assert.equal((await call('state', a.account)).request?.reviewNote, 'Mauvais pseudo');
  const third = await call('request', a.account, { memberId: b.member });
  await call('approve', adminId, { requestId: third.request!.id });
  assert.equal((await call('revoke', b.account, { requestId: third.request!.id })).status, 403);
  await call('revoke', adminId, { requestId: third.request!.id, note: 'Correction' });
  const revoked = await call('state', a.account);
  assert.equal(revoked.player, null); assert.equal(revoked.request?.status, 'revoked');
  assert.ok(revoked.availablePlayers.some(player => player.id === b.member));
  const history = await db.query<{ status: string; reviewed_by: number; reviewed_at: unknown }>('select status, reviewed_by, reviewed_at from club_player_claims where account_id = $1 order by id', [a.account]);
  assert.deepEqual(history.rows.map(r => r.status), ['cancelled', 'rejected', 'revoked']);
  assert.equal(history.rows[2].reviewed_by, adminId); assert.ok(history.rows[2].reviewed_at);
});
test('joueur inconnu, inactif, autre club et demandes doubles sont refusés', async () => {
  const { account, member } = await fixture();
  assert.equal((await call('request', account, { memberId: 999999 })).status, 400);
  await db.query('update members set is_active = false where id = $1', [member]);
  assert.equal((await call('request', account, { memberId: member })).status, 400);
  await db.query('update members set is_active = true, club_id = 2 where id = $1', [member]);
  assert.equal((await call('request', account, { memberId: member })).status, 400);
  await db.query('update members set club_id = 1 where id = $1', [member]);
  const duplicates = await Promise.all([call('request', account, { memberId: member }), call('request', account, { memberId: member })]);
  assert.equal(duplicates.filter(r => r.status === 409).length, 1);
  const pending = duplicates.find(r => !r.error)!;
  await db.query('update members set is_active = false where id = $1', [member]);
  assert.equal((await call('approve', adminId, { requestId: pending.request!.id })).status, 409);
});
test('le rôle admin dépend de son ID Discord côté serveur, jamais du client', async () => {
  const { account, member } = await fixture();
  const pending = await call('request', account, { memberId: member });
  assert.equal((await call('state', adminId, {}, [])).isAdmin, false);
  assert.deepEqual((await call('state', adminId, {}, [])).adminClaims, []);
  assert.equal((await call('approve', adminId, { requestId: pending.request!.id }, [])).status, 403);
  const malicious = { action: 'approve', requestId: pending.request!.id, accountId: adminId, isAdmin: true, admins: [ADMIN] };
  assert.equal((await handlers.POST(request(account, malicious))).status, 403);
  assert.equal((await handlers.POST(request(adminId, malicious, 'https://ailleurs.test'))).status, 403);
  const injected = await handlers.POST(request(account, { action: 'cancel', requestId: pending.request!.id, accountId: adminId }));
  assert.equal(injected.status, 200);
  assert.equal((await injected.json()).request.status, 'cancelled');
  assert.equal((await handlers.POST(request(adminId, { action: 'reject', requestId: 1, note: 'x'.repeat(241) }))).status, 400);
});
test('les statistiques manquantes restent nulles, les zéros sont conservés', async () => {
  const { account, member } = await fixture();
  await db.query('update members set matches_played = 0, goals = 0, assists = 0, avg_rating = null, pass_pct = null where id = $1', [member]);
  const state = await call('request', account, { memberId: member });
  await call('approve', adminId, { requestId: state.request!.id });
  const player = (await call('state', account)).player!;
  assert.equal(player.matchesPlayed, 0); assert.equal(player.goals, 0);
  assert.equal(player.avgRating, null); assert.equal(player.passPct, null);
});
