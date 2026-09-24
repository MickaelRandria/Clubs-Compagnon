import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { after, before, test } from 'node:test';
import { PGlite } from '@electric-sql/pglite';
import type { FC27State } from '../shared/fc27.js';
import { ARCHETYPES, ARCHETYPE_IDS, LINE_OF_POSITION, archetypesForPosition, BASE_OVR } from '../shared/data/archetypes.js';
import { POSITION_CODES } from '../shared/fc27.js';
import { fc27ActionSchema } from '../shared/fc27-validation.js';
import { planAdvance } from '../shared/fc27-bracket.js';
import { LIMITS } from '../shared/fc27-player.js';
import { createFC27Service } from '../server/fc27-service.js';
import { createFC27Handlers } from '../server/fc27-http.js';
import { createToken } from '../server/session.js';
import { createAdminCheck } from '../server/admin.js';

process.env.SESSION_SECRET = 'fc27-unit-tests-only-secret-over-32-characters';
process.env.DISCORD_ADMIN_IDS = '777000000000000001';

const db = new PGlite();
const isAdmin = createAdminCheck(async accountId => {
  const result = await db.query<{ discord_id: string }>('select discord_id from club_accounts where id = $1', [accountId]);
  return result.rows[0]?.discord_id;
});
type Result = FC27State & { error?: string; status?: number };
const journal = JSON.parse(await readFile(new URL('../drizzle/meta/_journal.json', import.meta.url), 'utf8'));
const migrations: string[] = await Promise.all(journal.entries.map((e: { tag: string }) => readFile(new URL(`../drizzle/${e.tag}.sql`, import.meta.url), 'utf8')));
async function call(action: string, payload: Record<string, unknown> = {}, campaign?: number, database = db): Promise<Result> {
  // Les scénarios métier utilisent un membre connecté pour les commandes de gestion.
  // Un accountId explicitement null garde la possibilité de tester l'accès anonyme.
  if (database === db && ['start', 'advance', 'close', 'archive', 'reset'].includes(action) && !('accountId' in payload)) {
    payload = { ...payload, accountId: await accountFor('gestion') };
  }
  const result = await database.query<{ data: Result }>('select fc27_dispatch($1, $2::jsonb, $3::integer) as data', [action, JSON.stringify(payload), campaign ?? null]);
  return result.rows[0].data;
}
async function fresh() { const latest = await call('state'); return call('reset', {}, latest.campaign.id); }
/** Compte Discord factice : l'écriture d'une fiche est désormais liée à un compte. */
let nextAccount = 0;
async function account(database = db): Promise<number> {
  nextAccount += 1;
  const result = await database.query<{ id: number }>(
    'insert into club_accounts(discord_id, username) values ($1, $2) returning id',
    [`discord-${nextAccount}`, `joueur${nextAccount}`]);
  return result.rows[0].id;
}
/**
 * Un pseudo de test correspond à un compte stable : réutiliser le même pseudo vise
 * la même personne, deux pseudos différents sont deux personnes. C'est ce que les
 * tests exprimaient avant les comptes, et ça reste vrai avec eux.
 */
const accounts = new Map<string, Promise<number>>();
function accountFor(pseudo: string, database = db): Promise<number> {
  const key = `${pseudo}@${database === db ? 'main' : 'autre'}`;
  if (!accounts.has(key)) accounts.set(key, account(database));
  return accounts.get(key)!;
}
async function election(names = ['Alpha', 'Bravo', 'Charlie']) {
  let state = await fresh();
  // Trois propositions au maximum par compte : on répartit sur autant d'auteurs que de noms.
  for (const [index, name] of names.entries()) {
    state = await call('propose', { accountId: await accountFor(`auteur${index}`), name }, state.campaign.id);
  }
  return call('start', {}, state.campaign.id);
}
const vote = async (state: FC27State, pseudo: string, proposalId = state.proposals[0].id, database = db) =>
  call('vote', { accountId: await accountFor(pseudo, database), proposalId }, state.campaign.id, database);
