import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildMatchDebriefPrompt,
  matchDebriefSchema,
  sanitizeMatchDebrief,
  type MatchDebrief,
} from '../shared/match-debrief.js';
import type { Match, MatchNote, Member } from '../shared/types.js';
import { createMatchDebriefHandler, debriefInputHash, type DebriefCache } from '../server/match-debrief-http.js';

const mockMatch: Match = {
  id: 42,
  playedAt: '2026-09-20T21:00:00.000Z',
  type: 'league',
  opponent: 'Les Galactiques',
  goalsFor: 3,
  goalsAgainst: 1,
  result: 'win',
  possessionPct: 58,
  shots: 11,
};

const mockMembers: Member[] = [
  { id: 1, gamertag: 'Kylian93', position: 'BU', ovr: 88, matchesPlayed: 20, goals: 15, assists: 6, avgRating: 8.2, passPct: 81 },
  { id: 2, gamertag: 'Zizou_10', position: 'MOC', ovr: 89, matchesPlayed: 20, goals: 5, assists: 14, avgRating: 8.5, passPct: 89 },
];

const mockNotes: MatchNote[] = [
  {
    id: 10,
    matchId: 42,
    authorName: 'Capitaine',
    body: 'Grosse masterclass de Kylian93 en pointe !',
    motm: { id: 1, gamertag: 'Kylian93' },
    videoUrl: null,
    tags: ['But de la semaine'],
    createdAt: '2026-09-20T21:30:00.000Z',
  },
];

test('buildMatchDebriefPrompt intègre les stats du match, les notes et l’effectif', () => {
  const prompt = buildMatchDebriefPrompt(mockMatch, mockMembers, mockNotes);
  assert.match(prompt, /Les Galactiques/);
  assert.match(prompt, /58%/);
  assert.match(prompt, /11/);
  assert.match(prompt, /Kylian93/);
  assert.match(prompt, /Grosse masterclass/);
});

test('matchDebriefSchema valide un débrief conforme', () => {
  const sample: MatchDebrief = {
    headline: 'Victoire éclatante face aux Galactiques',
    summary: 'Avec 58% de possession et 11 tirs, Dommage FC a dicté son rythme du début à la fin.',
    advice: 'Garder cette même rigueur dans les transitions défensives.',
    suggestedNote: 'Match maîtrisé de bout en bout, efficacité maximale devant le but adverse.',
    suggestedTags: ['But de la semaine'],
    suggestedMotm: 'Kylian93',
  };

  const result = matchDebriefSchema.safeParse(sample);
  assert.equal(result.success, true);
});

test('sanitizeMatchDebrief filtre les tags inconnus et réconcilie le MOTM', () => {
  const rawData: MatchDebrief = {
    headline: 'Braquage réussi',
    summary: 'Une belle victoire 3-1 sans contestation.',
    advice: 'Continuer ainsi.',
    suggestedNote: 'Belle perf collective.',
    // @ts-expect-error test tag invalide
    suggestedTags: ['TagInconnu', 'Clean sheet'],
    suggestedMotm: 'kylian93',
  };

  const sanitized = sanitizeMatchDebrief(rawData, mockMembers);
  assert.deepEqual(sanitized.suggestedTags, ['Clean sheet']);
  assert.equal(sanitized.suggestedMotm, 'Kylian93'); // Re-mappé sur la casse exacte du joueur
});

/** Cache en mémoire, indexé comme la table Neon. */
function memoryCache(): DebriefCache & { rows: Map<string, { payload: unknown; model: string }> } {
  const rows = new Map<string, { payload: unknown; model: string }>();
  return {
    rows,
    read: async (id, hash) => rows.get(`${id}:${hash}`),
    write: async (id, hash, debrief, model) => { rows.set(`${id}:${hash}`, { payload: debrief, model }); },
  };
}

const load = async () => ({ match: mockMatch, notes: mockNotes, members: mockMembers });
const url = 'http://localhost/api/matches/42/debrief';

const redige: MatchDebrief = {
  headline: 'Victoire éclatante face aux Galactiques',
  summary: 'Avec 58% de possession et 11 tirs, Dommage FC a dicté son rythme du début à la fin.',
  advice: 'Garder cette même rigueur dans les transitions défensives.',
  suggestedNote: 'Match maîtrisé de bout en bout, efficacité maximale devant le but adverse.',
  suggestedTags: ['But de la semaine'],
  suggestedMotm: 'Kylian93',
};

test('createMatchDebriefHandler retourne available: false si MISTRAL_API_KEY est absente', async () => {
  const handler = createMatchDebriefHandler(memoryCache(), {
    hasKey: () => false,
    load,
  });

  const request = new Request('http://localhost/api/matches/42/debrief');
  const response = await handler.GET(request);
  const json = await response.json();

  assert.equal(response.status, 200);
  assert.equal(json.available, false);
  assert.equal(json.reason, 'not-configured');
});

test('sans compte ni débrief existant : invitation à se connecter, aucun appel facturé', async () => {
  let generations = 0;
  const handler = createMatchDebriefHandler(memoryCache(), {
    hasKey: () => true, load, session: () => null,
    generate: async () => { generations += 1; return { debrief: redige, model: 'm' }; },
  });
  const json = await (await handler.GET(new Request(url))).json();
  assert.deepEqual(json, { available: false, reason: 'sign-in' });
  assert.equal(generations, 0);
});

test('un débrief rédigé une fois est resservi à tous, sans nouvel appel', async () => {
  let generations = 0;
  const cache = memoryCache();
  const options = {
    hasKey: () => true, load,
    generate: async () => { generations += 1; return { debrief: redige, model: 'test-model' }; },
  };
  const connecte = createMatchDebriefHandler(cache, { ...options, session: () => 7 });
  const visiteur = createMatchDebriefHandler(cache, { ...options, session: () => null });

  const premier = await (await connecte.GET(new Request(url))).json();
  assert.equal(premier.available, true);
  assert.equal(generations, 1);
  assert.equal(cache.rows.size, 1);

  // Rechargement par le même compte, puis visite anonyme : le cache répond aux deux.
  await connecte.GET(new Request(url));
  const anonyme = await (await visiteur.GET(new Request(url))).json();
  assert.equal(anonyme.available, true);
  assert.equal(anonyme.debrief.headline, redige.headline);
  assert.equal(generations, 1, 'un seul appel facturé pour tout le monde');
});

test('une note ajoutée change l’empreinte, un rechargement non', () => {
  const avant = debriefInputHash(mockMatch, mockNotes);
  assert.equal(debriefInputHash(mockMatch, [...mockNotes]), avant);
  const ajout: MatchNote = { ...mockNotes[0], id: 11, body: 'Défense solide en fin de match.' };
  assert.notEqual(debriefInputHash(mockMatch, [...mockNotes, ajout]), avant);
});

test('une ligne de cache illisible est ignorée, pas servie', async () => {
  const cache = memoryCache();
  cache.rows.set(`42:${debriefInputHash(mockMatch, mockNotes)}`, { payload: { headline: 'x' }, model: 'ancien' });
  const handler = createMatchDebriefHandler(cache, { hasKey: () => true, load, session: () => null });
  const json = await (await handler.GET(new Request(url))).json();
  assert.equal(json.available, false);
});
