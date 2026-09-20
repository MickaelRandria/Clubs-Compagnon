import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { after, before, test } from 'node:test';
import { PGlite } from '@electric-sql/pglite';
import type { FC27State } from '../shared/fc27.js';
import { ARCHETYPES, ARCHETYPE_IDS, LINE_OF_POSITION, archetypesForPosition, BASE_OVR } from '../shared/data/archetypes.js';
import { POSITION_CODES } from '../shared/fc27.js';
import { fc27ActionSchema } from '../shared/fc27-validation.js';
import { LIMITS } from '../shared/fc27-player.js';
import { createFC27Service } from '../server/fc27-service.js';
import { createFC27Handlers } from '../server/fc27-http.js';

const db = new PGlite();
type Result = FC27State & { error?: string; status?: number };
const journal = JSON.parse(await readFile(new URL('../drizzle/meta/_journal.json', import.meta.url), 'utf8'));
const migrations: string[] = await Promise.all(journal.entries.map((e: { tag: string }) => readFile(new URL(`../drizzle/${e.tag}.sql`, import.meta.url), 'utf8')));
async function call(action: string, payload: Record<string, unknown> = {}, campaign?: number, database = db): Promise<Result> {
  const result = await database.query<{ data: Result }>('select fc27_dispatch($1, $2::jsonb, $3::integer) as data', [action, JSON.stringify(payload), campaign ?? null]);
  return result.rows[0].data;
}
async function fresh() { const latest = await call('state'); return call('reset', {}, latest.campaign.id); }
async function election(names = ['Alpha', 'Bravo', 'Charlie']) {
  let state = await fresh();
  for (const name of names) state = await call('propose', { pseudo: 'Même auteur', name }, state.campaign.id);
  return call('start', {}, state.campaign.id);
}
const vote = (state: FC27State, pseudo: string, proposalId = state.proposals[0].id) => call('vote', { pseudo, proposalId }, state.campaign.id);
before(async () => {
  for (const migration of migrations) await db.exec(migration);
  await db.exec("insert into clubs(name, region, reputation, skill_rating) values ('Test FC', 'EU', 'Test', 1000)");
});
after(() => db.close());

