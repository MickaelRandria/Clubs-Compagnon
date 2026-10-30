import assert from 'node:assert/strict';
import { test } from 'node:test';
import { drawBonus, ODDS_MAX, ODDS_MIN, openSession, sessionAnswer, type FormMatch } from '../shared/bets-odds.js';

const match = (result: FormMatch['result'], goalsFor: number, goalsAgainst: number, extra: Partial<FormMatch> = {}): FormMatch =>
  ({ opponent: 'Adversaire', result, goalsFor, goalsAgainst, redCard: false, ratings: {}, ...extra });
const mixed = [match('win', 3, 1), match('loss', 1, 2), match('draw', 2, 2), match('win', 4, 0), match('loss', 0, 3)];
const players = [{ memberId: 1, gamertag: 'Rina', avgRating: 7.5 }, { memberId: 2, gamertag: 'Chef', avgRating: 6.5 }];
/** Générateur déterministe : les tests ne dépendent pas du hasard. */
const seeded = (seed = 42) => () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };
const odds = (opening: ReturnType<typeof openSession>, market: string, option: string) =>
  opening.markets.find((m) => m.id === market)!.options.find((o) => o.id === option)!.odds;

test('le ticket : six paris fixes puis un bonus', () => {
  const opening = openSession([], mixed, players, seeded());
  assert.deepEqual(opening.markets.slice(0, 6).map((m) => m.id), ['bilan', 'attack', 'scorer', 'clumsy', 'crack', 'sr']);
  assert.ok(['cleansheet', 'red', 'streak'].includes(opening.markets[6].id), 'pas de rage-quit sans 10 abandons connus');
  assert.equal(opening.context.reason, 'Après la victoire 3-1 contre Adversaire');
});

test('cotes bornées et arrondies à 0,05 ; un historique vide reste jouable', () => {
  for (const history of [[], mixed, Array(20).fill(match('win', 6, 0))]) {
    for (const m of openSession([], history, players, seeded()).markets) {
      for (const o of m.options) {
        assert.ok(o.odds >= ODDS_MIN && o.odds <= ODDS_MAX, `${m.id} ${o.odds}`);
        assert.equal(Math.round(o.odds * 20), o.odds * 20);
      }
    }
  }
});

test('un club qui gagne : « plus de victoires » et « en hausse » sont les favoris', () => {
  const winning = Array(15).fill(match('win', 3, 1)).concat(Array(5).fill(match('loss', 1, 2)));
  const opening = openSession([], winning, players, seeded());
  assert.ok(odds(opening, 'bilan', 'win') < odds(opening, 'bilan', 'loss'));
  assert.ok(odds(opening, 'sr', 'up') < odds(opening, 'sr', 'down'));
  assert.ok(odds(opening, 'attack', '2-3') < odds(opening, 'attack', 'lt2'), '3 buts par match en moyenne');
});

test('Buteur et Maladroit suivent les feuilles de match', () => {
  const history = Array.from({ length: 10 }, () => match('win', 3, 1, {
    ratings: { 1: 8, 2: 6 }, players: { 1: { goals: 2, missed: 1 }, 2: { goals: 0, missed: 4 } },
  }));
  const opening = openSession([], history, players, seeded());
  assert.ok(odds(opening, 'scorer', '1') < odds(opening, 'scorer', '2'), 'Rina marque plus');
  assert.ok(odds(opening, 'clumsy', '2') < odds(opening, 'clumsy', '1'), 'Chef rate plus');
});

test('bonus : jamais celui de la session d’avant, tous peuvent sortir', () => {
  const seen = new Set<string>();
  for (let i = 0; i < 1000; i++) {
    const id = drawBonus(['streak'], () => i / 1000);
    assert.notEqual(id, 'streak');
    seen.add(id);
  }
  assert.deepEqual([...seen].sort(), ['cleansheet', 'ragequit', 'red']);
  assert.equal(drawBonus(['cleansheet', 'red', 'ragequit', 'streak'], () => 0), 'cleansheet', 'tout exclu : on retombe sur la liste');
});

test('réponses de session : mêmes règles que la fin de session en base', () => {
  const s = { matches: 4, wins: 2, losses: 2, goalsFor: 8, cleanSheets: 0, reds: 1, ragequits: 0, bestStreak: 2 };
  assert.equal(sessionAnswer('bilan', s), 'even');
  assert.equal(sessionAnswer('attack', s), '2-3');
  assert.equal(sessionAnswer('cleansheet', s), 'non');
  assert.equal(sessionAnswer('red', s), 'oui');
  assert.equal(sessionAnswer('streak', { ...s, bestStreak: 3 }), 'oui');
  assert.equal(sessionAnswer('bilan', { ...s, matches: 0 }), null);
});
