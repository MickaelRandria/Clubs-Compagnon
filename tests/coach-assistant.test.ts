import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildCoachPrompt,
  coachResponseSchema,
  getDeterministicCoachFallback,
  type CoachResponse,
} from '../shared/coach-assistant.js';
import type { Club, Member } from '../shared/types.js';
import { createCoachHandler } from '../server/coach-http.js';

const mockClub: Club = {
  id: 1,
  name: 'Dommage BJ FC',
  handle: 'dommage-fc',
  region: 'Europe de l\'Ouest',
  reputation: 85,
  skillRating: 1450,
  skillRatingTrend: 25,
  bestDivision: 1,
  gamesPlayed: 50,
  wins: 35,
  draws: 5,
  losses: 10,
  goalsFor: 120,
  goalsAgainst: 45,
  leagueApps: 40,
  playoffApps: 10,
};

const mockMembers: Member[] = [
  { id: 1, gamertag: 'Striker9', position: 'BU', ovr: 88, matchesPlayed: 50, goals: 42, assists: 12, avgRating: 8.5, passPct: 78 },
  { id: 2, gamertag: 'Playmaker', position: 'MOC', ovr: 89, matchesPlayed: 50, goals: 15, assists: 38, avgRating: 8.7, passPct: 91 },
];

test('buildCoachPrompt injecte les statistiques réelles du club et buteurs', () => {
  const prompt = buildCoachPrompt('Qui est le meilleur buteur ?', mockClub, mockMembers);
  assert.match(prompt, /Striker9 \(42 buts/);
  assert.match(prompt, /Playmaker \(38 passes\)/);
  assert.match(prompt, /1450 points/);
  assert.match(prompt, /Qui est le meilleur buteur \?/);
});

test('coachResponseSchema valide une réponse structurée avec action', () => {
  const sample: CoachResponse = {
    reply: "Pour rattacher ton compte Discord, rends-toi sur la page **Mon Profil**.",
    action: { label: 'Ouvrir Mon Profil', to: '/profil' },
    suggestedQuestions: ['Comment voter pour FC 27 ?', 'Où voir les stats ?'],
  };

  const parsed = coachResponseSchema.safeParse(sample);
  assert.equal(parsed.success, true);
});

test('getDeterministicCoachFallback répond immédiatement pour Discord avec action', () => {
  const fallback = getDeterministicCoachFallback('Comment lier mon compte Discord ?', mockClub, mockMembers);
  assert.match(fallback.reply, /Discord/);
  assert.equal(fallback.action?.to, '/profil');
  assert.equal(fallback.action?.label, 'Ouvrir Mon Profil');
  assert.ok(fallback.suggestedQuestions.length > 0);
});

test('getDeterministicCoachFallback répond immédiatement pour FC 27', () => {
  const fallback = getDeterministicCoachFallback('Comment voter pour le nom FC 27 ?', mockClub, mockMembers);
  assert.match(fallback.reply, /FC 27/);
  assert.equal(fallback.action?.to, '/fc27/nom');
});

test('getDeterministicCoachFallback répond pour les buteurs en utilisant mockMembers', () => {
  const fallback = getDeterministicCoachFallback('Qui est notre meilleur buteur ?', mockClub, mockMembers);
  assert.match(fallback.reply, /Striker9/);
  assert.match(fallback.reply, /42 buts/);
  assert.equal(fallback.action?.to, '/joueurs');
});

test('createCoachHandler utilise le fallback gracieux si hasKey retourne false', async () => {
  const handler = createCoachHandler({
    hasKey: () => false,
  });

  const req = new Request('http://localhost/api/coach', {
    method: 'POST',
    body: JSON.stringify({ question: 'Comment lier mon compte Discord ?' }),
  });

  const res = await handler.POST(req);
  const data = await res.json();

  assert.equal(res.status, 200);
  assert.equal(data.source, 'fallback');
  assert.equal(data.response.action?.to, '/profil');
});