test('proposals are unlimited and preserve the exact pseudo; no rounds in the API', async () => {
  let state = await call('state');
  assert.equal(state.election.phase, 'proposing');
  assert.equal('rounds' in state, false); assert.equal('expected_voters' in state.campaign, false);
  for (let n = 0; n < 12; n++) state = await call('propose', { pseudo: ' Alex ', name: `Nom ${n}` }, state.campaign.id);
  assert.equal(state.proposals.length, 12); assert.equal(state.proposals[0].author_pseudo, ' Alex ');
  assert.ok(state.proposals.every((p) => p.votes === 0));
});
test('manual start freezes proposals; no votes before start and no restart', async () => {
  const state = await fresh();
  assert.equal((await call('start', {}, state.campaign.id)).status, 400);
  const proposal = await call('propose', { pseudo: 'A', name: 'Alpha' }, state.campaign.id);
  assert.equal((await vote(proposal, 'A')).status, 409);
  const started = await call('start', {}, state.campaign.id);
  assert.equal(started.election.phase, 'voting');
  assert.equal((await call('start', {}, state.campaign.id)).status, 409);
  assert.equal((await call('propose', { pseudo: 'A', name: 'Trop tard' }, state.campaign.id)).status, 409);
});
test('one vote per exact pseudo for the campaign, including concurrent duplicates', async () => {
  const state = await election();
  const attempts = await Promise.all([vote(state, 'Alex'), vote(state, 'Alex', state.proposals[1].id)]);
  assert.equal(attempts.filter((r) => r.status === 409).length, 1);
  const next = await vote(state, 'alex');
  assert.equal(next.proposals.reduce((sum, p) => sum + p.votes, 0), 2);
  const spaced = await vote(state, ' Alex ');
  assert.equal(spaced.proposals.reduce((sum, p) => sum + p.votes, 0), 3);
});
test('neither many votes, elapsed time, nor the old scheduler closes or eliminates', async () => {
  const state = await election();
  for (let i = 0; i < 14; i++) await vote(state, `Voter ${i}`);
  await db.query("update fc27_name_elections set started_at = now() - interval '100 days' where campaign_id = $1", [state.campaign.id]);
  await db.query('select fc27_advance($1)', [state.campaign.id]);
  const next = await call('tick');
  assert.equal(next.election.phase, 'voting'); assert.equal(next.proposals.length, 3);
  assert.equal(next.winner, null); assert.equal(next.proposals[0].votes, 14);
});
test('manual close elects the most voted and freezes all scores, including zero', async () => {
  const state = await election();
  await vote(state, 'A'); await vote(state, 'B'); await vote(state, 'C', state.proposals[1].id);
  assert.equal((await call('state')).winner, null);
  const closed = await call('close', {}, state.campaign.id);
  assert.equal(closed.election.phase, 'closed'); assert.equal(closed.winner?.club_name, 'Alpha');
  assert.equal(closed.election.tie_break_applied, false);
  assert.deepEqual(closed.proposals.map((p) => p.votes), [2, 1, 0]);
  assert.equal((await vote(closed, 'D')).status, 409);
  assert.equal((await call('close', {}, state.campaign.id)).status, 409);
  assert.equal((await call('propose', { pseudo: 'D', name: 'Later' }, state.campaign.id)).status, 409);
  assert.deepEqual((await call('state')).proposals, closed.proposals);
});
test('ties require manual choice among the leaders only', async () => {
  const state = await election(); await vote(state, 'A'); await vote(state, 'B', state.proposals[1].id);
  assert.equal((await call('close', {}, state.campaign.id)).status, 409);
  assert.equal((await call('close', { winnerProposalId: state.proposals[2].id }, state.campaign.id)).status, 409);
  const closed = await call('close', { winnerProposalId: state.proposals[1].id }, state.campaign.id);
  assert.equal(closed.winner?.club_name, 'Bravo'); assert.equal(closed.election.tie_break_applied, true);
  assert.deepEqual(closed.proposals.map((p) => p.votes), [1, 1, 0]);
});
test('no winner can be declared with zero votes or before voting starts', async () => {
  const empty = await fresh(); assert.equal((await call('close', {}, empty.campaign.id)).status, 409);
  const state = await election(); assert.equal((await call('close', {}, state.campaign.id)).status, 400);
  assert.equal((await call('state')).election.phase, 'voting');
});
test('stale manual winner choices are rejected when rankings change', async () => {
  const state = await election(); await vote(state, 'A'); await vote(state, 'B', state.proposals[1].id);
  await vote(state, 'C');
  assert.equal((await call('close', { winnerProposalId: state.proposals[1].id }, state.campaign.id)).status, 409);
  assert.equal((await call('close', {}, state.campaign.id)).winner?.id, state.proposals[0].id);
});
test('vote and close submissions serialize; result agrees with accepted ballots', async () => {
  const state = await election(); await vote(state, 'A');
  const results = await Promise.all([vote(state, 'B'), call('close', {}, state.campaign.id), vote(state, 'C')]);
  const final = await call('state');
  assert.equal(final.election.phase, 'closed');
  assert.equal(final.winner!.votes, 1 + [results[0], results[2]].filter((r) => !r.error).length);
});
const card = {
  pseudo: ' Sam ', kitName: 'SAMUEL', kitNumber: 9, primaryPosition: 'BU', secondaryPosition: 'AG', preferredFoot: 'Gauche',
  heightCm: 189, weightKg: 82, archetype: 'target', weakFootStars: 3, skillMovesStars: 2, notes: 'Penalty',
};
test('player card: full creation, unique pseudo and modification after the naming vote closes', async () => {
  const state = await election(); await vote(state, 'A'); await call('close', {}, state.campaign.id);
  const created = await call('player', card, state.campaign.id);
  const player = created.players[0];
  assert.equal(player.pseudo, ' Sam '); assert.equal(player.in_game_name, 'SAMUEL'); assert.equal(player.kit_number, 9);
  assert.deepEqual(player.secondary_positions, ['AG']); assert.equal(player.preferred_foot, 'Gauche');
  assert.equal(player.height_cm, 189); assert.equal(player.archetype, 'target');
 assert.equal(player.weak_foot, 3); assert.equal(player.skill_moves, 2);
  assert.equal((await call('player', { ...card, kitNumber: 10 }, state.campaign.id)).status, 409);
  assert.equal((await call('player', { ...card, pseudo: 'Alex', kitNumber: 10 }, state.campaign.id)).players.length, 2);
  assert.equal((await call('player', { ...card, profileId: player.id, pseudo: 'Sam' }, state.campaign.id)).status, 404);
  const updated = await call('player', { ...card, profileId: player.id, primaryPosition: 'G', secondaryPosition: undefined,
    archetype: 'sweeper-keeper', notes: '' }, state.campaign.id);
  assert.equal(updated.players[0].primary_position, 'G'); assert.deepEqual(updated.players[0].secondary_positions, []);
  assert.equal(updated.players[0].notes, null);
});
test('kit numbers are unique per campaign; keeping your own number on edit is allowed', async () => {
  const state = await fresh();
  const sam = (await call('player', card, state.campaign.id)).players[0];
  const taken = await call('player', { ...card, pseudo: 'Alex', kitName: 'ALEX' }, state.campaign.id);
  assert.equal(taken.status, 409); assert.equal(taken.error, 'Le numéro 9 est déjà porté par SAMUEL.');
  assert.equal((await call('player', { ...card, profileId: sam.id, weightKg: 85 }, state.campaign.id)).players[0].weight_kg, 85);
  await assert.rejects(db.query("insert into fc27_player_profiles(campaign_id, pseudo, primary_position, kit_number) values ($1, 'Race', 'MC', 9)", [state.campaign.id]));
  const other = await fresh();
  assert.equal((await call('player', card, other.campaign.id)).players[0].kit_number, 9, 'Une nouvelle campagne libère les numéros.');
  await assert.rejects(db.query("insert into fc27_player_profiles(campaign_id, pseudo, primary_position, height_cm) values ($1, 'Géant', 'DC', 230)", [other.campaign.id]));
});
test('catalogue: 13 stable IDs, 4/4/3/2 choices by line, two key attributes and fixed OVR', () => {
  assert.equal(ARCHETYPES.length, 13); assert.equal(new Set(ARCHETYPE_IDS).size, 13);
  assert.equal(BASE_OVR, 65);
  const counts = { ATT: 4, MIL: 4, DEF: 3, G: 2 };
  for (const position of POSITION_CODES) {
    assert.equal(archetypesForPosition(position).length, counts[LINE_OF_POSITION[position]]);
    for (const archetype of ARCHETYPES) {
      const action = { action: 'player', campaignId: 1, ...card, secondaryPosition: undefined, primaryPosition: position, archetype: archetype.id };
      assert.equal(fc27ActionSchema.safeParse(action).success, archetype.line === LINE_OF_POSITION[position], position + '/' + archetype.id);
      assert.equal(archetype.keyAttributes.length, 2); assert.ok(archetype.signature.inMatch); assert.ok(archetype.tacticalAdvice);
    }
  }
});
test('player validation: required stable ID, generic morphology bounds, no manual PlayStyles', () => {
  const action = { action: 'player', campaignId: 1, ...card };
  assert.equal(fc27ActionSchema.safeParse(action).success, true);
  for (const archetype of ['', 'Target', 'Pivot', 'boss', undefined]) {
    assert.equal(fc27ActionSchema.safeParse({ ...action, archetype }).success, false);
  }
  assert.equal(fc27ActionSchema.safeParse({ ...action, secondaryPosition: 'BU' }).success, false);
  assert.equal(fc27ActionSchema.safeParse({ ...action, kitNumber: 100 }).success, false);
  assert.equal(fc27ActionSchema.safeParse({ ...action, kitName: '   ' }).success, false);
  for (const [field, range] of Object.entries({ heightCm: LIMITS.heightCm, weightKg: LIMITS.weightKg })) {
    for (const value of [range.min, range.max]) assert.equal(fc27ActionSchema.safeParse({ ...action, [field]: value }).success, true);
    for (const value of [range.min - 1, range.max + 1]) assert.equal(fc27ActionSchema.safeParse({ ...action, [field]: value }).success, false);
  }
  // Les bornes du formulaire doivent rester dans celles de la base (contraintes SQL 0005).
  assert.ok(LIMITS.heightCm.min >= 160 && LIMITS.heightCm.max <= 200, 'taille hors de la contrainte SQL');
  assert.ok(LIMITS.weightKg.min >= 50 && LIMITS.weightKg.max <= 100, 'poids hors de la contrainte SQL');
});
test('database enforces stable archetypes by line and accepts non-ideal positions in that line', async () => {
  const state = await fresh();
  for (const archetype of ['', 'Pivot', 'boss', null]) {
    assert.equal((await call('player', { ...card, archetype }, state.campaign.id)).status, 400);
  }
  for (const position of POSITION_CODES) {
    for (const archetype of ARCHETYPES) {
      const pseudo = position + '/' + archetype.id;
      const insert = () => db.query('insert into fc27_player_profiles(campaign_id, pseudo, primary_position, archetype) values ($1, $2, $3, $4)', [state.campaign.id, pseudo, position, archetype.id]);
      if (archetype.line === LINE_OF_POSITION[position]) await insert();
      else await assert.rejects(insert());
    }
  }
  const created = await call('player', { ...card, archetype: 'spark' }, state.campaign.id);
  assert.equal(created.players.find((p) => p.pseudo === card.pseudo)?.archetype, 'spark');
});
test('archive requires closing a live ballot; reset preserves scores and historical access', async () => {
  const state = await election(); await vote(state, 'A');
  assert.equal((await call('archive', {}, state.campaign.id)).status, 409);
  await call('close', {}, state.campaign.id);
  const archived = await call('archive', {}, state.campaign.id);
  assert.equal(archived.campaign.status, 'archived'); assert.equal(archived.winner?.club_name, 'Alpha');
  const reset = await call('reset', {}, state.campaign.id);
  assert.equal(reset.election.phase, 'proposing'); assert.equal(reset.proposals.length, 0);
  assert.equal((await call('state', {}, state.campaign.id)).winner?.club_name, 'Alpha');
  assert.equal((await call('reset', {}, state.campaign.id)).status, 409);
});
test('resetting an unfinished campaign preserves it as cancelled without inventing a winner', async () => {
  const state = await election(); await vote(state, 'A'); await call('reset', {}, state.campaign.id);
  const archive = await call('state', {}, state.campaign.id);
  assert.equal(archive.election.phase, 'cancelled'); assert.equal(archive.winner, null); assert.equal(archive.proposals[0].votes, 1);
  assert.equal((await vote(archive, 'B')).status, 409);
});
test('DB rejects foreign campaign votes and blank identities; old quorum action is gone', async () => {
  const old = await election(); const state = await election();
  assert.equal((await vote(state, 'A', old.proposals[0].id)).status, 400);
  await assert.rejects(db.query('insert into fc27_name_votes(campaign_id, proposal_id, voter_pseudo) values ($1,$2,$3)', [state.campaign.id, old.proposals[0].id, 'A']));
  await assert.rejects(db.query('insert into fc27_name_votes(campaign_id, proposal_id, voter_pseudo) values ($1,$2,$3)', [state.campaign.id, state.proposals[0].id, '  ']));
  assert.equal(fc27ActionSchema.safeParse({ action: 'settings', campaignId: state.campaign.id, quorum: 10 }).success, false);
  assert.equal(fc27ActionSchema.safeParse({ action: 'propose', campaignId: 1, pseudo: '\t  ', name: 'A' }).success, false);
});
test('HTTP validates requests and returns no-store live state', async () => {
  const handlers = createFC27Handlers(createFC27Service(async (name, payload, campaign) => {
    const result = await db.query<{ data: unknown }>('select fc27_dispatch($1,$2::jsonb,$3::integer) as data', [name, payload, campaign]); return result.rows[0].data;
  }));
  const url = 'http://localhost/api/fc27';
  const response = await handlers.GET(new Request(url)); assert.equal(response.status, 200); assert.equal(response.headers.get('cache-control'), 'no-store');
  assert.equal((await handlers.GET(new Request(`${url}?campaign=abc`))).status, 400);
  assert.equal((await handlers.GET(new Request(`${url}?campaign=2147483648`))).status, 400);
  assert.equal((await handlers.POST(new Request(url, { method: 'POST', body: '{bad' }))).status, 400);
});
test('migration retains proposals and original ballots while disabling the old elimination engine', async () => {
  const legacy = new PGlite();
  try {
    for (const migration of migrations.slice(0, 3)) await legacy.exec(migration);
    await legacy.exec("insert into clubs(name, region, reputation, skill_rating) values ('Old FC', 'EU', 'Test', 1000)");
    let state = await call('state', {}, undefined, legacy);
    for (const name of ['Old A', 'Old B', 'Old C']) state = await call('propose', { pseudo: 'Author', name }, state.campaign.id, legacy);
    await call('settings', { quorum: 2 }, state.campaign.id, legacy);
    const started = await call('start', {}, state.campaign.id, legacy) as unknown as { rounds: { id: number; status: string }[] };
    const round = started.rounds.find((r) => r.status === 'open')!;
    await call('vote', { roundId: round.id, proposalId: state.proposals[0].id, pseudo: 'A' }, state.campaign.id, legacy);
    await call('vote', { roundId: round.id, proposalId: state.proposals[1].id, pseudo: 'B' }, state.campaign.id, legacy);
    await legacy.query("insert into fc27_player_profiles(campaign_id, pseudo, in_game_name, primary_position) values ($1, 'Ancien', 'Vétéran', 'ST')", [state.campaign.id]);
    const profile = await legacy.query<{ id: number }>("select id from fc27_player_profiles where pseudo = 'Ancien'");
    await legacy.query("insert into fc27_player_secondary_positions(profile_id, position) values ($1, 'LW')", [profile.rows[0].id]);
    for (const migration of migrations.slice(3)) await legacy.exec(migration);
    const converted = await call('state', {}, state.campaign.id, legacy);
    assert.equal(converted.players[0].primary_position, 'BU', 'Les anciens codes sont renommés sur place (ST → BU).');
    assert.deepEqual(converted.players[0].secondary_positions, ['AG']);
    assert.equal(converted.players[0].kit_number, null);
    assert.equal(converted.election.phase, 'voting'); assert.equal(converted.proposals.length, 3);
    assert.deepEqual(converted.proposals.map((p) => p.votes), [1, 1, 0]);
    assert.equal((await call('vote', { proposalId: state.proposals[0].id, pseudo: 'A' }, state.campaign.id, legacy)).status, 409);
    assert.equal((await legacy.query<{ count: number }>('select count(*)::int as count from fc27_votes')).rows[0].count, 2);
  } finally { await legacy.close(); }
});
