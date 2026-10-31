// FoodBet : petites règles partagées par l'écran des paris et le récap de fin de soirée.
import { BONUS_MARKETS, MARKET_COPY, MARKET_ORDER, type BetSession, type Market, type MarketId } from '../../shared/bets';
import { sessionAnswer } from '../../shared/bets-odds';

export const fmt = (n: number) => n.toLocaleString('fr-FR');
export const byOrder = (a: Market, b: Market) => MARKET_ORDER.indexOf(a.id) - MARKET_ORDER.indexOf(b.id);
export const plural = (n: number, word: string) => `${n} ${word}${n > 1 ? 's' : ''}`;
export const record = (s: BetSession) => `${plural(s.matches, 'match')} · ${s.wins}V ${s.draws}N ${s.losses}D`;
export const isPlayerMarket = (id: MarketId) => id === 'crack' || id === 'flop' || id === 'scorer' || id === 'clumsy';
export const titleOf = (id: MarketId) => `${BONUS_MARKETS.includes(id) ? 'Bonus · ' : ''}${MARKET_COPY[id].title}`;

/** En tête de la soirée sur les buts ou les tirs ratés (ex æquo compris). */
export function topPlayers(s: BetSession, key: 'goals' | 'missed') {
  const best = Math.max(0, ...s.players.map((p) => p[key]));
  return { best, ids: best === 0 ? [] : s.players.filter((p) => p[key] === best).map((p) => String(p.memberId)),
    names: best === 0 ? [] : s.players.filter((p) => p[key] === best).map((p) => p.gamertag) };
}

/** L'issue en tête d'un pari de session (null : pas encore connue, ou réglée au vote). */
export function sessionLead(id: MarketId, s: BetSession): string[] | null {
  if (s.matches === 0 || id === 'crack' || id === 'flop') return null;
  if (id === 'scorer' || id === 'clumsy') return topPlayers(s, id === 'scorer' ? 'goals' : 'missed').ids;
  if (id === 'sr') return s.srStart === null || s.srNow === null || s.srStart === s.srNow ? null : [s.srNow > s.srStart ? 'up' : 'down'];
  const a = sessionAnswer(id, s);
  return a === null ? null : [a];
}
