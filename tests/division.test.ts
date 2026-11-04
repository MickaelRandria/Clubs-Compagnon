import assert from 'node:assert/strict';
import { before, test } from 'node:test';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { promotionPaths, promotionTarget, replayDivision } from '../shared/division-progress.js';
import type { MatchResult } from '../shared/types.js';
import { setDbForTests } from '../server/db/client.js';
import * as schema from '../server/db/schema.js';
import { fetchDivision, postDivisionStart, recordSeason } from '../server/division.js';

// Progression en division : règles du club, puis détection des montées à la synchro et lecture /api/club.

const seq = (letters: string) => [...letters].map((c, i) => ({ id: i + 1, result: ({ V: 'win', N: 'draw', D: 'loss' } as const)[c as 'V' | 'N' | 'D'] as MatchResult }));

test('points et chances : 3 défaites au total, une victoire ne rend rien', () => {
  const r = replayDivision(seq('VDVDN'), 21);
  assert.deepEqual([r.points, r.chances, r.relegationMatchNext], [7, 1, false]);
  assert.deepEqual(r.record, { wins: 2, draws: 1, losses: 2 });
  const zero = replayDivision(seq('DVD D'.replace(' ', '')), 21);
  assert.deepEqual([zero.chances, zero.relegationMatchNext], [0, true]);
});

test('match de relégation : tenu, les 3 chances reviennent ; perdu, c\'est la descente', () => {
  const kept = replayDivision(seq('DDDN'), 21);
  assert.equal(kept.steps[3].relegationMatch, true);
  assert.deepEqual([kept.chances, kept.relegatedAfter], [3, null]);
  const lost = replayDivision(seq('DDDD'), 21);
  assert.equal(lost.relegatedAfter, 4);
});

test('la montée tombe au match qui atteint le seuil', () => {
  const r = replayDivision(seq('VVVVVNNNV'), 16);
  assert.equal(r.promotedAfter, 6); // 5 V = 15, le nul suivant fait 16
});

test('seuil : règles du club, recalées par une montée observée', () => {
  assert.deepEqual(promotionTarget(4), { points: 21, source: 'rules' });
  assert.deepEqual(promotionTarget(2), { points: 16, source: 'rules' });
  assert.deepEqual(promotionTarget(4, [22]), { points: 21, source: 'observed' }); // 19 → 22 en une victoire : cohérent
  assert.deepEqual(promotionTarget(4, [18]), { points: 18, source: 'observed' }); // monté avant 21 : le seuil est plus bas
});

test('chemins vers la montée', () => {
  assert.deepEqual(promotionPaths(6, 2).map((p) => p.results.join(',')), ['win,win', 'win,draw,draw,draw', 'win,loss,win']);
  assert.deepEqual(promotionPaths(5, 1).map((p) => p.results.join(',')), ['win,win', 'win,draw,draw']);
  assert.deepEqual(promotionPaths(0, 3), []);
});

const pg = new PGlite();
const minutesAgo = (m: number) => new Date(Date.now() - m * 60_000);
let n = 0;
async function match(result: MatchResult, playedAt: Date) {
  const goals = result === 'win' ? [2, 0] : result === 'draw' ? [1, 1] : [0, 1];
  return (await pg.query<{ id: number }>(`insert into matches(club_id, ea_match_id, played_at, match_type, opponent_name, goals_for, goals_against, result)
    values (1, $1, $2, 'league', $3, $4, $5, $6) returning id`, [`m${++n}`, playedAt.toISOString(), `Club ${n}`, goals[0], goals[1], result])).rows[0].id;
}
/** Date le dernier relevé de saison : en vrai, un relevé suit toujours les matchs qu'il compte. */
const stamp = (minutes: number) => pg.query(`update club_season_snapshots set taken_at = $1 where id = (select max(id) from club_season_snapshots)`,
  [minutesAgo(minutes).toISOString()]);
const season = (division: number, gamesPlayed: number, promotions: number) =>
  ({ currentDivision: String(division), gamesPlayed: String(gamesPlayed), wins: '0', ties: '0', losses: '0', promotions: String(promotions), relegations: '0' });

before(async () => {
  const journal = JSON.parse(await readFile(new URL('../drizzle/meta/_journal.json', import.meta.url), 'utf8'));
  for (const entry of journal.entries) await pg.exec(await readFile(new URL(`../drizzle/${entry.tag}.sql`, import.meta.url), 'utf8'));
  setDbForTests(drizzle({ client: pg, schema }));
  await pg.exec("insert into clubs(name, region, reputation, skill_rating) values ('FoodBall Club', 'EU', 'Test', 1658)");
});

test('sans point de départ, la division est en calibrage', async () => {
  await match('win', minutesAgo(300));
  await recordSeason(1, season(4, 10, 2));
  await stamp(250);
  const { progress } = await fetchDivision(1, { season: season(4, 10, 2) });
  assert.equal(progress?.status, 'calibrating');
  assert.equal(progress?.target, 21);
});

test('une montée détectée ouvre la division suivante, datée par son match décisif', async () => {
  const decisive = await match('win', minutesAgo(200));
  await recordSeason(1, season(3, 11, 3)); // un seul match entre les deux relevés : exact
  await stamp(150);
  const after = [await match('win', minutesAgo(100)), await match('loss', minutesAgo(80)), await match('draw', minutesAgo(60))];
  await recordSeason(1, season(3, 14, 3));
  await stamp(50);
  const { progress, divisionEvents } = await fetchDivision(1, { season: season(3, 14, 3) });
  assert.equal(divisionEvents[0].kind, 'promotion');
  assert.deepEqual([divisionEvents[0].fromDivision, divisionEvents[0].toDivision, divisionEvents[0].match?.id, divisionEvents[0].exact], [4, 3, decisive, true]);
  assert.equal(progress?.status, 'tracking');
  assert.deepEqual(progress?.steps.map((s) => s.matchId), after);
  assert.deepEqual([progress?.points, progress?.chances, progress?.missingMatches], [4, 2, 0]);
});

test('un match compté par EA mais absent de la base est signalé', async () => {
  await recordSeason(1, season(3, 16, 3)); // EA : 2 matchs de plus, la base n'en a reçu aucun
  const { progress } = await fetchDivision(1, { season: season(3, 16, 3) });
  assert.equal(progress?.missingMatches, 2);
});

test('le début de suivi est réservé aux admins connectés', async () => {
  await assert.rejects(postDivisionStart(new Request('http://x/api/club', { method: 'POST', body: '{"matchId":null}' })), { status: 401 });
});