/** Bulletin complet de l'étape ouverte, validé comme par la route HTTP. */
const ballot = async (state: FC27State, pseudo: string, proposalIds: number[]) => {
  const parsed = fc27ActionSchema.safeParse({ action: 'vote', campaignId: state.campaign.id, proposalIds });
  if (!parsed.success) return { status: 400 } as Result;
  return call('vote', { ...parsed.data, accountId: await accountFor(pseudo) }, state.campaign.id);
};
const advance = (state: FC27State, picks: number[] = []) => call('advance', { picks }, state.campaign.id);
const current = (state: FC27State) => state.stages.find((s) => s.closed_at === null)!;
/** Donne `counts[i]` voix au nom `ids[i]` dans l'étape ouverte, un votant par voix. */
async function score(state: FC27State, ids: number[], counts: number[], tag: string) {
  let next = state;
  for (const [index, id] of ids.entries()) {
    for (let n = 0; n < counts[index]; n++) next = await ballot(state, `${tag}-${id}-${n}`, [id]);
  }
  return next;
}
before(async () => {
  for (const migration of migrations) await db.exec(migration);
  await db.exec("insert into clubs(name, region, reputation, skill_rating) values ('Test FC', 'EU', 'Test', 1000)");
});
after(() => db.close());

test('proposals are capped at three per account and signed by the account', async () => {
  let state = await call('state');
  assert.equal(state.election.phase, 'proposing');
  assert.equal('rounds' in state, false); assert.equal('expected_voters' in state.campaign, false);
  // Douze noms venus de quatre comptes : trois chacun, la limite par personne.
  for (let n = 0; n < 12; n++) {
    state = await call('propose', { accountId: await accountFor(`auteur-limite-${Math.floor(n / 3)}`), name: `Nom ${n}` }, state.campaign.id);
  }
  assert.equal(state.proposals.length, 12);
  assert.ok(state.proposals.every((p) => /^joueur\d+$/.test(p.author_pseudo)), 'l auteur vient du compte');
  assert.equal((await call('propose', { accountId: await accountFor('auteur-limite-0'), name: 'De trop' }, state.campaign.id)).status, 409);
  assert.ok(state.proposals.every((p) => p.votes === 0));
});
test('manual start freezes proposals; no votes before start and no restart', async () => {
  const state = await fresh();
  assert.equal((await call('start', {}, state.campaign.id)).status, 400);
  const proposal = await call('propose', { accountId: await accountFor('A'), name: 'Alpha' }, state.campaign.id);
  assert.equal((await vote(proposal, 'A')).status, 409);
  const started = await call('start', {}, state.campaign.id);
  assert.equal(started.election.phase, 'voting');
  assert.equal((await call('start', {}, state.campaign.id)).status, 409);
  assert.equal((await call('propose', { accountId: await accountFor('A'), name: 'Trop tard' }, state.campaign.id)).status, 409);
});
test('a ballot holds up to three names, replaces the previous one and can be withdrawn', async () => {
  const state = await election(['Alpha', 'Bravo', 'Charlie', 'Delta']);
  const [a, b, c, d] = state.proposals.map((p) => p.id);
  assert.equal(state.stages.length, 1); assert.equal(state.stages[0].kind, 'qualif'); assert.equal(state.stages[0].max_choices, 3);
  const first = await ballot(state, 'Alex', [c, a, b]);
  assert.deepEqual(first.proposals.map((p) => p.votes), [1, 1, 1, 0]);
  assert.deepEqual(first.my_ballot, [a, b, c]);
  assert.equal(first.stages[0].voters, 1);
  assert.equal((await ballot(state, 'Alex', [a, b, c, d])).status, 400, 'Quatre choix : refusé par la validation');
  assert.equal((await call('vote', { accountId: await accountFor('Alex'), proposalIds: [a, b, c, d] }, state.campaign.id)).status, 400);
  // Changer d'avis remplace le bulletin entier.
  const changed = await ballot(state, 'Alex', [d, d]);
  assert.deepEqual(changed.proposals.map((p) => p.votes), [0, 0, 0, 1]);
  assert.deepEqual(changed.my_ballot, [d]);
  // Deux bulletins simultanés du même compte : un seul survit, entier.
  await Promise.all([ballot(state, 'Alex', [a, b]), ballot(state, 'Alex', [c])]);
  const raced = await call('state', { accountId: await accountFor('Alex') });
  assert.ok([[a, b], [c]].some((expected) => JSON.stringify(expected) === JSON.stringify(raced.my_ballot)));
  assert.equal(raced.proposals.reduce((sum, p) => sum + p.votes, 0), raced.my_ballot.length);
  // Le bulletin n'est renvoyé qu'à son auteur.
  assert.deepEqual((await call('state')).my_ballot, []);
  assert.deepEqual((await call('state', { accountId: await accountFor('Sam') })).my_ballot, []);
  const withdrawn = await ballot(state, 'Alex', []);
  assert.deepEqual(withdrawn.my_ballot, []); assert.equal(withdrawn.stages[0].voters, 0);
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
test('full path: first round, second round, semi-finals 1v4 and 2v3, final', async () => {
  const names = ['N1', 'N2', 'N3', 'N4', 'N5', 'N6', 'N7'];
  let state = await election(names);
  const id = (name: string) => state.proposals.find((p) => p.club_name === name)!.id;
  // Premier tour : six noms reçoivent au moins une voix, N7 aucune.
  state = await score(state, names.slice(0, 6).map(id), [1, 1, 1, 1, 1, 1], 'full-1');
  state = await advance(state);
  const second = current(state);
  assert.equal(second.kind, 'repechage'); assert.equal(second.number, 2); assert.equal(second.max_choices, 3);
  assert.deepEqual(second.entries.map((e) => e.proposal_id), names.slice(0, 6).map(id), 'N7 sort, les autres gardent leur rang');
  assert.equal(state.stages[0].entries.find((e) => e.proposal_id === id('N7'))!.result, 'eliminated');
  assert.deepEqual(state.my_ballot, [], 'Nouvelle étape, nouveau bulletin');
  // Second tour : N6 5, N5 4, N4 3, N3 2, N2 1, N1 0 → les quatre premiers en demi-finales.
  state = await score(state, ['N6', 'N5', 'N4', 'N3', 'N2'].map(id), [5, 4, 3, 2, 1], 'full-2');
  state = await advance(state);
  const semis = current(state);
  assert.equal(semis.kind, 'semis');
  assert.deepEqual(semis.entries.map((e) => [e.duel, e.seed, e.proposal_id]),
    [[1, 1, id('N6')], [1, 4, id('N3')], [2, 2, id('N5')], [2, 3, id('N4')]]);
  // Un nom par duel, au plus.
  assert.equal((await ballot(state, 'full-x', [id('N6'), id('N3')])).status, 400);
  assert.equal((await ballot(state, 'full-x', [id('N1')])).status, 400, 'N1 n est plus en course');
  assert.deepEqual((await ballot(state, 'full-x', [id('N3'), id('N4')])).my_ballot.sort(), [id('N3'), id('N4')].sort());
  state = await ballot(state, 'full-y', [id('N3'), id('N5')]);
  state = await ballot(state, 'full-z', [id('N6'), id('N5')]);
  state = await advance(state);
  const final = current(state);
  assert.equal(final.kind, 'final');
  assert.deepEqual(final.entries.map((e) => e.proposal_id), [id('N3'), id('N5')]);
  assert.equal((await ballot(state, 'full-x', [id('N3'), id('N5')])).status, 400, 'Une seule voix en finale');
  state = await ballot(state, 'full-x', [id('N5')]);
  state = await advance(state);
  assert.equal(state.election.phase, 'closed'); assert.equal(state.winner?.club_name, 'N5'); assert.equal(state.winner?.votes, 1);
  assert.equal(state.election.tie_break_applied, false);
  assert.deepEqual(state.stages.at(-1)!.entries.map((e) => e.result), ['runner_up', 'winner']);
  assert.ok(state.stages.every((s) => s.closed_at !== null));
  // `votes` d'une proposition = son score du premier tour, figé.
  assert.deepEqual(state.proposals.map((p) => p.votes), [1, 1, 1, 1, 1, 1, 0]);
  assert.equal((await ballot(state, 'full-w', [id('N5')])).status, 409);
  assert.equal((await advance(state)).status, 409);
});
test('first round with 4, 3, 2 or 1 voted names goes to semis, podium, final or a direct winner', async () => {
  for (const [count, expected] of [[4, 'semis'], [3, 'podium'], [2, 'final']] as const) {
    let state = await election(['A', 'B', 'C', 'D', 'E']);
    state = await score(state, state.proposals.slice(0, count).map((p) => p.id), [1, 1, 1, 1].slice(0, count), `short-${count}`);
    state = await advance(state);
    assert.equal(current(state).kind, expected); assert.equal(current(state).entries.length, count);
  }
  let state = await election(['Seul', 'Autre']);
  state = await advance(await score(state, [state.proposals[0].id], [2], 'short-1'));
  assert.equal(state.election.phase, 'closed'); assert.equal(state.winner?.club_name, 'Seul');
});
test('podium: one vote each, first place wins, podium order is recorded', async () => {
  let state = await election(['Or', 'Argent', 'Bronze']);
  const [gold, silver, bronze] = state.proposals.map((p) => p.id);
  state = await advance(await score(state, [gold, silver, bronze], [1, 1, 1], 'podium-1'));
  assert.equal(current(state).kind, 'podium'); assert.equal(current(state).max_choices, 1);
  state = await score(state, [bronze, silver, gold], [1, 2, 3], 'podium-2');
  state = await advance(state);
  assert.equal(state.winner?.club_name, 'Or');
  assert.deepEqual(state.stages.at(-1)!.entries.map((e) => [e.proposal_id, e.result]),
    [[gold, 'winner'], [silver, 'runner_up'], [bronze, 'third']]);
});
test('ties that decide a qualification or the title need admin picks; nothing is written until then', async () => {
  // Second tour : 3 / 2 / 1 / 1 / 1 → deux places pour trois ex æquo.
  let state = await election(['T1', 'T2', 'T3', 'T4', 'T5']);
  const ids = state.proposals.map((p) => p.id);
  state = await advance(await score(state, ids, [1, 1, 1, 1, 1], 'tie-1'));
  state = await score(state, ids, [3, 2, 1, 1, 1], 'tie-2');
  const refused = await advance(state);
  assert.equal(refused.status, 409); assert.match(refused.error!, /2 nom\(s\)/);
  const stillOpen = await call('state');
  assert.equal(current(stillOpen).kind, 'repechage');
  assert.ok(current(stillOpen).entries.every((e) => e.result === null));
  assert.equal((await advance(state, [ids[2]])).status, 409, 'Un seul choix sur deux');
  assert.equal((await advance(state, [ids[2], ids[3], ids[0]])).status, 409, 'Choix superflu hors égalité');
  state = await advance(state, [ids[4], ids[2]]);
  assert.deepEqual(current(state).entries.map((e) => [e.duel, e.proposal_id]),
    [[1, ids[0]], [1, ids[4]], [2, ids[1]], [2, ids[2]]], 'Les choisis gardent leur ordre de classement');
  assert.equal(state.stages[1].tie_break_applied, true);
  // Demi-finales : duel 1 à égalité, duel 2 net.
  state = await score(state, [ids[0], ids[4], ids[1]], [1, 1, 1], 'tie-3');
  assert.equal((await advance(state)).status, 409);
  state = await advance(state, [ids[4]]);
  assert.deepEqual(current(state).entries.map((e) => e.proposal_id), [ids[4], ids[1]]);
  // Finale à égalité, départagée par l'ancienne commande de clôture.
  state = await score(state, [ids[4], ids[1]], [2, 2], 'tie-4');
  assert.equal((await call('close', { winnerProposalId: ids[0] }, state.campaign.id)).status, 409);
  state = await call('close', { winnerProposalId: ids[1] }, state.campaign.id);
  assert.equal(state.winner?.id, ids[1]); assert.equal(state.election.tie_break_applied, true);
});
test('the shared preview agrees with the database on random stages', async () => {
  let seed = 7;
  const random = (n: number) => { seed = (seed * 1103515245 + 12345) % 2 ** 31; return seed % n; };
  for (let round = 0; round < 12; round++) {
    let state = await election(['R1', 'R2', 'R3', 'R4', 'R5', 'R6'].slice(0, 2 + random(5)));
    for (let step = 0; step < 6 && state.election.phase === 'voting'; step++) {
      const stage = current(state);
      const ids = stage.entries.map((e) => e.proposal_id);
      state = await score(state, ids, ids.map(() => random(3)), `random-${round}-${step}`);
      const open = current(state);
      const plan = planAdvance(open);
      const picks = plan.ties.flatMap((tie) => tie.among.slice(-tie.need));
      const result = await advance(state, picks);
      if (plan.empty) { assert.equal(result.status, 400); state = await score(state, [ids[0]], [1], `random-${round}-${step}-b`); continue; }
      const resolved = planAdvance(open, picks);
      assert.ok(resolved.ready);
      assert.ok(!result.error, result.error);
      state = result;
      if (plan.next === 'done') {
        assert.equal(state.winner?.id, resolved.podium[0]);
      } else {
        assert.equal(current(state).kind, plan.next);
        assert.deepEqual(current(state).entries.map((e) => e.proposal_id).sort(), [...resolved.qualified].sort());
        assert.deepEqual(state.stages.at(-2)!.entries.filter((e) => e.result === 'advanced').length, resolved.qualified.length);
      }
    }
  }
});
test('no winner can be declared with zero votes or before voting starts', async () => {
  const empty = await fresh(); assert.equal((await call('close', {}, empty.campaign.id)).status, 409);
  const state = await election(); assert.equal((await call('close', {}, state.campaign.id)).status, 400);
  assert.equal((await call('state')).election.phase, 'voting');
});
test('stale tie-break choices are rejected when rankings change', async () => {
  let state = await election(); await vote(state, 'A'); await vote(state, 'B', state.proposals[1].id);
  // Deux noms à égalité au premier tour : les deux vont en finale, aucun départage n'est attendu.
  assert.equal((await call('close', { winnerProposalId: state.proposals[1].id }, state.campaign.id)).status, 409);
  state = await advance(state);
  await ballot(state, 'A', [state.proposals[0].id]); state = await ballot(state, 'B', [state.proposals[1].id]);
  const [first, second] = current(state).entries.map((e) => e.proposal_id);
  assert.equal((await advance(state)).status, 409);
  await ballot(state, 'C', [first]);
  assert.equal((await advance(state, [second])).status, 409, 'Le départage préparé avant la dernière voix est refusé');
  assert.equal((await advance(state)).winner?.id, first);
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
test('player card: creation bound to an account, then modification of one own card', async () => {
  const state = await election(); await vote(state, 'A'); await call('close', {}, state.campaign.id);
  const sam = await account();
  const created = await call('player', { ...card, accountId: sam }, state.campaign.id);
  const player = created.players[0];
  assert.equal(player.pseudo, ' Sam '); assert.equal(player.in_game_name, 'SAMUEL'); assert.equal(player.kit_number, 9);
  assert.deepEqual(player.secondary_positions, ['AG']); assert.equal(player.preferred_foot, 'Gauche');
  assert.equal(player.height_cm, 189); assert.equal(player.archetype, 'target');
  assert.equal(player.weak_foot, 3); assert.equal(player.skill_moves, 2);

  // Un second envoi du même compte modifie sa fiche au lieu d'en créer une seconde.
  const renamed = await call('player', { ...card, accountId: sam, pseudo: 'Sam', kitName: 'SAM' }, state.campaign.id);
  assert.equal(renamed.players.length, 1, 'un compte ne peut avoir qu une fiche par campagne');
  assert.equal(renamed.players[0].in_game_name, 'SAM');

  // Un autre compte crée bien une seconde fiche, avec un autre pseudo et un autre numéro.
  const alex = await account();
  assert.equal((await call('player', { ...card, accountId: alex, pseudo: 'Alex', kitNumber: 10 }, state.campaign.id)).players.length, 2);

  const updated = await call('player', { ...card, accountId: sam, primaryPosition: 'G', secondaryPosition: undefined,
    archetype: 'sweeper-keeper', notes: '' }, state.campaign.id);
  // Le pseudo d une fiche existante n est pas modifie par une mise a jour : il reste celui de la creation.
  const mine = updated.players.find((p) => p.pseudo === card.pseudo)!;
  assert.ok(mine, 'la fiche du compte doit rester retrouvable par son pseudo d origine');
  assert.equal(mine.primary_position, 'G'); assert.deepEqual(mine.secondary_positions, []);
  assert.equal(mine.notes, null);
});

test('ecrire une fiche sans compte, ou avec un compte inconnu, est refuse', async () => {
  const state = await fresh();
  const sansCompte = await call('player', card, state.campaign.id);
  assert.equal(sansCompte.status, 401);
  const inconnu = await call('player', { ...card, accountId: 999_999 }, state.campaign.id);
  assert.equal(inconnu.status, 401);
  assert.equal((await call('state', {}, state.campaign.id)).players.length, 0, 'aucune fiche ne doit avoir ete ecrite');
});

test('un compte ne peut pas prendre le pseudo deja utilise par un autre', async () => {
  const state = await fresh();
  await call('player', { ...card, accountId: await account() }, state.campaign.id);
  const voleur = await call('player', { ...card, accountId: await account(), kitNumber: 11 }, state.campaign.id);
  assert.equal(voleur.status, 409);
  assert.match(voleur.error!, /pseudo/i);
});
test('kit numbers are unique per campaign; keeping your own number on edit is allowed', async () => {
  const state = await fresh();
  const sam = await account();
  await call('player', { ...card, accountId: sam }, state.campaign.id);
  const taken = await call('player', { ...card, accountId: await account(), pseudo: 'Alex', kitName: 'ALEX' }, state.campaign.id);
  assert.equal(taken.status, 409); assert.equal(taken.error, 'Le numéro 9 est déjà porté par SAMUEL.');
  // Garder son propre numéro en modifiant sa fiche reste permis.
  assert.equal((await call('player', { ...card, accountId: sam, weightKg: 85 }, state.campaign.id)).players[0].weight_kg, 85);
  await assert.rejects(db.query("insert into fc27_player_profiles(campaign_id, pseudo, primary_position, kit_number) values ($1, 'Race', 'MC', 9)", [state.campaign.id]));
  const other = await fresh();
  assert.equal((await call('player', { ...card, accountId: sam }, other.campaign.id)).players[0].kit_number, 9, 'Une nouvelle campagne libère les numéros.');
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
    assert.equal((await call('player', { ...card, accountId: await account(), archetype }, state.campaign.id)).status, 400);
  }
  for (const position of POSITION_CODES) {
    for (const archetype of ARCHETYPES) {
      const pseudo = position + '/' + archetype.id;
      const insert = () => db.query('insert into fc27_player_profiles(campaign_id, pseudo, primary_position, archetype) values ($1, $2, $3, $4)', [state.campaign.id, pseudo, position, archetype.id]);
      if (archetype.line === LINE_OF_POSITION[position]) await insert();
      else await assert.rejects(insert());
    }
  }
  const created = await call('player', { ...card, accountId: await account(), archetype: 'spark' }, state.campaign.id);
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
  // L'identité ne peut pas venir du client : un accountId ou un pseudo envoyés sont ignorés.
  const injected = fc27ActionSchema.safeParse({ action: 'propose', campaignId: 1, name: 'A', accountId: 42, pseudo: 'Quelqu un' });
  assert.equal(injected.success, true);
  assert.deepEqual(Object.keys(injected.data!).sort(), ['action', 'campaignId', 'name']);
  const votePayload = fc27ActionSchema.safeParse({ action: 'vote', campaignId: 1, proposalId: 1, accountId: 42 });
  assert.deepEqual(Object.keys(votePayload.data!).sort(), ['action', 'campaignId', 'proposalId']);
});
test('HTTP validates requests and returns no-store live state', async () => {
  const handlers = createFC27Handlers(createFC27Service(async (name, payload, campaign) => {
    const result = await db.query<{ data: unknown }>('select fc27_dispatch($1,$2::jsonb,$3::integer) as data', [name, payload, campaign]); return result.rows[0].data;
  }), isAdmin);
  const url = 'http://localhost/api/fc27';
  const response = await handlers.GET(new Request(url)); assert.equal(response.status, 200); assert.equal(response.headers.get('cache-control'), 'no-store');
  assert.equal((await handlers.GET(new Request(`${url}?campaign=abc`))).status, 400);
  assert.equal((await handlers.GET(new Request(`${url}?campaign=2147483648`))).status, 400);
  const cookie = `dommage_session=${createToken(await account())}`;
  assert.equal((await handlers.POST(new Request(url, { method: 'POST', headers: { cookie }, body: '{bad' }))).status, 400);
});

test('toutes les écritures exigent un compte existant, y compris les réglages', async () => {
  const state = await fresh();
  for (const action of ['propose', 'vote', 'player', 'start', 'close', 'archive', 'reset']) {
    for (const accountId of [null, 999999]) {
      assert.equal((await call(action, { accountId }, state.campaign.id)).status, 401, action);
    }
  }
  assert.equal((await call('state')).campaign.id, state.campaign.id);
});

test('HTTP réserve les quatre commandes de gestion à l’identifiant Discord administrateur', async () => {
  let state = await fresh();
  const admin = await account();
  const member = await account();
  await db.query('update club_accounts set discord_id = $1, username = $2 where id = $3', ['777000000000000001', 'saucegod.', admin]);
  await db.query('update club_accounts set username = $1, display_name = $1 where id = $2', ['saucegod.', member]);
  let executions = 0;
  const handlers = createFC27Handlers(createFC27Service(async (name, payload, campaign) => {
    executions += 1;
    const result = await db.query<{ data: unknown }>('select fc27_dispatch($1,$2::jsonb,$3::integer) as data', [name, payload, campaign]);
    return result.rows[0].data;
  }), isAdmin);
  const post = (accountId: number, action: string, extra: object = {}) => handlers.POST(new Request('http://localhost/api/fc27', {
    method: 'POST', headers: { cookie: `dommage_session=${createToken(accountId)}`, origin: 'http://localhost' },
    body: JSON.stringify({ action, campaignId: state.campaign.id, ...extra }),
  }));
  for (const action of ['start', 'close', 'archive', 'reset']) {
    for (const id of [member, 999999]) {
      assert.equal((await post(id, action, { accountId: admin, isAdmin: true, discordId: '777000000000000001' })).status, 403);
    }
  }
  assert.equal(executions, 0, 'Aucune commande non autorisée ne doit atteindre le service.');
  const adminIds = process.env.DISCORD_ADMIN_IDS;
  try {
    process.env.DISCORD_ADMIN_IDS = '';
    assert.equal((await post(admin, 'reset')).status, 403, 'Sans configuration, aucun administrateur implicite.');
    process.env.DISCORD_ADMIN_IDS = 'saucegod.,not-a-discord-id';
    assert.equal((await post(admin, 'reset')).status, 403);
  } finally { process.env.DISCORD_ADMIN_IDS = adminIds; }
  // Renaming the real administrator must not remove their permission.
  await db.query('update club_accounts set username = $1 where id = $2', ['nouveau-pseudo', admin]);
  const reset = await post(admin, 'reset');
  assert.equal(reset.status, 200);
  state = await reset.json();
  const proposal = await post(member, 'propose', { name: 'Le choix du collectif' });
  assert.equal(proposal.status, 200, 'Les membres peuvent toujours proposer.');
  state = await proposal.json();
  assert.equal((await post(admin, 'start')).status, 200);
  assert.equal((await post(member, 'vote', { proposalId: state.proposals[0].id })).status, 200, 'Les membres peuvent toujours voter.');
  assert.equal((await post(admin, 'close')).status, 200);
  const archived = await post(admin, 'archive');
  assert.equal(archived.status, 200);
  assert.equal((await archived.json()).campaign.status, 'archived');
});

test('HTTP refuse les invités et les origines étrangères, et ignore une identité injectée', async () => {
  const state = await fresh();
  const owner = await account();
  const stranger = await account();
  const handlers = createFC27Handlers(createFC27Service(async (name, payload, campaign) => {
    const result = await db.query<{ data: unknown }>('select fc27_dispatch($1,$2::jsonb,$3::integer) as data', [name, payload, campaign]);
    return result.rows[0].data;
  }), isAdmin);
  const url = 'http://localhost/api/fc27';
  const body = JSON.stringify({ action: 'propose', campaignId: state.campaign.id, name: 'Identité vérifiée', accountId: stranger });
  for (const cookie of ['', 'dommage_session=faux', `dommage_session=${createToken(owner, 0)}`]) {
    assert.equal((await handlers.POST(new Request(url, { method: 'POST', headers: { cookie }, body }))).status, 401);
  }
  const cookie = `dommage_session=${createToken(owner)}`;
  assert.equal((await handlers.POST(new Request(url, { method: 'POST', headers: { cookie, origin: 'https://ailleurs.fr' }, body }))).status, 403);
  const response = await handlers.POST(new Request(url, { method: 'POST', headers: { cookie, origin: 'http://localhost' }, body }));
  assert.equal(response.status, 200);
  assert.equal((await response.json()).proposals[0].author_account_id, owner);
});

test('propositions simultanées et changement de nom Discord ne contournent pas les limites', async () => {
  const state = await fresh();
  const id = await account();
  await db.query('update club_accounts set display_name = $1 where id = $2', ['a'.repeat(60), id]);
  const results = await Promise.all(['Un', 'Deux', 'Trois', 'Quatre'].map(name => call('propose', { name, accountId: id }, state.campaign.id)));
  assert.equal(results.filter(r => !r.error).length, 3);
  const started = await call('start', {}, state.campaign.id);
  assert.equal(started.proposals[0].author_pseudo.length, 40);
  assert.ok(!(await call('vote', { proposalId: started.proposals[0].id, accountId: id }, state.campaign.id)).error);
  await db.query('update club_accounts set display_name = $1 where id = $2', ['Nouveau nom', id]);
  // Revoter après un changement de nom remplace le bulletin au lieu d'en ajouter un.
  const again = await call('vote', { proposalIds: [started.proposals[1].id], accountId: id }, state.campaign.id);
  assert.deepEqual(again.proposals.map((p) => p.votes), [0, 1, 0]);
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
    // Les anciens bulletins sont conservés, mais voter exige désormais un compte.
    assert.equal((await call('vote', { proposalId: state.proposals[0].id, pseudo: 'A' }, state.campaign.id, legacy)).status, 401);
    const recent = await vote(converted, 'nouveau votant', state.proposals[2].id, legacy);
    assert.ok(!recent.error, `un compte doit pouvoir voter apres migration : ${recent.error}`);
    assert.deepEqual(recent.proposals.map((p) => p.votes), [1, 1, 1], 'les anciennes voix restent comptees');
    assert.equal((await legacy.query<{ count: number }>('select count(*)::int as count from fc27_votes')).rows[0].count, 2);
  } finally { await legacy.close(); }
});

test('proposer un nom exige un compte, et trois propositions au maximum', async () => {
  const state = await fresh();
  assert.equal((await call('propose', { name: 'Anonyme FC' }, state.campaign.id)).status, 401);
  assert.equal((await call('propose', { name: 'Fantome FC', accountId: 999_999 }, state.campaign.id)).status, 401);

  const moi = await account();
  for (const name of ['Un', 'Deux', 'Trois']) {
    const r = await call('propose', { name, accountId: moi }, state.campaign.id);
    assert.ok(!r.error, `« ${name} » aurait dû passer : ${r.error}`);
  }
  const quatrieme = await call('propose', { name: 'Quatre', accountId: moi }, state.campaign.id);
  assert.equal(quatrieme.status, 409);
  assert.match(quatrieme.error!, /trois noms/i);

  // Un autre compte repart de zéro.
  const autre = await account();
  assert.ok(!(await call('propose', { name: 'Ailleurs FC', accountId: autre }, state.campaign.id)).error);

  // L'auteur affiché vient du compte, pas d'une saisie.
  const after = await call('state', {}, state.campaign.id);
  const mine = after.proposals.filter((p) => p.author_account_id === moi);
  assert.equal(mine.length, 3);
  assert.ok(mine.every((p) => /^joueur\d+$/.test(p.author_pseudo)), 'le pseudo affiché doit venir du compte');
});

test('un bulletin par compte, modifiable, quel que soit le pseudo', async () => {
  const state = await fresh();
  const moi = await account();
  await call('propose', { name: 'Alpha', accountId: moi }, state.campaign.id);
  await call('propose', { name: 'Bravo', accountId: moi }, state.campaign.id);
  const started = await call('start', {}, state.campaign.id);
  const [alpha, bravo] = started.proposals;

  assert.equal((await call('vote', { proposalId: alpha.id }, state.campaign.id)).status, 401);
  assert.ok(!(await call('vote', { proposalId: alpha.id, accountId: moi }, state.campaign.id)).error);
  // Revoter déplace la voix au lieu de l'ajouter : l'identité est le compte.
  const encore = await call('vote', { proposalId: bravo.id, accountId: moi }, state.campaign.id);
  assert.deepEqual(encore.proposals.map((p) => p.votes), [0, 1]);

  const autre = await account();
  assert.ok(!(await call('vote', { proposalId: bravo.id, accountId: autre }, state.campaign.id)).error);
  const final = await call('state', {}, state.campaign.id);
  assert.equal(final.proposals.reduce((sum, p) => sum + p.votes, 0), 2, 'deux comptes, deux voix');
});

test('deux comptes au même nom affiché votent chacun leur tour', async () => {
  // L'ancienne contrainte portait sur le pseudo : deux homonymes se bloquaient.
  const state = await fresh();
  const a = await account();
  const b = await account();
  await db.query('update club_accounts set display_name = $1 where id in ($2, $3)', ['Homonyme', a, b]);
  await call('propose', { name: 'Cible', accountId: a }, state.campaign.id);
  const started = await call('start', {}, state.campaign.id);
  const cible = started.proposals[0].id;
  assert.ok(!(await call('vote', { proposalId: cible, accountId: a }, state.campaign.id)).error);
  assert.ok(!(await call('vote', { proposalId: cible, accountId: b }, state.campaign.id)).error);
  assert.equal((await call('state', {}, state.campaign.id)).proposals[0].votes, 2);
});
