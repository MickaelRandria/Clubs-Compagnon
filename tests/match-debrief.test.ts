import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildMatchDebriefPrompt,
  matchDebriefSchema,
  matchFacts,
  plainText,
  sanitizeMatchDebrief,
  type MatchDebrief,
} from '../shared/match-debrief.js';
import type { Match, MatchDetail, MatchNote, MatchPlayer, Member } from '../shared/types.js';
import { createMatchDebriefHandler, debriefInputHash, type DebriefCache } from '../server/match-debrief-http.js';

const mockMatch: Match = {
  id: 42,
  playedAt: '2026-09-20T21:00:00.000Z',
  type: 'league',
  opponent: 'Les Galactiques',
  goalsFor: 3,
  goalsAgainst: 1,
  result: 'win',
  possessionPct: null,
  shots: 11,
  opponentQuit: false,
  opponentSkillRating: 1700,
  ourSkillRating: 1800,
  opponentSrEstimated: false,
};

const sheet = (gamertag: string, extra: Partial<MatchPlayer> = {}): MatchPlayer => ({
  gamertag, position: 'FW', rating: 7, goals: 0, assists: 0, shots: 2, passesMade: 10, passAttempts: 12,
  tacklesMade: 2, tackleAttempts: 4, saves: 0, redCards: 0, motm: false, ...extra,
});

const mockMembers: Member[] = [
  { id: 1, gamertag: 'Kylian93', position: 'FW', ovr: 88, matchesPlayed: 20, goals: 15, assists: 6, avgRating: 8.2, passPct: 81 },
  { id: 2, gamertag: 'Zizou_10', position: 'MF', ovr: 89, matchesPlayed: 20, goals: 5, assists: 14, avgRating: 8.5, passPct: 89 },
] as Member[];

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

const mockDetail: MatchDetail = {
  match: mockMatch,
  players: [sheet('Kylian93', { rating: 8.6, goals: 2, shots: 6 }), sheet('Zizou_10', { position: 'MF', rating: 7.9, goals: 1, assists: 2, motm: true })],
  notes: mockNotes,
  opponent: { players: [sheet('Rival_1', { goals: 1, shots: 5 }), sheet('Goal_X', { position: 'GK', saves: 4, shots: 0 })], minutes: 90, kitColor: null },
  opponentClub: null,
  headToHead: [mockMatch],
};

test('le prompt donne les feuilles de match et des faits sûrs, pas de quoi inventer', () => {
  const prompt = buildMatchDebriefPrompt(mockDetail, mockNotes);
  assert.match(prompt, /Les Galactiques/);
  assert.match(prompt, /Kylian93 \(attaquant\), note 8\.6, 2 buts/);
  assert.match(prompt, /Homme du match : Zizou_10, désigné par EA/);
  assert.match(prompt, /Leur gardien a repoussé 4 de nos tirs/);
  assert.match(prompt, /sans gardien humain/);
  assert.match(prompt, /Grosse masterclass/);
  assert.doesNotMatch(prompt, /Possession/);
});

test('faits : totaux, homme du match EA, tags prouvés', () => {
  const facts = matchFacts(mockDetail);
  assert.equal(facts.ours.goals, 3);
  assert.equal(facts.ours.passPct, 83);
  assert.deepEqual(facts.motm, { gamertag: 'Zizou_10', rating: 7.9, fromEa: true });
  assert.deepEqual(facts.factTags, []);
  assert.deepEqual(matchFacts({ ...mockDetail, match: { ...mockMatch, goalsAgainst: 0 } }).factTags, ['Clean sheet']);
});

test('texte brut : markdown, emojis et hashtags retirés', () => {
  assert.equal(plainText('**Festin de buts** à la cantine 🔥 #FoodBallDominance'), 'Festin de buts à la cantine');
  assert.equal(plainText('« Le réalisme avant la manière »'), 'Le réalisme avant la manière');
});

const draft = {
  headline: '**Le réalisme avant la manière !**',
  lede: 'Onze tirs, trois buts : le FoodBall Club a plié l’affaire sans trembler.',
  keys: [{ title: 'Efficacité :', text: '3 buts sur 11 tirs.' }],
  players: [
    { gamertag: 'kylian93', verdict: '**Doublé** et 8,6 de note.' },
    { gamertag: 'Kylian93', verdict: 'Doublon.' },
    { gamertag: 'Inventé_99', verdict: 'Joueur qui n’existe pas.' },
  ],
  advice: 'Tacler moins, mieux.',
  suggestedNote: 'On a bien bossé.',
};

test('nettoyage : joueurs inconnus et doublons écartés, tags et MOTM tranchés par les faits', () => {
  const clean = sanitizeMatchDebrief(draft, mockDetail, [{ ...mockNotes[0], tags: ['Remontada'] }], mockMembers);
  assert.equal(clean.headline, 'Le réalisme avant la manière');
  assert.equal(clean.keys[0].title, 'Efficacité');
  assert.deepEqual(clean.players, [{ gamertag: 'Kylian93', verdict: 'Doublé et 8,6 de note.' }]);
  assert.deepEqual(clean.suggestedTags, ['Remontada']); // venu du vestiaire, pas du modèle
  assert.equal(clean.suggestedMotm, 'Zizou_10'); // désigné par EA
  assert.equal(matchDebriefSchema.safeParse(clean).success, true);
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

const load = async () => ({ detail: mockDetail, members: mockMembers });
const url = 'http://localhost/api/matches/42/debrief';

const redige: MatchDebrief = sanitizeMatchDebrief(draft, mockDetail, mockNotes, mockMembers);

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
  const avant = debriefInputHash(mockDetail, mockNotes);
  assert.equal(debriefInputHash(mockDetail, [...mockNotes]), avant);
  const ajout: MatchNote = { ...mockNotes[0], id: 11, body: 'Défense solide en fin de match.' };
  assert.notEqual(debriefInputHash(mockDetail, [...mockNotes, ajout]), avant);
});

test('une ligne de cache illisible est ignorée, pas servie', async () => {
  const cache = memoryCache();
  cache.rows.set(`42:${debriefInputHash(mockDetail, mockNotes)}`, { payload: { headline: 'x' }, model: 'ancien' });
  const handler = createMatchDebriefHandler(cache, { hasKey: () => true, load, session: () => null });
  const json = await (await handler.GET(new Request(url))).json();
  assert.equal(json.available, false);
});
