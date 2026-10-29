import assert from 'node:assert/strict';
import { test } from 'node:test';
import { drawMarket, ODDS_MAX, ODDS_MIN, openMatchBet, priceMarket, type FormMatch } from '../shared/bets-odds.js';

const match = (result: FormMatch['result'], goalsFor: number, goalsAgainst: number, extra: Partial<FormMatch> = {}): FormMatch =>
  ({ opponent: 'Adversaire', result, goalsFor, goalsAgainst, redCard: false, ratings: {}, ...extra });
const mixed = [match('win', 3, 1), match('loss', 1, 2), match('draw', 2, 2), match('win', 4, 0), match('loss', 0, 3)];
const odds = (m: ReturnType<typeof priceMarket>, id: string) => m.options.find((o) => o.id === id)!.odds;

test('après une défaite, la cote de la défaite baisse et celle de la victoire monte', () => {
  const afterLoss = priceMarket('verdict', [match('loss', 1, 3), ...mixed], []);
  const afterWin = priceMarket('verdict', [match('win', 3, 1), ...mixed], []);
  assert.ok(odds(afterLoss, 'loss') < odds(afterWin, 'loss'));
  assert.ok(odds(afterLoss, 'win') > odds(afterWin, 'win'));
  const loss = afterLoss.options.find((o) => o.id === 'loss')!;
  assert.ok(loss.trend < 0, 'flèche vers le bas : la défaite est devenue plus probable');
});

test('cotes bornées et arrondies à 0,05 ; un historique vide reste jouable', () => {
  for (const id of ['verdict', 'goals', 'cleansheet', 'red', 'ragequit'] as const) {
    for (const history of [[], mixed, Array(20).fill(match('win', 6, 0))]) {
      for (const o of priceMarket(id, history, []).options) {
        assert.ok(o.odds >= ODDS_MIN && o.odds <= ODDS_MAX, `${id} ${o.odds}`);
        assert.equal(Math.round(o.odds * 20), o.odds * 20);
      }
    }
  }
});

test('Crack : la note EA du dernier match fait bouger la cote du joueur', () => {
  const players = [{ memberId: 1, gamertag: 'Rina', avgRating: 7 }, { memberId: 2, gamertag: 'Chef', avgRating: 7 }];
  const market = priceMarket('crack', [match('win', 3, 1, { ratings: { 1: 9.5, 2: 5.5 } })], players);
  assert.equal(market.options[0].label, 'Rina', 'favori en premier');
  assert.ok(market.options[0].trend < 0 && market.options[1].trend > 0);
  const flop = priceMarket('flop', [match('win', 3, 1, { ratings: { 1: 9.5, 2: 5.5 } })], players);
  assert.equal(flop.options[0].label, 'Chef');
});

test('tirage : jamais deux fois le même pari d’affilée, tous les paris peuvent sortir', () => {
  const seen = new Set<string>();
  for (let i = 0; i < 1000; i++) {
    const id = drawMarket('verdict', () => i / 1000);
    assert.notEqual(id, 'verdict');
    seen.add(id);
  }
  assert.deepEqual([...seen].sort(), ['cleansheet', 'goals', 'ragequit', 'red'], 'ni Crack ni Casserole : le Crack est toujours là');
});

test('rage-quit : jamais tiré tant que moins de 10 matchs ont une issue connue', () => {
  const unknown = Array(20).fill(match('win', 3, 1));
  const known = Array(10).fill(match('win', 3, 1, { opponentQuit: false }));
  // Premier tirage : le pari d'équipe est ajouté ; second : lequel.
  const twice = (roll: number) => { let n = 0; return () => (n++ === 0 ? 0 : roll); };
  const draws = (history: typeof unknown) => new Set(Array.from({ length: 1000 }, (_, i) => openMatchBet(null, history, [], twice(i / 1000)).markets[0].id));
  assert.ok(!draws(unknown).has('ragequit'));
  assert.ok(draws(known).has('ragequit'));
  const odds = priceMarket('ragequit', [...known, match('win', 3, 0, { opponentQuit: true })], []).options;
  assert.ok(odds.find((o) => o.id === 'oui')!.odds > odds.find((o) => o.id === 'non')!.odds, 'l’abandon reste l’issue rare');
});

test('ouverture : toujours le Crack, une fois sur deux précédé d’un pari d’équipe', () => {
  const history = [match('loss', 1, 3, { opponent: 'Team March' }), ...mixed];
  const players = [{ memberId: 1, gamertag: 'Rina', avgRating: 7 }];
  const withExtra = openMatchBet(null, history, players, () => 0);
  assert.deepEqual(withExtra.markets.map((m) => m.id), ['verdict', 'crack']);
  assert.equal(withExtra.context.reason, 'Après la défaite 1-3 contre Team March');
  assert.deepEqual(openMatchBet(null, history, players, () => 0.7).markets.map((m) => m.id), ['crack']);
});
