import assert from 'node:assert/strict';
import { before, test } from 'node:test';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import type { ProClubsClient } from 'proclubs-sdk';
import { levelDivision, matchFeat, opponentStrength } from '../shared/skill-rating.js';
import { setDbForTests } from '../server/db/client.js';
import * as schema from '../server/db/schema.js';
import { rateOpponents } from '../server/ea-sync.js';
import { fetchClub, fetchMatchDetail, fetchMatches } from '../server/db/queries.js';

// Niveau des adversaires : lecture des fiches EA à la synchro, puis ce qu'en voient les pages.
const pg = new PGlite();
const hoursAgo = (h: number) => new Date(Date.now() - h * 3_600_000);

/** Match EA brut minimal : nos joueurs (club 1) et les leurs, avec leur temps de jeu. */
const raw = (opponentId: string, color: number, seconds: Record<string, number>) => ({
  clubs: { 1: { goals: '2' }, [opponentId]: { details: { name: 'Eux', customKit: { kitColor1: String(color) } } } },
  players: {
    1: { a: { playername: 'Rina', pos: 'forward', rating: '8', secondsPlayed: '5400' } },
    [opponentId]: Object.fromEntries(Object.entries(seconds).map(([name, s], i) =>
      [i, { playername: name, pos: 'midfielder', rating: String(7 - i), secondsPlayed: String(s) }])),
  },
});

async function match(eaId: string, opponent: string, opponentId: string | null, playedAt: Date, goals: [number, number], eaRaw: object | null = null) {
  const result = goals[0] > goals[1] ? 'win' : goals[0] < goals[1] ? 'loss' : 'draw';
  return (await pg.query<{ id: number }>(`insert into matches(club_id, ea_match_id, played_at, match_type, opponent_name, opponent_ea_club_id,
    goals_for, goals_against, result, ea_raw) values (1, $1, $2, 'league', $3, $4, $5, $6, $7, $8::jsonb) returning id`,
  [eaId, playedAt.toISOString(), opponent, opponentId, goals[0], goals[1], result, eaRaw && JSON.stringify(eaRaw)])).rows[0].id;
}

const sheets: Record<string, object | null> = {
  '100': { skillRating: '1722', wins: '30', ties: '4', losses: '10', gamesPlayed: '44', goals: '120', goalsAgainst: '80', wstreak: '3', unbeatenstreak: '5', bestDivision: '3' },
  '200': { skillRating: '1271', wins: '5', ties: '1', losses: '20', gamesPlayed: '26' },
  '300': null, // club introuvable chez EA
};
const ea = { clubs: { overallStats: async ({ clubId }: { clubId: string }) => {
  if (clubId === '400') throw new Error('EA hors service');
  return sheets[clubId];
} } } as unknown as Pick<ProClubsClient, 'clubs'>;

let fresh: number, rematch: number, old: number, ghost: number, down: number;

before(async () => {
  const journal = JSON.parse(await readFile(new URL('../drizzle/meta/_journal.json', import.meta.url), 'utf8'));
  for (const entry of journal.entries) await pg.exec(await readFile(new URL(`../drizzle/${entry.tag}.sql`, import.meta.url), 'utf8'));
  setDbForTests(drizzle({ client: pg, schema }));
  await pg.exec("insert into clubs(name, region, reputation, skill_rating) values ('FoodBall Club', 'EU', 'Test', 1658)");
  // Notre SR avant le match frais : 1640 (relevé d'il y a 5 h), puis 1658 après.
  await pg.query('insert into club_rating_snapshots(club_id, skill_rating, taken_at) values (1, 1640, $1), (1, 1658, $2)',
    [hoursAgo(5).toISOString(), hoursAgo(0.5).toISOString()]);
  fresh = await match('m1', 'LaEsquina', '100', hoursAgo(1), [3, 0], raw('100', 0xff3300, { Gros: 5400, Partant: 1800 }));
  rematch = await match('m2', 'LaEsquina', '100', hoursAgo(48), [1, 2]);
  old = await match('m3', 'Beauvais', '200', hoursAgo(72), [0, 1], raw('200', 0x0a0a0a, { Seul: 5400 }));
  ghost = await match('m4', 'Fantôme', '300', hoursAgo(80), [2, 2]);
  down = await match('m5', 'Panne FC', '400', hoursAgo(90), [4, 1]);
  await rateOpponents(ea, 1, 1658);
});

test('repères de niveau et comparaison avec un adversaire', () => {
  assert.equal(levelDivision(1658), 3); // niveau Division 2
  assert.equal(levelDivision(1300), null);
  assert.equal(levelDivision(2400), 1);
  assert.equal(opponentStrength(1658, 1709), 'stronger');
  assert.equal(opponentStrength(1658, 1708), 'even');
  assert.equal(opponentStrength(1658, 1607), 'weaker');
  assert.equal(opponentStrength(null, 1700), null);
  assert.equal(matchFeat({ result: 'win', ourSkillRating: 1658, opponentSkillRating: 1709 }), 'exploit');
  assert.equal(matchFeat({ result: 'win', ourSkillRating: 1658, opponentSkillRating: 1708 }), null);
  assert.equal(matchFeat({ result: 'loss', ourSkillRating: 1658, opponentSkillRating: 1558 }), 'upset');
  assert.equal(matchFeat({ result: 'loss', ourSkillRating: 1658, opponentSkillRating: 1559 }), null);
});

test('la synchro fige le SR adverse et le nôtre sur chaque match', async () => {
  const list = await fetchMatches(10);
  const byId = new Map(list.map((m) => [m.id, m]));
  assert.deepEqual([byId.get(fresh)!.opponentSkillRating, byId.get(fresh)!.ourSkillRating, byId.get(fresh)!.opponentSrEstimated], [1722, 1640, false]);
  // Lus deux jours plus tard : SR du jour, marqué estimé. Notre SR : le relevé le plus proche avant le match, à défaut l'actuel.
  assert.deepEqual([byId.get(rematch)!.opponentSkillRating, byId.get(rematch)!.ourSkillRating, byId.get(rematch)!.opponentSrEstimated], [1722, 1658, true]);
  assert.equal(byId.get(old)!.opponentSkillRating, 1271);
  // Club introuvable : lu, sans SR. Panne EA : à relire au prochain passage.
  assert.equal(byId.get(ghost)!.opponentSkillRating, null);
  const checked = await pg.query<{ id: number; checked: boolean }>('select id, opponent_checked_at is not null as checked from matches order by id');
  assert.deepEqual(checked.rows.map((r) => r.checked), [true, true, true, true, false]);
  assert.equal(down, checked.rows[4].id);
});

test('le club voit la moyenne et son bilan selon le niveau adverse', async () => {
  const { opponents } = await fetchClub();
  assert.equal(opponents.sample, 3);
  assert.equal(opponents.averageSr, Math.round((1722 + 1722 + 1271) / 3));
  assert.deepEqual(opponents.record, {
    stronger: { wins: 1, draws: 0, losses: 1 },
    even: { wins: 0, draws: 0, losses: 0 },
    weaker: { wins: 0, draws: 0, losses: 1 },
  });
});

test('la fiche match montre la fiche adverse, les confrontations et les départs anticipés', async () => {
  const detail = await fetchMatchDetail(fresh);
  assert.equal(detail.opponentClub?.skillRating, 1722);
  assert.deepEqual([detail.opponentClub?.wins, detail.opponentClub?.draws, detail.opponentClub?.losses, detail.opponentClub?.bestDivision], [30, 4, 10, 3]);
  assert.deepEqual(detail.headToHead.map((m) => m.id), [fresh, rematch]);
  assert.equal(detail.opponent?.kitColor, '#ff3300');
  assert.deepEqual(detail.opponent?.players.map((p) => [p.gamertag, p.leftEarly ?? false]), [['Gros', false], ['Partant', true]]);
  // Maillot trop sombre pour le thème : le front garde sa couleur neutre.
  assert.equal((await fetchMatchDetail(old)).opponent?.kitColor, null);
  assert.equal((await fetchMatchDetail(ghost)).opponentClub, null);
});
